// Faz 12 acceptance flows: the Munzur delivery slip (40 × 60 = 2.400, then 65 → "+%8,3 zam"), a voided purchase
// leaving the price history, the laundry's example slip × 10 with a mid-month price rise and the invoice
// difference, out/in pending with the "more came back" warning (§6.13, K-28, K-35, S-74, S-95).
import { afterEach, describe, expect, it } from 'vitest'
import { and, eq, isNull } from 'drizzle-orm'
import { defaultPermissions } from '@shared/permissions'
import { depsOf, roleCtx, testClock } from '../../../tests/factories/ctx'
import { seededDatabase } from '../../../tests/factories/db'
import type { DatabaseHandle } from '../db/client'
import { expenseItems, expenses, expenseSections, laundryItemTypes, productCategories } from '../db/schema'
import { createContactsService } from './contacts-service'
import { ctxFromPermissions } from './context'
import { createLaundryService } from './laundry-service'
import { createSupplyService } from './supply-service'

const owner = roleCtx('owner')
const reception = roleCtx('reception')
let handle: DatabaseHandle
afterEach(() => handle?.close())

async function setup() {
  handle = await seededDatabase()
  const clock = testClock('2026-10-04T09:00:00.000Z')
  const deps = depsOf(handle, clock)
  const general = handle.db.select().from(expenseSections).where(eq(expenseSections.code, 'general')).get()!
    .id
  return { clock, deps, general }
}

describe('tedarik: alım = tek gider kaydı (S-74, K-35)', () => {
  async function munzur() {
    const ctx = await setup()
    const supply = createSupplyService(ctx.deps)
    const supplier = createContactsService(ctx.deps).create(reception, {
      name: 'Munzur Su Bayii',
      category: 'supplier'
    })
    const drinks = handle.db
      .select()
      .from(productCategories)
      .where(eq(productCategories.code, 'drinks'))
      .get()!.id
    const water = supply.createProduct(reception, {
      name: 'Munzur 0,5 L',
      categoryId: drinks,
      unit: 'piece',
      supplierContactId: supplier.id
    })
    const buy = (date: string, unitPriceMinor: number, qty = 40) => {
      ctx.clock.advance(5)
      return supply.recordPurchase(reception, {
        date,
        sectionId: ctx.general,
        amountMinor: qty * unitPriceMinor,
        currency: 'TRY',
        description: 'Munzur Su Bayii',
        vendorContactId: supplier.id,
        items: [{ productId: water.id, qtyMilli: qty * 1000, unitPriceMinor }]
      })
    }
    return { ...ctx, supply, supplier, water, buy }
  }

  it('örnek fiş 40 × 60 = 2.400 tek gider satırıdır; ikinci alımda 65 TL "+%8,3 zam" olur', async () => {
    const { supply, water, buy, supplier } = await munzur()
    const first = buy('2026-09-20', 6_000)
    expect(first).toMatchObject({ amountMinor: 240_000, kind: 'manual', vendorContactId: supplier.id })
    expect(handle.db.select().from(expenses).all()).toHaveLength(1)
    expect(handle.db.select().from(expenseItems).all()).toEqual([
      expect.objectContaining({
        productId: water.id,
        qtyMilli: 40_000,
        unitPriceMinor: 6_000,
        amountMinor: 240_000
      })
    ])
    const [afterFirst] = supply.overview(reception, { year: 2026, month: 9 })
    expect(afterFirst).toMatchObject({
      priceChange: null,
      lastPurchase: { date: '2026-09-20', unitPriceMinor: 6_000 },
      supplierName: 'Munzur Su Bayii',
      thisMonth: { purchaseCount: 1, qty: 40_000, totals: [{ amountMinor: 240_000, currency: 'TRY' }] }
    })

    buy('2026-10-02', 6_500)
    const [view] = supply.overview(reception, { year: 2026, month: 10 })
    expect(view?.priceChange).toMatchObject({
      previousUnitMinor: 6_000,
      lastUnitMinor: 6_500,
      diffMinor: 500,
      basisPoints: 833,
      isIncrease: true
    })
    expect(view?.lastMonth.totals).toEqual([{ amountMinor: 240_000, currency: 'TRY' }])
    expect(view?.thisMonth.totals).toEqual([{ amountMinor: 260_000, currency: 'TRY' }])
    expect(supply.productHistory(reception, water.id).map((l) => [l.date, l.unitPriceMinor])).toEqual([
      ['2026-09-20', 6_000],
      ['2026-10-02', 6_500]
    ])
    expect(supply.productHistory(reception, water.id, '2026-10-01')).toHaveLength(1)
  })

  it('gider iptal edilince ürün satırları fiyat geçmişinden ve aylık toplamdan düşer', async () => {
    const { supply, water, buy } = await munzur()
    buy('2026-09-20', 6_000)
    const second = buy('2026-10-02', 6_500)
    expect(() => supply.voidPurchase(reception, second.id, '')).toThrow(/VALIDATION/)
    supply.voidPurchase(reception, second.id, 'fiş iki kez girildi')
    const [view] = supply.overview(reception, { year: 2026, month: 10 })
    expect(view?.priceChange).toBeNull()
    expect(view?.lastPurchase?.unitPriceMinor).toBe(6_000)
    expect(view?.thisMonth).toMatchObject({ purchaseCount: 0, qty: 0, totals: [] })
    expect(supply.productHistory(reception, water.id)).toHaveLength(1)
    expect(supply.monthSummary(reception, 2026, 10).purchaseCount).toBe(0)
    expect(supply.purchases(reception, { from: '2026-10-01', to: '2026-10-31' })).toEqual([])
    expect(
      supply.purchases(reception, { from: '2026-10-01', to: '2026-10-31', includeVoided: true })[0]
    ).toMatchObject({ id: second.id, voidReason: 'fiş iki kez girildi' })
  })

  it('aylık özet: ürün bazında adet ve tutar, tedarikçi bazında toplam', async () => {
    const { supply, water, buy, supplier, general, deps } = await munzur()
    buy('2026-10-01', 6_500, 40)
    buy('2026-10-03', 6_500, 20)
    const cleaning = handle.db
      .select()
      .from(productCategories)
      .where(eq(productCategories.code, 'cleaning'))
      .get()!.id
    const soap = supply.createProduct(owner, { name: 'Sıvı sabun 5 L', categoryId: cleaning, unit: 'piece' })
    supply.recordPurchase(owner, {
      date: '2026-10-02',
      sectionId: general,
      // The slip has a delivery fee besides the product line: the expense is more than its lines.
      amountMinor: 50_000,
      currency: 'TRY',
      description: 'Market',
      items: [{ productId: soap.id, qtyMilli: 2_000, unitPriceMinor: 22_500 }]
    })
    const summary = supply.monthSummary(reception, 2026, 10)
    expect(summary.purchaseCount).toBe(3)
    expect(summary.totals).toEqual([{ amountMinor: 260_000 + 130_000 + 50_000, currency: 'TRY' }])
    expect(
      summary.byProduct.map((p) => [p.productId, p.qty, p.purchaseCount, p.totals[0]?.amountMinor])
    ).toEqual([
      [water.id, 60_000, 2, 390_000],
      [soap.id, 2_000, 1, 45_000]
    ])
    expect(
      summary.bySupplier.map((s) => [s.contactId, s.name, s.purchaseCount, s.totals[0]?.amountMinor])
    ).toEqual([
      [supplier.id, 'Munzur Su Bayii', 2, 390_000],
      [null, null, 1, 50_000]
    ])
    expect(
      createSupplyService(deps).purchases(reception, { from: '2026-10-01', to: '2026-10-31' })[0]
    ).toMatchObject({
      date: '2026-10-03',
      vendorName: 'Munzur Su Bayii'
    })
  })

  it('ürün satırı olmayan alım kaydedilmez; tedarik yetkisi olmayan alım giremez', async () => {
    const { supply, general } = await munzur()
    const input = {
      date: '2026-10-02',
      sectionId: general,
      amountMinor: 1_000,
      currency: 'TRY',
      description: 'Market',
      items: []
    }
    expect(() => supply.recordPurchase(owner, input)).toThrow(/VALIDATION/)
    expect(() => supply.recordPurchase(roleCtx('housekeeping'), input)).toThrow(/PERMISSION_DENIED/)
  })

  it('elle yazılan satır tutarı aynen saklanır: 2,75 kg = 1.000 TL, fiş toplamı 1.000 TL (P10fix #8)', async () => {
    const { supply, general, water } = await munzur()
    // The screen sends the unit price behind the typed amount (363,64) and the amount itself.
    const e = supply.recordPurchase(owner, {
      date: '2026-10-05',
      sectionId: general,
      amountMinor: 100_000,
      currency: 'TRY',
      description: 'Market',
      items: [{ productId: water.id, qtyMilli: 2_750, unitPriceMinor: 36_364, amountMinor: 100_000 }]
    })
    expect(e.amountMinor).toBe(100_000)
    const lines = handle.db.select().from(expenseItems).where(eq(expenseItems.expenseId, e.id)).all()
    expect(lines.map((l) => [l.qtyMilli, l.unitPriceMinor, l.amountMinor])).toEqual([
      [2_750, 36_364, 100_000]
    ])
    // Without a typed amount the line is still unit × quantity (and may not exceed the slip's total).
    expect(() =>
      supply.recordPurchase(owner, {
        date: '2026-10-05',
        sectionId: general,
        amountMinor: 100_000,
        currency: 'TRY',
        description: 'Market',
        items: [{ productId: water.id, qtyMilli: 2_750, unitPriceMinor: 36_364 }]
      })
    ).toThrow(/VALIDATION/)
  })
})

describe('çamaşırhane: örnek temiz fişi, ay ortası zam, fatura farkı (§6.13, K-28)', () => {
  async function laundrySetup() {
    const ctx = await setup()
    const laundry = createLaundryService(ctx.deps)
    const contact = createContactsService(ctx.deps).create(owner, {
      name: 'Örnek Çamaşırhane',
      category: 'laundry'
    })
    const type = (code: string) =>
      handle.db.select().from(laundryItemTypes).where(eq(laundryItemTypes.code, code)).get()!.id
    const t = {
      sheet: type('sheet'),
      duvet: type('duvet_cover'),
      pillow: type('pillowcase'),
      big: type('bath_towel'),
      small: type('hand_towel'),
      foot: type('bath_mat')
    }
    const price = (itemTypeId: string, validFrom: string, unitPriceMinor: number) =>
      laundry.setPrice(owner, { contactId: contact.id, itemTypeId, validFrom, unitPriceMinor })
    price(t.sheet, '2026-09-01', 1_500)
    price(t.duvet, '2026-09-01', 2_500)
    price(t.pillow, '2026-09-01', 800)
    price(t.big, '2026-09-01', 1_200)
    price(t.small, '2026-09-01', 600)
    price(t.foot, '2026-09-01', 700)
    return { ...ctx, laundry, contact, t, price }
  }

  it('10 temiz fişi sonrası tür toplamları, lekeli toplamı ve geçerlilik tarihli fiyatla tutar doğru', async () => {
    const { laundry, contact, t, price } = await laundrySetup()
    // Ay ortası zam: çarşaf 16 Eylül'den 16,50 TL.
    price(t.sheet, '2026-09-16', 1_650)
    // The example "Temiz Fişi": Çarşaf 17, Nevresim 11, Yastık kılıfı 27, Büyük havlu 36, Küçük havlu 5, Ayak 18.
    const slip = (date: string, n: number) =>
      laundry.recordDelivery(reception, {
        date,
        direction: 'in',
        contactId: contact.id,
        slipNo: `RC107${40 + n}`,
        items: [
          { itemTypeId: t.sheet, qty: 17, stainedQty: 1 },
          { itemTypeId: t.duvet, qty: 11 },
          { itemTypeId: t.pillow, qty: 27 },
          { itemTypeId: t.big, qty: 36, stainedQty: 2 },
          { itemTypeId: t.small, qty: 5 },
          { itemTypeId: t.foot, qty: 18 }
        ]
      })
    const days = ['02', '05', '08', '11', '14', '17', '20', '23', '26', '29']
    days.forEach((d, i) => slip(`2026-09-${d}`, i))
    const sept = laundry.month(reception, contact.id, 2026, 9)
    expect(sept.deliveryCount).toBe(10)
    expect(Object.fromEntries(sept.lines.map((l) => [l.itemTypeId, l.qty]))).toEqual({
      [t.sheet]: 170,
      [t.duvet]: 110,
      [t.pillow]: 270,
      [t.big]: 360,
      [t.small]: 50,
      [t.foot]: 180
    })
    expect(sept.totalQty).toBe(1_140)
    expect(sept.totalStainedQty).toBe(30)
    // Çarşaf: 5 fiş × 17 × 15,00 + 5 fiş × 17 × 16,50 = 1.275 + 1.402,50.
    expect(sept.lines.find((l) => l.itemTypeId === t.sheet)?.amountMinor).toBe(127_500 + 140_250)
    expect(sept.totalAmountMinor).toBe(267_750 + 275_000 + 216_000 + 432_000 + 30_000 + 126_000)
    expect(sept.settled).toBeNull()

    // The laundry's invoice: 13.500 TL → 32,50 TL more than the slips; recorded first without paying.
    const checked = laundry.settle(reception, {
      contactId: contact.id,
      year: 2026,
      month: 9,
      invoicedTotalMinor: 1_350_000,
      paid: false
    })
    expect(checked).toMatchObject({ differenceMinor: 3_250, matches: false })
    expect(checked.settled).toMatchObject({ invoicedTotalMinor: 1_350_000, expenseId: null })
    expect(handle.db.select().from(expenses).all()).toHaveLength(0)

    // "Ödendi" → one expense row in the ledger, linked to the settlement.
    const paid = laundry.settle(reception, {
      contactId: contact.id,
      year: 2026,
      month: 9,
      invoicedTotalMinor: 1_350_000
    })
    const rows = handle.db.select().from(expenses).where(isNull(expenses.voidedAt)).all()
    expect(rows).toEqual([
      expect.objectContaining({
        amountMinor: 1_350_000,
        kind: 'laundry',
        date: '2026-09-30',
        laundrySettlementId: paid.settled!.id
      })
    ])
    expect(paid.settled?.expenseId).toBe(rows[0]!.id)

    const trend = laundry.trend(reception, contact.id, '2026-10-04', 3)
    expect(trend.map((p) => [p.month, p.qty, p.stainedQty, p.amountMinor, p.invoicedTotalMinor])).toEqual([
      [8, 0, 0, 0, null],
      [9, 1_140, 30, 1_346_750, 1_350_000],
      [10, 0, 0, 0, null]
    ])
  })

  it('ödenmemiş fatura için gider yetkisi gerekmez; ödendi işareti gider yetkisi ister', async () => {
    const { laundry, contact } = await laundrySetup()
    const input = { contactId: contact.id, year: 2026, month: 9, invoicedTotalMinor: 10_000 }
    const noExpenses = ctxFromPermissions('user-laundry', 'test-device', 'ipc', {
      ...defaultPermissions('reception'),
      expenses: 'none'
    })
    expect(() => laundry.settle(noExpenses, { ...input, paid: false })).not.toThrow()
    expect(() => laundry.settle(noExpenses, input)).toThrow(/PERMISSION_DENIED/)
  })

  it('3 gün giden, 2 gün gelen sonrası tür bazında bekleyen doğru; fazla gelen eksi bekleyen olur', async () => {
    const { laundry, contact, t } = await laundrySetup()
    const move = (date: string, direction: 'out' | 'in', sheet: number, big: number) =>
      laundry.recordDelivery(reception, {
        date,
        direction,
        contactId: contact.id,
        items: [
          { itemTypeId: t.sheet, qty: sheet },
          { itemTypeId: t.big, qty: big }
        ]
      })
    move('2026-10-01', 'out', 20, 30)
    move('2026-10-02', 'out', 18, 30)
    move('2026-10-03', 'out', 22, 25)
    move('2026-10-02', 'in', 20, 30)
    move('2026-10-03', 'in', 16, 30)
    const pending = laundry.outstanding(reception, contact.id, '2026-10-03')
    expect(
      pending.lines.map((l) => [l.itemTypeId, l.outQty, l.inQty, l.pendingQty, l.oldestOpenSince])
    ).toEqual(
      [
        [t.sheet, 60, 36, 24, '2026-10-02'],
        [t.big, 85, 60, 25, '2026-10-03']
      ].sort((a, b) => String(a[0]).localeCompare(String(b[0])))
    )
    // The laundry brings back more towels than were sent: negative pending is the warning.
    move('2026-10-04', 'in', 24, 40)
    const after = laundry.outstanding(reception, contact.id, '2026-10-04')
    expect(after.lines.find((l) => l.itemTypeId === t.big)?.pendingQty).toBe(-15)
    expect(after.lines.find((l) => l.itemTypeId === t.sheet)).toMatchObject({
      pendingQty: 0,
      oldestOpenSince: null
    })
    expect(
      laundry.listDeliveries(reception, { contactId: contact.id, from: '2026-10-01', to: '2026-10-04' })
    ).toHaveLength(6)
  })
})

describe('veri silinmez', () => {
  it('alım iptali gider satırını silmez, voided_at ile işaretler', async () => {
    const { deps, general } = await setup()
    const supply = createSupplyService(deps)
    const cat = handle.db.select().from(productCategories).get()!.id
    const p = supply.createProduct(owner, { name: 'Peçete', categoryId: cat, unit: 'pack' })
    const e = supply.recordPurchase(owner, {
      date: '2026-10-01',
      sectionId: general,
      amountMinor: 3_000,
      currency: 'TRY',
      description: 'Market',
      items: [{ productId: p.id, qtyMilli: 1_000, unitPriceMinor: 3_000 }]
    })
    supply.voidPurchase(owner, e.id, 'yanlış')
    const row = handle.db
      .select()
      .from(expenses)
      .where(and(eq(expenses.id, e.id)))
      .get()
    expect(row?.voidedAt).not.toBeNull()
    expect(handle.db.select().from(expenseItems).where(eq(expenseItems.expenseId, e.id)).all()).toHaveLength(
      1
    )
  })
})
