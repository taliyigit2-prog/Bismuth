// Attachments (K-25, G-180, S-64): photos and PDFs of issues, receipts, laundry slips, lost items and tasks.
// Files live only under `userData/attachments/<entity>/<yyyy>/<id>.<ext>`; the row keeps the relative path and
// the sha256 and outlives the file. The type is checked against the file's own signature, never the name.
// A photo of a resolved issue can be deleted by hand, and is deleted by itself after the retention days
// (setting `attachments.resolvedIssueRetentionDays`) so backups do not grow; the issue text stays.
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { and, asc, eq, inArray, isNotNull, isNull, lt } from 'drizzle-orm'
import {
  ATTACHMENT_MAX_BYTES,
  attachmentInputSchema,
  type AttachmentEntity,
  type AttachmentInput,
  type AttachmentMime
} from '@shared/contract/supply'
import type { PermissionKey } from '@shared/permissions'
import {
  attachments,
  expenseSections,
  expenses,
  laundryDeliveries,
  lostItems,
  roomIssues,
  tasks
} from '../db/schema'
import type { Ctx } from './context'
import { AppError, permissionDenied } from './errors'
import {
  conflict,
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
import { readSetting } from './settings-service'
import { canSeeTask, taskViewer } from './tasks-service'

export type AttachmentRow = typeof attachments.$inferSelect

/** Optional image step (downscale, strip metadata) injected by the main process; tests run without it. */
export type ProcessImage = (
  bytes: Uint8Array,
  mime: AttachmentMime
) => { bytes: Uint8Array; width: number | null; height: number | null }

export interface AttachmentsDeps extends ServiceDeps {
  /** Absolute `userData/attachments` directory. */
  attachmentsDir: string
  processImage?: ProcessImage
}

/** Which permission guards the files of each entity (view to read, edit to add). */
const ENTITY_PERMISSION: Record<AttachmentEntity, PermissionKey> = {
  room_issue: 'room_issues',
  expense: 'expenses',
  laundry_delivery: 'laundry',
  lost_item: 'lost_items',
  task: 'tasks'
}

/** Files per record (photos of one issue, receipts of one expense…): keeps backups from growing without bound. */
export const MAX_FILES_PER_RECORD = 20

const EXTENSION: Record<AttachmentMime, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf'
}

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0): boolean =>
  signature.every((b, i) => bytes[offset + i] === b)

/** The real type from the first bytes (JPEG, PNG, WebP, PDF); null for anything else. */
export function sniffMime(bytes: Uint8Array): AttachmentMime | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8))
    return 'image/webp'
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf'
  return null
}

/** `path` (relative, from the row) resolved inside `root`; anything that would leave it is refused. */
export function insideRoot(root: string, path: string): string {
  if (isAbsolute(path)) throw new AppError('VALIDATION', 'errors.attachmentPath')
  const full = resolve(root, path)
  const rel = relative(resolve(root), full)
  if (!rel || rel.startsWith('..') || isAbsolute(rel))
    throw new AppError('VALIDATION', 'errors.attachmentPath')
  return full
}

export function createAttachmentsService(deps: AttachmentsDeps) {
  const { db, attachmentsDir } = deps

  const rowOf = (tx: Pick<Tx, 'select'>, id: string): AttachmentRow => {
    const row = tx.select().from(attachments).where(eq(attachments.id, id)).get()
    if (!row) throw notFound('attachment', id)
    return row
  }

  /**
   * The record a file belongs to must exist and be visible to the caller: an expense of a hidden section
   * (yönetici giderleri, G-67) or a task the caller may not see (§6.17) stays closed even with the type's right.
   */
  const assertParent = (
    ctx: Ctx,
    entity: AttachmentEntity,
    entityId: string,
    level: 'view' | 'edit'
  ): void => {
    switch (entity) {
      case 'expense': {
        const row = db.select().from(expenses).where(eq(expenses.id, entityId)).get()
        if (!row) throw notFound('expense', entityId)
        const section = db.select().from(expenseSections).where(eq(expenseSections.id, row.sectionId)).get()
        if (!section || !ctx.can(section.visibilityPermission, level)) throw permissionDenied()
        return
      }
      case 'task': {
        const row = db.select().from(tasks).where(eq(tasks.id, entityId)).get()
        if (!row) throw notFound('task', entityId)
        if (!canSeeTask(taskViewer(db, ctx), row)) throw permissionDenied()
        return
      }
      case 'room_issue':
        if (!db.select({ id: roomIssues.id }).from(roomIssues).where(eq(roomIssues.id, entityId)).get())
          throw notFound('room_issue', entityId)
        return
      case 'laundry_delivery':
        if (
          !db
            .select({ id: laundryDeliveries.id })
            .from(laundryDeliveries)
            .where(eq(laundryDeliveries.id, entityId))
            .get()
        )
          throw notFound('laundry_delivery', entityId)
        return
      case 'lost_item':
        if (!db.select({ id: lostItems.id }).from(lostItems).where(eq(lostItems.id, entityId)).get())
          throw notFound('lost_item', entityId)
        return
    }
  }

  const removeFile = (row: AttachmentRow): void => {
    rmSync(insideRoot(attachmentsDir, row.path), { force: true })
  }

  return {
    /** Files of one record (deleted files keep their row, marked `deletedAt`). */
    list(ctx: Ctx, entity: AttachmentEntity, entityId: string): AttachmentRow[] {
      requirePermission(ctx, ENTITY_PERMISSION[entity], 'view')
      assertParent(ctx, entity, entityId, 'view')
      return db
        .select()
        .from(attachments)
        .where(and(eq(attachments.entity, entity), eq(attachments.entityId, entityId)))
        .orderBy(asc(attachments.createdAt))
        .all()
    },

    /** Stores the file under the attachments folder and records path + sha256 (K-25). */
    add(ctx: Ctx, input: AttachmentInput): AttachmentRow {
      const data = parseInput(attachmentInputSchema, input)
      requirePermission(ctx, ENTITY_PERMISSION[data.entity], 'edit')
      assertParent(ctx, data.entity, data.entityId, 'edit')
      const stored = db
        .select({ id: attachments.id })
        .from(attachments)
        .where(
          and(
            eq(attachments.entity, data.entity),
            eq(attachments.entityId, data.entityId),
            isNull(attachments.deletedAt)
          )
        )
        .all().length
      if (stored >= MAX_FILES_PER_RECORD)
        throw invalid('errors.attachmentLimit', { max: MAX_FILES_PER_RECORD })
      if (data.bytes.byteLength === 0 || data.bytes.byteLength > ATTACHMENT_MAX_BYTES)
        throw invalid('errors.attachmentTooLarge', { max: ATTACHMENT_MAX_BYTES })
      const mime = sniffMime(data.bytes)
      if (!mime || mime !== data.mime) throw invalid('errors.attachmentType', { declared: data.mime })
      const processed =
        mime !== 'application/pdf' && deps.processImage
          ? deps.processImage(data.bytes, mime)
          : { bytes: data.bytes, width: null, height: null }
      const now = deps.clock()
      const id = newId(now)
      const path = join(data.entity, String(now.getFullYear()), `${id}.${EXTENSION[mime]}`).replace(
        /\\/g,
        '/'
      )
      const full = insideRoot(attachmentsDir, path)
      mkdirSync(dirname(full), { recursive: true })
      writeFileSync(full, processed.bytes)
      try {
        return inTransaction(deps, ctx, (tx, audit) => {
          const row: AttachmentRow = {
            id,
            entity: data.entity,
            entityId: data.entityId,
            path,
            mime,
            bytes: processed.bytes.byteLength,
            sha256: createHash('sha256').update(processed.bytes).digest('hex'),
            width: processed.width,
            height: processed.height,
            createdBy: ctx.userId,
            deletedAt: null,
            deletedBy: null,
            ...stamps(now)
          }
          tx.insert(attachments).values(row).run()
          audit({
            entity: 'attachment',
            entityId: id,
            action: 'create',
            after: { ...row, fileName: data.fileName }
          })
          return row
        })
      } catch (error) {
        rmSync(full, { force: true }) // no orphan file when the row could not be written
        throw error
      }
    },

    /** The file's bytes, after checking it is still the file that was stored (sha256). */
    read(ctx: Ctx, id: string): { row: AttachmentRow; bytes: Uint8Array } {
      const row = rowOf(db, id)
      requirePermission(ctx, ENTITY_PERMISSION[row.entity], 'view')
      assertParent(ctx, row.entity, row.entityId, 'view')
      if (row.deletedAt) throw conflict('errors.attachmentDeleted')
      const bytes = readFileSync(insideRoot(attachmentsDir, row.path))
      if (createHash('sha256').update(bytes).digest('hex') !== row.sha256)
        throw new AppError('CONFLICT', 'errors.attachmentChanged')
      return { row, bytes: new Uint8Array(bytes) }
    },

    /** Deletes the file of a resolved issue's photo by hand (S-64); the row stays as a trace. */
    deleteFile(ctx: Ctx, id: string): AttachmentRow {
      const row = rowOf(db, id)
      requirePermission(ctx, ENTITY_PERMISSION[row.entity], 'edit')
      assertParent(ctx, row.entity, row.entityId, 'edit')
      if (row.deletedAt) return row
      if (row.entity !== 'room_issue') throw conflict('errors.attachmentKept')
      const issue = db.select().from(roomIssues).where(eq(roomIssues.id, row.entityId)).get()
      if (issue?.status !== 'resolved') throw conflict('errors.attachmentKept')
      const after = inTransaction(deps, ctx, (tx, audit, now) => {
        tx.update(attachments)
          .set({ deletedAt: now.toISOString(), deletedBy: ctx.userId, updatedAt: now.toISOString() })
          .where(eq(attachments.id, id))
          .run()
        const updated = rowOf(tx, id)
        audit({ entity: 'attachment', entityId: id, action: 'file_delete', before: row, after: updated })
        return updated
      })
      removeFile(row) // after the commit: a failed write never leaves a row pointing at a missing file
      return after
    },

    /**
     * Deletes the files of issues resolved more than the retention days ago (run daily by the scheduler).
     * Returns how many files went.
     */
    purgeResolvedIssueFiles(ctx: Ctx): number {
      requirePermission(ctx, 'room_issues', 'edit')
      const days = readSetting(db, 'attachments.resolvedIssueRetentionDays')
      const now = deps.clock()
      const cutoff = new Date(now.getTime() - days * 86_400_000).toISOString()
      const issues = db
        .select({ id: roomIssues.id })
        .from(roomIssues)
        .where(
          and(
            eq(roomIssues.status, 'resolved'),
            isNotNull(roomIssues.resolvedAt),
            lt(roomIssues.resolvedAt, cutoff)
          )
        )
        .all()
        .map((i) => i.id)
      if (!issues.length) return 0
      const files = db
        .select()
        .from(attachments)
        .where(
          and(
            eq(attachments.entity, 'room_issue'),
            inArray(attachments.entityId, issues),
            isNull(attachments.deletedAt)
          )
        )
        .all()
      if (!files.length) return 0
      const count = inTransaction(deps, ctx, (tx, audit, at) => {
        const iso = at.toISOString()
        for (const f of files)
          tx.update(attachments).set({ deletedAt: iso, updatedAt: iso }).where(eq(attachments.id, f.id)).run()
        audit({
          entity: 'attachment',
          entityId: 'retention',
          action: 'file_delete',
          after: { ids: files.map((f) => f.id), retentionDays: days }
        })
        return files.length
      })
      for (const f of files) removeFile(f)
      return count
    }
  }
}

export type AttachmentsService = ReturnType<typeof createAttachmentsService>
