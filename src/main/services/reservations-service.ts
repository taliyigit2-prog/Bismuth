// Reservations: stays, nights, folio charges, room changes, cancel/park, check-in/out (03-mimari.md §4.4, §6.1,
// §6.2, §6.3; G-35…G-44, G-48, G-60, G-90, K-09). One reservation = one folio; every night has exactly one live
// room-night charge (§4.8-2); a price change voids the old charge and writes a new one (never edits history).
import { and, asc, eq, gte, inArray, isNotNull, isNull, lt, ne } from 'drizzle-orm'
import {
  cancelReasonSchema,
  cancelRefundSchema,
  undoThenSchema,
  changeDatesSchema,
  changeRoomSchema,
  dateRangeSchema,
  moveDatesSchema,
  nightPricesSchema,
  parkSchema,
  reservationCreateSchema,
  reservationStatusSchema,
  type stayInputSchema,
  unparkSchema,
  type CancelRefundInput,
  type UndoThenInput,
  type PaymentCreateInput,
  type ChangeDatesInput,
  type ChangeRoomInput,
  type MoveDatesInput,
  type ReservationCreateInput,
  MAX_STAY_NIGHTS
} from '@shared/contract/reservations'
import {
  MAX_GROUP_ROOMS,
  groupAttachSchema,
  groupCancelSchema,
  groupCreateSchema,
  groupNoteSchema,
  groupPaySchema,
  groupStaysSchema,
  kbsGapsInputSchema,
  type KbsGapsInput,
  type GroupAttachInput,
  type GroupCancelInput,
  type GroupCreateInput,
  type GroupNoteInput,
  type GroupPayInput,
  type GroupStaysInput,
  type GroupViewDto
} from '@shared/contract/groups'
import { localDateSchema } from '@shared/contract/rooms'
import {
  addRoomSchema,
  availabilityInputSchema,
  guestCandidateInputSchema,
  hourlyCheckInputSchema,
  type HourlyCheck,
  type HourlyCheckInput,
  priceSuggestionInputSchema,
  reservationUpdateSchema,
  type ReservationUpdateInput
} from '@shared/contract/booking'
import { insertFeeCharge } from './fees-service'
import { assertDayWritable } from './expenses-service'
import { checkoutPlan, suggestStayPrices } from '@shared/domain/booking'
import { addDays, diffDays, localDate, localDateOf, weekday, type LocalDate } from '@shared/date'
import {
  allocatePayments,
  creditedTotal,
  folioTotals,
  groupPayableMinor,
  isGroupPayableStatus,
  type NightPayStatus
} from '@shared/domain/payment-allocation'
import { normalizeName, normalizePhone } from '@shared/domain/normalize'
import { isCountedStay } from '@shared/domain/reports'
import {
  findConflicts,
  hourlyAmountMinor,
  occupancyFrom,
  splitForRoomChange,
  staySlots,
  turnoverWarnings,
  type HourRange,
  type Slot,
  type StaySlot
} from '@shared/domain/stays'
import { kbsMissing } from '@shared/domain/occupants'
import { standingNoteAlert } from '@shared/domain/cell-status'
import type * as z from 'zod'
import {
  charges,
  folios,
  guests,
  payments,
  reservationCodeSequences,
  reservationGroups,
  reservationNotes,
  reservationRooms,
  reservations,
  reservationTags,
  roomBlocks,
  roomNights,
  rooms,
  roomTypes,
  salesChannels,
  statusTags,
  stayOccupants
} from '../db/schema'
import type { AuditEntry } from './audit'
import type { Ctx } from './context'
import { releaseFaces } from './camera-faces'
import { baseCurrencyOf, chargeBaseMinor } from './currency-service'
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
  type Tx
} from './kit'
import { capacityReader } from './room-capacity'
import { markRoomDirtyAfterCheckout } from './rooms-service'
import { readSetting } from './settings-service'
import {
  blacklistMatches,
  bookingView,
  formOptions,
  occupiedSlots,
  parkedList,
  roomsTaken,
  sameDayRange,
  type BookingView,
  type ParkedView
} from './reservation-view'

export type ReservationRow = typeof reservations.$inferSelect
export type StayRow = typeof reservationRooms.$inferSelect

export interface ReservationHooks {
  /** After a check-out: opens "every N stays" tasks (tasks service, §6.8). */
  onCheckout?: (ctx: Ctx, roomId: string, date: LocalDate) => void
  /** A refund row written inside the caller's transaction (the cancellation that gives the money back, K-55). */
  recordRefund?: (
    ctx: Ctx,
    tx: Tx,
    audit: (entry: AuditEntry) => void,
    now: Date,
    input: PaymentCreateInput
  ) => void
  /** A payment row written inside the caller's transaction (a group's single-account payment, S-106). */
  recordPayment?: (
    ctx: Ctx,
    tx: Tx,
    audit: (entry: AuditEntry) => void,
    now: Date,
    input: PaymentCreateInput
  ) => void
}

export interface NightView {
  id: string
  date: LocalDate
  slot: Slot
  /** 'HH:MM' of an hourly day slot (K-48); null = no hours. */
  startTime: string | null
  endTime: string | null
  priceMinor: number
  currency: string
  payStatus: NightPayStatus
  allocatedMinor: number
}

export interface StayView extends StayRow {
  roomNumber: string
  nights: NightView[]
}

export interface ReservationDetail {
  reservation: ReservationRow
  guest: { id: string; firstName: string; lastName: string; vip: boolean }
  standingNote: ReturnType<typeof standingNoteAlert>
  stays: StayView[]
  folio: { id: string; currency: string; chargesMinor: number; creditedMinor: number; balanceMinor: number }
  tagIds: string[]
  notes: (typeof reservationNotes.$inferSelect)[]
}

type StayInput = z.output<typeof stayInputSchema>

const ACTIVE_STAY = ['planned', 'in_house'] as const

type AuditFn = (entry: AuditEntry) => void

/** A slot's identity within its room: date, slot and (for an hourly day slot) its hours. */
const slotKey = (s: {
  date: string
  slot: string
  startTime?: string | null
  endTime?: string | null
}): string => `${s.date}|${s.slot}|${s.startTime ?? ''}|${s.endTime ?? ''}`

export function createReservationsService(deps: ServiceDeps & { hooks?: ReservationHooks }) {
  const { db } = deps
  const today = (now: Date): LocalDate => localDateOf(now)

  function nextCode(tx: Tx, now: Date): string {
    const year = Number(today(now).slice(0, 4))
    const row = tx
      .select()
      .from(reservationCodeSequences)
      .where(eq(reservationCodeSequences.year, year))
      .get()
    const next = (row?.lastNumber ?? 0) + 1
    if (row)
      tx.update(reservationCodeSequences)
        .set({ lastNumber: next })
        .where(eq(reservationCodeSequences.year, year))
        .run()
    else tx.insert(reservationCodeSequences).values({ year, lastNumber: next }).run()
    return `R-${year}-${String(next).padStart(6, '0')}`
  }

  function resolveGuest(
    tx: Tx,
    ctx: Ctx,
    guest: z.output<typeof reservationCreateSchema>['guest'],
    now: Date,
    audit: AuditFn
  ): string {
    if ('id' in guest) {
      const found = tx
        .select({ id: guests.id, mergedIntoId: guests.mergedIntoId })
        .from(guests)
        .where(eq(guests.id, guest.id))
        .get()
      if (!found) throw notFound('guest', guest.id)
      // A merged card is gone: the reservation goes to the card it was merged into.
      let target = found
      for (let i = 0; i < 10 && target.mergedIntoId; i += 1) {
        const next = tx
          .select({ id: guests.id, mergedIntoId: guests.mergedIntoId })
          .from(guests)
          .where(eq(guests.id, target.mergedIntoId))
          .get()
        if (!next) break
        target = next
      }
      return target.id
    }
    const id = newId(now)
    const row = {
      id,
      firstName: guest.firstName,
      lastName: guest.lastName,
      nameNormalized: normalizeName(`${guest.firstName} ${guest.lastName}`),
      phone: guest.phone ?? null,
      phoneNormalized: guest.phone ? normalizePhone(guest.phone) : null,
      email: guest.email ?? null,
      createdBy: ctx.userId,
      ...stamps(now)
    }
    tx.insert(guests).values(row).run()
    // A guest opened inside the reservation form is a guest card like any other (G-24).
    audit({ entity: 'guest', entityId: id, action: 'create', after: row })
    return id
  }

  function roomOf(tx: Tx, roomId: string) {
    const room = tx.select().from(rooms).where(eq(rooms.id, roomId)).get()
    if (!room) throw notFound('room', roomId)
    return room
  }

  /**
   * The room as it is on the days of `slots` by its capacity history (K-27): in use on each of them (else CONFLICT
   * `errors.roomClosedOn`: not opened yet or taken out of use), and for sale only when it is for sale on all.
   */
  function roomOn(tx: Tx, room: typeof rooms.$inferSelect, slots: readonly StaySlot[]) {
    const reader = capacityReader(tx, [room.id])
    const days = [...new Set(slots.map((s) => s.date))].sort()
    const closed = days.filter((d) => !reader.activeOn(room, d))
    if (closed.length)
      throw conflict('errors.roomClosedOn', {
        roomId: room.id,
        room: room.number,
        date: closed[0],
        dates: closed
      })
    return { ...room, sellable: reader.sellableOn(room, days) }
  }

  /**
   * A room the hotel does not sell (`rooms.sellable` off: a staff room…) takes a stay only like a blocked range:
   * with a reason, by whoever may close rooms (§6.1 "yine de"); the reason goes into the room's audit row.
   */
  function assertSellable(
    ctx: Ctx,
    room: { id: string; number: string; sellable: boolean },
    overrideReason: string | undefined,
    audit: AuditFn
  ): void {
    if (room.sellable) return
    if (!overrideReason || !ctx.can('rooms.block', 'edit'))
      throw conflict('errors.roomNotForSale', { roomId: room.id, room: room.number })
    audit({
      entity: 'room',
      entityId: room.id,
      action: 'update',
      after: { notForSaleOverride: true },
      reason: overrideReason
    })
  }

  /**
   * Conflicts of `slots` in `roomId`; blocks need an override. `span` = the whole stay when `slots` are only the
   * nights a change adds (its own kept nights are then left out of `occupied` by `ownStayId`).
   */
  function checkSlots(
    tx: Tx,
    ctx: Ctx,
    roomId: string,
    slots: readonly StaySlot[],
    overrideReason: string | undefined,
    audit: AuditFn,
    span?: { slots: readonly StaySlot[]; ownStayId: string }
  ): void {
    if (!slots.length) return
    const dates = slots.map((s) => s.date).sort()
    // One day before: a stay going on into the first day (a day-use cannot sit inside it, G-37).
    const from = occupancyFrom(dates[0] as LocalDate)
    const to = addDays(dates[dates.length - 1] as LocalDate, 2)
    const occupied = tx
      .select({
        date: roomNights.date,
        slot: roomNights.slot,
        startTime: roomNights.startTime,
        endTime: roomNights.endTime,
        reservationId: reservationRooms.reservationId,
        stayId: roomNights.reservationRoomId
      })
      .from(roomNights)
      .innerJoin(reservationRooms, eq(roomNights.reservationRoomId, reservationRooms.id))
      .where(and(eq(roomNights.roomId, roomId), gte(roomNights.date, from), lt(roomNights.date, to)))
      .all()
      .filter((o) => o.stayId !== span?.ownStayId)
      .map((o) => ({ ...o, roomId, date: o.date as LocalDate }))
    const blocks = tx
      .select()
      .from(roomBlocks)
      .where(and(eq(roomBlocks.roomId, roomId), isNull(roomBlocks.cancelledAt), lt(roomBlocks.dateFrom, to)))
      .all()
      .map((b) => ({ ...b, dateFrom: b.dateFrom as LocalDate, dateTo: b.dateTo as LocalDate }))
    // Every slot checked here is new for this room, so a night of the same reservation is a clash too (two
    // stays of one booking in one room on one date would break UNIQUE(room_id, date, slot)).
    const conflicts = findConflicts(roomId, slots, occupied, blocks, undefined, span?.slots ?? slots)
    const taken = conflicts.filter((c) => c.reason === 'occupied')
    // The panel says which room, which nights and whose booking is in the way (faz-05: reason in Turkish).
    const number = () => tx.select({ n: rooms.number }).from(rooms).where(eq(rooms.id, roomId)).get()?.n ?? ''
    if (taken.length) {
      const ids = [...new Set(taken.map((c) => c.reservationId ?? ''))].filter(Boolean)
      const codes = ids.length
        ? tx
            .select({ code: reservations.code })
            .from(reservations)
            .where(inArray(reservations.id, ids))
            .all()
            .map((r) => r.code)
        : []
      // An hourly clash names the hours in the way ("10:00–12:00"), not only the day (K-48, S-103).
      const hours = [
        ...new Set(
          taken
            .filter((c) => c.slot === 'day' && c.startTime && c.endTime)
            .map((c) => `${c.startTime}–${c.endTime}`)
        )
      ].sort()
      throw conflict('errors.roomOccupied', {
        roomId,
        room: number(),
        dates: [...new Set(taken.map((c) => c.date))].sort(),
        codes,
        ...(hours.length ? { hours } : {})
      })
    }
    const blocked = conflicts.filter((c) => c.reason === 'blocked')
    if (blocked.length) {
      if (!overrideReason || !ctx.can('rooms.block', 'edit'))
        throw conflict('errors.roomBlocked', {
          roomId,
          room: number(),
          dates: [...new Set(blocked.map((c) => c.date))].sort()
        })
      audit({
        entity: 'room',
        entityId: roomId,
        action: 'update',
        after: { blockOverride: blocked.map((c) => c.date) },
        reason: overrideReason
      })
    }
  }

  /** Only the hotel's own tags go on a reservation; the automatic statuses are derived, never stored. */
  function assertCustomTags(tx: Pick<Tx, 'select'>, tagIds: readonly string[]): void {
    if (!tagIds.length) return
    const rows = tx
      .select()
      .from(statusTags)
      .where(inArray(statusTags.id, [...tagIds]))
      .all()
    if (rows.length !== new Set(tagIds).size) throw notFound('status_tag')
    if (rows.some((t) => t.kind !== 'custom'))
      throw invalid('errors.validation', { fields: { tagIds: ['custom tags only'] } })
  }

  function insertNight(
    tx: Tx,
    ctx: Ctx,
    now: Date,
    stay: { id: string; roomId: string; roomNumber: string },
    folio: { id: string; currency: string },
    slot: StaySlot,
    priceMinor: number,
    /** The base-currency value to keep (a night moved to another date keeps the rate it was sold at). */
    baseMinor?: number
  ): void {
    const nightId = newId(now)
    tx.insert(roomNights)
      .values({
        id: nightId,
        reservationRoomId: stay.id,
        roomId: stay.roomId,
        date: slot.date,
        slot: slot.slot,
        startTime: slot.startTime ?? null,
        endTime: slot.endTime ?? null,
        priceMinor,
        currency: folio.currency,
        ...stamps(now)
      })
      .run()
    tx.insert(charges)
      .values({
        id: newId(now),
        folioId: folio.id,
        date: slot.date,
        kind: 'room_night',
        roomNightId: nightId,
        description: `${stay.roomNumber} · ${slot.date}`,
        qty: 1,
        unitMinor: priceMinor,
        amountMinor: priceMinor,
        currency: folio.currency,
        amountBaseMinor: baseMinor ?? chargeBaseMinor(tx, priceMinor, folio.currency, now),
        createdBy: ctx.userId,
        ...stamps(now)
      })
      .run()
  }

  /** Removes nights (derived schedule) after voiding their charges; the audit log keeps them. */
  function removeNights(tx: Tx, now: Date, nightIds: readonly string[], reason: string): void {
    if (!nightIds.length) return
    tx.update(charges)
      .set({
        voidedAt: now.toISOString(),
        voidReason: reason,
        roomNightId: null,
        updatedAt: now.toISOString()
      })
      .where(and(inArray(charges.roomNightId, [...nightIds]), isNull(charges.voidedAt)))
      .run()
    tx.delete(roomNights)
      .where(inArray(roomNights.id, [...nightIds]))
      .run()
  }

  function folioOfReservation(tx: Tx, reservationId: string) {
    const folio = tx.select().from(folios).where(eq(folios.reservationId, reservationId)).get()
    if (!folio) throw notFound('folio', reservationId)
    return folio
  }

  function addStay(
    tx: Tx,
    ctx: Ctx,
    now: Date,
    reservationId: string,
    folio: { id: string; currency: string },
    stay: StayInput,
    sort: number,
    overrideReason: string | undefined,
    audit: AuditFn
  ): string {
    const checkIn = localDate(stay.checkIn)
    const checkOut = localDate(stay.checkOut)
    // S-103: a same-day sale names its hours; a whole-day slot would lock the room's every other hourly sale
    // that day (rows written before 0019 stay as they are).
    if (checkIn === checkOut && (stay.startTime === undefined || stay.endTime === undefined))
      throw invalid('errors.hoursRequired')
    const slots = staySlots(
      checkIn,
      checkOut,
      stay.startTime !== undefined && stay.endTime !== undefined
        ? { start: stay.startTime, end: stay.endTime }
        : undefined
    )
    const room = roomOn(tx, roomOf(tx, stay.roomId), slots)
    assertSellable(ctx, room, overrideReason, audit)
    checkSlots(tx, ctx, room.id, slots, overrideReason, audit)
    const priceOf = new Map((stay.prices ?? []).map((p) => [p.date, p.priceMinor]))
    const id = newId(now)
    tx.insert(reservationRooms)
      .values({
        id,
        reservationId,
        roomId: room.id,
        checkIn,
        checkOut,
        status: 'planned',
        sort,
        ...stamps(now)
      })
      .run()
    for (const s of slots) {
      const price = priceOf.get(s.date) ?? stay.nightlyPriceMinor
      if (price === undefined) throw invalid('errors.priceMissing', { date: s.date })
      insertNight(tx, ctx, now, { id, roomId: room.id, roomNumber: room.number }, folio, s, price)
    }
    return id
  }

  function refreshKind(tx: Tx, reservationId: string, now: Date): void {
    const stays = tx
      .select()
      .from(reservationRooms)
      .where(and(eq(reservationRooms.reservationId, reservationId), ne(reservationRooms.status, 'cancelled')))
      .all()
    if (!stays.length) return
    const kind = stays.every((s) => s.checkIn === s.checkOut) ? 'day_use' : 'overnight'
    tx.update(reservations)
      .set({ kind, updatedAt: now.toISOString() })
      .where(eq(reservations.id, reservationId))
      .run()
  }

  function stayOf(tx: Tx, stayId: string): StayRow {
    const stay = tx.select().from(reservationRooms).where(eq(reservationRooms.id, stayId)).get()
    if (!stay) throw notFound('reservation_room', stayId)
    return stay
  }

  function reservationOf(tx: Tx, id: string): ReservationRow {
    const r = tx.select().from(reservations).where(eq(reservations.id, id)).get()
    if (!r) throw notFound('reservation', id)
    return r
  }

  /** The next stay of the same reservation in another room, starting the day this one ends (a room move). */
  function successorOf(tx: Pick<Tx, 'select'>, stay: StayRow): StayRow | undefined {
    return tx
      .select()
      .from(reservationRooms)
      .where(
        and(
          eq(reservationRooms.reservationId, stay.reservationId),
          eq(reservationRooms.status, 'planned'),
          eq(reservationRooms.checkIn, stay.checkOut),
          ne(reservationRooms.roomId, stay.roomId)
        )
      )
      .get()
  }

  /** The in-house stay of the same reservation in another room that ends the day this one starts. */
  function predecessorOf(tx: Pick<Tx, 'select'>, stay: StayRow): StayRow | undefined {
    return tx
      .select()
      .from(reservationRooms)
      .where(
        and(
          eq(reservationRooms.reservationId, stay.reservationId),
          eq(reservationRooms.status, 'in_house'),
          eq(reservationRooms.checkOut, stay.checkIn),
          ne(reservationRooms.roomId, stay.roomId)
        )
      )
      .get()
  }

  /**
   * A room move on its day: the people (with their KBS marks) go to the next stay, which is now in the house;
   * the old stay ends without anyone leaving the hotel (no KBS check-out), its room becomes dirty.
   */
  function moveGuests(tx: Tx, audit: AuditFn, ctx: Ctx, now: Date, from: StayRow, to: StayRow): void {
    const iso = now.toISOString()
    const moved = tx
      .select({ id: stayOccupants.id })
      .from(stayOccupants)
      .where(and(eq(stayOccupants.reservationRoomId, from.id), isNull(stayOccupants.leftAt)))
      .all()
      .map((o) => o.id)
    if (moved.length)
      tx.update(stayOccupants)
        .set({ reservationRoomId: to.id, updatedAt: iso })
        .where(inArray(stayOccupants.id, moved))
        .run()
    tx.update(reservationRooms)
      .set({ status: 'done', checkedOutAt: iso, updatedAt: iso })
      .where(eq(reservationRooms.id, from.id))
      .run()
    tx.update(reservationRooms)
      .set({ status: 'in_house', checkedInAt: to.checkedInAt ?? iso, updatedAt: iso })
      .where(eq(reservationRooms.id, to.id))
      .run()
    markRoomDirtyAfterCheckout(tx, audit, ctx, from.roomId, now)
    audit({
      entity: 'reservation_room',
      entityId: from.id,
      action: 'update',
      after: { movedTo: to.id, fromRoomId: from.roomId, toRoomId: to.roomId, occupants: moved, at: iso }
    })
    audit({
      entity: 'reservation_room',
      entityId: to.id,
      action: 'check_in',
      after: { at: iso, movedFrom: from.id, occupants: moved }
    })
  }

  /** Arrival or leaving time of the people of a stay who have none yet, one audit row each (G-24). */
  function stampOccupants(
    tx: Tx,
    audit: AuditFn,
    stayId: string,
    field: 'arrivedAt' | 'leftAt',
    iso: string
  ): void {
    const column = field === 'arrivedAt' ? stayOccupants.arrivedAt : stayOccupants.leftAt
    const people = tx
      .select({ id: stayOccupants.id })
      .from(stayOccupants)
      .where(and(eq(stayOccupants.reservationRoomId, stayId), isNull(column)))
      .all()
    for (const o of people) {
      tx.update(stayOccupants)
        .set({ [field]: iso, updatedAt: iso })
        .where(eq(stayOccupants.id, o.id))
        .run()
      audit({
        entity: 'stay_occupant',
        entityId: o.id,
        action: 'update',
        before: { [field]: null },
        after: { [field]: iso }
      })
    }
  }

  /** A night's new price: the old charge is voided and a new one written (history kept, G-36). */
  function repriceNight(
    tx: Tx,
    ctx: Ctx,
    now: Date,
    reservationId: string,
    night: typeof roomNights.$inferSelect,
    priceMinor: number
  ): void {
    const folio = folioOfReservation(tx, reservationId)
    const old = tx
      .select()
      .from(charges)
      .where(and(eq(charges.roomNightId, night.id), isNull(charges.voidedAt)))
      .get()
    if (old)
      tx.update(charges)
        .set({
          voidedAt: now.toISOString(),
          voidReason: 'price_change',
          roomNightId: null,
          updatedAt: now.toISOString()
        })
        .where(eq(charges.id, old.id))
        .run()
    tx.insert(charges)
      .values({
        id: newId(now),
        folioId: folio.id,
        date: night.date,
        kind: 'room_night',
        roomNightId: night.id,
        description: old?.description ?? night.date,
        qty: 1,
        unitMinor: priceMinor,
        amountMinor: priceMinor,
        currency: folio.currency,
        amountBaseMinor: chargeBaseMinor(tx, priceMinor, folio.currency, now),
        reversalOfId: old?.id ?? null,
        createdBy: ctx.userId,
        ...stamps(now)
      })
      .run()
    tx.update(roomNights)
      .set({ priceMinor, updatedAt: now.toISOString() })
      .where(eq(roomNights.id, night.id))
      .run()
  }

  function detail(tx: Pick<Tx, 'select'>, id: string): ReservationDetail {
    const reservation = tx.select().from(reservations).where(eq(reservations.id, id)).get()
    if (!reservation) throw notFound('reservation', id)
    const guest = tx.select().from(guests).where(eq(guests.id, reservation.primaryGuestId)).get()
    if (!guest) throw notFound('guest', reservation.primaryGuestId)
    const folio = tx.select().from(folios).where(eq(folios.reservationId, id)).get()
    if (!folio) throw notFound('folio', id)
    const stayRows = tx
      .select({ stay: reservationRooms, roomNumber: rooms.number })
      .from(reservationRooms)
      .innerJoin(rooms, eq(reservationRooms.roomId, rooms.id))
      .where(eq(reservationRooms.reservationId, id))
      .orderBy(asc(reservationRooms.sort), asc(reservationRooms.checkIn))
      .all()
    const nightRows = stayRows.length
      ? tx
          .select()
          .from(roomNights)
          .where(
            inArray(
              roomNights.reservationRoomId,
              stayRows.map((s) => s.stay.id)
            )
          )
          .all()
      : []
    const payRows = tx.select().from(payments).where(eq(payments.folioId, folio.id)).all()
    const chargeRows = tx.select().from(charges).where(eq(charges.folioId, folio.id)).all()
    const sortOf = new Map(stayRows.map((s) => [s.stay.id, s.stay.sort]))
    const allocation = allocatePayments(
      nightRows.map((n) => ({
        id: n.id,
        date: n.date as LocalDate,
        roomSort: sortOf.get(n.reservationRoomId) ?? 0,
        priceMinor: n.priceMinor
      })),
      payRows.map((p) => ({ kind: p.kind, amountFolioMinor: p.amountFolioMinor, voided: !!p.voidedAt }))
    )
    const byNight = new Map(allocation.map((a) => [a.night.id, a]))
    const totals = folioTotals(
      chargeRows.map((c) => ({ amountMinor: c.amountMinor, voided: !!c.voidedAt })),
      payRows.map((p) => ({ kind: p.kind, amountFolioMinor: p.amountFolioMinor, voided: !!p.voidedAt }))
    )
    return {
      reservation,
      guest: { id: guest.id, firstName: guest.firstName, lastName: guest.lastName, vip: guest.vip },
      standingNote: standingNoteAlert(guest),
      stays: stayRows.map(({ stay, roomNumber }) => ({
        ...stay,
        roomNumber,
        nights: nightRows
          .filter((n) => n.reservationRoomId === stay.id)
          .sort((a, b) => (a.date < b.date ? -1 : 1))
          .map((n) => {
            const a = byNight.get(n.id)
            return {
              id: n.id,
              date: n.date as LocalDate,
              slot: n.slot,
              startTime: n.startTime,
              endTime: n.endTime,
              priceMinor: n.priceMinor,
              currency: n.currency,
              payStatus: a?.status ?? 'unpaid',
              allocatedMinor: a?.allocatedMinor ?? 0
            }
          })
      })),
      folio: { id: folio.id, currency: folio.currency, ...totals },
      tagIds: tx
        .select({ tagId: reservationTags.tagId })
        .from(reservationTags)
        .where(eq(reservationTags.reservationId, id))
        .all()
        .map((t) => t.tagId),
      notes: tx.select().from(reservationNotes).where(eq(reservationNotes.reservationId, id)).all()
    }
  }

  function releaseStay(tx: Tx, now: Date, stay: StayRow, reason: string): void {
    const nightIds = tx
      .select({ id: roomNights.id })
      .from(roomNights)
      .where(eq(roomNights.reservationRoomId, stay.id))
      .all()
      .map((n) => n.id)
    removeNights(tx, now, nightIds, reason)
    tx.update(reservationRooms)
      .set({ status: 'cancelled', releasedAt: now.toISOString(), updatedAt: now.toISOString() })
      .where(eq(reservationRooms.id, stay.id))
      .run()
  }

  /** After a stay ends or is released: no open stay left → checked out if someone stayed, else `ifNone`. */
  function settleStatus(
    tx: Tx,
    reservationId: string,
    now: Date,
    ifNone: 'cancelled' | null,
    extra: Partial<typeof reservations.$inferInsert> = {}
  ): void {
    const stays = tx
      .select({ status: reservationRooms.status })
      .from(reservationRooms)
      .where(eq(reservationRooms.reservationId, reservationId))
      .all()
    if (stays.some((x) => x.status === 'planned' || x.status === 'in_house')) return
    const status = stays.some((x) => x.status === 'done') ? 'checked_out' : ifNone
    if (!status) return
    tx.update(reservations)
      .set({ status, ...(status === 'cancelled' ? extra : {}), updatedAt: now.toISOString() })
      .where(eq(reservations.id, reservationId))
      .run()
  }

  type SettleFn = (
    tx: Tx,
    audit: AuditFn,
    now: Date,
    before: ReservationDetail
  ) => Record<string, unknown> | void

  function endReservation(
    ctx: Ctx,
    id: string,
    status: 'cancelled' | 'no_show' | 'parked',
    extra: Partial<typeof reservations.$inferInsert>,
    reason: string,
    /** Runs in the same transaction after the status change (cancel: the refund; a failure undoes everything). */
    settle?: SettleFn
  ): ReservationDetail {
    requirePermission(ctx, 'calendar', 'edit')
    return inTransaction(deps, ctx, (tx, audit, now) =>
      endReservationIn(tx, audit, now, id, status, extra, reason, settle)
    )
  }

  /** The body of `endReservation` inside a transaction the caller owns (`undoCheckIn` ends the reservation in the same one). */
  function endReservationIn(
    tx: Tx,
    audit: AuditFn,
    now: Date,
    id: string,
    status: 'cancelled' | 'no_show' | 'parked',
    extra: Partial<typeof reservations.$inferInsert>,
    reason: string,
    settle?: SettleFn
  ): ReservationDetail {
    const before = detail(tx, id)
    const was = before.reservation.status
    if (
      was === 'checked_out' ||
      was === 'cancelled' ||
      was === 'no_show' ||
      (was === 'parked' && status === 'parked')
    )
      throw invalid('errors.reservationClosed', { status: was })
    if (before.stays.some((s) => s.status === 'in_house')) throw invalid('errors.guestInHouse')
    const stayed = before.stays.some((s) => s.status === 'done')
    // A room already stayed in cannot be parked or be a no-show; its nights and charges stay (cancel: the rest).
    if (stayed && status !== 'cancelled') throw invalid('errors.reservationStarted')
    // QA3c1 #3: nobody can fail to arrive before the arrival day (cancelling is the way out of a future booking).
    if (status === 'no_show') {
      const planned = before.stays.filter((s) => s.status === 'planned').map((s) => localDate(s.checkIn))
      const first = planned.sort((a, b) => diffDays(a, b))[0]
      if (first && diffDays(today(now), first) > 0) throw invalid('errors.noShowTooEarly', { checkIn: first })
    }
    for (const s of before.stays) if (s.status === 'planned') releaseStay(tx, now, s, status)
    tx.update(reservations)
      .set({
        status: stayed ? 'checked_out' : status,
        ...extra,
        ...(status === 'parked' ? { parkedFromStatus: was } : {}),
        updatedAt: now.toISOString()
      })
      .where(eq(reservations.id, id))
      .run()
    const money = settle?.(tx, audit, now, before)
    const after = detail(tx, id)
    audit({
      entity: 'reservation',
      entityId: id,
      action: status === 'parked' ? 'park' : status === 'no_show' ? 'no_show' : 'cancel',
      before,
      after: money ? { ...after.reservation, ...money } : after.reservation,
      reason
    })
    return after
  }

  /** G-23: a refund needs `payments.refund`; asked before anything is read or written. */
  function requireRefundRight(ctx: Ctx, money: z.output<typeof cancelRefundSchema> | undefined): void {
    if (money?.mode === 'refund') requirePermission(ctx, 'payments.refund', 'edit')
  }

  /** The money step of a cancellation (K-55): a refund row on the folio or "the payments stay" with a note. */
  function settleOf(
    ctx: Ctx,
    id: string,
    money: z.output<typeof cancelRefundSchema> | undefined
  ): SettleFn | undefined {
    if (!money) return undefined
    return (tx, audit, now, before) => {
      if (money.mode === 'keep') return { paymentsKept: money.note }
      if (!deps.hooks?.recordRefund) throw invalid('errors.internal')
      deps.hooks.recordRefund(ctx, tx, audit, now, {
        reservationId: id,
        date: today(now),
        kind: 'refund',
        methodId: money.methodId,
        amountMinor: money.amountMinor,
        currency: money.currency ?? before.folio.currency,
        note: money.note ?? null,
        ...(money.dayClosedReason ? { dayClosedReason: money.dayClosedReason } : {})
      })
      return { refundedMinor: money.amountMinor }
    }
  }

  /** One room still to come is given up (the body of `cancelStay`, inside a transaction the caller owns). */
  function cancelStayIn(tx: Tx, audit: AuditFn, now: Date, stayId: string, why: string): ReservationDetail {
    const stay = stayOf(tx, stayId)
    if (stay.status !== 'planned') throw invalid('errors.invalidStayState', { status: stay.status })
    const r = reservationOf(tx, stay.reservationId)
    if (!['tentative', 'confirmed', 'checked_in'].includes(r.status))
      throw invalid('errors.reservationClosed', { status: r.status })
    releaseStay(tx, now, stay, 'stay_cancelled')
    settleStatus(tx, stay.reservationId, now, 'cancelled', {
      cancelledAt: now.toISOString(),
      cancelReason: why
    })
    refreshKind(tx, stay.reservationId, now)
    const after = detail(tx, stay.reservationId)
    audit({
      entity: 'reservation_room',
      entityId: stayId,
      action: 'cancel',
      before: stay,
      after: { ...after.stays.find((x) => x.id === stayId), reservationStatus: after.reservation.status },
      reason: why
    })
    return after
  }

  /**
   * The blacklist check of a new reservation (§6.9, G-45): a match is refused with the hits until the user confirms;
   * an "engelle" entry is overridden only by whoever may remove entries. Returns the matches (kept in the audit row).
   */
  function blacklistGate(
    tx: Tx,
    ctx: Ctx,
    guest: z.output<typeof reservationCreateSchema>['guest'],
    confirmed: boolean | undefined
  ) {
    const known = 'id' in guest ? tx.select().from(guests).where(eq(guests.id, guest.id)).get() : null
    const candidate =
      'id' in guest
        ? {
            name: known ? `${known.firstName} ${known.lastName}` : '',
            phone: known?.phone ?? null,
            idDocNumber: known?.idDocNumber ?? null,
            guestId: known?.id ?? null
          }
        : { name: `${guest.firstName} ${guest.lastName}`, phone: guest.phone ?? null }
    const hits = blacklistMatches(tx, candidate, ctx.can('blacklist', 'view'))
    if (hits.length && !confirmed) throw conflict('errors.blacklistMatch', { hits })
    // Faz 6: an entry of "engelle" severity is overridden only by whoever may remove entries (Sahip, Müdür).
    if (hits.some((h) => h.severity === 'block') && !ctx.can('blacklist.remove', 'edit'))
      throw conflict('errors.blacklistBlocked', { hits })
    return hits
  }

  /**
   * The body of `create` inside a transaction the caller owns (a group books each of its rooms with it, P17b).
   * `groupId` links the reservation to its group.
   */
  function createIn(
    tx: Tx,
    audit: AuditFn,
    now: Date,
    ctx: Ctx,
    data: z.output<typeof reservationCreateSchema>,
    opts: { blacklistConfirmed?: boolean },
    groupId: string | null
  ): ReservationDetail {
    const channel = tx.select().from(salesChannels).where(eq(salesChannels.id, data.channelId)).get()
    if (!channel) throw notFound('sales_channel', data.channelId)
    const hits = blacklistGate(tx, ctx, data.guest, opts.blacklistConfirmed)
    assertCustomTags(tx, data.tagIds ?? [])
    const guestId = resolveGuest(tx, ctx, data.guest, now, audit)
    const id = newId(now)
    const allDayUse = data.stays.every((s) => s.checkIn === s.checkOut)
    tx.insert(reservations)
      .values({
        id,
        code: nextCode(tx, now),
        primaryGuestId: guestId,
        channelId: channel.id,
        channelRef: data.channelRef ?? null,
        status: data.status,
        kind: allDayUse ? 'day_use' : 'overnight',
        adults: data.adults ?? null,
        children: data.children ?? null,
        notes: data.notes ?? null,
        createdBy: ctx.userId,
        soldByUserId: data.soldByUserId ?? ctx.userId,
        groupId,
        ...stamps(now)
      })
      .run()
    const folio = { id: newId(now), currency: data.currency ?? baseCurrencyOf(tx) }
    tx.insert(folios)
      .values({
        id: folio.id,
        kind: 'reservation',
        reservationId: id,
        currency: folio.currency,
        createdBy: ctx.userId,
        ...stamps(now)
      })
      .run()
    const stayIds = data.stays.map((s, i) =>
      addStay(tx, ctx, now, id, folio, s, i, data.overrideBlockReason, audit)
    )
    const guest = tx.select().from(guests).where(eq(guests.id, guestId)).get()
    if (guest && stayIds[0]) {
      const occupant = {
        id: newId(now),
        reservationRoomId: stayIds[0],
        guestId,
        fullName: `${guest.firstName} ${guest.lastName}`.trim(),
        isPrimary: true,
        createdBy: ctx.userId,
        ...stamps(now)
      }
      tx.insert(stayOccupants).values(occupant).run()
      audit({ entity: 'stay_occupant', entityId: occupant.id, action: 'create', after: occupant })
    }
    for (const tagId of data.tagIds ?? [])
      tx.insert(reservationTags).values({ reservationId: id, tagId }).run()
    const after = detail(tx, id)
    audit({
      entity: 'reservation',
      entityId: id,
      action: 'create',
      after,
      reason: hits.length ? `blacklist: ${hits.map((h) => h.entryId).join(', ')}` : undefined
    })
    return after
  }

  /** The body of `checkIn` inside a transaction the caller owns (a group checks its rooms in together, P17b). */
  function checkInIn(
    tx: Tx,
    audit: AuditFn,
    now: Date,
    ctx: Ctx,
    stayId: string
  ): { detail: ReservationDetail; movedFromRoomId: string | null } {
    const stay = stayOf(tx, stayId)
    if (stay.status !== 'planned') throw invalid('errors.invalidStayState', { status: stay.status })
    if (diffDays(today(now), localDate(stay.checkIn)) > 0)
      throw invalid('errors.checkInTooEarly', { checkIn: stay.checkIn })
    const previous = predecessorOf(tx, stay)
    if (previous) {
      moveGuests(tx, audit, ctx, now, previous, stay)
      return { detail: detail(tx, stay.reservationId), movedFromRoomId: previous.roomId as string | null }
    }
    const iso = now.toISOString()
    tx.update(reservationRooms)
      .set({ status: 'in_house', checkedInAt: iso, updatedAt: iso })
      .where(eq(reservationRooms.id, stayId))
      .run()
    stampOccupants(tx, audit, stayId, 'arrivedAt', iso)
    tx.update(reservations)
      .set({ status: 'checked_in', updatedAt: iso })
      .where(eq(reservations.id, stay.reservationId))
      .run()
    audit({ entity: 'reservation_room', entityId: stayId, action: 'check_in', after: { at: iso } })
    return { detail: detail(tx, stay.reservationId), movedFromRoomId: null as string | null }
  }

  interface CheckOutOpts {
    dayUsePriceMinor?: number | undefined
    dayUseFreeConfirmed?: boolean | undefined
  }

  /** The body of `checkOut` inside a transaction the caller owns (a group checks its rooms out together, P17b). */
  function checkOutIn(
    tx: Tx,
    audit: AuditFn,
    now: Date,
    ctx: Ctx,
    stayId: string,
    opts: CheckOutOpts,
    kbsIds: readonly string[]
  ): { detail: ReservationDetail; roomId: string; day: LocalDate } {
    const stay = stayOf(tx, stayId)
    if (stay.status !== 'in_house') throw invalid('errors.invalidStayState', { status: stay.status })
    const iso = now.toISOString()
    const day = today(now)
    // The room-move day: the guests go to their next room, they do not leave the hotel.
    const next = diffDays(localDate(stay.checkOut), day) >= 0 ? successorOf(tx, stay) : undefined
    if (next) {
      moveGuests(tx, audit, ctx, now, stay, next)
      return { detail: detail(tx, stay.reservationId), roomId: stay.roomId, day }
    }
    let early: {
      checkOut: string
      nights: { date: string; slot: string; priceMinor: number }[]
      dayUse?: { date: string; priceMinor: number }
    } | null = null
    const plan = checkoutPlan({ checkIn: localDate(stay.checkIn), checkOut: localDate(stay.checkOut) }, day)
    if (plan.kind !== 'onTime') {
      const nights = tx.select().from(roomNights).where(eq(roomNights.reservationRoomId, stayId)).all()
      const freed = new Set<string>(plan.released)
      const unused = nights.filter((n) => freed.has(n.date))
      removeNights(
        tx,
        now,
        unused.map((n) => n.id),
        'early_departure'
      )
      const first = nights.find((n) => n.date === stay.checkIn && n.slot === 'night')
      // K-44: left on the check-in day — the first night becomes that day's day-use and its price may be changed
      // here. The day slot carries the hours the guest really used (check-in minute to now), or the free part of
      // them, so a second round in the same room and day fits beside it. The night is released either way (hata
      // C): when even no day slot fits (a whole-day record of another stay holds the day) it goes with no slot.
      const range: HourRange | null = plan.kind === 'sameDay' && first ? sameDayRange(tx, stay, now) : null
      let dayUse: { date: string; priceMinor: number } | undefined
      if (first && range) {
        // H-06: a free same-day stay is a decision, not a slip of the keyboard.
        if (opts.dayUsePriceMinor === 0 && !opts.dayUseFreeConfirmed)
          throw invalid('errors.dayUseFreeNeedsConfirm')
        tx.update(roomNights)
          .set({ slot: 'day', startTime: range.start, endTime: range.end, updatedAt: iso })
          .where(eq(roomNights.id, first.id))
          .run()
        if (opts.dayUsePriceMinor !== undefined && opts.dayUsePriceMinor !== first.priceMinor)
          repriceNight(tx, ctx, now, stay.reservationId, first, opts.dayUsePriceMinor)
        dayUse = { date: first.date, priceMinor: opts.dayUsePriceMinor ?? first.priceMinor }
      } else if (first && plan.kind === 'sameDay') {
        removeNights(tx, now, [first.id], 'early_departure')
        unused.push(first)
      }
      const end = plan.kind === 'sameDay' ? (first ? stay.checkIn : addDays(localDate(stay.checkIn), 1)) : day
      tx.update(reservationRooms)
        .set({ checkOut: end, updatedAt: iso })
        .where(eq(reservationRooms.id, stayId))
        .run()
      early = {
        checkOut: stay.checkOut,
        nights: unused.map((n) => ({ date: n.date, slot: n.slot, priceMinor: n.priceMinor })),
        ...(dayUse ? { dayUse } : {})
      }
    }
    for (const occupantId of kbsIds) {
      const o = tx.select().from(stayOccupants).where(eq(stayOccupants.id, occupantId)).get()
      if (!o || o.reservationRoomId !== stayId) throw notFound('stay_occupant', occupantId)
      if (o.kbsCheckoutAt) continue
      if (!o.kbsReportedAt) throw invalid('errors.kbsNotReported', { name: o.fullName })
      tx.update(stayOccupants)
        .set({ kbsCheckoutAt: iso, kbsCheckoutBy: ctx.userId, updatedAt: iso })
        .where(eq(stayOccupants.id, occupantId))
        .run()
      audit({
        entity: 'stay_occupant',
        entityId: occupantId,
        action: 'update',
        before: { kbsCheckoutAt: null },
        after: { kbsCheckoutAt: iso, kbsCheckoutBy: ctx.userId }
      })
    }
    tx.update(reservationRooms)
      .set({ status: 'done', checkedOutAt: iso, updatedAt: iso })
      .where(eq(reservationRooms.id, stayId))
      .run()
    stampOccupants(tx, audit, stayId, 'leftAt', iso)
    // K-52: the camera's face rows of the guests who left go in the same transaction (or get their keep-until date).
    releaseFaces(
      tx,
      audit,
      now,
      tx
        .select({ guestId: stayOccupants.guestId })
        .from(stayOccupants)
        .where(and(eq(stayOccupants.reservationRoomId, stayId), isNotNull(stayOccupants.guestId)))
        .all()
        .map((o) => o.guestId as string)
    )
    refreshKind(tx, stay.reservationId, now)
    markRoomDirtyAfterCheckout(tx, audit, ctx, stay.roomId, now)
    const open = tx
      .select({ id: reservationRooms.id })
      .from(reservationRooms)
      .where(
        and(
          eq(reservationRooms.reservationId, stay.reservationId),
          inArray(reservationRooms.status, [...ACTIVE_STAY])
        )
      )
      .all()
    if (!open.length)
      tx.update(reservations)
        .set({ status: 'checked_out', updatedAt: iso })
        .where(eq(reservations.id, stay.reservationId))
        .run()
    // An early departure keeps the released nights (dates and prices) in the log (G-24).
    audit({
      entity: 'reservation_room',
      entityId: stayId,
      action: 'check_out',
      before: early,
      after: {
        at: iso,
        ...(early ? { checkOut: stayOf(tx, stayId).checkOut } : {}),
        ...(early?.dayUse ? { dayUse: early.dayUse } : {})
      }
    })
    return { detail: detail(tx, stay.reservationId), roomId: stay.roomId, day }
  }

  // ---- Group reservations (P17b, G-194, S-101, S-106) ----

  /** The follow-up of a committed check-out (tasks): its failure never turns the committed write into an error. */
  function afterCheckout(ctx: Ctx, roomId: string, day: LocalDate): void {
    try {
      deps.hooks?.onCheckout?.(ctx, roomId, day)
    } catch {
      // Nothing to undo: the follow-up is opened again by the next check-out or by hand.
    }
  }

  function groupOf(tx: Pick<Tx, 'select'>, groupId: string) {
    const group = tx.select().from(reservationGroups).where(eq(reservationGroups.id, groupId)).get()
    if (!group) throw notFound('reservation_group', groupId)
    return group
  }

  /** The reservations of a group in booking order (the code grows with every booking). */
  function groupMembers(tx: Pick<Tx, 'select'>, groupId: string): ReservationRow[] {
    return tx
      .select()
      .from(reservations)
      .where(eq(reservations.groupId, groupId))
      .orderBy(asc(reservations.code))
      .all()
  }

  /** Every stay named must be a room of this group (a stay of another booking is never touched through it). */
  function assertGroupStays(tx: Pick<Tx, 'select'>, groupId: string, stayIds: readonly string[]): void {
    const found = tx
      .select({ id: reservationRooms.id, groupId: reservations.groupId })
      .from(reservationRooms)
      .innerJoin(reservations, eq(reservations.id, reservationRooms.reservationId))
      .where(inArray(reservationRooms.id, [...stayIds]))
      .all()
    if (found.length !== stayIds.length || found.some((f) => f.groupId !== groupId))
      throw invalid('errors.groupStayMismatch')
  }

  function groupView(tx: Pick<Tx, 'select'>, groupId: string, showPayments: boolean): GroupViewDto {
    const group = groupOf(tx, groupId)
    const details = groupMembers(tx, groupId).map((m) => detail(tx, m.id))
    const leader = group.leaderGuestId
      ? tx.select().from(guests).where(eq(guests.id, group.leaderGuestId)).get()
      : undefined
    const currencies = new Set(details.map((d) => d.folio.currency))
    const currency = details[0]?.folio.currency
    return {
      id: group.id,
      name: group.name,
      folioMode: group.folioMode,
      voided: group.voidedAt !== null,
      leader: leader ? { id: leader.id, name: `${leader.firstName} ${leader.lastName}`.trim() } : null,
      rooms: details.map((d) => ({
        reservationId: d.reservation.id,
        code: d.reservation.code,
        status: d.reservation.status,
        guestId: d.guest.id,
        guestName: `${d.guest.firstName} ${d.guest.lastName}`.trim(),
        stays: d.stays.map((s) => ({
          stayId: s.id,
          roomId: s.roomId,
          roomNumber: s.roomNumber,
          checkIn: s.checkIn as LocalDate,
          checkOut: s.checkOut as LocalDate,
          status: s.status
        })),
        currency: d.folio.currency,
        chargesMinor: d.folio.chargesMinor,
        balanceMinor: showPayments ? d.folio.balanceMinor : null
      })),
      totals:
        currency && currencies.size === 1
          ? {
              currency,
              chargesMinor: details.reduce((sum, d) => sum + d.folio.chargesMinor, 0),
              balanceMinor: showPayments
                ? details
                    .filter((d) => isGroupPayableStatus(d.reservation.status))
                    .reduce((sum, d) => sum + d.folio.balanceMinor, 0)
                : null,
              payableMinor: showPayments
                ? groupPayableMinor(
                    details.map((d) => ({ status: d.reservation.status, balanceMinor: d.folio.balanceMinor }))
                  )
                : null
            }
          : null,
      notes: details
        .flatMap((d) => d.notes)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .slice(0, 50)
        .map((n) => ({ id: n.id, reservationId: n.reservationId, text: n.text, createdAt: n.createdAt }))
    }
  }

  return {
    get(ctx: Ctx, id: string): ReservationDetail {
      requirePermission(ctx, 'calendar', 'view')
      return detail(db, id)
    },

    /**
     * New reservation (G-34…G-36). A guest on the blacklist (§6.9, G-45) is refused with the matches until the user
     * confirms (`blacklistConfirmed`); the confirmation is kept in the audit row.
     */
    create(
      ctx: Ctx,
      input: ReservationCreateInput,
      opts: { blacklistConfirmed?: boolean } = {}
    ): ReservationDetail {
      requirePermission(ctx, 'calendar', 'edit')
      const data = parseInput(reservationCreateSchema, input)
      return inTransaction(deps, ctx, (tx, audit, now) => createIn(tx, audit, now, ctx, data, opts, null))
    },

    /** Extend / shorten a stay (G-44); new nights get the given price or the stay's last price. */
    changeDates(ctx: Ctx, stayId: string, input: ChangeDatesInput): ReservationDetail {
      requirePermission(ctx, 'calendar', 'edit')
      const data = parseInput(changeDatesSchema, input)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const stay = stayOf(tx, stayId)
        if (!(ACTIVE_STAY as readonly string[]).includes(stay.status))
          throw invalid('errors.reservationClosed')
        if (stay.checkedInAt && data.checkIn !== stay.checkIn) throw invalid('errors.stayStarted')
        // A stay in the house ends today at the earliest (an early departure is a check-out), and an overnight
        // stay stays overnight: leaving on the check-in day is the check-out's job (K-44).
        if (stay.checkedInAt) {
          const own = localDate(stay.checkIn)
          const floor = stay.checkIn === stay.checkOut ? own : addDays(own, 1)
          const min = diffDays(floor, today(now)) > 0 ? today(now) : floor
          if (diffDays(min, localDate(data.checkOut)) < 0) throw invalid('errors.checkoutTooEarly', { min })
        }
        const before = detail(tx, stay.reservationId)
        const folio = folioOfReservation(tx, stay.reservationId)
        const room = roomOf(tx, stay.roomId)
        const existing = tx.select().from(roomNights).where(eq(roomNights.reservationRoomId, stayId)).all()
        // An hourly stay that stays a day-use keeps its hours on the new date (K-48).
        const hourly = existing.find((n) => n.slot === 'day' && n.startTime && n.endTime)
        // A stay cut down to a same-day one keeps hours only if it already had them; a whole-day slot is not new.
        if (data.checkIn === data.checkOut && !hourly && !existing.some((n) => n.slot === 'day'))
          throw invalid('errors.hoursRequired')
        const wanted = staySlots(
          localDate(data.checkIn),
          localDate(data.checkOut),
          hourly && data.checkIn === data.checkOut
            ? { start: hourly.startTime!, end: hourly.endTime! }
            : undefined
        )
        const key = slotKey
        const wantedKeys = new Set(wanted.map(key))
        const existingKeys = new Set(existing.map(key))
        const toAdd = wanted.filter((s) => !existingKeys.has(key(s)))
        roomOn(tx, room, toAdd)
        checkSlots(tx, ctx, room.id, toAdd, data.overrideBlockReason, audit, {
          slots: wanted,
          ownStayId: stay.id
        })
        removeNights(
          tx,
          now,
          existing.filter((n) => !wantedKeys.has(key(n))).map((n) => n.id),
          'stay_shortened'
        )
        const lastPrice = [...existing].sort((a, b) => (a.date < b.date ? 1 : -1))[0]?.priceMinor
        for (const s of toAdd) {
          const price = data.nightlyPriceMinor ?? lastPrice
          if (price === undefined) throw invalid('errors.priceMissing', { date: s.date })
          insertNight(
            tx,
            ctx,
            now,
            { id: stay.id, roomId: room.id, roomNumber: room.number },
            folio,
            s,
            price
          )
        }
        tx.update(reservationRooms)
          .set({ checkIn: data.checkIn, checkOut: data.checkOut, updatedAt: now.toISOString() })
          .where(eq(reservationRooms.id, stayId))
          .run()
        refreshKind(tx, stay.reservationId, now)
        const after = detail(tx, stay.reservationId)
        audit({
          entity: 'reservation_room',
          entityId: stayId,
          action: 'update',
          before: before.stays,
          after: after.stays
        })
        return after
      })
    },

    /**
     * Move a planned stay to other dates, same length (calendar drag-and-drop, faz-15 madde 12): every night goes
     * with its own price (and the base value it was sold at), so the total and what is paid stay the same. The old
     * nights' charges are voided and new ones written (history kept), in one transaction.
     */
    moveDates(ctx: Ctx, stayId: string, input: MoveDatesInput): ReservationDetail {
      requirePermission(ctx, 'calendar', 'edit')
      const data = parseInput(moveDatesSchema, input)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const stay = stayOf(tx, stayId)
        if (!(ACTIVE_STAY as readonly string[]).includes(stay.status))
          throw invalid('errors.reservationClosed')
        // A guest in the house keeps the day they came (an earlier departure is the check-out's job).
        if (stay.checkedInAt) throw invalid('errors.stayStarted')
        const shift = diffDays(localDate(stay.checkIn), localDate(data.checkIn))
        if (shift === 0) return detail(tx, stay.reservationId)
        const before = detail(tx, stay.reservationId)
        const folio = folioOfReservation(tx, stay.reservationId)
        const room = roomOf(tx, stay.roomId)
        const checkOut = addDays(localDate(stay.checkOut), shift)
        const key = slotKey
        const existing = tx.select().from(roomNights).where(eq(roomNights.reservationRoomId, stayId)).all()
        const moved = existing.map((n) => ({
          night: n,
          slot: {
            date: addDays(localDate(n.date), shift),
            slot: n.slot,
            startTime: n.startTime,
            endTime: n.endTime
          } as StaySlot
        }))
        const wanted = moved.map((m) => m.slot)
        const existingKeys = new Set(existing.map(key))
        roomOn(tx, room, wanted)
        checkSlots(
          tx,
          ctx,
          room.id,
          wanted.filter((s) => !existingKeys.has(key(s))),
          data.overrideBlockReason,
          audit,
          { slots: wanted, ownStayId: stay.id }
        )
        const ids = existing.map((n) => n.id)
        const baseOf = new Map(
          (ids.length
            ? tx
                .select({ nightId: charges.roomNightId, base: charges.amountBaseMinor })
                .from(charges)
                .where(and(inArray(charges.roomNightId, ids), isNull(charges.voidedAt)))
                .all()
            : []
          ).map((c) => [c.nightId, c.base])
        )
        removeNights(tx, now, ids, 'stay_moved')
        for (const m of moved)
          insertNight(
            tx,
            ctx,
            now,
            { id: stay.id, roomId: room.id, roomNumber: room.number },
            folio,
            m.slot,
            m.night.priceMinor,
            baseOf.get(m.night.id) ?? undefined
          )
        tx.update(reservationRooms)
          .set({ checkIn: data.checkIn, checkOut, updatedAt: now.toISOString() })
          .where(eq(reservationRooms.id, stayId))
          .run()
        const after = detail(tx, stay.reservationId)
        audit({
          entity: 'reservation_room',
          entityId: stayId,
          action: 'update',
          before: before.stays,
          after: after.stays,
          reason: 'move_dates'
        })
        return after
      })
    },

    /** Night-by-night prices (G-36): the old charge is voided and a new one written (history kept). */
    setNightPrices(
      ctx: Ctx,
      stayId: string,
      input: { date: string; priceMinor: number }[]
    ): ReservationDetail {
      requirePermission(ctx, 'calendar', 'edit')
      const prices = parseInput(nightPricesSchema, input)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const stay = stayOf(tx, stayId)
        const nights = tx.select().from(roomNights).where(eq(roomNights.reservationRoomId, stayId)).all()
        const changed: { date: string; from: number; to: number }[] = []
        for (const p of prices) {
          const night = nights.find((n) => n.date === p.date)
          if (!night) throw invalid('errors.nightNotInStay', { date: p.date })
          if (night.priceMinor === p.priceMinor) continue
          repriceNight(tx, ctx, now, stay.reservationId, night, p.priceMinor)
          changed.push({ date: night.date, from: night.priceMinor, to: p.priceMinor })
        }
        if (changed.length)
          audit({
            entity: 'reservation_room',
            entityId: stayId,
            action: 'update',
            after: { prices: changed }
          })
        return detail(tx, stay.reservationId)
      })
    },

    /** Room change (§6.1, G-44): whole stay, or from a date on (split); prices move with the nights. */
    changeRoom(ctx: Ctx, stayId: string, input: ChangeRoomInput): ReservationDetail {
      requirePermission(ctx, 'calendar', 'edit')
      const data = parseInput(changeRoomSchema, input)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const stay = stayOf(tx, stayId)
        if (!(ACTIVE_STAY as readonly string[]).includes(stay.status))
          throw invalid('errors.reservationClosed')
        const target = roomOf(tx, data.newRoomId)
        if (target.id === stay.roomId) return detail(tx, stay.reservationId)
        const before = detail(tx, stay.reservationId)
        const from = localDate(data.fromDate ?? stay.checkIn)
        const nights = tx.select().from(roomNights).where(eq(roomNights.reservationRoomId, stayId)).all()
        const { move } = splitForRoomChange(
          nights.map((n) => ({ ...n, date: n.date as LocalDate })),
          from
        )
        if (!move.length) throw invalid('errors.nightNotInStay', { date: from })
        const newRoom = roomOn(tx, target, move)
        assertSellable(ctx, newRoom, data.overrideBlockReason, audit)
        checkSlots(tx, ctx, newRoom.id, move, data.overrideBlockReason, audit)
        const isoNow = now.toISOString()
        // The guests leave the old room (S-14): the room status follows, with its own audit row.
        const markDirty = (roomId: string) => markRoomDirtyAfterCheckout(tx, audit, ctx, roomId, now)
        if (diffDays(localDate(stay.checkIn), from) <= 0) {
          tx.update(reservationRooms)
            .set({ roomId: newRoom.id, updatedAt: isoNow })
            .where(eq(reservationRooms.id, stayId))
            .run()
          tx.update(roomNights)
            .set({ roomId: newRoom.id, updatedAt: isoNow })
            .where(eq(roomNights.reservationRoomId, stayId))
            .run()
          if (stay.checkedInAt) markDirty(stay.roomId)
        } else {
          const movedNow = !!stay.checkedInAt && diffDays(from, today(now)) >= 0
          const newStayId = newId(now)
          tx.insert(reservationRooms)
            .values({
              id: newStayId,
              reservationId: stay.reservationId,
              roomId: newRoom.id,
              checkIn: from,
              checkOut: stay.checkOut,
              status: movedNow ? 'in_house' : 'planned',
              checkedInAt: movedNow ? isoNow : null,
              sort: stay.sort,
              ...stamps(now)
            })
            .run()
          tx.update(roomNights)
            .set({ roomId: newRoom.id, reservationRoomId: newStayId, updatedAt: isoNow })
            .where(
              inArray(
                roomNights.id,
                move.map((n) => n.id)
              )
            )
            .run()
          tx.update(reservationRooms)
            .set({
              checkOut: from,
              ...(movedNow ? { status: 'done' as const, checkedOutAt: isoNow } : {}),
              updatedAt: isoNow
            })
            .where(eq(reservationRooms.id, stayId))
            .run()
          if (movedNow) {
            // The same people move rooms: no KBS check-out, their marks travel with them.
            const people = tx
              .select({ id: stayOccupants.id })
              .from(stayOccupants)
              .where(and(eq(stayOccupants.reservationRoomId, stayId), isNull(stayOccupants.leftAt)))
              .all()
            for (const o of people) {
              tx.update(stayOccupants)
                .set({ reservationRoomId: newStayId, updatedAt: isoNow })
                .where(eq(stayOccupants.id, o.id))
                .run()
              audit({
                entity: 'stay_occupant',
                entityId: o.id,
                action: 'update',
                before: { reservationRoomId: stayId },
                after: { reservationRoomId: newStayId }
              })
            }
            markDirty(stay.roomId)
          }
        }
        const after = detail(tx, stay.reservationId)
        audit({
          entity: 'reservation_room',
          entityId: stayId,
          action: 'update',
          before: before.stays,
          after: after.stays
        })
        return after
      })
    },

    /**
     * Cancel (nothing is deleted). `refund` settles the money in the same transaction (K-55): "refund" writes a
     * refund row dated today on the folio (needs `payments.refund`; never more than the net collected amount),
     * "keep" records why the payments stay (a cancellation fee). A guest in the house is refused: take the
     * check-in back first (`undoCheckIn`) or check out.
     */
    cancel(ctx: Ctx, id: string, reason: string, refund?: CancelRefundInput): ReservationDetail {
      const money = refund ? parseInput(cancelRefundSchema, refund) : undefined
      requireRefundRight(ctx, money)
      return endReservation(
        ctx,
        id,
        'cancelled',
        { cancelledAt: deps.clock().toISOString(), cancelReason: reason },
        reason,
        settleOf(ctx, id, money)
      )
    },

    /** `feeMinor` > 0: the no-show fee line lands on the folio in the same transaction (P21d, Ö-22). */
    noShow(ctx: Ctx, id: string, reason = 'no_show', feeMinor = 0): ReservationDetail {
      if (!Number.isSafeInteger(feeMinor) || feeMinor < 0) throw invalid('errors.validation')
      if (feeMinor > 0) requirePermission(ctx, 'extras', 'edit')
      const settle: SettleFn | undefined =
        feeMinor > 0
          ? (tx, audit, now) => {
              assertDayWritable(tx, ctx, today(now), undefined)
              insertFeeCharge(tx, audit, ctx, now, {
                reservationId: id,
                code: 'no_show_fee',
                date: today(now),
                amountMinor: feeMinor
              })
              return { noShowFeeMinor: feeMinor }
            }
          : undefined
      return endReservation(ctx, id, 'no_show', {}, reason, settle)
    },

    /**
     * One room of a reservation is not wanted any more (its nights are freed, its charges voided; nothing is
     * deleted). Only a stay still to come; the rooms already stayed in keep their nights. When no room is left
     * open the reservation is checked out (someone stayed) or cancelled.
     */
    cancelStay(ctx: Ctx, stayId: string, reason: string): ReservationDetail {
      requirePermission(ctx, 'calendar', 'edit')
      const why = parseInput(cancelReasonSchema, reason)
      return inTransaction(deps, ctx, (tx, audit, now) => cancelStayIn(tx, audit, now, stayId, why))
    },

    /** Below the grid (G-39): nights released, payments kept (refund pending, postponed…). */
    park(ctx: Ctx, id: string, input: z.input<typeof parkSchema>): ReservationDetail {
      const data = parseInput(parkSchema, input)
      return endReservation(
        ctx,
        id,
        'parked',
        { parkedReason: data.reason, parkedNote: data.note ?? null },
        data.reason
      )
    },

    unpark(
      ctx: Ctx,
      id: string,
      stays: z.input<typeof stayInputSchema>[],
      overrideBlockReason?: string
    ): ReservationDetail {
      requirePermission(ctx, 'calendar', 'edit')
      const data = parseInput(unparkSchema, { stays, overrideBlockReason })
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const r = reservationOf(tx, id)
        if (r.status !== 'parked') throw invalid('errors.notParked')
        const folio = folioOfReservation(tx, id)
        // The stays the last park released, in room order: their people go to the new stays in the same order.
        const released = tx
          .select()
          .from(reservationRooms)
          .where(and(eq(reservationRooms.reservationId, id), eq(reservationRooms.status, 'cancelled')))
          .orderBy(asc(reservationRooms.sort), asc(reservationRooms.checkIn))
          .all()
        const lastPark = released.reduce(
          (max, x) => ((x.releasedAt ?? '') > max ? (x.releasedAt ?? '') : max),
          ''
        )
        const parkedStays = released.filter((x) => (x.releasedAt ?? '') === lastPark)
        const sort =
          tx
            .select({ sort: reservationRooms.sort })
            .from(reservationRooms)
            .where(eq(reservationRooms.reservationId, id))
            .all()
            .reduce((max, x) => Math.max(max, x.sort), -1) + 1
        const created = data.stays.map((s, i) =>
          addStay(tx, ctx, now, id, folio, s, sort + i, data.overrideBlockReason, audit)
        )
        const iso = now.toISOString()
        // Everybody who had not left (with their descriptor notes and KBS marks) moves with the reservation.
        const people = parkedStays.length
          ? tx
              .select()
              .from(stayOccupants)
              .where(
                and(
                  inArray(
                    stayOccupants.reservationRoomId,
                    parkedStays.map((x) => x.id)
                  ),
                  isNull(stayOccupants.leftAt)
                )
              )
              .orderBy(asc(stayOccupants.createdAt))
              .all()
          : []
        for (const o of people) {
          const index = parkedStays.findIndex((x) => x.id === o.reservationRoomId)
          const target = created[index] ?? created[0]
          if (!target) continue
          tx.update(stayOccupants)
            .set({ reservationRoomId: target, updatedAt: iso })
            .where(eq(stayOccupants.id, o.id))
            .run()
          audit({
            entity: 'stay_occupant',
            entityId: o.id,
            action: 'update',
            before: { reservationRoomId: o.reservationRoomId },
            after: { reservationRoomId: target }
          })
        }
        tx.update(reservations)
          .set({
            status: r.parkedFromStatus === 'tentative' ? 'tentative' : 'confirmed',
            parkedReason: null,
            parkedNote: null,
            parkedFromStatus: null,
            updatedAt: iso
          })
          .where(eq(reservations.id, id))
          .run()
        refreshKind(tx, id, now)
        const after = detail(tx, id)
        audit({ entity: 'reservation', entityId: id, action: 'restore', after: after.reservation })
        return after
      })
    },

    setStatus(ctx: Ctx, id: string, input: 'tentative' | 'confirmed'): ReservationDetail {
      requirePermission(ctx, 'calendar', 'edit')
      const status = parseInput(reservationStatusSchema, input)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const before = reservationOf(tx, id)
        if (!['tentative', 'confirmed'].includes(before.status)) throw invalid('errors.reservationClosed')
        tx.update(reservations)
          .set({ status, updatedAt: now.toISOString() })
          .where(eq(reservations.id, id))
          .run()
        audit({
          entity: 'reservation',
          entityId: id,
          action: 'update',
          before: { status: before.status },
          after: { status }
        })
        return detail(tx, id)
      })
    },

    /** Check-in; on the day of a room move it moves the people from the previous room instead (§6.1). */
    checkIn(ctx: Ctx, stayId: string): ReservationDetail {
      requirePermission(ctx, 'calendar', 'edit')
      const result = inTransaction(deps, ctx, (tx, audit, now) => checkInIn(tx, audit, now, ctx, stayId))
      if (result.movedFromRoomId) deps.hooks?.onCheckout?.(ctx, result.movedFromRoomId, today(deps.clock()))
      return result.detail
    },

    /**
     * Take a check-in back (K-55: "girişi geri al"): the guest changed their mind on the check-in day. The stay is
     * planned again (the nights and charges were never touched), the people lose their arrival time, the
     * reservation goes back to "confirmed" unless another room is in the house or was stayed in. A person already
     * reported to KBS needs `kbsConfirmed`: the report stays on record, the KBS check-out is made on the KBS side.
     * Nothing is deleted; the audit row is `check_in_undo` (and the reservation's own status change).
     * `then` gives the stay or the reservation up in the same transaction (cancel with the money settled, park as
     * "refund pending", or only this room): when the second step fails nothing of the first is written either.
     */
    undoCheckIn(
      ctx: Ctx,
      stayId: string,
      opts: { reason: string; kbsConfirmed?: boolean | undefined; then?: UndoThenInput | undefined }
    ): ReservationDetail {
      requirePermission(ctx, 'calendar', 'edit')
      requirePermission(ctx, 'booking.undoCheckIn', 'edit')
      const why = parseInput(cancelReasonSchema, opts.reason)
      const next = opts.then ? parseInput(undoThenSchema, opts.then) : undefined
      // G-23: the right to refund is asked before anything is read or written.
      if (next?.do === 'cancel') requireRefundRight(ctx, next.refund)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const stay = stayOf(tx, stayId)
        if (stay.status !== 'in_house') throw invalid('errors.invalidStayState', { status: stay.status })
        const checkedInDay = stay.checkedInAt ? localDateOf(new Date(stay.checkedInAt)) : null
        if (checkedInDay !== today(now))
          throw invalid('errors.undoCheckInNotToday', { checkedInAt: stay.checkedInAt ?? '' })
        // A room-move day: the people came from another room, so there is nothing to give back to "planned".
        const movedFrom = tx
          .select({ id: reservationRooms.id })
          .from(reservationRooms)
          .where(
            and(
              eq(reservationRooms.reservationId, stay.reservationId),
              eq(reservationRooms.status, 'done'),
              eq(reservationRooms.checkOut, stay.checkIn),
              ne(reservationRooms.roomId, stay.roomId)
            )
          )
          .get()
        if (movedFrom) throw invalid('errors.undoCheckInMoved')
        const people = tx
          .select()
          .from(stayOccupants)
          .where(eq(stayOccupants.reservationRoomId, stayId))
          .all()
        const reported = people.filter((o) => o.kbsReportedAt && !o.kbsCheckoutAt)
        if (reported.length && !opts.kbsConfirmed)
          throw invalid('errors.undoCheckInKbs', { names: reported.map((o) => o.fullName).join(', ') })
        const iso = now.toISOString()
        tx.update(reservationRooms)
          .set({ status: 'planned', checkedInAt: null, updatedAt: iso })
          .where(eq(reservationRooms.id, stayId))
          .run()
        for (const o of people) {
          if (!o.arrivedAt) continue
          tx.update(stayOccupants)
            .set({ arrivedAt: null, updatedAt: iso })
            .where(eq(stayOccupants.id, o.id))
            .run()
          audit({
            entity: 'stay_occupant',
            entityId: o.id,
            action: 'update',
            before: { arrivedAt: o.arrivedAt },
            after: { arrivedAt: null }
          })
        }
        const others = tx
          .select({ status: reservationRooms.status })
          .from(reservationRooms)
          .where(and(eq(reservationRooms.reservationId, stay.reservationId), ne(reservationRooms.id, stayId)))
          .all()
        const started = others.some((x) => x.status === 'in_house' || x.status === 'done')
        const reservationBefore = reservationOf(tx, stay.reservationId).status
        const reservationAfter = started ? 'checked_in' : 'confirmed'
        tx.update(reservations)
          .set({ status: reservationAfter, updatedAt: iso })
          .where(eq(reservations.id, stay.reservationId))
          .run()
        audit({
          entity: 'reservation',
          entityId: stay.reservationId,
          action: 'update',
          before: { status: reservationBefore },
          after: { status: reservationAfter },
          reason: why
        })
        audit({
          entity: 'reservation_room',
          entityId: stayId,
          action: 'check_in_undo',
          before: { status: 'in_house', checkedInAt: stay.checkedInAt },
          after: {
            status: 'planned',
            ...(reported.length ? { kbsReportedPeople: reported.map((o) => o.fullName) } : {})
          },
          reason: why
        })
        // The give-up goes on in the same transaction (a failure undoes the take-back too).
        if (!next) return detail(tx, stay.reservationId)
        const id = stay.reservationId
        if (next.do === 'cancelStay') return cancelStayIn(tx, audit, now, stayId, why)
        if (next.do === 'park')
          return endReservationIn(
            tx,
            audit,
            now,
            id,
            'parked',
            { parkedReason: next.park.reason, parkedNote: next.park.note ?? null },
            next.park.reason
          )
        return endReservationIn(
          tx,
          audit,
          now,
          id,
          'cancelled',
          { cancelledAt: now.toISOString(), cancelReason: why },
          why,
          settleOf(ctx, id, next.refund)
        )
      })
    },

    /**
     * Check-out: occupants leave, the room becomes dirty (G-90, S-14); an early departure shortens the stay. The
     * people in `kbsCheckoutIds` get their "KBS çıkışı yapıldı" mark in the same step (G-53; needs `in_house`).
     */
    checkOut(
      ctx: Ctx,
      stayId: string,
      opts: {
        kbsCheckoutIds?: readonly string[]
        dayUsePriceMinor?: number
        /** The desk confirmed a free same-day stay (price 0, H-06). */
        dayUseFreeConfirmed?: boolean
      } = {}
    ): ReservationDetail {
      requirePermission(ctx, 'calendar', 'edit')
      const kbsIds = [...new Set(opts.kbsCheckoutIds ?? [])]
      if (kbsIds.length) requirePermission(ctx, 'in_house', 'edit')
      const result = inTransaction(deps, ctx, (tx, audit, now) =>
        checkOutIn(tx, audit, now, ctx, stayId, opts, kbsIds)
      )
      deps.hooks?.onCheckout?.(ctx, result.roomId, result.day)
      return result.detail
    },

    addNote(ctx: Ctx, reservationId: string, text: string, date?: string): ReservationDetail {
      requirePermission(ctx, 'calendar', 'edit')
      if (!text.trim() || text.length > 2000) throw invalid('errors.validation')
      return inTransaction(deps, ctx, (tx, audit, now) => {
        reservationOf(tx, reservationId)
        const id = newId(now)
        tx.insert(reservationNotes)
          .values({
            id,
            reservationId,
            date: date ?? null,
            text: text.trim(),
            createdBy: ctx.userId,
            ...stamps(now)
          })
          .run()
        audit({
          entity: 'reservation_note',
          entityId: id,
          action: 'create',
          after: { reservationId, date, text }
        })
        return detail(tx, reservationId)
      })
    },

    // ---- Group reservations (P17b) ----

    group(ctx: Ctx, groupId: string): GroupViewDto {
      requirePermission(ctx, 'calendar', 'view')
      return groupView(db, groupId, ctx.can('payments', 'view'))
    },

    /**
     * A group booking (G-194): one reservation per room, each with its own guest name (a room without a name takes
     * the leader), all linked by the group. The group keeps the folio mode the hotel setting has now (S-106). One
     * transaction: when one room cannot be booked no room and no group is written.
     */
    createGroup(ctx: Ctx, input: GroupCreateInput): GroupViewDto {
      requirePermission(ctx, 'calendar', 'edit')
      const data = parseInput(groupCreateSchema, input)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        blacklistGate(tx, ctx, data.leader, data.blacklistConfirmed)
        const leaderId = resolveGuest(tx, ctx, data.leader, now, audit)
        const row = {
          id: newId(now),
          name: data.name,
          leaderGuestId: leaderId,
          folioMode: readSetting(tx, 'booking.groupFolioMode'),
          ...stamps(now)
        }
        tx.insert(reservationGroups).values(row).run()
        const reservationIds = data.rooms.map(
          (room) =>
            createIn(
              tx,
              audit,
              now,
              ctx,
              parseInput(reservationCreateSchema, {
                guest: room.guest ?? { id: leaderId },
                channelId: data.channelId,
                channelRef: data.channelRef,
                status: data.status,
                stays: [room.stay],
                currency: data.currency,
                adults: room.adults,
                notes: data.notes,
                tagIds: data.tagIds,
                soldByUserId: data.soldByUserId,
                overrideBlockReason: data.overrideBlockReason
              }),
              { blacklistConfirmed: data.blacklistConfirmed },
              row.id
            ).reservation.id
        )
        audit({
          entity: 'reservation_groups',
          entityId: row.id,
          action: 'create',
          after: { ...row, reservationIds }
        })
        return groupView(tx, row.id, ctx.can('payments', 'view'))
      })
    },

    /** Check the named rooms of a group in: every room or none (one transaction, G-194). */
    checkInMany(ctx: Ctx, input: GroupStaysInput): GroupViewDto {
      requirePermission(ctx, 'calendar', 'edit')
      const data = parseInput(groupStaysSchema, input)
      const stayIds = [...new Set(data.stayIds)]
      const result = inTransaction(deps, ctx, (tx, audit, now) => {
        if (groupOf(tx, data.groupId).voidedAt) throw invalid('errors.groupClosed')
        assertGroupStays(tx, data.groupId, stayIds)
        const moved = stayIds.flatMap((id) => {
          const done = checkInIn(tx, audit, now, ctx, id)
          return done.movedFromRoomId ? [done.movedFromRoomId] : []
        })
        audit({
          entity: 'reservation_groups',
          entityId: data.groupId,
          action: 'check_in',
          after: { stayIds }
        })
        return { view: groupView(tx, data.groupId, ctx.can('payments', 'view')), moved }
      })
      // The check-ins are committed; a failing follow-up must not report them as failed.
      for (const roomId of result.moved) afterCheckout(ctx, roomId, today(deps.clock()))
      return result.view
    },

    /** Check the named rooms of a group out: every room or none (one transaction, G-194). */
    checkOutMany(ctx: Ctx, input: GroupStaysInput): GroupViewDto {
      requirePermission(ctx, 'calendar', 'edit')
      const data = parseInput(groupStaysSchema, input)
      const stayIds = [...new Set(data.stayIds)]
      const result = inTransaction(deps, ctx, (tx, audit, now) => {
        if (groupOf(tx, data.groupId).voidedAt) throw invalid('errors.groupClosed')
        assertGroupStays(tx, data.groupId, stayIds)
        const left = stayIds.map((id) => checkOutIn(tx, audit, now, ctx, id, {}, []))
        audit({
          entity: 'reservation_groups',
          entityId: data.groupId,
          action: 'check_out',
          after: { stayIds }
        })
        return { view: groupView(tx, data.groupId, ctx.can('payments', 'view')), left }
      })
      for (const l of result.left) afterCheckout(ctx, l.roomId, l.day)
      return result.view
    },

    /**
     * Rooms among `stayIds` that still lack KBS information (a person in the room not reported, or nobody recorded;
     * S-124). Read only: a bulk check-out lists them as a warning and goes on. Empty when the hotel's KBS checks
     * are off or the user may not see the people.
     */
    kbsGaps(ctx: Ctx, input: KbsGapsInput): { stayId: string; roomNumber: string }[] {
      requirePermission(ctx, 'calendar', 'view')
      const data = parseInput(kbsGapsInputSchema, input)
      if (!ctx.can('in_house', 'view') || !readSetting(db, 'kbs.checksEnabled')) return []
      const stayIds = [...new Set(data.stayIds)]
      const nowIso = deps.clock().toISOString()
      const stays = db
        .select({
          id: reservationRooms.id,
          roomId: reservationRooms.roomId,
          reservationId: reservationRooms.reservationId,
          checkIn: reservationRooms.checkIn,
          checkOut: reservationRooms.checkOut,
          checkedInAt: reservationRooms.checkedInAt,
          checkedOutAt: reservationRooms.checkedOutAt,
          status: reservationRooms.status,
          roomNumber: rooms.number
        })
        .from(reservationRooms)
        .innerJoin(rooms, eq(rooms.id, reservationRooms.roomId))
        .where(inArray(reservationRooms.id, stayIds))
        .all()
      const occupants = db
        .select()
        .from(stayOccupants)
        .where(inArray(stayOccupants.reservationRoomId, stayIds))
        .all()
      const gaps = new Set(
        kbsMissing(
          stays.map((s) => ({
            id: s.id,
            roomId: s.roomId,
            reservationId: s.reservationId,
            checkIn: s.checkIn as LocalDate,
            checkOut: s.checkOut as LocalDate,
            checkedInAt: s.checkedInAt,
            checkedOutAt: s.checkedOutAt,
            cancelled: s.status === 'cancelled'
          })),
          occupants,
          nowIso
        )
          .filter((k) => k.kind !== 'checkout')
          .map((k) => k.reservationRoomId)
      )
      return stays.filter((s) => gaps.has(s.id)).map((s) => ({ stayId: s.id, roomNumber: s.roomNumber }))
    },

    /** One note on every reservation of the group (bulk note); a note is never edited or deleted. */
    addGroupNote(ctx: Ctx, input: GroupNoteInput): GroupViewDto {
      requirePermission(ctx, 'calendar', 'edit')
      const data = parseInput(groupNoteSchema, input)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        if (groupOf(tx, data.groupId).voidedAt) throw invalid('errors.groupClosed')
        for (const member of groupMembers(tx, data.groupId)) {
          const id = newId(now)
          tx.insert(reservationNotes)
            .values({
              id,
              reservationId: member.id,
              date: null,
              text: data.text,
              createdBy: ctx.userId,
              ...stamps(now)
            })
            .run()
          audit({
            entity: 'reservation_note',
            entityId: id,
            action: 'create',
            after: { reservationId: member.id, groupId: data.groupId, text: data.text }
          })
        }
        return groupView(tx, data.groupId, ctx.can('payments', 'view'))
      })
    },

    /**
     * Cancel the rooms of a group that are still to come (one transaction). A room in the house stops it
     * (`guestInHouse`); rooms already closed stay as they are. Payments stay on the folios (a refund is made on the
     * room's own panel). When no room is left open the group is voided (`voided_at`).
     */
    cancelGroup(ctx: Ctx, input: GroupCancelInput): GroupViewDto {
      requirePermission(ctx, 'calendar', 'edit')
      const data = parseInput(groupCancelSchema, input)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const group = groupOf(tx, data.groupId)
        if (group.voidedAt) throw invalid('errors.groupClosed')
        const open = groupMembers(tx, data.groupId).filter(
          (m) => m.status === 'tentative' || m.status === 'confirmed' || m.status === 'checked_in'
        )
        for (const m of open)
          endReservationIn(
            tx,
            audit,
            now,
            m.id,
            'cancelled',
            { cancelledAt: now.toISOString(), cancelReason: data.reason },
            data.reason
          )
        const stillOpen = groupMembers(tx, data.groupId).some((m) => m.status !== 'cancelled')
        if (!stillOpen)
          tx.update(reservationGroups)
            .set({ voidedAt: now.toISOString(), updatedAt: now.toISOString() })
            .where(eq(reservationGroups.id, data.groupId))
            .run()
        audit({
          entity: 'reservation_groups',
          entityId: data.groupId,
          action: 'cancel',
          before: {
            reservationIds: open.map((m) => m.id),
            statuses: open.map((m) => m.status),
            voided: false
          },
          after: { reservationIds: open.map((m) => m.id), voided: !stillOpen },
          reason: data.reason
        })
        return groupView(tx, data.groupId, ctx.can('payments', 'view'))
      })
    },

    /**
     * One payment on the group's single account (S-106): the amount covers the rooms' open balances in booking
     * order, a payment row per room, all in one transaction. It never overpays: the amount may not exceed what is
     * open, and the folios must all be in the payment's currency. Only for a single-folio group; a per-room group
     * is refused (`errors.groupPayPerRoom`).
     */
    payGroup(ctx: Ctx, input: GroupPayInput): GroupViewDto {
      requirePermission(ctx, 'payments', 'edit')
      const data = parseInput(groupPaySchema, input)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const group = groupOf(tx, data.groupId)
        if (group.voidedAt) throw invalid('errors.groupClosed')
        // One payment on one account only exists in a single-folio group; a per-room group is paid room by room.
        if (group.folioMode !== 'single') throw invalid('errors.groupPayPerRoom')
        const open = groupMembers(tx, data.groupId)
          .filter((m) => isGroupPayableStatus(m.status))
          .map((m) => ({ id: m.id, status: m.status, folio: detail(tx, m.id).folio }))
        if (open.some((m) => m.folio.currency !== data.currency)) throw invalid('errors.groupPayCurrency')
        const due = groupPayableMinor(
          open.map((m) => ({ status: m.status, balanceMinor: m.folio.balanceMinor }))
        )
        if (data.amountMinor > due) throw invalid('errors.groupPayExceeds', { balanceMinor: due })
        let left = data.amountMinor
        const parts: { reservationId: string; amountMinor: number }[] = []
        for (const m of open) {
          if (left <= 0) break
          const part = Math.min(left, Math.max(0, m.folio.balanceMinor))
          if (part <= 0) continue
          parts.push({ reservationId: m.id, amountMinor: part })
          left -= part
        }
        const record = deps.hooks?.recordPayment
        if (!record) throw invalid('errors.internal')
        for (const part of parts)
          record(ctx, tx, audit, now, {
            reservationId: part.reservationId,
            date: data.date,
            kind: 'payment',
            methodId: data.methodId,
            amountMinor: part.amountMinor,
            currency: data.currency,
            reference: data.reference,
            note: data.note ?? group.name,
            dayClosedReason: data.dayClosedReason
          })
        audit({
          entity: 'reservation_groups',
          entityId: data.groupId,
          action: 'update',
          after: { amountMinor: data.amountMinor, currency: data.currency, parts }
        })
        return groupView(tx, data.groupId, ctx.can('payments', 'view'))
      })
    },

    /**
     * Existing reservations into a group (G-194): a group that exists or a new one named here, led by the first
     * reservation's guest. Reservations already in a group stay where they are; closed ones cannot be linked.
     * Nothing about the stays or the money changes.
     */
    attachToGroup(ctx: Ctx, input: GroupAttachInput): GroupViewDto {
      requirePermission(ctx, 'calendar', 'edit')
      const data = parseInput(groupAttachSchema, input)
      const ids = [...new Set(data.reservationIds)]
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const rows = tx.select().from(reservations).where(inArray(reservations.id, ids)).all()
        if (rows.length !== ids.length) throw notFound('reservation', ids.join(','))
        if (rows.some((r) => r.groupId)) throw invalid('errors.groupAttachTaken')
        if (
          rows.some(
            (r) => !(r.status === 'tentative' || r.status === 'confirmed' || r.status === 'checked_in')
          )
        )
          throw invalid('errors.groupAttachClosed')
        let groupId = data.groupId ?? ''
        if (groupId) {
          if (groupOf(tx, groupId).voidedAt) throw invalid('errors.groupClosed')
          if (groupMembers(tx, groupId).length + ids.length > MAX_GROUP_ROOMS)
            throw invalid('errors.groupTooLarge')
        } else {
          if (ids.length < 2) throw invalid('errors.groupAttachTooFew')
          const first = ids.map((id) => rows.find((r) => r.id === id)!)[0]!
          const row = {
            id: newId(now),
            name: data.name ?? '',
            leaderGuestId: first.primaryGuestId,
            folioMode: readSetting(tx, 'booking.groupFolioMode'),
            ...stamps(now)
          }
          tx.insert(reservationGroups).values(row).run()
          audit({ entity: 'reservation_groups', entityId: row.id, action: 'create', after: row })
          groupId = row.id
        }
        for (const r of rows) {
          tx.update(reservations)
            .set({ groupId, updatedAt: now.toISOString() })
            .where(eq(reservations.id, r.id))
            .run()
          audit({
            entity: 'reservation',
            entityId: r.id,
            action: 'update',
            before: { groupId: null },
            after: { groupId }
          })
        }
        return groupView(tx, groupId, ctx.can('payments', 'view'))
      })
    },

    /** Suggested price for a night (G-48): room type base price, weekend price on weekend nights (K-44). */
    suggestPrice(ctx: Ctx, roomId: string, input: string): { priceMinor: number; currency: string } | null {
      requirePermission(ctx, 'calendar', 'view')
      const date = parseInput(localDateSchema, input)
      const row = db
        .select({
          base: roomTypes.basePriceMinor,
          weekend: roomTypes.weekendPriceMinor,
          currency: roomTypes.baseCurrency
        })
        .from(rooms)
        .innerJoin(roomTypes, eq(rooms.roomTypeId, roomTypes.id))
        .where(eq(rooms.id, roomId))
        .get()
      if (!row || row.base === null) return null
      const highlighted = readSetting(db, 'pricing.weekendNights').includes(weekday(localDate(date)))
      return {
        priceMinor: highlighted && row.weekend !== null ? row.weekend : row.base,
        currency: row.currency ?? baseCurrencyOf(db)
      }
    },

    /** Reservations with nights in [from, to): the data the tape chart draws (Faz 5). */
    listInRange(ctx: Ctx, fromDate: string, toDate: string): ReservationDetail[] {
      requirePermission(ctx, 'calendar', 'view')
      const { from, to } = parseInput(dateRangeSchema, { from: fromDate, to: toDate })
      const ids = db
        .selectDistinct({ id: reservationRooms.reservationId })
        .from(roomNights)
        .innerJoin(reservationRooms, eq(roomNights.reservationRoomId, reservationRooms.id))
        .where(and(gte(roomNights.date, from), lt(roomNights.date, to)))
        .all()
      return ids.map((r) => detail(db, r.id))
    },

    listParked(ctx: Ctx): ReservationRow[] {
      requirePermission(ctx, 'calendar', 'view')
      return db.select().from(reservations).where(eq(reservations.status, 'parked')).all()
    },

    /** The panel's own fields: channel, channel reference, note, people counts, tentative/confirmed, tags. */
    update(ctx: Ctx, id: string, input: ReservationUpdateInput): ReservationDetail {
      requirePermission(ctx, 'calendar', 'edit')
      const patch = parseInput(reservationUpdateSchema, input)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const before = reservationOf(tx, id)
        if (!['tentative', 'confirmed', 'checked_in'].includes(before.status))
          throw invalid('errors.reservationClosed', { status: before.status })
        if (patch.status && before.status === 'checked_in') throw invalid('errors.guestInHouse')
        if (
          patch.channelId &&
          !tx.select().from(salesChannels).where(eq(salesChannels.id, patch.channelId)).get()
        )
          throw notFound('sales_channel', patch.channelId)
        const { tagIds, ...fields } = patch
        const set: Partial<typeof reservations.$inferInsert> = {}
        if (fields.channelId !== undefined) set.channelId = fields.channelId
        if (fields.channelRef !== undefined) set.channelRef = fields.channelRef || null
        if (fields.notes !== undefined) set.notes = fields.notes?.trim() || null
        if (fields.adults !== undefined) set.adults = fields.adults ?? null
        if (fields.children !== undefined) set.children = fields.children ?? null
        if (fields.status !== undefined) set.status = fields.status
        if (Object.keys(set).length)
          tx.update(reservations)
            .set({ ...set, updatedAt: now.toISOString() })
            .where(eq(reservations.id, id))
            .run()
        let tagsBefore: string[] | undefined
        if (tagIds) {
          assertCustomTags(tx, tagIds)
          tagsBefore = tx
            .select({ tagId: reservationTags.tagId })
            .from(reservationTags)
            .where(eq(reservationTags.reservationId, id))
            .all()
            .map((t) => t.tagId)
          tx.delete(reservationTags).where(eq(reservationTags.reservationId, id)).run()
          if (tagIds.length)
            tx.insert(reservationTags)
              .values(tagIds.map((tagId) => ({ reservationId: id, tagId })))
              .run()
        }
        const after = reservationOf(tx, id)
        const pick = (r: ReservationRow) =>
          Object.fromEntries(Object.keys(set).map((k) => [k, r[k as keyof ReservationRow]]))
        audit({
          entity: 'reservation',
          entityId: id,
          action: 'update',
          before: { ...pick(before), ...(tagsBefore ? { tagIds: tagsBefore } : {}) },
          after: { ...pick(after), ...(tagIds ? { tagIds } : {}) }
        })
        return detail(tx, id)
      })
    },

    /** One more room on an open reservation (G-35: several rooms, one folio). */
    addRoom(
      ctx: Ctx,
      reservationId: string,
      stay: z.input<typeof stayInputSchema>,
      overrideBlockReason?: string
    ): ReservationDetail {
      requirePermission(ctx, 'calendar', 'edit')
      const data = parseInput(addRoomSchema, { reservationId, stay })
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const r = reservationOf(tx, reservationId)
        if (!['tentative', 'confirmed', 'checked_in'].includes(r.status))
          throw invalid('errors.reservationClosed', { status: r.status })
        const folio = folioOfReservation(tx, reservationId)
        const sort =
          tx
            .select({ sort: reservationRooms.sort })
            .from(reservationRooms)
            .where(eq(reservationRooms.reservationId, reservationId))
            .all()
            .reduce((max, x) => Math.max(max, x.sort), -1) + 1
        const stayId = addStay(
          tx,
          ctx,
          now,
          reservationId,
          folio,
          data.stay,
          sort,
          overrideBlockReason,
          audit
        )
        refreshKind(tx, reservationId, now)
        audit({ entity: 'reservation_room', entityId: stayId, action: 'create', after: data.stay })
        return detail(tx, reservationId)
      })
    },

    /** How many stays each guest has had (§6.12 counted stays, as the guest card counts them), for the search. */
    stayCounts(ctx: Ctx, guestIds: readonly string[]): Map<string, number> {
      requirePermission(ctx, 'calendar', 'view')
      const out = new Map<string, number>()
      if (!guestIds.length) return out
      const day = today(deps.clock())
      const firstNight = new Map<string, string>()
      const rows = db
        .select({
          id: reservations.id,
          guestId: reservations.primaryGuestId,
          status: reservations.status,
          checkIn: reservationRooms.checkIn
        })
        .from(reservations)
        .innerJoin(reservationRooms, eq(reservationRooms.reservationId, reservations.id))
        .where(inArray(reservations.primaryGuestId, [...guestIds]))
        .all()
      for (const r of rows) {
        const cur = firstNight.get(r.id)
        if (!cur || r.checkIn < cur) firstNight.set(r.id, r.checkIn)
      }
      const seen = new Set<string>()
      for (const r of rows) {
        if (seen.has(r.id)) continue
        seen.add(r.id)
        if (isCountedStay({ status: r.status, checkIn: localDate(firstNight.get(r.id) ?? r.checkIn) }, day))
          out.set(r.guestId, (out.get(r.guestId) ?? 0) + 1)
      }
      return out
    },

    /** One reservation as the panel shows it; people and payments only for users who may see them. */
    view(ctx: Ctx, id: string): BookingView {
      requirePermission(ctx, 'calendar', 'view')
      const now = deps.clock()
      return bookingView(db, detail(db, id), {
        today: today(now),
        nowIso: now.toISOString(),
        showPeople: ctx.can('in_house', 'view'),
        showPayments: ctx.can('payments', 'view'),
        kbsChecks: readSetting(db, 'kbs.checksEnabled')
      })
    },

    /** Rooms (with prices and open issues), channels, payment methods and the hotel's money and week settings. */
    formOptions(ctx: Ctx) {
      requirePermission(ctx, 'calendar', 'view')
      return {
        today: today(deps.clock()),
        baseCurrency: baseCurrencyOf(db),
        currencies: readSetting(db, 'hotel.currencies'),
        highlightWeekdays: readSetting(db, 'calendar.highlightWeekdays'),
        weekendNights: readSetting(db, 'pricing.weekendNights'),
        ...formOptions(db, today(deps.clock()))
      }
    },

    /** Rooms another booking or a block keeps from [from, to) (a day-use when equal). */
    roomsTaken(
      ctx: Ctx,
      input: { from: string; to: string; excludeReservationId?: string; startTime?: string; endTime?: string }
    ) {
      requirePermission(ctx, 'calendar', 'view')
      const data = parseInput(availabilityInputSchema, input)
      if (diffDays(localDate(data.from), localDate(data.to)) > MAX_STAY_NIGHTS)
        throw invalid('errors.validation')
      return roomsTaken(
        db,
        localDate(data.from),
        localDate(data.to),
        data.excludeReservationId,
        data.startTime !== undefined && data.endTime !== undefined
          ? { start: data.startTime, end: data.endTime }
          : undefined
      )
    },

    /**
     * An hour range in a room's day (K-48): whether it is free, which cleaning gaps it leaves short (a warning only,
     * S-103) and the suggested price from the room type's hour price. Nothing is written.
     */
    hourlyCheck(ctx: Ctx, input: HourlyCheckInput): HourlyCheck {
      requirePermission(ctx, 'calendar', 'view')
      const data = parseInput(hourlyCheckInputSchema, input)
      const date = localDate(data.date)
      const range = { start: data.startTime, end: data.endTime }
      const occupied = occupiedSlots(db, date, addDays(date, 1)).filter((o) => o.roomId === data.roomId)
      const blocks = db
        .select()
        .from(roomBlocks)
        .where(
          and(
            eq(roomBlocks.roomId, data.roomId),
            isNull(roomBlocks.cancelledAt),
            lt(roomBlocks.dateFrom, addDays(date, 1))
          )
        )
        .all()
        .map((b) => ({ ...b, dateFrom: b.dateFrom as LocalDate, dateTo: b.dateTo as LocalDate }))
      const conflicts = findConflicts(
        data.roomId,
        staySlots(date, date, range),
        occupied,
        blocks,
        data.excludeReservationId
      )
      const taken = conflicts.filter((c) => c.reason === 'occupied')
      const others = occupied
        .filter((o) => o.date === date && o.slot === 'day' && o.startTime && o.endTime)
        .map((o) => ({ reservationId: o.reservationId, start: o.startTime, end: o.endTime }))
      const turnoverMinutes = readSetting(db, 'dayUse.turnoverMinutes')
      const type = db
        .select({ hourly: roomTypes.hourlyPriceMinor, currency: roomTypes.baseCurrency })
        .from(rooms)
        .innerJoin(roomTypes, eq(rooms.roomTypeId, roomTypes.id))
        .where(eq(rooms.id, data.roomId))
        .get()
      const currency = type?.currency ?? baseCurrencyOf(db)
      return {
        taken: taken.length > 0,
        hours: [
          ...new Set(taken.filter((c) => c.startTime && c.endTime).map((c) => `${c.startTime}–${c.endTime}`))
        ].sort(),
        blocked: conflicts.some((c) => c.reason === 'blocked'),
        warnings: turnoverWarnings(range, others, turnoverMinutes, data.excludeReservationId).map((w) => ({
          startTime: w.other.start ?? '',
          endTime: w.other.end ?? '',
          gapMinutes: w.gapMinutes
        })),
        turnoverMinutes,
        suggestedMinor:
          type?.hourly != null
            ? hourlyAmountMinor(type.hourly, currency, data.startTime, data.endTime)
            : null,
        currency
      }
    },

    /** Parked reservations with what they paid and the rooms they had (G-39). */
    parked(ctx: Ctx): ParkedView[] {
      requirePermission(ctx, 'calendar', 'view')
      return parkedList(db, (folioId) =>
        creditedTotal(
          db
            .select()
            .from(payments)
            .where(eq(payments.folioId, folioId))
            .all()
            .map((p) => ({ kind: p.kind, amountFolioMinor: p.amountFolioMinor, voided: !!p.voidedAt }))
        )
      )
    },

    /**
     * Blacklist matches for the person being booked (§6.9, G-45): asked by whoever writes reservations, so the
     * warning reaches reception; the reason text only for users who may read the blacklist.
     */
    blacklistCheck(ctx: Ctx, input: { name: string; phone?: string | null; guestId?: string }) {
      requirePermission(ctx, 'calendar', 'edit')
      const data = parseInput(guestCandidateInputSchema, input)
      const guest = data.guestId ? db.select().from(guests).where(eq(guests.id, data.guestId)).get() : null
      const candidate = guest
        ? {
            name: `${guest.firstName} ${guest.lastName}`,
            phone: guest.phone,
            idDocNumber: guest.idDocNumber,
            guestId: guest.id
          }
        : { name: data.name, phone: data.phone ?? null }
      return blacklistMatches(db, candidate, ctx.can('blacklist', 'view'))
    },

    /**
     * Suggested price of every night (G-48, §6.2): the room type's price, its weekend price on highlighted
     * weekdays and special days (`specialDates`, from the calendar). Null when the type has no price.
     */
    suggestPrices(
      ctx: Ctx,
      input: { roomId: string; checkIn: string; checkOut: string },
      specialDates: ReadonlySet<string> = new Set()
    ) {
      requirePermission(ctx, 'calendar', 'view')
      const data = parseInput(priceSuggestionInputSchema, input)
      if (diffDays(localDate(data.checkIn), localDate(data.checkOut)) > MAX_STAY_NIGHTS)
        throw invalid('errors.validation')
      const row = db
        .select({
          base: roomTypes.basePriceMinor,
          weekend: roomTypes.weekendPriceMinor,
          currency: roomTypes.baseCurrency
        })
        .from(rooms)
        .innerJoin(roomTypes, eq(rooms.roomTypeId, roomTypes.id))
        .where(eq(rooms.id, data.roomId))
        .get()
      if (!row) throw notFound('room', data.roomId)
      if (row.base === null) return null
      return {
        currency: row.currency ?? baseCurrencyOf(db),
        nights: suggestStayPrices(
          localDate(data.checkIn),
          localDate(data.checkOut),
          { baseMinor: row.base, weekendMinor: row.weekend },
          readSetting(db, 'pricing.weekendNights'),
          specialDates
        )
      }
    }
  }
}

export type ReservationsService = ReturnType<typeof createReservationsService>
