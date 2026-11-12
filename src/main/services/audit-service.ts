// Reading the audit log (G-24): who changed what, when and from which device; newest first, filtered and
// paged with a cursor. Read-only: the log is written only by the services inside their transactions.
import { and, desc, eq, gte, lt, or, type SQL } from 'drizzle-orm'
import { auditFilterSchema, type AuditFilter } from '@shared/contract/users'
import { maskDocNumber } from '@shared/domain/normalize'
import { auditLog, devices, users } from '../db/schema'
import { IDENTITY_KEYS } from './audit'
import { sectionAccess } from './expenses-service'
import type { PermissionKey } from '@shared/permissions'
import type { Ctx } from './context'
import { invalid, parseInput, requirePermission, type ServiceDeps } from './kit'

export interface AuditEntryView {
  id: string
  ts: string
  userId: string | null
  userName: string | null
  deviceId: string | null
  deviceName: string | null
  entity: string
  entityId: string
  action: string
  before: unknown
  after: unknown
  reason: string | null
}

export interface AuditPage {
  entries: AuditEntryView[]
  /** Pass as `cursor` for the next (older) page; null on the last page. */
  nextCursor: string | null
}

/**
 * Rows of a module the reader cannot open: their contents are hidden like salary rows (who, when and what kind of
 * change stay). A role given the audit log alone does not read guests' names, phones and e-mails, staff cards or
 * the phone book through it (Faz 4 bug hunt #15, G-23).
 */
const MODULE_OF_ENTITY: Readonly<Record<string, PermissionKey>> = {
  guest: 'guests',
  stay_occupant: 'guests',
  reservation: 'calendar',
  reservation_room: 'calendar',
  reservation_note: 'calendar',
  blacklist: 'blacklist',
  company: 'companies',
  lost_item: 'lost_items',
  contact: 'contacts',
  employee: 'staff',
  employment_period: 'staff',
  work_record: 'staff',
  leave_record: 'staff'
}

/** Rows that are salary data as a whole: hidden from readers without `staff.salary` view (K-38). */
const SALARY_ENTITIES: ReadonlySet<string> = new Set([
  'employee_salary',
  'salary_period',
  'staff_transaction',
  'pay_policy'
])

function maskIdentity(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(maskIdentity)
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value).map(([k, v]) => [
      k,
      IDENTITY_KEYS.has(k) && typeof v === 'string' ? maskDocNumber(v) : maskIdentity(v)
    ])
  )
}

const parseJson = (text: string | null): unknown => {
  if (text === null) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

/** Cursor = "<ts>|<id>" of the last entry shown (ids are unique, so equal times keep a stable order). */
const encodeCursor = (ts: string, id: string): string => Buffer.from(`${ts}|${id}`).toString('base64url')

function decodeCursor(cursor: string): { ts: string; id: string } {
  const text = Buffer.from(cursor, 'base64url').toString('utf8')
  const bar = text.indexOf('|')
  if (bar <= 0) throw invalid('errors.validation', { fields: { cursor: ['invalid'] } })
  return { ts: text.slice(0, bar), id: text.slice(bar + 1) }
}

export function createAuditService(deps: ServiceDeps) {
  const { db } = deps

  return {
    list(ctx: Ctx, filter: AuditFilter = {}): AuditPage {
      requirePermission(ctx, 'audit_log', 'view')
      const f = parseInput(auditFilterSchema, filter)
      const where: (SQL | undefined)[] = [
        f.entity ? eq(auditLog.entity, f.entity) : undefined,
        f.entityId ? eq(auditLog.entityId, f.entityId) : undefined,
        f.userId ? eq(auditLog.userId, f.userId) : undefined,
        f.deviceId ? eq(auditLog.deviceId, f.deviceId) : undefined,
        f.action ? eq(auditLog.action, f.action) : undefined,
        f.from ? gte(auditLog.ts, new Date(f.from).toISOString()) : undefined,
        f.to ? lt(auditLog.ts, new Date(f.to).toISOString()) : undefined
      ]
      if (f.cursor) {
        const c = decodeCursor(f.cursor)
        where.push(or(lt(auditLog.ts, c.ts), and(eq(auditLog.ts, c.ts), lt(auditLog.id, c.id))))
      }
      const rows = db
        .select({ a: auditLog, userName: users.displayName, deviceName: devices.name })
        .from(auditLog)
        .leftJoin(users, eq(users.id, auditLog.userId))
        .leftJoin(devices, eq(devices.id, auditLog.deviceId))
        .where(and(...where))
        .orderBy(desc(auditLog.ts), desc(auditLog.id))
        .limit(f.limit + 1)
        .all()
      const page = rows.slice(0, f.limit)
      const last = page.at(-1)
      // The log mirrors data the reader may not see elsewhere: mask it the same way (G-23).
      const seesIdentity = ctx.can('guests.identity', 'view')
      const seesSalary = ctx.can('staff.salary', 'view')
      const visibleSections = new Set(sectionAccess(db, ctx).viewIds)
      // An expense row is salary data when it is a staff payment, and hidden when its section is (G-67).
      const hiddenExpense = (value: unknown): boolean => {
        if (value === null || typeof value !== 'object') return false
        const row = value as { kind?: unknown; sectionId?: unknown }
        return (
          (row.kind === 'staff' && !seesSalary) ||
          (typeof row.sectionId === 'string' && !visibleSections.has(row.sectionId))
        )
      }
      const shown = (entity: string, json: string | null): unknown => {
        if (json === null) return null
        if (!seesSalary && SALARY_ENTITIES.has(entity)) return { hidden: true }
        const module = MODULE_OF_ENTITY[entity]
        if (module && !ctx.can(module, 'view')) return { hidden: true }
        const value = parseJson(json)
        if (entity === 'expense' && hiddenExpense(value)) return { hidden: true }
        return seesIdentity ? value : maskIdentity(value)
      }
      return {
        entries: page.map(({ a, userName, deviceName }) => ({
          id: a.id,
          ts: a.ts,
          userId: a.userId,
          userName: userName ?? null,
          deviceId: a.deviceId,
          deviceName: deviceName ?? null,
          entity: a.entity,
          entityId: a.entityId,
          action: a.action,
          before: shown(a.entity, a.beforeJson),
          after: shown(a.entity, a.afterJson),
          reason: a.reason
        })),
        nextCursor: rows.length > f.limit && last ? encodeCursor(last.a.ts, last.a.id) : null
      }
    }
  }
}

export type AuditService = ReturnType<typeof createAuditService>
