// Tasks, repeating templates, maintenance and legal reminders, "every N stays" deep cleans and overdue
// notifications (03-mimari.md §4.8, §6.8, §6.17; G-91, G-93, G-94, K-34, S-94). The schedule maths lives in
// shared/domain/task-recurrence.ts; this file loads rows, checks permissions and writes with audit rows.
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, max, ne, or, type SQL } from 'drizzle-orm'
import {
  completeTemplateSchema,
  taskItemFilterSchema,
  templateDetailFilterSchema,
  type CompleteTemplateInput,
  type StayCounterGroup,
  type TaskItem,
  type TaskItemFilter,
  type TaskLookups,
  type TaskTemplateDetail,
  type TemplateDetailFilter
} from '@shared/contract/procedures/operations'
import {
  materializeRangeSchema,
  taskCancelSchema,
  taskDoneSchema,
  taskInputSchema,
  taskListFilterSchema,
  taskTemplateActivateSchema,
  taskTemplateInputSchema,
  taskTemplateUpdateSchema,
  type TaskInput,
  type TaskListFilter,
  type TaskTemplateActivate,
  type TaskTemplateInput,
  type TaskTemplateUpdate
} from '@shared/contract/operations'
import { addDays, localDateOf, type LocalDate } from '@shared/date'
import { TOURISM_TEMPLATE_CODE } from '@shared/domain/today'
import { addMinutes, datePart, localDateTimeOf, type LocalDateTime } from '@shared/domain/local-datetime'
import {
  isOverdue,
  materializePlan,
  nextDue,
  nextDueAfterDone,
  occurrencesBetween,
  recurrenceRuleSchema,
  remindAt,
  staysSinceLastDone,
  taskKey,
  type ClosedTask,
  type RecurrenceRule,
  type RoomCheckout,
  type TaskTemplatePlanInput
} from '@shared/domain/task-recurrence'
import type { DbOrTx } from '../db/client'
import type { I18nText } from '../db/schema/columns'
import {
  kbsImports,
  notifications,
  reservationRooms,
  reservations,
  roles,
  roomTypes,
  rooms,
  shiftDefinitions,
  taskTemplates,
  tasks,
  users
} from '../db/schema'
import type { AuditEntry } from './audit'
import type { Ctx } from './context'
import { permissionDenied } from './errors'
import {
  inTransaction,
  invalid,
  newId,
  notFound,
  parseInput,
  requirePermission,
  stamps,
  type ServiceDeps,
  type Tx
} from './kit'
import { roomsInUseOn } from './room-capacity'
import { createSettingsService } from './settings-service'

export type TaskRow = typeof tasks.$inferSelect
export type TaskTemplateRow = typeof taskTemplates.$inferSelect
export type NotificationRow = typeof notifications.$inferSelect

export interface TaskView extends TaskRow {
  /** The template's translated title while the template keeps its seeded name (show in the UI language). */
  titleI18n: I18nText | null
  overdue: boolean
}

/** Tasks are written from today to this many days ahead (Görevler "Yaklaşan", the scheduler's round). */
export const TASK_WINDOW_DAYS = 7

/** cancel_reason of tasks the system cancels when their template's schedule changes or it is switched off. */
export const TEMPLATE_CHANGED_REASON = 'template_changed'

/** Who is looking at tasks (§6.17). */
export interface TaskViewer {
  userId: string | null
  roleId: string | null
  ownOnly: boolean
  canView: boolean
  canEdit: boolean
}

/**
 * A role with `tasks_own_only` (K-38 defaults: Temizlik, Çalışan; the owner may change it per role) sees only
 * tasks given to its users or to the role. Everyone else with `tasks` edit sees every task; with `tasks` view:
 * own, own role, unassigned and shift tasks.
 */
export function taskViewer(db: Pick<DbOrTx, 'select'>, ctx: Ctx): TaskViewer {
  let roleId: string | null = null
  let ownOnly = false
  if (ctx.userId !== null) {
    const row = db
      .select({ roleId: users.roleId, ownOnly: roles.tasksOwnOnly })
      .from(users)
      .innerJoin(roles, eq(roles.id, users.roleId))
      .where(eq(users.id, ctx.userId))
      .get()
    if (row) {
      roleId = row.roleId
      ownOnly = row.ownOnly
    }
  }
  return {
    userId: ctx.userId,
    roleId,
    ownOnly,
    canView: ctx.can('tasks', 'view'),
    canEdit: ctx.can('tasks', 'edit')
  }
}

/**
 * §6.17: a person's task → that person + task editors; a role's task → that role (+ editors); a shift's or an
 * unassigned task → everyone with tasks view. Own-tasks-only roles see just their own and their role's tasks,
 * and the tasks they wrote themselves (an unassigned "depo eksik" stays visible to whoever added it).
 */
export function canSeeTask(
  v: TaskViewer,
  t: Pick<TaskRow, 'assigneeUserId' | 'assigneeRoleId' | 'assigneeShiftId'> & { createdBy?: string | null }
): boolean {
  if (!v.canView) return false
  if (v.userId !== null && t.assigneeUserId === v.userId) return true
  if (v.userId !== null && t.createdBy === v.userId) return true
  if (v.roleId !== null && !t.assigneeUserId && t.assigneeRoleId === v.roleId) return true
  if (v.ownOnly) return false
  if (v.canEdit) return true
  return !t.assigneeUserId && !t.assigneeRoleId
}

const CALENDAR_KINDS: ReadonlySet<RecurrenceRule['kind']> = new Set(['daily', 'weekly', 'monthly'])

const parseRule = (raw: unknown): RecurrenceRule | null => {
  const r = recurrenceRuleSchema.safeParse(raw)
  return r.success ? r.data : null
}

const localOf = (iso: string): LocalDateTime => localDateTimeOf(new Date(iso))
const dayOf = (iso: string): LocalDate => localDateOf(new Date(iso))

const titleOf = (t: TaskTemplateRow): string => t.title ?? t.titleI18n?.tr ?? t.code ?? '—'

const fromTemplate = (t: TaskTemplateRow, now: Date) => ({
  id: newId(now),
  templateId: t.id,
  title: titleOf(t),
  description: t.description,
  assigneeUserId: t.assigneeUserId,
  assigneeRoleId: t.assigneeRoleId,
  assigneeShiftId: t.assigneeShiftId,
  roomId: t.roomId,
  status: 'open' as const,
  createdBy: null,
  ...stamps(now)
})

/** "YYYY-MM" + n months. */
const shiftMonth = (ym: string, n: number): string => {
  const total = Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1 + n
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}

/**
 * Tek giriş (G-60, G-93): the reminder task of a legal duty follows the screen where the duty is marked. The
 * tourism statistics of `period` ("YYYY-MM") is due in the next month: marking it reported closes the task of
 * that month (writing it as done when the scheduler has not written it yet, so it never shows up open later);
 * taking the mark back reopens it. Called inside the caller's transaction, which already checked its own screen's
 * right (no task permission here). A switched-off reminder is left alone.
 */
export function syncLegalPeriodTask(
  tx: Tx,
  audit: (entry: AuditEntry) => void,
  ctx: Ctx,
  code: string,
  period: string,
  done: boolean,
  now: Date
): void {
  const template = tx.select().from(taskTemplates).where(eq(taskTemplates.code, code)).get()
  if (!template?.active) return
  const rule = parseRule(template.recurrence)
  if (!rule || !CALENDAR_KINDS.has(rule.kind)) return
  const month = shiftMonth(period, 1)
  const from = `${month}-01T00:00` as LocalDateTime
  const to = `${shiftMonth(month, 1)}-01T00:00` as LocalDateTime
  const firstDue = (template.firstDueAt ?? `${dayOf(template.createdAt)}T00:00`) as LocalDateTime
  const iso = now.toISOString()
  for (const dueAt of occurrencesBetween(rule, firstDue, from, to)) {
    const before = tx
      .select()
      .from(tasks)
      .where(and(eq(tasks.templateId, template.id), eq(tasks.dueAt, dueAt)))
      .get()
    if (done) {
      const parked = before?.status === 'cancelled' && before.cancelReason === TEMPLATE_CHANGED_REASON
      if (before && before.status !== 'open' && !parked) continue
      const set = {
        status: 'done' as const,
        doneAt: iso,
        doneBy: ctx.userId,
        cancelReason: null,
        updatedAt: iso
      }
      if (before) tx.update(tasks).set(set).where(eq(tasks.id, before.id)).run()
      else
        tx.insert(tasks)
          .values({ ...fromTemplate(template, now), dueAt, ...set })
          .run()
      const after = tx
        .select()
        .from(tasks)
        .where(and(eq(tasks.templateId, template.id), eq(tasks.dueAt, dueAt)))
        .get()
      audit({
        entity: 'task',
        entityId: after?.id ?? template.id,
        action: before ? 'done' : 'create',
        before,
        after,
        reason: `${code}:${period}`
      })
    } else if (before?.status === 'done') {
      tx.update(tasks)
        .set({ status: 'open', doneAt: null, doneBy: null, updatedAt: iso })
        .where(eq(tasks.id, before.id))
        .run()
      audit({
        entity: 'task',
        entityId: before.id,
        action: 'reopen',
        before,
        after: tx.select().from(tasks).where(eq(tasks.id, before.id)).get(),
        reason: `${code}:${period}`
      })
    }
  }
}

/**
 * Tek giriş (G-60), the other direction: ticking the monthly tourism-statistics task marks the previous month's
 * table(s) "bildirildi" (and un-ticking takes the mark back), so Bugün shows one obligation, not a task and a warning.
 */
function syncTourismMark(
  tx: Tx,
  audit: (entry: AuditEntry) => void,
  ctx: Ctx,
  template: TaskTemplateRow,
  dueAt: string | null,
  reported: boolean,
  now: Date
): void {
  if (template.code !== TOURISM_TEMPLATE_CODE || !dueAt) return
  const period = shiftMonth(dueAt.slice(0, 7), -1)
  const year = Number(period.slice(0, 4))
  const month = Number(period.slice(5, 7))
  const iso = now.toISOString()
  const rows = tx
    .select()
    .from(kbsImports)
    .where(and(eq(kbsImports.periodYear, year), eq(kbsImports.periodMonth, month)))
    .all()
    .filter((r) => (reported ? r.reportedAt === null : r.reportedAt !== null))
  for (const r of rows) {
    const set = reported
      ? { reportedAt: iso, reportedBy: ctx.userId, updatedAt: iso }
      : { reportedAt: null, reportedBy: null, updatedAt: iso }
    tx.update(kbsImports).set(set).where(eq(kbsImports.id, r.id)).run()
    audit({
      entity: 'kbs_import',
      entityId: r.id,
      action: 'update',
      before: { reportedAt: r.reportedAt, reportedBy: r.reportedBy },
      after: { reportedAt: set.reportedAt, reportedBy: set.reportedBy },
      reason: `task:${template.code}`
    })
  }
}

export function createTasksService(deps: ServiceDeps) {
  const { db } = deps
  const settings = createSettingsService(db, deps.clock)

  const getTask = (tx: Pick<Tx, 'select'>, id: string): TaskRow => {
    const row = tx.select().from(tasks).where(eq(tasks.id, id)).get()
    if (!row) throw notFound('task', id)
    return row
  }

  const getTemplate = (tx: Pick<Tx, 'select'>, id: string): TaskTemplateRow => {
    const row = tx.select().from(taskTemplates).where(eq(taskTemplates.id, id)).get()
    if (!row) throw notFound('task_template', id)
    return row
  }

  /** Template and plan writes belong to task managers: tasks edit and not an own-tasks-only role. */
  const requireTaskManager = (ctx: Ctx): void => {
    requirePermission(ctx, 'tasks', 'edit')
    if (taskViewer(db, ctx).ownOnly) throw permissionDenied()
  }

  /** A task write: tasks edit, and the task must be one the user can see. */
  const requireTaskWrite = (ctx: Ctx, task: TaskRow): void => {
    requirePermission(ctx, 'tasks', 'edit')
    if (!canSeeTask(taskViewer(db, ctx), task)) throw permissionDenied()
  }

  const checkRefs = (
    tx: Pick<Tx, 'select'>,
    refs: {
      assigneeUserId?: string | null
      assigneeRoleId?: string | null
      assigneeShiftId?: string | null
      roomId?: string | null
    }
  ): void => {
    if (
      refs.assigneeUserId &&
      !tx.select({ id: users.id }).from(users).where(eq(users.id, refs.assigneeUserId)).get()
    )
      throw notFound('user', refs.assigneeUserId)
    if (
      refs.assigneeRoleId &&
      !tx.select({ id: roles.id }).from(roles).where(eq(roles.id, refs.assigneeRoleId)).get()
    )
      throw notFound('role', refs.assigneeRoleId)
    if (
      refs.assigneeShiftId &&
      !tx
        .select({ id: shiftDefinitions.id })
        .from(shiftDefinitions)
        .where(eq(shiftDefinitions.id, refs.assigneeShiftId))
        .get()
    )
      throw notFound('shift', refs.assigneeShiftId)
    if (refs.roomId && !tx.select({ id: rooms.id }).from(rooms).where(eq(rooms.id, refs.roomId)).get())
      throw notFound('room', refs.roomId)
  }

  /** First due of a template switched on without one (the next slot, or now for every-N-stays counting). */
  const defaultFirstDue = (rule: RecurrenceRule, now: LocalDateTime): LocalDateTime => {
    if (rule.kind === 'everyNStays') return now
    const next = nextDue(rule, now)
    if (next === null) throw invalid('errors.taskFirstDueRequired')
    return next
  }

  /** everyNStays without an explicit n takes the hotel's default (setting `tasks.everyNStays`, S-94). */
  const withHotelN = (ctx: Ctx, rule: RecurrenceRule, raw: unknown): RecurrenceRule => {
    const given = typeof raw === 'object' && raw !== null && 'n' in raw && raw.n !== undefined
    return rule.kind === 'everyNStays' && !given
      ? { ...rule, n: settings.get(ctx)['tasks.everyNStays'] }
      : rule
  }

  /**
   * Cancels a template's open tasks that are not due yet (its schedule changed). `includeOverdue`: the late ones
   * too (the template was switched off — nobody is to do them any more, they must not stay "Gecikti" forever).
   */
  const cancelUpcoming = (
    tx: Tx,
    audit: (
      e: Parameters<Parameters<typeof inTransaction>[2]>[1] extends (x: infer A) => void ? A : never
    ) => void,
    templateId: string,
    now: Date,
    includeOverdue = false
  ): number => {
    const nowLocal = localDateTimeOf(now)
    const upcoming = tx
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.templateId, templateId),
          eq(tasks.status, 'open'),
          includeOverdue ? undefined : or(isNull(tasks.dueAt), gte(tasks.dueAt, nowLocal))
        )
      )
      .all()
    if (!upcoming.length) return 0
    const iso = now.toISOString()
    tx.update(tasks)
      .set({ status: 'cancelled', cancelReason: TEMPLATE_CHANGED_REASON, updatedAt: iso })
      .where(
        inArray(
          tasks.id,
          upcoming.map((t) => t.id)
        )
      )
      .run()
    audit({
      entity: 'task',
      entityId: templateId,
      action: 'cancel',
      before: { ids: upcoming.map((t) => t.id) },
      reason: TEMPLATE_CHANGED_REASON
    })
    return upcoming.length
  }

  /**
   * Open tasks written earlier follow a template's new title, description, assignee and room (an every-N-stays
   * task keeps its own room); done and cancelled tasks are history and keep what they had.
   */
  const followTemplate = (
    tx: Tx,
    audit: (entry: AuditEntry) => void,
    before: TaskTemplateRow,
    after: TaskTemplateRow,
    now: Date
  ): void => {
    const perRoom = parseRule(after.recurrence)?.kind === 'everyNStays'
    const assigneeChanged =
      after.assigneeUserId !== before.assigneeUserId ||
      after.assigneeRoleId !== before.assigneeRoleId ||
      after.assigneeShiftId !== before.assigneeShiftId
    const set = {
      ...(titleOf(after) !== titleOf(before) ? { title: titleOf(after) } : {}),
      ...(after.description !== before.description ? { description: after.description } : {}),
      ...(assigneeChanged
        ? {
            assigneeUserId: after.assigneeUserId,
            assigneeRoleId: after.assigneeRoleId,
            assigneeShiftId: after.assigneeShiftId
          }
        : {}),
      ...(!perRoom && after.roomId !== before.roomId ? { roomId: after.roomId } : {})
    }
    if (!Object.keys(set).length) return
    const open = tx
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.templateId, after.id), eq(tasks.status, 'open')))
      .all()
      .map((t) => t.id)
    if (!open.length) return
    tx.update(tasks)
      .set({ ...set, updatedAt: now.toISOString() })
      .where(inArray(tasks.id, open))
      .run()
    audit({
      entity: 'task',
      entityId: after.id,
      action: 'update',
      before: { ids: open },
      after: set,
      reason: TEMPLATE_CHANGED_REASON
    })
  }

  /** The latest done (or user-cancelled) task of an interval series: the series continues after it. */
  const lastClosed = (tx: Pick<Tx, 'select'>, templateId: string): ClosedTask | null => {
    const row = tx
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.templateId, templateId),
          isNotNull(tasks.dueAt),
          or(
            eq(tasks.status, 'done'),
            and(eq(tasks.status, 'cancelled'), ne(tasks.cancelReason, TEMPLATE_CHANGED_REASON))
          )
        )
      )
      .orderBy(desc(tasks.dueAt))
      .get()
    if (!row?.dueAt) return null
    const dueAt = row.dueAt as LocalDateTime
    return { dueAt, doneAt: row.status === 'done' && row.doneAt ? localOf(row.doneAt) : dueAt }
  }

  const toView = (
    task: TaskRow,
    templates: Map<string, TaskTemplateRow>,
    nowLocal: LocalDateTime
  ): TaskView => {
    const template = task.templateId ? templates.get(task.templateId) : undefined
    return {
      ...task,
      titleI18n: template && template.title === null ? template.titleI18n : null,
      overdue: isOverdue({ status: task.status, dueAt: task.dueAt as LocalDateTime | null }, nowLocal)
    }
  }

  /** open → done at `doneAtIso` (now, or the day the work was really done); interval series remember it. */
  const markDone = (
    tx: Tx,
    audit: (entry: AuditEntry) => void,
    ctx: Ctx,
    before: TaskRow,
    doneAtIso: string,
    now: Date,
    note?: string | null
  ): TaskRow => {
    if (before.status !== 'open') throw invalid('errors.taskNotOpen')
    const iso = now.toISOString()
    tx.update(tasks)
      .set({
        status: 'done',
        doneAt: doneAtIso,
        doneBy: ctx.userId,
        ...(note ? { note } : {}),
        updatedAt: iso
      })
      .where(eq(tasks.id, before.id))
      .run()
    if (before.templateId) {
      const template = getTemplate(tx, before.templateId)
      if (parseRule(template.recurrence)?.kind === 'interval')
        tx.update(taskTemplates)
          .set({ lastDoneAt: doneAtIso, updatedAt: iso })
          .where(eq(taskTemplates.id, template.id))
          .run()
    }
    const after = getTask(tx, before.id)
    audit({ entity: 'task', entityId: before.id, action: 'done', before, after })
    if (before.templateId)
      syncTourismMark(tx, audit, ctx, getTemplate(tx, before.templateId), before.dueAt, true, now)
    return after
  }

  const core = {
    // ---- templates ----

    listTemplates(ctx: Ctx, opts: { includeInactive?: boolean } = {}): TaskTemplateRow[] {
      requirePermission(ctx, 'tasks', 'view')
      const q = db.select().from(taskTemplates)
      return (opts.includeInactive ? q : q.where(eq(taskTemplates.active, true)))
        .orderBy(asc(taskTemplates.kind), asc(taskTemplates.createdAt))
        .all()
    },

    createTemplate(ctx: Ctx, input: TaskTemplateInput): TaskTemplateRow {
      requireTaskManager(ctx)
      const data = parseInput(taskTemplateInputSchema, input)
      const rule = withHotelN(ctx, data.recurrence, input.recurrence)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        checkRefs(tx, data)
        const id = newId(now)
        const firstDueAt =
          data.firstDueAt ?? (data.active ? defaultFirstDue(rule, localDateTimeOf(now)) : null)
        const row = {
          id,
          code: null,
          title: data.title,
          titleI18n: null,
          description: data.description ?? null,
          kind: data.kind,
          assigneeUserId: data.assigneeUserId ?? null,
          assigneeRoleId: data.assigneeRoleId ?? null,
          assigneeShiftId: data.assigneeShiftId ?? null,
          roomId: data.roomId ?? null,
          recurrence: rule as Record<string, unknown>,
          firstDueAt,
          remindMinutesBefore: data.remindMinutesBefore ?? null,
          suggested: false,
          active: data.active,
          createdBy: ctx.userId,
          ...stamps(now)
        }
        tx.insert(taskTemplates).values(row).run()
        audit({ entity: 'task_template', entityId: id, action: 'create', after: row })
        return getTemplate(tx, id)
      })
    },

    /** A changed schedule cancels the open tasks that are not due yet; the next materialize follows the new one. */
    updateTemplate(ctx: Ctx, id: string, patch: TaskTemplateUpdate): TaskTemplateRow {
      requireTaskManager(ctx)
      const data = parseInput(taskTemplateUpdateSchema, patch)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const before = getTemplate(tx, id)
        checkRefs(tx, data)
        const { recurrence, title, ...rest } = data
        const rule = recurrence ? withHotelN(ctx, recurrence, patch.recurrence) : undefined
        const set = {
          ...rest,
          ...(title !== undefined ? { title, titleI18n: null } : {}),
          ...(rule ? { recurrence: rule as Record<string, unknown> } : {}),
          updatedAt: now.toISOString()
        }
        tx.update(taskTemplates).set(set).where(eq(taskTemplates.id, id)).run()
        const after = getTemplate(tx, id)
        audit({ entity: 'task_template', entityId: id, action: 'update', before, after })
        const scheduleChanged =
          JSON.stringify(after.recurrence) !== JSON.stringify(before.recurrence) ||
          after.firstDueAt !== before.firstDueAt
        // Only N of an every-N-stays rule changed: the counters are live (derived from checkouts), nothing to cancel.
        const onlyNChanged =
          parseRule(before.recurrence)?.kind === 'everyNStays' &&
          parseRule(after.recurrence)?.kind === 'everyNStays' &&
          after.firstDueAt === before.firstDueAt
        if (scheduleChanged && !onlyNChanged) cancelUpcoming(tx, audit, id, now)
        followTemplate(tx, audit, before, after, now)
        return after
      })
    },

    /** Switches a template (or a seeded suggestion) on; an empty first due is filled in. */
    activateTemplate(ctx: Ctx, id: string, input: TaskTemplateActivate = {}): TaskTemplateRow {
      requireTaskManager(ctx)
      const data = parseInput(taskTemplateActivateSchema, input)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const before = getTemplate(tx, id)
        const rule = parseRule(before.recurrence)
        if (!rule) throw invalid('errors.validation', { fields: { recurrence: ['invalid rule'] } })
        const firstDueAt = before.firstDueAt ?? data.firstDueAt ?? defaultFirstDue(rule, localDateTimeOf(now))
        tx.update(taskTemplates)
          .set({ active: true, suggested: false, firstDueAt, updatedAt: now.toISOString() })
          .where(eq(taskTemplates.id, id))
          .run()
        const after = getTemplate(tx, id)
        audit({ entity: 'task_template', entityId: id, action: 'update', before, after })
        return after
      })
    },

    /** Switches a template off (legal reminders too); its tasks that are not due yet are cancelled. */
    deactivateTemplate(ctx: Ctx, id: string): TaskTemplateRow {
      requireTaskManager(ctx)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const before = getTemplate(tx, id)
        tx.update(taskTemplates)
          .set({ active: false, updatedAt: now.toISOString() })
          .where(eq(taskTemplates.id, id))
          .run()
        const after = getTemplate(tx, id)
        audit({ entity: 'task_template', entityId: id, action: 'update', before, after })
        cancelUpcoming(tx, audit, id, now, true)
        return after
      })
    },

    // ---- materializing ----

    /**
     * Creates the tasks of active templates due in [from, to) ("YYYY-MM-DD" = that day's 00:00). Idempotent:
     * keys already present are skipped (UNIQUE(template_id, due_at) is the last guard). A task manager or the
     * scheduler (systemCtx) runs it. Every-N-stays templates open tasks at check-out.
     */
    materialize(ctx: Ctx, from: string, to: string): TaskRow[] {
      requireTaskManager(ctx)
      const range = parseInput(materializeRangeSchema, { from, to })
      const rangeFrom = range.from as LocalDateTime
      const rangeTo = range.to as LocalDateTime
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const active = tx.select().from(taskTemplates).where(eq(taskTemplates.active, true)).all()
        const byId = new Map(active.map((t) => [t.id, t]))
        const plans: TaskTemplatePlanInput[] = []
        const calendarIds: string[] = []
        const singleIds: string[] = []
        for (const t of active) {
          const rule = parseRule(t.recurrence)
          if (!rule || rule.kind === 'everyNStays') continue
          const calendar = CALENDAR_KINDS.has(rule.kind)
          // Seeded calendar templates start on the day they were created.
          const firstDue = (t.firstDueAt ??
            (calendar ? `${dayOf(t.createdAt)}T00:00` : null)) as LocalDateTime | null
          if (!firstDue) continue
          ;(calendar ? calendarIds : singleIds).push(t.id)
          plans.push({
            id: t.id,
            rule,
            firstDue,
            active: true,
            lastDone: rule.kind === 'interval' ? lastClosed(tx, t.id) : null
          })
        }
        if (!plans.length) return []
        const keyed: SQL[] = []
        if (calendarIds.length)
          keyed.push(
            and(
              inArray(tasks.templateId, calendarIds),
              gte(tasks.dueAt, rangeFrom),
              lt(tasks.dueAt, rangeTo)
            ) as SQL
          )
        if (singleIds.length)
          keyed.push(and(inArray(tasks.templateId, singleIds), isNotNull(tasks.dueAt)) as SQL)
        const rows = tx
          .select({
            id: tasks.id,
            templateId: tasks.templateId,
            dueAt: tasks.dueAt,
            status: tasks.status,
            cancelReason: tasks.cancelReason
          })
          .from(tasks)
          .where(or(...keyed))
          .all()
        const existing = new Set<string>()
        const parked = new Map<string, string>()
        for (const r of rows) {
          if (!r.templateId || !r.dueAt) continue
          const key = taskKey(r.templateId, r.dueAt as LocalDateTime)
          // A task the system cancelled for a schedule change comes back if the schedule returns to it.
          if (r.status === 'cancelled' && r.cancelReason === TEMPLATE_CHANGED_REASON) parked.set(key, r.id)
          else existing.add(key)
        }
        const created: string[] = []
        const iso = now.toISOString()
        for (const plan of materializePlan(plans, existing, rangeFrom, rangeTo)) {
          const template = byId.get(plan.templateId) as TaskTemplateRow
          const parkedId = parked.get(taskKey(plan.templateId, plan.dueAt))
          if (parkedId) {
            tx.update(tasks)
              .set({ status: 'open', cancelReason: null, updatedAt: iso })
              .where(eq(tasks.id, parkedId))
              .run()
            created.push(parkedId)
            continue
          }
          const row = { ...fromTemplate(template, now), dueAt: plan.dueAt }
          const res = tx.insert(tasks).values(row).onConflictDoNothing().run()
          if (res.changes) created.push(row.id)
        }
        for (const t of active)
          if (calendarIds.includes(t.id) && (!t.materializedUntil || t.materializedUntil < rangeTo))
            tx.update(taskTemplates)
              .set({ materializedUntil: rangeTo, updatedAt: iso })
              .where(eq(taskTemplates.id, t.id))
              .run()
        if (!created.length) return []
        audit({
          entity: 'task',
          entityId: `materialize:${rangeFrom}..${rangeTo}`,
          action: 'create',
          after: { ids: created }
        })
        return tx.select().from(tasks).where(inArray(tasks.id, created)).orderBy(asc(tasks.dueAt)).all()
      })
    },

    /**
     * Called by the reservation service after a check-out (no permission of its own): for each active
     * every-N-stays template, counts the room's checked-out stays since the last done/cancelled task of that
     * template for the room (or since the template started) and opens ONE task (no due time) once ≥ n.
     */
    onCheckout(ctx: Ctx, roomId: string, checkoutDate: string): TaskRow[] {
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const templates = tx
          .select()
          .from(taskTemplates)
          .where(eq(taskTemplates.active, true))
          .all()
          .flatMap((t) => {
            const rule = parseRule(t.recurrence)
            return rule?.kind === 'everyNStays' && (!t.roomId || t.roomId === roomId) ? [{ t, rule }] : []
          })
        if (!templates.length) return []
        const checkouts: RoomCheckout[] = tx
          .select({ checkedOutAt: reservationRooms.checkedOutAt, kind: reservations.kind })
          .from(reservationRooms)
          .innerJoin(reservations, eq(reservations.id, reservationRooms.reservationId))
          .where(
            and(
              eq(reservationRooms.roomId, roomId),
              isNotNull(reservationRooms.checkedOutAt),
              ne(reservationRooms.status, 'cancelled')
            )
          )
          .all()
          .map((c) => ({ roomId, checkOut: dayOf(c.checkedOutAt as string), kind: c.kind }))
        const opened: TaskRow[] = []
        for (const { t, rule } of templates) {
          const mine = and(eq(tasks.templateId, t.id), eq(tasks.roomId, roomId))
          if (
            tx
              .select({ id: tasks.id })
              .from(tasks)
              .where(and(mine, eq(tasks.status, 'open')))
              .get()
          )
            continue
          let since: LocalDate = t.firstDueAt ? datePart(t.firstDueAt as LocalDateTime) : dayOf(t.createdAt)
          for (const c of tx
            .select({
              doneAt: tasks.doneAt,
              updatedAt: tasks.updatedAt,
              status: tasks.status,
              cancelReason: tasks.cancelReason
            })
            .from(tasks)
            .where(and(mine, inArray(tasks.status, ['done', 'cancelled'])))
            .all()) {
            if (c.status === 'cancelled' && c.cancelReason === TEMPLATE_CHANGED_REASON) continue
            const closed = dayOf(c.doneAt ?? c.updatedAt)
            if (closed > since) since = closed
          }
          const count = staysSinceLastDone(checkouts, since, rule, roomId)
          if (count < rule.n) continue
          const row = { ...fromTemplate(t, now), roomId, dueAt: null }
          tx.insert(tasks).values(row).run()
          audit({
            entity: 'task',
            entityId: row.id,
            action: 'create',
            after: { ...row, staysSince: since, stays: count, checkoutDate }
          })
          opened.push(getTask(tx, row.id))
        }
        return opened
      })
    },

    // ---- tasks ----

    /** Tasks the user may see (§6.17), by due time (undated last). */
    listTasks(ctx: Ctx, filter: TaskListFilter = {}): TaskView[] {
      requirePermission(ctx, 'tasks', 'view')
      const f = parseInput(taskListFilterSchema, filter)
      const where: (SQL | undefined)[] = [
        f.status ? inArray(tasks.status, f.status) : undefined,
        f.roomId ? eq(tasks.roomId, f.roomId) : undefined,
        f.templateId ? eq(tasks.templateId, f.templateId) : undefined
      ]
      const due: (SQL | undefined)[] = [
        f.dueFrom ? gte(tasks.dueAt, f.dueFrom) : undefined,
        f.dueTo ? lt(tasks.dueAt, f.dueTo) : undefined
      ]
      if (f.dueFrom || f.dueTo || f.withDueOnly) {
        const dated = and(isNotNull(tasks.dueAt), ...due)
        where.push(f.withDueOnly ? dated : or(dated, isNull(tasks.dueAt)))
      }
      const viewer = taskViewer(db, ctx)
      const rows = db
        .select()
        .from(tasks)
        .where(and(...where))
        .orderBy(asc(tasks.dueAt), asc(tasks.createdAt))
        .all()
        .filter((t) => canSeeTask(viewer, t))
      const templateIds = [...new Set(rows.flatMap((t) => (t.templateId ? [t.templateId] : [])))]
      const templates = new Map(
        (templateIds.length
          ? db.select().from(taskTemplates).where(inArray(taskTemplates.id, templateIds)).all()
          : []
        ).map((t) => [t.id, t])
      )
      const nowLocal = localDateTimeOf(deps.clock())
      const dated = rows.filter((t) => t.dueAt !== null)
      const undated = rows.filter((t) => t.dueAt === null)
      return [...dated, ...undated].map((t) => toView(t, templates, nowLocal))
    },

    /** One-off task (also by an own-tasks-only role, e.g. "depo eksik"). */
    createTask(ctx: Ctx, input: TaskInput): TaskRow {
      requirePermission(ctx, 'tasks', 'edit')
      const data = parseInput(taskInputSchema, input)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        checkRefs(tx, data)
        const row = {
          id: newId(now),
          templateId: null,
          title: data.title,
          description: data.description ?? null,
          assigneeUserId: data.assigneeUserId ?? null,
          assigneeRoleId: data.assigneeRoleId ?? null,
          assigneeShiftId: data.assigneeShiftId ?? null,
          roomId: data.roomId ?? null,
          dueAt: data.dueAt ?? null,
          status: 'open' as const,
          note: data.note ?? null,
          createdBy: ctx.userId,
          ...stamps(now)
        }
        tx.insert(tasks).values(row).run()
        audit({ entity: 'task', entityId: row.id, action: 'create', after: row })
        return getTask(tx, row.id)
      })
    },

    /** open → done (who + when); an interval template remembers its last completion. */
    done(ctx: Ctx, id: string, input: { note?: string | null } = {}): TaskRow {
      const data = parseInput(taskDoneSchema, input)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const before = getTask(tx, id)
        requireTaskWrite(ctx, before)
        return markDone(tx, audit, ctx, before, now.toISOString(), now, data.note)
      })
    },

    /** done → open again (a mistaken tick); an interval series drops the successor it had planned. */
    undoDone(ctx: Ctx, id: string, reason?: string): TaskRow {
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const before = getTask(tx, id)
        requireTaskWrite(ctx, before)
        if (before.status !== 'done') throw invalid('errors.taskNotDone')
        const iso = now.toISOString()
        tx.update(tasks)
          .set({ status: 'open', doneAt: null, doneBy: null, updatedAt: iso })
          .where(eq(tasks.id, id))
          .run()
        if (before.templateId)
          syncTourismMark(tx, audit, ctx, getTemplate(tx, before.templateId), before.dueAt, false, now)
        if (before.templateId && before.dueAt) {
          const template = getTemplate(tx, before.templateId)
          if (parseRule(template.recurrence)?.kind === 'interval') {
            const successors = tx
              .select({ id: tasks.id })
              .from(tasks)
              .where(and(eq(tasks.templateId, template.id), eq(tasks.status, 'open'), ne(tasks.id, id)))
              .all()
              .map((s) => s.id)
            if (successors.length)
              tx.update(tasks)
                .set({ status: 'cancelled', cancelReason: TEMPLATE_CHANGED_REASON, updatedAt: iso })
                .where(inArray(tasks.id, successors))
                .run()
            const latest = tx
              .select({ doneAt: tasks.doneAt })
              .from(tasks)
              .where(and(eq(tasks.templateId, template.id), eq(tasks.status, 'done')))
              .orderBy(desc(tasks.doneAt))
              .get()
            tx.update(taskTemplates)
              .set({ lastDoneAt: latest?.doneAt ?? null, updatedAt: iso })
              .where(eq(taskTemplates.id, template.id))
              .run()
          }
        }
        const after = getTask(tx, id)
        audit({ entity: 'task', entityId: id, action: 'reopen', before, after, reason })
        return after
      })
    },

    /** open → cancelled with a reason (never deleted). */
    cancel(ctx: Ctx, id: string, reason: string): TaskRow {
      const data = parseInput(taskCancelSchema, { reason })
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const before = getTask(tx, id)
        requireTaskWrite(ctx, before)
        if (before.status !== 'open') throw invalid('errors.taskNotOpen')
        tx.update(tasks)
          .set({ status: 'cancelled', cancelReason: data.reason, updatedAt: now.toISOString() })
          .where(eq(tasks.id, id))
          .run()
        const after = getTask(tx, id)
        audit({ entity: 'task', entityId: id, action: 'cancel', before, after, reason: data.reason })
        return after
      })
    },

    /**
     * One notification per open task that is past due (§6.8 "bir kez"): marks `overdue_notified_at` so a
     * later run does not repeat it. Run by the scheduler (systemCtx) or a task manager.
     */
    notifyOverdue(ctx: Ctx, at?: Date): NotificationRow[] {
      requireTaskManager(ctx)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const moment = at ?? now
        const nowLocal = localDateTimeOf(moment)
        const late = tx
          .select()
          .from(tasks)
          .where(
            and(
              eq(tasks.status, 'open'),
              isNotNull(tasks.dueAt),
              lt(tasks.dueAt, nowLocal),
              isNull(tasks.overdueNotifiedAt)
            )
          )
          .all()
        const iso = moment.toISOString()
        const ids: string[] = []
        for (const task of late) {
          const id = newId(now)
          tx.insert(notifications)
            .values({
              id,
              kind: 'task_overdue',
              refId: task.id,
              userId: task.assigneeUserId,
              title: task.title,
              body: task.dueAt,
              dueAt: iso,
              ...stamps(now)
            })
            .run()
          tx.update(tasks)
            .set({ overdueNotifiedAt: iso, updatedAt: now.toISOString() })
            .where(eq(tasks.id, task.id))
            .run()
          audit({
            entity: 'task',
            entityId: task.id,
            action: 'update',
            before: { overdueNotifiedAt: null },
            after: { overdueNotifiedAt: iso, notificationId: id }
          })
          ids.push(id)
        }
        return ids.length ? tx.select().from(notifications).where(inArray(notifications.id, ids)).all() : []
      })
    }
  }

  // ---- screens (Faz 9): enriched task list, maintenance and every-N-stays views, reminders ----

  const nowLocalOf = (): LocalDateTime => localDateTimeOf(deps.clock())

  /**
   * The due a single (none / interval) template stands at: its first due, or for an interval series the successor
   * of its last done/cancelled task; a done one-off template has none.
   */
  const currentDue = (
    tx: Pick<Tx, 'select'>,
    t: TaskTemplateRow,
    rule: RecurrenceRule
  ): LocalDateTime | null => {
    const first = t.firstDueAt as LocalDateTime | null
    if (!first) return null
    const last = lastClosed(tx, t.id)
    if (rule.kind === 'interval') return last ? nextDueAfterDone(rule, last, first) : first
    if (rule.kind === 'none') return last ? null : first
    return null
  }

  /** Next calendar slot of a daily/weekly/monthly template at or after `from` (never before its first due). */
  const nextCalendarDue = (
    t: TaskTemplateRow,
    rule: RecurrenceRule,
    from: LocalDateTime
  ): LocalDateTime | null => {
    const first = (t.firstDueAt ?? `${dayOf(t.createdAt)}T00:00`) as LocalDateTime
    const start = first > from ? first : from
    return nextDue(rule, addMinutes(start, -1))
  }

  /** The next due of a template from now on (an open task first: an overdue one is its next due). */
  const upcomingDue = (
    tx: Pick<Tx, 'select'>,
    t: TaskTemplateRow,
    rule: RecurrenceRule,
    openDue: LocalDateTime | null,
    nowLocal: LocalDateTime
  ): LocalDateTime | null => {
    if (rule.kind === 'everyNStays') return null
    if (rule.kind === 'none' || rule.kind === 'interval') return openDue ?? currentDue(tx, t, rule)
    return openDue ?? nextCalendarDue(t, rule, nowLocal)
  }

  const userNames = (tx: Pick<Tx, 'select'>): Map<string, string> =>
    new Map(
      tx
        .select({ id: users.id, name: users.displayName })
        .from(users)
        .all()
        .map((u) => [u.id, u.name])
    )

  const roomNumbers = (tx: Pick<Tx, 'select'>): Map<string, string> =>
    new Map(
      tx
        .select({ id: rooms.id, number: rooms.number })
        .from(rooms)
        .all()
        .map((r) => [r.id, r.number])
    )

  /** Earliest open task (dated before undated) per template. */
  const openByTemplate = (tx: Pick<Tx, 'select'>): Map<string, TaskRow> => {
    const out = new Map<string, TaskRow>()
    for (const row of tx
      .select()
      .from(tasks)
      .where(and(eq(tasks.status, 'open'), isNotNull(tasks.templateId)))
      .orderBy(asc(tasks.dueAt), asc(tasks.createdAt))
      .all()) {
      const key = row.templateId as string
      const seen = out.get(key)
      if (!seen || (seen.dueAt === null && row.dueAt !== null)) out.set(key, row)
    }
    return out
  }

  const templateDetail = (
    tx: Pick<Tx, 'select'>,
    t: TaskTemplateRow,
    open: TaskRow | undefined,
    lastDone: string | null,
    names: Map<string, string>,
    numbers: Map<string, string>,
    nowLocal: LocalDateTime
  ): TaskTemplateDetail => {
    const rule = parseRule(t.recurrence)
    const openDue = (open?.dueAt ?? null) as LocalDateTime | null
    return {
      id: t.id,
      code: t.code,
      kind: t.kind,
      title: t.title,
      titleI18n: t.title === null ? t.titleI18n : null,
      description: t.description,
      assigneeUserId: t.assigneeUserId,
      assigneeRoleId: t.assigneeRoleId,
      assigneeShiftId: t.assigneeShiftId,
      assigneeName: t.assigneeUserId ? (names.get(t.assigneeUserId) ?? null) : null,
      roomId: t.roomId,
      roomNumber: t.roomId ? (numbers.get(t.roomId) ?? null) : null,
      recurrence: t.recurrence,
      firstDueAt: t.firstDueAt,
      remindMinutesBefore: t.remindMinutesBefore,
      suggested: t.suggested,
      active: t.active,
      lastDoneAt: lastDone,
      nextDueAt: t.active && rule ? upcomingDue(tx, t, rule, openDue, nowLocal) : null,
      openTaskId: open?.id ?? null,
      openTaskDueAt: openDue,
      createdAt: t.createdAt
    }
  }

  const detailOf = (tx: Pick<Tx, 'select'>, id: string): TaskTemplateDetail => {
    const t = getTemplate(tx, id)
    const last = tx
      .select({ doneAt: max(tasks.doneAt) })
      .from(tasks)
      .where(and(eq(tasks.templateId, id), eq(tasks.status, 'done')))
      .get()
    return templateDetail(
      tx,
      t,
      openByTemplate(tx).get(id),
      last?.doneAt ?? t.lastDoneAt,
      userNames(tx),
      roomNumbers(tx),
      nowLocalOf()
    )
  }

  /** The day the work was done → the moment written: now for today, noon of an earlier day. */
  const doneMoment = (doneOn: LocalDate | undefined, now: Date): string => {
    if (!doneOn || doneOn === localDateOf(now)) return now.toISOString()
    if (doneOn > localDateOf(now)) throw invalid('errors.validation', { fields: { doneOn: ['future'] } })
    return new Date(`${doneOn}T12:00:00`).toISOString()
  }

  const screens = {
    /** Tasks the user may see with the names the list shows; done tasks before `doneFrom` are left out. */
    listItems(ctx: Ctx, filter: TaskItemFilter = {}): TaskItem[] {
      const { doneFrom, ...base } = parseInput(taskItemFilterSchema, filter)
      const list = core
        .listTasks(ctx, base)
        .filter((t) => !doneFrom || t.status !== 'done' || (t.doneAt !== null && dayOf(t.doneAt) >= doneFrom))
      const templateIds = [...new Set(list.flatMap((t) => (t.templateId ? [t.templateId] : [])))]
      const templates = new Map(
        (templateIds.length
          ? db.select().from(taskTemplates).where(inArray(taskTemplates.id, templateIds)).all()
          : []
        ).map((t) => [t.id, t])
      )
      const names = userNames(db)
      const numbers = roomNumbers(db)
      return list.map((t) => {
        const template = t.templateId ? templates.get(t.templateId) : undefined
        return {
          ...t,
          kind: template?.kind ?? 'general',
          templateCode: template?.code ?? null,
          recurrence: template?.recurrence ?? null,
          roomNumber: t.roomId ? (numbers.get(t.roomId) ?? null) : null,
          assigneeName: t.assigneeUserId ? (names.get(t.assigneeUserId) ?? null) : null,
          doneByName: t.doneBy ? (names.get(t.doneBy) ?? null) : null
        }
      })
    },

    /** Who and what a task can be given to (form choices, list filters), and whether the user manages tasks. */
    lookups(ctx: Ctx): TaskLookups {
      requirePermission(ctx, 'tasks', 'view')
      const viewer = taskViewer(db, ctx)
      return {
        userId: ctx.userId,
        canManage: viewer.canEdit && !viewer.ownOnly,
        users: db
          .select({ id: users.id, name: users.displayName, active: users.active })
          .from(users)
          .orderBy(asc(users.displayName))
          .all(),
        roles: db
          .select({ id: roles.id, code: roles.code, name: roles.name, nameI18n: roles.nameI18n })
          .from(roles)
          .where(isNull(roles.archivedAt))
          .orderBy(asc(roles.createdAt))
          .all(),
        shifts: db
          .select()
          .from(shiftDefinitions)
          .where(eq(shiftDefinitions.active, true))
          .orderBy(asc(shiftDefinitions.sort), asc(shiftDefinitions.startTime))
          .all()
          .map((s) => ({
            id: s.id,
            code: s.code,
            name: s.name,
            displayName: s.name === null ? s.nameI18n : null,
            startTime: s.startTime,
            endTime: s.endTime,
            sort: s.sort,
            active: s.active
          })),
        // Rooms in use today by their capacity history (K-27), with today's beds.
        rooms: roomsInUseOn(
          db,
          db
            .select({
              id: rooms.id,
              number: rooms.number,
              floor: rooms.floor,
              active: rooms.active,
              sellable: rooms.sellable,
              beds: rooms.beds,
              typeName: roomTypes.name,
              typeNameI18n: roomTypes.nameI18n
            })
            .from(rooms)
            .innerJoin(roomTypes, eq(roomTypes.id, rooms.roomTypeId))
            .orderBy(asc(rooms.sort), asc(rooms.number))
            .all(),
          localDateOf(deps.clock())
        ).map(({ active: _a, sellable: _s, ...room }) => room)
      }
    },

    /** Templates with their next due, last completion and open task (Bakım, legal reminders, suggestions). */
    templateDetails(ctx: Ctx, filter: TemplateDetailFilter = {}): TaskTemplateDetail[] {
      requirePermission(ctx, 'tasks', 'view')
      const f = parseInput(templateDetailFilterSchema, filter)
      const rows = db
        .select()
        .from(taskTemplates)
        .where(
          and(
            f.kind ? inArray(taskTemplates.kind, f.kind) : undefined,
            f.includeInactive ? undefined : eq(taskTemplates.active, true)
          )
        )
        .orderBy(asc(taskTemplates.kind), asc(taskTemplates.createdAt))
        .all()
      if (!rows.length) return []
      const lastDone = new Map(
        db
          .select({ templateId: tasks.templateId, doneAt: max(tasks.doneAt) })
          .from(tasks)
          .where(
            and(
              eq(tasks.status, 'done'),
              inArray(
                tasks.templateId,
                rows.map((r) => r.id)
              )
            )
          )
          .groupBy(tasks.templateId)
          .all()
          .map((r) => [r.templateId as string, r.doneAt])
      )
      const open = openByTemplate(db)
      const names = userNames(db)
      const numbers = roomNumbers(db)
      const nowLocal = nowLocalOf()
      return rows.map((t) =>
        templateDetail(db, t, open.get(t.id), lastDone.get(t.id) ?? t.lastDoneAt, names, numbers, nowLocal)
      )
    },

    /** Creates the tasks due from today to a week ahead (screens and the scheduler call it; idempotent). */
    materializeWindow(ctx: Ctx): TaskRow[] {
      const today = localDateOf(deps.clock())
      return core.materialize(ctx, today, addDays(today, TASK_WINDOW_DAYS + 1))
    },

    /** A repeating task from the Görevler or Bakım form; its first tasks appear at once. */
    addTemplate(ctx: Ctx, input: TaskTemplateInput): TaskTemplateDetail {
      const row = core.createTemplate(ctx, input)
      if (row.active) screens.materializeWindow(ctx)
      return detailOf(db, row.id)
    },

    editTemplate(ctx: Ctx, id: string, patch: TaskTemplateUpdate): TaskTemplateDetail {
      const row = core.updateTemplate(ctx, id, patch)
      if (row.active) screens.materializeWindow(ctx)
      return detailOf(db, row.id)
    },

    /** On (a suggestion, with an optional first due) or off (legal reminders too). */
    setTemplateActive(
      ctx: Ctx,
      id: string,
      input: { active: boolean; firstDueAt?: string | null }
    ): TaskTemplateDetail {
      if (input.active) {
        core.activateTemplate(ctx, id, { firstDueAt: input.firstDueAt ?? null })
        screens.materializeWindow(ctx)
      } else core.deactivateTemplate(ctx, id)
      return detailOf(db, id)
    },

    /** "Gerek yok" on a suggestion: it leaves the Görevler card (Ayarlar still lists it). */
    dismissSuggestion(ctx: Ctx, id: string): TaskTemplateDetail {
      requireTaskManager(ctx)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const before = getTemplate(tx, id)
        if (before.active) throw invalid('errors.validation', { fields: { id: ['active'] } })
        tx.update(taskTemplates)
          .set({ suggested: false, updatedAt: now.toISOString() })
          .where(eq(taskTemplates.id, id))
          .run()
        audit({ entity: 'task_template', entityId: id, action: 'update', before, after: getTemplate(tx, id) })
        return detailOf(tx, id)
      })
    },

    /**
     * "Yapıldı" from Bakım: the template's open task is done (on `doneOn`, default today). An interval or one-off
     * template without an open task gets its current task written first; an every-N-stays template works per
     * room (an early deep clean resets the room's counter).
     */
    completeTemplate(ctx: Ctx, id: string, input: CompleteTemplateInput): TaskRow {
      const data = parseInput(completeTemplateSchema, input)
      requirePermission(ctx, 'tasks', 'edit')
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const template = getTemplate(tx, id)
        const rule = parseRule(template.recurrence)
        if (!rule) throw invalid('errors.validation', { fields: { recurrence: ['invalid rule'] } })
        const doneAtIso = doneMoment(data.doneOn as LocalDate | undefined, now)
        const roomId = data.roomId ?? null
        if (rule.kind === 'everyNStays' && !roomId)
          throw invalid('errors.validation', { fields: { roomId: ['required'] } })
        if (roomId) checkRefs(tx, { roomId })
        const open = tx
          .select()
          .from(tasks)
          .where(
            and(
              eq(tasks.templateId, id),
              eq(tasks.status, 'open'),
              rule.kind === 'everyNStays' && roomId ? eq(tasks.roomId, roomId) : undefined
            )
          )
          .orderBy(asc(tasks.dueAt), asc(tasks.createdAt))
          .get()
        if (open) {
          requireTaskWrite(ctx, open)
          return markDone(tx, audit, ctx, open, doneAtIso, now, data.note)
        }
        if (CALENDAR_KINDS.has(rule.kind)) throw invalid('errors.taskNotOpen')
        if (taskViewer(tx, ctx).ownOnly) throw permissionDenied()
        let dueAt: LocalDateTime | null = null
        if (rule.kind !== 'everyNStays') {
          dueAt = currentDue(tx, template, rule)
          if (!dueAt) throw invalid('errors.taskNotOpen')
          // A task the system parked for this due (schedule change) is reopened rather than written twice; a
          // done or user-cancelled task is history and never reopened here.
          const parked = tx
            .select()
            .from(tasks)
            .where(
              and(
                eq(tasks.templateId, id),
                eq(tasks.dueAt, dueAt),
                eq(tasks.status, 'cancelled'),
                eq(tasks.cancelReason, TEMPLATE_CHANGED_REASON)
              )
            )
            .get()
          if (parked) {
            tx.update(tasks)
              .set({ status: 'open', cancelReason: null, updatedAt: now.toISOString() })
              .where(eq(tasks.id, parked.id))
              .run()
            return markDone(tx, audit, ctx, getTask(tx, parked.id), doneAtIso, now, data.note)
          }
        }
        const row = {
          ...fromTemplate(template, now),
          roomId: rule.kind === 'everyNStays' ? roomId : template.roomId,
          dueAt,
          createdBy: ctx.userId
        }
        tx.insert(tasks).values(row).run()
        audit({ entity: 'task', entityId: row.id, action: 'create', after: row })
        return markDone(tx, audit, ctx, getTask(tx, row.id), doneAtIso, now, data.note)
      })
    },

    /** Every-N-stays counters per room (S-94): checked-out stays since the room's last deep clean. */
    stayCounters(ctx: Ctx): StayCounterGroup[] {
      requirePermission(ctx, 'tasks', 'view')
      const templates = db
        .select()
        .from(taskTemplates)
        .where(eq(taskTemplates.active, true))
        .all()
        .flatMap((t) => {
          const rule = parseRule(t.recurrence)
          return rule?.kind === 'everyNStays' ? [{ t, rule }] : []
        })
      if (!templates.length) return []
      const roomRows = roomsInUseOn(
        db,
        db
          .select({
            id: rooms.id,
            number: rooms.number,
            active: rooms.active,
            sellable: rooms.sellable,
            beds: rooms.beds
          })
          .from(rooms)
          .orderBy(asc(rooms.sort), asc(rooms.number))
          .all(),
        localDateOf(deps.clock())
      ).map(({ id, number }) => ({ id, number }))
      const checkouts: RoomCheckout[] = db
        .select({
          roomId: reservationRooms.roomId,
          checkedOutAt: reservationRooms.checkedOutAt,
          kind: reservations.kind
        })
        .from(reservationRooms)
        .innerJoin(reservations, eq(reservations.id, reservationRooms.reservationId))
        .where(and(isNotNull(reservationRooms.checkedOutAt), ne(reservationRooms.status, 'cancelled')))
        .all()
        .map((c) => ({ roomId: c.roomId, checkOut: dayOf(c.checkedOutAt as string), kind: c.kind }))
      const own = db
        .select()
        .from(tasks)
        .where(
          inArray(
            tasks.templateId,
            templates.map(({ t }) => t.id)
          )
        )
        .all()
      return templates.map(({ t, rule }) => {
        const start: LocalDate = t.firstDueAt ? datePart(t.firstDueAt as LocalDateTime) : dayOf(t.createdAt)
        return {
          templateId: t.id,
          code: t.code,
          title: t.title,
          titleI18n: t.title === null ? t.titleI18n : null,
          n: rule.n,
          rooms: roomRows
            .filter((r) => !t.roomId || t.roomId === r.id)
            .map((r) => {
              const mine = own.filter((x) => x.templateId === t.id && x.roomId === r.id)
              let since = start
              let lastDoneAt: string | null = null
              for (const x of mine) {
                if (x.status === 'open') continue
                if (x.status === 'cancelled' && x.cancelReason === TEMPLATE_CHANGED_REASON) continue
                const closed = dayOf(x.doneAt ?? x.updatedAt)
                if (closed > since) since = closed
                if (x.status === 'done' && x.doneAt && (!lastDoneAt || x.doneAt > lastDoneAt))
                  lastDoneAt = x.doneAt
              }
              const open = mine.find((x) => x.status === 'open')
              return {
                roomId: r.id,
                roomNumber: r.number,
                count: staysSinceLastDone(checkouts, since, rule, r.id),
                since,
                lastDoneAt,
                openTaskId: open?.id ?? null
              }
            })
        }
      })
    },

    /**
     * One notification per template occurrence whose reminder time has come ("3 gün önce",
     * remind_minutes_before) and whose due time has not passed yet; a later run does not repeat it (keyed like
     * UNIQUE(template, due)). Run by the scheduler (systemCtx) or a task manager.
     */
    notifyReminders(ctx: Ctx, at?: Date): NotificationRow[] {
      requireTaskManager(ctx)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const moment = at ?? now
        const nowLocal = localDateTimeOf(moment)
        const open = openByTemplate(tx)
        const ids: string[] = []
        for (const t of tx.select().from(taskTemplates).where(eq(taskTemplates.active, true)).all()) {
          const minutes = t.remindMinutesBefore ?? 0
          const rule = parseRule(t.recurrence)
          if (minutes <= 0 || !rule || rule.kind === 'everyNStays') continue
          const openDue = (open.get(t.id)?.dueAt ?? null) as LocalDateTime | null
          const due = upcomingDue(tx, t, rule, openDue && openDue > nowLocal ? openDue : null, nowLocal)
          if (!due || due <= nowLocal || remindAt(due, minutes) > nowLocal) continue
          const key = taskKey(t.id, due)
          if (
            tx
              .select({ id: notifications.id })
              .from(notifications)
              .where(and(eq(notifications.kind, 'task_reminder'), eq(notifications.refId, key)))
              .get()
          )
            continue
          const id = newId(now)
          tx.insert(notifications)
            .values({
              id,
              kind: 'task_reminder',
              refId: key,
              userId: t.assigneeUserId,
              title: titleOf(t),
              body: due,
              dueAt: moment.toISOString(),
              ...stamps(now)
            })
            .run()
          audit({
            entity: 'task_template',
            entityId: t.id,
            action: 'update',
            after: { reminderFor: due, notificationId: id }
          })
          ids.push(id)
        }
        return ids.length ? tx.select().from(notifications).where(inArray(notifications.id, ids)).all() : []
      })
    },

    /** The scheduler's round (systemCtx): today's and the coming week's tasks, then late and reminder notices. */
    runSchedule(ctx: Ctx, at?: Date): NotificationRow[] {
      screens.materializeWindow(ctx)
      return [...core.notifyOverdue(ctx, at), ...screens.notifyReminders(ctx, at)]
    }
  }

  return { ...core, ...screens }
}

export type TasksService = ReturnType<typeof createTasksService>
