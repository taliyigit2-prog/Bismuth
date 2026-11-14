// Room occupants, KBS marks and the daily lists built from stays (03-mimari.md §6.15, §6.16; G-53, G-54, G-92,
// G-95, K-33). The same functions feed the calendar icon, the Today card, the shift handover summary and the
// "Otelde kalanlar" screen, so they can never disagree.
import { diffDays, type LocalDate } from '../date'

export interface StayRoomLike {
  id: string
  roomId: string
  reservationId: string
  checkIn: LocalDate
  checkOut: LocalDate
  /** ISO instants. */
  checkedInAt?: string | null
  checkedOutAt?: string | null
  cancelled?: boolean
}

export interface OccupantLike {
  id: string
  reservationRoomId: string
  fullName: string
  isPrimary: boolean
  arrivedAt?: string | null
  leftAt?: string | null
  kbsReportedAt?: string | null
  kbsCheckoutAt?: string | null
}

export const isInHouse = (s: StayRoomLike, at: string): boolean =>
  !s.cancelled && !!s.checkedInAt && s.checkedInAt <= at && (!s.checkedOutAt || s.checkedOutAt > at)

/** People in the room at `at` (arrived and not left); a stay without occupant rows counts its primary guest. */
export function occupantCount(stay: StayRoomLike, occupants: readonly OccupantLike[], at: string): number {
  const rows = occupants.filter((o) => o.reservationRoomId === stay.id)
  if (rows.length === 0) return isInHouse(stay, at) ? 1 : 0
  return rows.filter((o) => isPresent(stay, o, at)).length
}

function isPresent(stay: StayRoomLike, o: OccupantLike, at: string): boolean {
  if (!isInHouse(stay, at)) return false
  const arrived = o.arrivedAt ?? stay.checkedInAt
  return !!arrived && arrived <= at && (!o.leftAt || o.leftAt > at)
}

function hasLeft(stay: StayRoomLike, o: OccupantLike, at: string): boolean {
  if (!(o.arrivedAt ?? stay.checkedInAt)) return false
  if (o.leftAt && o.leftAt <= at) return true
  return !!stay.checkedOutAt && stay.checkedOutAt <= at
}

export interface KbsIssue {
  /** null for `unnamed`. */
  occupantId: string | null
  reservationRoomId: string
  roomId: string
  fullName: string | null
  /**
   * checkin: in the room but not reported to KBS; checkout: left but the KBS check-out was not done;
   * unnamed: a room in the house with nobody recorded (the other rooms of a multi-room booking): the people
   * staying there have to be entered and reported.
   */
  kind: 'checkin' | 'checkout' | 'unnamed'
}

/** §6.15 `kbsMissing`: what reception still has to do in KBS right now. */
export function kbsMissing(
  stays: readonly StayRoomLike[],
  occupants: readonly OccupantLike[],
  at: string
): KbsIssue[] {
  const byId = new Map(stays.map((s) => [s.id, s]))
  const out: KbsIssue[] = []
  for (const o of occupants) {
    const stay = byId.get(o.reservationRoomId)
    if (!stay || stay.cancelled) continue
    const base = { occupantId: o.id, reservationRoomId: stay.id, roomId: stay.roomId, fullName: o.fullName }
    if (isPresent(stay, o, at) && !o.kbsReportedAt) out.push({ ...base, kind: 'checkin' })
    else if (hasLeft(stay, o, at) && !o.kbsCheckoutAt) out.push({ ...base, kind: 'checkout' })
  }
  const recorded = new Set(occupants.map((o) => o.reservationRoomId))
  for (const stay of stays)
    if (isInHouse(stay, at) && !recorded.has(stay.id))
      out.push({
        occupantId: null,
        reservationRoomId: stay.id,
        roomId: stay.roomId,
        fullName: null,
        kind: 'unnamed'
      })
  return out
}

/**
 * Before the hotel's check-out time the night is not over: yesterday's arrivals not checked in yet (the guest
 * landing at 01:30) still belong to the night shift's "gelecekler". Day uses of yesterday are left out.
 */
export function isLateArrival(
  s: StayRoomLike,
  today: LocalDate,
  nowTime: string,
  checkoutTime: string
): boolean {
  return (
    !s.cancelled &&
    !s.checkedInAt &&
    nowTime < checkoutTime &&
    diffDays(s.checkIn, today) === 1 &&
    s.checkOut > s.checkIn
  )
}

/**
 * Arrivals not checked in yet (handover summary, Today screen): today's, and — with `late` — yesterday's ones
 * still awaited before the check-out time (isLateArrival).
 */
export const pendingArrivals = (
  stays: readonly StayRoomLike[],
  today: LocalDate,
  late?: { nowTime: string; checkoutTime: string }
): StayRoomLike[] =>
  stays.filter(
    (s) =>
      (!s.cancelled && s.checkIn === today && !s.checkedInAt) ||
      (late !== undefined && isLateArrival(s, today, late.nowTime, late.checkoutTime))
  )

/**
 * Stays that should have left: check-out day before today, or today after the hotel's check-out time
 * (Lale 12:00 — a setting), still not checked out.
 */
export function overdueCheckouts(
  stays: readonly StayRoomLike[],
  today: LocalDate,
  nowTime: string,
  checkoutTime: string
): StayRoomLike[] {
  return stays.filter((s) => {
    if (s.cancelled || !s.checkedInAt || s.checkedOutAt) return false
    const d = diffDays(s.checkOut, today)
    return d > 0 || (d === 0 && nowTime >= checkoutTime)
  })
}

/** Stays in the house at `at`, sorted by room (night list, "Otelde kalanlar"). */
export const inHouseStays = (stays: readonly StayRoomLike[], at: string): StayRoomLike[] =>
  stays.filter((s) => isInHouse(s, at))
