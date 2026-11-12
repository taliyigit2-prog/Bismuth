// Day ledger, month view, drawer panel and handover history, day closing and the month summary (03-mimari.md §4.5,
// §5, §6.4, §6.10; G-60…G-64, G-67, G-70, G-72, G-100). Income = payments of the business day (reservation and
// sale folios alike: the reservation panel writes the same rows, G-60); expenses only from sections the caller can
// see. Totals are computed from the visible rows only; `partial` marks a view with a hidden section (kısmi görünüm).
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  like,
  lt,
  lte,
  ne,
  or,
  type SQL
} from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import * as z from 'zod'
import {
  closeDaySchema,
  dayNoteSchema,
  reopenDaySchema,
  yearMonthSchema,
  type CloseDayInput,
  type DayNoteInput,
  type ReopenDayInput,
  type YearMonthInput
} from '@shared/contract/ledger'
import { LEDGER_SORTS, type LedgerSort } from '@shared/contract/procedures/ledger'
import { daySchema } from '@shared/contract/expenses'
import {
  cashPanel,
  expensesBase,
  revenueBase,
  sortDayRows,
  type CashPanel,
  type MethodGroup
} from '@shared/domain/cash'
import { folioTotals } from '@shared/domain/payment-allocation'
import { normalizeName } from '@shared/domain/normalize'
import { topExpenses, type ExpenseForTop, type TopGroup } from '@shared/domain/reports'
import { addDays, localDate, localDateOf, type LocalDate } from '@shared/date'
import { money, multiplyRatio } from '@shared/money'
import {
  businessDays,
  cashHandovers,
  charges,
  employees,
  expenseItems,
  expenses,
  extraServices,
  folios,
  guests,
  paymentMethods,
  payments,
  products,
  reservationRooms,
  reservations,
  rooms,
  salesChannels,
  staffTransactions,
  userPreferences,
  users
} from '../db/schema'
import { ctxKind, type Ctx } from './context'
import { baseCurrencyOf } from './currency-service'
import { assertDayWritable, drawerAllowedIn, sectionAccess } from './expenses-service'
import { permissionDenied } from './errors'
import {
  conflict,
  inTransaction,
  newId,
  notFound,
  parseInput,
  requirePermission,
  type ServiceDeps,
  type Tx
} from './kit'
import { readSetting } from './settings-service'

type Reader = Pick<Tx, 'select'>

const daySortSchema = z.enum(LEDGER_SORTS)

type StaffKind = (typeof staffTransactions.$inferSelect)['kind']

export interface LedgerIncomeRow {
  id: string
  /** Entry time (ISO): second sort key after the method group. */
  at: string
  date: string
  kind: 'payment' | 'deposit' | 'refund'
  methodId: string
  methodCode: string
  methodGroup: MethodGroup
  isCash: boolean
  amountMinor: number
  currency: string
  amountBaseMinor: number | null
  fxRateToBase: number | null
  fxRateObservedAt: string | null
  fxSource: string | null
  /** Currency of the folio the payment is on (the edit form's typed rates, K-43). */
  folioCurrency: string
  channelId: string | null
  /** Payment channel, else the reservation's channel ("Platform" column). */
  channelCode: string | null
  reservationId: string | null
  reservationCode: string | null
  guestName: string | null
  roomNumbers: string[]
  /** Title of a stand-alone sale folio (luggage storage…). */
  saleTitle: string | null
  reference: string | null
  note: string | null
  /** The owner's "x" (G-64). */
  collected: boolean
  collectedAt: string | null
  collectedByName: string | null
  handoverId: string | null
  createdByName: string | null
  recordedByEmployeeId: string | null
  voided: boolean
  voidReason: string | null
}

export interface LedgerExpenseItem {
  id: string
  productId: string
  productName: string | null
  qtyMilli: number
  unitPriceMinor: number
  amountMinor: number
}

export interface LedgerExpenseRow {
  id: string
  at: string
  date: string
  sectionId: string
  sectionCode: string
  kind: 'manual' | 'staff' | 'laundry'
  staffKind: StaffKind | null
  description: string
  descriptionKey: string
  amountMinor: number
  currency: string
  amountBaseMinor: number | null
  fxRateToBase: number | null
  fxRateObservedAt: string | null
  fxSource: string | null
  methodId: string | null
  /** Group of the payment method; drawer expenses without a method count as cash. */
  methodGroup: MethodGroup
  /** The expense-side "x": paid out of the drawer. */
  paidFromDrawer: boolean
  settled: boolean
  handoverId: string | null
  employeeId: string | null
  employeeName: string | null
  laundrySettlementId: string | null
  items: LedgerExpenseItem[]
  createdByName: string | null
  recordedByEmployeeId: string | null
  voided: boolean
  voidReason: string | null
}

export interface LedgerTotals {
  baseCurrency: string
  revenueBaseMinor: number
  expensesBaseMinor: number
  netBaseMinor: number
  /** Rows left out of the totals because no rate was known when they were written. */
  missingRate: number
  /** Per original currency, visible live rows only. */
  byCurrency: { currency: string; incomeMinor: number; expensesMinor: number }[]
}

export interface LedgerDay {
  date: LocalDate
  status: 'open' | 'closed'
  closedAt: string | null
  closedBy: string | null
  closedByName: string | null
  note: string | null
  closingEnabled: boolean
  /** Cash → bank → card → …, then entry time (02-excel-analizi §1.1). */
  income: LedgerIncomeRow[]
  expenses: LedgerExpenseRow[]
  totals: LedgerTotals
  partial: boolean
}

export interface CashPanelView extends CashPanel {
  partial: boolean
}

/** The rows a drawer figure was computed from (shift handover snapshot). */
export interface CashSnapshotRows {
  payments: string[]
  expenses: string[]
}

export interface HandoverView {
  id: string
  at: string
  byName: string | null
  note: string | null
  pending: CashPanel['pending']
  drawer: CashPanel['drawer']
  paymentCount: number
  expenseCount: number
  revertedAt: string | null
  revertedByName: string | null
  revertReason: string | null
}

export interface DrawerPanelView extends CashPanelView {
  /** What "everything up to today" takes: uncollected rows dated today or earlier (B17). */
  pendingToday: CashPanel['pending']
  baseCurrency: string
  monthFrom: LocalDate
  uncollectedCount: number
  unsettledExpenseCount: number
  oldestDate: LocalDate | null
  lastHandover: HandoverView | null
  /** Cash "everything up to today" takes: uncollected cash rows dated today or earlier, per currency (QA2a). */
  cashToday: Record<string, number>
  /**
   * Unsettled drawer expenses per day and currency, staff money (advances, salary payments) apart: what a handover
   * settles with the cash it takes, so "Teslim al" shows the net the history will keep (QA2a).
   */
  drawerOut: { date: LocalDate; currency: string; expensesMinor: number; staffMinor: number }[]
}

export interface MonthSummary {
  year: number
  month: number
  from: LocalDate
  /** Exclusive end (first day of the next month). */
  to: LocalDate
  baseCurrency: string
  revenueBaseMinor: number
  expensesBaseMinor: number
  profitBaseMinor: number
  revenueByMethodGroup: Partial<Record<MethodGroup, number>>
  /** Channel code → base amount; payments without a channel under "none". */
  revenueByChannel: Record<string, number>
  /** Original currency → signed amount in that currency. */
  revenueByCurrency: Record<string, number>
  topExpenses: TopGroup[]
  missingRate: { payments: number; expenses: number }
  partial: boolean
}

/** Where the person's remembered day order lives (user_preferences; not a settings key). */
export const LEDGER_SORT_PREF = 'ledger.sort'

const paymentChannel = alias(salesChannels, 'payment_channel')
const reservationChannel = alias(salesChannels, 'reservation_channel')

/** Display names of accounts and the employee card each account belongs to (one query each). */
function peopleOf(db: Reader, userIds: readonly (string | null)[]) {
  const ids = [...new Set(userIds.filter((u): u is string => !!u))]
  const names = new Map<string, string>()
  const employeeOfUser = new Map<string, string>()
  if (!ids.length) return { names, employeeOfUser }
  for (const u of db
    .select({ id: users.id, name: users.displayName })
    .from(users)
    .where(inArray(users.id, ids))
    .all())
    names.set(u.id, u.name)
  for (const e of db
    .select({ id: employees.id, userId: employees.userId })
    .from(employees)
    .where(inArray(employees.userId, ids))
    .all())
    if (e.userId) employeeOfUser.set(e.userId, e.id)
  return { names, employeeOfUser }
}

/** Payments with method, channel, reservation and guest (left joins: a sale folio has no reservation). */
function loadIncome(db: Reader, where: SQL | undefined, withRooms: boolean): LedgerIncomeRow[] {
  const rows = db
    .select({
      p: payments,
      methodCode: paymentMethods.code,
      methodGroup: paymentMethods.group,
      isCash: paymentMethods.isCash,
      paymentChannel: paymentChannel.code,
      reservationChannel: reservationChannel.code,
      reservationChannelId: reservations.channelId,
      reservationId: reservations.id,
      reservationCode: reservations.code,
      folioKind: folios.kind,
      folioTitle: folios.title,
      folioCurrency: folios.currency,
      firstName: guests.firstName,
      lastName: guests.lastName
    })
    .from(payments)
    .innerJoin(paymentMethods, eq(paymentMethods.id, payments.methodId))
    .innerJoin(folios, eq(folios.id, payments.folioId))
    .leftJoin(reservations, eq(reservations.id, folios.reservationId))
    .leftJoin(guests, eq(guests.id, reservations.primaryGuestId))
    .leftJoin(paymentChannel, eq(paymentChannel.id, payments.channelId))
    .leftJoin(reservationChannel, eq(reservationChannel.id, reservations.channelId))
    .where(where)
    .orderBy(asc(payments.createdAt))
    .all()
  const roomsByReservation = withRooms
    ? roomNumbersOf(
        db,
        rows.flatMap((r) => (r.reservationId ? [r.reservationId] : []))
      )
    : new Map<string, string[]>()
  const people = peopleOf(
    db,
    rows.flatMap((r) => [r.p.createdBy, r.p.collectedBy])
  )
  return rows.map((r) => ({
    id: r.p.id,
    at: r.p.createdAt,
    date: r.p.date,
    kind: r.p.kind,
    methodId: r.p.methodId,
    methodCode: r.methodCode,
    methodGroup: r.methodGroup,
    isCash: r.isCash,
    amountMinor: r.p.amountMinor,
    currency: r.p.currency,
    amountBaseMinor: r.p.amountBaseMinor,
    fxRateToBase: r.p.fxRateToBase,
    fxRateObservedAt: r.p.fxRateObservedAt,
    fxSource: r.p.fxSource,
    folioCurrency: r.folioCurrency,
    channelId: r.p.channelId ?? r.reservationChannelId ?? null,
    channelCode: r.paymentChannel ?? r.reservationChannel ?? null,
    reservationId: r.reservationId ?? null,
    reservationCode: r.reservationCode ?? null,
    guestName: r.firstName != null ? `${r.firstName} ${r.lastName ?? ''}`.trim() : null,
    roomNumbers: (r.reservationId && roomsByReservation.get(r.reservationId)) || [],
    saleTitle: r.folioKind === 'reservation' ? null : (r.folioTitle ?? null),
    reference: r.p.reference,
    note: r.p.note,
    collected: r.p.collectedAt != null,
    collectedAt: r.p.collectedAt,
    collectedByName: (r.p.collectedBy && people.names.get(r.p.collectedBy)) || null,
    handoverId: r.p.handoverId,
    createdByName: (r.p.createdBy && people.names.get(r.p.createdBy)) || null,
    recordedByEmployeeId: (r.p.createdBy && people.employeeOfUser.get(r.p.createdBy)) || null,
    voided: r.p.voidedAt != null,
    voidReason: r.p.voidReason
  }))
}

function roomNumbersOf(db: Reader, reservationIds: readonly string[]): Map<string, string[]> {
  const out = new Map<string, string[]>()
  const ids = [...new Set(reservationIds)]
  if (!ids.length) return out
  const rows = db
    .select({ reservationId: reservationRooms.reservationId, number: rooms.number })
    .from(reservationRooms)
    .innerJoin(rooms, eq(rooms.id, reservationRooms.roomId))
    .where(and(inArray(reservationRooms.reservationId, ids), ne(reservationRooms.status, 'cancelled')))
    .orderBy(asc(reservationRooms.sort), asc(reservationRooms.checkIn))
    .all()
  for (const r of rows) {
    const list = out.get(r.reservationId) ?? []
    if (!list.includes(r.number)) list.push(r.number)
    out.set(r.reservationId, list)
  }
  return out
}

/** Product lines (with product names) of the given expenses. */
function itemsOf(db: Reader, expenseIds: readonly string[]): Map<string, LedgerExpenseItem[]> {
  const out = new Map<string, LedgerExpenseItem[]>()
  if (!expenseIds.length) return out
  const rows = db
    .select({ i: expenseItems, productName: products.name })
    .from(expenseItems)
    .leftJoin(products, eq(products.id, expenseItems.productId))
    .where(inArray(expenseItems.expenseId, [...expenseIds]))
    .orderBy(asc(expenseItems.createdAt), asc(expenseItems.id))
    .all()
  for (const { i, productName } of rows) {
    const list = out.get(i.expenseId) ?? []
    list.push({
      id: i.id,
      productId: i.productId,
      productName: productName ?? null,
      qtyMilli: i.qtyMilli,
      unitPriceMinor: i.unitPriceMinor,
      amountMinor: i.amountMinor
    })
    out.set(i.expenseId, list)
  }
  return out
}

/** Expenses of the visible sections matching `where` (K-42: staff money only for salary viewers). */
function loadExpenses(db: Reader, ctx: Ctx, where: SQL | undefined) {
  const access = sectionAccess(db, ctx)
  if (!access.viewIds.length) return { rows: [] as LedgerExpenseRow[], partial: access.partial }
  const codes = new Map(access.all.map((s) => [s.id, s.code]))
  const raw = db
    .select({
      e: expenses,
      methodGroup: paymentMethods.group,
      staffKind: staffTransactions.kind,
      employeeFirst: employees.firstName,
      employeeLast: employees.lastName
    })
    .from(expenses)
    .leftJoin(paymentMethods, eq(paymentMethods.id, expenses.methodId))
    .leftJoin(staffTransactions, eq(staffTransactions.id, expenses.staffTxnId))
    .leftJoin(employees, eq(employees.id, expenses.employeeId))
    .where(and(access.where, where))
    .orderBy(asc(expenses.createdAt))
    .all()
  const items = itemsOf(
    db,
    raw.map((r) => r.e.id)
  )
  const people = peopleOf(
    db,
    raw.map((r) => r.e.createdBy)
  )
  const rows = raw.map(({ e, methodGroup, staffKind, employeeFirst, employeeLast }): LedgerExpenseRow => ({
    id: e.id,
    at: e.createdAt,
    date: e.date,
    sectionId: e.sectionId,
    sectionCode: codes.get(e.sectionId) ?? '',
    kind: e.kind,
    staffKind: staffKind ?? null,
    description: e.description,
    descriptionKey: e.descriptionKey,
    amountMinor: e.amountMinor,
    currency: e.currency,
    amountBaseMinor: e.amountBaseMinor,
    fxRateToBase: e.fxRateToBase,
    fxRateObservedAt: e.fxRateObservedAt,
    fxSource: e.fxSource,
    methodId: e.methodId,
    methodGroup: methodGroup ?? (e.paidFromDrawer ? 'cash' : 'other'),
    paidFromDrawer: e.paidFromDrawer,
    settled: e.settledAt != null,
    handoverId: e.handoverId,
    employeeId: e.employeeId,
    employeeName: employeeFirst != null ? `${employeeFirst} ${employeeLast ?? ''}`.trim() : null,
    laundrySettlementId: e.laundrySettlementId,
    items: items.get(e.id) ?? [],
    createdByName: (e.createdBy && people.names.get(e.createdBy)) || null,
    recordedByEmployeeId: (e.createdBy && people.employeeOfUser.get(e.createdBy)) || null,
    voided: e.voidedAt != null,
    voidReason: e.voidReason
  }))
  return { rows, partial: access.partial }
}

function monthBounds(year: number, month: number): { from: LocalDate; to: LocalDate } {
  const from = localDate(`${year}-${String(month).padStart(2, '0')}-01`)
  const to =
    month === 12
      ? localDate(`${year + 1}-01-01`)
      : localDate(`${year}-${String(month + 1).padStart(2, '0')}-01`)
  return { from, to }
}

const signedBase = (r: LedgerIncomeRow): number | null =>
  r.amountBaseMinor == null ? null : r.kind === 'refund' ? -r.amountBaseMinor : r.amountBaseMinor

/** Income and expenses per original currency (live rows; refunds negative). */
function byCurrency(
  income: readonly LedgerIncomeRow[],
  spent: readonly LedgerExpenseRow[]
): LedgerTotals['byCurrency'] {
  const out = new Map<string, { currency: string; incomeMinor: number; expensesMinor: number }>()
  const of = (c: string) => {
    const row = out.get(c) ?? { currency: c, incomeMinor: 0, expensesMinor: 0 }
    out.set(c, row)
    return row
  }
  for (const r of income)
    if (!r.voided) of(r.currency).incomeMinor += r.kind === 'refund' ? -r.amountMinor : r.amountMinor
  for (const e of spent) if (!e.voided) of(e.currency).expensesMinor += e.amountMinor
  return [...out.values()].sort((a, b) => (a.currency < b.currency ? -1 : a.currency > b.currency ? 1 : 0))
}

export function createLedgerService(deps: ServiceDeps) {
  const { db } = deps

  function dayRow(tx: Reader, date: string) {
    return tx.select().from(businessDays).where(eq(businessDays.date, date)).get()
  }

  /** Creates the business_days row on first use, then applies `patch`. */
  function upsertDay(tx: Tx, date: string, patch: Partial<typeof businessDays.$inferInsert>, now: Date) {
    const at = now.toISOString()
    tx.insert(businessDays)
      .values({ date, status: 'open', createdAt: at, updatedAt: at, ...patch })
      .onConflictDoUpdate({ target: businessDays.date, set: { ...patch, updatedAt: at } })
      .run()
    return dayRow(tx, date) as typeof businessDays.$inferSelect
  }

  const nameOf = (userId: string | null): string | null =>
    userId
      ? (db.select({ n: users.displayName }).from(users).where(eq(users.id, userId)).get()?.n ?? null)
      : null

  function handoverViews(ctx: Ctx, rows: (typeof cashHandovers.$inferSelect)[]): HandoverView[] {
    const access = sectionAccess(db, ctx)
    const people = peopleOf(
      db,
      rows.flatMap((h) => [h.byUser, h.revertedBy])
    )
    return rows.map((h) => {
      const totals = h.totals as Partial<CashPanel> & { payments?: number; expenses?: number }
      const pending = totals.pending ?? {}
      let drawer = totals.drawer ?? {}
      let expenseCount = totals.expenses ?? 0
      // The stored drawer figure may hold a hidden section's drawer expenses (K-38): a partial view recomputes it
      // from the batch's rows it may see; an undone batch (rows released) shows the collected cash only.
      if (access.partial) {
        const cash: Record<string, number> = {}
        if (h.revertedAt) {
          for (const [c, g] of Object.entries(pending)) if (g?.cash) cash[c] = g.cash
          expenseCount = 0
        } else {
          const taken = loadIncome(db, eq(payments.handoverId, h.id), false)
          const spent = loadExpenses(db, ctx, eq(expenses.handoverId, h.id)).rows
          Object.assign(
            cash,
            cashPanel(
              taken.map((r) => ({ ...r, collected: false })),
              spent.map((e) => ({ ...e, settled: false }))
            ).drawer
          )
          expenseCount = spent.length
        }
        drawer = cash
      }
      return {
        id: h.id,
        at: h.at,
        byName: (h.byUser && people.names.get(h.byUser)) || null,
        note: h.note,
        pending,
        drawer,
        paymentCount: totals.payments ?? 0,
        expenseCount,
        revertedAt: h.revertedAt,
        revertedByName: (h.revertedBy && people.names.get(h.revertedBy)) || null,
        revertReason: h.revertReason
      }
    })
  }

  function listHandovers(ctx: Ctx, limit: number): HandoverView[] {
    const rows = db.select().from(cashHandovers).orderBy(desc(cashHandovers.at)).limit(limit).all()
    return handoverViews(ctx, rows)
  }

  /** Drawer panel figures (Excel "KASA DURUMU"): uncollected payments, unsettled visible drawer expenses. */
  function openDrawer(ctx: Ctx) {
    const income = loadIncome(db, and(isNull(payments.collectedAt), isNull(payments.voidedAt)), false)
    const exp = loadExpenses(
      db,
      ctx,
      and(eq(expenses.paidFromDrawer, true), isNull(expenses.settledAt), isNull(expenses.voidedAt))
    )
    return { income, exp, panel: cashPanel(income, exp.rows) }
  }

  function sortOf(ctx: Ctx): LedgerSort {
    if (!ctx.userId) return 'method'
    const row = db
      .select({ v: userPreferences.valueJson })
      .from(userPreferences)
      .where(and(eq(userPreferences.userId, ctx.userId), eq(userPreferences.key, LEDGER_SORT_PREF)))
      .get()
    if (!row) return 'method'
    try {
      const v = JSON.parse(row.v) as unknown
      return (LEDGER_SORTS as readonly unknown[]).includes(v) ? (v as LedgerSort) : 'method'
    } catch {
      return 'method'
    }
  }

  return {
    /** Lists and choices of the ledger screen: methods, channels, extra services, the caller's sections, order. */
    options(ctx: Ctx) {
      requirePermission(ctx, 'ledger', 'view')
      const now = deps.clock()
      const access = sectionAccess(db, ctx)
      const named = <T extends { id: string; code: string | null; name: string | null; nameI18n: unknown }>(
        r: T
      ) => ({ id: r.id, code: r.code, name: r.name, nameI18n: r.nameI18n as Record<string, string> | null })
      return {
        today: localDateOf(now),
        baseCurrency: baseCurrencyOf(db),
        currencies: readSetting(db, 'hotel.currencies'),
        closingEnabled: readSetting(db, 'businessDay.closingEnabled'),
        sort: sortOf(ctx),
        methods: db
          .select()
          .from(paymentMethods)
          .where(eq(paymentMethods.active, true))
          .orderBy(asc(paymentMethods.sort), asc(paymentMethods.createdAt))
          .all()
          .map((m) => ({ ...named(m), group: m.group, isCash: m.isCash })),
        channels: db
          .select()
          .from(salesChannels)
          .where(eq(salesChannels.active, true))
          .orderBy(asc(salesChannels.sort), asc(salesChannels.createdAt))
          .all()
          .map((c) => ({ ...named(c), kind: c.kind })),
        extraServices: db
          .select()
          .from(extraServices)
          .where(eq(extraServices.active, true))
          .orderBy(asc(extraServices.sort), asc(extraServices.createdAt))
          .all()
          .map((s) => ({
            ...named(s),
            defaultPriceMinor: s.defaultPriceMinor,
            defaultCurrency: s.defaultCurrency,
            unit: s.unit
          })),
        sections: access.all
          .filter((s) => s.active && ctx.can(s.visibilityPermission, 'view'))
          .map((s) => ({
            ...named(s),
            canEdit: ctx.can('expenses', 'edit') && ctx.can(s.visibilityPermission, 'edit'),
            drawerAllowed: drawerAllowedIn(s)
          }))
      }
    },

    /** The day page: income and visible expenses in the owner's order, totals of what the caller sees. */
    getDay(ctx: Ctx, date: string, opts: { includeVoided?: boolean } = {}): LedgerDay {
      requirePermission(ctx, 'ledger', 'view')
      const day = parseInput(daySchema, date)
      const voidFilter = (col: typeof payments.voidedAt | typeof expenses.voidedAt) =>
        opts.includeVoided ? undefined : isNull(col)
      const income = sortDayRows(
        loadIncome(db, and(eq(payments.date, day), voidFilter(payments.voidedAt)), true)
      )
      const exp = loadExpenses(db, ctx, and(eq(expenses.date, day), voidFilter(expenses.voidedAt)))
      const revenue = revenueBase(income)
      const spent = expensesBase(exp.rows)
      const row = dayRow(db, day)
      return {
        date: day,
        status: row?.status ?? 'open',
        closedAt: row?.closedAt ?? null,
        closedBy: row?.closedBy ?? null,
        closedByName: nameOf(row?.closedBy ?? null),
        note: row?.note ?? null,
        closingEnabled: readSetting(db, 'businessDay.closingEnabled'),
        income,
        expenses: sortDayRows(exp.rows),
        totals: {
          baseCurrency: baseCurrencyOf(db),
          revenueBaseMinor: revenue.totalMinor,
          expensesBaseMinor: spent.totalMinor,
          netBaseMinor: revenue.totalMinor - spent.totalMinor,
          missingRate: revenue.missingRate + spent.missingRate,
          byCurrency: byCurrency(income, exp.rows)
        },
        partial: exp.partial
      }
    },

    /**
     * The month as day bands (faz-07 madde 3): every payment and visible expense of the month (voided included,
     * struck through on screen), the day notes and closed days, and the employees the rows concern (filter).
     */
    month(ctx: Ctx, y: number, m: number) {
      requirePermission(ctx, 'ledger', 'view')
      const { year, month } = parseInput(yearMonthSchema, { year: y, month: m } satisfies YearMonthInput)
      const { from, to } = monthBounds(year, month)
      const income = sortDayRows(loadIncome(db, and(gte(payments.date, from), lt(payments.date, to)), true))
      const exp = loadExpenses(db, ctx, and(gte(expenses.date, from), lt(expenses.date, to)))
      const days = db
        .select()
        .from(businessDays)
        .where(
          and(
            gte(businessDays.date, from),
            lt(businessDays.date, to),
            or(isNotNull(businessDays.note), eq(businessDays.status, 'closed'))
          )
        )
        .orderBy(asc(businessDays.date))
        .all()
        .map((d) => ({ date: d.date as LocalDate, status: d.status, note: d.note }))
      const employeeIds = new Set<string>()
      for (const r of [...income, ...exp.rows])
        if (r.recordedByEmployeeId) employeeIds.add(r.recordedByEmployeeId)
      for (const e of exp.rows) if (e.employeeId) employeeIds.add(e.employeeId)
      const collator = new Intl.Collator('tr')
      const people = employeeIds.size
        ? db
            .select({ id: employees.id, first: employees.firstName, last: employees.lastName })
            .from(employees)
            .where(inArray(employees.id, [...employeeIds]))
            .all()
            .map((e) => ({ id: e.id, name: `${e.first} ${e.last}`.trim() }))
            .sort((a, b) => collator.compare(a.name, b.name))
        : []
      return {
        year,
        month,
        from,
        to,
        baseCurrency: baseCurrencyOf(db),
        closingEnabled: readSetting(db, 'businessDay.closingEnabled'),
        days,
        income,
        expenses: sortDayRows(exp.rows),
        employees: people,
        partial: exp.partial
      }
    },

    /** Remembers the person's order of the day's rows (the Excel "Sırala" tick, G-63). */
    setSort(ctx: Ctx, sort: LedgerSort) {
      requirePermission(ctx, 'ledger', 'view')
      const value = parseInput(daySortSchema, sort)
      const userId = ctx.userId
      // Only a real account keeps preferences (the program itself and test contexts have nobody to remember).
      if (!userId || ctxKind(ctx) !== 'user') return { ok: true as const }
      if (!db.select({ id: users.id }).from(users).where(eq(users.id, userId)).get())
        return { ok: true as const }
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const before = sortOf(ctx)
        const iso = now.toISOString()
        const valueJson = JSON.stringify(value)
        tx.insert(userPreferences)
          .values({
            id: newId(now),
            userId,
            key: LEDGER_SORT_PREF,
            valueJson,
            createdAt: iso,
            updatedAt: iso
          })
          .onConflictDoUpdate({
            target: [userPreferences.userId, userPreferences.key],
            set: { valueJson, updatedAt: iso }
          })
          .run()
        audit({
          entity: 'user_preference',
          entityId: `${userId}:${LEDGER_SORT_PREF}`,
          action: 'update',
          before,
          after: value
        })
        return { ok: true as const }
      })
    },

    /** The owner's day note ("Selin izin kullandı"). */
    setDayNote(ctx: Ctx, date: string, note: string | null, reason?: string) {
      requirePermission(ctx, 'ledger', 'edit')
      const data = parseInput(dayNoteSchema, { date, note, reason } satisfies DayNoteInput)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const written = assertDayWritable(tx, ctx, data.date, data.reason)
        const before = dayRow(tx, data.date) ?? null
        const text = data.note?.trim() ? data.note.trim() : null
        const after = upsertDay(tx, data.date, { note: text }, now)
        audit({
          entity: 'business_day',
          entityId: data.date,
          action: 'update',
          before: { note: before?.note ?? null },
          after: { note: text },
          reason: written
        })
        return after
      })
    },

    /** Drawer panel (Excel "KASA DURUMU"): every uncollected payment and unsettled drawer expense the caller sees. */
    cashPanel(ctx: Ctx): CashPanelView {
      requirePermission(ctx, 'cash', 'view')
      const { exp, panel } = openDrawer(ctx)
      return { ...panel, partial: exp.partial }
    },

    /** The drawer panel with the rows behind it: the shift handover keeps them in its snapshot (K-42 (3)). */
    cashSnapshot(ctx: Ctx): CashPanelView & { rows: CashSnapshotRows } {
      requirePermission(ctx, 'cash', 'view')
      const { income, exp, panel } = openDrawer(ctx)
      return {
        ...panel,
        partial: exp.partial,
        rows: { payments: income.map((r) => r.id), expenses: exp.rows.map((e) => e.id) }
      }
    },

    /**
     * A stored drawer snapshot as `ctx` may read it (K-42 (3)): the snapshot's rows as they stood then (uncollected,
     * live), the expenses filtered with the reader's own rights, so a hidden row never shows through the total.
     */
    cashPanelOfRows(ctx: Ctx, rows: CashSnapshotRows): CashPanelView {
      requirePermission(ctx, 'cash', 'view')
      const income = rows.payments.length ? loadIncome(db, inArray(payments.id, rows.payments), false) : []
      const exp = rows.expenses.length
        ? loadExpenses(db, ctx, inArray(expenses.id, rows.expenses))
        : { rows: [], partial: sectionAccess(db, ctx).partial }
      const panel = cashPanel(
        income.map((r) => ({ ...r, collected: false, voided: false })),
        exp.rows.map((e) => ({ ...e, settled: false, voided: false }))
      )
      return { ...panel, partial: exp.partial }
    },

    /**
     * The drawer panel of the top bar (faz-07 madde 2): the uncollected matrix, what should be in the drawer, the
     * month's channel totals, how many rows wait and since when, and the last handover.
     */
    drawerPanel(ctx: Ctx): DrawerPanelView {
      requirePermission(ctx, 'cash', 'view')
      const { income, exp, panel } = openDrawer(ctx)
      const today = localDateOf(deps.clock())
      const { from, to } = monthBounds(Number(today.slice(0, 4)), Number(today.slice(5, 7)))
      const monthIncome = loadIncome(
        db,
        and(gte(payments.date, from), lt(payments.date, to), isNull(payments.voidedAt)),
        false
      )
      const dates = [...income.map((r) => r.date), ...exp.rows.map((e) => e.date)].sort()
      const cashToday: Record<string, number> = {}
      for (const [c, v] of Object.entries(
        cashPanel(
          income.filter((r) => r.date <= today && r.isCash),
          []
        ).drawer
      ))
        if (v) cashToday[c] = v
      const out = new Map<string, DrawerPanelView['drawerOut'][number]>()
      for (const e of exp.rows) {
        const key = `${e.date}|${e.currency}`
        const row = out.get(key) ?? {
          date: e.date as LocalDate,
          currency: e.currency,
          expensesMinor: 0,
          staffMinor: 0
        }
        if (e.kind === 'staff') row.staffMinor += e.amountMinor
        else row.expensesMinor += e.amountMinor
        out.set(key, row)
      }
      return {
        ...panel,
        cashToday,
        drawerOut: [...out.values()].sort((a, b) => a.date.localeCompare(b.date)),
        pendingToday: cashPanel(
          income.filter((r) => r.date <= today),
          []
        ).pending,
        channels: cashPanel(monthIncome, []).channels,
        baseCurrency: baseCurrencyOf(db),
        monthFrom: from,
        uncollectedCount: income.length,
        unsettledExpenseCount: exp.rows.length,
        oldestDate: (dates[0] as LocalDate | undefined) ?? null,
        // B21: the last handover still in force (an undone one is no longer "the last x"), as on the Today card.
        lastHandover:
          handoverViews(
            ctx,
            db
              .select()
              .from(cashHandovers)
              .where(isNull(cashHandovers.revertedAt))
              .orderBy(desc(cashHandovers.at))
              .limit(1)
              .all()
          )[0] ?? null,
        partial: exp.partial
      }
    },

    /** The Today card (P9c): the drawer per currency, what waits for the owner, the last handover. */
    drawerSummary(ctx: Ctx) {
      requirePermission(ctx, 'cash', 'view')
      const { income, exp, panel } = openDrawer(ctx)
      const pending: Record<string, number> = {}
      for (const [c, groups] of Object.entries(panel.pending))
        pending[c] = Object.values(groups ?? {}).reduce((s, v) => s + (v ?? 0), 0)
      const last = db
        .select()
        .from(cashHandovers)
        .where(isNull(cashHandovers.revertedAt))
        .orderBy(desc(cashHandovers.at))
        .limit(1)
        .get()
      return {
        drawer: panel.drawer,
        pending,
        uncollectedCount: income.length,
        lastHandover: last ? { at: last.at, byName: nameOf(last.byUser) } : null,
        partial: exp.partial
      }
    },

    /** Handover history, newest first (who, when, how much, how many rows; reverted ones stay listed). */
    handovers(ctx: Ctx, limit = 30): HandoverView[] {
      requirePermission(ctx, 'cash', 'view')
      return listHandovers(ctx, Math.min(Math.max(limit, 1), 200))
    },

    /**
     * Reservations to put a payment on (faz-07 madde 1 "Yeni gelir → rezervasyon seç"): by default the ones in
     * the hotel around `date`; with `q` any reservation whose guest, code or room matches. Balance in the folio
     * currency.
     */
    searchReservations(ctx: Ctx, q: string | undefined, date: string) {
      requirePermission(ctx, 'payments', 'view')
      const day = parseInput(daySchema, date)
      const text = (q ?? '').trim()
      const key = normalizeName(text)
      let ids: string[]
      if (!text) {
        ids = db
          .selectDistinct({ id: reservationRooms.reservationId })
          .from(reservationRooms)
          .where(
            and(
              lte(reservationRooms.checkIn, day),
              gte(reservationRooms.checkOut, day),
              ne(reservationRooms.status, 'cancelled')
            )
          )
          .all()
          .map((r) => r.id)
      } else {
        const byRoom = db
          .selectDistinct({ id: reservationRooms.reservationId })
          .from(reservationRooms)
          .innerJoin(rooms, eq(rooms.id, reservationRooms.roomId))
          .where(
            and(
              eq(rooms.number, text),
              lte(reservationRooms.checkIn, addDays(day, 1)),
              gte(reservationRooms.checkOut, addDays(day, -1))
            )
          )
          .all()
          .map((r) => r.id)
        const byName = db
          .select({ id: reservations.id })
          .from(reservations)
          .innerJoin(guests, eq(guests.id, reservations.primaryGuestId))
          .where(
            or(
              key ? like(guests.nameNormalized, `%${key}%`) : undefined,
              like(reservations.code, `%${text.toUpperCase()}%`)
            )
          )
          .orderBy(desc(reservations.createdAt))
          .limit(40)
          .all()
          .map((r) => r.id)
        ids = [...new Set([...byRoom, ...byName])]
      }
      if (!ids.length) return []
      const rows = db
        .select({ r: reservations, first: guests.firstName, last: guests.lastName, folio: folios })
        .from(reservations)
        .innerJoin(guests, eq(guests.id, reservations.primaryGuestId))
        .leftJoin(folios, eq(folios.reservationId, reservations.id))
        .where(and(inArray(reservations.id, ids), ne(reservations.status, 'cancelled')))
        .all()
      const stays = db
        .select({
          reservationId: reservationRooms.reservationId,
          checkIn: reservationRooms.checkIn,
          checkOut: reservationRooms.checkOut,
          number: rooms.number
        })
        .from(reservationRooms)
        .innerJoin(rooms, eq(rooms.id, reservationRooms.roomId))
        .where(and(inArray(reservationRooms.reservationId, ids), ne(reservationRooms.status, 'cancelled')))
        .orderBy(asc(reservationRooms.sort))
        .all()
      const folioIds = rows.flatMap((r) => (r.folio ? [r.folio.id] : []))
      const chargeRows = folioIds.length
        ? db.select().from(charges).where(inArray(charges.folioId, folioIds)).all()
        : []
      const payRows = folioIds.length
        ? db.select().from(payments).where(inArray(payments.folioId, folioIds)).all()
        : []
      const collator = new Intl.Collator('tr', { numeric: true })
      return rows
        .map(({ r, first, last, folio }) => {
          const own = stays.filter((s) => s.reservationId === r.id)
          const totals = folio
            ? folioTotals(
                chargeRows
                  .filter((c) => c.folioId === folio.id)
                  .map((c) => ({ amountMinor: c.amountMinor, voided: !!c.voidedAt })),
                payRows
                  .filter((p) => p.folioId === folio.id)
                  .map((p) => ({ kind: p.kind, amountFolioMinor: p.amountFolioMinor, voided: !!p.voidedAt }))
              )
            : { balanceMinor: 0 }
          return {
            reservationId: r.id,
            code: r.code,
            guestName: `${first} ${last}`.trim(),
            roomNumbers: [...new Set(own.map((s) => s.number))],
            checkIn: (own.map((s) => s.checkIn).sort()[0] ?? day) as LocalDate,
            checkOut: (own
              .map((s) => s.checkOut)
              .sort()
              .at(-1) ?? day) as LocalDate,
            status: r.status,
            currency: folio?.currency ?? baseCurrencyOf(db),
            balanceMinor: totals.balanceMinor,
            channelId: r.channelId
          }
        })
        .sort(
          (a, b) =>
            collator.compare(a.roomNumbers[0] ?? '~', b.roomNumbers[0] ?? '~') ||
            (a.checkIn < b.checkIn ? 1 : a.checkIn > b.checkIn ? -1 : 0)
        )
        .slice(0, 30)
    },

    /** One expense as the ledger shows it (edit form); hidden sections answer "no permission". */
    expenseRow(ctx: Ctx, id: string): LedgerExpenseRow {
      requirePermission(ctx, 'expenses', 'view')
      const { rows } = loadExpenses(db, ctx, eq(expenses.id, id))
      const row = rows[0]
      if (!row) {
        if (db.select({ id: expenses.id }).from(expenses).where(eq(expenses.id, id)).get())
          throw permissionDenied()
        throw notFound('expense', id)
      }
      return row
    },

    /** G-72: only when `businessDay.closingEnabled`; afterwards writes need `ledger.locked` and a reason. */
    closeDay(ctx: Ctx, day: string) {
      requirePermission(ctx, 'business_day.close', 'edit')
      const { date } = parseInput(closeDaySchema, { date: day } satisfies CloseDayInput)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        if (!readSetting(tx, 'businessDay.closingEnabled')) throw conflict('errors.dayClosingDisabled')
        const before = dayRow(tx, date) ?? null
        if (before?.status === 'closed') throw conflict('errors.dayAlreadyClosed', { date })
        const after = upsertDay(
          tx,
          date,
          { status: 'closed', closedAt: now.toISOString(), closedBy: ctx.userId },
          now
        )
        audit({ entity: 'business_day', entityId: date, action: 'close', before, after })
        return after
      })
    },

    reopenDay(ctx: Ctx, day: string, why: string) {
      requirePermission(ctx, 'business_day.close', 'edit')
      const { date, reason } = parseInput(reopenDaySchema, {
        date: day,
        reason: why
      } satisfies ReopenDayInput)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const before = dayRow(tx, date)
        if (before?.status !== 'closed') throw conflict('errors.dayNotClosed', { date })
        const after = upsertDay(tx, date, { status: 'open', closedAt: null, closedBy: null }, now)
        audit({ entity: 'business_day', entityId: date, action: 'reopen', before, after, reason })
        return after
      })
    },

    /** Month figures in the base currency (S-40, G-100): revenue, expenses, profit, breakdowns, top expenses. */
    monthSummary(ctx: Ctx, y: number, m: number): MonthSummary {
      requirePermission(ctx, 'reports.finance', 'view')
      const { year, month } = parseInput(yearMonthSchema, { year: y, month: m } satisfies YearMonthInput)
      const { from, to } = monthBounds(year, month)
      const base = baseCurrencyOf(db)
      const income = loadIncome(
        db,
        and(gte(payments.date, from), lt(payments.date, to), isNull(payments.voidedAt)),
        false
      )
      const exp = loadExpenses(
        db,
        ctx,
        and(gte(expenses.date, from), lt(expenses.date, to), isNull(expenses.voidedAt))
      )
      const revenue = revenueBase(income)
      const spent = expensesBase(exp.rows)

      const byGroup: Partial<Record<MethodGroup, number>> = {}
      const byChannel: Record<string, number> = {}
      const byCur: Record<string, number> = {}
      for (const r of income) {
        byCur[r.currency] = (byCur[r.currency] ?? 0) + (r.kind === 'refund' ? -r.amountMinor : r.amountMinor)
        const b = signedBase(r)
        if (b == null) continue
        byGroup[r.methodGroup] = (byGroup[r.methodGroup] ?? 0) + b
        const ch = r.channelCode ?? 'none'
        byChannel[ch] = (byChannel[ch] ?? 0) + b
      }

      return {
        year,
        month,
        from,
        to,
        baseCurrency: base,
        revenueBaseMinor: revenue.totalMinor,
        expensesBaseMinor: spent.totalMinor,
        profitBaseMinor: revenue.totalMinor - spent.totalMinor,
        revenueByMethodGroup: byGroup,
        revenueByChannel: byChannel,
        revenueByCurrency: byCur,
        topExpenses: topExpenses(expensesForTop(db, exp.rows)),
        missingRate: { payments: revenue.missingRate, expenses: spent.missingRate },
        partial: exp.partial
      }
    }
  }
}

/**
 * Inputs of topExpenses (§6.10): product lines by product category, each line's base value taken with the
 * expense's own frozen rate (line × base ÷ amount). Rows without a base value are left out (counted elsewhere).
 */
function expensesForTop(db: Reader, rows: readonly LedgerExpenseRow[]): ExpenseForTop[] {
  const priced = rows.filter((r) => r.amountBaseMinor != null)
  const ids = priced.map((r) => r.id)
  const lines = ids.length
    ? db
        .select({
          expenseId: expenseItems.expenseId,
          amountMinor: expenseItems.amountMinor,
          categoryId: products.categoryId
        })
        .from(expenseItems)
        .innerJoin(products, eq(products.id, expenseItems.productId))
        .where(inArray(expenseItems.expenseId, ids))
        .all()
    : []
  return priced.map((r) => {
    const base = r.amountBaseMinor as number
    const items = lines
      .filter((l) => l.expenseId === r.id)
      .map((l) => ({
        productCategoryId: l.categoryId,
        amountBaseMinor:
          r.amountMinor === 0
            ? 0
            : multiplyRatio(money(l.amountMinor, r.currency), base, r.amountMinor).amountMinor
      }))
    return {
      amountBaseMinor: base,
      description: r.description,
      descriptionKey: r.descriptionKey,
      kind: r.kind,
      items
    }
  })
}

export type LedgerService = ReturnType<typeof createLedgerService>
