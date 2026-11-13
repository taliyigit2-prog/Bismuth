// Tape chart reads (faz-05 madde 1, 6; teknik not "room_nights aralık sorgusu"): the stays with a night in a date
// range — found through `room_nights` by date — with every night's payment status derived over the whole folio
// (`deriveFolioNights`), plus blocks, guest search and free rooms. Read only; a few batched queries per window,
// never one query per reservation (the calendar reads month by month while it scrolls ten years).
import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNull,
  like,
  lt,
  lte,
  max,
  min,
  ne,
  or,
  type SQL
} from 'drizzle-orm'
import {
  FIND_STAYS_MAX,
  findStaysInputSchema,
  freeRoomsInputSchema,
  gridRangeSchema,
  type CalendarBounds,
  type FoundStay,
  type GridBlock,
  type GridData,
  type GridRoom,
  type GridStay
} from '@shared/contract/procedures/reservations'
import { addDays, diffDays, localDate, localDateOf, type LocalDate } from '@shared/date'
import { calendarYears } from '@shared/domain/calendar-range'
import { standingNoteAlert } from '@shared/domain/cell-status'
import { deriveFolioNights } from '@shared/domain/night-status'
import { normalizeName, phoneNeedles } from '@shared/domain/normalize'
import { kbsMissing } from '@shared/domain/occupants'
import { findConflicts, staySlots } from '@shared/domain/stays'
import {
  folios,
  guests,
  payments,
  reservationNotes,
  reservationRooms,
  reservations,
  reservationTags,
  roomBlocks,
  roomNights,
  rooms,
  roomTypes,
  stayOccupants
} from '../../db/schema'
import type { Ctx } from '../context'
import { inChunks, parseInput, requirePermission, type ServiceDeps } from '../kit'
import { KBS_CHECKOUT_LOOKBACK_DAYS } from '../occupants-service'
import { occupiedSlots } from '../reservation-view'
import { readSetting } from '../settings-service'
import { capacityReader } from '../room-capacity'

/** Reservation states drawn on the grid (cancelled, no-show and parked ones have released their nights). */
const ON_GRID = ['tentative', 'confirmed', 'checked_in', 'checked_out'] as const
type OnGrid = (typeof ON_GRID)[number]
const isOnGrid = (s: string): s is OnGrid => (ON_GRID as readonly string[]).includes(s)

type Db = ServiceDeps['db']

/** Rows of `ids` read slice by slice (SQLite's bound-variable limit). */
function chunked<T>(ids: readonly string[], read: (slice: string[]) => T[]): T[] {
  return inChunks([...new Set(ids)]).flatMap(read)
}

/**
 * Rooms of [from, to) in grid order (sort, then floor, then number, natural): every room in use on a day of the
 * range by its capacity history (K-27), and a room out of use that still has a stay there (its past stays stay
 * visible). Beds and "for sale" as they are on `from` (or the room's first day in the range).
 */
function gridRooms(db: Db, from: string, to: string, withStays: ReadonlySet<string>): GridRoom[] {
  const reader = capacityReader(db)
  const rows = db
    .select({ room: rooms, type: roomTypes })
    .from(rooms)
    .innerJoin(roomTypes, eq(rooms.roomTypeId, roomTypes.id))
    .all()
    .filter(({ room }) => reader.activeBetween(room, from, to) || withStays.has(room.id))
    .map(({ room, type }) => {
      const firstDay = reader.firstDay(room.id)
      const state = reader.on(room, firstDay && firstDay > from ? firstDay : from) ?? room
      return { room: { ...room, beds: state.beds, sellable: state.sellable }, type }
    })
  const natural = new Intl.Collator('tr', { numeric: true })
  return rows
    .sort(
      (a, b) =>
        a.room.sort - b.room.sort ||
        natural.compare(a.room.floor ?? '', b.room.floor ?? '') ||
        natural.compare(a.room.number, b.room.number)
    )
    .map(({ room, type }) => ({
      id: room.id,
      number: room.number,
      floor: room.floor,
      typeId: type.id,
      typeName: type.name,
      typeNameI18n: type.nameI18n ?? null,
      beds: room.beds,
      sellable: room.sellable,
      hk: room.hkStatus
    }))
}

/** Stays of the given reservations, each night with its derived payment status. */
function staysOf(db: Db, reservationIds: readonly string[], today: LocalDate, nowIso: string): GridStay[] {
  if (reservationIds.length === 0) return []
  const resRows = chunked(reservationIds, (ids) =>
    db
      .select({ r: reservations, g: guests })
      .from(reservations)
      .innerJoin(guests, eq(reservations.primaryGuestId, guests.id))
      .where(inArray(reservations.id, ids))
      .all()
  ).filter((row) => isOnGrid(row.r.status))
  const ids = resRows.map((row) => row.r.id)
  const stayRows = chunked(ids, (slice) =>
    db
      .select()
      .from(reservationRooms)
      .where(and(inArray(reservationRooms.reservationId, slice), ne(reservationRooms.status, 'cancelled')))
      .orderBy(asc(reservationRooms.sort), asc(reservationRooms.checkIn))
      .all()
  )
  const stayIds = stayRows.map((s) => s.id)
  const nightRows = chunked(stayIds, (slice) =>
    db.select().from(roomNights).where(inArray(roomNights.reservationRoomId, slice)).all()
  )
  const folioRows = chunked(ids, (slice) =>
    db.select().from(folios).where(inArray(folios.reservationId, slice)).all()
  )
  const payRows = chunked(
    folioRows.map((f) => f.id),
    (slice) =>
      db
        .select({
          folioId: payments.folioId,
          kind: payments.kind,
          amountFolioMinor: payments.amountFolioMinor,
          voidedAt: payments.voidedAt
        })
        .from(payments)
        .where(inArray(payments.folioId, slice))
        .all()
  )
  const tagRows = chunked(ids, (slice) =>
    db.select().from(reservationTags).where(inArray(reservationTags.reservationId, slice)).all()
  )
  const noteRows = chunked(ids, (slice) =>
    db
      .selectDistinct({ reservationId: reservationNotes.reservationId })
      .from(reservationNotes)
      .where(inArray(reservationNotes.reservationId, slice))
      .all()
  )
  // §6.15 as the panel and "Otelde kalanlar" read it: people in the house, and people who left in the last
  // KBS_CHECKOUT_LOOKBACK_DAYS days without a KBS check-out mark.
  // The hotel may switch KBS checks off (kbs.checksEnabled): then no bar carries the warning, as on every screen.
  const since = addDays(today, -KBS_CHECKOUT_LOOKBACK_DAYS)
  const kbsCandidates = readSetting(db, 'kbs.checksEnabled')
    ? stayRows.filter(
        (s) =>
          s.status === 'in_house' ||
          (s.status === 'done' && !!s.checkedOutAt && localDateOf(new Date(s.checkedOutAt)) >= since)
      )
    : []
  const occupantRows = chunked(
    kbsCandidates.map((s) => s.id),
    (slice) => db.select().from(stayOccupants).where(inArray(stayOccupants.reservationRoomId, slice)).all()
  )
  const kbsStays = new Set(
    kbsMissing(
      kbsCandidates.map((s) => ({
        ...s,
        checkIn: s.checkIn as LocalDate,
        checkOut: s.checkOut as LocalDate,
        cancelled: false
      })),
      occupantRows,
      nowIso
    ).map((issue) => issue.reservationRoomId)
  )

  const byRes = new Map(resRows.map((row) => [row.r.id, row]))
  const folioOf = new Map(folioRows.map((f) => [f.reservationId, f]))
  const paysOf = new Map<string, typeof payRows>()
  for (const p of payRows) paysOf.set(p.folioId, [...(paysOf.get(p.folioId) ?? []), p])
  const tagsOf = new Map<string, string[]>()
  for (const t of tagRows) tagsOf.set(t.reservationId, [...(tagsOf.get(t.reservationId) ?? []), t.tagId])
  const withNotes = new Set(noteRows.map((n) => n.reservationId))
  const stayById = new Map(stayRows.map((s) => [s.id, s]))
  const nightsOfRes = new Map<string, typeof nightRows>()
  for (const n of nightRows) {
    const stay = stayById.get(n.reservationRoomId)
    if (stay) nightsOfRes.set(stay.reservationId, [...(nightsOfRes.get(stay.reservationId) ?? []), n])
  }

  const out: GridStay[] = []
  for (const [reservationId, { r, g }] of byRes) {
    const folio = folioOf.get(reservationId)
    const nights = nightsOfRes.get(reservationId) ?? []
    const derived = deriveFolioNights(
      nights.map((n) => ({
        id: n.id,
        date: n.date as LocalDate,
        roomSort: stayById.get(n.reservationRoomId)?.sort ?? 0,
        priceMinor: n.priceMinor,
        dayUse: n.slot === 'day'
      })),
      (folio ? (paysOf.get(folio.id) ?? []) : []).map((p) => ({
        kind: p.kind,
        amountFolioMinor: p.amountFolioMinor,
        voided: !!p.voidedAt
      })),
      today
    )
    const standing = standingNoteAlert(g)
    for (const stay of stayRows.filter((s) => s.reservationId === reservationId)) {
      if (stay.status === 'cancelled') continue
      out.push({
        id: stay.id,
        reservationId,
        code: r.code,
        roomId: stay.roomId,
        checkIn: stay.checkIn,
        checkOut: stay.checkOut,
        dayUse: stay.checkIn === stay.checkOut,
        startTime: nights.find((n) => n.reservationRoomId === stay.id && n.slot === 'day')?.startTime ?? null,
        endTime: nights.find((n) => n.reservationRoomId === stay.id && n.slot === 'day')?.endTime ?? null,
        reservationStatus: r.status as OnGrid,
        stayStatus: stay.status,
        guestName: `${g.firstName} ${g.lastName}`.trim(),
        currency: folio?.currency ?? nights[0]?.currency ?? '',
        nights: nights
          .filter((n) => n.reservationRoomId === stay.id)
          .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
          .map((n) => ({ date: n.date, pay: derived.get(n.id)?.pay ?? 'unpaid', priceMinor: n.priceMinor })),
        tagIds: tagsOf.get(reservationId) ?? [],
        vip: g.vip,
        kbsMissing: kbsStays.has(stay.id),
        standingNote: standing ? { text: standing.text, level: standing.level } : null,
        hasNotes: !!r.notes?.trim() || withNotes.has(reservationId),
        children: r.children ?? 0
      })
    }
  }
  return out
}

/** A block as the grid draws it; `manual` = closed by hand (no status board, issue or task behind it). */
export function gridBlockOf(row: typeof roomBlocks.$inferSelect): GridBlock {
  return {
    id: row.id,
    roomId: row.roomId,
    dateFrom: row.dateFrom,
    dateTo: row.dateTo,
    kind: row.kind,
    reason: row.reason,
    note: row.note,
    manual: !row.source && !row.roomIssueId && !row.taskId
  }
}

/** Blocks overlapping [from, to) that are not cancelled. */
function blocksBetween(db: Db, from: string, to: string): GridBlock[] {
  return db
    .select()
    .from(roomBlocks)
    .where(and(isNull(roomBlocks.cancelledAt), lt(roomBlocks.dateFrom, to), gt(roomBlocks.dateTo, from)))
    .all()
    .map(gridBlockOf)
}

/**
 * Days of [from, to) a shown room is not in use (not opened yet, or taken out of use from Ayarlar → Odalar), drawn
 * like a block that only the room settings lift (`closed`).
 */
function closedBetween(db: Db, shown: readonly GridRoom[], from: string, to: string): GridBlock[] {
  const reader = capacityReader(db)
  const byId = new Map(
    db
      .select({ id: rooms.id, active: rooms.active, sellable: rooms.sellable, beds: rooms.beds })
      .from(rooms)
      .all()
      .map((r) => [r.id, r])
  )
  return shown.flatMap((g) => {
    const room = byId.get(g.id)
    if (!room) return []
    return reader.closedSpans(room, from, to).map((span) => ({
      id: `closed:${g.id}:${span.from}`,
      roomId: g.id,
      dateFrom: span.from,
      dateTo: span.to,
      kind: 'ooo' as const,
      reason: '',
      note: null,
      manual: false,
      closed: true
    }))
  })
}

export function createCalendarGrid(deps: ServiceDeps) {
  const { db } = deps

  return {
    /** Rooms, stays with a night or day slot in [from, to) and blocks; the caller adds the calendar days. */
    grid(ctx: Ctx, input: { from: string; to: string }): Omit<GridData, 'days'> {
      requirePermission(ctx, 'calendar', 'view')
      const { from, to } = parseInput(gridRangeSchema, input)
      const now = deps.clock()
      const today = localDateOf(now)
      const nightRows = db
        .selectDistinct({ id: reservationRooms.reservationId, roomId: roomNights.roomId })
        .from(roomNights)
        .innerJoin(reservationRooms, eq(roomNights.reservationRoomId, reservationRooms.id))
        .where(and(gte(roomNights.date, from), lt(roomNights.date, to)))
        .all()
      const reservationIds = [...new Set(nightRows.map((row) => row.id))]
      const shown = gridRooms(db, from, to, new Set(nightRows.map((row) => row.roomId)))
      return {
        today,
        from,
        to,
        rooms: shown,
        stays: staysOf(db, reservationIds, today, now.toISOString()),
        blocks: [...blocksBetween(db, from, to), ...closedBetween(db, shown, from, to)]
      }
    },

    /**
     * Years the grid scrolls through (G-31, K-46): back to the start-year setting or the oldest stay, whichever is
     * earlier; forward to ten years from now or the year after the furthest night or block.
     */
    bounds(ctx: Ctx): CalendarBounds {
      requirePermission(ctx, 'calendar', 'view')
      // room_nights_date_idx: both ends are one index step each, however many years are booked.
      const nights = db
        .select({ first: min(roomNights.date), last: max(roomNights.date) })
        .from(roomNights)
        .get()
      const lastBlock = db
        .select({ last: max(roomBlocks.dateTo) })
        .from(roomBlocks)
        .where(isNull(roomBlocks.cancelledAt))
        .get()
      const yearOf = (d: string | null | undefined): number | null => (d ? Number(d.slice(0, 4)) : null)
      const newest = [yearOf(nights?.last), yearOf(lastBlock?.last)].filter((y): y is number => y !== null)
      return calendarYears({
        thisYear: Number(localDateOf(deps.clock()).slice(0, 4)),
        startYear: readSetting(db, 'calendar.startYear'),
        oldestYear: yearOf(nights?.first),
        newestYear: newest.length ? Math.max(...newest) : null
      })
    },

    /**
     * Stays to jump to (G-49 "misafir ara → sonuca atla", G-190): a query that is exactly a room number brings that
     * room's stays first (so "302" is not taken for part of a reservation code), then guest name, phone or
     * reservation code matches; within each, nearest to today first, upcoming before past at the same distance.
     */
    findStays(ctx: Ctx, input: { query: string }): FoundStay[] {
      requirePermission(ctx, 'calendar', 'view')
      const { query } = parseInput(findStaysInputSchema, input)
      const today = localDateOf(deps.clock())
      // Only letters, digits and dashes reach LIKE (no wildcard of the user's own).
      // Every word of the name must be in the guest's name, in any order ("Yılmaz Ahmet" finds "Ahmet Yılmaz").
      const nameTokens = normalizeName(query).split(' ').filter(Boolean)
      const needles = phoneNeedles(query, 4)
      const code = query.toUpperCase().replace(/[^A-Z0-9-]/g, '')
      // Room numbers are compared whole (a few dozen rooms; inactive ones too, for their old stays).
      // "Oda 102" / "Room 102" / "Номер 102" mean room 102 (QA3c1 #5).
      const wanted = query
        .replace(/^\s*(oda|room|номер|no)[\s.:-]+(?=\S)/iu, '')
        .trim()
        .toLocaleUpperCase('tr')
      const roomIds = db
        .select({ id: rooms.id, number: rooms.number })
        .from(rooms)
        .all()
        .filter((r) => r.number.trim().toLocaleUpperCase('tr') === wanted)
        .map((r) => r.id)
      const inRoom = new Set(roomIds)
      const conditions = []
      if (nameTokens.length)
        conditions.push(and(...nameTokens.map((t) => like(guests.nameNormalized, `%${t}%`)))!)
      if (code.length >= 2) conditions.push(like(reservations.code, `%${code}%`))
      for (const d of needles) conditions.push(like(guests.phoneNormalized, `%${d}%`))
      if (conditions.length === 0 && roomIds.length === 0) return []
      const select = (where: SQL | undefined, order: SQL[] = [], limit = 500) =>
        db
          .select({ stay: reservationRooms, r: reservations, g: guests, roomNumber: rooms.number })
          .from(reservationRooms)
          .innerJoin(reservations, eq(reservationRooms.reservationId, reservations.id))
          .innerJoin(guests, eq(reservations.primaryGuestId, guests.id))
          .innerJoin(rooms, eq(reservationRooms.roomId, rooms.id))
          .where(
            and(ne(reservationRooms.status, 'cancelled'), inArray(reservations.status, [...ON_GRID]), where)
          )
          .orderBy(...order)
          .limit(limit)
          .all()
      // A room holds years of stays: only the ones nearest to today on each side are read.
      const inRoomIds = inArray(reservationRooms.roomId, roomIds)
      const rows = [
        ...(roomIds.length
          ? [
              ...select(
                and(inRoomIds, gt(reservationRooms.checkOut, today)),
                [asc(reservationRooms.checkIn)],
                FIND_STAYS_MAX
              ),
              ...select(
                and(inRoomIds, lte(reservationRooms.checkOut, today)),
                [desc(reservationRooms.checkOut)],
                FIND_STAYS_MAX
              )
            ]
          : []),
        ...(conditions.length ? select(or(...conditions)) : []).filter((x) => !inRoom.has(x.stay.roomId))
      ]
      const distance = (s: { checkIn: string; checkOut: string }): number => {
        const a = diffDays(today, s.checkIn as LocalDate)
        const b = diffDays(today, s.checkOut as LocalDate)
        if (a <= 0 && b > 0) return 0
        return a > 0 ? a * 2 : -b * 2 + 1
      }
      const roomFirst = (x: { stay: { roomId: string } }): number => (inRoom.has(x.stay.roomId) ? 0 : 1)
      return rows
        .sort((x, y) => roomFirst(x) - roomFirst(y) || distance(x.stay) - distance(y.stay))
        .slice(0, FIND_STAYS_MAX)
        .map(({ stay, r, g, roomNumber }) => ({
          stayId: stay.id,
          reservationId: r.id,
          code: r.code,
          guestName: `${g.firstName} ${g.lastName}`.trim(),
          roomId: stay.roomId,
          roomNumber,
          checkIn: stay.checkIn,
          checkOut: stay.checkOut,
          reservationStatus: r.status as OnGrid
        }))
    },

    /**
     * Active, sellable rooms that can take the stay (nights [checkIn, checkOut), or the day slot of a day-use),
     * optionally of one room type, in grid order. The same conflict rule as writing a reservation
     * (`findConflicts`, G-37): a day-use is not free inside someone's stay, nights are not free across a day-use.
     */
    freeRooms(ctx: Ctx, input: { checkIn: string; checkOut: string; roomTypeId?: string | null }): string[] {
      requirePermission(ctx, 'calendar', 'view')
      const data = parseInput(freeRoomsInputSchema, input)
      const checkIn = localDate(data.checkIn)
      const checkOut = localDate(data.checkOut)
      const slots = staySlots(checkIn, checkOut)
      const end = checkIn === checkOut ? addDays(checkIn, 1) : checkOut
      const occupied = occupiedSlots(db, checkIn, end)
      const blocks = db
        .select()
        .from(roomBlocks)
        .where(
          and(isNull(roomBlocks.cancelledAt), lt(roomBlocks.dateFrom, end), gt(roomBlocks.dateTo, checkIn))
        )
        .all()
        .map((b) => ({ ...b, dateFrom: b.dateFrom as LocalDate, dateTo: b.dateTo as LocalDate }))
      // In use and for sale on every day of the stay (capacity history, K-27).
      const reader = capacityReader(db)
      const days = slots.map((s) => s.date)
      const candidates = new Set(
        db
          .select({ id: rooms.id, active: rooms.active, sellable: rooms.sellable, beds: rooms.beds })
          .from(rooms)
          .where(data.roomTypeId ? eq(rooms.roomTypeId, data.roomTypeId) : undefined)
          .all()
          .filter((r) => reader.sellableOn(r, days))
          .map((r) => r.id)
      )
      return gridRooms(db, checkIn, end, new Set())
        .filter((r) => candidates.has(r.id) && findConflicts(r.id, slots, occupied, blocks).length === 0)
        .map((r) => r.id)
    }
  }
}

export type CalendarGrid = ReturnType<typeof createCalendarGrid>
