import { describe, expect, it } from 'vitest'
import { money } from '../money'
import { DEFAULT_FX_SOURCES, crossRates, fxCurrencies, isKeyedProvider, rateAge, toMicro } from './external'
import { convert, freezeToBase, RATE_SCALE, type RateRow } from './fx'

// Faz 0 Truncgil sample (canli-dogrulama.md §1): TRY per unit, mid of buying and selling.
const TRUNCGIL = { USD: 49.126, EUR: 55.277, GBP: 64.868, RUB: 0.5882 }

describe('piyasa orta kuru, micro tam sayı (K-06, G-131)', () => {
  it('kaynak tablosu otelin ana birimine micro tam sayı olarak çevrilir; çapraz kur pivot üzerinden', () => {
    expect(crossRates('TRY', TRUNCGIL, 'TRY', ['TRY', 'USD', 'EUR', 'GBP', 'RUB', 'CHF'])).toEqual({
      USD: 49_126_000,
      EUR: 55_277_000,
      GBP: 64_868_000,
      RUB: 588_200
    })
    // A EUR-based hotel: TRY and USD in euros.
    const eur = crossRates('TRY', TRUNCGIL, 'EUR', ['TRY', 'USD'])
    expect(eur['TRY']).toBe(Math.round((1 / 55.277) * RATE_SCALE))
    expect(eur['USD']).toBe(888_724)
    // USD-pivot table (Open Exchange Rates): units per one USD inverted.
    expect(crossRates('USD', { TRY: 1 / 49.1, EUR: 1 / 0.88 }, 'TRY', ['EUR'])['EUR']).toBe(55_795_455)
    expect(toMicro(Number.NaN)).toBeNull()
    expect(toMicro(-1)).toBeNull()
  })

  it('2.500 TL → USD/EUR/GBP/RUB: tam sayı kuruş/sent, son basamakta yarım yukarı', () => {
    const rates = crossRates('TRY', TRUNCGIL, 'TRY', ['USD', 'EUR', 'GBP', 'RUB'])
    const tl = money(250_000, 'TRY')
    const to = (c: string) => convert(tl, c, BigInt(RATE_SCALE), BigInt(rates[c]!))
    expect(to('USD')).toEqual(money(5_089, 'USD')) // 50,8895… → 50,89 $
    expect(to('EUR')).toEqual(money(4_523, 'EUR')) // 45,2267… → 45,23 €
    expect(to('GBP')).toEqual(money(3_854, 'GBP')) // 38,5404… → 38,54 £
    expect(to('RUB')).toEqual(money(425_026, 'RUB')) // 4 250,255… → 4 250,26 ₽
    // And back: 50,89 $ is 2.500,00 TL to the kuruş at the same rate (2 500,0221 → 2 500,02).
    expect(convert(money(5_089, 'USD'), 'TRY', BigInt(rates['USD']!), BigInt(RATE_SCALE))).toEqual(
      money(250_002, 'TRY')
    )
  })

  it('kayıt anında otel kuru yürürlükteyse o, değilse en yeni piyasa ya da düzeltme kuru donar', () => {
    const rows: RateRow[] = [
      {
        ts: '2026-09-01T09:00:00.000Z',
        base: 'EUR',
        quote: 'TRY',
        midRateMicro: 52_000_000,
        source: 'manual'
      },
      {
        ts: '2026-09-20T09:00:00.000Z',
        base: 'EUR',
        quote: 'TRY',
        midRateMicro: 50_000_000,
        source: 'hotel'
      },
      {
        ts: '2026-10-01T09:00:00.000Z',
        base: 'EUR',
        quote: 'TRY',
        midRateMicro: 55_277_000,
        source: 'market_mid'
      }
    ]
    const at = '2026-10-01T09:30:00.000Z'
    const m = money(10_000, 'EUR')
    expect(freezeToBase(m, 'TRY', rows, at, 6, { hotel: true })).toMatchObject({
      amountBaseMinor: 500_000,
      source: 'hotel'
    })
    // Hotel rate not in force: the September correction no longer beats today's market rate.
    expect(freezeToBase(m, 'TRY', rows, at, 6, { hotel: false })).toMatchObject({
      amountBaseMinor: 552_770,
      source: 'market_mid'
    })
  })

  it('kur yaşı: 6 saate kadar taze, 48 saate kadar eski, sonrası çok eski', () => {
    const now = '2026-10-04T12:00:00.000Z'
    expect(rateAge('2026-10-04T06:00:00.000Z', now)).toBe('fresh')
    expect(rateAge('2026-10-04T05:59:00.000Z', now)).toBe('stale')
    expect(rateAge('2026-10-02T12:00:00.000Z', now)).toBe('stale')
    expect(rateAge('2026-10-02T11:59:00.000Z', now)).toBe('veryStale')
  })
})

describe('kur kaynakları ve izlenen para birimleri (K-06, G-110)', () => {
  it('anahtar isteyen kaynaklar ayrı; zincir canlı kaynakla başlar', () => {
    expect(DEFAULT_FX_SOURCES[0]).toBe('truncgil')
    expect(isKeyedProvider('currencyapi')).toBe(true)
    expect(isKeyedProvider('truncgil')).toBe(false)
    expect(isKeyedProvider('tcmb')).toBe(false)
  })

  it('ekran dört birimi her zaman izler, otelin birimlerini ekler, ana birimi hiç izlemez', () => {
    expect(fxCurrencies(['TRY', 'EUR', 'CHF'], 'TRY')).toEqual(['USD', 'EUR', 'GBP', 'RUB', 'CHF'])
    expect(fxCurrencies(['EUR'], 'EUR')).toEqual(['USD', 'GBP', 'RUB'])
  })
})
