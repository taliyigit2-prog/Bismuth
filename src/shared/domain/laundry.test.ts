import { describe, expect, it } from 'vitest'
import { localDate } from '../date'
import {
  laundryLineAmount,
  laundryOutstanding,
  laundrySettlement,
  priceOn,
  withInvoice,
  type LaundryDelivery,
  type LaundryDeliveryItem,
  type LaundryPrice
} from './laundry'

// Made-up laundry, item types and prices (no real figures).
const LAUNDRY = 'C-LAUNDRY'
const OTHER = 'C-OTHER'
const SHEET = 'IT-01-SHEET'
const TOWEL = 'IT-02-TOWEL'
const PIQUE = 'IT-03-PIQUE'

const d = localDate
const price = (
  itemTypeId: string,
  validFrom: string,
  unitPriceMinor: number,
  currency = 'TRY'
): LaundryPrice => ({
  contactId: LAUNDRY,
  itemTypeId,
  validFrom: d(validFrom),
  unitPriceMinor,
  currency
})
const item = (itemTypeId: string, qty: number, stainedQty = 0, slip?: number): LaundryDeliveryItem => ({
  itemTypeId,
  qty,
  stainedQty,
  slipUnitPriceMinor: slip
})
let seq = 0
const delivery = (
  date: string,
  direction: 'out' | 'in',
  items: LaundryDeliveryItem[],
  contactId = LAUNDRY
): LaundryDelivery => ({ id: `D-${++seq}`, date: d(date), direction, contactId, items })

// Sheet 25 TL, price rise to 30 TL from 16 October; big towel 15 TL.
const prices: LaundryPrice[] = [
  price(SHEET, '2026-01-01', 2500),
  price(SHEET, '2026-10-16', 3000),
  price(TOWEL, '2026-01-01', 1500)
]

describe('Çamaşırhane fiyatı (geçerlilik tarihli)', () => {
  it('o gün geçerli olan son fiyatı verir; zam günü yeni fiyat başlar', () => {
    expect(priceOn(prices, LAUNDRY, SHEET, d('2026-10-15'))?.unitPriceMinor).toBe(2500)
    expect(priceOn(prices, LAUNDRY, SHEET, d('2026-10-16'))?.unitPriceMinor).toBe(3000)
    expect(priceOn(prices, LAUNDRY, SHEET, d('2025-12-31'))).toBeNull()
    expect(priceOn(prices, OTHER, SHEET, d('2026-10-16'))).toBeNull()
    expect(priceOn(prices, LAUNDRY, PIQUE, d('2026-10-16'))).toBeNull()
  })

  it('aynı günden iki fiyat varsa sonra girilen geçerlidir', () => {
    const fixed = [...prices, price(SHEET, '2026-10-16', 2900)]
    expect(priceOn(fixed, LAUNDRY, SHEET, d('2026-10-20'))?.unitPriceMinor).toBe(2900)
  })

  it('fişte fiyat yazıyorsa satır tutarı fiş fiyatıyla, yoksa tablo fiyatıyla hesaplanır', () => {
    expect(
      laundryLineAmount(item(SHEET, 10, 0, 2800), d('2026-10-05'), LAUNDRY, prices, 'TRY')?.amountMinor
    ).toBe(28_000)
    expect(laundryLineAmount(item(SHEET, 10), d('2026-10-05'), LAUNDRY, prices, 'TRY')?.amountMinor).toBe(
      25_000
    )
    expect(laundryLineAmount(item(PIQUE, 10), d('2026-10-05'), LAUNDRY, prices, 'TRY')).toBeNull()
  })
})

describe('Aylık çamaşırhane mutabakatı', () => {
  const deliveries: LaundryDelivery[] = [
    // Example clean slip (faz-12): sheet 17, towel 36 — plus a second slip after the price rise.
    delivery('2026-10-05', 'in', [item(SHEET, 17, 2), item(TOWEL, 36, 1)]),
    delivery('2026-10-05', 'out', [item(SHEET, 40), item(TOWEL, 50)]),
    delivery('2026-10-20', 'in', [item(SHEET, 20), item(TOWEL, 30, 3)]),
    delivery('2026-09-30', 'in', [item(SHEET, 99)]),
    delivery('2026-11-01', 'in', [item(SHEET, 99)]),
    delivery('2026-10-12', 'in', [item(SHEET, 99)], OTHER)
  ]

  it('yalnız o ayın gelen (temiz) fişlerini tür bazında toplar; ay ortası zam doğru fiyatla çarpılır', () => {
    const s = laundrySettlement(deliveries, prices, LAUNDRY, 2026, 10)
    expect(s.currency).toBe('TRY')
    expect(s.deliveryCount).toBe(2)
    expect(s.lines).toEqual([
      // 17 × 25 + 20 × 30 = 1.025 TL
      { itemTypeId: SHEET, qty: 37, stainedQty: 2, amountMinor: 102_500, unpricedQty: 0 },
      // 66 × 15 = 990 TL
      { itemTypeId: TOWEL, qty: 66, stainedQty: 4, amountMinor: 99_000, unpricedQty: 0 }
    ])
    expect(s.totalQty).toBe(103)
    expect(s.totalStainedQty).toBe(6)
    expect(s.totalAmountMinor).toBe(201_500)
  })

  it('fatura tutarıyla farkı verir: fazla fatura pozitif fark, eşitse fark yok', () => {
    const s = laundrySettlement(deliveries, prices, LAUNDRY, 2026, 10)
    const over = withInvoice(s, 205_000)
    expect(over.differenceMinor).toBe(3_500)
    expect(over.matches).toBe(false)
    expect(withInvoice(s, 201_500)).toMatchObject({ differenceMinor: 0, matches: true })
    expect(withInvoice(s, 200_000).differenceMinor).toBe(-1_500)
  })

  it('fiyatı olmayan türün tutarı boş kalır, toplam ve fark hesaplanmaz', () => {
    const withPique = [...deliveries, delivery('2026-10-21', 'in', [item(PIQUE, 4)])]
    const s = laundrySettlement(withPique, prices, LAUNDRY, 2026, 10)
    expect(s.lines.find((l) => l.itemTypeId === PIQUE)).toEqual({
      itemTypeId: PIQUE,
      qty: 4,
      stainedQty: 0,
      amountMinor: null,
      unpricedQty: 4
    })
    expect(s.totalAmountMinor).toBeNull()
    expect(s.unpricedQty).toBe(4)
    expect(withInvoice(s, 201_500)).toMatchObject({ differenceMinor: null, matches: null })
  })

  it('fişte fiyat yazan çamaşırhanede fiş fiyatı tablo yerine kullanılır', () => {
    const slips = [delivery('2026-10-07', 'in', [item(SHEET, 10, 0, 2800), item(TOWEL, 10)])]
    const s = laundrySettlement(slips, prices, LAUNDRY, 2026, 10)
    expect(s.lines.map((l) => l.amountMinor)).toEqual([28_000, 15_000])
    expect(s.totalAmountMinor).toBe(43_000)
  })

  it('fiyat tablosu olmayan çamaşırhanede fiş fiyatı otelin para birimiyle hesaplanır', () => {
    const slips = [delivery('2026-10-07', 'in', [item(SHEET, 10, 1, 2000)], OTHER)]
    expect(laundrySettlement(slips, prices, OTHER, 2026, 10, { currency: 'TRY' }).totalAmountMinor).toBe(
      20_000
    )
    expect(() => laundrySettlement(slips, prices, OTHER, 2026, 10)).toThrow(RangeError)
  })

  it('teslimat yoksa toplamlar sıfırdır; farklı para birimli fiyat hata verir', () => {
    const empty = laundrySettlement([], prices, LAUNDRY, 2026, 12)
    expect(empty).toMatchObject({ lines: [], totalQty: 0, totalAmountMinor: 0, deliveryCount: 0 })
    const eur = [price(SHEET, '2026-01-01', 300, 'EUR'), price(TOWEL, '2026-01-01', 1500)]
    const slips = [delivery('2026-10-07', 'in', [item(SHEET, 1), item(TOWEL, 1)])]
    expect(() => laundrySettlement(slips, eur, LAUNDRY, 2026, 10)).toThrow(TypeError)
  })
})

describe('Çamaşırhanede bekleyen / eksik (giden − gelen)', () => {
  const deliveries: LaundryDelivery[] = [
    delivery('2026-10-01', 'out', [item(SHEET, 30), item(TOWEL, 20)]),
    delivery('2026-10-02', 'in', [item(SHEET, 28), item(TOWEL, 20)]),
    delivery('2026-10-02', 'out', [item(SHEET, 25)]),
    delivery('2026-10-03', 'in', [item(SHEET, 20)]),
    delivery('2026-10-09', 'out', [item(SHEET, 100)]),
    delivery('2026-10-03', 'out', [item(SHEET, 100)], OTHER)
  ]

  it('tür bazında giden − gelen bekleyen sayısını ve en eski açık teslimin tarihini verir', () => {
    const o = laundryOutstanding(deliveries, LAUNDRY, d('2026-10-05'))
    expect(o.lines).toEqual([
      // 55 out, 48 in → 7 pending; the 30 from 1 October came back, 7 of the 25 from 2 October did not.
      {
        itemTypeId: SHEET,
        openingQty: 0,
        outQty: 55,
        inQty: 48,
        pendingQty: 7,
        openingPendingQty: 0,
        oldestOpenSince: '2026-10-02',
        daysOpen: 3
      },
      {
        itemTypeId: TOWEL,
        openingQty: 0,
        outQty: 20,
        inQty: 20,
        pendingQty: 0,
        openingPendingQty: 0,
        oldestOpenSince: null,
        daysOpen: null
      }
    ])
    expect(o.totalPendingQty).toBe(7)
  })

  it('başlangıç devri bekleyene eklenir ve gelenler önce devri kapatır', () => {
    const o = laundryOutstanding(deliveries, LAUNDRY, d('2026-10-05'), { [SHEET]: 5, [PIQUE]: 3 })
    const sheet = o.lines.find((l) => l.itemTypeId === SHEET)
    expect(sheet).toMatchObject({ pendingQty: 12, openingPendingQty: 0, oldestOpenSince: '2026-10-02' })
    expect(o.lines.find((l) => l.itemTypeId === PIQUE)).toMatchObject({
      pendingQty: 3,
      openingPendingQty: 3,
      oldestOpenSince: null
    })
    const bigOpening = laundryOutstanding(deliveries, LAUNDRY, d('2026-10-05'), { [SHEET]: 50 })
    expect(bigOpening.lines.find((l) => l.itemTypeId === SHEET)).toMatchObject({
      pendingQty: 57,
      openingPendingQty: 2,
      oldestOpenSince: '2026-10-01',
      daysOpen: 4
    })
  })

  it('tarihten sonraki teslimatlar sayılmaz; fazla gelen negatif bekleyen olur', () => {
    const later = laundryOutstanding(deliveries, LAUNDRY, d('2026-10-10'))
    expect(later.lines.find((l) => l.itemTypeId === SHEET)).toMatchObject({
      pendingQty: 107,
      oldestOpenSince: '2026-10-02'
    })
    const extra = laundryOutstanding(
      [delivery('2026-10-01', 'in', [item(TOWEL, 4)])],
      LAUNDRY,
      d('2026-10-05')
    )
    expect(extra.lines).toEqual([
      expect.objectContaining({ itemTypeId: TOWEL, pendingQty: -4, oldestOpenSince: null, daysOpen: null })
    ])
  })
})
