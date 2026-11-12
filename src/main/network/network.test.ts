import { randomBytes } from 'node:crypto'
import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_FX_SOURCES } from '@shared/domain/external'
import {
  EXCHANGERATE_PATH,
  FAWAZ_PAGES_PATH,
  FAWAZ_PATH,
  FRANKFURTER_PATH,
  OPEN_ER_PATH,
  OXR_PATH,
  TCMB_PATH,
  TCMB_XML,
  TRUNCGIL_PATH,
  exchangeRate,
  fawaz,
  frankfurter,
  openEr,
  oxr,
  startFakeExternal,
  truncgil,
  type FakeExternal
} from '../../../tests/factories/fake-external'
import { tempDataDir } from '../../../tests/factories/runtime'
import { memoryKeyStore } from '../security/bismuth-key'
import { createHttpClient, isAllowedUrl } from './http'
import { createStateStore, keySealer, systemSealer } from './state'
import { fetchTcmb, runFxChain } from './fx/chain'
import { decimal } from './fx/sources'

let fake: FakeExternal | null = null
afterEach(async () => {
  await fake?.close()
  fake = null
})

const WANTED = ['TRY', 'USD', 'EUR', 'GBP', 'RUB']

async function setup(routes: Parameters<typeof startFakeExternal>[0], enabled = true) {
  fake = await startFakeExternal(routes)
  const http = createHttpClient({ enabled: () => enabled, origin: fake.origin })
  const state = createStateStore(null)
  return { http, state, fake }
}

const byCurrency = (rates: { currency: string; micro: number; provider: string }[]) =>
  Object.fromEntries(rates.map((r) => [r.currency, [r.micro, r.provider]]))

describe('ağ kapısı (yasak 1)', () => {
  it('yalnız izinli alan adlarına HTTPS ile gidilir', () => {
    expect(isAllowedUrl('https://api.met.no/weatherapi/x')).toBe(true)
    expect(isAllowedUrl('http://api.met.no/weatherapi/x')).toBe(false)
    expect(isAllowedUrl('https://evil.example.com/')).toBe(false)
    expect(isAllowedUrl('https://user:pw@api.met.no/')).toBe(false)
    expect(isAllowedUrl('not a url')).toBe(false)
  })

  it('ağ kapalıyken hiç istek çıkmaz; izinsiz adres istenmez', async () => {
    let called = 0
    const off = createHttpClient({
      enabled: () => false,
      fetch: () => (called++, Promise.reject(new Error('x')))
    })
    expect(await off.get('https://api.met.no/x')).toEqual({ ok: false, reason: 'off' })
    const on = createHttpClient({
      enabled: () => true,
      fetch: () => (called++, Promise.reject(new Error('x')))
    })
    expect(await on.get('https://evil.example.com/')).toEqual({ ok: false, reason: 'notAllowed' })
    expect(called).toBe(0)
    expect(off.requestCount + on.requestCount).toBe(0)
  })

  it('izinli olmayan yere yönlendirme izlenmez; zaman aşımı sessizce döner', async () => {
    const { http } = await setup({
      [TRUNCGIL_PATH]: { status: 302, headers: { location: 'https://evil.example.com/x' } }
    })
    expect(await http.get('https://finans.truncgil.com/v4/today.json')).toEqual({
      ok: false,
      reason: 'notAllowed'
    })
    const slow = createHttpClient({
      enabled: () => true,
      timeoutMs: 20,
      fetch: (_u, init) =>
        new Promise((_r, reject) =>
          init.signal?.addEventListener('abort', () =>
            reject(Object.assign(new Error('t'), { name: 'TimeoutError' }))
          )
        )
    })
    expect(await slow.get('https://api.met.no/x')).toEqual({ ok: false, reason: 'timeout' })
  })
})

describe('önbellek dosyası (P14fix #20, N-10)', () => {
  /** A stand-in for Electron's safeStorage (one computer's key store). */
  const fakeSafeStorage = (secret = randomBytes(8).toString('hex')) => ({
    isEncryptionAvailable: () => true,
    encryptString: (plain: string) => Buffer.from(`${secret}|${plain}`).reverse(),
    decryptString: (blob: Buffer) => {
      const text = Buffer.from(blob).reverse().toString()
      if (!text.startsWith(`${secret}|`)) throw new Error('another key store')
      return text.slice(secret.length + 1)
    }
  })

  it('kur sağlayıcı anahtarları sistemin anahtar deposuyla mühürlü durur; aynı depoyla geri okunur, başkasıyla okunamaz', () => {
    const dir = tempDataDir()
    const file = join(dir, 'external-data.json')
    const os = fakeSafeStorage()
    const store = createStateStore(file, systemSealer(os))
    store.update((s) => {
      s.apiKeys['currencyapi'] = 'gizli-anahtar-123456'
    })
    expect(readFileSync(file, 'utf8')).not.toContain('gizli-anahtar')
    expect(createStateStore(file, systemSealer(os)).read().apiKeys).toEqual({
      currencyapi: 'gizli-anahtar-123456'
    })
    // Another computer's key store cannot open it: the keys are forgotten, nothing else.
    expect(createStateStore(file, systemSealer(fakeSafeStorage())).read().apiKeys).toEqual({})
    // A file of an earlier version (keys in the clear) is still read, and sealed at the next write.
    writeFileSync(file, JSON.stringify({ version: 1, apiKeys: { openexchangerates: 'eski-duz-anahtar' } }))
    const old = createStateStore(file, systemSealer(os))
    expect(old.read().apiKeys).toEqual({ openexchangerates: 'eski-duz-anahtar' })
    old.update(() => undefined)
    expect(readFileSync(file, 'utf8')).not.toContain('eski-duz-anahtar')
  })

  it('Bismuth anahtarı değişince (geri yükleme, kâğıttan giriş) API anahtarı korunur; kaydetmek Bismuth anahtarı yaratmaz', () => {
    const file = join(tempDataDir(), 'external-data.json')
    const os = fakeSafeStorage()
    const noKeyYet = memoryKeyStore(null)
    createStateStore(file, systemSealer(os), keySealer(noKeyYet)).update((s) => {
      s.apiKeys['currencyapi'] = 'gizli-anahtar-123456'
    })
    expect(noKeyYet.info().exists).toBe(false)
    // The hotel's key is replaced: the API key is still there.
    const replaced = memoryKeyStore(randomBytes(32))
    expect(createStateStore(file, systemSealer(os), keySealer(replaced)).read().apiKeys).toEqual({
      currencyapi: 'gizli-anahtar-123456'
    })
  })

  it('eski sürümün Bismuth anahtarıyla mühürlediği kayıt bir kez okunur ve sistemin deposuyla yeniden mühürlenir', () => {
    const file = join(tempDataDir(), 'external-data.json')
    const keys = memoryKeyStore(randomBytes(32))
    const sealedOld = keySealer(keys).seal('eski-muhurlu-anahtar')!
    writeFileSync(file, JSON.stringify({ version: 1, sealedKeys: { currencyapi: sealedOld } }))
    const os = fakeSafeStorage()
    expect(createStateStore(file, systemSealer(os), keySealer(keys)).read().apiKeys).toEqual({
      currencyapi: 'eski-muhurlu-anahtar'
    })
    const onDisk = JSON.parse(readFileSync(file, 'utf8')) as { sealedKeys: Record<string, string> }
    expect(onDisk.sealedKeys['currencyapi']).toMatch(/^os:/)
    // From now on the Bismuth key is not needed to read it.
    expect(createStateStore(file, systemSealer(os), null).read().apiKeys).toEqual({
      currencyapi: 'eski-muhurlu-anahtar'
    })
  })

  it.skipIf(process.platform === 'win32')(
    'mühürleyici yokken (anahtar deposu yok) dosya düz yazılır ama yalnız sahibi okuyabilir (0600)',
    () => {
      const file = join(tempDataDir(), 'external-data.json')
      expect(systemSealer(null)).toBeNull()
      expect(systemSealer({ ...fakeSafeStorage(), isEncryptionAvailable: () => false })).toBeNull()
      createStateStore(file, null).update((s) => {
        s.apiKeys['currencyapi'] = 'duz-anahtar'
      })
      expect(statSync(file).mode & 0o777).toBe(0o600)
    }
  )
})

describe('kur kaynak zinciri (K-06)', () => {
  it('Truncgil alış/satış ortalamasını micro tam sayı olarak verir (virgüllü metin de okunur)', async () => {
    const { http, state, fake } = await setup({ [TRUNCGIL_PATH]: { body: truncgil() } })
    const r = await runFxChain({
      http,
      state,
      order: DEFAULT_FX_SOURCES,
      base: 'TRY',
      wanted: WANTED,
      now: new Date()
    })
    expect(byCurrency(r.rates)).toEqual({
      USD: [49_126_000, 'truncgil'],
      EUR: [55_277_000, 'truncgil'],
      GBP: [64_868_000, 'truncgil'],
      RUB: [588_200, 'truncgil']
    })
    expect(r.missing).toEqual([])
    expect(fake.hits).toEqual(['finans.truncgil.com/v4/today.json'])
    expect(decimal('6.580,10')).toBe(6580.1)
  })

  it('bozuk JSON dönen kaynak atlanır ve 24 saat dinlenir; zincir sonraki kaynakla sürer', async () => {
    const { http, state, fake } = await setup({
      [TRUNCGIL_PATH]: { body: '<html>bakımdayız</html>' },
      [FAWAZ_PATH]: { body: fawaz }
    })
    const t0 = new Date('2026-10-01T09:00:00.000Z')
    const first = await runFxChain({
      http,
      state,
      order: DEFAULT_FX_SOURCES,
      base: 'TRY',
      wanted: WANTED,
      now: t0
    })
    expect(new Set(first.rates.map((r) => r.provider))).toEqual(new Set(['fawaz-jsdelivr']))
    expect(byCurrency(first.rates)['USD']).toEqual([49_028_000, 'fawaz-jsdelivr'])
    expect(state.read().sources['truncgil']?.restingUntil).toBe('2026-10-02T09:00:00.000Z')

    // An hour later Truncgil is not asked; after the 24 hours it is.
    const later = new Date(t0.getTime() + 3_600_000)
    await runFxChain({ http, state, order: DEFAULT_FX_SOURCES, base: 'TRY', wanted: WANTED, now: later })
    expect(fake.hits.filter((h) => h.startsWith('finans.truncgil.com'))).toHaveLength(1)
    fake.set(TRUNCGIL_PATH, { body: truncgil() })
    const nextDay = new Date(t0.getTime() + 25 * 3_600_000)
    const back = await runFxChain({
      http,
      state,
      order: DEFAULT_FX_SOURCES,
      base: 'TRY',
      wanted: WANTED,
      now: nextDay
    })
    expect(back.rates.every((r) => r.provider === 'truncgil')).toBe(true)
    expect(state.read().sources['truncgil']?.restingUntil).toBeNull()
  })

  it('ulaşılamayan kaynak dinlenmez; RUB vermeyen kaynaktan sonra eksik birim sonrakinden alınır', async () => {
    const { http, state } = await setup({
      [TRUNCGIL_PATH]: { status: 503, body: 'busy' },
      [FRANKFURTER_PATH]: { body: frankfurter },
      [OPEN_ER_PATH]: { body: openEr }
    })
    const r = await runFxChain({
      http,
      state,
      order: ['truncgil', 'frankfurter', 'open-er-api'],
      base: 'TRY',
      wanted: WANTED,
      now: new Date('2026-10-01T09:00:00.000Z')
    })
    expect(byCurrency(r.rates)).toEqual({
      USD: [49_044_000, 'frankfurter'],
      EUR: [55_402_000, 'frankfurter'],
      GBP: [64_893_000, 'frankfurter'],
      RUB: [587_400, 'open-er-api']
    })
    expect(state.read().sources['truncgil']).toMatchObject({ restingUntil: null })
    expect(state.read().sources['truncgil']?.lastFailAt).not.toBeNull()
  })

  it('Faz 0 kaynaklarının hepsi kendi biçiminden okunur; anahtarlı kaynak anahtarsız atlanır', async () => {
    const { http, state, fake } = await setup({
      [FAWAZ_PAGES_PATH]: { body: fawaz },
      [EXCHANGERATE_PATH]: { body: exchangeRate },
      [OXR_PATH]: ({ query }) => (query.get('app_id') === 'hotel-key-123' ? { body: oxr } : { status: 401 })
    })
    const now = new Date('2026-10-01T09:00:00.000Z')
    const ask = (order: Parameters<typeof runFxChain>[0]['order']) =>
      runFxChain({ http, state, order, base: 'TRY', wanted: WANTED, now })
    expect(byCurrency((await ask(['fawaz-pages'])).rates)['GBP']).toEqual([64_946_000, 'fawaz-pages'])
    expect(byCurrency((await ask(['exchangerate-api'])).rates)['EUR']).toEqual([
      55_556_000,
      'exchangerate-api'
    ])
    expect((await ask(['openexchangerates'])).rates).toEqual([])
    expect(fake.hits.some((h) => h.startsWith('openexchangerates.org'))).toBe(false)
    state.update((s) => {
      s.apiKeys['openexchangerates'] = 'hotel-key-123'
    })
    expect(byCurrency((await ask(['openexchangerates'])).rates)['USD']).toEqual([
      49_100_000,
      'openexchangerates'
    ])
  })

  it('günlük kaynağın kendi tarihi kurla birlikte gelir; canlı kaynakta tarih yoktur (P14fix #19)', async () => {
    const { http, state } = await setup({
      [FAWAZ_PAGES_PATH]: { body: fawaz },
      [EXCHANGERATE_PATH]: { body: exchangeRate },
      [FRANKFURTER_PATH]: { body: frankfurter },
      [OPEN_ER_PATH]: { body: openEr },
      [TRUNCGIL_PATH]: { body: truncgil() }
    })
    const now = new Date('2026-10-04T09:00:00.000Z')
    const ask = async (order: Parameters<typeof runFxChain>[0]['order']) =>
      (await runFxChain({ http, state, order, base: 'TRY', wanted: WANTED, now })).rates[0]?.asOf
    expect(await ask(['fawaz-pages'])).toBe('2026-10-01T00:00:00.000Z')
    expect(await ask(['exchangerate-api'])).toBe('2026-09-21T14:13:20.000Z')
    expect(await ask(['frankfurter'])).toBe('2026-10-01T00:00:00.000Z')
    expect(await ask(['open-er-api'])).toBe('2026-10-01T00:02:31.000Z')
    expect(await ask(['truncgil'])).toBeNull()
  })

  it('TCMB karşılaştırma satırı bülten ortalamasından okunur; ağ kapalıyken zincir hiç istek yapmaz', async () => {
    const { http, state } = await setup({
      [TCMB_PATH]: { body: TCMB_XML, headers: { 'content-type': 'text/xml' } }
    })
    const t = await fetchTcmb({ http, state, now: new Date(), wanted: WANTED })
    expect(Object.fromEntries(t!.map((r) => [r.currency, r.micro]))).toEqual({
      USD: 48_991_000,
      EUR: 55_347_000,
      GBP: 64_813_000,
      RUB: 588_000
    })
    const off = createHttpClient({ enabled: () => false, origin: fake!.origin })
    const r = await runFxChain({
      http: off,
      state,
      order: DEFAULT_FX_SOURCES,
      base: 'TRY',
      wanted: WANTED,
      now: new Date()
    })
    expect(r.skipped).toBe(true)
    expect(off.requestCount).toBe(0)
  })
})
