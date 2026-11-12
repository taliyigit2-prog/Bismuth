// Dragging a stay on the tape chart (faz-15 madde 12): one axis at a time — down or up to another room (same
// nights), or along the row to other dates (same length). Each is one service call (`booking.changeRoom`,
// `booking.moveDates`) after a confirmation; room and dates together would be two writes that can half succeed, so
// the bar follows the axis the hand moved most. The service decides conflicts, blocks and rights; this only says
// what the drop means and refuses what the service would refuse anyway (a stay already over, the past, a guest in
// the house to other dates).
import { addDays, type LocalDate } from '@shared/date'
import type { GridStayView } from './grid-model'

/** Pixels the pointer moves before a press becomes a drag (a click stays a click). */
export const DRAG_THRESHOLD_PX = 6

export type StayMove =
  | { kind: 'room'; stay: GridStayView; fromRoomId: string; toRoomId: string; row: number }
  | { kind: 'dates'; stay: GridStayView; row: number; days: number; checkIn: LocalDate; checkOut: LocalDate }

/**
 * Which way a stay may go: a planned stay both ways, a stay in the house only to another room (from today on) — and
 * only while it has a night from today on: on the departure day (or after it) there is nothing left to move.
 */
export function canDragStay(
  stay: Pick<GridStayView, 'stayStatus' | 'checkIn' | 'checkOut' | 'dayUse'>,
  today: LocalDate
): { room: boolean; dates: boolean } {
  if (stay.stayStatus === 'planned') return { room: true, dates: true }
  if (stay.stayStatus === 'in_house') {
    const nightsLeft = stay.dayUse ? stay.checkIn >= today : stay.checkOut > today
    return { room: nightsLeft, dates: false }
  }
  return { room: false, dates: false }
}

/**
 * Where a drag of `stay` (in `row`) by (dx, dy) pixels lands: the axis moved most in whole cells wins. Null while
 * the pointer has not left the start (under the threshold or under half a cell) or when the target is not allowed.
 */
export function dropTarget(input: {
  stay: GridStayView
  row: number
  dx: number
  dy: number
  dayPx: number
  rowPx: number
  rooms: readonly { id: string }[]
  today: LocalDate
}): StayMove | null {
  const { stay, row, dx, dy, dayPx, rowPx, rooms, today } = input
  if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return null
  const allowed = canDragStay(stay, today)
  const cols = Math.round(dx / dayPx)
  const rows = Math.round(dy / rowPx)
  const vertical = Math.abs(dy) / rowPx >= Math.abs(dx) / dayPx
  if (vertical) {
    if (!allowed.room || rows === 0) return null
    const target = Math.min(Math.max(0, row + rows), rooms.length - 1)
    const room = rooms[target]
    if (!room || room.id === stay.roomId) return null
    return { kind: 'room', stay, fromRoomId: stay.roomId, toRoomId: room.id, row: target }
  }
  if (!allowed.dates || cols === 0) return null
  const checkIn = addDays(stay.checkIn, cols)
  // A planned stay is not moved into the past.
  if (checkIn < today) return null
  return { kind: 'dates', stay, row, days: cols, checkIn, checkOut: addDays(stay.checkOut, cols) }
}

/** The same move (for re-rendering only when the target changes while the pointer moves). */
export const sameMove = (a: StayMove | null, b: StayMove | null): boolean =>
  a === b ||
  (!!a &&
    !!b &&
    a.stay.id === b.stay.id &&
    a.kind === b.kind &&
    (a.kind === 'room' ? a.toRoomId === (b as typeof a).toRoomId : a.days === (b as typeof a).days))
