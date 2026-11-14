// What "tüm tablolar" means for the export (faz-14 madde 3; G-122, S-43): one entry per table a person works with,
// the permission that shows it on screen, its columns (titles from the locale files) and how its rows are read.
// Identity numbers are marked sensitive: left out unless the role has `guests.identity` (the export service drops
// them); descriptive notes ("kızıl saçlı") never leave the program (K-46 (4)), nor does anyone's personal note
// (§4.9-12). Owner-only expense sections and staff money stay hidden like on screen (G-67, K-42). The tables left
// out on purpose (sessions, devices, change log…) are listed in faz-14 "Son kontrol (QA2x)".
import { and, asc, eq, gt, gte, isNotNull, isNull, lt, lte, or, sql, type SQL } from 'drizzle-orm'
import { addDays, localDate } from '@shared/date'
import {
  cashPanel,
  METHOD_GROUPS,
  type ExpenseRowLike,
  type MethodGroup,
  type PaymentRowLike
} from '@shared/domain/cash'
import { formatMoney, type AppLocale } from '@shared/format'
import { money } from '@shared/money'
import type { ExportDataset } from '@shared/contract/backup'
import type { PermissionKey } from '@shared/permissions'
import type { BismuthDb } from '../../db/client'
import {
  blacklist,
  businessDays,
  calendarDays,
  cashHandovers,
  charges,
  damageDeposits,
  extraServices,
  payPolicies,
  salaryPeriods,
  companies,
  contacts,
  employees,
  employeeSalaries,
  employmentPeriods,
  expenseItems,
  expenses,
  expenseSections,
  folios,
  fxRates,
  guests,
  guestTagLinks,
  guestTags,
  importBatches,
  laundryDeliveries,
  laundryDeliveryItems,
  laundryItemTypes,
  laundryPrices,
  laundrySettlements,
  leaveRecords,
  lostItems,
  notes,
  paymentMethods,
  payments,
  productCategories,
  products,
  reservationNotes,
  reservationRooms,
  reservations,
  reservationTags,
  roomBlocks,
  roomCapacityChanges,
  roomIssues,
  rooms,
  roomNights,
  roomTypes,
  salesChannels,
  shiftDefinitions,
  staffTransactions,
  statusTags,
  stayOccupants,
  tasks,
  users,
  workRecords
} from '../../db/schema'
import type { Ctx } from '../context'
import { sectionAccess } from '../expenses-service'
import { createShiftService } from '../shift-service'
import { listLabel, type Translate } from './labels'
import type { Column, Row } from './writers'

export interface LoadOptions {
  locale: AppLocale
  t: Translate
  from?: string
  to?: string
  baseCurrency: string
  /** The hotel's time zone: the range of tables stamped with a UTC moment is the hotel's days (P14fix #14). */
  timeZone?: string
  /** The service clock (the shift handover reader is a service of its own). */
  clock?: () => Date
}

export interface DatasetDef {
  id: ExportDataset
  /** Audit entity of the export row. */
  entity: string
  /** Every one of these at view level. */
  permissions: readonly PermissionKey[]
  columns: readonly Column[]
  /**
   * The rows depend on who reads them (hidden sections, staff money, K-42): the row count next to the name is
   * the count of what this role would export, not of the whole table (B20).
   */
  scoped?: true
  /** Rows (sensitive fields included; the service drops them for roles without identity rights). */
  load(db: BismuthDb, ctx: Ctx, opts: LoadOptions): Row[]
}

const c = (
  key: string,
  type: Column['type'] = 'text',
  extra: Partial<Omit<Column, 'key' | 'type'>> = {}
): Column => ({ key, label: `dataTransfer.col.${key}`, type, ...extra })
const e = (key: string, prefix: string, label = key): Column => ({
  key,
  label: `dataTransfer.col.${label}`,
  type: 'enum',
  enumPrefix: `dataTransfer.value.${prefix}`
})

/** `column BETWEEN from AND to` for the optional date range. */
const inRange = (column: SQL.Aliased | Parameters<typeof gte>[0], opts: LoadOptions): SQL | undefined => {
  const parts: SQL[] = []
  if (opts.from) parts.push(gte(column as Parameters<typeof gte>[0], opts.from))
  if (opts.to) parts.push(lte(column as Parameters<typeof gte>[0], opts.to))
  return parts.length ? and(...parts) : undefined
}
const dayOfIso = (column: Parameters<typeof gte>[0]) => sql<string>`substr(${column}, 1, 10)`

/** Milliseconds `timeZone` is ahead of UTC at `utcMs` (0 for an unknown zone). */
function zoneOffsetMs(utcMs: number, timeZone: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).formatToParts(new Date(utcMs))
    const n = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? 0)
    return Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second')) - utcMs
  } catch {
    return 0
  }
}

/** The UTC moment the hotel's day `date` starts (midnight in `timeZone`). */
export function zonedDayStartIso(date: string, timeZone: string): string {
  const midnight = Date.parse(`${date}T00:00:00Z`)
  const first = midnight - zoneOffsetMs(midnight, timeZone)
  return new Date(midnight - zoneOffsetMs(first, timeZone)).toISOString()
}

/** Range of a UTC timestamp column over the hotel's days `from`…`to` (inclusive). */
const momentInRange = (column: Parameters<typeof gte>[0], opts: LoadOptions): SQL | undefined => {
  const zone = opts.timeZone ?? 'UTC'
  const parts: SQL[] = []
  if (opts.from) parts.push(gte(column, zonedDayStartIso(opts.from, zone)))
  if (opts.to) parts.push(lt(column, zonedDayStartIso(addDays(localDate(opts.to), 1), zone)))
  return parts.length ? and(...parts) : undefined
}

/**
 * A stay `[checkIn, checkOut)` with a night (or a same-day stay) in the range: the day it leaves is not in it
 * (P14fix #16).
 */
const stayInRange = (from: string | undefined, to: string | undefined, checkIn: string, checkOut: string) =>
  (!from || checkOut > from || checkIn >= from) && (!to || checkIn <= to)

const fullName = (first: string | null, last: string | null): string => `${first ?? ''} ${last ?? ''}`.trim()

function roomsById(db: BismuthDb): Map<string, string> {
  return new Map(
    db
      .select({ id: rooms.id, n: rooms.number })
      .from(rooms)
      .all()
      .map((r) => [r.id, r.n])
  )
}

/** Display names of the program's users (who wrote, who took, who read). */
function usersById(db: BismuthDb): Map<string, string> {
  return new Map(
    db
      .select({ id: users.id, n: users.displayName })
      .from(users)
      .all()
      .map((r) => [r.id, r.n])
  )
}
const userName = (people: Map<string, string>, id: string | null | undefined): string =>
  id ? (people.get(id) ?? '') : ''

/** Amounts in several currencies as one cell ("₺1.200,00 · €50,00"), in the file's language. */
const moneyList = (amounts: Record<string, number> | null | undefined, locale: AppLocale): string =>
  Object.entries(amounts ?? {})
    .filter(([currency, amount]) => /^[A-Z]{3}$/.test(currency) && amount !== 0)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([currency, amount]) => formatMoney(money(amount, currency), locale, { showMinor: true }))
    .join(' · ')

/** A month 'YYYY-MM' that overlaps the optional range. */
const monthInRange = (year: number, month: number, opts: LoadOptions): boolean => {
  const first = `${year}-${String(month).padStart(2, '0')}-01`
  const last = `${year}-${String(month).padStart(2, '0')}-31`
  return (!opts.from || last >= opts.from) && (!opts.to || first <= opts.to)
}

export const DATASETS: readonly DatasetDef[] = [
  {
    id: 'reservationNights',
    entity: 'reservation',
    permissions: ['calendar'],
    columns: [
      c('date', 'date'),
      c('room'),
      c('roomType'),
      c('code'),
      c('guest'),
      c('channel'),
      e('status', 'reservationStatus'),
      e('slot', 'slot'),
      c('price', 'money'),
      c('currency')
    ],
    load(db, _ctx, opts) {
      return db
        .select({
          date: roomNights.date,
          room: rooms.number,
          typeName: roomTypes.name,
          typeI18n: roomTypes.nameI18n,
          code: reservations.code,
          first: guests.firstName,
          last: guests.lastName,
          channelName: salesChannels.name,
          channelI18n: salesChannels.nameI18n,
          status: reservations.status,
          slot: roomNights.slot,
          price: roomNights.priceMinor,
          currency: roomNights.currency
        })
        .from(roomNights)
        .innerJoin(rooms, eq(rooms.id, roomNights.roomId))
        .innerJoin(roomTypes, eq(roomTypes.id, rooms.roomTypeId))
        .innerJoin(reservationRooms, eq(reservationRooms.id, roomNights.reservationRoomId))
        .innerJoin(reservations, eq(reservations.id, reservationRooms.reservationId))
        .innerJoin(guests, eq(guests.id, reservations.primaryGuestId))
        .innerJoin(salesChannels, eq(salesChannels.id, reservations.channelId))
        .where(inRange(roomNights.date, opts))
        .orderBy(asc(roomNights.date), asc(rooms.sort), asc(rooms.number))
        .all()
        .map((r) => ({
          ...r,
          roomType: listLabel(r.typeName, r.typeI18n, opts.locale),
          guest: fullName(r.first, r.last),
          channel: listLabel(r.channelName, r.channelI18n, opts.locale)
        }))
    }
  },
  {
    id: 'reservations',
    entity: 'reservation',
    permissions: ['calendar'],
    columns: [
      c('code'),
      c('guest'),
      c('phone'),
      c('channel'),
      c('channelRef'),
      e('status', 'reservationStatus'),
      c('checkIn', 'date'),
      c('checkOut', 'date'),
      c('rooms'),
      c('nights', 'int'),
      c('total', 'money'),
      c('paid', 'money'),
      c('balance', 'money'),
      c('currency'),
      c('adults', 'int'),
      c('children', 'int'),
      c('notes'),
      c('tags'),
      c('createdAt', 'datetime')
    ],
    load(db, _ctx, opts) {
      // The hotel's own colour tags on the reservation (G-32, `reservation_tags`), in the list order.
      const tagsOf = new Map<string, string[]>()
      for (const r of db
        .select({ id: reservationTags.reservationId, name: statusTags.name, nameI18n: statusTags.nameI18n })
        .from(reservationTags)
        .innerJoin(statusTags, eq(statusTags.id, reservationTags.tagId))
        .orderBy(asc(statusTags.sort), asc(statusTags.createdAt))
        .all())
        tagsOf.set(r.id, [...(tagsOf.get(r.id) ?? []), listLabel(r.name, r.nameI18n, opts.locale)])
      const stays = db
        .select({
          reservationId: reservationRooms.reservationId,
          checkIn: reservationRooms.checkIn,
          checkOut: reservationRooms.checkOut,
          room: rooms.number,
          status: reservationRooms.status
        })
        .from(reservationRooms)
        .innerJoin(rooms, eq(rooms.id, reservationRooms.roomId))
        .all()
      const byReservation = new Map<string, typeof stays>()
      for (const s of stays)
        byReservation.set(s.reservationId, [...(byReservation.get(s.reservationId) ?? []), s])
      const nights = new Map(
        db
          .select({ id: reservationRooms.reservationId, n: sql<number>`count(*)` })
          .from(roomNights)
          .innerJoin(reservationRooms, eq(reservationRooms.id, roomNights.reservationRoomId))
          .groupBy(reservationRooms.reservationId)
          .all()
          .map((r) => [r.id, r.n])
      )
      const charged = new Map(
        db
          .select({ id: folios.reservationId, total: sql<number>`coalesce(sum(${charges.amountMinor}), 0)` })
          .from(charges)
          .innerJoin(folios, eq(folios.id, charges.folioId))
          .where(isNull(charges.voidedAt))
          .groupBy(folios.reservationId)
          .all()
          .map((r) => [r.id, r.total])
      )
      const credited = new Map(
        db
          .select({
            id: folios.reservationId,
            total: sql<number>`coalesce(sum(case when ${payments.kind} = 'refund' then -${payments.amountFolioMinor} else ${payments.amountFolioMinor} end), 0)`
          })
          .from(payments)
          .innerJoin(folios, eq(folios.id, payments.folioId))
          .where(isNull(payments.voidedAt))
          .groupBy(folios.reservationId)
          .all()
          .map((r) => [r.id, r.total])
      )
      return db
        .select({
          id: reservations.id,
          code: reservations.code,
          first: guests.firstName,
          last: guests.lastName,
          phone: guests.phone,
          channelName: salesChannels.name,
          channelI18n: salesChannels.nameI18n,
          channelRef: reservations.channelRef,
          status: reservations.status,
          currency: folios.currency,
          adults: reservations.adults,
          children: reservations.children,
          notes: reservations.notes,
          createdAt: reservations.createdAt
        })
        .from(reservations)
        .innerJoin(guests, eq(guests.id, reservations.primaryGuestId))
        .innerJoin(salesChannels, eq(salesChannels.id, reservations.channelId))
        .leftJoin(folios, eq(folios.reservationId, reservations.id))
        .orderBy(asc(reservations.createdAt))
        .all()
        .map((r) => {
          const own = byReservation.get(r.id) ?? []
          const checkIn = own.map((s) => s.checkIn).sort()[0] ?? null
          const checkOut =
            own
              .map((s) => s.checkOut)
              .sort()
              .at(-1) ?? null
          const total = charged.get(r.id) ?? 0
          const paid = credited.get(r.id) ?? 0
          return {
            ...r,
            guest: fullName(r.first, r.last),
            channel: listLabel(r.channelName, r.channelI18n, opts.locale),
            checkIn,
            checkOut,
            rooms: [...new Set(own.map((s) => s.room))].join(', '),
            nights: nights.get(r.id) ?? 0,
            tags: (tagsOf.get(r.id) ?? []).join(', '),
            total,
            paid,
            balance: total - paid
          }
        })
        .filter((r) => stayInRange(opts.from, opts.to, r.checkIn ?? '', r.checkOut ?? ''))
    }
  },
  {
    id: 'occupants',
    entity: 'stay_occupant',
    permissions: ['in_house'],
    columns: [
      c('room'),
      c('checkIn', 'date'),
      c('checkOut', 'date'),
      c('code'),
      c('fullName'),
      c('primary', 'bool'),
      c('docNumber', 'text', { sensitive: true }),
      c('arrivedAt', 'datetime'),
      c('leftAt', 'datetime'),
      c('kbsReportedAt', 'datetime')
    ],
    load(db, _ctx, opts) {
      return db
        .select({
          room: rooms.number,
          checkIn: reservationRooms.checkIn,
          checkOut: reservationRooms.checkOut,
          code: reservations.code,
          fullName: stayOccupants.fullName,
          primary: stayOccupants.isPrimary,
          docNumber: guests.idDocNumber,
          arrivedAt: stayOccupants.arrivedAt,
          leftAt: stayOccupants.leftAt,
          kbsReportedAt: stayOccupants.kbsReportedAt
        })
        .from(stayOccupants)
        .innerJoin(reservationRooms, eq(reservationRooms.id, stayOccupants.reservationRoomId))
        .innerJoin(reservations, eq(reservations.id, reservationRooms.reservationId))
        .innerJoin(rooms, eq(rooms.id, reservationRooms.roomId))
        .leftJoin(guests, eq(guests.id, stayOccupants.guestId))
        .where(
          and(
            opts.from
              ? or(gt(reservationRooms.checkOut, opts.from), gte(reservationRooms.checkIn, opts.from))
              : undefined,
            opts.to ? lte(reservationRooms.checkIn, opts.to) : undefined
          )
        )
        .orderBy(asc(reservationRooms.checkIn), asc(rooms.number))
        .all()
    }
  },
  {
    id: 'folioCharges',
    entity: 'charge',
    permissions: ['calendar'],
    columns: [
      c('date', 'date'),
      c('source'),
      c('guest'),
      e('chargeKind', 'chargeKind'),
      c('description'),
      c('qty', 'int'),
      c('unitPrice', 'money'),
      c('amount', 'money'),
      c('currency'),
      c('amountBase', 'money', { currencyKey: 'baseCurrency' }),
      c('voided', 'bool'),
      c('voidReason')
    ],
    load(db, _ctx, opts) {
      return db
        .select({
          date: charges.date,
          code: reservations.code,
          folioTitle: folios.title,
          first: guests.firstName,
          last: guests.lastName,
          chargeKind: charges.kind,
          description: charges.description,
          qty: charges.qty,
          unitPrice: charges.unitMinor,
          amount: charges.amountMinor,
          currency: charges.currency,
          amountBase: charges.amountBaseMinor,
          voidedAt: charges.voidedAt,
          voidReason: charges.voidReason
        })
        .from(charges)
        .innerJoin(folios, eq(folios.id, charges.folioId))
        .leftJoin(reservations, eq(reservations.id, folios.reservationId))
        .leftJoin(guests, eq(guests.id, reservations.primaryGuestId))
        .where(inRange(charges.date, opts))
        .orderBy(asc(charges.date), asc(charges.createdAt))
        .all()
        .map((r) => ({
          ...r,
          source: r.code ?? r.folioTitle,
          guest: fullName(r.first, r.last),
          baseCurrency: opts.baseCurrency,
          voided: r.voidedAt !== null
        }))
    }
  },
  {
    id: 'reservationNotes',
    entity: 'reservation_note',
    permissions: ['calendar'],
    columns: [
      c('code'),
      c('guest'),
      c('date', 'date'),
      c('note'),
      c('writtenBy'),
      c('createdAt', 'datetime')
    ],
    load(db, _ctx, opts) {
      const people = usersById(db)
      return db
        .select({
          code: reservations.code,
          first: guests.firstName,
          last: guests.lastName,
          date: reservationNotes.date,
          note: reservationNotes.text,
          createdBy: reservationNotes.createdBy,
          createdAt: reservationNotes.createdAt
        })
        .from(reservationNotes)
        .innerJoin(reservations, eq(reservations.id, reservationNotes.reservationId))
        .innerJoin(guests, eq(guests.id, reservations.primaryGuestId))
        .where(momentInRange(reservationNotes.createdAt, opts))
        .orderBy(asc(reservationNotes.createdAt))
        .all()
        .map((r) => ({ ...r, guest: fullName(r.first, r.last), writtenBy: userName(people, r.createdBy) }))
    }
  },
  {
    id: 'ledgerIncome',
    entity: 'payment',
    permissions: ['ledger'],
    columns: [
      c('date', 'date'),
      c('source'),
      c('guest'),
      e('paymentKind', 'paymentKind'),
      c('method'),
      c('channel'),
      c('amount', 'money'),
      c('currency'),
      c('amountBase', 'money', { currencyKey: 'baseCurrency' }),
      c('collected', 'bool'),
      c('collectedAt', 'datetime'),
      c('voided', 'bool'),
      c('voidReason'),
      c('reference'),
      c('note')
    ],
    load(db, _ctx, opts) {
      return db
        .select({
          date: payments.date,
          code: reservations.code,
          folioTitle: folios.title,
          first: guests.firstName,
          last: guests.lastName,
          paymentKind: payments.kind,
          methodName: paymentMethods.name,
          methodI18n: paymentMethods.nameI18n,
          channelName: salesChannels.name,
          channelI18n: salesChannels.nameI18n,
          amount: payments.amountMinor,
          currency: payments.currency,
          amountBase: payments.amountBaseMinor,
          collectedAt: payments.collectedAt,
          voidedAt: payments.voidedAt,
          voidReason: payments.voidReason,
          reference: payments.reference,
          note: payments.note
        })
        .from(payments)
        .innerJoin(folios, eq(folios.id, payments.folioId))
        .innerJoin(paymentMethods, eq(paymentMethods.id, payments.methodId))
        .leftJoin(salesChannels, eq(salesChannels.id, payments.channelId))
        .leftJoin(reservations, eq(reservations.id, folios.reservationId))
        .leftJoin(guests, eq(guests.id, reservations.primaryGuestId))
        .where(inRange(payments.date, opts))
        .orderBy(asc(payments.date), asc(payments.createdAt))
        .all()
        .map((r) => ({
          ...r,
          source: r.code ?? r.folioTitle,
          guest: fullName(r.first, r.last),
          method: listLabel(r.methodName, r.methodI18n, opts.locale),
          channel: r.channelName ? listLabel(r.channelName, r.channelI18n, opts.locale) : '',
          baseCurrency: opts.baseCurrency,
          collected: r.collectedAt !== null,
          voided: r.voidedAt !== null
        }))
    }
  },
  {
    id: 'ledgerExpenses',
    entity: 'expense',
    permissions: ['expenses'],
    columns: [
      c('date', 'date'),
      c('section'),
      c('description'),
      c('amount', 'money'),
      c('currency'),
      c('amountBase', 'money', { currencyKey: 'baseCurrency' }),
      c('drawer', 'bool'),
      c('method'),
      c('voided', 'bool'),
      c('voidReason')
    ],
    scoped: true,
    load(db, ctx, opts) {
      const access = sectionAccess(db, ctx)
      if (!access.viewIds.length) return []
      return db
        .select({
          date: expenses.date,
          sectionName: expenseSections.name,
          sectionI18n: expenseSections.nameI18n,
          description: expenses.description,
          amount: expenses.amountMinor,
          currency: expenses.currency,
          amountBase: expenses.amountBaseMinor,
          drawer: expenses.paidFromDrawer,
          methodName: paymentMethods.name,
          methodI18n: paymentMethods.nameI18n,
          voidedAt: expenses.voidedAt,
          voidReason: expenses.voidReason
        })
        .from(expenses)
        .innerJoin(expenseSections, eq(expenseSections.id, expenses.sectionId))
        .leftJoin(paymentMethods, eq(paymentMethods.id, expenses.methodId))
        .where(and(access.where, inRange(expenses.date, opts)))
        .orderBy(asc(expenses.date), asc(expenses.createdAt))
        .all()
        .map((r) => ({
          ...r,
          section: listLabel(r.sectionName, r.sectionI18n, opts.locale),
          method: r.methodName ? listLabel(r.methodName, r.methodI18n, opts.locale) : '',
          baseCurrency: opts.baseCurrency,
          voided: r.voidedAt !== null
        }))
    }
  },
  {
    id: 'expenseItems',
    entity: 'expense',
    permissions: ['expenses'],
    columns: [
      c('date', 'date'),
      c('description'),
      c('product'),
      c('qty', 'qty'),
      c('unitPrice', 'money'),
      c('amount', 'money'),
      c('currency')
    ],
    scoped: true,
    load(db, ctx, opts) {
      const access = sectionAccess(db, ctx)
      if (!access.viewIds.length) return []
      return db
        .select({
          date: expenses.date,
          description: expenses.description,
          product: products.name,
          qty: expenseItems.qtyMilli,
          unitPrice: expenseItems.unitPriceMinor,
          amount: expenseItems.amountMinor,
          currency: expenses.currency
        })
        .from(expenseItems)
        .innerJoin(expenses, eq(expenses.id, expenseItems.expenseId))
        .leftJoin(products, eq(products.id, expenseItems.productId))
        .where(and(access.where, isNull(expenses.voidedAt), inRange(expenses.date, opts)))
        .orderBy(asc(expenses.date))
        .all()
    }
  },
  {
    // K-42: the drawer figure of a handover is recomputed from the rows the reader may see (hidden sections,
    // staff money), as the ledger's handover history does; an undone batch shows its collected cash only.
    id: 'cashHandovers',
    entity: 'cash_handover',
    permissions: ['cash'],
    columns: [
      c('at', 'datetime'),
      c('handedBy'),
      c('currency'),
      ...METHOD_GROUPS.map((g) => c(`group_${g}`, 'money', { label: `ledger.group.${g}` })),
      c('drawerCash', 'money'),
      c('paymentCount', 'int'),
      c('expenseCount', 'int'),
      c('note'),
      c('reverted', 'bool'),
      c('revertedAt', 'datetime'),
      c('revertedBy'),
      c('revertReason')
    ],
    scoped: true,
    load(db, ctx, opts) {
      const access = sectionAccess(db, ctx)
      const people = usersById(db)
      const list = db
        .select()
        .from(cashHandovers)
        .where(momentInRange(cashHandovers.at, opts))
        .orderBy(asc(cashHandovers.at))
        .all()
      const taken = new Map<string, PaymentRowLike[]>()
      const spent = new Map<string, ExpenseRowLike[]>()
      if (access.partial && list.length) {
        for (const p of db
          .select({
            handoverId: payments.handoverId,
            kind: payments.kind,
            amountMinor: payments.amountMinor,
            currency: payments.currency,
            voidedAt: payments.voidedAt,
            methodGroup: paymentMethods.group,
            isCash: paymentMethods.isCash
          })
          .from(payments)
          .innerJoin(paymentMethods, eq(paymentMethods.id, payments.methodId))
          .where(isNotNull(payments.handoverId))
          .all()) {
          const key = p.handoverId ?? ''
          taken.set(key, [...(taken.get(key) ?? []), { ...p, voided: p.voidedAt !== null, collected: false }])
        }
        if (access.viewIds.length)
          for (const x of db
            .select({
              handoverId: expenses.handoverId,
              amountMinor: expenses.amountMinor,
              currency: expenses.currency,
              paidFromDrawer: expenses.paidFromDrawer,
              voidedAt: expenses.voidedAt
            })
            .from(expenses)
            .where(and(access.where, isNotNull(expenses.handoverId)))
            .all()) {
            const key = x.handoverId ?? ''
            spent.set(key, [...(spent.get(key) ?? []), { ...x, voided: x.voidedAt !== null, settled: false }])
          }
      }
      return list.flatMap((h) => {
        const totals = h.totals as {
          pending?: Record<string, Partial<Record<MethodGroup, number>>>
          drawer?: Record<string, number>
          payments?: number
          expenses?: number
        }
        const pending = totals.pending ?? {}
        let drawer = totals.drawer ?? {}
        let expenseCount = totals.expenses ?? 0
        if (access.partial) {
          if (h.revertedAt) {
            drawer = {}
            for (const [currency, groups] of Object.entries(pending))
              if (groups?.cash) drawer[currency] = groups.cash
            expenseCount = 0
          } else {
            const rows = spent.get(h.id) ?? []
            drawer = cashPanel(taken.get(h.id) ?? [], rows).drawer
            expenseCount = rows.length
          }
        }
        const base = {
          at: h.at,
          handedBy: userName(people, h.byUser),
          paymentCount: totals.payments ?? 0,
          expenseCount,
          note: h.note,
          reverted: h.revertedAt !== null,
          revertedAt: h.revertedAt,
          revertedBy: userName(people, h.revertedBy),
          revertReason: h.revertReason
        }
        const currencies = [...new Set([...Object.keys(pending), ...Object.keys(drawer)])].sort()
        if (!currencies.length) return [{ ...base, currency: '' }]
        return currencies.map((currency) => ({
          ...base,
          currency,
          ...Object.fromEntries(METHOD_GROUPS.map((g) => [`group_${g}`, pending[currency]?.[g] ?? null])),
          drawerCash: drawer[currency] ?? 0
        }))
      })
    }
  },
  {
    id: 'ledgerDays',
    entity: 'business_day',
    permissions: ['ledger'],
    columns: [
      c('date', 'date'),
      e('dayStatus', 'dayStatus'),
      c('closedAt', 'datetime'),
      c('closedBy'),
      c('note')
    ],
    load(db, _ctx, opts) {
      const people = usersById(db)
      return db
        .select()
        .from(businessDays)
        .where(inRange(businessDays.date, opts))
        .orderBy(asc(businessDays.date))
        .all()
        .map((r) => ({ ...r, dayStatus: r.status, closedBy: userName(people, r.closedBy) }))
    }
  },
  {
    id: 'staff',
    entity: 'employee',
    permissions: ['staff'],
    columns: [
      c('firstName'),
      c('lastName'),
      c('position'),
      c('phone'),
      c('startDate', 'date'),
      c('endDate', 'date'),
      c('active', 'bool'),
      c('notes')
    ],
    load(db) {
      return db.select().from(employees).orderBy(asc(employees.firstName)).all()
    }
  },
  {
    id: 'employmentPeriods',
    entity: 'employment_period',
    permissions: ['staff'],
    columns: [c('employee'), c('startDate', 'date'), c('endDate', 'date')],
    load(db) {
      return db
        .select({
          first: employees.firstName,
          last: employees.lastName,
          startDate: employmentPeriods.startDate,
          endDate: employmentPeriods.endDate
        })
        .from(employmentPeriods)
        .innerJoin(employees, eq(employees.id, employmentPeriods.employeeId))
        .orderBy(asc(employees.firstName), asc(employmentPeriods.startDate))
        .all()
        .map((r) => ({ ...r, employee: fullName(r.first, r.last) }))
    }
  },
  {
    id: 'salaries',
    entity: 'employee_salary',
    permissions: ['staff.salary'],
    columns: [c('employee'), c('validFrom', 'date'), c('monthly', 'money'), c('currency')],
    load(db) {
      return db
        .select({
          first: employees.firstName,
          last: employees.lastName,
          validFrom: employeeSalaries.validFrom,
          monthly: employeeSalaries.monthlyMinor,
          currency: employeeSalaries.currency
        })
        .from(employeeSalaries)
        .innerJoin(employees, eq(employees.id, employeeSalaries.employeeId))
        .orderBy(asc(employees.firstName), asc(employeeSalaries.validFrom))
        .all()
        .map((r) => ({ ...r, employee: fullName(r.first, r.last) }))
    }
  },
  {
    id: 'staffTransactions',
    entity: 'staff_transaction',
    permissions: ['staff.salary'],
    columns: [
      c('date', 'date'),
      c('employee'),
      e('staffKind', 'staffTxnKind'),
      c('amount', 'money'),
      c('currency'),
      c('period'),
      c('note'),
      c('voided', 'bool')
    ],
    load(db, _ctx, opts) {
      return db
        .select({
          date: staffTransactions.date,
          first: employees.firstName,
          last: employees.lastName,
          staffKind: staffTransactions.kind,
          amount: staffTransactions.amountMinor,
          currency: staffTransactions.currency,
          year: staffTransactions.periodYear,
          month: staffTransactions.periodMonth,
          note: staffTransactions.note,
          voidedAt: staffTransactions.voidedAt
        })
        .from(staffTransactions)
        .innerJoin(employees, eq(employees.id, staffTransactions.employeeId))
        .where(inRange(staffTransactions.date, opts))
        .orderBy(asc(staffTransactions.date))
        .all()
        .map((r) => ({
          ...r,
          employee: fullName(r.first, r.last),
          period: r.year && r.month ? `${r.year}-${String(r.month).padStart(2, '0')}` : '',
          voided: r.voidedAt !== null
        }))
    }
  },
  {
    id: 'leave',
    entity: 'leave_record',
    permissions: ['staff.leave'],
    columns: [c('date', 'date'), c('employee'), e('leaveKind', 'leaveKind'), c('note'), c('voided', 'bool')],
    load(db, _ctx, opts) {
      return db
        .select({
          date: leaveRecords.date,
          first: employees.firstName,
          last: employees.lastName,
          leaveKind: leaveRecords.kind,
          note: leaveRecords.note,
          voidedAt: leaveRecords.voidedAt
        })
        .from(leaveRecords)
        .innerJoin(employees, eq(employees.id, leaveRecords.employeeId))
        .where(inRange(leaveRecords.date, opts))
        .orderBy(asc(leaveRecords.date))
        .all()
        .map((r) => ({ ...r, employee: fullName(r.first, r.last), voided: r.voidedAt !== null }))
    }
  },
  {
    id: 'workHours',
    entity: 'work_record',
    permissions: ['staff.overtime'],
    columns: [
      c('date', 'date'),
      c('employee'),
      e('workKind', 'workKind'),
      c('startTime'),
      c('endTime'),
      c('minutesWorked', 'int'),
      c('overtimeMinutes', 'int'),
      c('note')
    ],
    load(db, _ctx, opts) {
      return db
        .select({
          date: workRecords.date,
          first: employees.firstName,
          last: employees.lastName,
          workKind: workRecords.kind,
          startTime: workRecords.startTime,
          endTime: workRecords.endTime,
          minutesWorked: workRecords.minutesWorked,
          overtimeMinutes: workRecords.overtimeMinutes,
          note: workRecords.note
        })
        .from(workRecords)
        .innerJoin(employees, eq(employees.id, workRecords.employeeId))
        .where(inRange(workRecords.date, opts))
        .orderBy(asc(workRecords.date))
        .all()
        .map((r) => ({ ...r, employee: fullName(r.first, r.last) }))
    }
  },
  {
    id: 'guests',
    entity: 'guest',
    permissions: ['guests'],
    columns: [
      c('firstName'),
      c('lastName'),
      c('phone'),
      c('email'),
      c('nationality'),
      e('docType', 'docType'),
      c('docNumber', 'text', { sensitive: true }),
      c('vip', 'bool'),
      c('standingNote'),
      c('notes'),
      c('company'),
      c('tags'),
      c('createdAt', 'datetime')
    ],
    load(db, _ctx, opts) {
      // Guest tags (G-50, K-46): the tag names in the list order, in the file's language.
      const tagsOf = new Map<string, string[]>()
      for (const r of db
        .select({ guestId: guestTagLinks.guestId, name: guestTags.name, nameI18n: guestTags.nameI18n })
        .from(guestTagLinks)
        .innerJoin(guestTags, eq(guestTags.id, guestTagLinks.tagId))
        .orderBy(asc(guestTags.sort), asc(guestTags.createdAt))
        .all())
        tagsOf.set(r.guestId, [...(tagsOf.get(r.guestId) ?? []), listLabel(r.name, r.nameI18n, opts.locale)])
      return db
        .select({
          id: guests.id,
          firstName: guests.firstName,
          lastName: guests.lastName,
          phone: guests.phone,
          email: guests.email,
          nationality: guests.nationality,
          docType: guests.idDocType,
          docNumber: guests.idDocNumber,
          vip: guests.vip,
          standingNote: guests.standingNote,
          notes: guests.notes,
          company: companies.title,
          createdAt: guests.createdAt
        })
        .from(guests)
        .leftJoin(companies, eq(companies.id, guests.companyId))
        .where(isNull(guests.mergedIntoId))
        .orderBy(asc(guests.nameNormalized))
        .all()
        .map(({ id, ...r }) => ({ ...r, tags: (tagsOf.get(id) ?? []).join(', ') }))
    }
  },
  {
    id: 'companies',
    entity: 'company',
    permissions: ['companies'],
    columns: [
      c('title'),
      c('taxOffice'),
      c('taxNumber'),
      c('address'),
      c('city'),
      c('phone'),
      c('email'),
      c('iban'),
      c('contactPerson'),
      c('note')
    ],
    load(db) {
      return db.select().from(companies).orderBy(asc(companies.nameNormalized)).all()
    }
  },
  {
    id: 'blacklist',
    entity: 'blacklist',
    permissions: ['blacklist'],
    columns: [
      c('name'),
      e('severity', 'blacklistSeverity'),
      c('reason'),
      c('incidentDate', 'date'),
      e('state', 'blacklistStatus'),
      c('docNumber', 'text', { sensitive: true })
    ],
    load(db) {
      return db
        .select({
          name: blacklist.name,
          severity: blacklist.severity,
          reason: blacklist.reasonText,
          incidentDate: blacklist.incidentDate,
          state: blacklist.status,
          docNumber: blacklist.idDocNumber
        })
        .from(blacklist)
        .orderBy(asc(blacklist.nameNormalized))
        .all()
    }
  },
  {
    id: 'contacts',
    entity: 'contact',
    permissions: ['contacts'],
    columns: [
      c('name'),
      c('category'),
      c('phones'),
      c('address'),
      c('email'),
      c('note'),
      c('active', 'bool')
    ],
    load(db, _ctx, opts) {
      return db
        .select()
        .from(contacts)
        .orderBy(asc(contacts.nameNormalized))
        .all()
        .map((r) => ({
          ...r,
          category:
            r.category === 'custom'
              ? (r.customCategory ?? '')
              : opts.t(`dataTransfer.value.contactCategory.${r.category}`),
          phones: (r.phones ?? []).map((p) => (p.label ? `${p.label}: ${p.number}` : p.number)).join(', ')
        }))
    }
  },
  {
    id: 'products',
    entity: 'product',
    permissions: ['supplies'],
    columns: [c('name'), c('category'), e('unit', 'unit'), c('stock', 'qty'), c('active', 'bool')],
    load(db, _ctx, opts) {
      return db
        .select({
          name: products.name,
          catName: productCategories.name,
          catI18n: productCategories.nameI18n,
          unit: products.unit,
          stock: products.stockQtyMilli,
          active: products.active
        })
        .from(products)
        .leftJoin(productCategories, eq(productCategories.id, products.categoryId))
        .orderBy(asc(products.nameNormalized))
        .all()
        .map((r) => ({
          ...r,
          category: r.catName || r.catI18n ? listLabel(r.catName, r.catI18n, opts.locale) : ''
        }))
    }
  },
  {
    id: 'productCategories',
    entity: 'product_category',
    permissions: ['supplies'],
    columns: [c('name'), c('productCount', 'int'), c('active', 'bool')],
    load(db, _ctx, opts) {
      const counts = new Map(
        db
          .select({ id: products.categoryId, n: sql<number>`count(*)` })
          .from(products)
          .groupBy(products.categoryId)
          .all()
          .map((r) => [r.id, r.n])
      )
      return db
        .select()
        .from(productCategories)
        .orderBy(asc(productCategories.sort), asc(productCategories.createdAt))
        .all()
        .map((r) => ({
          name: listLabel(r.name, r.nameI18n, opts.locale),
          productCount: counts.get(r.id) ?? 0,
          active: r.active
        }))
    }
  },
  {
    id: 'laundry',
    entity: 'laundry_delivery',
    permissions: ['laundry'],
    columns: [
      c('date', 'date'),
      e('direction', 'direction'),
      c('laundryName'),
      c('slipNo'),
      c('item'),
      c('qty', 'int'),
      c('stainedQty', 'int'),
      c('amount', 'money', { currencyKey: 'baseCurrency' }),
      c('note'),
      c('voided', 'bool')
    ],
    load(db, _ctx, opts) {
      return db
        .select({
          date: laundryDeliveries.date,
          direction: laundryDeliveries.direction,
          laundryName: contacts.name,
          slipNo: laundryDeliveries.slipNo,
          itemName: laundryItemTypes.name,
          itemI18n: laundryItemTypes.nameI18n,
          qty: laundryDeliveryItems.qty,
          stainedQty: laundryDeliveryItems.stainedQty,
          amount: laundryDeliveryItems.amountMinor,
          note: laundryDeliveries.note,
          voidedAt: laundryDeliveries.voidedAt
        })
        .from(laundryDeliveryItems)
        .innerJoin(laundryDeliveries, eq(laundryDeliveries.id, laundryDeliveryItems.deliveryId))
        .innerJoin(laundryItemTypes, eq(laundryItemTypes.id, laundryDeliveryItems.itemTypeId))
        .leftJoin(contacts, eq(contacts.id, laundryDeliveries.laundryContactId))
        .where(inRange(laundryDeliveries.date, opts))
        .orderBy(asc(laundryDeliveries.date))
        .all()
        .map((r) => ({
          ...r,
          item: listLabel(r.itemName, r.itemI18n, opts.locale),
          baseCurrency: opts.baseCurrency,
          voided: r.voidedAt !== null
        }))
    }
  },
  {
    id: 'damageDeposits',
    entity: 'damage_deposit',
    permissions: ['payments'],
    columns: [
      c('takenDate', 'date'),
      c('source'),
      c('guest'),
      c('amount', 'money'),
      c('currency'),
      c('method'),
      e('depositStatus', 'depositStatus'),
      c('settledDate', 'date'),
      c('settleNote'),
      c('note')
    ],
    load(db, _ctx, opts) {
      return db
        .select({
          takenDate: damageDeposits.takenDate,
          code: reservations.code,
          first: guests.firstName,
          last: guests.lastName,
          amount: damageDeposits.amountMinor,
          currency: damageDeposits.currency,
          methodName: paymentMethods.name,
          methodI18n: paymentMethods.nameI18n,
          depositStatus: damageDeposits.status,
          settledDate: damageDeposits.settledDate,
          settleNote: damageDeposits.settleNote,
          note: damageDeposits.note
        })
        .from(damageDeposits)
        .innerJoin(reservations, eq(reservations.id, damageDeposits.reservationId))
        .leftJoin(guests, eq(guests.id, reservations.primaryGuestId))
        .innerJoin(paymentMethods, eq(paymentMethods.id, damageDeposits.methodId))
        .where(inRange(damageDeposits.takenDate, opts))
        .orderBy(asc(damageDeposits.takenDate), asc(damageDeposits.createdAt))
        .all()
        .map((r) => ({
          ...r,
          source: r.code,
          guest: fullName(r.first, r.last),
          method: listLabel(r.methodName, r.methodI18n, opts.locale)
        }))
    }
  },
  {
    id: 'salaryPeriods',
    entity: 'salary_period',
    // Staff money like `salaries`: only a role that may see salaries.
    permissions: ['staff.salary'],
    columns: [c('employee'), c('period'), c('lockedAt', 'datetime')],
    load(db) {
      return db
        .select({
          first: employees.firstName,
          last: employees.lastName,
          year: salaryPeriods.year,
          month: salaryPeriods.month,
          lockedAt: salaryPeriods.lockedAt
        })
        .from(salaryPeriods)
        .innerJoin(employees, eq(employees.id, salaryPeriods.employeeId))
        .orderBy(asc(salaryPeriods.year), asc(salaryPeriods.month), asc(employees.firstName))
        .all()
        .map((r) => ({
          employee: fullName(r.first, r.last),
          period: `${r.year}-${String(r.month).padStart(2, '0')}`,
          lockedAt: r.lockedAt
        }))
    }
  },
  {
    id: 'payPolicies',
    entity: 'pay_policy',
    permissions: ['staff.salary'],
    columns: [c('employee'), c('policyKey'), c('policyValue')],
    load(db) {
      return db
        .select({
          first: employees.firstName,
          last: employees.lastName,
          key: payPolicies.key,
          value: payPolicies.valueJson
        })
        .from(payPolicies)
        .leftJoin(employees, eq(employees.id, payPolicies.employeeId))
        .orderBy(asc(payPolicies.scope), asc(employees.firstName), asc(payPolicies.key))
        .all()
        .map((r) => ({
          employee: r.first ? fullName(r.first, r.last) : '',
          policyKey: r.key,
          policyValue: r.value
        }))
    }
  },
  {
    id: 'paymentMethods',
    entity: 'payment_method',
    permissions: ['settings.lists'],
    columns: [c('code'), c('name'), c('active', 'bool')],
    load(db, _ctx, opts) {
      return db
        .select()
        .from(paymentMethods)
        .orderBy(asc(paymentMethods.sort), asc(paymentMethods.code))
        .all()
        .map((r) => ({ code: r.code, name: listLabel(r.name, r.nameI18n, opts.locale), active: r.active }))
    }
  },
  {
    id: 'salesChannels',
    entity: 'sales_channel',
    permissions: ['settings.lists'],
    columns: [c('code'), c('name'), c('active', 'bool')],
    load(db, _ctx, opts) {
      return db
        .select()
        .from(salesChannels)
        .orderBy(asc(salesChannels.sort), asc(salesChannels.code))
        .all()
        .map((r) => ({ code: r.code, name: listLabel(r.name, r.nameI18n, opts.locale), active: r.active }))
    }
  },
  {
    id: 'extraServices',
    entity: 'extra_service',
    permissions: ['settings.lists'],
    columns: [c('code'), c('name'), c('unitPrice', 'money'), c('currency'), c('active', 'bool')],
    load(db, _ctx, opts) {
      return db
        .select()
        .from(extraServices)
        .orderBy(asc(extraServices.sort), asc(extraServices.code))
        .all()
        .map((r) => ({
          code: r.code,
          name: listLabel(r.name, r.nameI18n, opts.locale),
          unitPrice: r.defaultPriceMinor,
          currency: r.defaultCurrency ?? '',
          active: r.active
        }))
    }
  },
  {
    id: 'statusTags',
    entity: 'status_tag',
    permissions: ['settings.colors'],
    columns: [c('code'), c('name'), c('active', 'bool')],
    load(db, _ctx, opts) {
      return db
        .select()
        .from(statusTags)
        .orderBy(asc(statusTags.sort), asc(statusTags.code))
        .all()
        .map((r) => ({
          code: r.code,
          name: listLabel(r.name, r.nameI18n, opts.locale),
          active: r.enabled
        }))
    }
  },
  {
    id: 'laundryPrices',
    entity: 'laundry_price',
    permissions: ['laundry'],
    columns: [c('laundryName'), c('item'), c('validFrom', 'date'), c('unitPrice', 'money'), c('currency')],
    load(db, _ctx, opts) {
      return db
        .select({
          laundryName: contacts.name,
          itemName: laundryItemTypes.name,
          itemI18n: laundryItemTypes.nameI18n,
          validFrom: laundryPrices.validFrom,
          unitPrice: laundryPrices.unitPriceMinor,
          currency: laundryPrices.currency
        })
        .from(laundryPrices)
        .innerJoin(contacts, eq(contacts.id, laundryPrices.laundryContactId))
        .innerJoin(laundryItemTypes, eq(laundryItemTypes.id, laundryPrices.itemTypeId))
        .orderBy(asc(contacts.nameNormalized), asc(laundryItemTypes.sort), asc(laundryPrices.validFrom))
        .all()
        .map((r) => ({ ...r, item: listLabel(r.itemName, r.itemI18n, opts.locale) }))
    }
  },
  {
    id: 'laundrySettlements',
    entity: 'laundry_settlement',
    permissions: ['laundry'],
    columns: [
      c('laundryName'),
      c('period'),
      c('computedTotal', 'money'),
      c('invoicedTotal', 'money'),
      c('difference', 'money'),
      c('currency'),
      c('settled', 'bool'),
      c('settledAt', 'datetime'),
      c('note')
    ],
    load(db, _ctx, opts) {
      return db
        .select({
          laundryName: contacts.name,
          year: laundrySettlements.periodYear,
          month: laundrySettlements.periodMonth,
          computedTotal: laundrySettlements.computedTotalMinor,
          invoicedTotal: laundrySettlements.invoicedTotalMinor,
          difference: laundrySettlements.differenceMinor,
          currency: laundrySettlements.currency,
          settledAt: laundrySettlements.settledAt,
          note: laundrySettlements.note
        })
        .from(laundrySettlements)
        .innerJoin(contacts, eq(contacts.id, laundrySettlements.laundryContactId))
        .orderBy(
          asc(laundrySettlements.periodYear),
          asc(laundrySettlements.periodMonth),
          asc(contacts.nameNormalized)
        )
        .all()
        .filter((r) => monthInRange(r.year, r.month, opts))
        .map((r) => ({
          ...r,
          period: `${r.year}-${String(r.month).padStart(2, '0')}`,
          settled: r.settledAt !== null
        }))
    }
  },
  {
    id: 'tasks',
    entity: 'task',
    permissions: ['tasks'],
    columns: [
      c('title', 'text', { label: 'dataTransfer.col.subject' }),
      c('room'),
      c('dueAt', 'datetime'),
      e('taskStatus', 'taskStatus'),
      c('doneAt', 'datetime'),
      c('note')
    ],
    load(db, _ctx, opts) {
      const roomNo = roomsById(db)
      return db
        .select()
        .from(tasks)
        .where(momentInRange(tasks.createdAt, opts))
        .orderBy(asc(tasks.createdAt))
        .all()
        .map((r) => ({ ...r, room: r.roomId ? (roomNo.get(r.roomId) ?? '') : '', taskStatus: r.status }))
    }
  },
  {
    id: 'issues',
    entity: 'room_issue',
    permissions: ['room_issues'],
    columns: [
      c('room'),
      c('title', 'text', { label: 'dataTransfer.col.subject' }),
      e('severity', 'issueSeverity', 'issueSeverity'),
      e('issueStatus', 'issueStatus'),
      c('reportedAt', 'datetime'),
      c('plannedDate', 'date'),
      c('resolvedAt', 'datetime'),
      c('resolutionNote')
    ],
    load(db, _ctx, opts) {
      const roomNo = roomsById(db)
      return db
        .select()
        .from(roomIssues)
        .where(momentInRange(roomIssues.reportedAt, opts))
        .orderBy(asc(roomIssues.reportedAt))
        .all()
        .map((r) => ({ ...r, room: r.roomId ? (roomNo.get(r.roomId) ?? '') : '', issueStatus: r.status }))
    }
  },
  {
    id: 'lostItems',
    entity: 'lost_item',
    permissions: ['lost_items'],
    columns: [
      c('foundAt', 'datetime'),
      c('room'),
      c('location'),
      c('description'),
      c('storage'),
      e('lostStatus', 'lostStatus'),
      c('returnedTo'),
      c('returnedAt', 'datetime'),
      c('note')
    ],
    load(db, _ctx, opts) {
      const roomNo = roomsById(db)
      return db
        .select()
        .from(lostItems)
        .where(inRange(dayOfIso(lostItems.foundAt), opts))
        .orderBy(asc(lostItems.foundAt))
        .all()
        .map((r) => ({
          ...r,
          room: r.roomId ? (roomNo.get(r.roomId) ?? '') : '',
          location: r.locationText,
          storage: r.storageLocation,
          lostStatus: r.status
        }))
    }
  },
  {
    // The handover as the reader may see it (the shift service filters the stored summary again with the reader's
    // rights: cash only for cash viewers and recomputed under K-42 (3), guest lists only with the right…). A part
    // the reader may not see stays empty.
    id: 'shiftHandovers',
    entity: 'shift_handover',
    permissions: ['shift_notes'],
    columns: [
      c('date', 'date'),
      c('shiftFrom'),
      c('shiftTo'),
      c('writtenBy'),
      c('writtenAt', 'datetime'),
      c('handoverNote'),
      c('arrivalsPending', 'int'),
      c('overdueCheckouts', 'int'),
      c('inHouseRooms', 'int'),
      c('inHousePeople', 'int'),
      c('kbsMissing', 'int'),
      c('unpaidBalances', 'int'),
      c('openTasks', 'int'),
      c('openIssues', 'int'),
      c('drawerCash'),
      c('acknowledgedBy'),
      c('acknowledgedAt', 'datetime')
    ],
    load(db, ctx, opts) {
      const shiftName = new Map(
        db
          .select()
          .from(shiftDefinitions)
          .all()
          .map((s) => [s.id, listLabel(s.name, s.nameI18n, opts.locale)])
      )
      const reader = createShiftService({ db, clock: opts.clock ?? (() => new Date()) })
      return reader
        .listHandovers(ctx, opts.from ?? '0000-01-01', opts.to ?? '9999-12-31')
        .reverse()
        .map((h) => {
          const s = h.summary
          return {
            date: h.businessDate,
            shiftFrom: h.fromShiftId ? (shiftName.get(h.fromShiftId) ?? '') : '',
            shiftTo: h.toShiftId ? (shiftName.get(h.toShiftId) ?? '') : '',
            writtenBy: h.writtenByName ?? '',
            writtenAt: h.writtenAt,
            handoverNote: h.text,
            arrivalsPending: s.arrivalsPending?.length ?? null,
            overdueCheckouts: s.overdueCheckouts?.length ?? null,
            inHouseRooms: s.inHouse?.rooms ?? null,
            inHousePeople: s.inHouse?.people ?? null,
            kbsMissing: s.kbsMissing?.length ?? null,
            unpaidBalances: s.unpaid?.length ?? null,
            openTasks: s.openTasks?.length ?? null,
            openIssues: s.openIssues?.length ?? null,
            drawerCash: s.cash ? moneyList(s.cash.drawer, opts.locale) : '',
            acknowledgedBy: h.acknowledgedByName ?? '',
            acknowledgedAt: h.acknowledgedAt
          }
        })
    }
  },
  {
    // Only the board: a personal note ("kendime not") is readable by its writer alone and never leaves the program
    // (§4.9-12), whoever exports.
    id: 'boardNotes',
    entity: 'note',
    permissions: ['shift_notes'],
    columns: [
      c('note'),
      c('pinned', 'bool'),
      c('writtenBy'),
      c('createdAt', 'datetime'),
      c('doneAt', 'datetime'),
      c('removedAt', 'datetime')
    ],
    load(db, _ctx, opts) {
      const people = usersById(db)
      return db
        .select()
        .from(notes)
        .where(and(eq(notes.kind, 'board'), momentInRange(notes.createdAt, opts)))
        .orderBy(asc(notes.createdAt))
        .all()
        .map((n) => ({
          note: n.text,
          pinned: n.pinned,
          writtenBy: userName(people, n.createdBy),
          createdAt: n.createdAt,
          doneAt: n.doneAt,
          removedAt: n.archivedAt
        }))
    }
  },
  {
    id: 'calendarDays',
    entity: 'calendar_day',
    permissions: ['calendar'],
    columns: [
      c('date', 'date'),
      {
        key: 'calendarKind',
        label: 'dataTransfer.col.calendarKind',
        type: 'enum',
        enumPrefix: 'calendarNotes.kind'
      },
      c('subject'),
      c('note'),
      c('recurringYearly', 'bool'),
      c('estimated', 'bool'),
      c('cancelled', 'bool')
    ],
    load(db, _ctx, opts) {
      return db
        .select()
        .from(calendarDays)
        .where(inRange(calendarDays.date, opts))
        .orderBy(asc(calendarDays.date), asc(calendarDays.createdAt))
        .all()
        .map((d) => ({
          date: d.date,
          calendarKind: d.kind,
          subject: listLabel(d.title, d.titleI18n, opts.locale),
          note: d.note,
          recurringYearly: d.recurringYearly,
          estimated: d.estimated,
          cancelled: d.cancelledAt !== null
        }))
    }
  },
  {
    id: 'roomTypes',
    entity: 'room_type',
    permissions: ['settings.rooms'],
    columns: [
      c('name'),
      {
        key: 'typeGroup',
        label: 'dataTransfer.col.typeGroup',
        type: 'enum',
        enumPrefix: 'settings.rooms.group'
      },
      c('maxAdults', 'int'),
      c('maxChildren', 'int'),
      c('sizeM2', 'int'),
      c('basePrice', 'money', { currencyKey: 'priceCurrency' }),
      c('weekendPrice', 'money', { currencyKey: 'priceCurrency' }),
      c('roomCount', 'int'),
      c('active', 'bool')
    ],
    load(db, _ctx, opts) {
      const counts = new Map(
        db
          .select({ id: rooms.roomTypeId, n: sql<number>`count(*)` })
          .from(rooms)
          .where(eq(rooms.active, true))
          .groupBy(rooms.roomTypeId)
          .all()
          .map((r) => [r.id, r.n])
      )
      return db
        .select()
        .from(roomTypes)
        .orderBy(asc(roomTypes.sort), asc(roomTypes.createdAt))
        .all()
        .map((r) => ({
          name: listLabel(r.name, r.nameI18n, opts.locale),
          typeGroup: r.group,
          maxAdults: r.maxAdults,
          maxChildren: r.maxChildren,
          sizeM2: r.sizeM2,
          basePrice: r.basePriceMinor,
          weekendPrice: r.weekendPriceMinor,
          priceCurrency: r.baseCurrency ?? opts.baseCurrency,
          roomCount: counts.get(r.id) ?? 0,
          active: r.active
        }))
    }
  },
  {
    id: 'rooms',
    entity: 'room',
    permissions: ['settings.rooms'],
    columns: [
      c('room'),
      c('floor'),
      c('roomType'),
      c('beds', 'int'),
      c('sellable', 'bool'),
      c('active', 'bool'),
      { key: 'hkStatus', label: 'dataTransfer.col.hkStatus', type: 'enum', enumPrefix: 'hk' },
      c('notes')
    ],
    load(db, _ctx, opts) {
      return db
        .select({
          room: rooms.number,
          floor: rooms.floor,
          typeName: roomTypes.name,
          typeI18n: roomTypes.nameI18n,
          beds: rooms.beds,
          sellable: rooms.sellable,
          active: rooms.active,
          hkStatus: rooms.hkStatus,
          notes: rooms.notes
        })
        .from(rooms)
        .innerJoin(roomTypes, eq(roomTypes.id, rooms.roomTypeId))
        .orderBy(asc(rooms.sort), asc(rooms.number))
        .all()
        .map((r) => ({ ...r, roomType: listLabel(r.typeName, r.typeI18n, opts.locale) }))
    }
  },
  {
    // K-27: rooms added or closed and beds changed from a day on; the reports count each day with what held then.
    id: 'roomCapacity',
    entity: 'room',
    permissions: ['settings.rooms'],
    columns: [
      c('room'),
      c('validFrom', 'date'),
      c('active', 'bool'),
      c('sellable', 'bool'),
      c('beds', 'int'),
      c('note'),
      c('writtenBy'),
      c('createdAt', 'datetime')
    ],
    load(db, _ctx, opts) {
      const people = usersById(db)
      return db
        .select({
          room: rooms.number,
          validFrom: roomCapacityChanges.validFrom,
          active: roomCapacityChanges.active,
          sellable: roomCapacityChanges.sellable,
          beds: roomCapacityChanges.beds,
          note: roomCapacityChanges.note,
          createdBy: roomCapacityChanges.createdBy,
          createdAt: roomCapacityChanges.createdAt
        })
        .from(roomCapacityChanges)
        .innerJoin(rooms, eq(rooms.id, roomCapacityChanges.roomId))
        .where(inRange(roomCapacityChanges.validFrom, opts))
        .orderBy(asc(rooms.sort), asc(rooms.number), asc(roomCapacityChanges.validFrom))
        .all()
        .map((r) => ({ ...r, writtenBy: userName(people, r.createdBy) }))
    }
  },
  {
    // Satılmaz / kullanım dışı (G-38): `[first day, first free day)` like a stay; the file shows the last day.
    id: 'roomBlocks',
    entity: 'room_block',
    permissions: ['calendar'],
    columns: [
      c('room'),
      c('firstDay', 'date'),
      c('lastDay', 'date'),
      { key: 'blockKind', label: 'dataTransfer.col.blockKind', type: 'enum', enumPrefix: 'rooms.blockKind' },
      c('reason'),
      c('note'),
      c('cancelled', 'bool'),
      c('cancelledAt', 'datetime'),
      c('writtenBy'),
      c('createdAt', 'datetime')
    ],
    load(db, _ctx, opts) {
      const people = usersById(db)
      return db
        .select({
          room: rooms.number,
          dateFrom: roomBlocks.dateFrom,
          dateTo: roomBlocks.dateTo,
          blockKind: roomBlocks.kind,
          reason: roomBlocks.reason,
          note: roomBlocks.note,
          cancelledAt: roomBlocks.cancelledAt,
          createdBy: roomBlocks.createdBy,
          createdAt: roomBlocks.createdAt
        })
        .from(roomBlocks)
        .innerJoin(rooms, eq(rooms.id, roomBlocks.roomId))
        .orderBy(asc(roomBlocks.dateFrom), asc(rooms.number))
        .all()
        .filter((b) => stayInRange(opts.from, opts.to, b.dateFrom, b.dateTo))
        .map((b) => ({
          ...b,
          firstDay: b.dateFrom,
          lastDay: b.dateTo > b.dateFrom ? addDays(localDate(b.dateTo), -1) : b.dateFrom,
          cancelled: b.cancelledAt !== null,
          writtenBy: userName(people, b.createdBy)
        }))
    }
  },
  {
    id: 'fxRates',
    entity: 'fx_rate',
    permissions: ['currency'],
    columns: [
      c('observedAt', 'datetime'),
      c('fxBase'),
      c('fxQuote'),
      c('rate', 'rate'),
      e('fxSource', 'fxSource'),
      c('provider'),
      c('writtenBy')
    ],
    load(db, _ctx, opts) {
      const people = usersById(db)
      return db
        .select()
        .from(fxRates)
        .where(momentInRange(fxRates.ts, opts))
        .orderBy(asc(fxRates.ts), asc(fxRates.base), asc(fxRates.quote))
        .all()
        .map((r) => ({
          observedAt: r.ts,
          fxBase: r.base,
          fxQuote: r.quote,
          rate: r.midRateMicro,
          fxSource: r.source,
          provider: r.provider,
          writtenBy: userName(people, r.createdBy)
        }))
    }
  },
  {
    id: 'importBatches',
    entity: 'import_batch',
    permissions: ['settings.backup'],
    columns: [
      c('createdAt', 'datetime'),
      c('template'),
      c('fileName'),
      c('writtenBy'),
      c('importedReservations', 'int'),
      c('nights', 'int'),
      c('importedPayments', 'int'),
      c('importedExpenses', 'int'),
      c('importedSalaries', 'int'),
      c('importedSalaryPayments', 'int'),
      c('voided', 'bool'),
      c('voidedAt', 'datetime'),
      c('voidReason')
    ],
    load(db, _ctx, opts) {
      const people = usersById(db)
      return db
        .select()
        .from(importBatches)
        .where(momentInRange(importBatches.createdAt, opts))
        .orderBy(asc(importBatches.createdAt))
        .all()
        .map((b) => {
          const n = b.summaryJson
          return {
            createdAt: b.createdAt,
            template: opts.t(`dataTransfer.import.templates.${b.template}.name`),
            fileName: b.fileName,
            writtenBy: userName(people, b.createdBy),
            importedReservations: n.reservations ?? 0,
            nights: n.nights ?? 0,
            importedPayments: n.payments ?? 0,
            importedExpenses: n.expenses ?? 0,
            importedSalaries: n.salaries ?? 0,
            importedSalaryPayments: n.salaryPayments ?? 0,
            voided: b.voidedAt !== null,
            voidedAt: b.voidedAt,
            voidReason: b.voidReason
          }
        })
    }
  }
]

export const datasetOf = (id: ExportDataset): DatasetDef => DATASETS.find((d) => d.id === id)!
