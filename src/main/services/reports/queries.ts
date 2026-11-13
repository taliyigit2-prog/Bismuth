// Report reads (03-mimari.md §6.10; Faz 16 target: ten years × twenty rooms): money and nights are summed in SQL
// with GROUP BY, so a ten-year range returns a few thousand grouped rows, never every payment or night. Payments and
// expenses carry their base amount frozen when they were written (K-15); room-night charges have none, so only the
// rare foreign-currency ones are converted row by row with the rate of their writing minute (revenue-base.ts rule).
import { and, asc, eq, gte, inArray, isNotNull, isNull, lt, ne, sql, type SQL } from 'drizzle-orm'
import { alias, type AnySQLiteColumn } from 'drizzle-orm/sqlite-core'
import type { LocalDate } from '@shared/date'
import type { MethodGroup } from '@shared/domain/cash'
import type { ExpenseForTop } from '@shared/domain/reports'
import type { BlockSpan, CapacityChange, Period, RoomCapacity } from '@shared/domain/reports-period'
import { money, multiplyRatio } from '@shared/money'
import {
  auditLog,
  charges,
  expenseItems,
  expenses,
  folios,
  fxRates,
  paymentMethods,
  payments,
  products,
  reservationRooms,
  reservations,
  roomBlocks,
  roomCapacityChanges,
  roomNights,
  rooms,
  salesChannels
} from '../../db/schema'
import { freezeAt } from '../currency-service'
import type { Tx } from '../kit'

export type Reader = Pick<Tx, 'select' | 'selectDistinct'>

/** Reservation states whose nights are on the calendar (cancelled, no-show and parked ones released theirs). */
export const LIVE_STATUSES = ['tentative', 'confirmed', 'checked_in', 'checked_out'] as const

export type Grain = 'day' | 'month'

const bucketOf = (column: AnySQLiteColumn, grain: Grain): SQL<string> =>
  grain === 'day' ? sql<string>`${column}` : sql<string>`substr(${column}, 1, 7)`

const inPeriod = (column: AnySQLiteColumn, p: Period): SQL | undefined =>
  and(gte(column, p.from), lt(column, p.to))

const paymentChannel = alias(salesChannels, 'report_payment_channel')
const reservationChannel = alias(salesChannels, 'report_reservation_channel')

export interface PaymentFact {
  /** Day or month. */
  bucket: string
  methodId: string
  group: MethodGroup
  /** Payment channel, else the reservation's; null = none. */
  channel: string | null
  currency: string
  /** Original currency, refunds negative. */
  amountMinor: number
  /** Base currency, refunds negative; rows without a rate left out (counted in `missing`). */
  baseMinor: number
  pendingMinor: number
  pendingBaseMinor: number
  rows: number
  pendingRows: number
  missing: number
}

/** Live payments of the period grouped by bucket × method × channel × currency. */
export function paymentFacts(db: Reader, p: Period, grain: Grain): PaymentFact[] {
  const signed = sql`case when ${payments.kind} = 'refund' then -1 else 1 end`
  const bucket = bucketOf(payments.date, grain)
  const channel = sql<string | null>`coalesce(${paymentChannel.code}, ${reservationChannel.code})`
  const pending = sql`(${payments.collectedAt} is null)`
  return db
    .select({
      bucket,
      methodId: payments.methodId,
      group: paymentMethods.group,
      channel,
      currency: payments.currency,
      amountMinor: sql<number>`coalesce(sum(${signed} * ${payments.amountMinor}), 0)`,
      baseMinor: sql<number>`coalesce(sum(${signed} * coalesce(${payments.amountBaseMinor}, 0)), 0)`,
      pendingMinor: sql<number>`coalesce(sum(case when ${pending} then ${signed} * ${payments.amountMinor} else 0 end), 0)`,
      pendingBaseMinor: sql<number>`coalesce(sum(case when ${pending} then ${signed} * coalesce(${payments.amountBaseMinor}, 0) else 0 end), 0)`,
      rows: sql<number>`count(*)`,
      pendingRows: sql<number>`coalesce(sum(case when ${pending} then 1 else 0 end), 0)`,
      missing: sql<number>`coalesce(sum(case when ${payments.amountBaseMinor} is null then 1 else 0 end), 0)`
    })
    .from(payments)
    .innerJoin(paymentMethods, eq(paymentMethods.id, payments.methodId))
    .innerJoin(folios, eq(folios.id, payments.folioId))
    .leftJoin(reservations, eq(reservations.id, folios.reservationId))
    .leftJoin(paymentChannel, eq(paymentChannel.id, payments.channelId))
    .leftJoin(reservationChannel, eq(reservationChannel.id, reservations.channelId))
    .where(and(isNull(payments.voidedAt), inPeriod(payments.date, p)))
    .groupBy(bucket, payments.methodId, channel, payments.currency)
    .orderBy(asc(bucket))
    .all()
}

export interface ExpenseFact {
  bucket: string
  sectionId: string
  kind: 'manual' | 'staff' | 'laundry'
  currency: string
  amountMinor: number
  baseMinor: number
  rows: number
  missing: number
}

/**
 * The expense rows a caller may read (expenses-service `sectionAccess`): the visible sections and the K-42 (2)
 * staff-money filter, so a report never shows more than the same role's ledger.
 */
export interface ExpenseScope {
  viewIds: readonly string[]
  where: SQL | undefined
}

/** Live expenses of the caller's scope grouped by bucket × section × kind × currency. */
export function expenseFacts(db: Reader, p: Period, grain: Grain, scope: ExpenseScope): ExpenseFact[] {
  if (!scope.viewIds.length) return []
  const bucket = bucketOf(expenses.date, grain)
  return db
    .select({
      bucket,
      sectionId: expenses.sectionId,
      kind: expenses.kind,
      currency: expenses.currency,
      amountMinor: sql<number>`coalesce(sum(${expenses.amountMinor}), 0)`,
      baseMinor: sql<number>`coalesce(sum(coalesce(${expenses.amountBaseMinor}, 0)), 0)`,
      rows: sql<number>`count(*)`,
      missing: sql<number>`coalesce(sum(case when ${expenses.amountBaseMinor} is null then 1 else 0 end), 0)`
    })
    .from(expenses)
    .where(and(isNull(expenses.voidedAt), inPeriod(expenses.date, p), scope.where))
    .groupBy(bucket, expenses.sectionId, expenses.kind, expenses.currency)
    .orderBy(asc(bucket))
    .all()
}

/**
 * Inputs of topExpenses (§6.10) for the period: descriptions summed in SQL per kind and key (label = the first
 * spelling written), product lines per category with each line's base share taken with its expense's own rate
 * (the same rule as the ledger's month summary).
 */
export function expensesForTop(db: Reader, p: Period, scope: ExpenseScope): ExpenseForTop[] {
  if (!scope.viewIds.length) return []
  const where = and(
    isNull(expenses.voidedAt),
    inPeriod(expenses.date, p),
    scope.where,
    isNotNull(expenses.amountBaseMinor)
  )
  const withItems = new Set<string>(
    db
      .selectDistinct({ id: expenseItems.expenseId })
      .from(expenseItems)
      .innerJoin(expenses, eq(expenses.id, expenseItems.expenseId))
      .where(where)
      .all()
      .map((r) => r.id)
  )
  const grouped = db
    .select({
      kind: expenses.kind,
      key: expenses.descriptionKey,
      label: sql<string>`min(${expenses.createdAt} || char(31) || ${expenses.description})`,
      total: sql<number>`sum(${expenses.amountBaseMinor})`
    })
    .from(expenses)
    .where(
      and(
        where,
        withItems.size
          ? sql`${expenses.id} not in (select ${expenseItems.expenseId} from ${expenseItems})`
          : undefined
      )
    )
    .groupBy(expenses.kind, expenses.descriptionKey)
    .all()
  const out: ExpenseForTop[] = grouped.map((g) => ({
    amountBaseMinor: g.total,
    description: g.label.slice(g.label.indexOf('\u001f') + 1),
    descriptionKey: g.key,
    kind: g.kind
  }))
  if (!withItems.size) return out
  // Purchases with product lines: few rows (supply screen), read one by one with their lines.
  const purchases = db
    .select({
      id: expenses.id,
      kind: expenses.kind,
      key: expenses.descriptionKey,
      description: expenses.description,
      amountMinor: expenses.amountMinor,
      currency: expenses.currency,
      base: expenses.amountBaseMinor,
      createdAt: expenses.createdAt
    })
    .from(expenses)
    .where(and(where, inArray(expenses.id, [...withItems])))
    .orderBy(asc(expenses.createdAt))
    .all()
  const lines = db
    .select({
      expenseId: expenseItems.expenseId,
      amountMinor: expenseItems.amountMinor,
      categoryId: products.categoryId
    })
    .from(expenseItems)
    .innerJoin(products, eq(products.id, expenseItems.productId))
    .innerJoin(expenses, eq(expenses.id, expenseItems.expenseId))
    .where(where)
    .all()
  for (const e of purchases) {
    const base = e.base ?? 0
    out.push({
      amountBaseMinor: base,
      description: e.description,
      descriptionKey: e.key,
      kind: e.kind,
      items: lines
        .filter((l) => l.expenseId === e.id)
        .map((l) => ({
          productCategoryId: l.categoryId,
          amountBaseMinor:
            e.amountMinor === 0
              ? 0
              : multiplyRatio(money(l.amountMinor, e.currency), base, e.amountMinor).amountMinor
        }))
    })
  }
  return out
}

/** How a foreign-currency row's base value was found (its frozen `fx_source`; `none` = no rate known yet). */
export type FxSourceKind = 'market_mid' | 'user_api' | 'tcmb' | 'manual' | 'hotel' | 'none'

export interface FxSourceFact {
  kind: 'payment' | 'expense'
  source: FxSourceKind
  /** The market provider of the rate used (truncgil, frankfurter…); null for the hotel's or a typed rate. */
  provider: string | null
  currency: string
  rows: number
  /** Original currency (refunds negative). */
  amountMinor: number
  /** Base currency; 0 for rows without a rate. */
  baseMinor: number
}

const KNOWN_SOURCES = new Set<string>(['market_mid', 'user_api', 'tcmb', 'manual', 'hotel'])

interface FxGroup {
  source: string | null
  hasBase: number
  provider: string | null
  currency: string
  rows: number
  amount: number
  baseSum: number
}

function fxFact(kind: FxSourceFact['kind'], r: FxGroup): FxSourceFact {
  const source: FxSourceKind = !r.hasBase
    ? 'none'
    : r.source && KNOWN_SOURCES.has(r.source)
      ? (r.source as FxSourceKind)
      : 'manual'
  return {
    kind,
    source,
    provider: source === 'market_mid' || source === 'user_api' ? r.provider : null,
    currency: r.currency,
    rows: r.rows,
    amountMinor: r.amount,
    baseMinor: r.baseSum
  }
}

/**
 * Where the frozen rates of the period's foreign-currency rows came from (Faz 11 teslimat 5): live payments and
 * the caller's expenses (`scope`, K-42: rows of hidden sections are not counted; null = payments only) grouped by
 * currency × source × provider. The provider is read from the rate row the record froze with (same observed
 * instant, source and pair, either direction).
 */
export function fxSourceFacts(
  db: Reader,
  p: Period,
  base: string,
  scope: ExpenseScope | null
): FxSourceFact[] {
  const providerOf = (cur: AnySQLiteColumn, source: AnySQLiteColumn, observed: AnySQLiteColumn) =>
    sql<
      string | null
    >`(select ${fxRates.provider} from ${fxRates} where ${fxRates.ts} = ${observed} and ${fxRates.source} = ${source} and ((${fxRates.base} = ${cur} and ${fxRates.quote} = ${base}) or (${fxRates.base} = ${base} and ${fxRates.quote} = ${cur})) and ${fxRates.provider} is not null limit 1)`
  const out: FxSourceFact[] = []
  const signed = sql`case when ${payments.kind} = 'refund' then -1 else 1 end`
  const payProvider = providerOf(payments.currency, payments.fxSource, payments.fxRateObservedAt)
  const payHasBase = sql<number>`(${payments.amountBaseMinor} is not null)`
  for (const r of db
    .select({
      source: payments.fxSource,
      hasBase: payHasBase,
      provider: payProvider,
      currency: payments.currency,
      rows: sql<number>`count(*)`,
      amount: sql<number>`coalesce(sum(${signed} * ${payments.amountMinor}), 0)`,
      baseSum: sql<number>`coalesce(sum(${signed} * coalesce(${payments.amountBaseMinor}, 0)), 0)`
    })
    .from(payments)
    .where(and(isNull(payments.voidedAt), inPeriod(payments.date, p), ne(payments.currency, base)))
    .groupBy(payments.currency, payments.fxSource, payHasBase, payProvider)
    .all())
    out.push(fxFact('payment', r))
  if (scope?.viewIds.length) {
    const expProvider = providerOf(expenses.currency, expenses.fxSource, expenses.fxRateObservedAt)
    const expHasBase = sql<number>`(${expenses.amountBaseMinor} is not null)`
    for (const r of db
      .select({
        source: expenses.fxSource,
        hasBase: expHasBase,
        provider: expProvider,
        currency: expenses.currency,
        rows: sql<number>`count(*)`,
        amount: sql<number>`coalesce(sum(${expenses.amountMinor}), 0)`,
        baseSum: sql<number>`coalesce(sum(coalesce(${expenses.amountBaseMinor}, 0)), 0)`
      })
      .from(expenses)
      .where(
        and(isNull(expenses.voidedAt), inPeriod(expenses.date, p), scope.where, ne(expenses.currency, base))
      )
      .groupBy(expenses.currency, expenses.fxSource, expHasBase, expProvider)
      .all())
      out.push(fxFact('expense', r))
  }
  // Groups that read the same once shaped (a hotel rate has no provider; an unknown source reads as typed) add up.
  const merged = new Map<string, FxSourceFact>()
  for (const f of out) {
    const key = `${f.kind}|${f.currency}|${f.source}|${f.provider ?? ''}`
    const m = merged.get(key)
    if (!m) merged.set(key, { ...f })
    else {
      m.rows += f.rows
      m.amountMinor += f.amountMinor
      m.baseMinor += f.baseMinor
    }
  }
  return [...merged.values()].sort(
    (a, b) =>
      (a.kind === b.kind ? 0 : a.kind === 'payment' ? -1 : 1) ||
      (a.currency < b.currency ? -1 : a.currency > b.currency ? 1 : 0) ||
      b.rows - a.rows
  )
}

export interface SupplyCategoryFact {
  categoryId: string
  /** Base currency, each line's share of its purchase taken with the purchase's own frozen rate. */
  totalMinor: number
  /** Purchases with at least one line of the category. */
  purchases: number
}

/**
 * Supply spending of the period (Faz 12 teslimat 2, "tedarik giderleri"): the caller's purchases with product
 * lines (expenses with items, K-42 scope) by product category in the base currency — the same line share rule as
 * "en çok harcama". Purchases without a known rate are counted in `missing`, not added.
 */
export function supplyByCategory(
  db: Reader,
  p: Period,
  scope: ExpenseScope
): { categories: SupplyCategoryFact[]; purchases: number; missing: number } {
  if (!scope.viewIds.length) return { categories: [], purchases: 0, missing: 0 }
  const lines = db
    .select({
      expenseId: expenseItems.expenseId,
      lineMinor: expenseItems.amountMinor,
      categoryId: products.categoryId,
      amountMinor: expenses.amountMinor,
      currency: expenses.currency,
      base: expenses.amountBaseMinor
    })
    .from(expenseItems)
    .innerJoin(expenses, eq(expenses.id, expenseItems.expenseId))
    .innerJoin(products, eq(products.id, expenseItems.productId))
    .where(and(isNull(expenses.voidedAt), inPeriod(expenses.date, p), scope.where))
    .all()
  const byCategory = new Map<string, { totalMinor: number; ids: Set<string> }>()
  const all = new Set<string>()
  const missing = new Set<string>()
  for (const l of lines) {
    all.add(l.expenseId)
    if (l.base == null) {
      missing.add(l.expenseId)
      continue
    }
    const share =
      l.amountMinor === 0
        ? 0
        : multiplyRatio(money(l.lineMinor, l.currency), l.base, l.amountMinor).amountMinor
    const c = byCategory.get(l.categoryId) ?? { totalMinor: 0, ids: new Set<string>() }
    c.totalMinor += share
    c.ids.add(l.expenseId)
    byCategory.set(l.categoryId, c)
  }
  return {
    categories: [...byCategory]
      .map(([categoryId, c]) => ({ categoryId, totalMinor: c.totalMinor, purchases: c.ids.size }))
      .sort((a, b) => b.totalMinor - a.totalMinor),
    purchases: all.size,
    missing: missing.size
  }
}

export interface NightFact {
  roomId: string
  month: string
  weekday: number
  slot: 'night' | 'day'
  n: number
}

/** Sold room-nights of live reservations grouped by room × month × weekday × slot. */
export function nightFacts(db: Reader, p: Period): NightFact[] {
  const month = sql<string>`substr(${roomNights.date}, 1, 7)`
  const wd = sql<number>`cast(strftime('%w', ${roomNights.date}) as integer)`
  return db
    .select({
      roomId: roomNights.roomId,
      month,
      weekday: wd,
      slot: roomNights.slot,
      n: sql<number>`count(*)`
    })
    .from(roomNights)
    .innerJoin(reservationRooms, eq(reservationRooms.id, roomNights.reservationRoomId))
    .innerJoin(reservations, eq(reservations.id, reservationRooms.reservationId))
    .where(
      and(
        inPeriod(roomNights.date, p),
        inArray(reservations.status, [...LIVE_STATUSES]),
        ne(reservationRooms.status, 'cancelled')
      )
    )
    .groupBy(roomNights.roomId, month, wd, roomNights.slot)
    .all()
}

/** Overnight stays checking in in the period: count and Σ nights (average length of stay). */
export function stayLengths(db: Reader, p: Period): { stays: number; nights: number } {
  const row = db
    .select({
      stays: sql<number>`count(*)`,
      nights: sql<number>`coalesce(sum(cast(julianday(${reservationRooms.checkOut}) - julianday(${reservationRooms.checkIn}) as integer)), 0)`
    })
    .from(reservationRooms)
    .innerJoin(reservations, eq(reservations.id, reservationRooms.reservationId))
    .where(
      and(
        inPeriod(reservationRooms.checkIn, p),
        sql`${reservationRooms.checkOut} > ${reservationRooms.checkIn}`,
        ne(reservationRooms.status, 'cancelled'),
        inArray(reservations.status, [...LIVE_STATUSES])
      )
    )
    .get()
  return { stays: row?.stays ?? 0, nights: row?.nights ?? 0 }
}

/** Guests with a stay checking in in the period, and how many of them had stayed before or twice in it. */
export function repeatGuests(db: Reader, p: Period): { total: number; repeat: number } {
  const live = and(ne(reservationRooms.status, 'cancelled'), inArray(reservations.status, [...LIVE_STATUSES]))
  const inside = db
    .select({ guestId: reservations.primaryGuestId, n: sql<number>`count(distinct ${reservations.id})` })
    .from(reservationRooms)
    .innerJoin(reservations, eq(reservations.id, reservationRooms.reservationId))
    .where(and(live, inPeriod(reservationRooms.checkIn, p)))
    .groupBy(reservations.primaryGuestId)
    .all()
  if (!inside.length) return { total: 0, repeat: 0 }
  const before = new Set(
    db
      .selectDistinct({ guestId: reservations.primaryGuestId })
      .from(reservationRooms)
      .innerJoin(reservations, eq(reservations.id, reservationRooms.reservationId))
      .where(and(live, lt(reservationRooms.checkIn, p.from)))
      .all()
      .map((r) => r.guestId)
  )
  return { total: inside.length, repeat: inside.filter((g) => g.n > 1 || before.has(g.guestId)).length }
}

/**
 * Room-night charges of the period's nights per room in the base currency (ADR, RevPAR, revenue by room). Each
 * charge carries its base amount frozen when it was written (P10fix #7, migration 0013); one written without a
 * known rate is converted with a rate known for its night (or its writing, if later) and otherwise counted in
 * `missing` ("kur yok") instead of silently adding 0.
 */
export function roomRevenueByRoom(
  db: Reader,
  p: Period,
  base: string
): { byRoom: Map<string, number>; missing: number } {
  const where = and(eq(charges.kind, 'room_night'), isNull(charges.voidedAt), inPeriod(charges.date, p))
  const known = sql<
    number | null
  >`coalesce(${charges.amountBaseMinor}, case when ${charges.currency} = ${base} then ${charges.amountMinor} end)`
  const out = new Map<string, number>()
  const add = (roomId: string, v: number): void => void out.set(roomId, (out.get(roomId) ?? 0) + v)
  for (const r of db
    .select({ roomId: roomNights.roomId, total: sql<number>`sum(${known})` })
    .from(charges)
    .innerJoin(roomNights, eq(roomNights.id, charges.roomNightId))
    .where(and(where, sql`${known} is not null`))
    .groupBy(roomNights.roomId)
    .all())
    add(r.roomId, r.total)
  let missing = 0
  const rates = new Map<string, number | null>()
  for (const r of db
    .select({
      roomId: roomNights.roomId,
      date: charges.date,
      amountMinor: charges.amountMinor,
      currency: charges.currency,
      createdAt: charges.createdAt
    })
    .from(charges)
    .innerJoin(roomNights, eq(roomNights.id, charges.roomNightId))
    .where(and(where, sql`${known} is null`))
    .all()) {
    // A rate known for the night's day (its end), or for the minute of writing when that came later.
    const nightEnd = `${r.date}T23:59:59.999Z`
    const at = r.createdAt > nightEnd ? r.createdAt : nightEnd
    const key = `${r.currency}|${at.slice(0, 16)}|${r.amountMinor}`
    let v = rates.get(key)
    if (v === undefined) {
      v = freezeAt(db, money(r.amountMinor, r.currency), base, at)?.amountBaseMinor ?? null
      rates.set(key, v)
    }
    if (v === null) missing++
    else add(r.roomId, v)
  }
  return { byRoom: out, missing }
}

/** Rooms (active or not: history counts), their capacity history and the live blocks overlapping the period. */
export function capacityInputs(
  db: Reader,
  p: Period
): {
  rooms: (RoomCapacity & { number: string; typeId: string })[]
  changes: CapacityChange[]
  blocks: BlockSpan[]
} {
  const roomRows = db
    .select({
      id: rooms.id,
      number: rooms.number,
      typeId: rooms.roomTypeId,
      active: rooms.active,
      sellable: rooms.sellable,
      sort: rooms.sort
    })
    .from(rooms)
    .all()
  const natural = new Intl.Collator('tr', { numeric: true })
  roomRows.sort((a, b) => a.sort - b.sort || natural.compare(a.number, b.number))
  const changes = db
    .select({
      roomId: roomCapacityChanges.roomId,
      validFrom: roomCapacityChanges.validFrom,
      active: roomCapacityChanges.active,
      sellable: roomCapacityChanges.sellable,
      createdAt: roomCapacityChanges.createdAt
    })
    .from(roomCapacityChanges)
    // Every live change, also the ones after the period: a room that opens later has none before it and must not
    // fall back on its row (K-27; a withdrawn plan counts for nothing).
    .where(isNull(roomCapacityChanges.cancelledAt))
    .all() as CapacityChange[]
  const blocks = db
    .select({ roomId: roomBlocks.roomId, dateFrom: roomBlocks.dateFrom, dateTo: roomBlocks.dateTo })
    .from(roomBlocks)
    .where(
      and(
        isNull(roomBlocks.cancelledAt),
        lt(roomBlocks.dateFrom, p.to),
        sql`${roomBlocks.dateTo} > ${p.from}`
      )
    )
    .all() as BlockSpan[]
  return { rooms: roomRows, changes, blocks }
}

/** First day with a payment, an expense or a night (the start of the period pickers). */
export function firstDataDay(db: Reader): LocalDate | null {
  const days = [
    db
      .select({ d: sql<string | null>`min(${payments.date})` })
      .from(payments)
      .where(isNull(payments.voidedAt))
      .get()?.d,
    db
      .select({ d: sql<string | null>`min(${expenses.date})` })
      .from(expenses)
      .where(isNull(expenses.voidedAt))
      .get()?.d,
    db
      .select({ d: sql<string | null>`min(${roomNights.date})` })
      .from(roomNights)
      .get()?.d
  ].filter((d): d is string => !!d)
  return days.length ? (days.sort()[0] as LocalDate) : null
}

export interface OutcomeFacts {
  /** Reservations cancelled in the period (the reservation's own cancellation time, hotel-local day). */
  cancelled: number
  /** Reservations marked "gelmedi" in the period (audit log; the reservation row keeps no time for it). */
  noShow: number
  /** Live refund rows of the period and their base-currency total (positive); rows without a rate count 0. */
  refundRows: number
  refundBaseMinor: number
}

/** `YYYY-MM-DDT00:00:00` moved by whole days (a padded bound for UTC instants). */
function wideDay(iso: string, days: number): string {
  const d = new Date(`${iso}Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 19)
}

/**
 * Cancelled, no-show and refunded as their own figures (K-55): a refund is already inside the revenue as a minus,
 * so these rows show how much went back and how many bookings did not happen. The instants are UTC and the period
 * is in hotel days: they are read a day wide on both sides, then `localDayOf` decides.
 */
export function outcomeFacts(db: Reader, p: Period, localDayOf: (iso: string) => string): OutcomeFacts {
  const from = `${p.from}T00:00:00`
  const to = `${p.to}T00:00:00`
  const inRange = (iso: string | null): boolean => {
    if (!iso) return false
    const day = localDayOf(iso)
    return day >= p.from && day < p.to
  }
  const wide = (column: AnySQLiteColumn): SQL | undefined =>
    and(gte(column, wideDay(from, -1)), lt(column, wideDay(to, 1)))
  const cancelled = db
    .select({ at: reservations.cancelledAt })
    .from(reservations)
    .where(and(eq(reservations.status, 'cancelled'), wide(reservations.cancelledAt)))
    .all()
    .filter((r) => inRange(r.at)).length
  const noShow = new Set(
    db
      .select({ id: auditLog.entityId, ts: auditLog.ts })
      .from(auditLog)
      .where(and(eq(auditLog.entity, 'reservation'), eq(auditLog.action, 'no_show'), wide(auditLog.ts)))
      .all()
      .filter((r) => inRange(r.ts))
      .map((r) => r.id)
  ).size
  const refunds = db
    .select({
      rows: sql<number>`count(*)`,
      base: sql<number>`coalesce(sum(coalesce(${payments.amountBaseMinor}, 0)), 0)`
    })
    .from(payments)
    .where(and(isNull(payments.voidedAt), eq(payments.kind, 'refund'), inPeriod(payments.date, p)))
    .get()
  return { cancelled, noShow, refundRows: refunds?.rows ?? 0, refundBaseMinor: refunds?.base ?? 0 }
}
