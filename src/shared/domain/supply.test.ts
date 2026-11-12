import { describe, expect, it } from 'vitest'
import { localDate } from '../date'
import { money } from '../money'
import { monthlyConsumption, priceChange, priceHistory, type PurchaseLine } from './supply'

// Made-up products and prices; each line stands for one expense_items row joined with its expense.
const WATER = 'P-WATER-05L'
const SOAP = 'P-SOAP'

const line = (
  productId: string,
  date: string,
  qty: number,
  unitPriceMinor: number,
  extra: Partial<PurchaseLine> = {}
): PurchaseLine => ({
  productId,
  date: localDate(date),
  qty,
  unitPriceMinor,
  amountMinor: qty * unitPriceMinor,
  currency: 'TRY',
  ...extra
})

describe('Ürün fiyat geçmişi', () => {
  it('tarih sırasıyla döner, aynı gün girilenler giriş sırasını korur, iptal edilen gider düşer', () => {
    const lines = [
      line(WATER, '2026-10-20', 40, 7_500),
      line(WATER, '2026-09-01', 40, 6_000),
      line(SOAP, '2026-09-15', 10, 4_000),
      line(WATER, '2026-10-20', 12, 7_600),
      line(WATER, '2026-09-25', 40, 9_900, { voided: true })
    ]
    expect(priceHistory(lines, WATER).map((l) => [l.date, l.unitPriceMinor])).toEqual([
      ['2026-09-01', 6_000],
      ['2026-10-20', 7_500],
      ['2026-10-20', 7_600]
    ])
  })
})

describe('Zam uyarısı', () => {
  it('üç gider kaydının ürün satırlarından: 60 → 60 → 75 TL şişe başı %25 zam (2500 baz puan)', () => {
    const lines = [
      line(WATER, '2026-08-03', 40, 6_000),
      line(SOAP, '2026-08-03', 5, 4_500),
      line(WATER, '2026-09-02', 40, 6_000),
      line(WATER, '2026-10-01', 40, 7_500)
    ]
    expect(priceChange(lines, WATER)).toEqual({
      productId: WATER,
      currency: 'TRY',
      lastDate: '2026-10-01',
      lastUnitMinor: 7_500,
      previousDate: '2026-09-02',
      previousUnitMinor: 6_000,
      diffMinor: 1_500,
      basisPoints: 2_500,
      isIncrease: true
    })
  })

  it('örnek fiş: 40 × 60 = 2.400 TL, ikinci alım 65 TL → +%8,3 zam (833 baz puan, 5 TL)', () => {
    const lines = [line(WATER, '2026-09-01', 40, 6_000), line(WATER, '2026-09-15', 40, 6_500)]
    expect(lines[0]?.amountMinor).toBe(240_000)
    expect(priceChange(lines, WATER)).toMatchObject({ diffMinor: 500, basisPoints: 833, isIncrease: true })
  })

  it('fiyat düşerse ya da aynı kalırsa zam rozeti yoktur', () => {
    const down = priceChange(
      [line(WATER, '2026-09-01', 40, 6_500), line(WATER, '2026-09-15', 40, 6_000)],
      WATER
    )
    expect(down).toMatchObject({ diffMinor: -500, basisPoints: -769, isIncrease: false })
    const same = priceChange(
      [line(WATER, '2026-09-01', 40, 6_000), line(WATER, '2026-09-15', 40, 6_000)],
      WATER
    )
    expect(same).toMatchObject({ diffMinor: 0, basisPoints: 0, isIncrease: false })
  })

  it('tek alımda karşılaştırma yoktur; iptal edilen son alım hesaba girmez', () => {
    expect(priceChange([line(WATER, '2026-09-01', 40, 6_000)], WATER)).toBeNull()
    expect(priceChange([], WATER)).toBeNull()
    const voidedLast = [
      line(WATER, '2026-09-01', 40, 6_000),
      line(WATER, '2026-09-15', 40, 6_000),
      line(WATER, '2026-10-01', 40, 9_000, { voided: true })
    ]
    expect(priceChange(voidedLast, WATER)).toMatchObject({ lastDate: '2026-09-15', isIncrease: false })
  })

  it('yalnız aynı para birimindeki önceki alımla karşılaştırır; önceki fiyat 0 ise yüzde yoktur', () => {
    const mixed = [
      line(WATER, '2026-09-01', 40, 6_000),
      line(WATER, '2026-09-10', 40, 150, { currency: 'EUR' }),
      line(WATER, '2026-09-20', 40, 6_600)
    ]
    expect(priceChange(mixed, WATER)).toMatchObject({ previousUnitMinor: 6_000, basisPoints: 1_000 })
    const onlyOther = [
      line(WATER, '2026-09-10', 40, 150, { currency: 'EUR' }),
      line(WATER, '2026-09-20', 40, 6_600)
    ]
    expect(priceChange(onlyOther, WATER)).toBeNull()
    const free = [line(WATER, '2026-09-01', 1, 0), line(WATER, '2026-09-20', 40, 6_600)]
    expect(priceChange(free, WATER)).toMatchObject({ diffMinor: 6_600, basisPoints: null, isIncrease: true })
  })
})

describe('Aylık tüketim', () => {
  it('ayın alımlarının adet ve tutar toplamını verir; başka ay, ürün ve iptal edilen gider girmez', () => {
    const lines = [
      line(WATER, '2026-09-30', 40, 6_000),
      line(WATER, '2026-10-01', 40, 6_000),
      line(WATER, '2026-10-15', 24, 6_500),
      line(WATER, '2026-10-20', 40, 6_500, { voided: true }),
      line(SOAP, '2026-10-15', 10, 4_000),
      line(WATER, '2026-11-01', 40, 6_500)
    ]
    expect(monthlyConsumption(lines, WATER, 2026, 10)).toEqual({
      productId: WATER,
      year: 2026,
      month: 10,
      purchaseCount: 2,
      qty: 64,
      totals: [money(396_000, 'TRY')]
    })
  })

  it('farklı para birimleri ayrı toplanır; alım yoksa toplam boştur', () => {
    const lines = [
      line(WATER, '2026-10-01', 40, 6_000),
      line(WATER, '2026-10-02', 10, 150, { currency: 'EUR' }),
      line(WATER, '2026-10-03', 10, 6_000)
    ]
    expect(monthlyConsumption(lines, WATER, 2026, 10).totals).toEqual([
      money(1_500, 'EUR'),
      money(300_000, 'TRY')
    ])
    expect(monthlyConsumption(lines, WATER, 2026, 11)).toMatchObject({ purchaseCount: 0, qty: 0, totals: [] })
  })
})
