// The report frame's choice (G-104): a preset (this month, last month, this year) or a custom inclusive range, and
// what to compare with. Periods themselves are the shared [from, to) rule (src/shared/domain/reports-period.ts).
import { addDays, localDate, type LocalDate } from '@shared/date'
import {
  comparisonPeriod,
  daysIn,
  lastYearDay,
  previousPeriod,
  monthOf,
  presetPeriod,
  type CompareMode,
  type Period,
  type PeriodPreset
} from '@shared/domain/reports-period'

export interface PeriodChoice {
  preset: PeriodPreset
  /** Inclusive custom range. */
  from: LocalDate
  until: LocalDate
  compare: CompareMode
}

export function initialChoice(today: LocalDate): PeriodChoice {
  return {
    preset: 'thisMonth',
    from: localDate(`${monthOf(today)}-01`),
    until: today,
    compare: 'previous'
  }
}

/**
 * The period shown. "Bu ay" and "Bu yıl" run up to today (money not taken yet is not revenue, and a comparison of a
 * half month with a whole one would read as a fall); a custom range is taken as typed.
 */
export function periodOf(c: PeriodChoice, today: LocalDate): Period {
  if (c.preset !== 'custom') {
    const p = presetPeriod(c.preset, today)
    const end = addDays(today, 1)
    return p.to > end ? { from: p.from, to: end } : p
  }
  const [a, b] = c.from <= c.until ? [c.from, c.until] : [c.until, c.from]
  return { from: a, to: addDays(b, 1) }
}

/** What the period is compared with: the same days of the previous month/year, or the same dates a year ago. */
export function compareOf(c: PeriodChoice, today: LocalDate): Period | null {
  const p = periodOf(c, today)
  if (c.compare === 'none') return null
  if (c.compare === 'lastYear' || c.preset === 'custom') return comparisonPeriod(p, c.compare)
  const full = presetPeriod(c.preset, today)
  const prev = previousPeriod(full)
  if (p.to === full.to) return prev
  // "Bu yıl" up to today: up to the same month and day a year ago (a leap year does not shift it by a day);
  // "Bu ay": the same number of days of the month before (never past its end).
  const to = c.preset === 'thisYear' ? addDays(lastYearDay(lastDay(p)), 1) : addDays(prev.from, daysIn(p))
  return { from: prev.from, to: to < prev.to ? to : prev.to }
}

/** Inclusive last day of a period (for "1 Eylül – 30 Eylül"). */
export const lastDay = (p: Period): LocalDate => addDays(p.to, -1)

/** Years offered by the yearly and staff reports: from the first data year to this year. */
export function yearsBetween(firstDay: LocalDate | null, today: LocalDate): number[] {
  const last = Number(today.slice(0, 4))
  const first = firstDay ? Math.min(Number(firstDay.slice(0, 4)), last) : last
  return Array.from({ length: last - first + 1 }, (_, i) => last - i)
}

/** Months offered by the month-end check, newest first: from the first data month to this month. */
export function monthsBetween(firstDay: LocalDate | null, today: LocalDate): string[] {
  const out: string[] = []
  const first = firstDay && firstDay < today ? monthOf(firstDay) : monthOf(today)
  for (let m = monthOf(today); m >= first;) {
    out.push(m)
    const [y, mm] = m.split('-').map(Number) as [number, number]
    m = mm === 1 ? `${y - 1}-12` : `${y}-${String(mm - 1).padStart(2, '0')}`
  }
  return out
}
