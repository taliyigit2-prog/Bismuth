import { describe, expect, it } from 'vitest'
import { money } from '../money'
import { convert, freezeToBase, needsNewRate, rateAt, type RateRow } from './fx'

const rows: RateRow[] = [
  {
    ts: '2026-10-01T09:00:00.000Z',
    base: 'EUR',
    quote: 'TRY',
    midRateMicro: 55_190_000,
    source: 'market_mid'
  },
  {
    ts: '2026-10-01T09:30:00.000Z',
    base: 'EUR',
    quote: 'TRY',
    midRateMicro: 55_250_000,
    source: 'market_mid'
  },
  {
    ts: '2026-10-01T09:00:00.000Z',
    base: 'USD',
    quote: 'TRY',
    midRateMicro: 49_030_000,
    source: 'market_mid'
  },
  {
    ts: '2026-10-01T09:00:00.000Z',
    base: 'TRY',
    quote: 'RUB',
    midRateMicro: 1_694_915,
    source: 'market_mid'
  },
  { ts: '2026-10-01T08:00:00.000Z', base: 'GBP', quote: 'TRY', midRateMicro: 60_000_000, source: 'hotel' },
  {
    ts: '2026-10-01T09:00:00.000Z',
    base: 'GBP',
    quote: 'TRY',
    midRateMicro: 64_830_000,
    source: 'market_mid'
  }
]

describe('kur kaydın yazıldığı dakikada donar (§6.5, K-15)', () => {
  it('yazma anındaki son kur alınır, sonraki kur kullanılmaz', () => {
    const at915 = freezeToBase(money(3500, 'EUR'), 'TRY', rows, '2026-10-01T09:15:00.000Z')
    expect(at915).toMatchObject({
      amountBaseMinor: 193_165,
      rateToBaseMicro: 55_190_000,
      source: 'market_mid'
    })
    const at945 = freezeToBase(money(3500, 'EUR'), 'TRY', rows, '2026-10-01T09:45:00.000Z')
    expect(at945?.amountBaseMinor).toBe(193_375)
    expect(at945?.rateAt).toBe('2026-10-01T09:45:00.000Z')
  })

  it('ters yönlü kur da kullanılır; otel kuru piyasa kurunun önüne geçer', () => {
    const rub = freezeToBase(money(100_000, 'RUB'), 'TRY', rows, '2026-10-01T10:00:00.000Z')
    expect(rub?.amountBaseMinor).toBe(59_000)
    const gbp = freezeToBase(money(10_000, 'GBP'), 'TRY', rows, '2026-10-01T10:00:00.000Z')
    expect(gbp?.amountBaseMinor).toBe(600_000)
    expect(gbp?.source).toBe('hotel')
  })

  it('aynı para biriminde kur 1; kur bilinmiyorsa null (kayıt yine yazılır); 6 saatten eski kur işaretlenir', () => {
    expect(freezeToBase(money(250_000, 'TRY'), 'TRY', [], '2026-10-01T10:00:00.000Z')?.amountBaseMinor).toBe(
      250_000
    )
    expect(freezeToBase(money(100, 'CHF'), 'TRY', rows, '2026-10-01T10:00:00.000Z')).toBeNull()
    expect(freezeToBase(money(100, 'USD'), 'TRY', rows, '2026-10-01T16:00:00.000Z')?.stale).toBe(true)
  })

  it('basamak sayısı farklı para birimleri doğru çevrilir; seçili kaynak listesine uyulur', () => {
    expect(convert(money(1000, 'JPY'), 'TRY', 220_000n, 1_000_000n)).toEqual(money(22_000, 'TRY'))
    expect(rateAt(rows, 'GBP', 'TRY', '2026-10-01T10:00:00.000Z', ['market_mid'])?.row.midRateMicro).toBe(
      64_830_000
    )
  })

  it('yalnız tutar ya da birim değişince yeni kur alınır (S-32)', () => {
    const before = { amountMinor: 3500, currency: 'EUR' }
    expect(needsNewRate(before, { amountMinor: 3500, currency: 'EUR' })).toBe(false)
    expect(needsNewRate(before, { amountMinor: 3600, currency: 'EUR' })).toBe(true)
    expect(needsNewRate(before, { amountMinor: 3500, currency: 'USD' })).toBe(true)
  })
})
