// Laundry (G-171, K-28, S-95; 03-mimari.md §6.13): item types, the agreed price list with validity dates,
// outgoing (dirty) and incoming (clean slip) deliveries, what is still at the laundry (out − in, oldest
// first) and the monthly settlement against the laundry's invoice. The settled invoice is an expense row of
// kind laundry (tek giriş). Pieces already at the laundry when tracking starts are entered as a first
// outgoing delivery.
import { and, asc, desc, eq, gte, inArray, isNull, lte, type SQL } from 'drizzle-orm'
import {
  laundryDeliveryInputSchema,
  laundryDeliveryListSchema,
  laundryPriceInputSchema,
  laundrySettlementInputSchema,
  laundryReopenInputSchema,
  type LaundryReopenInput,
  yearMonthSchema,
  type LaundryDeliveryInput,
  type LaundryDeliveryListInput,
  type LaundryPriceInput,
  type LaundrySettlementInput
} from '@shared/contract/supply'
import { addDays, localDate, localDateOf, type LocalDate } from '@shared/date'
import {
  laundryLineAmount,
  laundryOutstanding,
  laundrySettlement,
  withInvoice,
  type LaundryDelivery,
  type LaundryInvoiceCheck,
  type LaundryOutstanding,
  type LaundryPrice
} from '@shared/domain/laundry'
import {
  contacts,
  expenses,
  expenseSections,
  laundryDeliveries,
  laundryDeliveryItems,
  laundryItemTypes,
  laundryPrices,
  laundrySettlements
} from '../db/schema'
import type { I18nText } from '../db/schema/columns'
import type { Ctx } from './context'
import { baseCurrencyOf } from './currency-service'
import { assertDayWritable, insertExpenseTx } from './expenses-service'
import {
  conflict,
  inTransaction,
  invalid,
  newId,
  notFound,
  parseInput,
  requirePermission,
  stamps,
  type ServiceDeps,
  type Tx,
  assertNameFree
} from './kit'

export type LaundryItemTypeRow = typeof laundryItemTypes.$inferSelect
export type LaundryPriceRow = typeof laundryPrices.$inferSelect
export type LaundryDeliveryRow = typeof laundryDeliveries.$inferSelect
export type LaundryDeliveryItemRow = typeof laundryDeliveryItems.$inferSelect
export type LaundrySettlementRow = typeof laundrySettlements.$inferSelect

export interface LaundryItemTypeView extends LaundryItemTypeRow {
  displayName: I18nText | null
}

export interface LaundryDeliveryView extends LaundryDeliveryRow {
  items: LaundryDeliveryItemRow[]
}

export interface LaundryMonth extends LaundryInvoiceCheck {
  /** The stored settlement (invoice total, expense) when the month was settled. */
  settled: LaundrySettlementRow | null
}

export interface LaundryTrendPoint {
  year: number
  month: number
  qty: number
  stainedQty: number
  /** null while some pieces of the month have no price. */
  amountMinor: number | null
  currency: string
  invoicedTotalMinor: number | null
}

type Reader = Pick<Tx, 'select'>

const itemTypeView = (t: LaundryItemTypeRow): LaundryItemTypeView => ({
  ...t,
  displayName: t.name === null ? t.nameI18n : null
})

function monthBounds(year: number, month: number): { from: LocalDate; last: LocalDate } {
  const from = localDate(`${year}-${String(month).padStart(2, '0')}-01`)
  const next =
    month === 12
      ? localDate(`${year + 1}-01-01`)
      : localDate(`${year}-${String(month + 1).padStart(2, '0')}-01`)
  const last = addDays(next, -1)
  return { from, last }
}

export function createLaundryService(deps: ServiceDeps) {
  const { db } = deps

  const laundryOf = (tx: Reader, contactId: string) => {
    const row = tx.select().from(contacts).where(eq(contacts.id, contactId)).get()
    if (!row) throw notFound('contact', contactId)
    return row
  }

  const priceRows = (tx: Reader, contactId: string): LaundryPrice[] =>
    tx
      .select()
      .from(laundryPrices)
      .where(eq(laundryPrices.laundryContactId, contactId))
      .orderBy(asc(laundryPrices.validFrom), asc(laundryPrices.createdAt))
      .all()
      .map((p) => ({
        contactId: p.laundryContactId,
        itemTypeId: p.itemTypeId,
        validFrom: p.validFrom as LocalDate,
        unitPriceMinor: p.unitPriceMinor,
        currency: p.currency
      }))

  const deliveriesOf = (tx: Reader, contactId: string, where?: SQL): LaundryDelivery[] => {
    const rows = tx
      .select()
      .from(laundryDeliveries)
      .where(
        and(eq(laundryDeliveries.laundryContactId, contactId), isNull(laundryDeliveries.voidedAt), where)
      )
      .all()
    if (!rows.length) return []
    const items = tx
      .select()
      .from(laundryDeliveryItems)
      .where(
        inArray(
          laundryDeliveryItems.deliveryId,
          rows.map((r) => r.id)
        )
      )
      .all()
    return rows.map((r) => ({
      id: r.id,
      date: r.date as LocalDate,
      direction: r.direction,
      contactId: r.laundryContactId,
      items: items.filter((i) => i.deliveryId === r.id)
    }))
  }

  const deliveryView = (tx: Reader, row: LaundryDeliveryRow): LaundryDeliveryView => ({
    ...row,
    items: tx.select().from(laundryDeliveryItems).where(eq(laundryDeliveryItems.deliveryId, row.id)).all()
  })

  /** The month's stored row, reopened (settledAt null) or not: the unique index allows one per laundry and month. */
  const anySettlementRow = (tx: Reader, contactId: string, year: number, month: number) =>
    tx
      .select()
      .from(laundrySettlements)
      .where(
        and(
          eq(laundrySettlements.laundryContactId, contactId),
          eq(laundrySettlements.periodYear, year),
          eq(laundrySettlements.periodMonth, month)
        )
      )
      .get()

  /** The month's settlement while it stands; a reopened month (S-127) has none until it is settled again. */
  const settlementRow = (tx: Reader, contactId: string, year: number, month: number) => {
    const row = anySettlementRow(tx, contactId, year, month)
    return row?.settledAt ? row : undefined
  }

  /** An incoming slip changes the month's total: not once the month's invoice is entered (the stored comparison would go stale). */
  const assertMonthOpen = (tx: Reader, contactId: string, direction: string, date: string): void => {
    if (direction !== 'in') return
    if (settlementRow(tx, contactId, Number(date.slice(0, 4)), Number(date.slice(5, 7))))
      throw conflict('errors.laundryMonthSettled')
  }

  const compute = (tx: Reader, contactId: string, year: number, month: number) => {
    const { from, last } = monthBounds(year, month)
    return laundrySettlement(
      deliveriesOf(tx, contactId, and(gte(laundryDeliveries.date, from), lte(laundryDeliveries.date, last))),
      priceRows(tx, contactId),
      contactId,
      year,
      month,
      { currency: baseCurrencyOf(tx) }
    )
  }

  return {
    // ---- item types (seeded list, the hotel adds its own) ----

    listItemTypes(ctx: Ctx, opts: { includeInactive?: boolean } = {}): LaundryItemTypeView[] {
      requirePermission(ctx, 'laundry', 'view')
      const q = db.select().from(laundryItemTypes)
      return (opts.includeInactive ? q : q.where(eq(laundryItemTypes.active, true)))
        .orderBy(asc(laundryItemTypes.sort), asc(laundryItemTypes.createdAt))
        .all()
        .map(itemTypeView)
    },

    createItemType(ctx: Ctx, name: string): LaundryItemTypeView {
      requirePermission(ctx, 'laundry', 'edit')
      const label = name.trim()
      if (!label || label.length > 80)
        throw invalid('errors.validation', { fields: { name: ['1–80 characters'] } })
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const sorts = tx.select().from(laundryItemTypes).all()
        assertNameFree(sorts, label)
        const row: LaundryItemTypeRow = {
          id: newId(now),
          code: null,
          name: label,
          nameI18n: null,
          sort: Math.max(0, ...sorts.map((s) => s.sort)) + 1,
          active: true,
          ...stamps(now)
        }
        tx.insert(laundryItemTypes).values(row).run()
        audit({ entity: 'laundry_item_type', entityId: row.id, action: 'create', after: row })
        return itemTypeView(row)
      })
    },

    // ---- price list (K-28: a rise is a new row from a date) ----

    listPrices(ctx: Ctx, contactId: string): LaundryPriceRow[] {
      requirePermission(ctx, 'laundry', 'view')
      return db
        .select()
        .from(laundryPrices)
        .where(eq(laundryPrices.laundryContactId, contactId))
        .orderBy(asc(laundryPrices.itemTypeId), desc(laundryPrices.validFrom))
        .all()
    },

    setPrice(ctx: Ctx, input: LaundryPriceInput): LaundryPriceRow {
      requirePermission(ctx, 'laundry', 'edit')
      const data = parseInput(laundryPriceInputSchema, input)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        laundryOf(tx, data.contactId)
        if (
          !tx
            .select({ id: laundryItemTypes.id })
            .from(laundryItemTypes)
            .where(eq(laundryItemTypes.id, data.itemTypeId))
            .get()
        )
          throw notFound('laundry_item_type', data.itemTypeId)
        const row: LaundryPriceRow = {
          id: newId(now),
          laundryContactId: data.contactId,
          itemTypeId: data.itemTypeId,
          validFrom: data.validFrom,
          unitPriceMinor: data.unitPriceMinor,
          currency: baseCurrencyOf(tx),
          createdBy: ctx.userId,
          ...stamps(now)
        }
        tx.insert(laundryPrices).values(row).run()
        audit({ entity: 'laundry_price', entityId: row.id, action: 'create', after: row })
        return row
      })
    },

    // ---- deliveries (S-95: out and in recorded separately) ----

    listDeliveries(ctx: Ctx, input: LaundryDeliveryListInput = {}): LaundryDeliveryView[] {
      requirePermission(ctx, 'laundry', 'view')
      const q = parseInput(laundryDeliveryListSchema, input)
      return db
        .select()
        .from(laundryDeliveries)
        .where(
          and(
            q.contactId ? eq(laundryDeliveries.laundryContactId, q.contactId) : undefined,
            q.from ? gte(laundryDeliveries.date, q.from) : undefined,
            q.to ? lte(laundryDeliveries.date, q.to) : undefined,
            q.includeVoided ? undefined : isNull(laundryDeliveries.voidedAt)
          )
        )
        .orderBy(desc(laundryDeliveries.date), desc(laundryDeliveries.createdAt))
        .all()
        .map((r) => deliveryView(db, r))
    },

    /** One slip; an incoming slip's lines are priced (slip price or the table price of that day). */
    recordDelivery(ctx: Ctx, input: LaundryDeliveryInput): LaundryDeliveryView {
      requirePermission(ctx, 'laundry', 'edit')
      const data = parseInput(laundryDeliveryInputSchema, input)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        laundryOf(tx, data.contactId)
        const known = tx
          .select({ id: laundryItemTypes.id })
          .from(laundryItemTypes)
          .where(
            inArray(
              laundryItemTypes.id,
              data.items.map((i) => i.itemTypeId)
            )
          )
          .all()
        if (known.length !== data.items.length) throw notFound('laundry_item_type')
        assertMonthOpen(tx, data.contactId, data.direction, data.date)
        const row: LaundryDeliveryRow = {
          id: newId(now),
          date: data.date,
          direction: data.direction,
          laundryContactId: data.contactId,
          slipNo: data.slipNo ?? null,
          note: data.note ?? null,
          voidedAt: null,
          createdBy: ctx.userId,
          ...stamps(now)
        }
        tx.insert(laundryDeliveries).values(row).run()
        const prices = priceRows(tx, data.contactId)
        const currency = baseCurrencyOf(tx)
        const items: LaundryDeliveryItemRow[] = data.items.map((i) => ({
          deliveryId: row.id,
          itemTypeId: i.itemTypeId,
          qty: i.qty,
          stainedQty: i.stainedQty,
          slipUnitPriceMinor: i.slipUnitPriceMinor ?? null,
          amountMinor:
            data.direction === 'in'
              ? (laundryLineAmount(i, data.date as LocalDate, data.contactId, prices, currency)
                  ?.amountMinor ?? null)
              : null
        }))
        tx.insert(laundryDeliveryItems).values(items).run()
        audit({ entity: 'laundry_delivery', entityId: row.id, action: 'create', after: { ...row, items } })
        return { ...row, items }
      })
    },

    /** A wrong slip is voided with a reason (it then counts nowhere). */
    voidDelivery(ctx: Ctx, id: string, reason: string): LaundryDeliveryView {
      requirePermission(ctx, 'laundry', 'edit')
      if (!reason.trim()) throw invalid('errors.reasonRequired')
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const before = tx.select().from(laundryDeliveries).where(eq(laundryDeliveries.id, id)).get()
        if (!before) throw notFound('laundry_delivery', id)
        if (before.voidedAt) throw conflict('errors.alreadyCancelled')
        assertMonthOpen(tx, before.laundryContactId, before.direction, before.date)
        tx.update(laundryDeliveries)
          .set({ voidedAt: now.toISOString(), updatedAt: now.toISOString() })
          .where(eq(laundryDeliveries.id, id))
          .run()
        const after = tx
          .select()
          .from(laundryDeliveries)
          .where(eq(laundryDeliveries.id, id))
          .get() as LaundryDeliveryRow
        audit({
          entity: 'laundry_delivery',
          entityId: id,
          action: 'void',
          before,
          after,
          reason: reason.trim()
        })
        return deliveryView(tx, after)
      })
    },

    /** Per item type: sent − returned up to `until`, with the oldest still-open outgoing date (S-95). */
    outstanding(ctx: Ctx, contactId: string, until?: string): LaundryOutstanding {
      requirePermission(ctx, 'laundry', 'view')
      laundryOf(db, contactId)
      const day = (until ? localDate(until) : localDateOf(deps.clock())) as LocalDate
      return laundryOutstanding(deliveriesOf(db, contactId, lte(laundryDeliveries.date, day)), contactId, day)
    },

    // ---- monthly settlement (§6.13) ----

    /**
     * The trend chart: per month up to `until`'s month (12 months by default) the clean pieces, the stained ones,
     * the amount priced from the slips and the laundry's invoice where one was entered.
     */
    trend(ctx: Ctx, contactId: string, until: string, months = 12): LaundryTrendPoint[] {
      requirePermission(ctx, 'laundry', 'view')
      laundryOf(db, contactId)
      const end = localDate(until)
      const count = Math.min(Math.max(Math.trunc(months), 1), 36)
      let year = Number(end.slice(0, 4))
      let month = Number(end.slice(5, 7))
      const periods: { year: number; month: number }[] = []
      for (let i = 0; i < count; i++) {
        periods.unshift({ year, month })
        if (--month === 0) {
          month = 12
          year--
        }
      }
      const first = periods[0]!
      const { from } = monthBounds(first.year, first.month)
      const { last } = monthBounds(Number(end.slice(0, 4)), Number(end.slice(5, 7)))
      const deliveries = deliveriesOf(
        db,
        contactId,
        and(gte(laundryDeliveries.date, from), lte(laundryDeliveries.date, last))
      )
      const prices = priceRows(db, contactId)
      const currency = baseCurrencyOf(db)
      const invoices = db
        .select()
        .from(laundrySettlements)
        .where(eq(laundrySettlements.laundryContactId, contactId))
        .all()
        .filter((i) => i.settledAt)
      return periods.map((p) => {
        const s = laundrySettlement(deliveries, prices, contactId, p.year, p.month, { currency })
        const invoice = invoices.find((i) => i.periodYear === p.year && i.periodMonth === p.month)
        return {
          year: p.year,
          month: p.month,
          qty: s.totalQty,
          stainedQty: s.totalStainedQty,
          amountMinor: s.totalAmountMinor,
          currency,
          invoicedTotalMinor: invoice?.invoicedTotalMinor ?? null
        }
      })
    },

    /** Incoming slips of the month priced and summed; with the stored invoice comparison when settled. */
    month(ctx: Ctx, contactId: string, year: number, month: number): LaundryMonth {
      requirePermission(ctx, 'laundry', 'view')
      const p = parseInput(yearMonthSchema, { year, month })
      laundryOf(db, contactId)
      const computed = compute(db, contactId, p.year, p.month)
      const settled = settlementRow(db, contactId, p.year, p.month) ?? null
      return { ...withInvoice(computed, settled?.invoicedTotalMinor ?? 0), settled }
    },

    /**
     * Records the laundry's invoice for the month: the difference to the slips is kept and the invoice
     * becomes an expense (kind laundry). Settling again replaces it (the earlier expense is voided).
     */
    settle(ctx: Ctx, input: LaundrySettlementInput): LaundryMonth {
      requirePermission(ctx, 'laundry', 'edit')
      const data = parseInput(laundrySettlementInputSchema, input)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const laundry = laundryOf(tx, data.contactId)
        const computed = compute(tx, data.contactId, data.year, data.month)
        const check = withInvoice(computed, data.invoicedTotalMinor)
        const currency = computed.currency ?? baseCurrencyOf(tx)
        const before = anySettlementRow(tx, data.contactId, data.year, data.month)
        // Writing or voiding the month's expense is a ledger write (G-71): the expense right and an open day.
        const touchesLedger = data.paid || !!before?.expenseId
        if (touchesLedger) requirePermission(ctx, 'expenses', 'edit')
        const { last } = monthBounds(data.year, data.month)
        const reason = touchesLedger
          ? assertDayWritable(tx, ctx, last, data.dayClosedReason)
          : data.dayClosedReason
        const iso = now.toISOString()
        if (before?.expenseId) {
          tx.update(expenses)
            .set({ voidedAt: iso, voidReason: 'laundry_resettled', updatedAt: iso })
            .where(and(eq(expenses.id, before.expenseId), isNull(expenses.voidedAt)))
            .run()
          audit({
            entity: 'expense',
            entityId: before.expenseId,
            action: 'void',
            reason: reason ? `laundry_resettled: ${reason}` : 'laundry_resettled'
          })
        }
        const id = before?.id ?? newId(now)
        const section = tx.select().from(expenseSections).where(eq(expenseSections.code, 'general')).get()
        if (!section) throw notFound('expense_section', 'general')
        const expense =
          data.paid && data.invoicedTotalMinor > 0
            ? insertExpenseTx(tx, ctx, now, {
                date: last,
                sectionId: section.id,
                amountMinor: data.invoicedTotalMinor,
                currency,
                description: laundry.name,
                kind: 'laundry',
                paidFromDrawer: false,
                vendorContactId: laundry.id
              })
            : null
        if (expense) {
          tx.update(expenses)
            .set({ laundrySettlementId: id, updatedAt: iso })
            .where(eq(expenses.id, expense.id))
            .run()
          audit({
            entity: 'expense',
            entityId: expense.id,
            action: 'create',
            after: { ...expense, laundrySettlementId: id, updatedAt: iso },
            reason
          })
        }
        const fields = {
          computedQty: Object.fromEntries(computed.lines.map((l) => [l.itemTypeId, l.qty])),
          computedTotalMinor: computed.totalAmountMinor ?? 0,
          currency,
          invoicedTotalMinor: data.invoicedTotalMinor,
          differenceMinor: check.differenceMinor,
          note: data.note ?? null,
          expenseId: expense?.id ?? null,
          settledAt: iso,
          updatedAt: iso
        }
        if (before) tx.update(laundrySettlements).set(fields).where(eq(laundrySettlements.id, id)).run()
        else
          tx.insert(laundrySettlements)
            .values({
              id,
              laundryContactId: data.contactId,
              periodYear: data.year,
              periodMonth: data.month,
              createdBy: ctx.userId,
              createdAt: iso,
              ...fields
            })
            .run()
        const settled = anySettlementRow(tx, data.contactId, data.year, data.month) as LaundrySettlementRow
        audit({
          entity: 'laundry_settlement',
          entityId: id,
          action: before ? 'update' : 'create',
          before,
          after: settled,
          reason
        })
        return { ...check, settled }
      })
    },

    /**
     * Opens a settled month again (S-127): the invoice figures are cleared and the month's expense is voided, so
     * slips can be added or voided and the month settled anew. Manager / owner only, with a reason; the audit row
     * keeps the old settlement. The stored row stays (never deleted); `settledAt` null = open.
     */
    reopenMonth(ctx: Ctx, input: LaundryReopenInput): LaundryMonth {
      requirePermission(ctx, 'laundry', 'edit')
      // S-127 says owner / manager. `business_day.close` is not the right gate: the accountant holds it by default,
      // so a dedicated key (owner + manager by default) keeps the accountant out; the owner can still hand it out.
      requirePermission(ctx, 'laundry.reopen', 'edit')
      const data = parseInput(laundryReopenInputSchema, input)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        laundryOf(tx, data.contactId)
        const before = settlementRow(tx, data.contactId, data.year, data.month)
        if (!before) throw conflict('errors.laundryMonthNotSettled')
        const iso = now.toISOString()
        // Reopening rewrites the month's books: the last day of the month must be writable even when no expense exists.
        const { last } = monthBounds(data.year, data.month)
        assertDayWritable(tx, ctx, last, data.reason)
        if (before.expenseId) {
          requirePermission(ctx, 'expenses', 'edit')
          const expenseBefore = tx.select().from(expenses).where(eq(expenses.id, before.expenseId)).get()
          tx.update(expenses)
            .set({ voidedAt: iso, voidReason: 'laundry_reopened', updatedAt: iso })
            .where(and(eq(expenses.id, before.expenseId), isNull(expenses.voidedAt)))
            .run()
          audit({
            entity: 'expense',
            entityId: before.expenseId,
            action: 'void',
            before: expenseBefore,
            after: { ...expenseBefore, voidedAt: iso, voidReason: 'laundry_reopened' },
            reason: `laundry_reopened: ${data.reason}`
          })
        }
        tx.update(laundrySettlements)
          .set({
            invoicedTotalMinor: null,
            differenceMinor: null,
            expenseId: null,
            settledAt: null,
            updatedAt: iso
          })
          .where(eq(laundrySettlements.id, before.id))
          .run()
        audit({
          entity: 'laundry_settlement',
          entityId: before.id,
          action: 'reopen',
          before,
          after: anySettlementRow(tx, data.contactId, data.year, data.month),
          reason: data.reason
        })
        const check = withInvoice(compute(tx, data.contactId, data.year, data.month), 0)
        return { ...check, settled: null }
      })
    }
  }
}

export type LaundryService = ReturnType<typeof createLaundryService>
