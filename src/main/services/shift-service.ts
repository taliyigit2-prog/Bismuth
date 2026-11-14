// Shifts, the shift handover and notes (03-mimari.md §4.8, §6.16; G-95, K-34). The handover summary is never
// typed: it is derived from today's rows with the same domain functions as the Today screen and stored as a
// snapshot when the outgoing shift writes its handover. Each part of the summary follows the reader's own
// permissions (cash only for `cash` viewers…). Personal notes are readable only by their writer — not even by
// the owner role (§4.9-12) — so their text never enters the audit log either.
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, ne, or } from 'drizzle-orm'
import {
  handoverInputSchema,
  noteInputSchema,
  noteListFilterSchema,
  noteUpdateSchema,
  shiftInputSchema,
  shiftUpdateSchema,
  type HandoverInput,
  type NoteInput,
  type NoteListFilter,
  type NoteUpdate,
  type ShiftInput,
  type ShiftUpdate
} from '@shared/contract/operations'
import { addDays, localDateOf, type LocalDate } from '@shared/date'
import { localDateTimeOf } from '@shared/domain/local-datetime'
import { overdueCheckouts, pendingArrivals, type KbsIssue, type StayRoomLike } from '@shared/domain/occupants'
import { folioTotals } from '@shared/domain/payment-allocation'
import type { CashPanel } from '@shared/domain/cash'
import {
  charges,
  folios,
  guests,
  notes,
  payments,
  reservationRooms,
  reservations,
  roomIssues,
  rooms,
  shiftDefinitions,
  shiftHandovers,
  users
} from '../db/schema'
import type { I18nText } from '../db/schema/columns'
import type { Ctx } from './context'
import { AppError, permissionDenied } from './errors'
import { sectionAccess } from './expenses-service'
import { createLedgerService, type CashSnapshotRows } from './ledger-service'
import { createOccupantsService } from './occupants-service'
import {
  inTransaction,
  newId,
  notFound,
  parseInput,
  requirePermission,
  stamps,
  type ServiceDeps,
  type Tx,
  assertNameFree
} from './kit'
import { readSetting } from './settings-service'
import { canSeeTask, createTasksService, taskViewer, type TaskView } from './tasks-service'

export type ShiftRow = typeof shiftDefinitions.$inferSelect
export type HandoverRow = typeof shiftHandovers.$inferSelect
export type NoteRow = typeof notes.$inferSelect

export interface SummaryStay {
  stayId: string
  reservationId: string
  reservationCode: string
  roomNumber: string
  guestName: string
  checkIn: string
  checkOut: string
}

export interface SummaryBalance {
  reservationId: string
  reservationCode: string
  guestName: string
  roomNumbers: string[]
  balanceMinor: number
  currency: string
}

export interface SummaryIssue {
  id: string
  roomNumber: string | null
  title: string
  severity: 'low' | 'medium' | 'urgent'
  status: 'open' | 'planned'
  reportedAt: string
  blocksRoom: boolean
}

/**
 * §6.16. A part the reader may not see is null (not empty): the UI says "yetkiniz yok" rather than "nothing".
 */
export interface HandoverSummary {
  at: string
  businessDate: LocalDate
  /** Today's arrivals not checked in yet. */
  arrivalsPending: SummaryStay[] | null
  /** Should have left (check-out time passed) but did not. */
  overdueCheckouts: SummaryStay[] | null
  inHouse: { rooms: number; people: number } | null
  kbsMissing: (KbsIssue & { roomNumber: string })[] | null
  /** In-house or departing stays whose folio still owes money. */
  unpaid: SummaryBalance[] | null
  openTasks: TaskView[] | null
  openIssues: SummaryIssue[] | null
  /** The drawer as the reader may see it; `rows` = what the figure was computed from (K-42 (3)). */
  cash: (CashPanel & { partial?: boolean; rows?: CashSnapshotRows }) | null
}

export interface HandoverView extends Omit<HandoverRow, 'summary'> {
  /** The summary as it was when the handover was written. */
  summary: HandoverSummary
  writtenByName: string | null
  acknowledgedByName: string | null
}

export interface NoteView extends NoteRow {
  createdByName: string | null
}

export interface ShiftView extends ShiftRow {
  /** Translated name of a seeded shift while it keeps its seeded name. */
  displayName: I18nText | null
}

const minutesOf = (hhmm: string): number => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))

/** Whether a local "HH:MM" falls in a shift; end before start wraps past midnight (Gece 21:00–09:00). */
export function inShift(shift: Pick<ShiftRow, 'startTime' | 'endTime'>, time: string): boolean {
  const t = minutesOf(time)
  const s = minutesOf(shift.startTime)
  const e = minutesOf(shift.endTime)
  if (s === e) return true
  return s < e ? t >= s && t < e : t >= s || t < e
}

const toStay = (s: typeof reservationRooms.$inferSelect): StayRoomLike => ({
  id: s.id,
  roomId: s.roomId,
  reservationId: s.reservationId,
  checkIn: s.checkIn as LocalDate,
  checkOut: s.checkOut as LocalDate,
  checkedInAt: s.checkedInAt,
  checkedOutAt: s.checkedOutAt,
  cancelled: s.status === 'cancelled'
})

/** Guest names in the handover: only for roles that see reservations or the people in the house (K-38). */
const seesGuests = (ctx: Ctx): boolean => ctx.can('calendar', 'view') || ctx.can('in_house', 'view')

export function createShiftService(deps: ServiceDeps) {
  const { db } = deps
  const occupants = createOccupantsService(deps)
  const tasks = createTasksService(deps)
  const ledger = createLedgerService(deps)

  const shiftOf = (tx: Pick<Tx, 'select'>, id: string): ShiftRow => {
    const row = tx.select().from(shiftDefinitions).where(eq(shiftDefinitions.id, id)).get()
    if (!row) throw notFound('shift', id)
    return row
  }

  const shiftView = (s: ShiftRow): ShiftView => ({ ...s, displayName: s.name === null ? s.nameI18n : null })

  /**
   * A stored handover as `ctx` may read it: the snapshot was taken with the writer's rights, so every part is
   * filtered again with the reader's (cash only for cash viewers, tasks the reader may see…).
   */
  const viewFor = (ctx: Ctx, row: HandoverRow): HandoverView => {
    const s = row.summary as unknown as HandoverSummary
    // Guest names follow the Today screen's rule: reservations or the people in the house (K-38).
    const seesToday = seesGuests(ctx)
    const seesHouse = ctx.can('in_house', 'view')
    const viewer = ctx.can('tasks', 'view') ? taskViewer(db, ctx) : null
    return {
      ...row,
      writtenByName: nameOf(db, row.writtenBy),
      acknowledgedByName: nameOf(db, row.acknowledgedBy),
      summary: {
        ...s,
        arrivalsPending: seesToday ? s.arrivalsPending : null,
        overdueCheckouts: seesToday ? s.overdueCheckouts : null,
        inHouse: seesHouse ? s.inHouse : null,
        kbsMissing: seesHouse ? s.kbsMissing : null,
        unpaid: ctx.can('payments', 'view') ? s.unpaid : null,
        openTasks: viewer && s.openTasks ? s.openTasks.filter((t) => canSeeTask(viewer, t)) : null,
        openIssues: ctx.can('room_issues', 'view') ? s.openIssues : null,
        cash: ctx.can('cash', 'view') ? cashFor(ctx, s.cash) : null
      }
    }
  }

  /**
   * K-42 (3): the drawer of a stored handover recomputed from the snapshot's rows with the reader's rights (the
   * writer may see a section the reader does not). A snapshot without its rows is shown only to a full view.
   */
  const cashFor = (ctx: Ctx, cash: HandoverSummary['cash']): HandoverSummary['cash'] => {
    if (!cash) return null
    if (cash.rows) return { ...ledger.cashPanelOfRows(ctx, cash.rows), rows: cash.rows }
    return sectionAccess(db, ctx).partial ? null : cash
  }

  const nameOf = (tx: Pick<Tx, 'select'>, userId: string | null): string | null =>
    userId
      ? (tx.select({ name: users.displayName }).from(users).where(eq(users.id, userId)).get()?.name ?? null)
      : null

  const noteView = (tx: Pick<Tx, 'select'>, n: NoteRow): NoteView => ({
    ...n,
    createdByName: nameOf(tx, n.createdBy)
  })

  /** A personal note is visible only to its writer: anything else is "not found" (its existence stays hidden). */
  const noteFor = (tx: Pick<Tx, 'select'>, ctx: Ctx, id: string, write: boolean): NoteRow => {
    const row = tx.select().from(notes).where(eq(notes.id, id)).get()
    if (!row) throw notFound('note', id)
    if (row.kind === 'personal') {
      if (!ctx.userId || row.ownerUserId !== ctx.userId) throw notFound('note', id)
    } else requirePermission(ctx, 'shift_notes', write ? 'edit' : 'view')
    return row
  }

  /** Audit payload of a note: a personal note's text stays out of the log (only its writer may read it). */
  const noteAudit = (n: NoteRow | null | undefined) =>
    n == null
      ? n
      : n.kind === 'personal'
        ? { id: n.id, kind: n.kind, ownerUserId: n.ownerUserId, doneAt: n.doneAt, archivedAt: n.archivedAt }
        : n

  const stayRows = (where: ReturnType<typeof and>) =>
    db
      .select({
        s: reservationRooms,
        roomNumber: rooms.number,
        code: reservations.code,
        firstName: guests.firstName,
        lastName: guests.lastName
      })
      .from(reservationRooms)
      .innerJoin(rooms, eq(rooms.id, reservationRooms.roomId))
      .innerJoin(reservations, eq(reservations.id, reservationRooms.reservationId))
      .innerJoin(guests, eq(guests.id, reservations.primaryGuestId))
      .where(where)
      .orderBy(asc(rooms.sort), asc(rooms.number))
      .all()

  type StayJoin = ReturnType<typeof stayRows>[number]
  const summaryStay = (r: StayJoin): SummaryStay => ({
    stayId: r.s.id,
    reservationId: r.s.reservationId,
    reservationCode: r.code,
    roomNumber: r.roomNumber,
    guestName: `${r.firstName} ${r.lastName}`.trim(),
    checkIn: r.s.checkIn,
    checkOut: r.s.checkOut
  })

  /** Folio balances of in-house and today's departing stays (one row per reservation). */
  const unpaidBalances = (staysNow: StayJoin[]): SummaryBalance[] => {
    const byReservation = new Map<string, StayJoin[]>()
    for (const r of staysNow)
      byReservation.set(r.s.reservationId, [...(byReservation.get(r.s.reservationId) ?? []), r])
    if (!byReservation.size) return []
    const ids = [...byReservation.keys()]
    const folioRows = db.select().from(folios).where(inArray(folios.reservationId, ids)).all()
    const folioIds = folioRows.map((f) => f.id)
    const chargeRows = folioIds.length
      ? db.select().from(charges).where(inArray(charges.folioId, folioIds)).all()
      : []
    const payRows = folioIds.length
      ? db.select().from(payments).where(inArray(payments.folioId, folioIds)).all()
      : []
    const out: SummaryBalance[] = []
    for (const f of folioRows) {
      if (!f.reservationId) continue
      const totals = folioTotals(
        chargeRows
          .filter((c) => c.folioId === f.id)
          .map((c) => ({ amountMinor: c.amountMinor, voided: !!c.voidedAt })),
        payRows
          .filter((p) => p.folioId === f.id)
          .map((p) => ({ kind: p.kind, amountFolioMinor: p.amountFolioMinor, voided: !!p.voidedAt }))
      )
      if (totals.balanceMinor <= 0) continue
      const list = byReservation.get(f.reservationId) ?? []
      const first = list[0]
      if (!first) continue
      out.push({
        reservationId: f.reservationId,
        reservationCode: first.code,
        guestName: `${first.firstName} ${first.lastName}`.trim(),
        roomNumbers: [...new Set(list.map((r) => r.roomNumber))],
        balanceMinor: totals.balanceMinor,
        currency: f.currency
      })
    }
    return out
  }

  function summary(ctx: Ctx): HandoverSummary {
    const now = deps.clock()
    const at = now.toISOString()
    const today = localDateOf(now)
    const nowTime = localDateTimeOf(now).slice(11, 16)
    const checkoutTime = readSetting(db, 'hotel.checkoutTime')
    const seesToday = seesGuests(ctx)
    const live = stayRows(
      and(
        ne(reservationRooms.status, 'cancelled'),
        or(
          eq(reservationRooms.checkIn, today),
          // Yesterday's arrival still awaited after midnight (isLateArrival).
          and(eq(reservationRooms.checkIn, addDays(today, -1)), isNull(reservationRooms.checkedInAt)),
          and(isNotNull(reservationRooms.checkedInAt), isNull(reservationRooms.checkedOutAt))
        )
      )
    )
    const byId = new Map(live.map((r) => [r.s.id, r]))
    const pick = (list: StayRoomLike[]) =>
      list
        .map((s) => byId.get(s.id))
        .filter((r): r is StayJoin => !!r)
        .map(summaryStay)
    const stays = live.map((r) => toStay(r.s))

    let inHouse: HandoverSummary['inHouse'] = null
    let kbs: HandoverSummary['kbsMissing'] = null
    if (ctx.can('in_house', 'view')) {
      const list = occupants.inHouse(ctx)
      inHouse = { rooms: list.length, people: list.reduce((acc, r) => acc + r.people, 0) }
      const numbers = new Map(
        db
          .select({ id: rooms.id, number: rooms.number })
          .from(rooms)
          .all()
          .map((r) => [r.id, r.number])
      )
      kbs = occupants.kbsMissing(ctx).map((k) => ({ ...k, roomNumber: numbers.get(k.roomId) ?? '' }))
    }

    const openIssues = ctx.can('room_issues', 'view')
      ? db
          .select({ i: roomIssues, roomNumber: rooms.number })
          .from(roomIssues)
          .leftJoin(rooms, eq(rooms.id, roomIssues.roomId))
          .where(inArray(roomIssues.status, ['open', 'planned']))
          .orderBy(desc(roomIssues.reportedAt))
          .all()
          .map(({ i, roomNumber }) => ({
            id: i.id,
            roomNumber: roomNumber ?? null,
            title: i.title,
            severity: i.severity,
            status: i.status as 'open' | 'planned',
            reportedAt: i.reportedAt,
            blocksRoom: i.blocksRoom
          }))
      : null

    const departingOrIn = live.filter(
      (r) => r.s.checkedInAt && !r.s.checkedOutAt && r.s.status !== 'cancelled'
    )
    return {
      at,
      businessDate: today,
      arrivalsPending: seesToday ? pick(pendingArrivals(stays, today, { nowTime, checkoutTime })) : null,
      overdueCheckouts: seesToday ? pick(overdueCheckouts(stays, today, nowTime, checkoutTime)) : null,
      inHouse,
      kbsMissing: kbs,
      unpaid: ctx.can('payments', 'view') ? unpaidBalances(departingOrIn) : null,
      // Open tasks due today or earlier and the undated ones (a room's deep clean); the coming days' are not
      // the next shift's business.
      openTasks: ctx.can('tasks', 'view')
        ? tasks
            .listTasks(ctx, { status: ['open'] })
            .filter((t) => t.dueAt === null || t.dueAt.slice(0, 10) <= today)
        : null,
      openIssues,
      cash: ctx.can('cash', 'view') ? ledger.cashSnapshot(ctx) : null
    }
  }

  return {
    // ---- shift definitions (G-95: a setting; Pandora 09–21 / 21–09) ----

    listShifts(ctx: Ctx, opts: { includeInactive?: boolean } = {}): ShiftView[] {
      if (!ctx.can('shift_notes', 'view') && !ctx.can('tasks', 'view') && !ctx.can('settings', 'view'))
        throw permissionDenied()
      const q = db.select().from(shiftDefinitions)
      return (opts.includeInactive ? q : q.where(eq(shiftDefinitions.active, true)))
        .orderBy(asc(shiftDefinitions.sort), asc(shiftDefinitions.startTime))
        .all()
        .map(shiftView)
    },

    /** The active shift whose hours contain the hotel's current time (first by sort when they overlap). */
    currentShift(ctx: Ctx): ShiftView | null {
      if (!ctx.can('shift_notes', 'view') && !ctx.can('tasks', 'view')) throw permissionDenied()
      const time = localDateTimeOf(deps.clock()).slice(11, 16)
      const row = db
        .select()
        .from(shiftDefinitions)
        .where(eq(shiftDefinitions.active, true))
        .orderBy(asc(shiftDefinitions.sort), asc(shiftDefinitions.startTime))
        .all()
        .find((s) => inShift(s, time))
      return row ? shiftView(row) : null
    },

    createShift(ctx: Ctx, input: ShiftInput): ShiftView {
      requirePermission(ctx, 'settings', 'edit')
      const data = parseInput(shiftInputSchema, input)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        assertNameFree(tx.select().from(shiftDefinitions).all(), data.name)
        const row: ShiftRow = {
          id: newId(now),
          code: null,
          name: data.name,
          nameI18n: null,
          startTime: data.startTime,
          endTime: data.endTime,
          sort: data.sort ?? 0,
          active: data.active ?? true,
          ...stamps(now)
        }
        tx.insert(shiftDefinitions).values(row).run()
        audit({ entity: 'shift_definition', entityId: row.id, action: 'create', after: row })
        return shiftView(row)
      })
    },

    /** Renaming a seeded shift drops its translations (the hotel's own name is shown as typed). */
    updateShift(ctx: Ctx, id: string, patch: ShiftUpdate): ShiftView {
      requirePermission(ctx, 'settings', 'edit')
      const data = parseInput(shiftUpdateSchema, patch)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const before = shiftOf(tx, id)
        const { name, ...rest } = data
        tx.update(shiftDefinitions)
          .set({
            ...rest,
            ...(name !== undefined ? { name, nameI18n: null } : {}),
            updatedAt: now.toISOString()
          })
          .where(eq(shiftDefinitions.id, id))
          .run()
        const after = shiftOf(tx, id)
        audit({ entity: 'shift_definition', entityId: id, action: 'update', before, after })
        return shiftView(after)
      })
    },

    // ---- handover (§6.16) ----

    /** The automatic part of the handover screen, as the caller may see it. */
    handoverSummary(ctx: Ctx): HandoverSummary {
      requirePermission(ctx, 'shift_notes', 'view')
      return summary(ctx)
    },

    /** The outgoing shift's handover: its text plus a snapshot of the summary at this minute. */
    saveHandover(ctx: Ctx, input: HandoverInput): HandoverView {
      requirePermission(ctx, 'shift_notes', 'edit')
      const data = parseInput(handoverInputSchema, input)
      const snapshot = summary(ctx)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        if (data.fromShiftId) shiftOf(tx, data.fromShiftId)
        if (data.toShiftId) shiftOf(tx, data.toShiftId)
        const row = {
          id: newId(now),
          businessDate: snapshot.businessDate,
          fromShiftId: data.fromShiftId ?? null,
          toShiftId: data.toShiftId ?? null,
          writtenBy: ctx.userId,
          writtenAt: now.toISOString(),
          text: data.text?.trim() ? data.text.trim() : null,
          summary: snapshot as unknown as Record<string, unknown>,
          acknowledgedBy: null,
          acknowledgedAt: null,
          ...stamps(now)
        }
        tx.insert(shiftHandovers).values(row).run()
        audit({
          entity: 'shift_handover',
          entityId: row.id,
          action: 'create',
          after: { ...row, summary: undefined }
        })
        return viewFor(ctx, row as HandoverRow)
      })
    },

    /** "Okudum": the incoming shift confirms it read the handover (who + when; once). */
    acknowledge(ctx: Ctx, id: string): HandoverView {
      requirePermission(ctx, 'shift_notes', 'view')
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const before = tx.select().from(shiftHandovers).where(eq(shiftHandovers.id, id)).get()
        if (!before) throw notFound('shift_handover', id)
        if (before.acknowledgedAt) return viewFor(ctx, before)
        if (before.writtenBy !== null && before.writtenBy === ctx.userId)
          throw new AppError('CONFLICT', 'errors.ownHandover')
        tx.update(shiftHandovers)
          .set({
            acknowledgedBy: ctx.userId,
            acknowledgedAt: now.toISOString(),
            updatedAt: now.toISOString()
          })
          .where(eq(shiftHandovers.id, id))
          .run()
        const after = tx.select().from(shiftHandovers).where(eq(shiftHandovers.id, id)).get() as HandoverRow
        audit({
          entity: 'shift_handover',
          entityId: id,
          action: 'acknowledge',
          after: { acknowledgedBy: after.acknowledgedBy, acknowledgedAt: after.acknowledgedAt }
        })
        return viewFor(ctx, after)
      })
    },

    /** Handovers in [from, to] (business days), newest first. */
    listHandovers(ctx: Ctx, from: string, to: string): HandoverView[] {
      requirePermission(ctx, 'shift_notes', 'view')
      return db
        .select()
        .from(shiftHandovers)
        .where(and(gte(shiftHandovers.businessDate, from), lte(shiftHandovers.businessDate, to)))
        .orderBy(desc(shiftHandovers.writtenAt))
        .all()
        .map((h) => viewFor(ctx, h))
    },

    /** Not yet acknowledged handovers written by someone else (Today badge, G-92). */
    unreadHandovers(ctx: Ctx): HandoverView[] {
      requirePermission(ctx, 'shift_notes', 'view')
      return db
        .select()
        .from(shiftHandovers)
        .where(isNull(shiftHandovers.acknowledgedAt))
        .orderBy(desc(shiftHandovers.writtenAt))
        .all()
        .filter((h) => h.writtenBy === null || h.writtenBy !== ctx.userId)
        .map((h) => viewFor(ctx, h))
    },

    // ---- notes: personal ("kendime not") and board ("herkese not") ----

    /** The caller's personal notes and, with shift notes view, the board; pinned first, newest first. */
    listNotes(ctx: Ctx, filter: NoteListFilter = {}): NoteView[] {
      const f = parseInput(noteListFilterSchema, filter)
      const scopes = [
        ctx.userId ? and(eq(notes.kind, 'personal'), eq(notes.ownerUserId, ctx.userId)) : undefined,
        ctx.can('shift_notes', 'view') ? eq(notes.kind, 'board') : undefined
      ].filter((s) => s !== undefined)
      if (!scopes.length) throw permissionDenied()
      return db
        .select()
        .from(notes)
        .where(
          and(
            or(...scopes),
            f.includeDone ? undefined : isNull(notes.doneAt),
            f.includeArchived ? undefined : isNull(notes.archivedAt)
          )
        )
        .orderBy(desc(notes.pinned), desc(notes.createdAt))
        .all()
        .map((n) => noteView(db, n))
    },

    addNote(ctx: Ctx, input: NoteInput): NoteView {
      const data = parseInput(noteInputSchema, input)
      if (data.kind === 'board') requirePermission(ctx, 'shift_notes', 'edit')
      else if (!ctx.userId) throw new AppError('UNAUTHENTICATED', 'errors.unauthenticated')
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const row: NoteRow = {
          id: newId(now),
          kind: data.kind,
          ownerUserId: data.kind === 'personal' ? ctx.userId : null,
          text: data.text,
          remindAt: data.remindAt ?? null,
          pinned: data.pinned,
          doneAt: null,
          archivedAt: null,
          createdBy: ctx.userId,
          ...stamps(now)
        }
        tx.insert(notes).values(row).run()
        audit({ entity: 'note', entityId: row.id, action: 'create', after: noteAudit(row) })
        return noteView(tx, row)
      })
    },

    updateNote(ctx: Ctx, id: string, patch: NoteUpdate): NoteView {
      const data = parseInput(noteUpdateSchema, patch)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const before = noteFor(tx, ctx, id, true)
        tx.update(notes)
          .set({ ...data, updatedAt: now.toISOString() })
          .where(eq(notes.id, id))
          .run()
        const after = tx.select().from(notes).where(eq(notes.id, id)).get() as NoteRow
        audit({
          entity: 'note',
          entityId: id,
          action: 'update',
          before: noteAudit(before),
          after: noteAudit(after)
        })
        return noteView(tx, after)
      })
    },

    /** Done / not done, pinned, archived: small state changes of a note. */
    setNoteState(
      ctx: Ctx,
      id: string,
      state: { done?: boolean; pinned?: boolean; archived?: boolean }
    ): NoteView {
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const before = noteFor(tx, ctx, id, true)
        const iso = now.toISOString()
        const set: Partial<NoteRow> = { updatedAt: iso }
        if (state.done !== undefined) set.doneAt = state.done ? (before.doneAt ?? iso) : null
        if (state.archived !== undefined) set.archivedAt = state.archived ? (before.archivedAt ?? iso) : null
        if (state.pinned !== undefined) set.pinned = state.pinned
        tx.update(notes).set(set).where(eq(notes.id, id)).run()
        const after = tx.select().from(notes).where(eq(notes.id, id)).get() as NoteRow
        audit({
          entity: 'note',
          entityId: id,
          action: state.done ? 'done' : 'update',
          before: noteAudit(before),
          after: noteAudit(after)
        })
        return noteView(tx, after)
      })
    },

    /** The caller's personal notes whose reminder time has come and are not done (Today, notifications). */
    dueReminders(ctx: Ctx): NoteView[] {
      if (!ctx.userId) return []
      const nowLocal = localDateTimeOf(deps.clock())
      return db
        .select()
        .from(notes)
        .where(
          and(
            eq(notes.kind, 'personal'),
            eq(notes.ownerUserId, ctx.userId),
            isNull(notes.doneAt),
            isNull(notes.archivedAt),
            isNotNull(notes.remindAt),
            lte(notes.remindAt, nowLocal)
          )
        )
        .orderBy(asc(notes.remindAt))
        .all()
        .map((n) => noteView(db, n))
    }
  }
}

export type ShiftService = ReturnType<typeof createShiftService>
