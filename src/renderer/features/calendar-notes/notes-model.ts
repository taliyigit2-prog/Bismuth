// Pure helpers of the calendar notes screen (G-16, G-40): how many days a note will cover before it is saved,
// which filter a day belongs to, and the year's days grouped by month.
import type { CalendarEntryDto } from '@shared/contract/procedures/today'
import { addDays, diffDays, weekday, type LocalDate } from '@shared/date'

export const NOTE_MODES = ['single', 'range', 'weekdays', 'list'] as const
export type NoteMode = (typeof NOTE_MODES)[number]

export const NOTE_KINDS = ['note', 'special', 'event', 'holiday', 'half_holiday'] as const
export type NoteKind = (typeof NOTE_KINDS)[number]

export const FILTERS = ['all', 'holidays', 'special', 'notes'] as const
export type Filter = (typeof FILTERS)[number]

/** Days a note target covers (the service writes the same days; `to` is inclusive). */
export function countDays(
  mode: NoteMode,
  from: LocalDate,
  to: LocalDate,
  weekdays: readonly number[],
  pasted: readonly string[]
): number {
  if (mode === 'single') return 1
  if (mode === 'list') return pasted.length
  const span = diffDays(from, to) + 1
  if (span <= 0) return 0
  if (mode === 'range') return span
  let n = 0
  for (let i = 0; i < span; i++) if (weekdays.includes(weekday(addDays(from, i)))) n++
  return n
}

export function inFilter(day: Pick<CalendarEntryDto, 'kind'>, filter: Filter): boolean {
  switch (filter) {
    case 'all':
      return true
    case 'holidays':
      return day.kind === 'holiday' || day.kind === 'half_holiday'
    case 'special':
      return day.kind === 'special'
    case 'notes':
      return day.kind === 'note' || day.kind === 'event'
  }
}

/** A holiday the rule engine made that a person changed (kept by regeneration, K-04). */
export const isEditedHoliday = (d: Pick<CalendarEntryDto, 'source' | 'generatedYear'>): boolean =>
  d.source === 'user' && d.generatedYear !== null

/** "YYYY-MM" → its days, in date order (the list arrives sorted by the service). */
export function byMonth(days: readonly CalendarEntryDto[]): [string, CalendarEntryDto[]][] {
  const out = new Map<string, CalendarEntryDto[]>()
  for (const d of days) {
    const key = d.occurrenceDate.slice(0, 7)
    const list = out.get(key)
    if (list) list.push(d)
    else out.set(key, [d])
  }
  return [...out.entries()]
}

/** How many live days of the same bulk note are in `days` (for "cancel all N days"). */
export const groupSize = (days: readonly CalendarEntryDto[], groupKey: string | null): number =>
  groupKey ? days.filter((d) => d.groupKey === groupKey && !d.repeated).length : 0
