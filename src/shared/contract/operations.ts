// Daily operations inputs: calendar days and notes, tasks and templates, shifts, handovers, notes, lost items,
// status tags (03-mimari.md §4.8, §6.7, §6.8, §6.14–§6.17; G-16, G-32, G-55, G-91…G-95, K-04, K-34).
import * as z from 'zod'
import { isLocalDate } from '../date'
import { recurrenceRuleInputSchema } from '../domain/task-recurrence'
import { isLocalDateTime } from '../domain/local-datetime'
import { idSchema, localDateSchema } from './rooms'
import { clockTime, hexColor } from './settings'
import { TEXT_MAX } from './text'

/** "YYYY-MM-DD" that is a real calendar day. */
export const calendarDateSchema = localDateSchema.refine(isLocalDate, 'invalid date')
/** Hotel wall-clock minute "YYYY-MM-DDTHH:MM" (task due times; local-datetime.ts). */
export const localDateTimeSchema = z.string().refine(isLocalDateTime, 'YYYY-MM-DDTHH:MM')
/** A day or a minute: "YYYY-MM-DD" is read as that day's 00:00. */
export const localDateOrDateTimeSchema = z
  .string()
  .refine((v) => isLocalDate(v) || isLocalDateTime(v), 'YYYY-MM-DD or YYYY-MM-DDTHH:MM')
  .transform((v) => (isLocalDate(v) ? `${v}T00:00` : v))

const optionalText = (max: number) => z.string().trim().max(max).nullish()

// ---- calendar (K-04, §6.7) ----

export const CALENDAR_DAY_KINDS = ['holiday', 'half_holiday', 'special', 'note', 'event'] as const
export const calendarDayKindSchema = z.enum(CALENDAR_DAY_KINDS)

/** Most rows one bulk note may create (ten years of one weekday is ~520). */
export const CALENDAR_BULK_MAX = 1000
/** Widest range `calendar.listRange` accepts (the years it touches are generated on the fly). */
export const CALENDAR_RANGE_MAX_DAYS = 3700

const rangeRefine = <T extends { from: string; to: string }>(r: T): boolean => r.to >= r.from

/**
 * Which days a note covers. `range` and `weekdays` take an inclusive `to` (the last day, as a date-range picker
 * gives it); `weekdays` keeps only the listed weekdays (0 = Sunday … 6 = Saturday: "her cumartesi" = [6]).
 */
export const calendarNoteTargetSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('single'), date: calendarDateSchema }),
  z
    .object({ mode: z.literal('range'), from: calendarDateSchema, to: calendarDateSchema })
    .refine(rangeRefine, { path: ['to'], message: 'to must not be before from' }),
  z
    .object({
      mode: z.literal('weekdays'),
      from: calendarDateSchema,
      to: calendarDateSchema,
      weekdays: z
        .array(z.int().min(0).max(6))
        .min(1)
        .max(7)
        .refine((d) => new Set(d).size === d.length, 'weekdays must be unique')
    })
    .refine(rangeRefine, { path: ['to'], message: 'to must not be before from' }),
  /** A pasted list (parsePastedDates turns text into this). */
  z.object({ mode: z.literal('list'), dates: z.array(calendarDateSchema).min(1).max(CALENDAR_BULK_MAX) })
])
export type CalendarNoteTarget = z.input<typeof calendarNoteTargetSchema>

export const calendarNoteInputSchema = z.object({
  kind: calendarDayKindSchema.default('note'),
  title: z.string().trim().min(1).max(120),
  note: optionalText(2000),
  color: hexColor.nullish(),
  /** Shown on the same month/day every later year (29 Feb → 28 Feb in common years). */
  recurringYearly: z.boolean().default(false),
  target: calendarNoteTargetSchema
})
export type CalendarNoteInput = z.input<typeof calendarNoteInputSchema>

export const calendarDayEditSchema = z
  .object({
    kind: calendarDayKindSchema,
    title: z.string().trim().min(1).max(120),
    note: optionalText(2000),
    color: hexColor.nullable(),
    recurringYearly: z.boolean(),
    date: calendarDateSchema
  })
  .partial()
  .refine((p) => Object.keys(p).length > 0, { message: 'empty patch' })
export type CalendarDayEdit = z.input<typeof calendarDayEditSchema>

export const calendarRangeSchema = z
  .object({ from: calendarDateSchema, to: calendarDateSchema })
  .refine((r) => r.to > r.from, { path: ['to'], message: 'to must be after from' })
  .refine((r) => Date.parse(r.to) - Date.parse(r.from) <= CALENDAR_RANGE_MAX_DAYS * 86_400_000, {
    path: ['to'],
    message: 'range too long'
  })

export const calendarYearSchema = z.int().min(1900).max(9998)

const DMY = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/

/**
 * Pasted dates ("2026-05-01, 02.05.2026; 3/5/2026" — ISO or day.month.year, any of , ; whitespace between)
 * → sorted unique LocalDates plus the pieces that are not dates (shown back to the user).
 */
export function parsePastedDates(text: string): { dates: string[]; invalid: string[] } {
  const dates = new Set<string>()
  const invalid: string[] = []
  for (const piece of text.split(/[\s,;]+/)) {
    if (!piece) continue
    const m = DMY.exec(piece)
    const iso = m ? `${m[3]}-${(m[2] ?? '').padStart(2, '0')}-${(m[1] ?? '').padStart(2, '0')}` : piece
    if (isLocalDate(iso)) dates.add(iso)
    else invalid.push(piece)
  }
  return { dates: [...dates].sort(), invalid }
}

// ---- tasks and templates (K-34, §6.8, §6.17) ----

const assigneeShape = {
  assigneeUserId: idSchema.nullish(),
  assigneeRoleId: idSchema.nullish(),
  assigneeShiftId: idSchema.nullish()
}

const taskKind = z.enum(['general', 'maintenance', 'legal'])

// Default-free fields: the update schema is their `.partial()` (zod keeps `.default()` inside `.partial()`,
// which would turn a maintenance template into a general one when only its title changes).
const taskTemplateFields = z.object({
  title: z.string().trim().min(1).max(160),
  description: optionalText(2000),
  kind: taskKind,
  ...assigneeShape,
  roomId: idSchema.nullish(),
  recurrence: recurrenceRuleInputSchema,
  /** Start of the series (interval: also its anchor). Empty → filled when the template is activated. */
  firstDueAt: localDateOrDateTimeSchema.nullish(),
  /** 3 days before = 4320. */
  remindMinutesBefore: z.int().min(0).max(525_600).nullish()
})

export const taskTemplateInputSchema = taskTemplateFields.extend({
  kind: taskKind.default('general'),
  active: z.boolean().default(true)
})
export type TaskTemplateInput = z.input<typeof taskTemplateInputSchema>

export const taskTemplateUpdateSchema = taskTemplateFields
  .partial()
  .refine((p) => Object.keys(p).length > 0, { message: 'empty patch' })
export type TaskTemplateUpdate = z.input<typeof taskTemplateUpdateSchema>

export const taskTemplateActivateSchema = z.object({ firstDueAt: localDateOrDateTimeSchema.nullish() })
export type TaskTemplateActivate = z.input<typeof taskTemplateActivateSchema>

/** Longest name of a task the hotel types in itself (wizard step 8, Ayarlar → Görev önerileri). */
export const OWN_TASK_TITLE_MAX = 120
/** Most own tasks the wizard takes in one go. */
export const OWN_TASKS_MAX = 50
/** Repeats the own-task form offers: every day, chosen weekdays, a day of the month, every N months / years. */
const OWN_TASK_RULES: ReadonlySet<string> = new Set(['daily', 'weekly', 'monthly', 'interval'])

/**
 * A repeating task the hotel adds in its own words: a title and a rule with a time. It becomes an active
 * template (kind general); the Görevler screen (Faz 9) adds the assignee, room and first due on top of it.
 */
export const ownTaskSchema = z.object({
  title: z.string().trim().min(1).max(OWN_TASK_TITLE_MAX),
  recurrence: recurrenceRuleInputSchema.refine((rule) => OWN_TASK_RULES.has(rule.kind), 'repeat with a time')
})
export type OwnTaskInput = z.input<typeof ownTaskSchema>

export const taskInputSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: optionalText(2000),
  ...assigneeShape,
  roomId: idSchema.nullish(),
  dueAt: localDateOrDateTimeSchema.nullish(),
  note: optionalText(1000)
})
export type TaskInput = z.input<typeof taskInputSchema>

export const materializeRangeSchema = z
  .object({ from: localDateOrDateTimeSchema, to: localDateOrDateTimeSchema })
  .refine((r) => r.to > r.from, { path: ['to'], message: 'to must be after from' })

export const TASK_LIST_STATUSES = ['open', 'done', 'cancelled'] as const
export const taskListFilterSchema = z.object({
  status: z.array(z.enum(TASK_LIST_STATUSES)).min(1).optional(),
  /** Due in [dueFrom, dueTo); tasks without a due time are kept unless `withDueOnly`. */
  dueFrom: localDateOrDateTimeSchema.optional(),
  dueTo: localDateOrDateTimeSchema.optional(),
  withDueOnly: z.boolean().optional(),
  roomId: idSchema.optional(),
  templateId: idSchema.optional()
})
export type TaskListFilter = z.input<typeof taskListFilterSchema>

export const taskCancelSchema = z.object({ reason: z.string().trim().min(1).max(500) })
export const taskDoneSchema = z.object({ note: optionalText(1000) })

// ---- shifts, handovers, notes (G-95, §6.16) ----

export const shiftInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  startTime: clockTime,
  /** Before startTime = the shift ends the next day (Gece 21:00–09:00). */
  endTime: clockTime,
  sort: z.int().optional(),
  active: z.boolean().optional()
})
export type ShiftInput = z.input<typeof shiftInputSchema>

export const shiftUpdateSchema = shiftInputSchema
  .partial()
  .refine((p) => Object.keys(p).length > 0, { message: 'empty patch' })
export type ShiftUpdate = z.input<typeof shiftUpdateSchema>

export const handoverInputSchema = z.object({
  fromShiftId: idSchema.nullish(),
  toShiftId: idSchema.nullish(),
  text: optionalText(TEXT_MAX.long)
})
export type HandoverInput = z.input<typeof handoverInputSchema>

export const noteInputSchema = z.object({
  /** personal: only the writer ever reads it (§4.9-12); board: everyone with shift notes. */
  kind: z.enum(['personal', 'board']),
  text: z.string().trim().min(1).max(TEXT_MAX.long),
  remindAt: localDateTimeSchema.nullish(),
  pinned: z.boolean().default(false)
})
export type NoteInput = z.input<typeof noteInputSchema>

export const noteUpdateSchema = z
  .object({ text: z.string().trim().min(1).max(TEXT_MAX.long), remindAt: localDateTimeSchema.nullable() })
  .partial()
  .refine((p) => Object.keys(p).length > 0, { message: 'empty patch' })
export type NoteUpdate = z.input<typeof noteUpdateSchema>

export const noteListFilterSchema = z.object({
  includeDone: z.boolean().optional(),
  includeArchived: z.boolean().optional()
})
export type NoteListFilter = z.input<typeof noteListFilterSchema>

// ---- lost items (G-55) ----

export const lostItemInputSchema = z.object({
  /** Day or minute it was found; empty = now. */
  foundAt: z
    .string()
    .refine((v) => isLocalDate(v) || isLocalDateTime(v), 'YYYY-MM-DD or YYYY-MM-DDTHH:MM')
    .optional(),
  roomId: idSchema.nullish(),
  locationText: optionalText(200),
  foundBy: optionalText(120),
  description: z.string().trim().min(1).max(1000),
  storageLocation: optionalText(200),
  note: optionalText(1000)
})
export type LostItemInput = z.input<typeof lostItemInputSchema>

export const lostItemUpdateSchema = lostItemInputSchema
  .partial()
  .refine((p) => Object.keys(p).length > 0, { message: 'empty patch' })
export type LostItemUpdate = z.input<typeof lostItemUpdateSchema>

export const lostItemReturnSchema = z.object({
  returnedTo: z.string().trim().min(1).max(200),
  /** Local minute; empty = now. */
  returnedAt: localDateTimeSchema.optional(),
  note: optionalText(1000)
})
export type LostItemReturn = z.input<typeof lostItemReturnSchema>

export const lostItemListFilterSchema = z.object({
  status: z
    .array(z.enum(['stored', 'returned', 'disposed']))
    .min(1)
    .optional(),
  /** Found in [from, to) (days). */
  from: calendarDateSchema.optional(),
  to: calendarDateSchema.optional(),
  search: z.string().trim().max(100).optional()
})
export type LostItemListFilter = z.input<typeof lostItemListFilterSchema>

// ---- status tags (G-32, K-21, §6.14) ----

export const statusTagUpdateSchema = z
  .object({
    /** null = an automatic status goes back to the program's translated name (custom tags must keep a name). */
    name: z.string().trim().min(1).max(60).nullable(),
    /** null = theme default (`--status-*`). */
    color: hexColor.nullable(),
    description: optionalText(300),
    enabled: z.boolean(),
    sort: z.int(),
    priorityOverAuto: z.boolean()
  })
  .partial()
  .refine((p) => Object.keys(p).length > 0, { message: 'empty patch' })
export type StatusTagUpdate = z.input<typeof statusTagUpdateSchema>

export const customStatusTagInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  color: hexColor,
  description: optionalText(300),
  priorityOverAuto: z.boolean().default(false)
})
export type CustomStatusTagInput = z.input<typeof customStatusTagInputSchema>

/** A tag as the colour screen and the calendar read it (status-tags-service `StatusTagView`). */
export const statusTagViewSchema = z.object({
  id: idSchema,
  code: z.string(),
  kind: z.enum(['auto', 'custom']),
  name: z.string().nullable(),
  nameI18n: z.object({ tr: z.string(), en: z.string(), ru: z.string() }).partial().nullable(),
  color: z.string().nullable(),
  description: z.string().nullable(),
  enabled: z.boolean(),
  sort: z.int(),
  priorityOverAuto: z.boolean(),
  displayName: z.object({ tr: z.string(), en: z.string(), ru: z.string() }).partial().nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
})
export type StatusTagViewDto = z.output<typeof statusTagViewSchema>

export const reservationTagsInputSchema = z.object({
  reservationId: idSchema,
  tagIds: z
    .array(idSchema)
    .max(20)
    .refine((ids) => new Set(ids).size === ids.length, 'tag ids must be unique')
})
export type ReservationTagsInput = z.input<typeof reservationTagsInputSchema>
