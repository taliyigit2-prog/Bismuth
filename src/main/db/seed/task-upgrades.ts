// Seeded task templates whose first-release values were wrong (Faz 9 bug hunt): corrected at every start, but
// only while the hotel has not changed the field itself (a changed template is the hotel's choice and stays).
// Idempotent: once corrected, the "old value" checks no longer match. Every change is written to audit_log
// (system: no user, no device).
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { localDateOf } from '@shared/date'
import { ulid } from '@shared/ids'
import type { BismuthDb } from '../client'
import { taskTemplates, tasks } from '../schema'
import { writeAuditAs } from '../../services/audit'
import { TEMPLATE_CHANGED_REASON } from '../../services/tasks-service'
import {
  DEEP_CLEAN_CODE,
  DEEP_CLEAN_ROLE,
  TOURISM_REMIND_MINUTES,
  TOURISM_RULE,
  TOURISM_RULE_V1
} from './tasks'

const REASON = 'seed_upgrade'
const SYSTEM = { userId: null, deviceId: null }

const sameRule = (a: unknown, b: Record<string, unknown>): boolean => {
  if (typeof a !== 'object' || a === null) return false
  const r = a as Record<string, unknown>
  return Object.keys(b).length === Object.keys(r).length && Object.entries(b).every(([k, v]) => r[k] === v)
}

/** Returns how many templates were corrected. Runs inside the seed's transaction. */
// Runs at start-up with the seed, outside the services' write gate on purpose: a one-time upgrade of untouched
// default templates (the same on every computer of the same version), not an edit of hotel data.
export function upgradeTaskTemplates(
  db: BismuthDb,
  roleIdOf: ReadonlyMap<string, string>,
  now: Date
): number {
  const iso = now.toISOString()
  let changed = 0

  // G-93: the tourism statistics is due on the 10th (reminder from the 1st), not on the 1st at 09:00.
  const tourism = db.select().from(taskTemplates).where(eq(taskTemplates.code, 'legal_tourism_stats')).get()
  if (tourism && sameRule(tourism.recurrence, TOURISM_RULE_V1) && tourism.remindMinutesBefore === null) {
    db.update(taskTemplates)
      .set({
        recurrence: { ...TOURISM_RULE },
        remindMinutesBefore: TOURISM_REMIND_MINUTES,
        materializedUntil: null,
        updatedAt: iso
      })
      .where(eq(taskTemplates.id, tourism.id))
      .run()
    writeAuditAs(
      db,
      SYSTEM,
      {
        entity: 'task_template',
        entityId: tourism.id,
        action: 'update',
        before: { recurrence: tourism.recurrence, remindMinutesBefore: tourism.remindMinutesBefore },
        after: { recurrence: TOURISM_RULE, remindMinutesBefore: TOURISM_REMIND_MINUTES },
        reason: REASON
      },
      now
    )
    const oldTasks = db.select().from(tasks).where(eq(tasks.templateId, tourism.id)).all()
    // Open tasks of the old schedule (due on the 1st) give way to the new one (written by the next round).
    const open = oldTasks.filter((x) => x.status === 'open').map((x) => x.id)
    if (open.length) {
      db.update(tasks)
        .set({ status: 'cancelled', cancelReason: TEMPLATE_CHANGED_REASON, updatedAt: iso })
        .where(inArray(tasks.id, open))
        .run()
      writeAuditAs(
        db,
        SYSTEM,
        { entity: 'task', entityId: tourism.id, action: 'cancel', before: { ids: open }, reason: REASON },
        now
      )
    }
    // This month's duty already ticked off under the old schedule stays done under the new one.
    const month = localDateOf(now).slice(0, 7)
    const doneNow = oldTasks.find((x) => x.status === 'done' && x.dueAt?.startsWith(`${month}-`))
    const newDue = `${month}-${String(TOURISM_RULE.day).padStart(2, '0')}T${TOURISM_RULE.time}`
    if (doneNow && !oldTasks.some((x) => x.dueAt === newDue)) {
      const row = { ...doneNow, id: ulid(now.getTime()), dueAt: newDue, updatedAt: iso }
      db.insert(tasks).values(row).onConflictDoNothing().run()
      writeAuditAs(
        db,
        SYSTEM,
        { entity: 'task', entityId: row.id, action: 'create', after: row, reason: REASON },
        now
      )
    }
    changed++
  }

  // The deep clean is Temizlik's job: without an assignee the housekeeping role (own tasks only) never saw it.
  const deepClean = db.select().from(taskTemplates).where(eq(taskTemplates.code, DEEP_CLEAN_CODE)).get()
  const roleId = roleIdOf.get(DEEP_CLEAN_ROLE)
  if (
    deepClean &&
    roleId &&
    !deepClean.assigneeUserId &&
    !deepClean.assigneeRoleId &&
    !deepClean.assigneeShiftId
  ) {
    db.update(taskTemplates)
      .set({ assigneeRoleId: roleId, updatedAt: iso })
      .where(eq(taskTemplates.id, deepClean.id))
      .run()
    const open = db
      .select({ id: tasks.id })
      .from(tasks)
      .where(
        and(
          eq(tasks.templateId, deepClean.id),
          eq(tasks.status, 'open'),
          isNull(tasks.assigneeUserId),
          isNull(tasks.assigneeRoleId),
          isNull(tasks.assigneeShiftId)
        )
      )
      .all()
      .map((x) => x.id)
    if (open.length)
      db.update(tasks).set({ assigneeRoleId: roleId, updatedAt: iso }).where(inArray(tasks.id, open)).run()
    writeAuditAs(
      db,
      SYSTEM,
      {
        entity: 'task_template',
        entityId: deepClean.id,
        action: 'update',
        before: { assigneeRoleId: null },
        after: { assigneeRoleId: roleId, openTasks: open },
        reason: REASON
      },
      now
    )
    changed++
  }
  return changed
}
