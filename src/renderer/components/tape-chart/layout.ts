// Pure geometry of the tape chart (faz-03 madde 7, Faz 5 fills it): which day columns a stay or block covers in
// the visible window. A stay covers its nights [checkIn, checkOut); a day-use covers its single day.
import { diffDays, type LocalDate } from '@shared/date'

export interface Span {
  /** First visible column (0 = `from`). */
  start: number
  /** Number of visible columns. */
  span: number
  /** The stay began before / goes on after the window (the bar shows a cut edge). */
  cutStart: boolean
  cutEnd: boolean
}

/** Columns of [first, endExclusive) inside a window of `days` columns from `from`; null when outside. */
export function spanOf(
  from: LocalDate,
  days: number,
  first: LocalDate,
  endExclusive: LocalDate
): Span | null {
  const a = diffDays(from, first)
  const b = diffDays(from, endExclusive)
  if (b <= 0 || a >= days) return null
  const start = Math.max(0, a)
  const end = Math.min(days, b)
  return { start, span: end - start, cutStart: a < 0, cutEnd: b > days }
}

/** Column of `date`, or -1 outside the window. */
export function columnOf(from: LocalDate, days: number, date: LocalDate): number {
  const i = diffDays(from, date)
  return i >= 0 && i < days ? i : -1
}
