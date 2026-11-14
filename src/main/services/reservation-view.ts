// Read side of the reservation panel (faz-05 madde 2, 3, 4, 7b): one reservation as the panel shows it (nights
// with their §6.14 cell style, people and KBS gaps, payments, open issues of the rooms), the form's lists, the
// rooms taken in a date range, the parked list and blacklist matches. Plain reads: the calling service checks the
// permission first (reservations-service), and decides which parts the user may see.
import { and, asc, desc, eq, gte, inArray, isNull, lt, ne, or } from 'drizzle-orm'
import { STATUS_KEYS, type StatusKey } from '@shared/contract/settings'
import { addDays, localDate, type LocalDate } from '@shared/date'
import { matchBlacklist, type BlacklistCandidate, type MatchReason } from '@shared/domain/blacklist'
import { cellStyle, type CellStyle } from '@shared/domain/cell-status'
import { rateAge } from '@shared/domain/external'
import { kbsMissing, type KbsIssue, type StayRoomLike } from '@shared/domain/occupants'
import { checkoutPlan } from '@shared/domain/booking'
import {
  findConflicts,
  hourlyAmountMinor,
  occupancyFrom,
  staySlots,
  largestFreeRange,
  usedHours,
  type HourRange
} from '@shared/domain/stays'
import {
  blacklist,
  charges,
  folios,
  guests,
  paymentMethods,
  payments,
  reservationGroups,
  reservationRooms,
  reservations,
  reservationTags,
  roomBlocks,
  roomIssues,
  roomNights,
  rooms,
  roomTypes,
  salesChannels,
  statusTags,
  stayOccupants
} from '../db/schema'
import type { I18nText } from '../db/schema/columns'
import type { Tx } from './kit'
import { capacityReader } from './room-capacity'
import type { ReservationDetail } from './reservations-service'

type Reader = Pick<Tx, 'select' | 'selectDistinct'>

export interface OpenIssueView {
  id: string
  roomId: string
  title: string
  severity: 'low' | 'medium' | 'urgent'
  status: 'open' | 'planned'
  blocksRoom: boolean
}

export interface OccupantView {
  id: string
  guestId: string | null
  fullName: string
  isPrimary: boolean
  descriptorNote: string | null
  arrivedAt: string | null
  leftAt: string | null
  kbsReportedAt: string | null
  kbsCheckoutAt: string | null
}

export interface NightBookingView {
  id: string
  date: LocalDate
  slot: 'night' | 'day'
  priceMinor: number
  currency: string
  payStatus: 'paid' | 'partial' | 'unpaid'
  allocatedMinor: number
  style: CellStyle
}

export interface StayBookingView {
  id: string
  roomId: string
  roomNumber: string
  roomTypeName: string
  roomTypeNameI18n: I18nText | null
  checkIn: LocalDate
  checkOut: LocalDate
  status: 'planned' | 'in_house' | 'done' | 'cancelled'
  checkedInAt: string | null
  checkedOutAt: string | null
  dayUse: boolean
  /** Hours of an hourly stay (K-48); null = none. */
  startTime: string | null
  endTime: string | null
  /**
   * What leaving today would make of an overnight stay that is still on its check-in day (K-44): the day-use's
   * hours (null = the whole day) and the suggested price (the room type's hour price × the hours; null = none).
   * Null when it does not apply or the day slot has no free range (the night then stays as it was).
   */
  sameDay: { startTime: string | null; endTime: string | null; suggestedMinor: number | null } | null
  nights: NightBookingView[]
  occupants: OccupantView[]
  /** §6.15 for this stay now (empty when the hotel switched KBS checks off or the user may not see people). */
  kbsIssues: Pick<KbsIssue, 'occupantId' | 'fullName' | 'kind'>[]
  openIssues: OpenIssueView[]
}

export interface PaymentLineView {
  id: string
  date: string
  kind: 'payment' | 'deposit' | 'refund'
  methodId: string
  channelId: string | null
  amountMinor: number
  currency: string
  amountFolioMinor: number
  rateStale: boolean
  rateObservedAt: string | null
  voided: boolean
  collected: boolean
  reference: string | null
  note: string | null
  createdAt: string
}

/** Market sources whose age matters; the hotel's own rate and a rate typed at the desk are meant as they are. */
/** The open end of "in use from today on" (a room still to open, or not taken out of use for good). */
const FAR_FUTURE = '9999-12-31'

const AGING_SOURCES = new Set(['market_mid', 'user_api', 'tcmb'])

/**
 * The rate frozen with a payment (S-32) was older than six hours at the minute of writing (`rateAge`, the same
 * rule as the currency screen): the internet was off and the last known rate was used.
 */
export function rateWasStale(p: {
  fxRateAt: string | null
  fxRateObservedAt: string | null
  fxSource: string | null
}): boolean {
  if (!p.fxRateAt || !p.fxRateObservedAt || !p.fxSource || !AGING_SOURCES.has(p.fxSource)) return false
  return rateAge(p.fxRateObservedAt, p.fxRateAt) !== 'fresh'
}

export interface BookingView {
  reservation: {
    id: string
    code: string
    status: ReservationDetail['reservation']['status']
    kind: 'overnight' | 'day_use'
    channelId: string
    channelRef: string | null
    adults: number | null
    children: number | null
    notes: string | null
    parkedReason: ReservationDetail['reservation']['parkedReason']
    parkedNote: string | null
    cancelReason: string | null
    group: { id: string; name: string } | null
    createdAt: string
  }
  guest: {
    id: string
    firstName: string
    lastName: string
    phone: string | null
    email: string | null
    nationality: string | null
    vip: boolean
  }
  standingNote: ReservationDetail['standingNote']
  stays: StayBookingView[]
  /** Credits and balance are null for a user who may not see payments (the in-house list hides them too). */
  folio: Omit<ReservationDetail['folio'], 'creditedMinor' | 'balanceMinor'> & {
    creditedMinor: number | null
    balanceMinor: number | null
  }
  /** null: the user may not see payments. */
  payments: PaymentLineView[] | null
  occupantsVisible: boolean
  tagIds: string[]
  notes: { id: string; text: string; date: string | null; createdAt: string; createdBy: string | null }[]
}

export interface ViewOptions {
  today: LocalDate
  nowIso: string
  showPeople: boolean
  showPayments: boolean
  kbsChecks: boolean
}

/** Automatic statuses the hotel keeps on (status_tags kind=auto). */
export function enabledAutoStatuses(tx: Reader): Set<StatusKey> {
  return new Set(
    tx
      .select({ code: statusTags.code })
      .from(statusTags)
      .where(and(eq(statusTags.kind, 'auto'), eq(statusTags.enabled, true)))
      .all()
      .map((t) => t.code)
      .filter((c): c is StatusKey => (STATUS_KEYS as readonly string[]).includes(c))
  )
}

/** Open and planned issues of the given rooms (G-180: "bu odada açık arıza var"). */
export function openIssuesOf(tx: Reader, roomIds: readonly string[]): OpenIssueView[] {
  if (!roomIds.length) return []
  return tx
    .select()
    .from(roomIssues)
    .where(and(inArray(roomIssues.roomId, [...roomIds]), ne(roomIssues.status, 'resolved')))
    .orderBy(desc(roomIssues.reportedAt))
    .all()
    .map((i) => ({
      id: i.id,
      roomId: i.roomId ?? '',
      title: i.title,
      severity: i.severity,
      status: i.status as 'open' | 'planned',
      blocksRoom: i.blocksRoom
    }))
}

const occupantView = (o: typeof stayOccupants.$inferSelect): OccupantView => ({
  id: o.id,
  guestId: o.guestId,
  fullName: o.fullName,
  isPrimary: o.isPrimary,
  descriptorNote: o.descriptorNote,
  arrivedAt: o.arrivedAt,
  leftAt: o.leftAt,
  kbsReportedAt: o.kbsReportedAt,
  kbsCheckoutAt: o.kbsCheckoutAt
})

/**
 * The day range a stay leaving on its check-in day gets (K-44, hata C), so its night is free to sell again:
 * 1. the hours it really used, if no other day range of the room and day clashes;
 * 2. else the longest part of those hours that is free;
 * 3. else the longest free stretch of the day (the hours are then only a record, the night is still released);
 * 4. else nothing is left to sell that day: a whole-day record without hours (unless one exists already);
 * 5. else null (a whole-day record of another stay holds the day): the caller releases the night with no day slot.
 */
export function sameDayRange(
  tx: Reader,
  stay: { roomId: string; checkIn: string; checkedInAt: string | null },
  now: Date
): HourRange | null {
  const others = tx
    .select({ start: roomNights.startTime, end: roomNights.endTime })
    .from(roomNights)
    .where(
      and(eq(roomNights.roomId, stay.roomId), eq(roomNights.date, stay.checkIn), eq(roomNights.slot, 'day'))
    )
    .all()
  const used = usedHours(stay.checkedInAt ? new Date(stay.checkedInAt) : null, localDate(stay.checkIn), now)
  const fit = used ? largestFreeRange(used, others) : null
  if (fit) return fit
  if (!others.length) return { start: null, end: null }
  const gap = largestFreeRange({ start: '00:00', end: '23:59' }, others)
  if (gap) return gap
  return others.some((o) => o.start === null || o.end === null) ? null : { start: null, end: null }
}

/** The panel's view of one reservation, built on the service's detail (allocation already done there). */
export function bookingView(tx: Reader, detail: ReservationDetail, opts: ViewOptions): BookingView {
  const id = detail.reservation.id
  const guest = tx.select().from(guests).where(eq(guests.id, detail.guest.id)).get()
  const stayIds = detail.stays.map((s) => s.id)
  const roomRows = stayIds.length
    ? tx
        .select({
          id: rooms.id,
          typeName: roomTypes.name,
          typeNameI18n: roomTypes.nameI18n,
          hourlyMinor: roomTypes.hourlyPriceMinor
        })
        .from(rooms)
        .innerJoin(roomTypes, eq(rooms.roomTypeId, roomTypes.id))
        .where(
          inArray(
            rooms.id,
            detail.stays.map((s) => s.roomId)
          )
        )
        .all()
    : []
  const typeOf = new Map(roomRows.map((r) => [r.id, r]))
  const occupantRows =
    opts.showPeople && stayIds.length
      ? tx
          .select()
          .from(stayOccupants)
          .where(inArray(stayOccupants.reservationRoomId, stayIds))
          .orderBy(asc(stayOccupants.createdAt))
          .all()
      : []
  const enabled = enabledAutoStatuses(tx)
  const custom = tx
    .select({ id: statusTags.id, enabled: statusTags.enabled, priorityOverAuto: statusTags.priorityOverAuto })
    .from(reservationTags)
    .innerJoin(statusTags, eq(statusTags.id, reservationTags.tagId))
    .where(eq(reservationTags.reservationId, id))
    .orderBy(asc(statusTags.sort), asc(statusTags.createdAt))
    .all()
  const issues = openIssuesOf(
    tx,
    detail.stays.filter((s) => s.status === 'planned' || s.status === 'in_house').map((s) => s.roomId)
  )
  const sameDayOf = (
    s: ReservationDetail['stays'][number],
    hourlyMinor: number | null,
    currency: string
  ): StayBookingView['sameDay'] => {
    if (s.status !== 'in_house' || s.checkIn === s.checkOut) return null
    if (
      checkoutPlan({ checkIn: s.checkIn as LocalDate, checkOut: s.checkOut as LocalDate }, opts.today)
        .kind !== 'sameDay'
    )
      return null
    const range = sameDayRange(tx, s, new Date(opts.nowIso))
    if (!range) return null
    return {
      startTime: range.start,
      endTime: range.end,
      suggestedMinor:
        hourlyMinor !== null && range.start && range.end
          ? hourlyAmountMinor(hourlyMinor, currency, range.start, range.end)
          : null
    }
  }
  const stays: StayBookingView[] = detail.stays.map((s) => {
    const dayUse = s.checkIn === s.checkOut
    const occupants = occupantRows.filter((o) => o.reservationRoomId === s.id)
    const stayLike: StayRoomLike = {
      id: s.id,
      roomId: s.roomId,
      reservationId: id,
      checkIn: s.checkIn as LocalDate,
      checkOut: s.checkOut as LocalDate,
      checkedInAt: s.checkedInAt,
      checkedOutAt: s.checkedOutAt,
      cancelled: s.status === 'cancelled'
    }
    const kbsIssues =
      opts.showPeople && opts.kbsChecks
        ? kbsMissing([stayLike], occupants, opts.nowIso).map((k) => ({
            occupantId: k.occupantId,
            fullName: k.fullName,
            kind: k.kind
          }))
        : []
    const type = typeOf.get(s.roomId)
    return {
      id: s.id,
      roomId: s.roomId,
      roomNumber: s.roomNumber,
      roomTypeName: type?.typeName ?? '',
      roomTypeNameI18n: type?.typeNameI18n ?? null,
      checkIn: s.checkIn as LocalDate,
      checkOut: s.checkOut as LocalDate,
      status: s.status,
      checkedInAt: s.checkedInAt,
      checkedOutAt: s.checkedOutAt,
      dayUse,
      startTime: s.nights.find((n) => n.slot === 'day')?.startTime ?? null,
      endTime: s.nights.find((n) => n.slot === 'day')?.endTime ?? null,
      sameDay: sameDayOf(s, type?.hourlyMinor ?? null, detail.folio.currency),
      nights: s.nights.map((n) => ({
        ...n,
        style: cellStyle(
          { pay: n.payStatus, dayUse, blocked: false, past: n.date < opts.today },
          enabled,
          custom
        )
      })),
      occupants: occupants.map(occupantView),
      kbsIssues,
      openIssues:
        s.status === 'planned' || s.status === 'in_house' ? issues.filter((i) => i.roomId === s.roomId) : []
    }
  })
  const paymentRows = opts.showPayments
    ? tx
        .select()
        .from(payments)
        .where(eq(payments.folioId, detail.folio.id))
        .orderBy(asc(payments.date), asc(payments.createdAt))
        .all()
        .map((p) => ({
          id: p.id,
          date: p.date,
          kind: p.kind,
          methodId: p.methodId,
          channelId: p.channelId,
          amountMinor: p.amountMinor,
          currency: p.currency,
          amountFolioMinor: p.amountFolioMinor,
          rateStale: rateWasStale(p),
          rateObservedAt: p.fxRateObservedAt,
          voided: !!p.voidedAt,
          collected: !!p.collectedAt,
          reference: p.reference,
          note: p.note,
          createdAt: p.createdAt
        }))
    : null
  const r = detail.reservation
  const group = r.groupId
    ? (tx
        .select({ id: reservationGroups.id, name: reservationGroups.name })
        .from(reservationGroups)
        .where(eq(reservationGroups.id, r.groupId))
        .get() ?? null)
    : null
  return {
    reservation: {
      id: r.id,
      code: r.code,
      status: r.status,
      kind: r.kind,
      channelId: r.channelId,
      channelRef: r.channelRef,
      adults: r.adults,
      children: r.children,
      notes: r.notes,
      parkedReason: r.parkedReason,
      parkedNote: r.parkedNote,
      cancelReason: r.cancelReason,
      group,
      createdAt: r.createdAt
    },
    guest: {
      id: detail.guest.id,
      firstName: detail.guest.firstName,
      lastName: detail.guest.lastName,
      phone: guest?.phone ?? null,
      email: guest?.email ?? null,
      nationality: guest?.nationality ?? null,
      vip: detail.guest.vip
    },
    standingNote: detail.standingNote,
    stays,
    folio: opts.showPayments ? detail.folio : { ...detail.folio, creditedMinor: null, balanceMinor: null },
    payments: paymentRows,
    occupantsVisible: opts.showPeople,
    tagIds: detail.tagIds,
    notes: detail.notes
      .map((n) => ({ id: n.id, text: n.text, date: n.date, createdAt: n.createdAt, createdBy: n.createdBy }))
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
  }
}

export interface FormRoom {
  id: string
  number: string
  floor: string | null
  roomTypeId: string
  typeName: string
  typeNameI18n: I18nText | null
  beds: number
  sellable: boolean
  hkStatus: string
  basePriceMinor: number | null
  weekendPriceMinor: number | null
  /** The type's price of one hour of an hourly stay (K-48); null = none. */
  hourlyPriceMinor: number | null
  priceCurrency: string | null
  openIssues: OpenIssueView[]
}

export interface FormOptions {
  rooms: FormRoom[]
  channels: { id: string; code: string; name: string; nameI18n: I18nText | null }[]
  methods: { id: string; code: string; name: string; nameI18n: I18nText | null; isCash: boolean }[]
}

/**
 * Rooms (with type, price and open issues), sales channels and payment methods the forms offer. Rooms: in use
 * today or from a later day by their capacity history (K-27), with today's beds and "for sale" (a room opening
 * later: its opening values); a room's closed days are refused when a stay is written.
 */
export function formOptions(tx: Reader, today: LocalDate): FormOptions {
  const reader = capacityReader(tx)
  const roomRows = tx
    .select({ room: rooms, type: roomTypes })
    .from(rooms)
    .innerJoin(roomTypes, eq(rooms.roomTypeId, roomTypes.id))
    .orderBy(asc(rooms.sort), asc(rooms.number))
    .all()
    .filter(({ room }) => reader.activeBetween(room, today, FAR_FUTURE))
    .map(({ room, type }) => {
      const first = reader.firstDay(room.id)
      const state = reader.on(room, first && first > today ? first : today) ?? room
      return { room: { ...room, beds: state.beds, sellable: state.sellable }, type }
    })
  const issues = openIssuesOf(
    tx,
    roomRows.map((r) => r.room.id)
  )
  return {
    rooms: roomRows.map(({ room, type }) => ({
      id: room.id,
      number: room.number,
      floor: room.floor,
      roomTypeId: type.id,
      typeName: type.name,
      typeNameI18n: type.nameI18n,
      beds: room.beds,
      sellable: room.sellable,
      hkStatus: room.hkStatus,
      basePriceMinor: type.basePriceMinor,
      weekendPriceMinor: type.weekendPriceMinor,
      hourlyPriceMinor: type.hourlyPriceMinor,
      priceCurrency: type.baseCurrency,
      openIssues: issues.filter((i) => i.roomId === room.id)
    })),
    channels: tx
      .select()
      .from(salesChannels)
      .where(eq(salesChannels.active, true))
      .orderBy(asc(salesChannels.sort), asc(salesChannels.createdAt))
      .all()
      .map((c) => ({ id: c.id, code: c.code, name: c.name, nameI18n: c.nameI18n })),
    methods: tx
      .select()
      .from(paymentMethods)
      .where(eq(paymentMethods.active, true))
      .orderBy(asc(paymentMethods.sort), asc(paymentMethods.createdAt))
      .all()
      .map((m) => ({ id: m.id, code: m.code, name: m.name, nameI18n: m.nameI18n, isCash: m.isCash }))
  }
}

/** Occupied slots of every room in [from, to) and the day before (a stay going on into it, G-37). */
export function occupiedSlots(tx: Reader, from: LocalDate, to: LocalDate) {
  return tx
    .select({
      roomId: roomNights.roomId,
      date: roomNights.date,
      slot: roomNights.slot,
      startTime: roomNights.startTime,
      endTime: roomNights.endTime,
      reservationId: reservationRooms.reservationId,
      stayId: roomNights.reservationRoomId
    })
    .from(roomNights)
    .innerJoin(reservationRooms, eq(roomNights.reservationRoomId, reservationRooms.id))
    .where(and(gte(roomNights.date, occupancyFrom(from)), lt(roomNights.date, to)))
    .all()
    .map((o) => ({ ...o, date: o.date as LocalDate }))
}

/**
 * Rooms that cannot take a stay [from, to) (a day-use when from == to): `occupied` by another reservation's
 * night or day (or a stay going on through the day of a day-use), `blocked` by a room block; `notForSale`: rooms
 * the hotel does not sell (G-38: they take a stay only with a reason, like a block). Slots of
 * `excludeReservationId` are ignored (editing it).
 */
export function roomsTaken(
  tx: Reader,
  from: LocalDate,
  to: LocalDate,
  excludeReservationId?: string,
  hours?: { start: string; end: string }
): { occupied: string[]; blocked: string[]; notForSale: string[] } {
  const slots = staySlots(from, to, hours)
  const end = from === to ? addDays(from, 1) : to
  const occupiedRows = occupiedSlots(tx, from, end)
  const blockRows = tx
    .select()
    .from(roomBlocks)
    .where(and(isNull(roomBlocks.cancelledAt), lt(roomBlocks.dateFrom, end), gte(roomBlocks.dateTo, from)))
    .all()
    .map((b) => ({ ...b, dateFrom: b.dateFrom as LocalDate, dateTo: b.dateTo as LocalDate }))
  const roomIds = new Set([...occupiedRows.map((o) => o.roomId), ...blockRows.map((b) => b.roomId)])
  const occupied: string[] = []
  const blocked: string[] = []
  for (const roomId of roomIds) {
    const conflicts = findConflicts(roomId, slots, occupiedRows, blockRows, excludeReservationId)
    if (conflicts.some((c) => c.reason === 'occupied')) occupied.push(roomId)
    if (conflicts.some((c) => c.reason === 'blocked')) blocked.push(roomId)
  }
  // By the capacity history (K-27): a room not in use on a day of the range cannot take the stay at all (like an
  // occupied one, no override); one in use but not for sale on a day needs a reason, like a block.
  const reader = capacityReader(tx)
  const days = slots.map((s) => s.date)
  const notForSale: string[] = []
  for (const room of tx
    .select({ id: rooms.id, active: rooms.active, sellable: rooms.sellable, beds: rooms.beds })
    .from(rooms)
    .all()) {
    if (days.some((d) => !reader.activeOn(room, d))) {
      if (!occupied.includes(room.id)) occupied.push(room.id)
    } else if (!reader.sellableOn(room, days)) notForSale.push(room.id)
  }
  return { occupied: occupied.sort(), blocked: blocked.sort(), notForSale: notForSale.sort() }
}

export interface ParkedView {
  id: string
  code: string
  guestName: string
  parkedReason: ReservationDetail['reservation']['parkedReason']
  parkedNote: string | null
  currency: string
  creditedMinor: number
  /** The rooms and dates it had before it was parked (the restore dialog starts from them). */
  stays: { roomId: string; roomNumber: string; checkIn: LocalDate; checkOut: LocalDate }[]
  /** The last nightly price it had (voided with the park), for the restore dialog. */
  lastNightlyMinor: number | null
  parkedAt: string
}

/** Parked reservations (G-39), newest first, with what they paid. */
export function parkedList(tx: Reader, credited: (folioId: string) => number): ParkedView[] {
  const rows = tx
    .select({ r: reservations, g: guests, f: folios })
    .from(reservations)
    .innerJoin(guests, eq(guests.id, reservations.primaryGuestId))
    .innerJoin(folios, eq(folios.reservationId, reservations.id))
    .where(eq(reservations.status, 'parked'))
    .orderBy(desc(reservations.updatedAt))
    .all()
  return rows.map(({ r, g, f }) => {
    const released = tx
      .select({ s: reservationRooms, number: rooms.number })
      .from(reservationRooms)
      .innerJoin(rooms, eq(rooms.id, reservationRooms.roomId))
      .where(and(eq(reservationRooms.reservationId, r.id), eq(reservationRooms.status, 'cancelled')))
      .orderBy(asc(reservationRooms.sort), asc(reservationRooms.checkIn))
      .all()
    // Only the stays the last park released (a reservation parked, restored and parked again had others).
    const lastPark = released.reduce(
      (max, x) => ((x.s.releasedAt ?? '') > max ? (x.s.releasedAt ?? '') : max),
      ''
    )
    const seen = new Set<string>()
    const stays = released.filter(({ s }) => {
      const key = `${s.roomId}|${s.checkIn}|${s.checkOut}`
      if ((s.releasedAt ?? '') !== lastPark || seen.has(key)) return false
      seen.add(key)
      return true
    })
    const last = tx
      .select({ amount: charges.amountMinor })
      .from(charges)
      .where(and(eq(charges.folioId, f.id), eq(charges.kind, 'room_night'), eq(charges.voidReason, 'parked')))
      .orderBy(desc(charges.date))
      .get()
    return {
      id: r.id,
      code: r.code,
      guestName: `${g.firstName} ${g.lastName}`.trim(),
      parkedReason: r.parkedReason,
      parkedNote: r.parkedNote,
      currency: f.currency,
      creditedMinor: credited(f.id),
      stays: stays.map(({ s, number }) => ({
        roomId: s.roomId,
        roomNumber: number,
        checkIn: s.checkIn as LocalDate,
        checkOut: s.checkOut as LocalDate
      })),
      lastNightlyMinor: last?.amount ?? null,
      parkedAt: r.updatedAt
    }
  })
}

export interface BlacklistHitBrief {
  entryId: string
  name: string
  severity: 'warn' | 'block'
  reasons: MatchReason[]
  /** Only for users who may read the blacklist. */
  reasonText: string | null
}

/**
 * The records of one person the blacklist is checked against: the guest card and the cards merged into it (their
 * earlier spellings, phones and documents), each with its id (an entry tied to a card matches it, §6.9).
 */
export function blacklistCandidatesOf(tx: Reader, guestId: string): BlacklistCandidate[] {
  const rows = tx
    .select()
    .from(guests)
    .where(or(eq(guests.id, guestId), eq(guests.mergedIntoId, guestId)))
    .all()
  return rows.map((g) => ({
    name: `${g.firstName} ${g.lastName}`.trim(),
    phone: g.phone,
    idDocNumber: g.idDocNumber,
    guestId: g.id
  }))
}

/**
 * §6.9 for a person about to be booked or added to a room, and for a guest card: active entries matching by the
 * guest record (with the cards merged into it), name, document number or phone. One rule everywhere.
 */
export function blacklistMatches(
  tx: Reader,
  candidate: { name: string; phone?: string | null; idDocNumber?: string | null; guestId?: string | null },
  showReason: boolean
): BlacklistHitBrief[] {
  if (!candidate.name.trim() && !candidate.phone && !candidate.idDocNumber && !candidate.guestId) return []
  const entries = tx.select().from(blacklist).where(eq(blacklist.status, 'active')).all()
  const candidates = [candidate, ...(candidate.guestId ? blacklistCandidatesOf(tx, candidate.guestId) : [])]
  return matchBlacklist(candidates, entries).map((hit) => ({
    entryId: hit.entry.id,
    name: hit.entry.name,
    severity: hit.entry.severity,
    reasons: hit.reasons,
    reasonText: showReason ? hit.entry.reasonText : null
  }))
}
