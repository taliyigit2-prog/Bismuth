import { afterEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { depsOf, roleCtx, testClock } from '../../../tests/factories/ctx'
import { seededDatabase } from '../../../tests/factories/db'
import type { DatabaseHandle } from '../db/client'
import {
  auditLog,
  expenses,
  expenseSections,
  laundryItemTypes,
  productCategories,
  settings
} from '../db/schema'
import { createContactsService } from './contacts-service'
import { createExpensesService } from './expenses-service'
import { createLaundryService } from './laundry-service'
import { createSupplyService } from './supply-service'

const owner = roleCtx('owner')
const reception = roleCtx('reception')
let handle: DatabaseHandle
afterEach(() => handle?.close())

async function setup() {
  handle = await seededDatabase()
  const clock = testClock('2026-10-01T09:00:00.000Z')
  const deps = depsOf(handle, clock)
  const section = (code: string) =>
    handle.db.select().from(expenseSections).where(eq(expenseSections.code, code)).get()!.id
  return { clock, deps, section }
}

describe('tedarik: fiyat geçmişi ve zam uyarısı (§6.13, G-170)', () => {
  it('üç alışın ürün satırlarından son zam yüzdesi doğru; aylık tüketim toplanır', async () => {
    const { deps, section, clock } = await setup()
    const supply = createSupplyService(deps)
    const exp = createExpensesService(deps)
    const cleaning = handle.db.select().from(productCategories).get()!.id
    const detergent = supply.createProduct(reception, {
      name: 'Çamaşır deterjanı',
      categoryId: cleaning,
      unit: 'kg'
    })
    const buy = (date: string, qtyMilli: number, unitPriceMinor: number, sectionCode = 'general') => {
      clock.advance(1)
      return exp.createExpense(owner, {
        date,
        sectionId: section(sectionCode),
        amountMinor: Math.round((qtyMilli / 1000) * unitPriceMinor),
        currency: 'TRY',
        description: 'Market',
        items: [{ productId: detergent.id, qtyMilli, unitPriceMinor }]
      })
    }
    buy('2026-09-01', 5_000, 10_000)
    buy('2026-09-10', 2_500, 10_500)
    const last = buy('2026-09-20', 4_000, 12_600)
    const [view] = supply.listProducts(reception)
    expect(view?.priceChange).toMatchObject({
      previousUnitMinor: 10_500,
      lastUnitMinor: 12_600,
      diffMinor: 2_100,
      basisPoints: 2_000,
      isIncrease: true
    })
    expect(supply.priceHistory(reception, detergent.id).map((l) => l.unitPriceMinor)).toEqual([
      10_000, 10_500, 12_600
    ])
    expect(supply.monthlyConsumption(reception, detergent.id, 2026, 9)).toMatchObject({
      purchaseCount: 3,
      qty: 11_500,
      totals: [{ amountMinor: 50_000 + 26_250 + 50_400, currency: 'TRY' }]
    })
    exp.voidExpense(owner, last.id, 'yanlış fiş')
    expect(supply.listProducts(reception)[0]?.priceChange?.lastUnitMinor).toBe(10_500)
    // A purchase in the owner's hidden section never shows to reception (G-67).
    buy('2026-09-25', 1_000, 99_900, 'owner')
    expect(supply.priceHistory(reception, detergent.id)).toHaveLength(2)
    expect(supply.priceHistory(owner, detergent.id)).toHaveLength(3)
  })

  it('kategori ve ürün yönetimi; stok sayacı isteğe bağlı; yetkisiz rol göremez', async () => {
    const { deps } = await setup()
    const supply = createSupplyService(deps)
    const cat = supply.createCategory(owner, 'Kahvaltı')
    const seeded = supply.listCategories(reception).find((c) => c.code !== null)!
    expect(seeded.displayName?.tr).toBeTruthy()
    expect(supply.updateCategory(owner, seeded.id, { name: 'Temizlik ürünleri' })).toMatchObject({
      name: 'Temizlik ürünleri',
      displayName: null
    })
    const eggs = supply.createProduct(reception, {
      name: 'Yumurta',
      categoryId: cat.id,
      unit: 'piece',
      trackStock: true
    })
    expect(eggs.stockQtyMilli).toBe(0)
    expect(supply.updateProduct(reception, eggs.id, { stockQtyMilli: 30_000 }).stockQtyMilli).toBe(30_000)
    supply.updateProduct(reception, eggs.id, { active: false })
    expect(supply.listProducts(reception)).toEqual([])
    expect(supply.listProducts(reception, { includeInactive: true, q: 'yumurta' })).toHaveLength(1)
    supply.updateCategory(owner, cat.id, { active: false })
    expect(supply.listCategories(reception).map((c) => c.id)).not.toContain(cat.id)
    expect(() => supply.listProducts(roleCtx('housekeeping'))).toThrow(/PERMISSION_DENIED/)
    expect(() => supply.createProduct(reception, { name: 'x', categoryId: 'yok', unit: 'kg' })).toThrow(
      /NOT_FOUND/
    )
  })
})

describe('çamaşırhane: giden/gelen, bekleyen ve aylık mutabakat (§6.13, S-95, K-28)', () => {
  async function laundryMonth() {
    const ctx = await setup()
    const laundry = createLaundryService(ctx.deps)
    const contact = createContactsService(ctx.deps).create(owner, {
      name: 'Örnek Çamaşırhane',
      category: 'laundry'
    })
    const type = (code: string) =>
      handle.db.select().from(laundryItemTypes).where(eq(laundryItemTypes.code, code)).get()!.id
    const sheet = type('sheet')
    const towel = type('bath_towel')
    laundry.setPrice(owner, {
      contactId: contact.id,
      itemTypeId: sheet,
      validFrom: '2026-09-01',
      unitPriceMinor: 1_000
    })
    laundry.setPrice(owner, {
      contactId: contact.id,
      itemTypeId: sheet,
      validFrom: '2026-09-16',
      unitPriceMinor: 1_200
    })
    laundry.setPrice(owner, {
      contactId: contact.id,
      itemTypeId: towel,
      validFrom: '2026-09-01',
      unitPriceMinor: 500
    })
    const slip = (
      date: string,
      direction: 'out' | 'in',
      items: { itemTypeId: string; qty: number; stainedQty?: number; slipUnitPriceMinor?: number }[]
    ) => laundry.recordDelivery(reception, { date, direction, contactId: contact.id, items })
    slip('2026-09-01', 'out', [
      { itemTypeId: sheet, qty: 100 },
      { itemTypeId: towel, qty: 50 }
    ])
    slip('2026-09-03', 'in', [
      { itemTypeId: sheet, qty: 95, stainedQty: 5 },
      { itemTypeId: towel, qty: 50 }
    ])
    slip('2026-09-20', 'out', [{ itemTypeId: sheet, qty: 80 }])
    const inLate = slip('2026-09-22', 'in', [{ itemTypeId: sheet, qty: 70, slipUnitPriceMinor: 1_100 }])
    return { ...ctx, laundry, contact, sheet, towel, inLate }
  }

  it('ay mutabakatı: fiş fiyatı ya da o günün tarifesiyle 1.970 TL; fatura 2.000 → 30 TL fark', async () => {
    const { laundry, contact, inLate } = await laundryMonth()
    expect(inLate.items[0]?.amountMinor).toBe(77_000)
    const sept = laundry.month(reception, contact.id, 2026, 9)
    expect(sept).toMatchObject({
      deliveryCount: 2,
      totalQty: 215,
      totalStainedQty: 5,
      totalAmountMinor: 197_000
    })
    const settled = laundry.settle(owner, {
      contactId: contact.id,
      year: 2026,
      month: 9,
      invoicedTotalMinor: 200_000
    })
    expect(settled).toMatchObject({ differenceMinor: 3_000, matches: false })
    const expense = handle.db
      .select()
      .from(expenses)
      .where(eq(expenses.id, settled.settled!.expenseId!))
      .get()!
    expect(expense).toMatchObject({
      kind: 'laundry',
      date: '2026-09-30',
      amountMinor: 200_000,
      vendorContactId: contact.id,
      laundrySettlementId: settled.settled!.id
    })
    // The expense row and its audit row agree on the link and on when it was written (db rule 4).
    const created = handle.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityId, expense.id))
      .all()
      .find((a) => a.action === 'create')!
    expect(JSON.parse(created.afterJson!)).toMatchObject({
      laundrySettlementId: settled.settled!.id,
      updatedAt: expense.updatedAt
    })
    // The laundry corrects its invoice: the month is settled again and the first expense is voided.
    const again = laundry.settle(owner, {
      contactId: contact.id,
      year: 2026,
      month: 9,
      invoicedTotalMinor: 197_000
    })
    expect(again).toMatchObject({ differenceMinor: 0, matches: true })
    expect(
      handle.db.select().from(expenses).where(eq(expenses.id, expense.id)).get()?.voidedAt
    ).not.toBeNull()
    expect(laundry.month(reception, contact.id, 2026, 9).settled?.invoicedTotalMinor).toBe(197_000)
    expect(() =>
      laundry.settle(reception, { contactId: contact.id, year: 2026, month: 9, invoicedTotalMinor: 1 })
    ).not.toThrow()
  })

  it('ayın son günü kapatılmışsa mutabakat kilit yetkisi ve gerekçe ister (G-72)', async () => {
    const { laundry, contact } = await laundryMonth()
    handle.db
      .insert(settings)
      .values({ key: 'businessDay.closingEnabled', valueJson: 'true', updatedAt: '' })
      .run()
    handle.sqlite
      .prepare(
        "insert into business_days (date, status, created_at, updated_at) values ('2026-09-30', 'closed', '', '')"
      )
      .run()
    const input = { contactId: contact.id, year: 2026, month: 9, invoicedTotalMinor: 197_000 }
    expect(() => laundry.settle(reception, { ...input, dayClosedReason: 'geç gelen fatura' })).toThrow(
      /dayClosed/
    )
    expect(() => laundry.settle(owner, input)).toThrow(/dayClosed/)
    const done = laundry.settle(owner, { ...input, dayClosedReason: 'geç gelen fatura' })
    const row = handle.db.select().from(auditLog).where(eq(auditLog.entityId, done.settled!.id)).get()
    expect(row?.reason).toBe('geç gelen fatura')
  })

  it('bekleyen: giden − gelen; en eski açık giden tarih (FIFO); iptal edilen fiş sayılmaz', async () => {
    const { laundry, contact, sheet, towel, inLate } = await laundryMonth()
    const pending = laundry.outstanding(reception, contact.id, '2026-09-30')
    expect(pending.lines.find((l) => l.itemTypeId === sheet)).toMatchObject({
      outQty: 180,
      inQty: 165,
      pendingQty: 15,
      oldestOpenSince: '2026-09-20',
      daysOpen: 10
    })
    expect(pending.lines.find((l) => l.itemTypeId === towel)?.pendingQty).toBe(0)
    expect(() => laundry.voidDelivery(reception, inLate.id, '')).toThrow(/errors.reasonRequired/)
    laundry.voidDelivery(reception, inLate.id, 'yanlış fiş')
    expect(laundry.outstanding(reception, contact.id, '2026-09-30').totalPendingQty).toBe(85)
    expect(laundry.listDeliveries(reception, { from: '2026-09-01', to: '2026-09-30' })).toHaveLength(3)
    expect(laundry.listDeliveries(reception, { includeVoided: true })).toHaveLength(4)
  })

  it('tarife geçmişi tutulur; temizlik görür ama giremez; yeni çamaşır türü eklenir', async () => {
    const { laundry, contact, sheet } = await laundryMonth()
    expect(
      laundry
        .listPrices(reception, contact.id)
        .filter((p) => p.itemTypeId === sheet)
        .map((p) => p.unitPriceMinor)
    ).toEqual([1_200, 1_000])
    expect(laundry.listItemTypes(roleCtx('housekeeping')).length).toBeGreaterThan(10)
    expect(() =>
      laundry.recordDelivery(roleCtx('housekeeping'), {
        date: '2026-10-01',
        direction: 'out',
        contactId: contact.id,
        items: [{ itemTypeId: sheet, qty: 1 }]
      })
    ).toThrow(/PERMISSION_DENIED/)
    const custom = laundry.createItemType(reception, 'Masa örtüsü')
    expect(custom).toMatchObject({ name: 'Masa örtüsü', code: null, displayName: null })
    expect(() => laundry.createItemType(reception, ' ')).toThrow(/errors.validation/)
    expect(() =>
      laundry.settle(roleCtx('housekeeping'), {
        contactId: contact.id,
        year: 2026,
        month: 9,
        invoicedTotalMinor: 1
      })
    ).toThrow(/PERMISSION_DENIED/)
  })
})
