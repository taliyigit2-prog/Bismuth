// A room's capacity over time (K-27, G-12): every change of beds, "for sale" and "in use" is a row of
// room_capacity_changes with the day it counts from; a planned change that is withdrawn (or replaced by an
// earlier-dated one) keeps its row with `cancelled_at`. What a room is on a day is the latest live change on or
// before that day; before its first one the room does not exist yet (no report counts it, nothing books it).
// The `rooms` row carries today's values for convenience, but a day passes without a write: readers that care
// about "today" or a date range go through `capacityReader`, never through `rooms.active` alone.
import { and, asc, eq, gte, inArray, isNull } from 'drizzle-orm'
import { addDays, type LocalDate } from '@shared/date'
import type { BismuthDb } from '../db/client'
import { reservationRooms, reservations, guests, roomCapacityChanges, roomNights, rooms } from '../db/schema'
import { conflict } from './kit'

type Reader = Pick<BismuthDb, 'select'>
export type CapacityChangeRow = typeof roomCapacityChanges.$inferSelect

export interface CapacityState {
  active: boolean
  sellable: boolean
  beds: number
}

/** The values a room row falls back on when it has no history at all (data from before capacity history). */
export interface RoomCapacityRow extends CapacityState {
  id: string
}

/** Live changes of some rooms (all when `roomIds` is missing), each room's in the order they apply. */
export function liveChangesByRoom(db: Reader, roomIds?: readonly string[]): Map<string, CapacityChangeRow[]> {
  const live = isNull(roomCapacityChanges.cancelledAt)
  const rows = db
    .select()
    .from(roomCapacityChanges)
    .where(roomIds ? and(live, inArray(roomCapacityChanges.roomId, [...roomIds])) : live)
    .orderBy(asc(roomCapacityChanges.validFrom), asc(roomCapacityChanges.createdAt))
    .all()
  const out = new Map<string, CapacityChangeRow[]>()
  for (const row of rows) out.set(row.roomId, [...(out.get(row.roomId) ?? []), row])
  return out
}

const stateOf = (c: CapacityChangeRow): CapacityState => ({
  active: c.active,
  sellable: c.sellable,
  beds: c.beds
})

/** The latest change on or before `day` (a later one entered for the same day wins); undefined before the first. */
function changeOn(changes: readonly CapacityChangeRow[], day: string): CapacityChangeRow | undefined {
  let found: CapacityChangeRow | undefined
  for (const c of changes) {
    if (c.validFrom > day) break
    found = c
  }
  return found
}

/** Reads every room's capacity history once and answers per room and day. */
export function capacityReader(db: Reader, roomIds?: readonly string[]) {
  const byRoom = liveChangesByRoom(db, roomIds)
  const has = (roomId: string): boolean => (byRoom.get(roomId)?.length ?? 0) > 0

  /** The room on `day`; null when it did not exist yet. A room without history keeps its row's values. */
  const on = (room: RoomCapacityRow, day: string): CapacityState | null => {
    const changes = byRoom.get(room.id)
    if (!changes?.length) return { active: room.active, sellable: room.sellable, beds: room.beds }
    const c = changeOn(changes, day)
    return c ? stateOf(c) : null
  }
  const activeOn = (room: RoomCapacityRow, day: string): boolean => on(room, day)?.active ?? false

  return {
    on,
    activeOn,
    /** In use and for sale on every day of `days`. */
    sellableOn(room: RoomCapacityRow, days: readonly string[]): boolean {
      return days.every((d) => {
        const s = on(room, d)
        return !!s && s.active && s.sellable
      })
    },
    /** In use on at least one day of [from, to). */
    activeBetween(room: RoomCapacityRow, from: string, to: string): boolean {
      if (!has(room.id)) return room.active
      if (activeOn(room, from)) return true
      return (byRoom.get(room.id) ?? []).some((c) => c.validFrom > from && c.validFrom < to && c.active)
    },
    /** Days of [from, to) the room is not in use (not opened yet, or taken out of use), as [from, to) spans. */
    closedSpans(room: RoomCapacityRow, from: string, to: string): { from: string; to: string }[] {
      if (!has(room.id)) return room.active ? [] : [{ from, to }]
      const cuts = [
        from,
        ...(byRoom.get(room.id) ?? []).map((c) => c.validFrom).filter((d) => d > from && d < to),
        to
      ]
      const spans: { from: string; to: string }[] = []
      for (let i = 0; i < cuts.length - 1; i++) {
        const a = cuts[i]!
        const b = cuts[i + 1]!
        if (a === b || activeOn(room, a)) continue
        const last = spans[spans.length - 1]
        if (last && last.to === a) last.to = b
        else spans.push({ from: a, to: b })
      }
      return spans
    },
    /** The day the room starts to exist (its first live change); null without history. */
    firstDay(roomId: string): string | null {
      return byRoom.get(roomId)?.[0]?.validFrom ?? null
    },
    /** The first live change after `day` (a planned one when `day` is today). */
    nextAfter(roomId: string, day: string): CapacityChangeRow | null {
      return (byRoom.get(roomId) ?? []).find((c) => c.validFrom > day) ?? null
    },
    changes(roomId: string): readonly CapacityChangeRow[] {
      return byRoom.get(roomId) ?? []
    }
  }
}
export type CapacityReader = ReturnType<typeof capacityReader>

/** Rows of a room query as they are on `day`: today's capacity over the row, rooms not in use left out. */
export function roomsInUseOn<T extends RoomCapacityRow>(db: Reader, rows: readonly T[], day: string): T[] {
  const reader = capacityReader(db)
  return rows.flatMap((row) => {
    const state = reader.on(row, day)
    return state?.active ? [{ ...row, ...state }] : []
  })
}

export interface StayOnClosedDay {
  code: string
  guestName: string
  checkIn: string
  checkOut: string
}

/**
 * Throws CONFLICT `errors.roomHasStays` when a stay of the room has a night (or a day slot) on a day from `from`
 * on that the room is not in use by its (new) history: a room is taken out of use only after its stays have been
 * moved or cancelled. Cancelled stays have released their nights already.
 */
export function assertNoStaysWhileClosed(tx: Reader, roomId: string, from: LocalDate, number: string): void {
  const room = tx.select().from(rooms).where(eq(rooms.id, roomId)).get()
  if (!room) return
  const reader = capacityReader(tx, [roomId])
  const nights = tx
    .select({
      date: roomNights.date,
      code: reservations.code,
      firstName: guests.firstName,
      lastName: guests.lastName,
      checkIn: reservationRooms.checkIn,
      checkOut: reservationRooms.checkOut,
      stayId: reservationRooms.id
    })
    .from(roomNights)
    .innerJoin(reservationRooms, eq(roomNights.reservationRoomId, reservationRooms.id))
    .innerJoin(reservations, eq(reservationRooms.reservationId, reservations.id))
    .innerJoin(guests, eq(reservations.primaryGuestId, guests.id))
    .where(and(eq(roomNights.roomId, roomId), gte(roomNights.date, from)))
    .orderBy(asc(roomNights.date))
    .all()
  const stays = new Map<string, StayOnClosedDay>()
  for (const n of nights) {
    if (reader.activeOn(room, n.date)) continue
    if (!stays.has(n.stayId))
      stays.set(n.stayId, {
        code: n.code,
        guestName: `${n.firstName} ${n.lastName}`.trim(),
        checkIn: n.checkIn,
        checkOut: n.checkOut
      })
  }
  if (stays.size === 0) return
  const list = [...stays.values()]
  throw conflict('errors.roomHasStays', { room: number, date: from, stays: list })
}

/**
 * Days of a stay the room cannot take: not opened yet or not in use on that day. A night needs the room on its
 * day; a day-use (same-day in and out) on its one day.
 */
export function closedDaysOf(
  tx: Reader,
  room: RoomCapacityRow,
  checkIn: LocalDate,
  checkOut: LocalDate
): string[] {
  const reader = capacityReader(tx, [room.id])
  const days: string[] = []
  const last = checkIn === checkOut ? checkIn : addDays(checkOut, -1)
  for (let d = checkIn; d <= last; d = addDays(d, 1)) if (!reader.activeOn(room, d)) days.push(d)
  return days
}
