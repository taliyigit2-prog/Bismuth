// The seven-day view's model (faz-13 madde 6): pure, unit-tested.
import { addDays, type LocalDate } from '@shared/date'
import { dayActivity, type GridPage } from '@/features/calendar/grid-model'

export const WEEK_DAYS = 7

/** The seven days from `start`, each with its arrivals, departures and free rooms. */
export function weekOf(page: GridPage, start: LocalDate) {
  return Array.from({ length: WEEK_DAYS }, (_, i) => {
    const day = addDays(start, i)
    return { day, ...dayActivity(page, day) }
  })
}
