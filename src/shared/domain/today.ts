// Today screen rules that are not a service read (G-92, G-93): the legal reminder for the Ministry of Tourism's
// monthly accommodation statistics. The reminder is the seeded task template `legal_tourism_stats` (closeable:
// switching the template off hides it); it shows from the template's day of the month until the legal last day
// and goes away once last month's statistics is marked as reported on the Turizm İstatistiği screen.
import type { LocalDate } from '../date'

/** Seed code of the legal reminder template (src/main/db/seed/tasks.ts). */
export const TOURISM_TEMPLATE_CODE = 'legal_tourism_stats'

/** The ministry's deadline: the statistics of a month is sent by the 10th of the next month (TR rule). */
export const TOURISM_REPORT_LAST_DAY = 10

/** "YYYY-MM" of the month before `day`. */
export function previousPeriod(day: LocalDate): string {
  const y = Number(day.slice(0, 4))
  const m = Number(day.slice(5, 7))
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}

export interface TourismReminder {
  kind: 'tourism'
  /** The month to report ("YYYY-MM"). */
  period: string
  /** Last day to send it (a date of the current month). */
  dueDate: LocalDate
  /** Whole days until the due date (0 = today is the last day), the same count as the Turizm and Ay sonu screens. */
  daysLeft: number
}

/**
 * The day of the month the reminder starts on, from the template (G-93): the due day of a monthly rule minus its
 * "remind before" (seed: due the 10th 23:59, reminded from the 1st 09:00 → 1). A rule without a lead time starts
 * on its own day (the first release: due the 1st → 1). Anything else: the 1st.
 */
export function tourismStartDay(rule: unknown, remindMinutesBefore: number | null | undefined): number {
  const r = rule as { kind?: unknown; day?: unknown; time?: unknown } | null
  if (r?.kind !== 'monthly' || typeof r.day !== 'number') return 1
  const time = typeof r.time === 'string' && /^\d{2}:\d{2}$/.test(r.time) ? r.time : '00:00'
  const dueMinutes = (r.day - 1) * 24 * 60 + Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))
  const start = dueMinutes - Math.max(0, remindMinutesBefore ?? 0)
  return start <= 0 ? 1 : Math.floor(start / (24 * 60)) + 1
}

/**
 * The tourism statistics reminder on `today`, or null. `startDay` is the day the template starts reminding
 * (tourismStartDay; seed: 1);
 * `active` false = the hotel switched the reminder off; `reported` = last month is marked as sent.
 */
export function tourismReminder(
  today: LocalDate,
  opts: { active: boolean; startDay: number; reported: boolean }
): TourismReminder | null {
  if (!opts.active || opts.reported) return null
  const day = Number(today.slice(8, 10))
  const start = Math.min(Math.max(1, opts.startDay), TOURISM_REPORT_LAST_DAY)
  if (day < start || day > TOURISM_REPORT_LAST_DAY) return null
  return {
    kind: 'tourism',
    period: previousPeriod(today),
    dueDate: `${today.slice(0, 8)}${String(TOURISM_REPORT_LAST_DAY).padStart(2, '0')}` as LocalDate,
    daysLeft: TOURISM_REPORT_LAST_DAY - day
  }
}
