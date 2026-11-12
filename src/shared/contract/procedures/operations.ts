// Faz 9: tasks, maintenance reminders, shift handover and notes (G-91…G-95, K-34, S-94; 03-mimari.md §6.16, §6.17).
// Spread into the contract by ./index.ts; handlers in src/main/api/handlers/operations.ts.
import * as z from 'zod'
import { shiftViewSchema } from '../admin'
import {
  calendarDateSchema,
  handoverInputSchema,
  localDateOrDateTimeSchema,
  noteInputSchema,
  noteListFilterSchema,
  noteUpdateSchema,
  taskInputSchema,
  taskListFilterSchema,
  taskTemplateInputSchema,
  taskTemplateUpdateSchema
} from '../operations'
import { byId, empty, proc, type Procedure } from '../proc'
import { i18nTextSchema, idSchema, localDateSchema } from '../rooms'

const i18n = i18nTextSchema.nullable()
const taskKindSchema = z.enum(['general', 'maintenance', 'legal'])

// ---- tasks ----

export const taskRowSchema = z.object({
  id: idSchema,
  templateId: idSchema.nullable(),
  title: z.string(),
  description: z.string().nullable(),
  assigneeUserId: idSchema.nullable(),
  assigneeRoleId: idSchema.nullable(),
  assigneeShiftId: idSchema.nullable(),
  roomId: idSchema.nullable(),
  /** Hotel wall-clock "YYYY-MM-DDTHH:MM"; null for an every-N-stays task (opened by check-outs). */
  dueAt: z.string().nullable(),
  status: z.enum(['open', 'done', 'cancelled']),
  doneAt: z.string().nullable(),
  doneBy: idSchema.nullable(),
  cancelReason: z.string().nullable(),
  note: z.string().nullable(),
  overdueNotifiedAt: z.string().nullable(),
  createdBy: idSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
})
export type TaskRowDto = z.infer<typeof taskRowSchema>

/** A task as the lists read it (tasks-service TaskView): translated seed title and the overdue flag. */
export const taskViewSchema = taskRowSchema.extend({ titleI18n: i18n, overdue: z.boolean() })

/** The Görevler list row: the task plus its template's kind and rule and the names to show. */
export const taskItemSchema = taskViewSchema.extend({
  kind: taskKindSchema,
  templateCode: z.string().nullable(),
  recurrence: z.record(z.string(), z.unknown()).nullable(),
  roomNumber: z.string().nullable(),
  assigneeName: z.string().nullable(),
  doneByName: z.string().nullable()
})
export type TaskItem = z.infer<typeof taskItemSchema>

export const taskItemFilterSchema = taskListFilterSchema.extend({
  /** Done tasks completed before this day are left out (the "Yapıldı" view reads the last weeks only). */
  doneFrom: calendarDateSchema.optional()
})
export type TaskItemFilter = z.input<typeof taskItemFilterSchema>

export const taskLookupsSchema = z.object({
  userId: idSchema.nullable(),
  /** Task edit and not an own-tasks-only role: may add repeating tasks and change templates. */
  canManage: z.boolean(),
  users: z.array(z.object({ id: idSchema, name: z.string(), active: z.boolean() })),
  roles: z.array(z.object({ id: idSchema, code: z.string().nullable(), name: z.string(), nameI18n: i18n })),
  shifts: z.array(shiftViewSchema),
  rooms: z.array(
    z.object({
      id: idSchema,
      number: z.string(),
      floor: z.string().nullable(),
      beds: z.int(),
      typeName: z.string(),
      typeNameI18n: i18n
    })
  )
})
export type TaskLookups = z.infer<typeof taskLookupsSchema>

export const templateDetailFilterSchema = z
  .object({ kind: z.array(taskKindSchema).min(1).optional(), includeInactive: z.boolean().optional() })
  .strict()
export type TemplateDetailFilter = z.input<typeof templateDetailFilterSchema>

/** A template with what Bakım and the reminder cards show: next due, last completion, open task. */
export const taskTemplateDetailSchema = z.object({
  id: idSchema,
  code: z.string().nullable(),
  kind: taskKindSchema,
  title: z.string().nullable(),
  titleI18n: i18n,
  description: z.string().nullable(),
  assigneeUserId: idSchema.nullable(),
  assigneeRoleId: idSchema.nullable(),
  assigneeShiftId: idSchema.nullable(),
  assigneeName: z.string().nullable(),
  roomId: idSchema.nullable(),
  roomNumber: z.string().nullable(),
  recurrence: z.record(z.string(), z.unknown()),
  firstDueAt: z.string().nullable(),
  remindMinutesBefore: z.int().nullable(),
  suggested: z.boolean(),
  active: z.boolean(),
  lastDoneAt: z.string().nullable(),
  /** Next time it is due (an overdue open task counts); null for every-N-stays and inactive templates. */
  nextDueAt: z.string().nullable(),
  openTaskId: idSchema.nullable(),
  openTaskDueAt: z.string().nullable(),
  createdAt: z.string()
})
export type TaskTemplateDetail = z.infer<typeof taskTemplateDetailSchema>

export const completeTemplateSchema = z.object({
  /** Every-N-stays templates: the room that was deep-cleaned. */
  roomId: idSchema.nullish(),
  /** The day the work was done (today or earlier); empty = now. */
  doneOn: calendarDateSchema.optional(),
  note: z.string().trim().max(1000).nullish()
})
export type CompleteTemplateInput = z.input<typeof completeTemplateSchema>

export const stayCounterGroupSchema = z.object({
  templateId: idSchema,
  code: z.string().nullable(),
  title: z.string().nullable(),
  titleI18n: i18n,
  n: z.int(),
  rooms: z.array(
    z.object({
      roomId: idSchema,
      roomNumber: z.string(),
      /** Checked-out stays since the room's last deep clean. */
      count: z.int(),
      since: localDateSchema,
      lastDoneAt: z.string().nullable(),
      openTaskId: idSchema.nullable()
    })
  )
})
export type StayCounterGroup = z.infer<typeof stayCounterGroupSchema>

// ---- shift handover (§6.16) and notes ----

const summaryStaySchema = z.object({
  stayId: idSchema,
  reservationId: idSchema,
  reservationCode: z.string(),
  roomNumber: z.string(),
  guestName: z.string(),
  checkIn: z.string(),
  checkOut: z.string()
})

const money = z.record(z.string(), z.number())

/** The automatic part of a handover; a part the reader may not see is null (not empty). */
export const handoverSummarySchema = z.object({
  at: z.string(),
  businessDate: localDateSchema,
  arrivalsPending: z.array(summaryStaySchema).nullable(),
  overdueCheckouts: z.array(summaryStaySchema).nullable(),
  inHouse: z.object({ rooms: z.int(), people: z.int() }).nullable(),
  kbsMissing: z
    .array(
      z.object({
        occupantId: idSchema.nullable(),
        reservationRoomId: idSchema,
        roomId: idSchema,
        roomNumber: z.string(),
        fullName: z.string().nullable(),
        kind: z.enum(['checkin', 'checkout', 'unnamed'])
      })
    )
    .nullable(),
  unpaid: z
    .array(
      z.object({
        reservationId: idSchema,
        reservationCode: z.string(),
        guestName: z.string(),
        roomNumbers: z.array(z.string()),
        balanceMinor: z.int(),
        currency: z.string()
      })
    )
    .nullable(),
  openTasks: z.array(taskViewSchema).nullable(),
  openIssues: z
    .array(
      z.object({
        id: idSchema,
        roomNumber: z.string().nullable(),
        title: z.string(),
        severity: z.enum(['low', 'medium', 'urgent']),
        status: z.enum(['open', 'planned']),
        reportedAt: z.string(),
        blocksRoom: z.boolean()
      })
    )
    .nullable(),
  cash: z
    .object({
      pending: z.record(z.string(), money),
      drawer: money,
      channels: z.record(z.string(), money),
      /** Computed from the rows the reader may see; a hidden section or staff money left out (K-42). */
      partial: z.boolean().optional()
    })
    .nullable()
})
export type HandoverSummaryDto = z.infer<typeof handoverSummarySchema>

export const handoverViewSchema = z.object({
  id: idSchema,
  businessDate: localDateSchema,
  fromShiftId: idSchema.nullable(),
  toShiftId: idSchema.nullable(),
  writtenBy: idSchema.nullable(),
  writtenByName: z.string().nullable(),
  writtenAt: z.string(),
  text: z.string().nullable(),
  summary: handoverSummarySchema,
  acknowledgedBy: idSchema.nullable(),
  acknowledgedByName: z.string().nullable(),
  acknowledgedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
})
export type HandoverViewDto = z.infer<typeof handoverViewSchema>

export const noteViewSchema = z.object({
  id: idSchema,
  kind: z.enum(['personal', 'board']),
  ownerUserId: idSchema.nullable(),
  text: z.string(),
  remindAt: z.string().nullable(),
  pinned: z.boolean(),
  doneAt: z.string().nullable(),
  archivedAt: z.string().nullable(),
  createdBy: idSchema.nullable(),
  createdByName: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
})
export type NoteViewDto = z.infer<typeof noteViewSchema>

const handoverRange = z
  .object({ from: calendarDateSchema, to: calendarDateSchema })
  .strict()
  .refine((r) => r.to >= r.from, { path: ['to'], message: 'to must not be before from' })

export const operationsProcedures = {
  // Tasks (G-94, §6.17): the list with names, form choices, one-off tasks, done / undo / cancel.
  'tasks.list': proc(taskItemFilterSchema.strict(), z.array(taskItemSchema)),
  'tasks.lookups': proc(empty, taskLookupsSchema),
  'tasks.create': proc(taskInputSchema.strict(), taskRowSchema),
  'tasks.done': proc(
    z.object({ id: idSchema, note: z.string().trim().max(1000).nullish() }).strict(),
    taskRowSchema
  ),
  'tasks.undoDone': proc(
    z.object({ id: idSchema, reason: z.string().trim().max(500).optional() }).strict(),
    taskRowSchema
  ),
  'tasks.cancel': proc(
    z.object({ id: idSchema, reason: z.string().trim().min(1).max(500) }).strict(),
    taskRowSchema
  ),

  // Repeating tasks, maintenance and legal reminders, suggestions (G-91, G-93, K-34).
  'tasks.templates': proc(templateDetailFilterSchema, z.array(taskTemplateDetailSchema)),
  'tasks.addTemplate': proc(taskTemplateInputSchema.strict(), taskTemplateDetailSchema),
  'tasks.editTemplate': proc(
    z.object({ id: idSchema, patch: taskTemplateUpdateSchema }).strict(),
    taskTemplateDetailSchema
  ),
  'tasks.setTemplateActive': proc(
    z.object({ id: idSchema, active: z.boolean(), firstDueAt: localDateOrDateTimeSchema.nullish() }).strict(),
    taskTemplateDetailSchema
  ),
  'tasks.dismissSuggestion': proc(byId, taskTemplateDetailSchema),
  'tasks.completeTemplate': proc(completeTemplateSchema.extend({ id: idSchema }).strict(), taskRowSchema),
  'tasks.stayCounters': proc(empty, z.array(stayCounterGroupSchema)),

  // Shift handover (G-95, §6.16). `shift.unreadHandovers` feeds the Today badge.
  'shift.summary': proc(empty, handoverSummarySchema),
  'shift.saveHandover': proc(handoverInputSchema.strict(), handoverViewSchema),
  'shift.acknowledge': proc(byId, handoverViewSchema),
  'shift.handovers': proc(handoverRange, z.array(handoverViewSchema)),
  'shift.unreadHandovers': proc(empty, z.array(handoverViewSchema)),

  // Notes: personal (only the writer reads it, §4.9-12) and the board.
  'notes.list': proc(noteListFilterSchema.strict(), z.array(noteViewSchema)),
  'notes.add': proc(noteInputSchema.strict(), noteViewSchema),
  'notes.update': proc(z.object({ id: idSchema, patch: noteUpdateSchema }).strict(), noteViewSchema),
  'notes.setState': proc(
    z
      .object({
        id: idSchema,
        done: z.boolean().optional(),
        pinned: z.boolean().optional(),
        archived: z.boolean().optional()
      })
      .strict(),
    noteViewSchema
  ),
  'notes.dueReminders': proc(empty, z.array(noteViewSchema))
} as const satisfies Record<string, Procedure>
