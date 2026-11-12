import { afterEach, describe, expect, it } from 'vitest'
import { depsOf, roleCtx, testClock } from '../../../tests/factories/ctx'
import { seededDatabase } from '../../../tests/factories/db'
import {
  FAWAZ_PATH,
  GOOGLE_ICS,
  GOOGLE_ICS_PATH,
  MET_PATH,
  OPEN_METEO_PATH,
  TCMB_PATH,
  TCMB_XML,
  TRUNCGIL_PATH,
  fawaz,
  metCompact,
  openMeteo,
  startFakeExternal,
  truncgil,
  type FakeExternal,
  type FakeRoute
} from '../../../tests/factories/fake-external'
import type { DatabaseHandle } from '../db/client'
import { createHttpClient } from '../network/http'
import { createStateStore } from '../network/state'
import { createCalendarService } from './calendar-service'
import { createCurrencyService, freezeNow } from './currency-service'
import { createExternalService } from './external-service'
import { createSettingsService } from './settings-service'
import { money } from '@shared/money'

const owner = roleCtx('owner')
const reception = roleCtx('reception')
const housekeeping = roleCtx('housekeeping')
let handle: DatabaseHandle
let fake: FakeExternal | null = null
afterEach(async () => {
  handle?.close()
  await fake?.close()
  fake = null
})

const MET_EXPIRES = 'Sun, 04 Oct 2026 10:00:00 GMT'

async function setup(routes: Record<string, FakeRoute> = {}, start = '2026-10-04T09:00:00.000Z') {
  handle = await seededDatabase()
  fake = await startFakeExternal(routes)
  const clock = testClock(start)
  const deps = depsOf(handle, clock)
  const settings = createSettingsService(handle.db, clock)
  const currency = createCurrencyService(deps)
  const http = createHttpClient({
    enabled: () => settings.get(owner)['network.enabled'],
    origin: fake.origin
  })
  const external = createExternalService({
    ...deps,
    http,
    state: createStateStore(null),
    currency,
    calendar: createCalendarService(deps),
    settings,
    appVersion: '1.0.0-test',
    random: () => 0
  })
  return { clock, settings, currency, external, fake, http }
}

const metRoute = (start: string): FakeRoute => ({
  body: metCompact(start),
  headers: { expires: MET_EXPIRES, 'last-modified': 'Sun, 04 Oct 2026 08:31:00 GMT' }
})

describe('döviz: yenileme ve ekran verisi (G-110…G-112)', () => {
  it('yenileme piyasa kurlarını yazar; ekran kaynak adı, düne göre kapanış, 30 gün ve TCMB satırını alır', async () => {
    const { clock, external, fake } = await setup({
      [TRUNCGIL_PATH]: { body: truncgil(-0.5) },
      [TCMB_PATH]: { body: TCMB_XML }
    })
    clock.set('2026-10-03T09:00:00.000Z')
    expect(await external.refreshFx(reception)).toEqual({ ok: true, provider: 'truncgil', skipped: false })
    fake.set(TRUNCGIL_PATH, { body: truncgil() })
    clock.set('2026-10-04T09:00:00.000Z')
    await external.refreshFx(reception)
    const o = external.fxOverview(reception)
    expect(o.base).toBe('TRY')
    expect(o.lastSuccessAt).toBe('2026-10-04T09:00:00.000Z')
    const usd = o.rates.find((r) => r.currency === 'USD')!
    expect(usd).toMatchObject({
      marketMicro: 49_126_000,
      marketAt: '2026-10-04T09:00:00.000Z',
      provider: 'truncgil',
      previousMicro: 48_626_000,
      hotelMicro: null,
      tcmbMicro: 48_991_000
    })
    expect(usd.history).toEqual([
      { date: '2026-10-03', micro: 48_626_000 },
      { date: '2026-10-04', micro: 49_126_000 }
    ])
    // TCMB is asked a few times a day, not on every refresh.
    expect(fake.hits.filter((h) => h.startsWith('www.tcmb.gov.tr'))).toHaveLength(2)
    expect(o.rates.map((r) => r.currency)).toEqual(['USD', 'EUR', 'GBP', 'RUB'])
  })

  it('otel kuru yürürlükteyken kayıt o kurla donar; "misafire bu kurdan söyle" kapanınca piyasa kuru', async () => {
    const { external, currency, settings, clock } = await setup({ [TRUNCGIL_PATH]: { body: truncgil() } })
    await external.refreshFx(owner)
    currency.setHotelRate(owner, { currency: 'EUR', rateMicro: 50_000_000 })
    clock.advance(1)
    const eur = money(10_000, 'EUR')
    expect(freezeNow(handle.db, eur, 'TRY', clock())).toMatchObject({
      amountBaseMinor: 500_000,
      source: 'hotel'
    })
    expect(external.fxOverview(owner).rates.find((r) => r.currency === 'EUR')?.hotelMicro).toBe(50_000_000)
    settings.set(owner, { 'fx.quoteHotelRate': false })
    expect(freezeNow(handle.db, eur, 'TRY', clock())).toMatchObject({
      amountBaseMinor: 552_770,
      source: 'market_mid'
    })
    settings.set(owner, { 'fx.quoteHotelRate': true })
    currency.setHotelRate(owner, { currency: 'EUR', rateMicro: null })
    expect(freezeNow(handle.db, eur, 'TRY', clock())?.source).toBe('market_mid')
    expect(external.fxOverview(owner).rates.find((r) => r.currency === 'EUR')?.hotelMicro).toBeNull()
    // Offline later: the last known rate is used and marked stale.
    clock.advance(7 * 60)
    expect(freezeNow(handle.db, eur, 'TRY', clock())).toMatchObject({ amountBaseMinor: 552_770, stale: true })
  })

  it('günlük kaynağın kuru kendi tarihiyle saklanır: indirildiği an "taze" görünmez (P14fix #19)', async () => {
    const { external } = await setup({ [TRUNCGIL_PATH]: { body: 'bozuk' }, [FAWAZ_PATH]: { body: fawaz } })
    await external.refreshFx(owner)
    const usd = external.fxOverview(owner).rates.find((r) => r.currency === 'USD')!
    expect(usd).toMatchObject({ provider: 'fawaz-jsdelivr', marketAt: '2026-10-01T00:00:00.000Z' })
  })

  it('kaynak listesi durumu gösterir; anahtar ana süreçte kalır, ekrana gitmez', async () => {
    const { external } = await setup({ [TRUNCGIL_PATH]: { body: 'bozuk' }, [FAWAZ_PATH]: { body: fawaz } })
    await external.refreshFx(owner)
    external.setApiKey(owner, 'currencyapi', 'secret-key-123456')
    const sources = external.fxSources(owner)
    expect(sources.find((s) => s.id === 'truncgil')?.state).toBe('resting')
    expect(sources.find((s) => s.id === 'fawaz-jsdelivr')?.state).toBe('ok')
    expect(sources.find((s) => s.id === 'openexchangerates')?.state).toBe('needsKey')
    expect(sources.find((s) => s.id === 'currencyapi')).toMatchObject({ hasKey: true, state: 'untried' })
    expect(JSON.stringify(sources)).not.toContain('secret-key')
    expect(() => external.setApiKey(reception, 'currencyapi', 'x'.repeat(10))).toThrow(/PERMISSION_DENIED/)
  })

  it('yetkiler: kurları döviz görme yetkisi olan görür; otel kurunu döviz düzenleme yetkisi olan yazar', async () => {
    const { external, currency } = await setup()
    expect(() => external.fxOverview(housekeeping)).toThrow(/PERMISSION_DENIED/)
    expect(() => external.refreshFx(housekeeping)).toThrow(/PERMISSION_DENIED/)
    expect(() => external.fxSources(housekeeping)).toThrow(/PERMISSION_DENIED/)
    expect(() => currency.setHotelRate(reception, { currency: 'EUR', rateMicro: 1 })).toThrow(
      /PERMISSION_DENIED/
    )
    expect(() => currency.ingestMarketRates(housekeeping, [], 'market_mid')).toThrow(/PERMISSION_DENIED/)
  })
})

describe('hava durumu (G-113, K-13)', () => {
  it('MET’ten alınan tahmin önbelleğe girer; Expires dolmadan yeniden sorulmaz; sonra If-Modified-Since ile sorulur', async () => {
    const { external, fake, clock } = await setup({ [MET_PATH]: metRoute('2026-10-04T08:00:00Z') })
    expect(external.weather(housekeeping).forecast).toBeNull() // nothing yet: the card hides
    await external.refreshWeather(housekeeping)
    expect(fake.hits[0]).toBe('api.met.no/weatherapi/locationforecast/2.0/compact?lat=41.01&lon=28.98')
    expect(String(fake.headers[0]?.['user-agent'])).toMatch(/^Bismuth\/1\.0\.0-test \(/)
    const v = external.weather(housekeeping)
    expect(v.location).toMatchObject({ name: 'İstanbul', from: 'default' })
    expect(v.forecast?.provider).toBe('metno')
    expect(v.forecast?.days).toHaveLength(7)
    expect(v.forecast?.now?.symbol).toBe('partlycloudy_day')
    expect(v.fetchedAt).toBe('2026-10-04T09:00:00.000Z')

    await external.refreshWeather(owner)
    expect(fake.hits).toHaveLength(1)
    clock.set('2026-10-04T10:05:00.000Z')
    fake.set(MET_PATH, { status: 304, headers: { expires: 'Sun, 04 Oct 2026 11:00:00 GMT' } })
    await external.refreshWeather(owner)
    expect(fake.headers[1]?.['if-modified-since']).toBe('Sun, 04 Oct 2026 08:31:00 GMT')
    expect(external.weather(owner).fetchedAt).toBe('2026-10-04T10:05:00.000Z')
  })

  it('otelin e-postası yazılınca MET isteği onu kimlik olarak söyler; geçersiz e-posta ve yetkisiz rol yazamaz (K-13)', async () => {
    const { external, fake, settings } = await setup({ [MET_PATH]: metRoute('2026-10-04T08:00:00Z') })
    expect(settings.get(owner)['hotel.email']).toBe('')
    expect(() => settings.set(owner, { 'hotel.email': 'resepsiyon@' })).toThrow(
      expect.objectContaining({ code: 'VALIDATION' })
    )
    expect(() => settings.set(reception, { 'hotel.email': 'resepsiyon@ornek-otel.com' })).toThrow(
      expect.objectContaining({ code: 'PERMISSION_DENIED' })
    )
    settings.set(owner, { 'hotel.email': ' resepsiyon@ornek-otel.com ' })
    expect(settings.get(owner)['hotel.email']).toBe('resepsiyon@ornek-otel.com')
    await external.refreshWeather(owner)
    expect(fake.headers[0]?.['user-agent']).toBe('Bismuth/1.0.0-test resepsiyon@ornek-otel.com')
  })

  it('internet gidince son tahmin saatiyle kalır; şehir değişince koordinat ve veri değişir', async () => {
    const { external, clock, settings } = await setup({ [MET_PATH]: metRoute('2026-10-04T08:00:00Z') })
    await external.refreshWeather(owner)
    await fake!.close()
    fake = null
    clock.set('2026-10-04T15:00:00.000Z')
    expect(await external.refreshWeather(owner)).toEqual({ ok: false, skipped: false })
    const offline = external.weather(owner)
    expect(offline.fetchedAt).toBe('2026-10-04T09:00:00.000Z')
    expect(offline.forecast?.now?.time).toBe('2026-10-04T15:00:00.000Z')

    const server = await startFakeExternal({ [MET_PATH]: metRoute('2026-10-04T15:00:00Z') })
    fake = server
    const { external: ext2, settings: s2 } = await setupOn(server, settings)
    s2.set(owner, { 'hotel.city': 'Kadıköy, İstanbul' })
    expect(ext2.weather(owner)).toMatchObject({ location: { lat: 40.99, lon: 29.03, from: 'city' } })
    await ext2.refreshWeather(owner)
    expect(server.hits.at(-1)).toBe('api.met.no/weatherapi/locationforecast/2.0/compact?lat=40.99&lon=29.03')
    s2.set(owner, { 'weather.location': { lat: 38.4237, lon: 27.1428 } })
    const moved = ext2.weather(owner)
    expect(moved).toMatchObject({ otherLocation: true, forecast: null, location: { from: 'manual' } })
  })

  it('MET düşerse (sahip açtıysa) Open-Meteo kullanılır; kapalıysa denenmez', async () => {
    const { external, fake, settings } = await setup({
      [MET_PATH]: { status: 500 },
      [OPEN_METEO_PATH]: { body: openMeteo('2026-10-04T00:00:00Z') }
    })
    await external.refreshWeather(owner)
    expect(fake.hits.some((h) => h.startsWith('api.open-meteo.com'))).toBe(false)
    settings.set(owner, { 'weather.openMeteo': true })
    await external.refreshWeather(owner)
    const v = external.weather(owner)
    expect(v.forecast?.provider).toBe('openmeteo')
    expect(v.forecast?.days.find((d) => d.date === '2026-10-05')?.symbol).toBe('lightrain')
  })
})

describe('bayram denetimi ve ağ kapalı (K-04, G-02)', () => {
  it('denetim farkları döner, son sonuç saklanır; yetkisi olmayan çalıştıramaz', async () => {
    const { external } = await setup({
      [GOOGLE_ICS_PATH]: { body: GOOGLE_ICS, headers: { 'content-type': 'text/calendar' } }
    })
    const r = await external.checkHolidays(owner, 2027)
    expect(r.source).toBe('google')
    expect(r.diffs.map((d) => d.outcome)).toEqual(['moved', 'confirmed'])
    expect(external.lastHolidayChecks(owner)[0]?.year).toBe(2027)
    await expect(external.checkHolidays(roleCtx('accountant'), 2027)).rejects.toThrow(/PERMISSION_DENIED/)
  })

  it('"Dış veri kullanma" açıkken hiçbir istek yapılmaz: kur, hava, bayram ve zamanlayıcı', async () => {
    const { external, settings, http, fake } = await setup({
      [TRUNCGIL_PATH]: { body: truncgil() },
      [MET_PATH]: metRoute('2026-10-04T08:00:00Z'),
      [GOOGLE_ICS_PATH]: { body: GOOGLE_ICS }
    })
    settings.set(owner, { 'network.enabled': false })
    expect(await external.refreshFx(owner)).toEqual({ ok: false, provider: null, skipped: true })
    expect(await external.refreshWeather(owner)).toEqual({ ok: false, skipped: true })
    expect((await external.checkHolidays(owner, 2027)).skipped).toBe(true)
    external.start({ firstDelayMs: 0 })
    await new Promise((r) => setTimeout(r, 100))
    settings.set(owner, { 'hotel.city': 'İzmir' })
    await new Promise((r) => setTimeout(r, 50))
    external.stop()
    expect(http.requestCount).toBe(0)
    expect(external.requestCount).toBe(0)
    expect(fake.hits).toEqual([])
    expect(external.fxOverview(owner).networkEnabled).toBe(false)
  })

  it('zamanlayıcı açılışta kur, hava ve yılda bir bayram denetimini çalıştırır', async () => {
    const { external, fake } = await setup({
      [TRUNCGIL_PATH]: { body: truncgil() },
      [MET_PATH]: metRoute('2026-10-04T08:00:00Z'),
      [GOOGLE_ICS_PATH]: { body: GOOGLE_ICS }
    })
    external.start({ firstDelayMs: 0 })
    await expect
      .poll(() => fake.hits.some((h) => h.startsWith('calendar.google.com')), { timeout: 5000 })
      .toBe(true)
    await expect.poll(() => external.lastHolidayChecks(owner).length).toBe(2)
    external.stop()
    expect(fake.hits.some((h) => h.startsWith('finans.truncgil.com'))).toBe(true)
    expect(fake.hits.some((h) => h.startsWith('api.met.no'))).toBe(true)
  })
})

describe('yıllık bayram denetimi veritabanına göre karar verir (P14fix #13, #14)', () => {
  async function yearly(start: string, lastYear: number | null) {
    handle = await seededDatabase()
    fake = await startFakeExternal({ [GOOGLE_ICS_PATH]: { body: GOOGLE_ICS } })
    const clock = testClock(start)
    const deps = depsOf(handle, clock)
    const settings = createSettingsService(handle.db, clock)
    const state = createStateStore(null)
    // The cache file outlived a restore: it says this year was checked, the restored database does not.
    state.update((s) => {
      s.holidays.lastYear = lastYear
    })
    const external = createExternalService({
      ...deps,
      http: createHttpClient({ enabled: () => true, origin: fake.origin }),
      state,
      currency: createCurrencyService(deps),
      calendar: createCalendarService(deps),
      settings,
      appVersion: '1.0.0-test',
      random: () => 0
    })
    return { external, fake }
  }

  it('eski bir yedek geri yüklenince (doğrulama kaydı yok) denetim bu yıl yeniden yapılır', async () => {
    const { external, fake } = await yearly('2026-10-04T09:00:00.000Z', 2026)
    external.start({ firstDelayMs: 0 })
    await expect
      .poll(() => fake.hits.some((h) => h.startsWith('calendar.google.com')), { timeout: 5000 })
      .toBe(true)
    await expect.poll(() => external.lastHolidayChecks(owner).length).toBe(2)
    external.stop()
  })

  it("yıl otelin saat diliminden alınır: 31 Aralık 22:30 UTC İstanbul'da yeni yıldır", async () => {
    const { external } = await yearly('2026-12-31T22:30:00.000Z', null)
    external.start({ firstDelayMs: 0 })
    await expect.poll(() => external.lastHolidayChecks(owner).length, { timeout: 5000 }).toBe(2)
    external.stop()
    expect(
      external
        .lastHolidayChecks(owner)
        .map((r) => r.year)
        .sort()
    ).toEqual([2027, 2028])
  })
})

/** A second service on the same database and fake server (after the first server went away). */
async function setupOn(server: FakeExternal, settings: ReturnType<typeof createSettingsService>) {
  const clock = testClock('2026-10-04T15:00:00.000Z')
  const deps = depsOf(handle, clock)
  const http = createHttpClient({ enabled: () => true, origin: server.origin })
  const external = createExternalService({
    ...deps,
    http,
    state: createStateStore(null),
    currency: createCurrencyService(deps),
    calendar: createCalendarService(deps),
    settings,
    appVersion: '1.0.0-test'
  })
  return { external, settings }
}
