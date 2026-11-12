// The years the reservation grid scrolls through (G-31, K-46 (1)): back to the hotel's chosen start year or the
// oldest stay, whichever is earlier (last year when neither exists); forward to ten years from now or the year after
// the furthest record, whichever is later. The service reads the records, the grid draws the range.

/** Years ahead of this year the grid always reaches (G-30). */
export const CALENDAR_YEARS_AHEAD = 10
/** Earliest start year the setting accepts (`calendar.startYear`). */
export const CALENDAR_MIN_START_YEAR = 2000

export interface CalendarRangeInput {
  /** The hotel's current year. */
  thisYear: number
  /** Setting `calendar.startYear`; null = not set. */
  startYear: number | null
  /** Year of the oldest stay's first day; null = no stay yet. */
  oldestYear: number | null
  /** Year of the furthest stay or block day; null = none. */
  newestYear: number | null
}

export interface CalendarYears {
  /** First year drawn (from 1 January). */
  firstYear: number
  /** Last year drawn (to 31 December). */
  lastYear: number
}

export function calendarYears(input: CalendarRangeInput): CalendarYears {
  const starts = [input.startYear, input.oldestYear].filter((y): y is number => y !== null)
  const firstYear = starts.length ? Math.min(...starts) : input.thisYear - 1
  const lastYear = Math.max(
    input.thisYear + CALENDAR_YEARS_AHEAD,
    input.newestYear === null ? -Infinity : input.newestYear + 1
  )
  // A start year after today's (a stay only next year, setting empty) still lets the grid show today.
  return { firstYear: Math.min(firstYear, input.thisYear), lastYear }
}
