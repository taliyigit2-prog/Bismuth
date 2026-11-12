// Shared plumbing for every service (03-mimari.md §1.5; CLAUDE.md yasak 7, 11): permission checks, input
// validation, transactions with audit rows, typed errors. Services never import Electron.
import type * as z from 'zod'
import { nameKey } from '@shared/name-key'
import { ulid } from '@shared/ids'
import { PERMISSION_KEYS, type PermissionKey, type PermissionLevel } from '@shared/permissions'
import type { BismuthDb, DbOrTx } from '../db/client'
import { writeAudit, type AuditEntry } from './audit'
import type { Ctx } from './context'
import { AppError, permissionDenied } from './errors'

export interface ServiceDeps {
  db: BismuthDb
  /** Injected clock: tests move time; production uses `() => new Date()`. */
  clock: () => Date
  /**
   * Why nothing may be written on this computer right now, whoever asks (the program's own jobs included): another
   * computer took over as the main computer (P13b, O-4). Absent: writes are allowed.
   */
  writeGate?: () => 'replaced' | null
}

export type Tx = Parameters<Parameters<BismuthDb['transaction']>[0]>[0]

/** Throws PERMISSION_DENIED unless the user has `level` on `key` (edit implies view). */
export function requirePermission(
  ctx: Ctx,
  key: PermissionKey,
  level: Exclude<PermissionLevel, 'none'>
): void {
  if (!ctx.can(key, level))
    throw level === 'edit' && ctx.readOnly ? readOnlyError(ctx.readOnly) : permissionDenied()
}

/**
 * A change asked of a context that may change nothing (Faz 13): the read-only copy on the owner's computer, or a
 * main computer another one took over from. CONFLICT, not "no connection": the screen stays on the copy.
 */
export const readOnlyError = (why: 'replica' | 'replaced'): AppError =>
  new AppError('CONFLICT', why === 'replica' ? 'errors.readOnlyCopy' : 'errors.notMainComputer')

/**
 * A caller with some right at all: the program, the open setup wizard, or a user whose role opens at least one
 * area. Anonymous and locked windows and an account that must change its password first have none.
 */
export const hasAnyAccess = (ctx: Ctx): boolean => PERMISSION_KEYS.some((key) => ctx.can(key, 'view'))

/** Validates service input with the shared zod schema; failures are VALIDATION with field errors. */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input)
  if (!result.success) {
    const fields: Record<string, string[]> = {}
    for (const issue of result.error.issues) {
      const path = issue.path.join('.') || '_'
      ;(fields[path] ??= []).push(issue.message)
    }
    throw new AppError('VALIDATION', 'errors.validation', { fields })
  }
  return result.data
}

export const notFound = (entity: string, id?: string): AppError =>
  new AppError('NOT_FOUND', 'errors.notFound', { entity, id })

export const conflict = (messageKey: string, details?: unknown): AppError =>
  new AppError('CONFLICT', messageKey, details)

export const invalid = (messageKey: string, details?: unknown): AppError =>
  new AppError('VALIDATION', messageKey, details)

/**
 * A new or renamed name may not repeat another row's, whatever the letter case (Turkish rules, `nameKey`). A seeded
 * row's translations count too: that is the name people see in their language. Rows that already share a name are
 * left as they are; only the name being written is checked.
 */
export function assertNameFree(
  rows: readonly {
    id: string
    name: string | null
    nameI18n?: { tr?: string; en?: string; ru?: string } | null
  }[],
  name: string,
  exceptId?: string
): void {
  const key = nameKey(name)
  const taken = rows.some(
    (r) =>
      r.id !== exceptId &&
      [r.name, r.nameI18n?.tr, r.nameI18n?.en, r.nameI18n?.ru].some(
        (n) => n !== undefined && n !== null && nameKey(n) === key
      )
  )
  if (taken) throw conflict('errors.nameTaken', { name })
}

export const newId = (now: Date): string => ulid(now.getTime())

/** SQLite caps the bound variables of one statement: long id lists are read and written in slices. */
export function inChunks<T>(items: readonly T[], size = 500): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/**
 * The one gate every service write passes (O-4): a read-only context (the owner's copy, a replaced main computer)
 * and, on a replaced computer, the program's own jobs (`systemCtx`: backups, rates, task rounds) write nothing,
 * whatever right the method checked before (a "view" right that writes, like marking a handover as read).
 */
export function writeRefusal(deps: Pick<ServiceDeps, 'writeGate'>, ctx: Ctx): AppError | null {
  if (ctx.readOnly) return readOnlyError(ctx.readOnly)
  const gate = deps.writeGate?.() ?? null
  return gate ? readOnlyError(gate) : null
}

/** Runs `fn` in one SQLite transaction; `audit` appends rows to audit_log inside the same transaction. */
export function inTransaction<T>(
  deps: ServiceDeps,
  ctx: Ctx,
  fn: (tx: Tx, audit: (entry: AuditEntry) => void, now: Date) => T
): T {
  const refusal = writeRefusal(deps, ctx)
  if (refusal) throw refusal
  const now = deps.clock()
  return deps.db.transaction((tx) => fn(tx, (entry) => writeAudit(tx as DbOrTx, ctx, entry, now), now))
}

/** Timestamps for a new row. */
export const stamps = (now: Date): { createdAt: string; updatedAt: string } => {
  const iso = now.toISOString()
  return { createdAt: iso, updatedAt: iso }
}
