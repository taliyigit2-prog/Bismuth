import { afterEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { depsOf, roleCtx, testClock } from '../../../tests/factories/ctx'
import { seededDatabase } from '../../../tests/factories/db'
import type { DatabaseHandle } from '../db/client'
import { expenseSections, productCategories, products } from '../db/schema'
import { createCurrencyService } from './currency-service'
import { createExpensesService, insertExpenseTx } from './expenses-service'
import { createPaymentsService } from './payments-service'

const owner = roleCtx('owner')
const reception = roleCtx('reception')
let handle: DatabaseHandle
afterEach(() => handle?.close())

async function setup() {
  handle = await seededDatabase()
  const clock = testClock('2026-10-01T09:00:00.000Z')
  const deps = depsOf(handle, clock)
  const exp = createExpensesService(deps)
  const fx = createCurrencyService(deps)
  const general = handle.db.select().from(expenseSections).where(eq(expenseSections.code, 'general')).get()!
    .id
  const category = handle.db.select().from(productCategories).get()!.id
  const product = (name: string) => {
    const id = `p-${name}`
    handle.db
      .insert(products)
      .values({
        id,
        name,
        nameNormalized: name.toLowerCase(),
        categoryId: category,
        unit: 'piece',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z'
      })
      .run()
    return id
  }
  return { clock, exp, fx, general, product, deps }
}

describe('gider kaydı (G-66, G-71, S-32)', () => {
  it('kur, giderin yazıldığı dakikada donar; yalnız tutar veya birim değişince yeniden alınır', async () => {
    const { exp, fx, clock, general } = await setup()
    fx.recordRate(owner, { base: 'EUR', quote: 'TRY', midRateMicro: 50_000_000, source: 'hotel' })
    clock.advance(1)
    const e = exp.createExpense(reception, {
      date: '2026-10-01',
      sectionId: general,
      amountMinor: 10_000,
      currency: 'EUR',
      description: 'Yedek parça'
    })
    expect(e).toMatchObject({
      amountBaseMinor: 500_000,
      fxRateToBase: 50_000_000,
      fxSource: 'hotel',
      fxRateObservedAt: '2026-10-01T09:00:00.000Z'
    })

    clock.advance(60)
    fx.recordRate(owner, { base: 'EUR', quote: 'TRY', midRateMicro: 52_000_000, source: 'hotel' })
    clock.advance(1)
    const renamed = exp.updateExpense(reception, e.id, { description: 'Klima yedek parça' })
    expect(renamed).toMatchObject({
      amountBaseMinor: 500_000,
      fxRateAt: e.fxRateAt,
      descriptionKey: 'klima yedek parca'
    })
    const repriced = exp.updateExpense(reception, e.id, { amountMinor: 20_000 })
    expect(repriced).toMatchObject({
      amountBaseMinor: 1_040_000,
      fxRateToBase: 52_000_000,
      fxRateObservedAt: '2026-10-01T10:01:00.000Z'
    })
    expect(repriced.fxRateAt! > e.fxRateAt!).toBe(true)
  })

  it('kur bilinmiyorsa gider yine kaydedilir; TL karşılığı boş kalır', async () => {
    const { exp, general } = await setup()
    const e = exp.createExpense(owner, {
      date: '2026-10-01',
      sectionId: general,
      amountMinor: 5_000,
      currency: 'GBP',
      description: 'Kitap'
    })
    expect(e).toMatchObject({ amountBaseMinor: null, fxRateToBase: null })
  })

  it('ürün satırları tutarı aşamaz; gönderilen satırlar eskilerin yerine geçer', async () => {
    const { exp, general, product } = await setup()
    const soap = product('Sabun')
    const towel = product('Havlu')
    expect(() =>
      exp.createExpense(owner, {
        date: '2026-10-01',
        sectionId: general,
        amountMinor: 10_000,
        currency: 'TRY',
        description: 'Tedarik',
        items: [{ productId: soap, qtyMilli: 3_000, unitPriceMinor: 4_000 }]
      })
    ).toThrow(/errors.expenseItemsExceedAmount/)
    const e = exp.createExpense(owner, {
      date: '2026-10-01',
      sectionId: general,
      amountMinor: 20_000,
      currency: 'TRY',
      description: 'Tedarik',
      items: [
        { productId: soap, qtyMilli: 1_500, unitPriceMinor: 4_000 },
        { productId: towel, qtyMilli: 2_000, unitPriceMinor: 5_000 }
      ]
    })
    expect(e.items.map((i) => i.amountMinor)).toEqual([6_000, 10_000])
    const after = exp.updateExpense(owner, e.id, {
      items: [{ productId: towel, qtyMilli: 4_000, unitPriceMinor: 5_000 }]
    })
    expect(after.items.map((i) => [i.productId, i.amountMinor])).toEqual([[towel, 20_000]])
    expect(() => exp.updateExpense(owner, e.id, { currency: 'EUR' })).toThrow(/errors.validation/)
    expect(() =>
      exp.createExpense(owner, {
        date: '2026-10-01',
        sectionId: general,
        amountMinor: 1,
        currency: 'TRY',
        description: 'x',
        items: [{ productId: 'yok', qtyMilli: 1, unitPriceMinor: 0 }]
      })
    ).toThrow(/NOT_FOUND/)
  })

  it('açıklama önerisi en çok kullanılan yazımı, görünen bölümlerden ve iptal edilmeyenlerden verir', async () => {
    const { exp, general, clock } = await setup()
    const add = (description: string) => {
      clock.advance(1)
      return exp.createExpense(owner, {
        date: '2026-10-01',
        sectionId: general,
        amountMinor: 1_000,
        currency: 'TRY',
        description
      })
    }
    add('Deniz maaş')
    add('deniz  MAAŞ')
    add('Elektrik faturası')
    add('Su faturası')
    const voided = add('Deniz avans')
    exp.voidExpense(owner, voided.id, 'yanlış')
    expect(exp.suggestDescriptions(reception, 'den')).toEqual([
      { key: 'deniz maas', description: 'deniz  MAAŞ', count: 2 }
    ])
    expect(exp.suggestDescriptions(reception, 'fatura').map((s) => s.key)).toEqual([
      'elektrik faturasi',
      'su faturasi'
    ])
    expect(exp.suggestDescriptions(reception, '', 2)).toHaveLength(2)
  })

  it('personel ve çamaşırhane giderleri burada değiştirilemez; iptal edilen gider yeniden düzenlenemez', async () => {
    const { exp, general, deps } = await setup()
    const staff = deps.db.transaction((tx) =>
      insertExpenseTx(tx, owner, new Date('2026-10-01T09:00:00.000Z'), {
        date: '2026-10-01',
        sectionId: general,
        amountMinor: 100_000,
        currency: 'TRY',
        description: 'Deniz avans',
        kind: 'staff',
        paidFromDrawer: true
      })
    )
    expect(() => exp.updateExpense(owner, staff.id, { description: 'x' })).toThrow(
      /errors.expenseManagedElsewhere/
    )
    expect(() => exp.voidExpense(owner, staff.id, 'x')).toThrow(/errors.expenseManagedElsewhere/)
    const e = exp.createExpense(owner, {
      date: '2026-10-01',
      sectionId: general,
      amountMinor: 1_000,
      currency: 'TRY',
      description: 'Çay'
    })
    expect(exp.voidExpense(owner, e.id, 'mükerrer')).toMatchObject({ voidReason: 'mükerrer' })
    expect(() => exp.updateExpense(owner, e.id, { amountMinor: 2 })).toThrow(/errors.expenseVoided/)
    expect(exp.getExpense(owner, e.id).voidedAt).not.toBeNull()
    expect(
      exp.listExpenses(owner, { from: '2026-10-01', to: '2026-10-01', includeVoided: true }).map((x) => x.id)
    ).toContain(e.id)
  })

  it('kasa tesliminde kapatılmış (x) gider değiştirilemez ve iptal edilemez; teslim geri alınınca olur', async () => {
    const { exp, general, deps } = await setup()
    const e = exp.createExpense(owner, {
      date: '2026-10-01',
      sectionId: general,
      amountMinor: 5_000,
      currency: 'TRY',
      description: 'Çay',
      paidFromDrawer: true
    })
    const pay = createPaymentsService(deps)
    const h = pay.handover(owner, { upToDate: '2026-10-01' })
    expect(h.expenses).toBe(1)
    expect(() => exp.updateExpense(owner, e.id, { description: 'Kahve' })).toThrow(/errors.expenseSettled/)
    expect(() => exp.voidExpense(owner, e.id, 'mükerrer')).toThrow(/errors.expenseSettled/)
    pay.revertHandover(owner, h.id, 'yanlış sayım')
    expect(exp.updateExpense(owner, e.id, { description: 'Kahve' }).description).toBe('Kahve')
  })

  it('yetkisiz roller gider göremez ve yazamaz; yönetici gideri yalnız sahibe açıktır', async () => {
    const { exp, general } = await setup()
    const ownerSection = handle.db
      .select()
      .from(expenseSections)
      .where(eq(expenseSections.code, 'owner'))
      .get()!.id
    const secret = exp.createExpense(owner, {
      date: '2026-10-01',
      sectionId: ownerSection,
      amountMinor: 1_000,
      currency: 'TRY',
      description: 'Kira'
    })
    expect(() => exp.getExpense(roleCtx('manager'), secret.id)).toThrow(/PERMISSION_DENIED/)
    expect(() => exp.listExpenses(roleCtx('housekeeping'), { from: '2026-10-01', to: '2026-10-02' })).toThrow(
      /PERMISSION_DENIED/
    )
    expect(() =>
      exp.createExpense(roleCtx('employee'), {
        date: '2026-10-01',
        sectionId: general,
        amountMinor: 1,
        currency: 'TRY',
        description: 'x'
      })
    ).toThrow(/PERMISSION_DENIED/)
    expect(() => exp.updateExpense(roleCtx('manager'), secret.id, { description: 'x' })).toThrow(
      /PERMISSION_DENIED/
    )
  })
})
