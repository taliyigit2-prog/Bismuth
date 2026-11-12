// The "Kendi göreviniz" form's answers (wizard step 8, Ayarlar → Görev önerileri): a title, how often and a time,
// turned into the shared recurrence rule (task-recurrence.ts) the service stores — no rule kind of its own.
// Pure functions (and one focus helper): the form renders this state, the tests drive it without a screen.
import { OWN_TASK_TITLE_MAX, type OwnTaskInput } from '@shared/contract/operations'
import { isLocalTime } from '@shared/domain/local-datetime'
import type { RecurrenceRuleInput } from '@shared/domain/task-recurrence'

export const OWN_TASK_REPEATS = ['daily', 'weekly', 'monthly', 'months', 'yearly'] as const
export type OwnTaskRepeat = (typeof OWN_TASK_REPEATS)[number]

/** Days of the month offered: 1–28 fall in every month; "last day" is day 31 (short months clamp to their end). */
export const MONTH_DAYS = Array.from({ length: 28 }, (_, i) => String(i + 1))
export const LAST_DAY = 'last'
const LAST_DAY_OF_RULE = 31
/** "Birkaç ayda bir": 2 to 24 months (every month is "Her ay", every 12 is close to "Her yıl"). */
export const EVERY_MONTHS_MIN = 2
export const EVERY_MONTHS_MAX = 24
/** Monday first, as the hotel's week reads (0 = Sunday … 6 = Saturday, date.ts). */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const

export interface OwnTaskValues {
  title: string
  repeat: OwnTaskRepeat
  /** weekly: chosen days (0 = Sunday). */
  weekdays: number[]
  /** monthly: "1"…"28" or "last". */
  monthDay: string
  /** months: how many months apart, as typed. */
  everyMonths: string
  /** "HH:MM", 24 hours. */
  time: string
}

export const emptyOwnTask = (): OwnTaskValues => ({
  title: '',
  repeat: 'daily',
  weekdays: [],
  monthDay: '1',
  everyMonths: '3',
  time: '09:00'
})

export type OwnTaskField = 'title' | 'weekdays' | 'everyMonths' | 'time'
export type OwnTaskErrorKey =
  | 'tasks.own.titleRequired'
  | 'tasks.own.titleTooLong'
  | 'tasks.own.weekdaysRequired'
  | 'tasks.own.everyMonthsRange'
  | 'tasks.own.timeInvalid'
export interface OwnTaskError {
  key: OwnTaskErrorKey
  values?: Record<string, number>
}
export type OwnTaskErrors = Partial<Record<OwnTaskField, OwnTaskError>>

/** The rule the answers stand for (checked by `checkOwnTask`). */
export function ownTaskRule(v: OwnTaskValues): RecurrenceRuleInput {
  switch (v.repeat) {
    case 'daily':
      return { kind: 'daily', time: v.time }
    case 'weekly':
      return {
        kind: 'weekly',
        weekdays: WEEK_ORDER.filter((d) => v.weekdays.includes(d)),
        time: v.time
      }
    case 'monthly':
      return {
        kind: 'monthly',
        day: v.monthDay === LAST_DAY ? LAST_DAY_OF_RULE : Number(v.monthDay),
        time: v.time
      }
    case 'months':
      return { kind: 'interval', unit: 'months', every: Number(v.everyMonths.trim()), time: v.time }
    case 'yearly':
      return { kind: 'interval', unit: 'years', every: 1, time: v.time }
  }
}

/** The task to add, or the problems by field (screen order). */
export function checkOwnTask(
  v: OwnTaskValues
): { task: OwnTaskInput; errors: null } | { task: null; errors: OwnTaskErrors } {
  const errors: OwnTaskErrors = {}
  const title = v.title.trim()
  if (!title) errors.title = { key: 'tasks.own.titleRequired' }
  else if (title.length > OWN_TASK_TITLE_MAX)
    errors.title = { key: 'tasks.own.titleTooLong', values: { max: OWN_TASK_TITLE_MAX } }
  if (v.repeat === 'weekly' && v.weekdays.length === 0)
    errors.weekdays = { key: 'tasks.own.weekdaysRequired' }
  if (v.repeat === 'months') {
    const text = v.everyMonths.trim()
    const n = /^\d{1,3}$/.test(text) ? Number(text) : NaN
    if (!(n >= EVERY_MONTHS_MIN && n <= EVERY_MONTHS_MAX))
      errors.everyMonths = {
        key: 'tasks.own.everyMonthsRange',
        values: { min: EVERY_MONTHS_MIN, max: EVERY_MONTHS_MAX }
      }
  }
  if (!isLocalTime(v.time)) errors.time = { key: 'tasks.own.timeInvalid' }
  if (Object.keys(errors).length > 0) return { task: null, errors }
  // The checks above match ownTaskSchema for every rule the form can make (own-task.test.ts holds them together).
  return { task: { title, recurrence: ownTaskRule(v) }, errors: null }
}

/** Element ids of the fields; a failed check focuses the first one with a problem. */
export const ownTaskIds = (prefix: string) =>
  ({
    title: `${prefix}-title`,
    repeat: `${prefix}-repeat`,
    monthDay: `${prefix}-month-day`,
    everyMonths: `${prefix}-every-months`,
    time: `${prefix}-time`,
    weekdays: `${prefix}-weekdays`
  }) as const

const FIELD_ORDER: OwnTaskField[] = ['title', 'everyMonths', 'time', 'weekdays']

/** Moves the focus to the first field with a problem (a weekday button for the days). */
export function focusOwnTaskError(prefix: string, errors: OwnTaskErrors): void {
  const field = FIELD_ORDER.find((f) => errors[f])
  if (!field) return
  const el = document.getElementById(ownTaskIds(prefix)[field])
  const target = field === 'weekdays' ? el?.querySelector<HTMLElement>('button') : el
  target?.focus()
}

/** The patch's fields lose their message as soon as they change (a new repeat drops the old repeat's). */
export function clearErrors(errors: OwnTaskErrors, patch: Partial<OwnTaskValues>): OwnTaskErrors {
  const next = { ...errors }
  if ('title' in patch) delete next.title
  if ('time' in patch) delete next.time
  if ('weekdays' in patch || 'repeat' in patch) delete next.weekdays
  if ('everyMonths' in patch || 'repeat' in patch) delete next.everyMonths
  return next
}
