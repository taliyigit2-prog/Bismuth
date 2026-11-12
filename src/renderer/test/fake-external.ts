// Test helper (not part of the app bundle): the Faz 11 procedures on top of `fakeTransport` — rates, weather, the
// rate sources and holiday checks answer from plain data the test sets; everything else goes to the base fake.
import type { FxOverview, FxSourceStatus, HolidayCheckResult, WeatherView } from '@shared/contract/external'
import type { ProcedureName } from '@shared/contract'
import { fakeTransport, type FakeTransport } from './render'

export interface ExternalData {
  overview: FxOverview
  weather: WeatherView
  sources: FxSourceStatus[]
  lastChecks: HolidayCheckResult[]
}

/** Four currencies around the Faz 0 sample, a hotel rate for EUR, two days of history, TCMB. */
export function sampleOverview(now = '2026-10-04T09:00:00.000Z'): FxOverview {
  const day = now.slice(0, 10)
  const rate = (currency: string, micro: number, previous: number, tcmb: number) => ({
    currency,
    marketMicro: micro,
    marketAt: now,
    provider: 'truncgil',
    hotelMicro: null as number | null,
    previousMicro: previous,
    history: [
      { date: '2026-10-03', micro: previous },
      { date: day, micro }
    ],
    tcmbMicro: tcmb,
    tcmbAt: now
  })
  return {
    base: 'TRY',
    now,
    today: day,
    networkEnabled: true,
    refreshMinutes: 30,
    lastSuccessAt: now,
    lastAttemptAt: now,
    rates: [
      { ...rate('EUR', 55_277_000, 55_100_000, 55_347_000), hotelMicro: 50_000_000 },
      rate('USD', 49_126_000, 49_200_000, 48_991_000),
      rate('GBP', 64_868_000, 64_868_000, 64_813_000),
      rate('RUB', 588_200, 587_000, 588_000)
    ]
  }
}

export function sampleWeather(now = '2026-10-04T09:00:00.000Z'): WeatherView {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.parse(now) + i * 86_400_000).toISOString().slice(0, 10)
    const wet = i === 1
    return {
      date: d,
      minC: 12 + (i % 3),
      maxC: 20 + (i % 4),
      symbol: wet ? 'rain' : i === 4 ? 'heavysnowshowersandthunder_day' : 'partlycloudy_day',
      precipMm: wet ? 2 : 0
    }
  })
  return {
    enabled: true,
    networkEnabled: true,
    now,
    location: { lat: 40.99, lon: 29.03, name: 'Kadıköy (İstanbul)', from: 'city' },
    forecast: {
      provider: 'metno',
      updatedAt: now,
      now: { time: now, tempC: 18.4, symbol: 'lightrainshowers_day', windMs: 4.1, humidity: 78 },
      hours: Array.from({ length: 24 }, (_, i) => ({
        time: new Date(Date.parse(now) + i * 3_600_000).toISOString(),
        tempC: 18 - (i % 6),
        symbol: i < 3 ? 'lightrain' : 'cloudy',
        precipMm: i < 3 ? 0.4 : 0,
        windMs: 4
      })),
      days: [{ ...days[0]!, precipMm: 1.6, symbol: 'lightrain' }, ...days.slice(1)]
    },
    fetchedAt: now,
    otherLocation: false
  }
}

export function withExternal(
  data: Partial<ExternalData> = {},
  base: FakeTransport = fakeTransport()
): FakeTransport & { external: ExternalData } {
  const external: ExternalData = {
    overview: data.overview ?? sampleOverview(),
    weather: data.weather ?? sampleWeather(),
    sources: data.sources ?? [],
    lastChecks: data.lastChecks ?? []
  }
  const call = base.call.bind(base)
  const t = base as FakeTransport & { external: ExternalData }
  t.external = external
  t.call = (async (name: ProcedureName, input: unknown) => {
    switch (name) {
      case 'fx.overview':
        base.calls.push({ name, input })
        return {
          ...external.overview,
          networkEnabled: base.settings['network.enabled']
        }
      case 'fx.refresh':
        base.calls.push({ name, input })
        return { ok: true, provider: 'truncgil', skipped: false }
      case 'fx.setHotelRate': {
        base.calls.push({ name, input })
        const { currency, rateMicro } = input as { currency: string; rateMicro: number | null }
        external.overview = {
          ...external.overview,
          rates: external.overview.rates.map((r) =>
            r.currency === currency ? { ...r, hotelMicro: rateMicro } : r
          )
        }
        return { ok: true }
      }
      case 'fx.sources':
        base.calls.push({ name, input })
        return external.sources
      case 'weather.get':
        base.calls.push({ name, input })
        return { ...external.weather, networkEnabled: base.settings['network.enabled'] }
      case 'weather.refresh':
        base.calls.push({ name, input })
        return { ok: true, skipped: false }
      case 'holidays.lastChecks':
        base.calls.push({ name, input })
        return external.lastChecks
      default:
        return call(name, input as never)
    }
  }) as FakeTransport['call']
  return t
}
