// Lost and found (G-55): what was found where, where it is kept, and to whom it went back. Records are never
// deleted: an item ends as returned or disposed (and can be put back to stored with a reason).
import { and, asc, desc, eq, gte, inArray, lt, type SQL } from 'drizzle-orm'
import {
  lostItemInputSchema,
  lostItemListFilterSchema,
  lostItemReturnSchema,
  lostItemUpdateSchema,
  type LostItemInput,
  type LostItemListFilter,
  type LostItemReturn,
  type LostItemUpdate
} from '@shared/contract/operations'
import { isLocalDate } from '@shared/date'
import { normalizeName } from '@shared/domain/normalize'
import { localDateTimeOf } from '@shared/domain/local-datetime'
import { auditLog, lostItems, rooms, users } from '../db/schema'
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

export type LostItemRow = typeof lostItems.$inferSelect

/** A row as the screen shows it: the room number, who logged it and who closed it, when (G-55). */
export interface LostItemView extends LostItemRow {
  roomNumber: string | null
  createdByName: string | null
  /** The last status change (returned / disposed / back to stored) from the audit trail. */
  statusChange: { at: string; byName: string | null; reason: string | null } | null
}

const statusOf = (json: string | null): string | null => {
  if (!json) return null
  try {
    const value = (JSON.parse(json) as { status?: unknown }).status
    return typeof value === 'string' ? value : null
  } catch {
    return null
  }
}

/** "YYYY-MM-DD" (that day's 00:00) or "YYYY-MM-DDTHH:MM" → the stored local minute. */
const toMinute = (v: string): string => (isLocalDate(v) ? `${v}T00:00` : v)

export function createLostItemsService(deps: ServiceDeps) {
  const { db } = deps

  const itemOf = (tx: Pick<Tx, 'select'>, id: string): LostItemRow => {
    const row = tx.select().from(lostItems).where(eq(lostItems.id, id)).get()
    if (!row) throw notFound('lost_item', id)
    return row
  }

  const checkRoom = (tx: Pick<Tx, 'select'>, roomId: string | null | undefined): void => {
    if (roomId && !tx.select({ id: rooms.id }).from(rooms).where(eq(rooms.id, roomId)).get())
      throw notFound('room', roomId)
  }

  /** Writes a status change with audit; `guard` checks the current state. */
  const transition = (
    ctx: Ctx,
    id: string,
    set: (now: Date) => Partial<LostItemRow>,
    guard: (row: LostItemRow) => void,
    reason?: string
  ): LostItemRow =>
    inTransaction(deps, ctx, (tx, audit, now) => {
      const before = itemOf(tx, id)
      guard(before)
      tx.update(lostItems)
        .set({ ...set(now), updatedAt: now.toISOString() })
        .where(eq(lostItems.id, id))
        .run()
      const after = itemOf(tx, id)
      audit({ entity: 'lost_item', entityId: id, action: 'update', before, after, reason })
      return after
    })

  const listRows = (ctx: Ctx, filter: LostItemListFilter): LostItemRow[] => {
    requirePermission(ctx, 'lost_items', 'view')
    const f = parseInput(lostItemListFilterSchema, filter)
    const where: (SQL | undefined)[] = [
      f.status ? inArray(lostItems.status, f.status) : undefined,
      f.from ? gte(lostItems.foundAt, `${f.from}T00:00`) : undefined,
      f.to ? lt(lostItems.foundAt, `${f.to}T00:00`) : undefined
    ]
    const rows = db
      .select()
      .from(lostItems)
      .where(and(...where))
      .orderBy(desc(lostItems.foundAt), desc(lostItems.createdAt))
      .all()
    if (!f.search) return rows
    const needle = normalizeName(f.search)
    return rows.filter((r) =>
      [r.description, r.locationText, r.storageLocation, r.foundBy, r.note].some(
        (v) => v && normalizeName(v).includes(needle)
      )
    )
  }

  return {
    /** Newest first; `search` matches description, place, storage and who found it (case/accent-insensitive). */
    list(ctx: Ctx, filter: LostItemListFilter = {}): LostItemRow[] {
      return listRows(ctx, filter)
    },

    /** `list` with the room number, who logged the item and who changed its status last (kim / ne zaman). */
    listView(ctx: Ctx, filter: LostItemListFilter = {}): LostItemView[] {
      const rows = listRows(ctx, filter)
      if (!rows.length) return []
      const roomNumbers = new Map(
        db
          .select({ id: rooms.id, number: rooms.number })
          .from(rooms)
          .all()
          .map((r) => [r.id, r.number])
      )
      const names = new Map(
        db
          .select({ id: users.id, name: users.displayName })
          .from(users)
          .all()
          .map((u) => [u.id, u.name])
      )
      const closed = rows.filter((r) => r.status !== 'stored' || r.updatedAt !== r.createdAt).map((r) => r.id)
      const changes = new Map<string, LostItemView['statusChange']>()
      if (closed.length) {
        const trail = db
          .select()
          .from(auditLog)
          .where(and(eq(auditLog.entity, 'lost_item'), inArray(auditLog.entityId, closed)))
          .orderBy(asc(auditLog.ts), asc(auditLog.id))
          .all()
        for (const a of trail) {
          const before = statusOf(a.beforeJson)
          const after = statusOf(a.afterJson)
          if (!before || !after || before === after) continue
          changes.set(a.entityId, {
            at: a.ts,
            byName: a.userId ? (names.get(a.userId) ?? null) : null,
            reason: a.reason
          })
        }
      }
      return rows.map((r) => ({
        ...r,
        roomNumber: r.roomId ? (roomNumbers.get(r.roomId) ?? null) : null,
        createdByName: r.createdBy ? (names.get(r.createdBy) ?? null) : null,
        statusChange: changes.get(r.id) ?? null
      }))
    },

    get(ctx: Ctx, id: string): LostItemRow {
      requirePermission(ctx, 'lost_items', 'view')
      return itemOf(db, id)
    },

    create(ctx: Ctx, input: LostItemInput): LostItemRow {
      requirePermission(ctx, 'lost_items', 'edit')
      const data = parseInput(lostItemInputSchema, input)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        checkRoom(tx, data.roomId)
        const row: LostItemRow = {
          id: newId(now),
          foundAt: data.foundAt ? toMinute(data.foundAt) : localDateTimeOf(now),
          roomId: data.roomId ?? null,
          locationText: data.locationText ?? null,
          foundBy: data.foundBy ?? null,
          description: data.description,
          storageLocation: data.storageLocation ?? null,
          status: 'stored',
          returnedTo: null,
          returnedAt: null,
          note: data.note ?? null,
          createdBy: ctx.userId,
          ...stamps(now)
        }
        tx.insert(lostItems).values(row).run()
        audit({ entity: 'lost_item', entityId: row.id, action: 'create', after: row })
        return row
      })
    },

    update(ctx: Ctx, id: string, patch: LostItemUpdate): LostItemRow {
      requirePermission(ctx, 'lost_items', 'edit')
      const data = parseInput(lostItemUpdateSchema, patch)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const before = itemOf(tx, id)
        checkRoom(tx, data.roomId)
        const { foundAt, ...rest } = data
        tx.update(lostItems)
          .set({ ...rest, ...(foundAt ? { foundAt: toMinute(foundAt) } : {}), updatedAt: now.toISOString() })
          .where(eq(lostItems.id, id))
          .run()
        const after = itemOf(tx, id)
        audit({ entity: 'lost_item', entityId: id, action: 'update', before, after })
        return after
      })
    },

    /** Handed back to its owner (who, when). */
    markReturned(ctx: Ctx, id: string, input: LostItemReturn): LostItemRow {
      requirePermission(ctx, 'lost_items', 'edit')
      const data = parseInput(lostItemReturnSchema, input)
      return transition(
        ctx,
        id,
        (now) => ({
          status: 'returned',
          returnedTo: data.returnedTo,
          returnedAt: data.returnedAt ?? localDateTimeOf(now),
          ...(data.note ? { note: data.note } : {})
        }),
        (row) => {
          if (row.status !== 'stored') throw conflict('errors.lostItemNotStored', { status: row.status })
        }
      )
    },

    /** Given away or thrown out after the keeping period; the reason goes to the audit row. */
    markDisposed(ctx: Ctx, id: string, reason: string): LostItemRow {
      requirePermission(ctx, 'lost_items', 'edit')
      if (!reason.trim()) throw invalid('errors.reasonRequired')
      return transition(
        ctx,
        id,
        () => ({ status: 'disposed' }),
        (row) => {
          if (row.status !== 'stored') throw conflict('errors.lostItemNotStored', { status: row.status })
        },
        reason.trim()
      )
    },

    /** A mistaken return/disposal: back to stored (audited with a reason). */
    restore(ctx: Ctx, id: string, reason: string): LostItemRow {
      requirePermission(ctx, 'lost_items', 'edit')
      if (!reason.trim()) throw invalid('errors.reasonRequired')
      return transition(
        ctx,
        id,
        () => ({ status: 'stored', returnedTo: null, returnedAt: null }),
        (row) => {
          if (row.status === 'stored') throw conflict('errors.lostItemNotStored', { status: row.status })
        },
        reason.trim()
      )
    }
  }
}

export type LostItemsService = ReturnType<typeof createLostItemsService>
