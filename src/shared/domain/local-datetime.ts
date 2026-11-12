// LocalDateTime = "YYYY-MM-DDTHH:MM" hotel-local wall-clock minute (task due times, reminders; G-94, K-34).
// Same idea as LocalDate (src/shared/date.ts): no time zone; arithmetic runs on UTC so a DST change never
// moves a due time or a reminder. Also holds the month helpers the domain rules share (clamped month steps).
import { addDays, hotelParts, isLocalDate, type LocalDate } from '../date'

export type LocalDateTime = string & { readonly __brand: 'LocalDateTime' }

/** "HH:MM", 00:00–23:59. */
export const LOCAL_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/

const DATE_TIME_PATTERN = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/

export function isLocalTime(value: unknown): value is string {
  return typeof value === 'string' && LOCAL_TIME_PATTERN.test(value)
}

export function isLocalDateTime(value: unknown): value is LocalDateTime {
  if (typeof value !== 'string') return false
  const m = DATE_TIME_PATTERN.exec(value)
  return m !== null && isLocalDate(m[1]) && isLocalTime(m[2])
}

export function localDateTime(value: string): LocalDateTime {
  if (!isLocalDateTime(value)) throw new RangeError(`datetime: invalid local date-time "${value}"`)
  return value
}

/** `date` at wall-clock `time` ("HH:MM"). */
export function atTime(date: LocalDate, time: string): LocalDateTime {
  if (!isLocalTime(time)) throw new RangeError(`datetime: invalid time "${time}"`)
  return `${date}T${time}` as LocalDateTime
}

export const datePart = (dt: LocalDateTime): LocalDate => dt.slice(0, 10) as LocalDate
export const timePart = (dt: LocalDateTime): string => dt.slice(11, 16)

/** The minute of `d` in the hotel's time zone (setHotelTimeZone; machine zone until a zone is set). */
export function localDateTimeOf(d: Date): LocalDateTime {
  const p = hotelParts(d)
  return `${p.y}-${p.mo}-${p.d}T${p.h}:${p.mi}` as LocalDateTime
}

export function addMinutes(dt: LocalDateTime, minutes: number): LocalDateTime {
  if (!Number.isSafeInteger(minutes)) throw new RangeError('datetime: minutes must be an integer')
  const t = Date.parse(`${dt}:00Z`) + minutes * 60_000
  return new Date(t).toISOString().slice(0, 16) as LocalDateTime
}

/** Fixed-width strings: plain comparison is chronological. */
export function compareLocalDateTime(a: LocalDateTime, b: LocalDateTime): -1 | 0 | 1 {
  return a < b ? -1 : a > b ? 1 : 0
}

function checkMonth(year: number, month: number): void {
  if (!Number.isInteger(year) || year < 1 || year > 9999) throw new RangeError(`date: invalid year ${year}`)
  if (!Number.isInteger(month) || month < 1 || month > 12)
    throw new RangeError(`date: invalid month ${month}`)
}

/** Days in `month` (1–12) of `year`; leap years included (2028-02 → 29). */
export function daysInMonth(year: number, month: number): number {
  checkMonth(year, month)
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function yearMonthOf(date: LocalDate): { year: number; month: number } {
  return { year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) }
}

export const dayOfMonth = (date: LocalDate): number => Number(date.slice(8, 10))

/** Day `day` of the month, or the month's last day when the month is shorter (31 → 30 / 28 / 29). */
export function clampedDate(year: number, month: number, day: number): LocalDate {
  const last = daysInMonth(year, month)
  if (!Number.isInteger(day) || day < 1) throw new RangeError(`date: invalid day ${day}`)
  const d = Math.min(day, last)
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}` as LocalDate
}

/**
 * `date` moved by whole months, keeping `anchorDay` (default: the day of `date`) or the target month's last
 * day when it has fewer days. Passing the series' original day keeps 31 → 28 → 31 → 30 instead of drifting.
 */
export function addMonthsClamped(
  date: LocalDate,
  months: number,
  anchorDay: number = dayOfMonth(date)
): LocalDate {
  if (!Number.isSafeInteger(months)) throw new RangeError('date: months must be an integer')
  const { year, month } = yearMonthOf(date)
  const index = year * 12 + (month - 1) + months
  return clampedDate(Math.floor(index / 12), (index % 12) + 1, anchorDay)
}

/** True when `date` lies in `month` (1–12) of `year`. */
export function isInMonth(date: LocalDate, year: number, month: number): boolean {
  checkMonth(year, month)
  const ym = yearMonthOf(date)
  return ym.year === year && ym.month === month
}

/** First day of the month and first day of the next month: the month as a half-open range [start, end). */
export function monthRange(year: number, month: number): { start: LocalDate; end: LocalDate } {
  const start = clampedDate(year, month, 1)
  return { start, end: addDays(start, daysInMonth(year, month)) }
}
