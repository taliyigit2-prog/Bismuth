import { maskDocNumber } from '@shared/domain/normalize'
import { ulid } from '@shared/ids'
import type { DbOrTx } from '../db/client'
import { auditLog } from '../db/schema'
import type { Ctx } from './context'

export type { AuditAction } from '@shared/audit'
import type { AuditAction } from '@shared/audit'

export interface AuditEntry {
  entity: string
  entityId: string
  /** create, update, void, cancel, restore, check_in, check_out, handover, merge, close, reopen, login… */
  action: AuditAction
  before?: unknown
  after?: unknown
  reason?: string
}

/** Identity document fields: the log keeps them masked, the guest row is the only full copy (KVKK, G-50). */
export const IDENTITY_KEYS: ReadonlySet<string> = new Set(['idDocNumber'])

const auditJson = (value: unknown): string | null =>
  value === undefined
    ? null
    : JSON.stringify(value, (key, v: unknown) =>
        IDENTITY_KEYS.has(key) && typeof v === 'string' ? maskDocNumber(v) : v
      )

/** Append one audit row; call inside the same transaction as the write it describes (G-24). */
export function writeAudit(db: DbOrTx, ctx: Ctx, entry: AuditEntry, now: Date = new Date()): void {
  writeAuditAs(db, ctx, entry, now)
}

/** The same row for flows without a ctx (sign-in): the user or device may be unknown (null). */
export function writeAuditAs(
  db: DbOrTx,
  who: { userId: string | null; deviceId: string | null },
  entry: AuditEntry,
  now: Date
): void {
  db.insert(auditLog)
    .values({
      id: ulid(now.getTime()),
      ts: now.toISOString(),
      userId: who.userId,
      deviceId: who.deviceId,
      entity: entry.entity,
      entityId: entry.entityId,
      action: entry.action,
      beforeJson: auditJson(entry.before),
      afterJson: auditJson(entry.after),
      reason: entry.reason ?? null
    })
    .run()
}
