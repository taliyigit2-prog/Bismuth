// Stays, nights and room assignment (03-mimari.md §6.1; G-35…G-38, G-44). A stay is [checkIn, checkOut):
// the check-out day is not a night. checkIn == checkOut is a day-use (one "day" slot). A night and a day-use
// may share a date in the same room (different slots); the check-out day can be another stay's check-in. A
// day-use on day d needs the room free in daytime (G-37): no stay with checkIn < d < checkOut (nights d-1 and d).
import { addDays, diffDays, nightsOf, type LocalDate } from '../date'

export type Slot = 'night' | 'day'

export interface StaySlot {
  date: LocalDate
  slot: Slot
}

/** The dated slots a stay occupies: its nights, or one day slot for a day-use. */
export function staySlots(checkIn: LocalDate, checkOut: LocalDate): StaySlot[] {
  if (diffDays(checkIn, checkOut) < 0) throw new RangeError('checkOut before checkIn')
  if (checkIn === checkOut) return [{ date: checkIn, slot: 'day' }]
  return nightsOf(checkIn, checkOut).map((date) => ({ date, slot: 'night' as const }))
}

export const isDayUse = (checkIn: LocalDate, checkOut: LocalDate): boolean => checkIn === checkOut

export interface OccupiedSlot extends StaySlot {
  roomId: string
  reservationId: string
  /** The stay the slot belongs to; without it the reservation stands for the stay. */
  stayId?: string
}

export interface RoomBlockLike {
  id: string
  roomId: string
  /** First blocked day. */
  dateFrom: LocalDate
  /** First day after the block (exclusive), like a check-out. */
  dateTo: LocalDate
  kind: 'oos' | 'ooo'
}

export type ConflictReason = 'occupied' | 'blocked'

export interface Conflict {
  roomId: string
  date: LocalDate
  slot: Slot
  reason: ConflictReason
  reservationId?: string
  blockId?: string
}

export const isBlockedOn = (block: RoomBlockLike, date: LocalDate): boolean =>
  diffDays(block.dateFrom, date) >= 0 && diffDays(date, block.dateTo) > 0

/** The first day the occupancy of a stay has to be read from: one day earlier (a stay going on into it). */
export const occupancyFrom = (firstDate: LocalDate): LocalDate => addDays(firstDate, -1)

/** Days a set of nights goes on through in daytime: d with nights on d-1 and d (checkIn < d < checkOut). */
function throughDays(nightDates: ReadonlySet<string>): LocalDate[] {
  const out: LocalDate[] = []
  for (const d of nightDates) if (nightDates.has(addDays(d as LocalDate, -1))) out.push(d as LocalDate)
  return out
}

/**
 * Conflicts for putting `roomId` into the given slots. Slots of `ignoreReservationId` are ignored (editing a
 * reservation in place). A block covers both slots of its days. A day slot also clashes with a stay going on
 * through that day, and new nights that make a stay go on through a day clash with a day-use on it (G-37).
 * `span` is the whole stay after the change when `slots` are only its new slots (a stay made longer).
 * `occupied` has to reach one day before the first slot (`occupancyFrom`).
 */
export function findConflicts(
  roomId: string,
  slots: readonly StaySlot[],
  occupied: readonly OccupiedSlot[],
  blocks: readonly RoomBlockLike[],
  ignoreReservationId?: string,
  span: readonly StaySlot[] = slots
): Conflict[] {
  const taken = new Map<string, OccupiedSlot>()
  /** Night dates of every other stay in the room (by stay, else by reservation). */
  const nightsByStay = new Map<string, Set<string>>()
  for (const o of occupied) {
    if (o.roomId !== roomId || o.reservationId === ignoreReservationId) continue
    taken.set(`${o.date}|${o.slot}`, o)
    if (o.slot !== 'night') continue
    const key = o.stayId ?? o.reservationId
    const set = nightsByStay.get(key) ?? new Set<string>()
    set.add(o.date)
    nightsByStay.set(key, set)
  }
  const roomBlocks = blocks.filter((b) => b.roomId === roomId)
  const out: Conflict[] = []
  const seen = new Set<string>()
  const push = (c: Conflict): void => {
    const key = `${c.date}|${c.slot}|${c.reason}`
    if (seen.has(key)) return
    seen.add(key)
    out.push(c)
  }
  for (const s of slots) {
    const hit = taken.get(`${s.date}|${s.slot}`)
    if (hit)
      push({ roomId, date: s.date, slot: s.slot, reason: 'occupied', reservationId: hit.reservationId })
    else if (s.slot === 'day') {
      // A day-use in the middle of someone's stay: the room is not free in daytime.
      for (const dates of nightsByStay.values())
        if (dates.has(s.date) && dates.has(addDays(s.date, -1))) {
          const night = taken.get(`${s.date}|night`)
          push({ roomId, date: s.date, slot: 'day', reason: 'occupied', reservationId: night?.reservationId })
          break
        }
    }
    const block = roomBlocks.find((b) => isBlockedOn(b, s.date))
    if (block) push({ roomId, date: s.date, slot: s.slot, reason: 'blocked', blockId: block.id })
  }
  // New nights that make the stay go on through a day somebody has a day-use on.
  const added = new Set<string>(slots.filter((s) => s.slot === 'night').map((s) => s.date))
  if (added.size) {
    const spanNights = new Set<string>(span.filter((s) => s.slot === 'night').map((s) => s.date))
    for (const d of throughDays(spanNights)) {
      if (!added.has(d) && !added.has(addDays(d, -1))) continue
      const day = taken.get(`${d}|day`)
      if (day) push({ roomId, date: d, slot: 'day', reason: 'occupied', reservationId: day.reservationId })
    }
  }
  return out
}

/** Every date of a block, for drawing and for occupancy (ooo days leave the denominator, §6.10). */
export function blockDates(block: Pick<RoomBlockLike, 'dateFrom' | 'dateTo'>): LocalDate[] {
  const out: LocalDate[] = []
  for (let d = block.dateFrom; diffDays(d, block.dateTo) > 0; d = addDays(d, 1)) out.push(d)
  return out
}

/**
 * Room change from `fromDate` (§6.1): nights before it stay in the old room, the rest move to the new room with
 * their prices. Returns the dates that move.
 */
export function splitForRoomChange<T extends { date: LocalDate }>(
  nights: readonly T[],
  fromDate: LocalDate
): { stay: T[]; move: T[] } {
  const stay: T[] = []
  const move: T[] = []
  for (const n of nights) (diffDays(fromDate, n.date) >= 0 ? move : stay).push(n)
  return { stay, move }
}

// ---- Hourly stays (K-48, migration 0019) -----------------------------------------------------------------------
// A day slot may carry a time range 'HH:MM'–'HH:MM' on its date; several in one room and day are fine as long as the
// ranges do not overlap. A range is half-open [start, end): a stay ending at 12:00 and another starting at 12:00 do
// not clash. No times (null) = the whole day (every row before 0019): it clashes with any other day range.

/** 'HH:MM' wall-clock time, 00:00–23:59. */
export type ClockTime = string

export interface HourRange {
  start: ClockTime | null
  end: ClockTime | null
}

const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/

export const isClockTime = (value: string): value is ClockTime => CLOCK.test(value)

/** Minutes since midnight; throws on anything but 'HH:MM'. */
export function clockMinutes(time: ClockTime): number {
  const m = CLOCK.exec(time)
  if (!m) throw new RangeError(`not a clock time: ${time}`)
  return Number(m[1]) * 60 + Number(m[2])
}

/** A usable hourly range: both times valid and the end after the start (an hourly stay stays inside its day). */
export function isValidHourRange(start: string, end: string): boolean {
  return isClockTime(start) && isClockTime(end) && clockMinutes(start) < clockMinutes(end)
}

const isWholeDay = (r: HourRange): boolean => r.start === null || r.end === null

/** Whether two ranges on the same room and day share any minute. Touching ends do not; null = whole day. */
export function hourRangesOverlap(a: HourRange, b: HourRange): boolean {
  if (isWholeDay(a) || isWholeDay(b)) return true
  return clockMinutes(a.start!) < clockMinutes(b.end!) && clockMinutes(b.start!) < clockMinutes(a.end!)
}

export interface DayRangeLike extends HourRange {
  reservationId: string
}

/** The other day ranges of the room and day that `range` clashes with (blocks the sale: `roomOccupied` with hours). */
export function findHourConflicts<T extends DayRangeLike>(
  range: HourRange,
  others: readonly T[],
  ignoreReservationId?: string
): T[] {
  return others.filter((o) => o.reservationId !== ignoreReservationId && hourRangesOverlap(range, o))
}

export interface TurnoverWarning<T extends DayRangeLike> {
  other: T
  /** Free minutes between the two ranges (0 = back to back); always below the turnover time. */
  gapMinutes: number
}

/**
 * Cleaning-gap warnings (S-103: a warning, never a block): the neighbouring day ranges that end less than
 * `turnoverMinutes` before `range` starts, or start less than that after it ends. Overlapping ranges are conflicts,
 * not warnings; whole-day ranges and a turnover of 0 never warn.
 */
export function turnoverWarnings<T extends DayRangeLike>(
  range: HourRange,
  others: readonly T[],
  turnoverMinutes: number,
  ignoreReservationId?: string
): TurnoverWarning<T>[] {
  if (turnoverMinutes <= 0 || isWholeDay(range)) return []
  const start = clockMinutes(range.start!)
  const end = clockMinutes(range.end!)
  const out: TurnoverWarning<T>[] = []
  for (const other of others) {
    if (other.reservationId === ignoreReservationId || isWholeDay(other)) continue
    const otherStart = clockMinutes(other.start!)
    const otherEnd = clockMinutes(other.end!)
    const gap = otherStart >= end ? otherStart - end : start >= otherEnd ? start - otherEnd : null
    if (gap !== null && gap < turnoverMinutes) out.push({ other, gapMinutes: gap })
  }
  return out
}
