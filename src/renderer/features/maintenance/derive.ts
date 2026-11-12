// Bakım view model (G-91, K-34, S-94): maintenance templates with how many days are left to their next due
// (late, soon = within the warning days or a week, ok), and the next due a completion on a given day would give
// (the shared rule nextDueAfterDone: on time keeps the schedule, otherwise counted from the day it was done).
import { diffDays, type LocalDate } from '@shared/date'
import { atTime, datePart, type LocalDateTime } from '@shared/domain/local-datetime'
import { nextDueAfterDone, recurrenceRuleSchema, type RecurrenceRule } from '@shared/domain/task-recurrence'
import type { TemplateDetail } from '../tasks/task-data'

export type ReminderState = 'overdue' | 'soon' | 'ok' | 'none'

/** A maintenance task appears in Görevler a week before it is due (main/notifications, TASK_WINDOW_DAYS). */
export const TASK_LIST_DAYS = 7
const MINUTES_PER_DAY = 24 * 60

export interface ReminderRow {
  template: TemplateDetail
  rule: RecurrenceRule | null
  remindDays: number
  /** Days from today to the next due (negative: late); null when there is no date. */
  daysLeft: number | null
  state: ReminderState
}

export const ruleOf = (t: Pick<TemplateDetail, 'recurrence'>): RecurrenceRule | null => {
  const parsed = recurrenceRuleSchema.safeParse(t.recurrence)
  return parsed.success ? parsed.data : null
}

export function reminderRows(templates: readonly TemplateDetail[], today: LocalDate): ReminderRow[] {
  return templates
    .map((template): ReminderRow => {
      const rule = ruleOf(template)
      const remindDays = Math.round((template.remindMinutesBefore ?? 0) / MINUTES_PER_DAY)
      const next = template.nextDueAt ? datePart(template.nextDueAt as LocalDateTime) : null
      const daysLeft = next ? diffDays(today, next) : null
      const state: ReminderState =
        daysLeft === null
          ? 'none'
          : daysLeft < 0
            ? 'overdue'
            : daysLeft <= Math.max(remindDays, TASK_LIST_DAYS)
              ? 'soon'
              : 'ok'
      return { template, rule, remindDays, daysLeft, state }
    })
    .sort((a, b) => (a.daysLeft ?? Number.MAX_SAFE_INTEGER) - (b.daysLeft ?? Number.MAX_SAFE_INTEGER))
}

/** Next due if the work is done on `doneOn` (interval rules only; null otherwise). */
export function nextDueIfDone(row: ReminderRow, doneOn: LocalDate): LocalDate | null {
  const { rule, template } = row
  if (rule?.kind !== 'interval' || !template.nextDueAt) return null
  const due = template.nextDueAt as LocalDateTime
  const anchor = (template.firstDueAt ?? due) as LocalDateTime
  return datePart(nextDueAfterDone(rule, { dueAt: due, doneAt: atTime(doneOn, rule.time) }, anchor))
}
