// Optional online data (Faz 11; G-02, G-110…G-113, G-16, K-04, K-06, K-13): market rates, weather and the
// yearly holiday check. The requests themselves live in src/main/network (CLAUDE.md yasak 1); this service checks
// the caller's rights, reads the settings, stores what arrived and keeps the refresh timers. With
// `network.enabled = false` not one request is made; every failure is silent (the last data stays in use).
import { eq } from 'drizzle-orm'
import type { FxOverview, FxSourceStatus, HolidayCheckResult, WeatherView } from '@shared/contract/external'
import {
  FX_PROVIDERS,
  fxCurrencies,
  isKeyedProvider,
  type FxKeyedProvider,
  type FxProvider
} from '@shared/domain/external'
import { cityLabel, DEFAULT_CITY, findCity } from '@shared/domain/cities'
import { buildForecast, localDateIn } from '@shared/domain/weather'
import { calendarGeneration } from '../db/schema'
import type { HttpClient } from '../network/http'
import type { StateStore } from '../network/state'
import { fetchTcmb, runFxChain, type MarketRate } from '../network/fx/chain'
import { fetchMet, fetchOpenMeteo, metUserAgent, type WeatherFetch } from '../network/weather/providers'
import { fetchFeasts } from '../network/holidays/feeds'
import { applyHolidayCheck } from './calendar/holiday-check'
import type { CalendarService } from './calendar-service'
import { systemCtx, type Ctx } from './context'
import type { CurrencyService } from './currency-service'
import { permissionDenied } from './errors'
import { inTransaction, requirePermission, type ServiceDeps } from './kit'
import { readSetting, type SettingsService } from './settings-service'

export interface ExternalDeps extends ServiceDeps {
  http: HttpClient
  state: StateStore
  currency: CurrencyService
  calendar: CalendarService
  settings: SettingsService
  appVersion: string
  /** Spreads the weather requests over the hour (MET asks not to hit the full hour); tests pass a fixed value. */
  random?: () => number
}

const MINUTE = 60_000
/** TCMB publishes once a business day (15:30); asking every few hours is plenty. */
const TCMB_EVERY_MS = 3 * 60 * MINUTE
/** Weather cache (K-13): 60 minutes plus a random 0–10 so installations do not ask at the same minute. */
const WEATHER_EVERY_MS = 60 * MINUTE

/** A scheduled run skipped because the hotel is not set up yet: it is tried again after INACTIVE_RETRY_MS. */
const INACTIVE = Symbol('inactive')
const INACTIVE_RETRY_MS = 15_000

const sameSpot = (a: { lat: number; lon: number }, b: { lat: number; lon: number }): boolean =>
  Math.abs(a.lat - b.lat) < 0.005 && Math.abs(a.lon - b.lon) < 0.005

export function createExternalService(deps: ExternalDeps) {
  const { db, http, state, clock } = deps
  const random = deps.random ?? Math.random
  const networkOn = (): boolean => readSetting(db, 'network.enabled')
  let fxRun: Promise<{ ok: boolean; provider: string | null; skipped: boolean }> | null = null
  let weatherRun: Promise<{ ok: boolean; skipped: boolean }> | null = null
  const timers = new Set<ReturnType<typeof setTimeout>>()
  let running = false
  let stopSettings: (() => void) | null = null
  let onError: (error: unknown, what: string) => void = () => undefined

  const requireWeatherRead = (ctx: Ctx): void => {
    if (!ctx.can('today', 'view') && !ctx.can('currency', 'view')) throw permissionDenied()
  }

  /** Where the forecast is for: a hand-typed point, the hotel's city from the bundled list, else İstanbul. */
  function location(): WeatherView['location'] {
    const manual = readSetting(db, 'weather.location')
    if (manual) return { lat: manual.lat, lon: manual.lon, name: null, from: 'manual' }
    const city = findCity(readSetting(db, 'hotel.city'))
    if (city) return { lat: city.lat, lon: city.lon, name: cityLabel(city), from: 'city' }
    return { lat: DEFAULT_CITY.lat, lon: DEFAULT_CITY.lon, name: DEFAULT_CITY.name, from: 'default' }
  }

  async function doRefreshFx(ctx: Ctx) {
    const now = clock()
    if (!networkOn()) return { ok: false, provider: null, skipped: true }
    state.update((s) => {
      s.fx.lastAttemptAt = now.toISOString()
    })
    const base = readSetting(db, 'hotel.baseCurrency')
    const wanted = fxCurrencies(readSetting(db, 'hotel.currencies'), base)
    const result = await runFxChain({ http, state, order: readSetting(db, 'fx.sources'), base, wanted, now })
    if (result.skipped) return { ok: false, provider: null, skipped: true }
    const free: MarketRate[] = result.rates.filter((r) => !isKeyedProvider(r.provider))
    const keyed: MarketRate[] = result.rates.filter((r) => isKeyedProvider(r.provider))
    deps.currency.ingestMarketRates(ctx, free, 'market_mid')
    deps.currency.ingestMarketRates(ctx, keyed, 'user_api')
    if (result.rates.length)
      state.update((s) => {
        s.fx.lastSuccessAt = clock().toISOString()
      })
    // The TCMB comparison line: a TRY hotel only (the bulletin is in TRY), a few times a day.
    const lastTcmb = state.read().fx.lastTcmbAt
    if (
      readSetting(db, 'fx.showTcmb') &&
      base === 'TRY' &&
      (!lastTcmb || now.getTime() - Date.parse(lastTcmb) >= TCMB_EVERY_MS)
    ) {
      const tcmb = await fetchTcmb({ http, state, now, wanted })
      if (tcmb?.length) {
        deps.currency.ingestMarketRates(
          ctx,
          tcmb.map((r) => ({ ...r, provider: 'tcmb' })),
          'tcmb'
        )
        state.update((s) => {
          s.fx.lastTcmbAt = now.toISOString()
        })
      }
    }
    return { ok: result.rates.length > 0, provider: result.rates[0]?.provider ?? null, skipped: false }
  }

  async function doRefreshWeather(): Promise<{ ok: boolean; skipped: boolean }> {
    if (!networkOn() || !readSetting(db, 'weather.enabled')) return { ok: false, skipped: true }
    const now = clock()
    const spot = location()
    const cached = state.read().weather
    const sameCache = cached && sameSpot(cached, spot) ? cached : null
    // MET's terms: never ask again before the answer's Expires.
    if (sameCache?.expiresAt && Date.parse(sameCache.expiresAt) > now.getTime())
      return { ok: true, skipped: false }
    const resting = (id: string): boolean => {
      const until = state.read().sources[id]?.restingUntil
      return !!until && Date.parse(until) > now.getTime()
    }
    const tries: { id: 'metno' | 'openmeteo'; run: () => Promise<WeatherFetch> }[] = []
    if (!resting('metno'))
      tries.push({
        id: 'metno',
        run: () =>
          fetchMet(http, {
            lat: spot.lat,
            lon: spot.lon,
            userAgent: metUserAgent(deps.appVersion, readSetting(db, 'hotel.email')),
            lastModified: sameCache?.provider === 'metno' ? sameCache.lastModified : null
          })
      })
    if (readSetting(db, 'weather.openMeteo') && !resting('openmeteo'))
      tries.push({ id: 'openmeteo', run: () => fetchOpenMeteo(http, { lat: spot.lat, lon: spot.lon }) })
    for (const { id, run } of tries) {
      const res = await run()
      if (res.kind === 'off') return { ok: false, skipped: true }
      if (res.kind === 'notModified' && sameCache) {
        state.update((s) => {
          if (s.weather) {
            s.weather.fetchedAt = now.toISOString()
            s.weather.expiresAt = res.expiresAt
          }
        })
        return { ok: true, skipped: false }
      }
      if (res.kind === 'ok') {
        if (res.deprecated)
          onError(new Error('MET answered 203: product version is being retired'), 'weather')
        state.update((s) => {
          s.sources[id] = { lastOkAt: now.toISOString(), lastFailAt: null, restingUntil: null }
          s.weather = {
            provider: res.answer.provider,
            lat: spot.lat,
            lon: spot.lon,
            fetchedAt: now.toISOString(),
            expiresAt: res.answer.expiresAt,
            lastModified: res.answer.lastModified,
            series: res.answer.series,
            updatedAt: res.answer.updatedAt
          }
        })
        return { ok: true, skipped: false }
      }
      if (res.kind === 'failed')
        state.update((s) => {
          s.sources[id] = {
            lastOkAt: s.sources[id]?.lastOkAt ?? null,
            lastFailAt: now.toISOString(),
            restingUntil: res.rest ? new Date(now.getTime() + 24 * 60 * MINUTE).toISOString() : null
          }
        })
    }
    return { ok: false, skipped: false }
  }

  async function doCheckHolidays(ctx: Ctx, years: readonly number[]): Promise<HolidayCheckResult[]> {
    requirePermission(ctx, 'calendar.notes', 'edit')
    const checkedAt = clock().toISOString()
    const none = (skipped: boolean): HolidayCheckResult[] =>
      years.map((year) => ({ year, source: null, skipped, checkedAt, diffs: [] }))
    if (!networkOn()) return none(true)
    for (const year of years) deps.calendar.ensureYearGenerated(ctx, year)
    const feed = await fetchFeasts(http, years)
    if (feed.kind !== 'ok') return none(feed.kind === 'off')
    const results = years.map((year) => applyHolidayCheck(deps, ctx, year, feed.feasts, feed.source))
    state.update((s) => {
      s.holidays.lastCheckedAt = checkedAt
      s.holidays.lastResults = [
        ...results,
        ...s.holidays.lastResults.filter((r) => !years.includes(r.year))
      ].slice(0, 4)
    })
    return results
  }

  // The hotel's year (P14fix #14): at 01:30 on 1 January in Istanbul it is already the new year.
  const thisYear = (): number =>
    Number(localDateIn(clock().toISOString(), readSetting(db, 'hotel.timezone')).slice(0, 4))
  /**
   * The yearly check is done when the database says so (P14fix #13): `calendar_generation.verified_at` of this year
   * and the next. A restored older backup does not have it, so the check runs again (the cache file outlives it).
   */
  const verifiedYears = (years: readonly number[]): boolean =>
    years.every(
      (year) =>
        db.select().from(calendarGeneration).where(eq(calendarGeneration.year, year)).get()?.verifiedAt !=
        null
    )

  /** Runs `fn` after `delay()`, again and again; while it was not allowed to run (`INACTIVE`), soon again. */
  function schedule(fn: () => Promise<unknown>, delay: () => number, what: string): void {
    const tick = (wait: number): void => {
      if (!running) return
      const timer = setTimeout(() => {
        timers.delete(timer)
        fn()
          .then(
            (result) => (result === INACTIVE ? INACTIVE_RETRY_MS : delay()),
            (error: unknown) => {
              onError(error, what)
              return delay()
            }
          )
          .then(tick, () => tick(delay()))
      }, wait)
      timers.add(timer)
    }
    tick(delay())
  }

  const service = {
    /** The Döviz screen's rates (also offline: the last known ones). */
    fxOverview(ctx: Ctx): FxOverview {
      const s = state.read().fx
      return deps.currency.overview(ctx, {
        networkEnabled: networkOn(),
        lastSuccessAt: s.lastSuccessAt,
        lastAttemptAt: s.lastAttemptAt
      })
    },

    /** "Şimdi güncelle" and the timer: one refresh at a time. */
    refreshFx(ctx: Ctx) {
      requirePermission(ctx, 'currency', 'view')
      fxRun ??= doRefreshFx(ctx).finally(() => {
        fxRun = null
      })
      return fxRun
    },

    /** The chain as the owner sees it: which source answered, which rests, which needs a key. */
    fxSources(ctx: Ctx): FxSourceStatus[] {
      requirePermission(ctx, 'currency', 'view')
      const s = state.read()
      const now = clock().getTime()
      const order = readSetting(db, 'fx.sources')
      const all: FxProvider[] = [...order, ...FX_PROVIDERS.filter((p) => !order.includes(p))]
      return all.map((id) => {
        const keyed = isKeyedProvider(id)
        const hasKey = keyed && !!s.apiKeys[id]
        const h = s.sources[id]
        const restingUntil = h?.restingUntil && Date.parse(h.restingUntil) > now ? h.restingUntil : null
        const state: FxSourceStatus['state'] =
          keyed && !hasKey
            ? 'needsKey'
            : restingUntil
              ? 'resting'
              : !h
                ? 'untried'
                : h.lastFailAt && (!h.lastOkAt || h.lastFailAt > h.lastOkAt)
                  ? 'failed'
                  : 'ok'
        return { id, keyed, hasKey, state, restingUntil, lastOkAt: h?.lastOkAt ?? null }
      })
    },

    /** The hotel's own key for a keyed source; kept in the main process only, never sent to a screen. */
    setApiKey(ctx: Ctx, provider: FxKeyedProvider, key: string | null): void {
      requirePermission(ctx, 'settings', 'edit')
      inTransaction(deps, ctx, (_tx, audit) => {
        audit({
          entity: 'settings',
          entityId: `fx.apiKey.${provider}`,
          action: 'update',
          after: { keySet: key !== null }
        })
      })
      state.update((s) => {
        if (key === null) delete s.apiKeys[provider]
        else s.apiKeys[provider] = key
        delete s.sources[provider]
      })
    },

    /** Today card and the Hava tab. No forecast yet (or only one for another place) → null: the card hides. */
    weather(ctx: Ctx): WeatherView {
      requireWeatherRead(ctx)
      const now = clock().toISOString()
      const spot = location()
      const cached = state.read().weather
      const other = !!cached && !sameSpot(cached, spot)
      const usable = cached && !other ? cached : null
      const forecast = usable
        ? buildForecast(
            usable.provider,
            usable.updatedAt,
            usable.series,
            now,
            readSetting(db, 'hotel.timezone')
          )
        : null
      return {
        enabled: readSetting(db, 'weather.enabled'),
        networkEnabled: networkOn(),
        now,
        location: spot,
        forecast: forecast && forecast.days.length ? forecast : null,
        fetchedAt: usable?.fetchedAt ?? null,
        otherLocation: other
      }
    },

    refreshWeather(ctx: Ctx) {
      requireWeatherRead(ctx)
      weatherRun ??= doRefreshWeather().finally(() => {
        weatherRun = null
      })
      return weatherRun
    },

    /** "Bayramları denetle" for a year (and the yearly automatic run). */
    async checkHolidays(ctx: Ctx, year: number): Promise<HolidayCheckResult> {
      const [result] = await doCheckHolidays(ctx, [year])
      return result!
    },

    lastHolidayChecks(ctx: Ctx): HolidayCheckResult[] {
      if (!ctx.can('calendar.notes', 'view')) throw permissionDenied()
      return state.read().holidays.lastResults
    },

    /** Requests that left this computer (tests: zero with the network off). */
    get requestCount(): number {
      return http.requestCount
    },

    /**
     * Starts the timers of the hotel's main computer (never on a client device, K-19): rates now and every
     * `fx.refreshMinutes`, weather now and about hourly, the holiday check once a calendar year (this year and
     * the next). A changed setting (network back on, other city, other currencies) refreshes at once.
     */
    start(
      opts: {
        onError?: (error: unknown, what: string) => void
        firstDelayMs?: number
        /** Nothing is fetched while this says no (the hotel is not set up yet: no one chose anything). */
        active?: () => boolean
      } = {}
    ): void {
      if (running) return
      running = true
      const active = opts.active ?? (() => true)
      onError = opts.onError ?? onError
      const sys = systemCtx()
      const firstDelay = opts.firstDelayMs ?? 3_000
      /** The first run after `first` ms, then every `every()` ms. */
      const delays = (first: number, every: () => number): (() => number) => {
        let initial: number | null = first
        return () => {
          const d = initial ?? every()
          initial = null
          return d
        }
      }
      const when =
        <T>(fn: () => Promise<T>) =>
        async (): Promise<T | typeof INACTIVE> =>
          active() ? fn() : INACTIVE
      schedule(
        when(() => service.refreshFx(sys)),
        delays(firstDelay, () => readSetting(db, 'fx.refreshMinutes') * MINUTE),
        'fx'
      )
      schedule(
        when(() => service.refreshWeather(sys)),
        delays(firstDelay, () => WEATHER_EVERY_MS + Math.floor(random() * 10 * MINUTE)),
        'weather'
      )
      schedule(
        when(async () => {
          const year = thisYear()
          if (!readSetting(db, 'holidays.onlineCheck') || !networkOn()) return
          if (verifiedYears([year, year + 1])) return
          const results = await doCheckHolidays(sys, [year, year + 1])
          if (results.some((r) => r.source))
            state.update((s) => {
              s.holidays.lastYear = year
            })
        }),
        delays(firstDelay + 2_000, () => 6 * 60 * MINUTE),
        'holidays'
      )
      stopSettings = deps.settings.onChange((_values, changed) => {
        if (!active()) return
        const has = (...keys: string[]): boolean => keys.some((k) => (changed as string[]).includes(k))
        if (has('network.enabled', 'hotel.currencies', 'hotel.baseCurrency', 'fx.sources', 'fx.showTcmb'))
          service.refreshFx(sys).catch((error: unknown) => onError(error, 'fx'))
        if (has('network.enabled', 'hotel.city', 'weather.location', 'weather.enabled', 'weather.openMeteo'))
          service.refreshWeather(sys).catch((error: unknown) => onError(error, 'weather'))
      })
    },

    stop(): void {
      running = false
      for (const t of timers) clearTimeout(t)
      timers.clear()
      stopSettings?.()
      stopSettings = null
    }
  }
  return service
}

export type ExternalService = ReturnType<typeof createExternalService>
