// Expenses (03-mimari.md §4.5, §6.5; G-66, G-67, G-69…G-72, K-15, K-35, S-32, S-33). No categories: a free
// description with a normalised key (autocomplete, "en çok harcama"), a visibility section (Genel / Yönetici),
// optional product lines (tedarik = gider + ürün satırları) and a base-currency value frozen at the minute of
// writing. Expenses are never deleted: voided with a reason. Staff and laundry expenses are written by their own
// services (tek giriş, G-60) and cannot be changed here.
import { and, asc, desc, eq, gte, inArray, isNull, like, lte, ne, or, sql, type SQL } from 'drizzle-orm'
import {
  descriptionSuggestSchema,
  expenseCreateSchema,
  expenseListSchema,
  expenseUpdateSchema,
  expenseVoidSchema,
  type DescriptionSuggestInput,
  type ExpenseCreateInput,
  type ExpenseItemInput,
  type ExpenseListInput,
  type ExpenseUpdateInput,
  type ExpenseVoidInput
} from '@shared/contract/expenses'
import { addDays, localDateOf } from '@shared/date'
import { convert, needsNewRate, RATE_SCALE } from '@shared/domain/fx'
import { descriptionKey } from '@shared/domain/normalize'
import { money, multiplyRatio, sum } from '@shared/money'
import {
  businessDays,
  contacts,
  employees,
  expenseItems,
  expenses,
  expenseSections,
  paymentMethods,
  products
} from '../db/schema'
import type { Ctx } from './context'
import { baseCurrencyOf, freezeAt } from './currency-service'
import { AppError, permissionDenied } from './errors'
import {
  conflict,
  inChunks,
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
import { readSetting } from './settings-service'

export type ExpenseRow = typeof expenses.$inferSelect
export type ExpenseItemRow = typeof expenseItems.$inferSelect
export type ExpenseSectionRow = typeof expenseSections.$inferSelect

export interface ExpenseView extends ExpenseRow {
  sectionCode: string
  items: ExpenseItemRow[]
}

export interface DescriptionGroup {
  key: string
  /** The newest spelling: what the autocomplete offers. */
  description: string
  count: number
  spellings: { description: string; count: number }[]
}

export interface ExpenseSectionView extends ExpenseSectionRow {
  canEdit: boolean
}

export interface DescriptionSuggestion {
  /** Latest spelling the hotel used for this key ("Deniz maaş"). */
  description: string
  key: string
  /** How many (non-voided) expenses used it. */
  count: number
}

type Reader = Pick<Tx, 'select'>

/** Description groups read for the suggestion list before the Turkish-order tie-break and the caller's limit. */
const SUGGESTION_POOL = 200
const trCollator = new Intl.Collator('tr')

// ---------------------------------------------------------------------------------------------------------------
// Helpers shared with the ledger and staff services.

/**
 * K-42 (2): staff money not paid from the drawer (salary, leave payout, an advance by transfer) is salary data:
 * only `staff.salary` viewers see it. A drawer payout is a drawer movement everyone who sees the drawer sees.
 * Undefined = no filter.
 */
export function staffMoneyFilter(ctx: Ctx): SQL | undefined {
  return ctx.can('staff.salary', 'view')
    ? undefined
    : or(ne(expenses.kind, 'staff'), eq(expenses.paidFromDrawer, true))
}

/**
 * Sections of the hotel with the caller's access (G-67; the section's visibility permission decides) and the
 * row filter every expense read applies (`where`: visible sections + K-42 staff money).
 */
export function sectionAccess(db: Reader, ctx: Ctx) {
  const all = db.select().from(expenseSections).orderBy(asc(expenseSections.sort)).all()
  const viewIds = all.filter((s) => ctx.can(s.visibilityPermission, 'view')).map((s) => s.id)
  return {
    all,
    viewIds,
    /** Rows the caller may read; only meaningful while `viewIds` is not empty. */
    where: and(inArray(expenses.sectionId, viewIds.length ? viewIds : ['']), staffMoneyFilter(ctx)),
    /**
     * Some section or the staff money is hidden from the caller: totals are a partial view (kısmi görünüm, §5).
     */
    partial: viewIds.length < all.length || !ctx.can('staff.salary', 'view')
  }
}

/** The section of an expense the caller wants to write to: `expenses` edit + the section's own permission. */
export function sectionForWrite(db: Reader, ctx: Ctx, sectionId: string): ExpenseSectionRow {
  const section = db.select().from(expenseSections).where(eq(expenseSections.id, sectionId)).get()
  if (!section) throw notFound('expense_section', sectionId)
  if (!ctx.can(section.visibilityPermission, 'edit')) throw permissionDenied()
  return section
}

/**
 * K-42 (1): a hidden (owner-only) section's expense is never paid out of the drawer: the owner takes the cash with
 * "teslim al" first, so the drawer matches the physical one for every role and no hidden expense leaks into it.
 */
export const drawerAllowedIn = (section: Pick<ExpenseSectionRow, 'visibilityPermission'>): boolean =>
  section.visibilityPermission === 'expenses'

export function assertDrawerAllowed(db: Reader, sectionId: string, paidFromDrawer: boolean): void {
  if (!paidFromDrawer) return
  const section = db.select().from(expenseSections).where(eq(expenseSections.id, sectionId)).get()
  if (section && !drawerAllowedIn(section)) throw invalid('errors.ownerSectionNotFromDrawer')
}

/**
 * G-72: when day closing is on and `date` is closed, writing needs `ledger.locked` edit and a reason (CONFLICT
 * 'errors.dayClosed' otherwise). Returns the reason to put on the audit row.
 */
export function assertDayWritable(db: Reader, ctx: Ctx, date: string, reason?: string): string | undefined {
  if (!readSetting(db, 'businessDay.closingEnabled')) return reason
  const day = db.select().from(businessDays).where(eq(businessDays.date, date)).get()
  if (day?.status !== 'closed') return reason
  if (!ctx.can('ledger.locked', 'edit') || !reason) throw conflict('errors.dayClosed', { date })
  return reason
}

/** An expense is dated at most a year ahead (a typo such as 2099 is refused, not stored). */
export const EXPENSE_MAX_DAYS_AHEAD = 366

function assertExpenseDateNear(date: string, now: Date): void {
  if (date > addDays(localDateOf(now), EXPENSE_MAX_DAYS_AHEAD)) throw invalid('errors.dateTooFar')
}

interface FxFields {
  fxRateToBase: number | null
  fxRateAt: string
  fxRateObservedAt: string | null
  fxSource: string | null
  amountBaseMinor: number | null
}

/**
 * Base-currency value frozen at `at` (K-15, S-32); no known rate keeps the row with a null base value (G-01)
 * unless the person typed a rate (`manualRateMicro`, base units per unit × 1 000 000; G-70 "elle kur").
 */
export function frozenFx(
  db: Reader,
  amountMinor: number,
  currency: string,
  at: string,
  manualRateMicro?: number
): FxFields {
  const m = money(amountMinor, currency)
  const base = baseCurrencyOf(db)
  const conv = freezeAt(db, m, base, at)
  if (!conv && manualRateMicro)
    return {
      fxRateToBase: manualRateMicro,
      fxRateAt: at,
      fxRateObservedAt: at,
      fxSource: 'manual',
      amountBaseMinor: convert(m, base, BigInt(manualRateMicro), BigInt(RATE_SCALE)).amountMinor
    }
  return {
    fxRateToBase: conv?.rateToBaseMicro ?? null,
    fxRateAt: at,
    fxRateObservedAt: conv?.rateObservedAt ?? null,
    fxSource: conv?.source ?? null,
    amountBaseMinor: conv?.amountBaseMinor ?? null
  }
}

export interface NewExpense {
  date: string
  sectionId: string
  amountMinor: number
  currency: string
  description: string
  kind: ExpenseRow['kind']
  paidFromDrawer: boolean
  methodId?: string | null
  vendorContactId?: string | null
  employeeId?: string | null
  staffTxnId?: string | null
  /** Typed rate when none is known (offline). */
  manualRateMicro?: number
}

/** Inserts one expense row (key, frozen rate, stamps); the caller checks permissions and writes the audit row. */
export function insertExpenseTx(tx: Tx, ctx: Ctx, now: Date, input: NewExpense): ExpenseRow {
  const at = now.toISOString()
  assertDrawerAllowed(tx, input.sectionId, input.paidFromDrawer)
  const row: ExpenseRow = {
    id: newId(now),
    date: input.date,
    sectionId: input.sectionId,
    amountMinor: input.amountMinor,
    currency: input.currency,
    ...frozenFx(tx, input.amountMinor, input.currency, at, input.manualRateMicro),
    description: input.description,
    descriptionKey: descriptionKey(input.description),
    vendorContactId: input.vendorContactId ?? null,
    kind: input.kind,
    paidFromDrawer: input.paidFromDrawer,
    methodId: input.methodId ?? null,
    settledAt: null,
    handoverId: null,
    employeeId: input.employeeId ?? null,
    staffTxnId: input.staffTxnId ?? null,
    laundrySettlementId: null,
    voidedAt: null,
    voidReason: null,
    createdBy: ctx.userId,
    ...stamps(now)
  }
  tx.insert(expenses).values(row).run()
  return row
}

/** Payment method / contact / employee references must exist. */
export function checkExpenseRefs(
  db: Reader,
  refs: { methodId?: string | null; vendorContactId?: string | null; employeeId?: string | null }
): void {
  if (
    refs.methodId &&
    !db
      .select({ id: paymentMethods.id })
      .from(paymentMethods)
      .where(eq(paymentMethods.id, refs.methodId))
      .get()
  )
    throw notFound('payment_method', refs.methodId)
  if (
    refs.vendorContactId &&
    !db.select({ id: contacts.id }).from(contacts).where(eq(contacts.id, refs.vendorContactId)).get()
  )
    throw notFound('contact', refs.vendorContactId)
  if (
    refs.employeeId &&
    !db.select({ id: employees.id }).from(employees).where(eq(employees.id, refs.employeeId)).get()
  )
    throw notFound('employee', refs.employeeId)
}

// ---------------------------------------------------------------------------------------------------------------

interface ItemDraft {
  productId: string
  qtyMilli: number
  unitPriceMinor: number
  amountMinor: number
}

/** Product lines priced in the expense currency; their sum may not exceed the expense amount (G-71). */
function draftItems(
  db: Reader,
  items: readonly ExpenseItemInput[],
  amountMinor: number,
  currency: string
): ItemDraft[] {
  const drafts = items.map((it) => {
    if (!db.select({ id: products.id }).from(products).where(eq(products.id, it.productId)).get())
      throw notFound('product', it.productId)
    return {
      productId: it.productId,
      qtyMilli: it.qtyMilli,
      unitPriceMinor: it.unitPriceMinor,
      amountMinor:
        it.amountMinor ?? multiplyRatio(money(it.unitPriceMinor, currency), it.qtyMilli, 1000).amountMinor
    }
  })
  const total = sum(
    drafts.map((d) => money(d.amountMinor, currency)),
    currency
  )
  if (total.amountMinor > amountMinor)
    throw invalid('errors.expenseItemsExceedAmount', { itemsMinor: total.amountMinor, amountMinor })
  return drafts
}

function insertItems(tx: Tx, expenseId: string, drafts: readonly ItemDraft[], now: Date): void {
  for (const d of drafts)
    tx.insert(expenseItems)
      .values({ id: newId(now), expenseId, ...d, ...stamps(now) })
      .run()
}

function itemsOf(db: Reader, expenseIds: readonly string[]): Map<string, ExpenseItemRow[]> {
  const out = new Map<string, ExpenseItemRow[]>()
  if (!expenseIds.length) return out
  const rows = db
    .select()
    .from(expenseItems)
    .where(inArray(expenseItems.expenseId, [...expenseIds]))
    .orderBy(asc(expenseItems.createdAt), asc(expenseItems.id))
    .all()
  for (const r of rows) {
    const list = out.get(r.expenseId) ?? []
    list.push(r)
    out.set(r.expenseId, list)
  }
  return out
}

function expenseRow(db: Reader, id: string): ExpenseRow {
  const row = db.select().from(expenses).where(eq(expenses.id, id)).get()
  if (!row) throw notFound('expense', id)
  return row
}

function viewOf(db: Reader, row: ExpenseRow): ExpenseView {
  const section = db.select().from(expenseSections).where(eq(expenseSections.id, row.sectionId)).get()
  return { ...row, sectionCode: section?.code ?? '', items: itemsOf(db, [row.id]).get(row.id) ?? [] }
}

export function createExpensesService(deps: ServiceDeps) {
  const { db } = deps

  /** A manual expense the caller may change: not voided, not owned by another module, section writable. */
  function editable(tx: Reader, ctx: Ctx, id: string): ExpenseRow {
    const row = expenseRow(tx, id)
    sectionForWrite(tx, ctx, row.sectionId)
    if (row.voidedAt) throw invalid('errors.expenseVoided')
    if (row.kind !== 'manual') throw conflict('errors.expenseManagedElsewhere', { kind: row.kind })
    // Settled in a handover ("x"): the owner already counted it; undo the handover first (§4.8-3).
    if (row.settledAt) throw conflict('errors.expenseSettled')
    return row
  }

  return {
    /** Sections the caller can see (G-67), with whether they may write to them. */
    listSections(ctx: Ctx): ExpenseSectionView[] {
      requirePermission(ctx, 'expenses', 'view')
      return sectionAccess(db, ctx)
        .all.filter((s) => s.active && ctx.can(s.visibilityPermission, 'view'))
        .map((s) => ({
          ...s,
          canEdit: ctx.can('expenses', 'edit') && ctx.can(s.visibilityPermission, 'edit')
        }))
    },

    /** Expenses in [from, to] from the sections the caller can see; rows of hidden sections never leave here. */
    listExpenses(ctx: Ctx, input: ExpenseListInput): ExpenseView[] {
      requirePermission(ctx, 'expenses', 'view')
      const q = parseInput(expenseListSchema, input)
      const access = sectionAccess(db, ctx)
      const sectionIds = q.sectionId ? access.viewIds.filter((id) => id === q.sectionId) : access.viewIds
      if (!sectionIds.length) return []
      const rows = db
        .select()
        .from(expenses)
        .where(
          and(
            gte(expenses.date, q.from),
            lte(expenses.date, q.to),
            inArray(expenses.sectionId, sectionIds),
            staffMoneyFilter(ctx),
            q.includeVoided ? undefined : isNull(expenses.voidedAt)
          )
        )
        .orderBy(asc(expenses.date), asc(expenses.createdAt))
        .all()
      const items = itemsOf(
        db,
        rows.map((r) => r.id)
      )
      const codes = new Map(access.all.map((s) => [s.id, s.code]))
      return rows.map((r) => ({
        ...r,
        sectionCode: codes.get(r.sectionId) ?? '',
        items: items.get(r.id) ?? []
      }))
    },

    getExpense(ctx: Ctx, id: string): ExpenseView {
      requirePermission(ctx, 'expenses', 'view')
      const row = expenseRow(db, id)
      const section = db.select().from(expenseSections).where(eq(expenseSections.id, row.sectionId)).get()
      if (!section || !ctx.can(section.visibilityPermission, 'view')) throw permissionDenied()
      if (row.kind === 'staff' && !row.paidFromDrawer && !ctx.can('staff.salary', 'view'))
        throw permissionDenied()
      return viewOf(db, row)
    },

    createExpense(ctx: Ctx, input: ExpenseCreateInput): ExpenseView {
      requirePermission(ctx, 'expenses', 'edit')
      const data = parseInput(expenseCreateSchema, input)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        sectionForWrite(tx, ctx, data.sectionId)
        assertExpenseDateNear(data.date, now)
        const reason = assertDayWritable(tx, ctx, data.date, data.reason)
        checkExpenseRefs(tx, data)
        const drafts = draftItems(tx, data.items, data.amountMinor, data.currency)
        const row = insertExpenseTx(tx, ctx, now, { ...data, kind: 'manual' })
        insertItems(tx, row.id, drafts, now)
        audit({
          entity: 'expense',
          entityId: row.id,
          action: 'create',
          after: { ...row, items: drafts },
          reason
        })
        return viewOf(tx, row)
      })
    },

    /**
     * Changes a manual expense. The frozen rate stays unless the amount or currency changes; then the rate of
     * this minute is taken (S-32). Sending `items` replaces the product lines (the audit row keeps the old ones).
     */
    updateExpense(ctx: Ctx, id: string, input: ExpenseUpdateInput): ExpenseView {
      requirePermission(ctx, 'expenses', 'edit')
      const data = parseInput(expenseUpdateSchema, input)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const before = editable(tx, ctx, id)
        if (data.sectionId && data.sectionId !== before.sectionId) sectionForWrite(tx, ctx, data.sectionId)
        let reason = assertDayWritable(tx, ctx, before.date, data.reason)
        if (data.date && data.date !== before.date) {
          assertExpenseDateNear(data.date, now)
          reason = assertDayWritable(tx, ctx, data.date, data.reason)
        }
        checkExpenseRefs(tx, data)
        assertDrawerAllowed(
          tx,
          data.sectionId ?? before.sectionId,
          data.paidFromDrawer ?? before.paidFromDrawer
        )

        const amountMinor = data.amountMinor ?? before.amountMinor
        const currency = data.currency ?? before.currency
        const beforeItems = itemsOf(tx, [id]).get(id) ?? []
        if (currency !== before.currency && beforeItems.length && !data.items)
          throw new AppError('VALIDATION', 'errors.validation', {
            fields: { items: ['product lines must be sent again when the currency changes'] }
          })
        const drafts = draftItems(tx, data.items ?? beforeItems, amountMinor, currency)

        // B11: a row saved without a known rate takes the typed one even when the amount stays the same.
        const typedForMissing = before.amountBaseMinor === null && !!data.manualRateMicro
        const fx =
          needsNewRate(before, { amountMinor, currency }) || typedForMissing
            ? frozenFx(tx, amountMinor, currency, now.toISOString(), data.manualRateMicro)
            : {}
        const { items: _items, reason: _reason, manualRateMicro: _rate, ...fields } = data
        tx.update(expenses)
          .set({
            ...fields,
            ...fx,
            ...(data.description ? { descriptionKey: descriptionKey(data.description) } : {}),
            updatedAt: now.toISOString()
          })
          .where(eq(expenses.id, id))
          .run()
        if (data.items) {
          // Product lines are a derived breakdown of this expense; the audit row keeps the replaced ones.
          tx.delete(expenseItems).where(eq(expenseItems.expenseId, id)).run()
          insertItems(tx, id, drafts, now)
        }
        const after = viewOf(tx, expenseRow(tx, id))
        audit({
          entity: 'expense',
          entityId: id,
          action: 'update',
          before: { ...before, items: beforeItems },
          after,
          reason
        })
        return after
      })
    },

    voidExpense(ctx: Ctx, id: string, why: string): ExpenseView {
      requirePermission(ctx, 'expenses', 'edit')
      const { reason } = parseInput(expenseVoidSchema, { reason: why } satisfies ExpenseVoidInput)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const before = editable(tx, ctx, id)
        assertDayWritable(tx, ctx, before.date, reason)
        tx.update(expenses)
          .set({ voidedAt: now.toISOString(), voidReason: reason, updatedAt: now.toISOString() })
          .where(eq(expenses.id, id))
          .run()
        const after = viewOf(tx, expenseRow(tx, id))
        audit({ entity: 'expense', entityId: id, action: 'void', before, after, reason })
        return after
      })
    },

    /**
     * Autocomplete from earlier descriptions (G-66): keys starting with the typed text (or with a word of it),
     * most used first, only from sections the caller can see and only manual expenses.
     */
    suggestDescriptions(ctx: Ctx, typed: string, max?: number): DescriptionSuggestion[] {
      requirePermission(ctx, 'expenses', 'view')
      const { prefix, limit } = parseInput(descriptionSuggestSchema, {
        prefix: typed,
        limit: max
      } satisfies DescriptionSuggestInput)
      const { viewIds } = sectionAccess(db, ctx)
      if (!viewIds.length) return []
      // The key holds only letters, digits and single spaces, so it is safe inside LIKE.
      const key = descriptionKey(prefix)
      const count = sql<number>`count(*)`
      const startsFirstSql = key ? [desc(sql`${expenses.descriptionKey} like ${`${key}%`}`)] : []
      // One row per description; SQLite takes the bare `description` from the newest row (max created_at).
      const groups = db
        .select({
          key: expenses.descriptionKey,
          description: expenses.description,
          newest: sql<string>`max(${expenses.createdAt})`,
          count
        })
        .from(expenses)
        .where(
          and(
            isNull(expenses.voidedAt),
            eq(expenses.kind, 'manual'),
            inArray(expenses.sectionId, viewIds),
            key
              ? or(like(expenses.descriptionKey, `${key}%`), like(expenses.descriptionKey, `% ${key}%`))
              : undefined
          )
        )
        .groupBy(expenses.descriptionKey)
        .orderBy(...startsFirstSql, desc(count))
        .limit(SUGGESTION_POOL)
        .all()
      const startsFirst = (s: DescriptionSuggestion): number => (key && s.key.startsWith(key) ? 0 : 1)
      return groups
        .map((g) => ({ key: g.key, description: g.description, count: g.count }))
        .sort(
          (a, b) =>
            startsFirst(a) - startsFirst(b) ||
            b.count - a.count ||
            trCollator.compare(a.description, b.description)
        )
        .slice(0, limit)
    },

    /**
     * The description dictionary (faz-07 madde 4): every group of manual expenses the caller sees, with the
     * spellings that fall into it ("su", "Su " → one group), most used first.
     */
    descriptionGroups(ctx: Ctx): DescriptionGroup[] {
      requirePermission(ctx, 'expenses', 'view')
      const { viewIds } = sectionAccess(db, ctx)
      if (!viewIds.length) return []
      const count = sql<number>`count(*)`
      const rows = db
        .select({
          key: expenses.descriptionKey,
          description: expenses.description,
          newest: sql<string>`max(${expenses.createdAt})`,
          count
        })
        .from(expenses)
        .where(
          and(isNull(expenses.voidedAt), eq(expenses.kind, 'manual'), inArray(expenses.sectionId, viewIds))
        )
        .groupBy(expenses.descriptionKey, expenses.description)
        .all()
      const groups = new Map<string, DescriptionGroup & { newest: string }>()
      for (const r of rows) {
        const g = groups.get(r.key) ?? {
          key: r.key,
          description: r.description,
          count: 0,
          spellings: [],
          newest: ''
        }
        g.count += r.count
        g.spellings.push({ description: r.description, count: r.count })
        if (r.newest > g.newest) {
          g.newest = r.newest
          g.description = r.description
        }
        groups.set(r.key, g)
      }
      return [...groups.values()]
        .map(({ newest: _n, ...g }) => ({
          ...g,
          spellings: g.spellings.sort(
            (a, b) => b.count - a.count || trCollator.compare(a.description, b.description)
          )
        }))
        .sort((a, b) => b.count - a.count || trCollator.compare(a.description, b.description))
    },

    /**
     * Renames a description group (faz-07 madde 4): every non-voided manual expense with key `key` in a section
     * the caller may write gets the new text. When the new text folds to another group's key the two groups merge.
     * Only the words change (never an amount), so settled ("x") rows are renamed too; each row gets its audit row.
     * A row on a closed day (G-72, B16) changes only with `ledger.locked` and a reason; otherwise it keeps its text
     * and is counted in `skippedClosed`.
     */
    renameDescription(
      ctx: Ctx,
      fromKey: string,
      to: string,
      reason?: string
    ): { changed: number; key: string; skippedClosed: number } {
      requirePermission(ctx, 'expenses', 'edit')
      const text = to.trim()
      if (!text) throw invalid('errors.validation', { fields: { description: ['required'] } })
      const newKey = descriptionKey(text)
      if (!newKey) throw invalid('errors.validation', { fields: { description: ['no letters'] } })
      const why = reason?.trim() || undefined
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const writable = sectionAccess(tx, ctx)
          .all.filter((s) => ctx.can(s.visibilityPermission, 'edit'))
          .map((s) => s.id)
        if (!writable.length) throw permissionDenied()
        const found = tx
          .select({ id: expenses.id, description: expenses.description, date: expenses.date })
          .from(expenses)
          .where(
            and(
              eq(expenses.descriptionKey, fromKey),
              eq(expenses.kind, 'manual'),
              isNull(expenses.voidedAt),
              inArray(expenses.sectionId, writable)
            )
          )
          .all()
        if (!found.length) throw notFound('expense_description', fromKey)
        const closingOn = readSetting(tx, 'businessDay.closingEnabled')
        const closedDays = closingOn
          ? new Set(
              tx
                .select({ date: businessDays.date })
                .from(businessDays)
                .where(
                  and(
                    eq(businessDays.status, 'closed'),
                    inArray(businessDays.date, [...new Set(found.map((r) => r.date))])
                  )
                )
                .all()
                .map((d) => d.date)
            )
          : new Set<string>()
        const mayWriteClosed = ctx.can('ledger.locked', 'edit') && !!why
        const rows = found.filter((r) => mayWriteClosed || !closedDays.has(r.date))
        const iso = now.toISOString()
        for (const ids of inChunks(rows.map((r) => r.id)))
          tx.update(expenses)
            .set({ description: text, descriptionKey: newKey, updatedAt: iso })
            .where(inArray(expenses.id, ids))
            .run()
        for (const r of rows)
          audit({
            entity: 'expense',
            entityId: r.id,
            action: 'update',
            before: { description: r.description, descriptionKey: fromKey },
            after: { description: text, descriptionKey: newKey },
            reason: closedDays.has(r.date) ? why : undefined
          })
        return { changed: rows.length, key: newKey, skippedClosed: found.length - rows.length }
      })
    }
  }
}

export type ExpensesService = ReturnType<typeof createExpensesService>
