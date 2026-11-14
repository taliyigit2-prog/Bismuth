// Blocks the program opens and ends by itself (G-38): an issue that closes its room for sale (G-180) and a room set
// to maintenance / out of order on the status board (G-90). Both cover [today, next sold night) — one year at
// most — and end on the day the reason goes away: the days before stay blocked (occupancy history, §6.10), a
// block that has not started yet is cancelled. Callers run these inside their own transaction.
import { and, asc, desc, eq, gte, isNull, type SQL } from 'drizzle-orm'
import { addDays, diffDays, localDateOf, type LocalDate } from '@shared/date'
import { roomBlocks, roomNights } from '../db/schema'
import type { AuditEntry } from './audit'
import type { Ctx } from './context'
import { newId, stamps, type Tx } from './kit'

export type RoomBlockRow = typeof roomBlocks.$inferSelect
export type AuditFn = (entry: AuditEntry) => void

/** Longest automatic block (it ends earlier when its reason goes away). */
export const AUTO_BLOCK_MAX_DAYS = 365

/** The not-cancelled block matching `where`, newest first. */
export const liveBlockWhere = (tx: Pick<Tx, 'select'>, where: SQL | undefined): RoomBlockRow | null =>
  tx
    .select()
    .from(roomBlocks)
    .where(and(where, isNull(roomBlocks.cancelledAt)))
    .orderBy(desc(roomBlocks.createdAt))
    .get() ?? null

export interface AutoBlockInput {
  roomId: string
  kind: 'oos' | 'ooo'
  reason: string
  roomIssueId?: string | null
  source?: 'hk_status' | null
}

/** Block [today, next sold night); none when the room is sold tonight (the guest has to be moved first). */
export function openAutoBlock(
  tx: Tx,
  audit: AuditFn,
  ctx: Ctx,
  now: Date,
  input: AutoBlockInput
): RoomBlockRow | null {
  const today = localDateOf(now)
  const nextSold = tx
    .select({ date: roomNights.date })
    .from(roomNights)
    .where(
      and(eq(roomNights.roomId, input.roomId), eq(roomNights.slot, 'night'), gte(roomNights.date, today))
    )
    .orderBy(asc(roomNights.date))
    .get()?.date as LocalDate | undefined
  const horizon = addDays(today, AUTO_BLOCK_MAX_DAYS)
  const dateTo = nextSold && nextSold < horizon ? nextSold : horizon
  if (diffDays(today, dateTo) <= 0) return null
  const row: RoomBlockRow = {
    id: newId(now),
    roomId: input.roomId,
    dateFrom: today,
    dateTo,
    kind: input.kind,
    reason: input.reason,
    note: null,
    roomIssueId: input.roomIssueId ?? null,
    taskId: null,
    source: input.source ?? null,
    cancelledAt: null,
    cancelledBy: null,
    createdBy: ctx.userId,
    ...stamps(now)
  }
  tx.insert(roomBlocks).values(row).run()
  audit({ entity: 'room_block', entityId: row.id, action: 'create', after: row })
  return row
}

/** Ends an automatic block today: past days stay blocked, a block that has not started is cancelled. */
export function endAutoBlock(tx: Tx, audit: AuditFn, ctx: Ctx, now: Date, block: RoomBlockRow): void {
  const today = localDateOf(now)
  const iso = now.toISOString()
  if (block.dateTo <= today) return
  if (block.dateFrom < today)
    tx.update(roomBlocks).set({ dateTo: today, updatedAt: iso }).where(eq(roomBlocks.id, block.id)).run()
  else
    tx.update(roomBlocks)
      .set({ cancelledAt: iso, cancelledBy: ctx.userId, updatedAt: iso })
      .where(eq(roomBlocks.id, block.id))
      .run()
  const after = tx.select().from(roomBlocks).where(eq(roomBlocks.id, block.id)).get()
  audit({ entity: 'room_block', entityId: block.id, action: 'update', before: block, after })
}
