// Room issues ("501 tuvalet kapağı kırık"; G-180, S-64, S-76): open → planned → resolved, never deleted, no
// cost field (the repair is an expense in the ledger). "Odayı satışa kapat" (blocks_room) puts an
// out-of-service block on the room from today until the night before its next sold night (one year at most);
// resolving the issue ends that block on the resolution day. Closing a room for sale is a sales decision, so
// it also needs `rooms.block` (housekeeping may report but not close the room).
import { and, asc, desc, eq, inArray, isNull, type SQL } from 'drizzle-orm'
import {
  roomIssueInputSchema,
  roomIssueListSchema,
  roomIssuePlanSchema,
  roomIssueResolveSchema,
  roomIssueUpdateSchema,
  type RoomIssueInput,
  type RoomIssueListInput,
  type RoomIssuePlan,
  type RoomIssueResolve,
  type RoomIssueUpdate
} from '@shared/contract/supply'
import { attachments, auditLog, roomBlocks, roomIssues, rooms, users } from '../db/schema'
import type { Ctx } from './context'
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
import {
  AUTO_BLOCK_MAX_DAYS,
  endAutoBlock,
  liveBlockWhere,
  openAutoBlock,
  type AuditFn,
  type RoomBlockRow
} from './room-blocks'

export type RoomIssueRow = typeof roomIssues.$inferSelect
export type { RoomBlockRow }

export interface RoomIssueView extends RoomIssueRow {
  roomNumber: string | null
  /** Display names of who reported and who resolved it (the ids stay in the row). */
  reportedByName: string | null
  resolvedByName: string | null
  /** Solved and reopened events, oldest first (audit log); note = solution note or reopen reason. */
  history: { kind: 'resolved' | 'reopened'; at: string; byName: string | null; note: string | null }[]
  /** Photos and files still kept (a deleted file is not counted). */
  photos: number
  /** The out-of-service block of this issue that is still in force, if any. */
  block: RoomBlockRow | null
}

/** Longest automatic block of an issue (it ends earlier when the issue is resolved). */
export const ISSUE_BLOCK_MAX_DAYS = AUTO_BLOCK_MAX_DAYS

export function createRoomIssuesService(deps: ServiceDeps) {
  const { db } = deps

  const issueOf = (tx: Pick<Tx, 'select'>, id: string): RoomIssueRow => {
    const row = tx.select().from(roomIssues).where(eq(roomIssues.id, id)).get()
    if (!row) throw notFound('room_issue', id)
    return row
  }

  const liveBlock = (tx: Pick<Tx, 'select'>, issueId: string): RoomBlockRow | null =>
    liveBlockWhere(tx, eq(roomBlocks.roomIssueId, issueId))

  /**
   * Every "çözüldü" and "yeniden açıldı" of the issue, oldest first, from its audit rows (G-24): a reopened issue
   * keeps the earlier solution and why it was reopened.
   */
  const historyOf = (tx: Pick<Tx, 'select'>, id: string): RoomIssueView['history'] =>
    tx
      .select({
        action: auditLog.action,
        ts: auditLog.ts,
        userId: auditLog.userId,
        afterJson: auditLog.afterJson,
        reason: auditLog.reason
      })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.entity, 'room_issue'),
          eq(auditLog.entityId, id),
          inArray(auditLog.action, ['done', 'reopen'])
        )
      )
      .orderBy(asc(auditLog.ts), asc(auditLog.id))
      .all()
      .map((a) => {
        let note: string | null = a.reason
        if (a.action === 'done') {
          try {
            const after = JSON.parse(a.afterJson ?? 'null') as { resolutionNote?: unknown } | null
            note = typeof after?.resolutionNote === 'string' ? after.resolutionNote : null
          } catch {
            note = null
          }
        }
        return {
          kind: a.action === 'done' ? ('resolved' as const) : ('reopened' as const),
          at: a.ts,
          byName: nameOf(tx, a.userId),
          note
        }
      })

  const nameOf = (tx: Pick<Tx, 'select'>, userId: string | null): string | null =>
    userId
      ? (tx.select({ name: users.displayName }).from(users).where(eq(users.id, userId)).get()?.name ?? null)
      : null

  const view = (tx: Pick<Tx, 'select'>, row: RoomIssueRow): RoomIssueView => ({
    ...row,
    roomNumber: row.roomId
      ? (tx.select({ number: rooms.number }).from(rooms).where(eq(rooms.id, row.roomId)).get()?.number ??
        null)
      : null,
    reportedByName: nameOf(tx, row.reportedBy),
    resolvedByName: nameOf(tx, row.resolvedBy),
    history: historyOf(tx, row.id),
    photos: tx
      .select({ id: attachments.id })
      .from(attachments)
      .where(
        and(
          eq(attachments.entity, 'room_issue'),
          eq(attachments.entityId, row.id),
          isNull(attachments.deletedAt)
        )
      )
      .all().length,
    block: liveBlock(tx, row.id)
  })

  /** Block [today, next sold night) — none when the room is sold tonight (the guest has to be moved first). */
  const blockRoom = (
    tx: Tx,
    audit: AuditFn,
    ctx: Ctx,
    issue: RoomIssueRow,
    now: Date
  ): RoomBlockRow | null =>
    issue.roomId
      ? openAutoBlock(tx, audit, ctx, now, {
          roomId: issue.roomId,
          kind: 'oos',
          reason: issue.title,
          roomIssueId: issue.id
        })
      : null

  /** Resolution ends the block: days before today stay blocked (history), a not yet started block is cancelled. */
  const endBlock = (tx: Tx, audit: AuditFn, ctx: Ctx, issueId: string, now: Date): void => {
    const block = liveBlock(tx, issueId)
    if (block) endAutoBlock(tx, audit, ctx, now, block)
  }

  return {
    /** Open and planned first (urgent first, newest first), then resolved ones newest first. */
    list(ctx: Ctx, input: RoomIssueListInput = {}): RoomIssueView[] {
      requirePermission(ctx, 'room_issues', 'view')
      const q = parseInput(roomIssueListSchema, input)
      const where: (SQL | undefined)[] = [
        q.status ? inArray(roomIssues.status, q.status) : undefined,
        q.roomId ? eq(roomIssues.roomId, q.roomId) : undefined
      ]
      const severity = { urgent: 0, medium: 1, low: 2 } as const
      return db
        .select()
        .from(roomIssues)
        .where(and(...where))
        .orderBy(desc(roomIssues.reportedAt))
        .all()
        .sort(
          (a, b) =>
            Number(a.status === 'resolved') - Number(b.status === 'resolved') ||
            (a.status === 'resolved' ? 0 : severity[a.severity] - severity[b.severity])
        )
        .map((r) => view(db, r))
    },

    get(ctx: Ctx, id: string): RoomIssueView {
      requirePermission(ctx, 'room_issues', 'view')
      return view(db, issueOf(db, id))
    },

    create(ctx: Ctx, input: RoomIssueInput): RoomIssueView {
      requirePermission(ctx, 'room_issues', 'edit')
      const data = parseInput(roomIssueInputSchema, input)
      if (data.blocksRoom) requirePermission(ctx, 'rooms.block', 'edit')
      return inTransaction(deps, ctx, (tx, audit, now) => {
        if (data.roomId && !tx.select({ id: rooms.id }).from(rooms).where(eq(rooms.id, data.roomId)).get())
          throw notFound('room', data.roomId)
        const row: RoomIssueRow = {
          id: newId(now),
          roomId: data.roomId ?? null,
          area: data.roomId ? null : (data.area ?? null),
          title: data.title,
          description: data.description ?? null,
          severity: data.severity,
          status: 'open',
          reportedBy: ctx.userId,
          reportedAt: now.toISOString(),
          assignedTo: null,
          plannedDate: null,
          resolvedAt: null,
          resolvedBy: null,
          resolutionNote: null,
          blocksRoom: data.blocksRoom,
          ...stamps(now)
        }
        tx.insert(roomIssues).values(row).run()
        audit({ entity: 'room_issue', entityId: row.id, action: 'create', after: row })
        if (row.blocksRoom) blockRoom(tx, audit, ctx, row, now)
        return view(tx, row)
      })
    },

    update(ctx: Ctx, id: string, patch: RoomIssueUpdate): RoomIssueView {
      requirePermission(ctx, 'room_issues', 'edit')
      const data = parseInput(roomIssueUpdateSchema, patch)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const before = issueOf(tx, id)
        tx.update(roomIssues)
          .set({ ...data, updatedAt: now.toISOString() })
          .where(eq(roomIssues.id, id))
          .run()
        const after = issueOf(tx, id)
        audit({ entity: 'room_issue', entityId: id, action: 'update', before, after })
        return view(tx, after)
      })
    },

    /** A repair day and who does it ("Tesisatçı Ahmet"). */
    plan(ctx: Ctx, id: string, input: RoomIssuePlan): RoomIssueView {
      requirePermission(ctx, 'room_issues', 'edit')
      const data = parseInput(roomIssuePlanSchema, input)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const before = issueOf(tx, id)
        if (before.status === 'resolved') throw conflict('errors.issueResolved')
        tx.update(roomIssues)
          .set({
            status: 'planned',
            plannedDate: data.plannedDate,
            assignedTo: data.assignedTo ?? before.assignedTo,
            updatedAt: now.toISOString()
          })
          .where(eq(roomIssues.id, id))
          .run()
        const after = issueOf(tx, id)
        audit({ entity: 'room_issue', entityId: id, action: 'update', before, after })
        return view(tx, after)
      })
    },

    /** Solved (who, when, how); the room's block ends today. Photos are purged later (attachments). */
    resolve(ctx: Ctx, id: string, input: RoomIssueResolve = {}): RoomIssueView {
      requirePermission(ctx, 'room_issues', 'edit')
      const data = parseInput(roomIssueResolveSchema, input)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const before = issueOf(tx, id)
        if (before.status === 'resolved') throw conflict('errors.issueResolved')
        tx.update(roomIssues)
          .set({
            status: 'resolved',
            resolvedAt: now.toISOString(),
            resolvedBy: ctx.userId,
            resolutionNote: data.resolutionNote ?? null,
            updatedAt: now.toISOString()
          })
          .where(eq(roomIssues.id, id))
          .run()
        endBlock(tx, audit, ctx, id, now)
        const after = issueOf(tx, id)
        audit({ entity: 'room_issue', entityId: id, action: 'done', before, after })
        return view(tx, after)
      })
    },

    /** It broke again: back to open with a reason (a room-closing issue closes the room again). */
    reopen(ctx: Ctx, id: string, reason: string): RoomIssueView {
      requirePermission(ctx, 'room_issues', 'edit')
      if (!reason.trim()) throw invalid('errors.reasonRequired')
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const before = issueOf(tx, id)
        if (before.status !== 'resolved') throw conflict('errors.issueNotResolved')
        if (before.blocksRoom) requirePermission(ctx, 'rooms.block', 'edit')
        tx.update(roomIssues)
          // The old solution note goes with the solution: it stays in the history (audit), not on the open issue.
          .set({
            status: 'open',
            resolvedAt: null,
            resolvedBy: null,
            resolutionNote: null,
            updatedAt: now.toISOString()
          })
          .where(eq(roomIssues.id, id))
          .run()
        const after = issueOf(tx, id)
        audit({ entity: 'room_issue', entityId: id, action: 'reopen', before, after, reason: reason.trim() })
        if (after.blocksRoom) blockRoom(tx, audit, ctx, after, now)
        return view(tx, after)
      })
    }
  }
}

export type RoomIssuesService = ReturnType<typeof createRoomIssuesService>
