// Task recurrence (G-91, G-93, G-94, K-34, S-94; 03-mimari.md §4.8 task_templates/tasks, §6.8, §6.17).
// A template's rule (task_templates.recurrence_json) turns into dated tasks; the materializer is idempotent
// because tasks carry UNIQUE(template_id, due_at) and the plan below skips keys that already exist.
// Due times are LocalDateTime ("YYYY-MM-DDTHH:MM", hotel wall clock); ranges are half-open [from, to).
import * as z from 'zod'
import { addDays, weekday, type LocalDate } from '../date'
import {
  addMinutes,
  addMonthsClamped,
  atTime,
  clampedDate,
  dayOfMonth,
  datePart,
  daysInMonth,
  LOCAL_TIME_PATTERN,
  yearMonthOf,
  type LocalDateTime
} from './local-datetime'

const timeSchema = z.string().regex(LOCAL_TIME_PATTERN, 'HH:MM')

/** Code of the seeded "derin temizlik" template (S-94); other every-N-stays templates are the hotel's own. */
export const DEEP_CLEAN_TEMPLATE_CODE = 'deep_clean_every_n'

/** S-94: deep clean every 10 checked-out stays per room unless the template says otherwise. */
export const EVERY_N_STAYS_DEFAULT = 10

/** Largest "every N stays" and "every N days / months / years" a form may write (Görevler and Bakım alike). */
export const EVERY_N_STAYS_MAX = 500
export const INTERVAL_EVERY_MAX = 999

/** The numbers of a rule as a form may write them (one source for the forms' limits and messages). */
export const everyNStaysSchema = z.int().min(1).max(EVERY_N_STAYS_MAX)
export const intervalEverySchema = z.int().min(1).max(INTERVAL_EVERY_MAX)
export const monthDaySchema = z.int().min(1).max(31)

// `bounded`: the contract's input (new and edited rules); stored rules are read without the upper bounds so a row
// written before them still materializes.
const ruleSchema = (bounded: boolean) =>
  z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('none') }),
    z.object({ kind: z.literal('daily'), time: timeSchema }),
    z.object({
      kind: z.literal('weekly'),
      // 0 = Sunday … 6 = Saturday (same as date.ts weekday()).
      weekdays: z
        .array(z.int().min(0).max(6))
        .min(1)
        .refine((days) => new Set(days).size === days.length, 'weekdays must be unique'),
      time: timeSchema
    }),
    // Day beyond the month's length falls on the month's last day (31 → 30 / 28 / 29).
    z.object({ kind: z.literal('monthly'), day: monthDaySchema, time: timeSchema }),
    // Maintenance reminders: next due counted from the last completion (see nextDueAfterDone).
    z.object({
      kind: z.literal('interval'),
      unit: z.enum(['days', 'months', 'years']),
      every: bounded ? intervalEverySchema : z.int().positive(),
      time: timeSchema
    }),
    // Per room: opens a task once a room has n checked-out stays since its last "done".
    z.object({
      kind: z.literal('everyNStays'),
      n: (bounded ? everyNStaysSchema : z.int().positive()).default(EVERY_N_STAYS_DEFAULT),
      countDayUse: z.boolean().default(true)
    })
  ])

/** A stored rule (task_templates.recurrence_json). */
export const recurrenceRuleSchema = ruleSchema(false)
/** A rule as the contract accepts it: the same kinds with upper bounds on N. */
export const recurrenceRuleInputSchema = ruleSchema(true)

export type RecurrenceRule = z.infer<typeof recurrenceRuleSchema>
export type RecurrenceRuleInput = z.input<typeof recurrenceRuleSchema>
export type RecurrenceKind = RecurrenceRule['kind']
export type IntervalRule = Extract<RecurrenceRule, { kind: 'interval' }>
export type EveryNStaysRule = Extract<RecurrenceRule, { kind: 'everyNStays' }>

export const TASK_STATUSES = ['open', 'done', 'cancelled'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

/** Runaway guard for occurrence scans (a daily rule over ~270 years). */
const MAX_STEPS = 100_000

function intervalStep(
  rule: IntervalRule,
  after: LocalDateTime,
  anchor: LocalDateTime | undefined
): LocalDateTime {
  const base = datePart(after)
  if (rule.unit === 'days') return atTime(addDays(base, rule.every), rule.time)
  const months = rule.unit === 'months' ? rule.every : rule.every * 12
  const own = dayOfMonth(base)
  const anchorDay = anchor === undefined ? own : dayOfMonth(datePart(anchor))
  // `after` on the anchor's day (or the month's last day standing in for it) is on schedule and keeps the
  // anchor day: 31 → 28 → 31 → 30. Any other day (an off-schedule completion) counts from its own day.
  const { year, month } = yearMonthOf(base)
  const onSchedule = own === Math.min(anchorDay, daysInMonth(year, month))
  return atTime(addMonthsClamped(base, months, onSchedule ? anchorDay : own), rule.time)
}

/**
 * The next due time strictly after `after`.
 * - daily / weekly / monthly: the rule's next slot on the calendar (`anchor` ignored).
 * - interval: `after` + `every` units at the rule's time. Months/years keep the day of `anchor` (the
 *   series' first due; default `after`) while `after` sits on that day or on the month's last day standing
 *   in for it (anchor Jan 31: 31 → 28 → 31 → 30), otherwise the day of `after`; short months clamp.
 * - none / everyNStays: null (single task, or opened by checkouts instead of the clock).
 */
export function nextDue(
  rule: RecurrenceRule,
  after: LocalDateTime,
  anchor?: LocalDateTime
): LocalDateTime | null {
  switch (rule.kind) {
    case 'none':
    case 'everyNStays':
      return null
    case 'daily': {
      const same = atTime(datePart(after), rule.time)
      return same > after ? same : atTime(addDays(datePart(after), 1), rule.time)
    }
    case 'weekly': {
      const days = new Set(rule.weekdays)
      for (let i = 0; i <= 7; i++) {
        const d = addDays(datePart(after), i)
        if (!days.has(weekday(d))) continue
        const candidate = atTime(d, rule.time)
        if (candidate > after) return candidate
      }
      return null
    }
    case 'monthly': {
      const { year, month } = yearMonthOf(datePart(after))
      const same = atTime(clampedDate(year, month, rule.day), rule.time)
      if (same > after) return same
      const nextMonth = addMonthsClamped(clampedDate(year, month, 1), 1)
      const ym = yearMonthOf(nextMonth)
      return atTime(clampedDate(ym.year, ym.month, rule.day), rule.time)
    }
    case 'interval':
      return intervalStep(rule, after, anchor)
  }
}

export interface ClosedTask {
  readonly dueAt: LocalDateTime
  readonly doneAt: LocalDateTime
}

/**
 * Next due of an interval series after its task was done (K-34 "counted from the last completion"):
 * done on its due day → counted from the due (the series stays on schedule); done on another day →
 * counted from the completion day. The result always lies after the closed task's due: a completion so early
 * that counting from it would land on (or before) that due — "Yapıldı" twice on one day, a 7-day check done
 * 7 days early — counts from the due instead, so the series never stops. `anchor` is the template's first due
 * and never changes.
 */
export function nextDueAfterDone(rule: IntervalRule, task: ClosedTask, anchor: LocalDateTime): LocalDateTime {
  const onTime = datePart(task.doneAt) === datePart(task.dueAt)
  if (onTime) return intervalStep(rule, task.dueAt, anchor)
  const fromDone = intervalStep(rule, task.doneAt, anchor)
  return datePart(fromDone) > datePart(task.dueAt) ? fromDone : intervalStep(rule, task.dueAt, anchor)
}

/**
 * Due times of a rule in [from, to), never before `firstDue`, ascending.
 * daily/weekly/monthly: calendar slots at or after `firstDue`. interval: the projected series firstDue,
 * nextDue(…, anchor = firstDue), … (assumes on-time completion). none: `firstDue` when inside the range.
 * everyNStays: [] (checkouts open those tasks).
 */
export function occurrencesBetween(
  rule: RecurrenceRule,
  firstDue: LocalDateTime,
  from: LocalDateTime,
  to: LocalDateTime
): LocalDateTime[] {
  if (from >= to) return []
  const out: LocalDateTime[] = []
  switch (rule.kind) {
    case 'everyNStays':
      return out
    case 'none':
      if (from <= firstDue && firstDue < to) out.push(firstDue)
      return out
    case 'interval': {
      let t = firstDue
      for (let steps = 0; t < to; steps++) {
        if (steps > MAX_STEPS) throw new RangeError('recurrence: range too long')
        if (t >= from) out.push(t)
        t = intervalStep(rule, t, firstDue)
      }
      return out
    }
    case 'daily':
    case 'weekly':
    case 'monthly': {
      const start = firstDue > from ? firstDue : from
      let t = nextDue(rule, addMinutes(start, -1))
      for (let steps = 0; t !== null && t < to; steps++) {
        if (steps > MAX_STEPS) throw new RangeError('recurrence: range too long')
        out.push(t)
        t = nextDue(rule, t)
      }
      return out
    }
  }
}

/** Reminder time: `remindMinutesBefore` minutes before the due time (3 days = 4320). */
export function remindAt(due: LocalDateTime, remindMinutesBefore: number | null | undefined): LocalDateTime {
  const minutes = remindMinutesBefore ?? 0
  if (!Number.isSafeInteger(minutes) || minutes < 0)
    throw new RangeError('recurrence: remindMinutesBefore must be a non-negative integer')
  return addMinutes(due, -minutes)
}

/** An open task whose due time has passed (a task due exactly now is not late yet). */
export function isOverdue(
  task: { readonly status: TaskStatus; readonly dueAt: LocalDateTime | null },
  now: LocalDateTime
): boolean {
  return task.status === 'open' && task.dueAt !== null && task.dueAt < now
}

// ---- every N stays (S-94) ----

export interface RoomCheckout {
  readonly roomId: string
  readonly checkOut: LocalDate
  readonly kind: 'overnight' | 'day_use'
}

/**
 * Checked-out stays after `lastDoneAt` (a checkout on the day the task was done counts as covered by it).
 * `lastDoneAt` null → every checkout counts; pass the template's start date for rooms never done, so a new
 * template does not open a task in every room at once. `roomId` narrows to one room.
 */
export function staysSinceLastDone(
  checkouts: readonly RoomCheckout[],
  lastDoneAt: LocalDate | null,
  rule: EveryNStaysRule,
  roomId?: string
): number {
  let count = 0
  for (const c of checkouts) {
    if (roomId !== undefined && c.roomId !== roomId) continue
    if (lastDoneAt !== null && c.checkOut <= lastDoneAt) continue
    if (c.kind === 'day_use' && !rule.countDayUse) continue
    count++
  }
  return count
}

export function shouldOpenEveryNStays(
  checkouts: readonly RoomCheckout[],
  lastDoneAt: LocalDate | null,
  rule: EveryNStaysRule,
  roomId?: string
): boolean {
  return staysSinceLastDone(checkouts, lastDoneAt, rule, roomId) >= rule.n
}

/** Rooms whose count reached n, sorted; rooms missing from `lastDoneByRoom` count from `defaultLastDone`. */
export function roomsDueEveryNStays(
  checkouts: readonly RoomCheckout[],
  lastDoneByRoom: ReadonlyMap<string, LocalDate | null>,
  rule: EveryNStaysRule,
  defaultLastDone: LocalDate | null = null
): string[] {
  const rooms = [...new Set(checkouts.map((c) => c.roomId))].sort()
  return rooms.filter((roomId) =>
    shouldOpenEveryNStays(checkouts, lastDoneByRoom.get(roomId) ?? defaultLastDone, rule, roomId)
  )
}

// ---- materializer plan ----

export interface TaskTemplatePlanInput {
  readonly id: string
  readonly rule: RecurrenceRule
  /** task_templates.first_due_at: start of the series; for interval also its anchor. */
  readonly firstDue: LocalDateTime
  readonly active: boolean
  /** Occurrences before this were already materialized (narrows daily/weekly/monthly scans only). */
  readonly lastMaterializedUntil?: LocalDateTime | null
  /**
   * interval only: the template's latest closed task; the series' current due follows it
   * (nextDueAfterDone). To skip a cancelled occurrence pass it with doneAt = dueAt.
   */
  readonly lastDone?: ClosedTask | null
}

export interface PlannedTask {
  readonly templateId: string
  readonly dueAt: LocalDateTime
}

/** The key the `existing` set uses; mirrors UNIQUE(template_id, due_at). */
export const taskKey = (templateId: string, dueAt: LocalDateTime): string => `${templateId}|${dueAt}`

/**
 * Tasks to create for [from, to): every occurrence whose key is not in `existing`, sorted by due time then
 * template id. Running it again with the created keys added yields nothing (idempotent).
 * none / interval templates have one task at a time: the current due (firstDue, or for interval the
 * successor of `lastDone`) is planned whenever it is before `to`, even if already past (an overdue
 * maintenance must still appear), so `existing` must hold those templates' keys whatever their date.
 * everyNStays templates are opened by checkouts, not here.
 */
export function materializePlan(
  templates: readonly TaskTemplatePlanInput[],
  existing: ReadonlySet<string>,
  from: LocalDateTime,
  to: LocalDateTime
): PlannedTask[] {
  const seen = new Set<string>()
  const out: PlannedTask[] = []
  for (const template of templates) {
    if (!template.active) continue
    let dues: LocalDateTime[]
    if (template.rule.kind === 'none' || template.rule.kind === 'interval') {
      const last = template.lastDone
      const current =
        template.rule.kind === 'interval' && last
          ? nextDueAfterDone(template.rule, last, template.firstDue)
          : template.firstDue
      dues = current < to ? [current] : []
    } else {
      const done = template.lastMaterializedUntil
      dues = occurrencesBetween(template.rule, template.firstDue, done && done > from ? done : from, to)
    }
    for (const dueAt of dues) {
      const key = taskKey(template.id, dueAt)
      if (existing.has(key) || seen.has(key)) continue
      seen.add(key)
      out.push({ templateId: template.id, dueAt })
    }
  }
  return out.sort((a, b) =>
    a.dueAt !== b.dueAt
      ? a.dueAt < b.dueAt
        ? -1
        : 1
      : a.templateId < b.templateId
        ? -1
        : a.templateId > b.templateId
          ? 1
          : 0
  )
}
