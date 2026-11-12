// The hotel's shift layout (shift_definitions, a setting — G-95; Pandora: Gündüz 09:00–21:00, Gece 21:00–09:00):
// which shift is on duty at a wall-clock time and which one takes over. Another hotel has 3 × 8 hours or one shift.
import type { ShiftView } from '../tasks/task-data'

const minutes = (hhmm: string): number => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))

/** A shift whose end is not after its start runs past midnight; start = end covers the whole day. */
export function covers(s: Pick<ShiftView, 'startTime' | 'endTime'>, clock: string): boolean {
  const t = minutes(clock)
  const start = minutes(s.startTime)
  const end = minutes(s.endTime)
  if (start === end) return true
  return start < end ? t >= start && t < end : t >= start || t < end
}

/** The shift on duty at a wall-clock "HH:MM" (the first one by order when the layout leaves a gap). */
export function shiftAt(shifts: readonly ShiftView[], clock: string): ShiftView | undefined {
  return shifts.find((s) => covers(s, clock)) ?? shifts[0]
}

/** The shift that takes over from `id` (the layout is a cycle); none when there is only one shift. */
export function nextShift(shifts: readonly ShiftView[], id: string): ShiftView | undefined {
  const i = shifts.findIndex((s) => s.id === id)
  if (i < 0 || shifts.length < 2) return undefined
  return shifts[(i + 1) % shifts.length]
}
