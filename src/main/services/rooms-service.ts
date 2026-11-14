// Room types, rooms, capacity history, housekeeping status and blocks (03-mimari.md §4.2, §6.1; G-11, G-12, G-38,
// G-90, K-27). Read methods need no special permission (room lists are not sensitive); writes are checked here.
import { and, asc, desc, eq, gt, gte, isNull, lt, ne, sql } from 'drizzle-orm'
import {
  hkNoteSchema,
  hkStatusSchema,
  roomBlockInputSchema,
  roomInputSchema,
  roomTypeInputSchema,
  roomTypeUpdateSchema,
  roomUpdateSchema,
  type RoomBlockInput,
  type RoomInput,
  type RoomTypeInput,
  type RoomTypeUpdate,
  type RoomUpdate
} from '@shared/contract/rooms'
import { localDate, localDateOf, type LocalDate } from '@shared/date'
import { nameKey } from '@shared/name-key'
import { blockKindOf, closesRoom, stateAfterCheckout } from '@shared/domain/housekeeping'
import { roomBlocks, roomCapacityChanges, roomIssues, roomNights, rooms, roomTypes } from '../db/schema'
import type { Ctx } from './context'
import { permissionDenied } from './errors'
import {
  assertNameFree,
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
import { endAutoBlock, liveBlockWhere, openAutoBlock, type AuditFn } from './room-blocks'
import {
  assertNoStaysWhileClosed,
  capacityReader,
  type CapacityChangeRow,
  type CapacityState
} from './room-capacity'

export type RoomRow = typeof rooms.$inferSelect
export type RoomTypeRow = typeof roomTypes.$inferSelect
export type RoomBlockRow = typeof roomBlocks.$inferSelect

/** A room of the list: today's capacity, the opening day of a room not opened yet, the next planned change. */
export interface RoomListRow extends RoomRow {
  opensOn: string | null
  nextChange: { id: string; validFrom: string; active: boolean; sellable: boolean; beds: number } | null
}

export interface RoomCapacity {
  roomId: string
  number: string
  active: boolean
  sellable: boolean
  beds: number
}

const ROOM_READ_KEYS = ['today', 'calendar', 'rooms.status', 'settings.rooms', 'room_issues'] as const

export function createRoomsService(deps: ServiceDeps) {
  const { db } = deps

  /** The room list is the hotel's structure every screen needs: any room-related view right reads it. */
  const requireRoomRead = (ctx: Ctx): void => {
    if (!ROOM_READ_KEYS.some((key) => ctx.can(key, 'view'))) throw permissionDenied()
  }

  const getRoom = (id: string): RoomRow => {
    const row = db.select().from(rooms).where(eq(rooms.id, id)).get()
    if (!row) throw notFound('room', id)
    return row
  }

  /** A room number is unique whatever its letter case ("a1" and "A1" are one room), like the wizard and Excel match. */
  const numberTaken = (tx: Pick<typeof db, 'select'>, number: string, exceptId?: string): boolean =>
    tx
      .select({ id: rooms.id })
      .from(rooms)
      .where(
        and(
          sql`lower(${rooms.number}) = ${number.toLowerCase()}`,
          exceptId ? ne(rooms.id, exceptId) : undefined
        )
      )
      .get() !== undefined

  /** A room can only be put on a room type that exists and is switched on (S-128). */
  const assertTypeActive = (tx: Pick<typeof db, 'select'>, roomTypeId: string): void => {
    const type = tx
      .select({ id: roomTypes.id, active: roomTypes.active })
      .from(roomTypes)
      .where(eq(roomTypes.id, roomTypeId))
      .get()
    if (!type) throw notFound('room_type', roomTypeId)
    if (!type.active) throw invalid('errors.roomTypeInactive')
  }

  function createRoom(ctx: Ctx, input: RoomInput): RoomRow {
    requirePermission(ctx, 'settings.rooms', 'edit')
    const data = parseInput(roomInputSchema, input)
    return inTransaction(deps, ctx, (tx, audit, now) => {
      if (numberTaken(tx, data.number)) throw conflict('errors.roomNumberTaken', { number: data.number })
      assertTypeActive(tx, data.roomTypeId)
      const id = newId(now)
      const row = {
        id,
        number: data.number,
        floor: data.floor ?? null,
        roomTypeId: data.roomTypeId,
        beds: data.beds,
        sellable: data.sellable,
        notes: data.notes ?? null,
        sort: data.sort ?? 0,
        active: true,
        hkStatus: 'clean' as const,
        ...stamps(now)
      }
      tx.insert(rooms).values(row).run()
      tx.insert(roomCapacityChanges)
        .values({
          id: newId(now),
          roomId: id,
          validFrom: data.validFrom,
          active: true,
          sellable: data.sellable,
          beds: data.beds,
          createdBy: ctx.userId,
          ...stamps(now)
        })
        .run()
      // A room that opens on a later day is not in use until then (its row says so; the history says when).
      if (data.validFrom > localDateOf(now))
        tx.update(rooms).set({ active: false }).where(eq(rooms.id, id)).run()
      audit({ entity: 'room', entityId: id, action: 'create', after: { ...row, validFrom: data.validFrom } })
      return getRoomTx(tx, id)
    })
  }

  return {
    listRoomTypes(ctx: Ctx, opts: { includeInactive?: boolean } = {}): RoomTypeRow[] {
      requireRoomRead(ctx)
      const q = db.select().from(roomTypes)
      return (opts.includeInactive ? q : q.where(eq(roomTypes.active, true)))
        .orderBy(asc(roomTypes.sort), asc(roomTypes.name))
        .all()
    },

    createRoomType(ctx: Ctx, input: RoomTypeInput): RoomTypeRow {
      requirePermission(ctx, 'settings.rooms', 'edit')
      const data = parseInput(roomTypeInputSchema, input)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        assertNameFree(tx.select().from(roomTypes).all(), data.name)
        const id = newId(now)
        const row = {
          id,
          code: `custom_${id.toLowerCase()}`,
          name: data.name,
          nameI18n: null,
          group: data.group,
          isCustom: true,
          maxAdults: data.maxAdults ?? null,
          maxChildren: data.maxChildren ?? null,
          sizeM2: data.sizeM2 ?? null,
          basePriceMinor: data.basePriceMinor ?? null,
          weekendPriceMinor: data.weekendPriceMinor ?? null,
          hourlyPriceMinor: data.hourlyPriceMinor ?? null,
          baseCurrency: data.baseCurrency ?? null,
          sort: data.sort ?? 1000,
          active: data.active ?? true,
          ...stamps(now)
        }
        tx.insert(roomTypes).values(row).run()
        audit({ entity: 'room_type', entityId: id, action: 'create', after: row })
        return tx.select().from(roomTypes).where(eq(roomTypes.id, id)).get() as RoomTypeRow
      })
    },

    updateRoomType(ctx: Ctx, id: string, input: RoomTypeUpdate): RoomTypeRow {
      requirePermission(ctx, 'settings.rooms', 'edit')
      const data = parseInput(roomTypeUpdateSchema, input)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const before = tx.select().from(roomTypes).where(eq(roomTypes.id, id)).get()
        if (!before) throw notFound('room_type', id)
        if (data.name !== undefined && nameKey(data.name) !== nameKey(before.name))
          assertNameFree(tx.select().from(roomTypes).all(), data.name, id)
        // A renamed seeded type keeps its code; its translations no longer match the new name.
        const patch = { ...data, ...(data.name ? { nameI18n: null } : {}), updatedAt: now.toISOString() }
        tx.update(roomTypes).set(patch).where(eq(roomTypes.id, id)).run()
        const after = tx.select().from(roomTypes).where(eq(roomTypes.id, id)).get() as RoomTypeRow
        audit({ entity: 'room_type', entityId: id, action: 'update', before, after })
        return after
      })
    },

    /**
     * Rooms as they are today (capacity history over the row: a planned change waits for its day), with the day a
     * room not opened yet opens and the next planned change. Without `includeInactive` only rooms in use today.
     */
    listRooms(ctx: Ctx, opts: { includeInactive?: boolean } = {}): RoomListRow[] {
      requireRoomRead(ctx)
      const today = localDateOf(deps.clock())
      const reader = capacityReader(db)
      const out: RoomListRow[] = []
      for (const row of db.select().from(rooms).orderBy(asc(rooms.sort), asc(rooms.number)).all()) {
        const state = reader.on(row, today)
        if (!opts.includeInactive && !state?.active) continue
        const next = reader.nextAfter(row.id, today)
        out.push({
          ...row,
          ...(state ?? { active: false }),
          opensOn: state ? null : reader.firstDay(row.id),
          nextChange: next
            ? {
                id: next.id,
                validFrom: next.validFrom,
                active: next.active,
                sellable: next.sellable,
                beds: next.beds
              }
            : null
        })
      }
      return out
    },

    createRoom,

    /** Several rooms at once (setup wizard, "Odaları üret"): all or none. */
    createMany(ctx: Ctx, inputs: RoomInput[]): RoomRow[] {
      requirePermission(ctx, 'settings.rooms', 'edit')
      return deps.db.transaction(() => inputs.map((input) => createRoom(ctx, input)))
    },

    /**
     * Capacity changes (beds, sellable, in use) are recorded with the day they count from (K-27); other fields
     * change at once. A change counts from its day only: a planned one leaves today's card as it is. A new change
     * replaces every live change dated on or after its day (an earlier-dated change withdraws a later plan). A
     * room is taken out of use only when no stay has a night on a day it would be closed (CONFLICT with the list).
     */
    updateRoom(ctx: Ctx, id: string, input: RoomUpdate): RoomRow {
      requirePermission(ctx, 'settings.rooms', 'edit')
      const data = parseInput(roomUpdateSchema, input)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const before = getRoomTx(tx, id)
        // Staying on the type it already has is fine even if that type was switched off later (S-128).
        if (data.roomTypeId && data.roomTypeId !== before.roomTypeId) assertTypeActive(tx, data.roomTypeId)
        if (data.number && data.number !== before.number) {
          if (numberTaken(tx, data.number, id))
            throw conflict('errors.roomNumberTaken', { number: data.number })
        }
        const { validFrom, note, beds, sellable, active, ...fields } = data
        const capacityAsked = beds !== undefined || sellable !== undefined || active !== undefined
        let change: { validFrom: string; note: string | null; replaced: string[] } | null = null
        if (capacityAsked) {
          const reader = capacityReader(tx, [id])
          const base = reader.on(before, validFrom)
          if (!base) throw invalid('errors.roomNotOpenYet', { date: reader.firstDay(id) })
          const next: CapacityState = {
            beds: beds ?? base.beds,
            sellable: sellable ?? base.sellable,
            active: active ?? base.active
          }
          // Live changes from this day on are replaced (never the room's first one: it opens the room).
          const first = reader.changes(id)[0]
          const replaced = reader.changes(id).filter((c) => c.validFrom >= validFrom && c.id !== first?.id)
          const same =
            next.beds === base.beds && next.sellable === base.sellable && next.active === base.active
          if (!same || replaced.length) {
            const iso = now.toISOString()
            for (const c of replaced) {
              tx.update(roomCapacityChanges)
                .set({ cancelledAt: iso, cancelledBy: ctx.userId, updatedAt: iso })
                .where(eq(roomCapacityChanges.id, c.id))
                .run()
              audit({
                entity: 'room_capacity_change',
                entityId: c.id,
                action: 'cancel',
                before: c,
                reason: `replaced from ${validFrom}`
              })
            }
            if (!same)
              tx.insert(roomCapacityChanges)
                .values({
                  id: newId(now),
                  roomId: id,
                  validFrom,
                  ...next,
                  note: note ?? null,
                  createdBy: ctx.userId,
                  ...stamps(now)
                })
                .run()
            assertNoStaysWhileClosed(tx, id, localDate(validFrom), data.number ?? before.number)
            change = { validFrom, note: note ?? null, replaced: replaced.map((c) => c.id) }
          }
        }
        tx.update(rooms)
          .set({ ...fields, ...todayState(tx, id, before, now), updatedAt: now.toISOString() })
          .where(eq(rooms.id, id))
          .run()
        const after = getRoomTx(tx, id)
        audit({
          entity: 'room',
          entityId: id,
          action: 'update',
          before,
          after: change ? { ...after, capacityChange: change } : after
        })
        return after
      })
    },

    /** A room's capacity history, newest day first, withdrawn changes included (Ayarlar → Odalar). */
    capacityHistory(ctx: Ctx, roomId: string): CapacityChangeRow[] {
      requireRoomRead(ctx)
      getRoom(roomId)
      return db
        .select()
        .from(roomCapacityChanges)
        .where(eq(roomCapacityChanges.roomId, roomId))
        .orderBy(desc(roomCapacityChanges.validFrom), desc(roomCapacityChanges.createdAt))
        .all()
    },

    /**
     * Withdraws a planned capacity change (one that has not started yet); the room stays as it is then. The change
     * that opened the room is not withdrawn (take the room out of use instead), nor one whose withdrawal would
     * leave a stay on a closed day.
     */
    cancelCapacityChange(ctx: Ctx, changeId: string): CapacityChangeRow {
      requirePermission(ctx, 'settings.rooms', 'edit')
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const before = tx.select().from(roomCapacityChanges).where(eq(roomCapacityChanges.id, changeId)).get()
        if (!before) throw notFound('room_capacity_change', changeId)
        if (before.cancelledAt) throw invalid('errors.alreadyCancelled')
        if (before.validFrom <= localDateOf(now)) throw invalid('errors.capacityChangeStarted')
        const room = getRoomTx(tx, before.roomId)
        if (capacityReader(tx, [room.id]).changes(room.id)[0]?.id === before.id)
          throw invalid('errors.capacityFirstChange')
        const iso = now.toISOString()
        tx.update(roomCapacityChanges)
          .set({ cancelledAt: iso, cancelledBy: ctx.userId, updatedAt: iso })
          .where(eq(roomCapacityChanges.id, changeId))
          .run()
        assertNoStaysWhileClosed(tx, room.id, localDate(before.validFrom), room.number)
        const after = tx
          .select()
          .from(roomCapacityChanges)
          .where(eq(roomCapacityChanges.id, changeId))
          .get() as CapacityChangeRow
        audit({ entity: 'room_capacity_change', entityId: changeId, action: 'cancel', before, after })
        return after
      })
    },

    /** Rooms and beds as they were on `date` (doluluk, bakanlık oranı; K-27). */
    capacityOn(ctx: Ctx, date: LocalDate): RoomCapacity[] {
      requireRoomRead(ctx)
      const all = db.select().from(rooms).orderBy(asc(rooms.sort), asc(rooms.number)).all()
      const reader = capacityReader(db)
      return all.flatMap((room) => {
        const state = reader.on(room, date)
        if (!state) return []
        return [{ roomId: room.id, number: room.number, ...state }]
      })
    },

    /** Total beds of active rooms on a day (ministry occupancy denominator; S-99: the real count). */
    bedsOn(ctx: Ctx, date: LocalDate): number {
      return this.capacityOn(ctx, date)
        .filter((c) => c.active)
        .reduce((n, c) => n + c.beds, 0)
    },

    /**
     * One tap on the status board (G-90): the new state, who and when, and an optional note (a state change
     * clears the old note). Maintenance / out of order close the room for sale: a block on the calendar from today
     * (until the next sold night), ended when the room leaves that state — so entering or leaving those two
     * states also needs the block right (G-38; housekeeping marks clean/dirty/inspected).
     */
    setHousekeepingStatus(
      ctx: Ctx,
      roomId: string,
      status: string,
      note?: string | null
    ): RoomRow & { block: RoomBlockRow | null } {
      requirePermission(ctx, 'rooms.status', 'edit')
      const hk = parseInput(hkStatusSchema, status)
      const text = parseInput(hkNoteSchema, note)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const before = getRoomTx(tx, roomId)
        if (hk !== before.hkStatus && (closesRoom(hk) || closesRoom(before.hkStatus)))
          requirePermission(ctx, 'rooms.block', 'edit')
        const iso = now.toISOString()
        tx.update(rooms)
          .set({
            hkStatus: hk,
            hkStatusAt: iso,
            hkStatusBy: ctx.userId,
            hkNote: text ?? null,
            updatedAt: iso
          })
          .where(eq(rooms.id, roomId))
          .run()
        audit({
          entity: 'room',
          entityId: roomId,
          action: 'update',
          before: { hkStatus: before.hkStatus, hkNote: before.hkNote },
          after: { hkStatus: hk, hkNote: text ?? null }
        })
        let block = hkBlockOf(tx, roomId, now)
        const kind = blockKindOf(hk)
        if (kind && block && block.kind !== kind) {
          tx.update(roomBlocks).set({ kind, updatedAt: iso }).where(eq(roomBlocks.id, block.id)).run()
          const after = tx.select().from(roomBlocks).where(eq(roomBlocks.id, block.id)).get() as RoomBlockRow
          audit({ entity: 'room_block', entityId: block.id, action: 'update', before: block, after })
          block = after
        } else if (kind && !block) {
          block = openAutoBlock(tx, audit, ctx, now, {
            roomId,
            kind,
            reason: text ?? '',
            source: 'hk_status'
          })
        } else if (!kind && block) {
          endAutoBlock(tx, audit, ctx, now, block)
          block = null
        }
        return { ...getRoomTx(tx, roomId), block }
      })
    },

    /** Changes only the note of the room's state ("minibar eksik"); null clears it. */
    setHousekeepingNote(ctx: Ctx, roomId: string, note: string | null): RoomRow {
      requirePermission(ctx, 'rooms.status', 'edit')
      const text = parseInput(hkNoteSchema, note)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const before = getRoomTx(tx, roomId)
        tx.update(rooms)
          .set({ hkNote: text ?? null, updatedAt: now.toISOString() })
          .where(eq(rooms.id, roomId))
          .run()
        audit({
          entity: 'room',
          entityId: roomId,
          action: 'update',
          before: { hkNote: before.hkNote },
          after: { hkNote: text ?? null }
        })
        return getRoomTx(tx, roomId)
      })
    },

    listBlocks(ctx: Ctx, from: LocalDate, to: LocalDate): RoomBlockRow[] {
      requireRoomRead(ctx)
      return db
        .select()
        .from(roomBlocks)
        .where(and(isNull(roomBlocks.cancelledAt), lt(roomBlocks.dateFrom, to), gt(roomBlocks.dateTo, from)))
        .orderBy(asc(roomBlocks.dateFrom))
        .all()
    },

    /** A block cannot cover nights that are already sold (move or cancel those first). */
    createBlock(ctx: Ctx, input: RoomBlockInput): RoomBlockRow {
      requirePermission(ctx, 'rooms.block', 'edit')
      const data = parseInput(roomBlockInputSchema, input)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        getRoomTx(tx, data.roomId)
        const sold = tx
          .select({ date: roomNights.date })
          .from(roomNights)
          .where(
            and(
              eq(roomNights.roomId, data.roomId),
              gte(roomNights.date, data.dateFrom),
              lt(roomNights.date, data.dateTo)
            )
          )
          .all()
        if (sold.length) throw conflict('errors.blockOverReservation', { dates: sold.map((n) => n.date) })
        const id = newId(now)
        const row = {
          id,
          roomId: data.roomId,
          dateFrom: data.dateFrom,
          dateTo: data.dateTo,
          kind: data.kind,
          reason: data.reason,
          note: data.note ?? null,
          roomIssueId: data.roomIssueId ?? null,
          createdBy: ctx.userId,
          ...stamps(now)
        }
        tx.insert(roomBlocks).values(row).run()
        audit({ entity: 'room_block', entityId: id, action: 'create', after: row })
        return tx.select().from(roomBlocks).where(eq(roomBlocks.id, id)).get() as RoomBlockRow
      })
    },

    /** Ends a block (never deletes it): from today on the room is sellable again. */
    /**
     * Lifts a block. A running block ends today: the days before stay blocked (occupancy history, §6.10). A block
     * that has not started is cancelled; one that is already over is cancelled only with a reason (a correction).
     */
    cancelBlock(ctx: Ctx, id: string, reason?: string): RoomBlockRow {
      requirePermission(ctx, 'rooms.block', 'edit')
      const why = reason?.trim() || undefined
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const before = tx.select().from(roomBlocks).where(eq(roomBlocks.id, id)).get()
        if (!before) throw notFound('room_block', id)
        if (before.cancelledAt) throw invalid('errors.alreadyCancelled')
        // A block with a cause (status board, issue, task) ends with it, never on its own.
        if (before.source || before.roomIssueId || before.taskId) throw invalid('errors.blockHasCause')
        const today = localDateOf(now)
        const iso = now.toISOString()
        const running = before.dateFrom < today && today < before.dateTo
        if (before.dateTo <= today && !why) throw invalid('errors.reasonRequired')
        tx.update(roomBlocks)
          .set(
            running
              ? { dateTo: today, updatedAt: iso }
              : { cancelledAt: iso, cancelledBy: ctx.userId, updatedAt: iso }
          )
          .where(eq(roomBlocks.id, id))
          .run()
        const after = tx.select().from(roomBlocks).where(eq(roomBlocks.id, id)).get() as RoomBlockRow
        audit({
          entity: 'room_block',
          entityId: id,
          action: running ? 'update' : 'cancel',
          before,
          after,
          reason: why
        })
        return after
      })
    },

    getRoom(ctx: Ctx, id: string): RoomRow {
      requireRoomRead(ctx)
      return getRoom(id)
    }
  }
}

/** The block the status board opened for this room (maintenance / out of order) that still runs after today. */
function hkBlockOf(tx: Pick<Tx, 'select'>, roomId: string, now: Date): RoomBlockRow | null {
  return liveBlockWhere(
    tx,
    and(
      eq(roomBlocks.roomId, roomId),
      eq(roomBlocks.source, 'hk_status'),
      gt(roomBlocks.dateTo, localDateOf(now))
    )
  )
}

/**
 * A room that was closed (maintenance / out of order, or a room-closing issue) while a guest slept in it got no
 * block then (the guest had to be moved first). Once the guest is gone the block opens, so the room is not sold again.
 */
function openDeferredBlocks(
  tx: Tx,
  audit: AuditFn,
  ctx: Ctx,
  roomId: string,
  hk: RoomRow['hkStatus'],
  now: Date
): void {
  const kind = blockKindOf(hk)
  if (kind && !hkBlockOf(tx, roomId, now))
    openAutoBlock(tx, audit, ctx, now, { roomId, kind, reason: '', source: 'hk_status' })
  const issues = tx
    .select()
    .from(roomIssues)
    .where(
      and(eq(roomIssues.roomId, roomId), eq(roomIssues.blocksRoom, true), ne(roomIssues.status, 'resolved'))
    )
    .all()
  for (const issue of issues) {
    if (
      liveBlockWhere(tx, and(eq(roomBlocks.roomIssueId, issue.id), gt(roomBlocks.dateTo, localDateOf(now))))
    )
      continue
    openAutoBlock(tx, audit, ctx, now, { roomId, kind: 'oos', reason: issue.title, roomIssueId: issue.id })
  }
}

/**
 * The check-out event for room status (S-14): a guest left the room — a check-out, a same-day stay's check-out
 * or the old room of a room move — so it needs cleaning (`stateAfterCheckout`; a room under maintenance or out of
 * order keeps its state). Runs inside the caller's transaction and writes its own audit row. The reservation
 * service calls it wherever a stay ends.
 */
export function markRoomDirtyAfterCheckout(
  tx: Tx,
  audit: AuditFn,
  ctx: Ctx,
  roomId: string,
  now: Date
): RoomRow {
  const before = getRoomTx(tx, roomId)
  openDeferredBlocks(tx, audit, ctx, roomId, before.hkStatus, now)
  const next = stateAfterCheckout(before.hkStatus)
  if (next === before.hkStatus && next !== 'dirty') return before
  const iso = now.toISOString()
  tx.update(rooms)
    .set({ hkStatus: next, hkStatusAt: iso, hkStatusBy: ctx.userId, hkNote: null, updatedAt: iso })
    .where(eq(rooms.id, roomId))
    .run()
  audit({
    entity: 'room',
    entityId: roomId,
    action: 'update',
    before: { hkStatus: before.hkStatus, hkNote: before.hkNote },
    after: { hkStatus: next, hkNote: null },
    reason: 'check_out'
  })
  return getRoomTx(tx, roomId)
}

/** Today's capacity for the room row (a room not opened yet: not in use, its opening values). */
function todayState(
  tx: Pick<ServiceDeps['db'], 'select'>,
  id: string,
  row: RoomRow,
  now: Date
): CapacityState {
  const reader = capacityReader(tx, [id])
  const state = reader.on(row, localDateOf(now))
  if (state) return state
  const first = reader.changes(id)[0]
  return first ? { active: false, sellable: first.sellable, beds: first.beds } : row
}

function getRoomTx(tx: Pick<ServiceDeps['db'], 'select'>, id: string): RoomRow {
  const row = tx.select().from(rooms).where(eq(rooms.id, id)).get()
  if (!row) throw notFound('room', id)
  return row
}

export type RoomsService = ReturnType<typeof createRoomsService>
