// Supplies (G-170, G-71, K-35, S-63; 03-mimari.md §6.13): product categories and products; a purchase is an
// expense with product lines (expenses-service), so price history, the price-rise badge and monthly
// consumption are read from those lines — only from expense sections the caller may see (G-67).
import { and, asc, eq, gte, inArray, isNull, lte, type SQL } from 'drizzle-orm'
import { expenseCreateSchema, type ExpenseCreateInput } from '@shared/contract/expenses'
import {
  productCategoryNameSchema,
  productInputSchema,
  productListSchema,
  productUpdateSchema,
  yearMonthSchema,
  type ProductInput,
  type ProductListInput,
  type ProductUpdate
} from '@shared/contract/supply'
import { addDays, localDate, type LocalDate } from '@shared/date'
import { monthRange } from '@shared/domain/local-datetime'
import { add, money, type Money } from '@shared/money'
import { normalizeName } from '@shared/domain/normalize'
import {
  monthlyConsumption,
  priceChange,
  priceHistory,
  type MonthlyConsumption,
  type PriceChange,
  type PurchaseLine
} from '@shared/domain/supply'
import { contacts, expenseItems, expenses, productCategories, products } from '../db/schema'
import type { I18nText } from '../db/schema/columns'
import type { Ctx } from './context'
import { createExpensesService, sectionAccess, type ExpenseView } from './expenses-service'
import {
  inTransaction,
  invalid,
  newId,
  notFound,
  parseInput,
  requirePermission,
  stamps,
  type ServiceDeps,
  type Tx
} from './kit'

export type ProductCategoryRow = typeof productCategories.$inferSelect
export type ProductRow = typeof products.$inferSelect

export interface ProductCategoryView extends ProductCategoryRow {
  displayName: I18nText | null
}

export interface ProductView extends ProductRow {
  /** The "zam" badge data (last vs previous purchase), null with fewer than two purchases. */
  priceChange: PriceChange | null
}

/** The product list of the supply screen: badge, last purchase and the month's quantity in one read. */
export interface ProductOverview extends ProductView {
  supplierName: string | null
  lastPurchase: { date: LocalDate; unitPriceMinor: number; currency: string } | null
  thisMonth: MonthlyConsumption
  lastMonth: MonthlyConsumption
}

/** One purchase line with the expense it belongs to (price history table, link to the ledger). */
export interface HistoryLine extends PurchaseLine {
  expenseId: string
  supplierName: string | null
}

export interface MonthSummary {
  year: number
  month: number
  /** Purchases (expenses with product lines) of the month. */
  purchaseCount: number
  /** Σ of those expenses, one entry per currency. */
  totals: Money[]
  byProduct: {
    productId: string
    name: string
    unit: ProductRow['unit']
    qty: number
    purchaseCount: number
    totals: Money[]
  }[]
  bySupplier: { contactId: string | null; name: string | null; purchaseCount: number; totals: Money[] }[]
}

/** A purchase as the supply screen lists it: the expense with its product lines and the supplier's name. */
export interface PurchaseView extends ExpenseView {
  vendorName: string | null
}

type Reader = Pick<Tx, 'select'>

/** Adds `m` into the per-currency list (sorted by currency code). */
function addTo(list: Money[], m: Money): Money[] {
  const i = list.findIndex((x) => x.currency === m.currency)
  if (i === -1) return [...list, m].sort((a, b) => (a.currency < b.currency ? -1 : 1))
  return list.map((x, j) => (j === i ? add(x, m) : x))
}

const previousMonth = (year: number, month: number) =>
  month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }

const collator = new Intl.Collator('tr')
const categoryView = (c: ProductCategoryRow): ProductCategoryView => ({
  ...c,
  displayName: c.name === null ? c.nameI18n : null
})

export function createSupplyService(deps: ServiceDeps) {
  const { db } = deps
  // A purchase is an expense (K-35, S-74): written and voided by the expenses service, nowhere else.
  const expensesService = createExpensesService(deps)

  const contactNames = (ids: readonly (string | null)[]): Map<string, string> => {
    const wanted = [...new Set(ids.filter((id): id is string => !!id))]
    if (!wanted.length) return new Map()
    return new Map(
      db
        .select({ id: contacts.id, name: contacts.name })
        .from(contacts)
        .where(inArray(contacts.id, wanted))
        .all()
        .map((c) => [c.id, c.name])
    )
  }

  const productOf = (tx: Reader, id: string): ProductRow => {
    const row = tx.select().from(products).where(eq(products.id, id)).get()
    if (!row) throw notFound('product', id)
    return row
  }

  const categoryOf = (tx: Reader, id: string): ProductCategoryRow => {
    const row = tx.select().from(productCategories).where(eq(productCategories.id, id)).get()
    if (!row) throw notFound('product_category', id)
    return row
  }

  const checkSupplier = (tx: Reader, id: string | null | undefined): void => {
    if (id && !tx.select({ id: contacts.id }).from(contacts).where(eq(contacts.id, id)).get())
      throw notFound('contact', id)
  }

  /** Purchase lines of visible, non-voided expenses (optionally of some products). */
  const purchaseLines = (ctx: Ctx, productIds?: readonly string[]): PurchaseLine[] => {
    const { viewIds } = sectionAccess(db, ctx)
    if (!viewIds.length || (productIds && !productIds.length)) return []
    return db
      .select({
        productId: expenseItems.productId,
        date: expenses.date,
        qty: expenseItems.qtyMilli,
        unitPriceMinor: expenseItems.unitPriceMinor,
        amountMinor: expenseItems.amountMinor,
        currency: expenses.currency
      })
      .from(expenseItems)
      .innerJoin(expenses, eq(expenses.id, expenseItems.expenseId))
      .where(
        and(
          isNull(expenses.voidedAt),
          inArray(expenses.sectionId, viewIds),
          productIds ? inArray(expenseItems.productId, [...productIds]) : undefined
        )
      )
      .orderBy(asc(expenses.date), asc(expenses.createdAt), asc(expenseItems.id))
      .all()
      .map((l) => ({ ...l, date: l.date as LocalDate }))
  }

  return {
    // ---- categories ----

    listCategories(ctx: Ctx, opts: { includeInactive?: boolean } = {}): ProductCategoryView[] {
      requirePermission(ctx, 'supplies', 'view')
      const q = db.select().from(productCategories)
      return (opts.includeInactive ? q : q.where(eq(productCategories.active, true)))
        .orderBy(asc(productCategories.sort), asc(productCategories.createdAt))
        .all()
        .map(categoryView)
    },

    createCategory(ctx: Ctx, name: string): ProductCategoryView {
      requirePermission(ctx, 'supplies', 'edit')
      const label = parseInput(productCategoryNameSchema, name)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const last = tx.select({ sort: productCategories.sort }).from(productCategories).all()
        const row: ProductCategoryRow = {
          id: newId(now),
          code: null,
          name: label,
          nameI18n: null,
          sort: Math.max(0, ...last.map((c) => c.sort)) + 1,
          active: true,
          ...stamps(now)
        }
        tx.insert(productCategories).values(row).run()
        audit({ entity: 'product_category', entityId: row.id, action: 'create', after: row })
        return categoryView(row)
      })
    },

    /** Rename (drops a seeded name's translations) or switch off; categories are never deleted. */
    updateCategory(
      ctx: Ctx,
      id: string,
      patch: { name?: string; active?: boolean; sort?: number }
    ): ProductCategoryView {
      requirePermission(ctx, 'supplies', 'edit')
      const name = patch.name === undefined ? undefined : parseInput(productCategoryNameSchema, patch.name)
      if (patch.sort !== undefined && !Number.isSafeInteger(patch.sort)) throw invalid('errors.validation')
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const before = categoryOf(tx, id)
        tx.update(productCategories)
          .set({
            ...(name !== undefined ? { name, nameI18n: null } : {}),
            ...(patch.active !== undefined ? { active: patch.active } : {}),
            ...(patch.sort !== undefined ? { sort: patch.sort } : {}),
            updatedAt: now.toISOString()
          })
          .where(eq(productCategories.id, id))
          .run()
        const after = categoryOf(tx, id)
        audit({ entity: 'product_category', entityId: id, action: 'update', before, after })
        return categoryView(after)
      })
    },

    // ---- products ----

    /** Products by name (Turkish order) with their price-rise badge. */
    listProducts(ctx: Ctx, input: ProductListInput = {}): ProductView[] {
      requirePermission(ctx, 'supplies', 'view')
      const q = parseInput(productListSchema, input)
      const where: (SQL | undefined)[] = [
        q.includeInactive ? undefined : eq(products.active, true),
        q.categoryId ? eq(products.categoryId, q.categoryId) : undefined
      ]
      const needle = q.q ? normalizeName(q.q) : ''
      const rows = db
        .select()
        .from(products)
        .where(and(...where))
        .all()
        .filter((p) => !needle || p.nameNormalized.includes(needle))
        .sort((a, b) => collator.compare(a.name, b.name))
      const lines = purchaseLines(
        ctx,
        rows.map((p) => p.id)
      )
      return rows.map((p) => ({ ...p, priceChange: priceChange(lines, p.id) }))
    },

    createProduct(ctx: Ctx, input: ProductInput): ProductRow {
      requirePermission(ctx, 'supplies', 'edit')
      const data = parseInput(productInputSchema, input)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        categoryOf(tx, data.categoryId)
        checkSupplier(tx, data.supplierContactId)
        const row: ProductRow = {
          id: newId(now),
          name: data.name,
          nameNormalized: normalizeName(data.name),
          categoryId: data.categoryId,
          supplierContactId: data.supplierContactId ?? null,
          unit: data.unit,
          trackStock: data.trackStock,
          stockQtyMilli: data.trackStock ? (data.stockQtyMilli ?? 0) : null,
          active: true,
          ...stamps(now)
        }
        tx.insert(products).values(row).run()
        audit({ entity: 'product', entityId: row.id, action: 'create', after: row })
        return row
      })
    },

    /** Also the optional stock counter (S-63): set the counted quantity; switching off keeps the history. */
    updateProduct(ctx: Ctx, id: string, patch: ProductUpdate): ProductRow {
      requirePermission(ctx, 'supplies', 'edit')
      const data = parseInput(productUpdateSchema, patch)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const before = productOf(tx, id)
        if (data.categoryId) categoryOf(tx, data.categoryId)
        checkSupplier(tx, data.supplierContactId)
        tx.update(products)
          .set({
            ...data,
            ...(data.name !== undefined ? { nameNormalized: normalizeName(data.name) } : {}),
            updatedAt: now.toISOString()
          })
          .where(eq(products.id, id))
          .run()
        const after = productOf(tx, id)
        audit({ entity: 'product', entityId: id, action: 'update', before, after })
        return after
      })
    },

    /**
     * The supply screen's product list: per product the "zam" badge, its last purchase, this and last month's
     * quantity and amount and the supplier's name (only from expense sections the caller may see).
     */
    overview(ctx: Ctx, input: { year: number; month: number; includeInactive?: boolean }): ProductOverview[] {
      requirePermission(ctx, 'supplies', 'view')
      const p = parseInput(yearMonthSchema, { year: input.year, month: input.month })
      const prev = previousMonth(p.year, p.month)
      const rows = db
        .select()
        .from(products)
        .where(input.includeInactive ? undefined : eq(products.active, true))
        .all()
        .sort((a, b) => collator.compare(a.name, b.name))
      const lines = purchaseLines(
        ctx,
        rows.map((r) => r.id)
      )
      const names = contactNames(rows.map((r) => r.supplierContactId))
      return rows.map((r) => {
        const last = priceHistory(lines, r.id).at(-1)
        return {
          ...r,
          priceChange: priceChange(lines, r.id),
          supplierName: r.supplierContactId ? (names.get(r.supplierContactId) ?? null) : null,
          lastPurchase: last
            ? { date: last.date, unitPriceMinor: last.unitPriceMinor, currency: last.currency }
            : null,
          thisMonth: monthlyConsumption(lines, r.id, p.year, p.month),
          lastMonth: monthlyConsumption(lines, r.id, prev.year, prev.month)
        }
      })
    },

    /**
     * Purchase lines of one product with their expense and supplier, oldest first; `since` limits it to the
     * chart's window (the last 12 months on the screen).
     */
    productHistory(ctx: Ctx, productId: string, since?: string): HistoryLine[] {
      requirePermission(ctx, 'supplies', 'view')
      productOf(db, productId)
      const from = since ? localDate(since) : null
      const { viewIds } = sectionAccess(db, ctx)
      if (!viewIds.length) return []
      const rows = db
        .select({
          productId: expenseItems.productId,
          date: expenses.date,
          qty: expenseItems.qtyMilli,
          unitPriceMinor: expenseItems.unitPriceMinor,
          amountMinor: expenseItems.amountMinor,
          currency: expenses.currency,
          expenseId: expenses.id,
          vendorContactId: expenses.vendorContactId
        })
        .from(expenseItems)
        .innerJoin(expenses, eq(expenses.id, expenseItems.expenseId))
        .where(
          and(
            eq(expenseItems.productId, productId),
            isNull(expenses.voidedAt),
            inArray(expenses.sectionId, viewIds),
            from ? gte(expenses.date, from) : undefined
          )
        )
        .orderBy(asc(expenses.date), asc(expenses.createdAt), asc(expenseItems.id))
        .all()
      const names = contactNames(rows.map((r) => r.vendorContactId))
      return rows.map(({ vendorContactId, ...l }) => ({
        ...l,
        date: l.date as LocalDate,
        supplierName: vendorContactId ? (names.get(vendorContactId) ?? null) : null
      }))
    },

    /** The month's purchases per product (quantity, amount) and per supplier (§6.13; "tedarik giderleri"). */
    monthSummary(ctx: Ctx, year: number, month: number): MonthSummary {
      requirePermission(ctx, 'supplies', 'view')
      const p = parseInput(yearMonthSchema, { year, month })
      const range = monthRange(p.year, p.month)
      const empty: MonthSummary = {
        year: p.year,
        month: p.month,
        purchaseCount: 0,
        totals: [],
        byProduct: [],
        bySupplier: []
      }
      const { viewIds } = sectionAccess(db, ctx)
      if (!viewIds.length) return empty
      const bought = db
        .select({
          id: expenses.id,
          amountMinor: expenses.amountMinor,
          currency: expenses.currency,
          vendorContactId: expenses.vendorContactId
        })
        .from(expenses)
        .where(
          and(
            isNull(expenses.voidedAt),
            inArray(expenses.sectionId, viewIds),
            gte(expenses.date, range.start),
            lte(expenses.date, addDays(range.end, -1))
          )
        )
        .all()
      if (!bought.length) return empty
      const lines = db
        .select()
        .from(expenseItems)
        .where(
          inArray(
            expenseItems.expenseId,
            bought.map((b) => b.id)
          )
        )
        .all()
      const purchases = bought.filter((b) => lines.some((l) => l.expenseId === b.id))
      if (!purchases.length) return empty
      const currencyOf = new Map(purchases.map((b) => [b.id, b.currency]))
      const productRows = new Map(
        db
          .select()
          .from(products)
          .where(inArray(products.id, [...new Set(lines.map((l) => l.productId))]))
          .all()
          .map((r) => [r.id, r])
      )
      const byProduct = new Map<string, MonthSummary['byProduct'][number] & { used: Set<string> }>()
      for (const l of lines) {
        const product = productRows.get(l.productId)
        const currency = currencyOf.get(l.expenseId)
        if (!product || !currency) continue
        const row = byProduct.get(l.productId) ?? {
          productId: l.productId,
          name: product.name,
          unit: product.unit,
          qty: 0,
          purchaseCount: 0,
          totals: [],
          used: new Set<string>()
        }
        row.qty += l.qtyMilli
        row.used.add(l.expenseId)
        row.totals = addTo(row.totals, money(l.amountMinor, currency))
        byProduct.set(l.productId, row)
      }
      const names = contactNames(purchases.map((b) => b.vendorContactId))
      const bySupplier = new Map<string, MonthSummary['bySupplier'][number]>()
      let totals: Money[] = []
      for (const b of purchases) {
        const key = b.vendorContactId ?? ''
        const row = bySupplier.get(key) ?? {
          contactId: b.vendorContactId,
          name: b.vendorContactId ? (names.get(b.vendorContactId) ?? null) : null,
          purchaseCount: 0,
          totals: []
        }
        row.purchaseCount++
        row.totals = addTo(row.totals, money(b.amountMinor, b.currency))
        bySupplier.set(key, row)
        totals = addTo(totals, money(b.amountMinor, b.currency))
      }
      // Biggest first (amounts of the first currency; normally there is only the hotel's).
      const amountOf = (list: Money[]): number => list[0]?.amountMinor ?? 0
      return {
        year: p.year,
        month: p.month,
        purchaseCount: purchases.length,
        totals,
        byProduct: [...byProduct.values()]
          .map(({ used, ...row }) => ({ ...row, purchaseCount: used.size }))
          .sort((a, b) => amountOf(b.totals) - amountOf(a.totals) || collator.compare(a.name, b.name)),
        bySupplier: [...bySupplier.values()].sort(
          (a, b) => amountOf(b.totals) - amountOf(a.totals) || collator.compare(a.name ?? '', b.name ?? '')
        )
      }
    },

    /** Purchases (expenses with product lines) dated in [from, to], newest first, from visible sections. */
    purchases(ctx: Ctx, input: { from: string; to: string; includeVoided?: boolean }): PurchaseView[] {
      requirePermission(ctx, 'supplies', 'view')
      const rows = expensesService
        .listExpenses(ctx, input)
        .filter((e) => e.items.length > 0)
        .reverse()
      const names = contactNames(rows.map((r) => r.vendorContactId))
      return rows.map((r) => ({
        ...r,
        vendorName: r.vendorContactId ? (names.get(r.vendorContactId) ?? null) : null
      }))
    },

    /**
     * A delivery slip ("teslim fişi") written once (S-74, K-35): one expense in the ledger with its product lines,
     * through the expenses service (section rights, closed days, frozen rate, audit). Needs a product line.
     */
    recordPurchase(ctx: Ctx, input: ExpenseCreateInput): ExpenseView {
      requirePermission(ctx, 'supplies', 'edit')
      const data = parseInput(expenseCreateSchema, input)
      if (!data.items.length)
        throw invalid('errors.validation', { fields: { items: ['at least one product line'] } })
      return expensesService.createExpense(ctx, input)
    },

    /** Voids a purchase (the expense); its product lines leave the price history and the totals. */
    voidPurchase(ctx: Ctx, expenseId: string, reason: string): ExpenseView {
      requirePermission(ctx, 'supplies', 'edit')
      const current = expensesService.getExpense(ctx, expenseId)
      if (!current.items.length) throw notFound('purchase', expenseId)
      return expensesService.voidExpense(ctx, expenseId, reason)
    },

    /** Every purchase line of the product by date (§6.13 price history). */
    priceHistory(ctx: Ctx, productId: string): PurchaseLine[] {
      requirePermission(ctx, 'supplies', 'view')
      productOf(db, productId)
      return priceHistory(purchaseLines(ctx, [productId]), productId)
    },

    /** How much of the product was bought in a month and for how much. */
    monthlyConsumption(ctx: Ctx, productId: string, year: number, month: number): MonthlyConsumption {
      requirePermission(ctx, 'supplies', 'view')
      const p = parseInput(yearMonthSchema, { year, month })
      productOf(db, productId)
      return monthlyConsumption(purchaseLines(ctx, [productId]), productId, p.year, p.month)
    }
  }
}

export type SupplyService = ReturnType<typeof createSupplyService>
