// Room occupants and KBS marks (03-mimari.md §4.4, §6.15; G-53, G-54, K-33; legally important): every person in
// the room, a descriptor for the night shift, KBS reported / KBS check-out marks with who and when. The same
// `kbsMissing` drives the calendar icon, the Today card, the handover summary and "Otelde kalanlar".
import { and, asc, eq, gte, inArray, isNotNull, isNull, lt, lte, ne, or } from 'drizzle-orm'
import { occupantInputSchema, type OccupantInput } from '@shared/contract/reservations'
import { addDays, diffDays, localDateOf, type LocalDate } from '@shared/date'
import { localDateTimeOf } from '@shared/domain/local-datetime'
import { normalizeName } from '@shared/domain/normalize'
import { forEachSellableDay } from '@shared/domain/reports-period'
import {
  isLateArrival,
  kbsMissing,
  occupantCount,
  overdueCheckouts,
  type KbsIssue,
  type StayRoomLike
} from '@shared/domain/occupants'
import { folioTotals } from '@shared/domain/payment-allocation'
import {
  charges,
  folios,
  guests,
  payments,
  reservationRooms,
  reservations,
  roomTypes,
  rooms,
  stayOccupants,
  users
} from '../db/schema'
import type { I18nText } from '../db/schema/columns'
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
import { blacklistMatches } from './reservation-view'
import { capacityInputs } from './reports/queries'
import { readSetting } from './settings-service'

export type OccupantRow = typeof stayOccupants.$inferSelect

/** People who left longer ago than this no longer show as a missing KBS check-out (the list stays short). */
export const KBS_CHECKOUT_LOOKBACK_DAYS = 30

export interface InHouseRoom {
  stayId: string
  reservationId: string
  reservationCode: string
  roomId: string
  roomNumber: string
  checkIn: LocalDate
  checkOut: LocalDate
  people: number
  occupants: OccupantRow[]
}

/** A person as "Otelde kalanlar" shows them: the KBS marks with who set them (G-53: kim, ne zaman). */
export interface OccupantView extends OccupantRow {
  kbsReportedByName: string | null
  kbsCheckoutByName: string | null
}

/** One room of the night list (G-54): people, descriptor notes, KBS marks, the reservation's note and balance. */
export interface InHouseRoomView extends Omit<InHouseRoom, 'occupants'> {
  roomTypeName: string
  roomTypeNameI18n: I18nText | null
  guestName: string
  /** The reservation's free note (requests: "geç gelecek"). */
  note: string | null
  /** Folio balance; null when the caller may not see payments. */
  balanceMinor: number | null
  currency: string | null
  /** KBS work left in this room: unmarked people, or 1 when nobody is recorded at all (§6.15 unnamed). */
  kbsGaps: number
  occupants: OccupantView[]
}

/** Someone who left (alone, or with the stay's check-out) and still needs the KBS check-out mark. */
export interface KbsCheckoutPending {
  occupantId: string
  stayId: string
  fullName: string
  roomNumber: string
  /** The KBS entry was marked (false: the check-out mark sets both). */
  kbsReported: boolean
  leftAt: string | null
}

export interface InHouseView {
  today: LocalDate
  /** Balances are shown (payments view). */
  showMoney: boolean
  /** The hotel setting kbs.checksEnabled. */
  kbsChecks: boolean
  rooms: InHouseRoomView[]
  checkoutPending: KbsCheckoutPending[]
}

/** An arrival or departure line of the Today screen (G-92). */
export interface DayStay {
  stayId: string
  reservationId: string
  reservationCode: string
  roomNumber: string
  guestName: string
  checkIn: LocalDate
  checkOut: LocalDate
  nights: number
  checkedInAt: string | null
  checkedOutAt: string | null
  /** Should have left by now (check-out time passed, still in the room). */
  overdue: boolean
  note: string | null
  balanceMinor: number | null
  currency: string | null
}

export interface DayLists {
  at: string
  today: LocalDate
  /** Hotel wall clock "HH:MM" and the check-out time setting (Pandora 12:00). */
  nowTime: string
  checkoutTime: string
  /** Rooms that can be sold, and rooms with a stay tonight (occupancy). */
  sellableRooms: number
  soldTonight: number
  /** Today's arrivals and departures; null when the caller may not see reservations. */
  arrivals: DayStay[] | null
  departures: DayStay[] | null
}

const matchesPending = (p: KbsCheckoutPending, needle: string): boolean =>
  normalizeName(p.fullName).includes(needle) || normalizeName(p.roomNumber).includes(needle)

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

export function createOccupantsService(deps: ServiceDeps) {
  const { db } = deps

  function occupantOf(tx: Pick<Tx, 'select'>, id: string): OccupantRow {
    const row = tx.select().from(stayOccupants).where(eq(stayOccupants.id, id)).get()
    if (!row) throw notFound('stay_occupant', id)
    return row
  }

  function stayOf(tx: Pick<Tx, 'select'>, id: string) {
    const row = tx.select().from(reservationRooms).where(eq(reservationRooms.id, id)).get()
    if (!row) throw notFound('reservation_room', id)
    return row
  }

  /** Marks set/cleared with who + when; every change audited (G-24). */
  /**
   * One audited change of a person. `already`: the change is in place (a KBS mark set before) — nothing is
   * written, so the first "who and when" stays.
   */
  function mark(
    ctx: Ctx,
    id: string,
    patch: (now: string, o: OccupantRow) => Partial<typeof stayOccupants.$inferInsert>,
    guard?: (o: OccupantRow, tx: Pick<Tx, 'select'>) => void,
    already?: (o: OccupantRow) => boolean
  ): OccupantRow {
    requirePermission(ctx, 'in_house', 'edit')
    return inTransaction(deps, ctx, (tx, audit, now) => {
      const before = occupantOf(tx, id)
      if (already?.(before)) return before
      guard?.(before, tx)
      tx.update(stayOccupants)
        .set({ ...patch(now.toISOString(), before), updatedAt: now.toISOString() })
        .where(eq(stayOccupants.id, id))
        .run()
      const after = occupantOf(tx, id)
      audit({ entity: 'stay_occupant', entityId: id, action: 'update', before, after })
      return after
    })
  }

  /**
   * What KBS still needs, read from the few rows that can need it (not the whole history): the stays in the
   * house with their people, and people who left within the last `KBS_CHECKOUT_LOOKBACK_DAYS` without a KBS
   * check-out mark.
   */
  function kbsCandidates(at: Date): {
    stays: StayRoomLike[]
    occupants: (typeof stayOccupants.$inferSelect)[]
  } {
    const inHouse = db.select().from(reservationRooms).where(eq(reservationRooms.status, 'in_house')).all()
    const since = new Date(at.getTime() - KBS_CHECKOUT_LOOKBACK_DAYS * 86_400_000).toISOString()
    const left = db
      .select({ o: stayOccupants, s: reservationRooms })
      .from(stayOccupants)
      .innerJoin(reservationRooms, eq(reservationRooms.id, stayOccupants.reservationRoomId))
      .where(
        and(
          isNull(stayOccupants.kbsCheckoutAt),
          ne(reservationRooms.status, 'cancelled'),
          or(gte(stayOccupants.leftAt, since), gte(reservationRooms.checkedOutAt, since))
        )
      )
      .all()
    const present = inHouse.length
      ? db
          .select()
          .from(stayOccupants)
          .where(
            inArray(
              stayOccupants.reservationRoomId,
              inHouse.map((s) => s.id)
            )
          )
          .all()
      : []
    const stays = new Map<string, StayRoomLike>()
    for (const s of [...inHouse, ...left.map((r) => r.s)]) stays.set(s.id, toStay(s))
    const occupants = new Map<string, typeof stayOccupants.$inferSelect>()
    for (const o of [...present, ...left.map((r) => r.o)]) occupants.set(o.id, o)
    return { stays: [...stays.values()], occupants: [...occupants.values()] }
  }

  /** Display names of users (KBS marks: "kim"). */
  function userNames(ids: readonly (string | null)[]): Map<string, string> {
    const wanted = [...new Set(ids.filter((i): i is string => !!i))]
    if (!wanted.length) return new Map()
    return new Map(
      db
        .select({ id: users.id, name: users.displayName })
        .from(users)
        .where(inArray(users.id, wanted))
        .all()
        .map((u) => [u.id, u.name])
    )
  }

  /** Folio balance per reservation (charges − credits, integer minor units; G-131). */
  function balances(
    reservationIds: readonly string[]
  ): Map<string, { balanceMinor: number; currency: string }> {
    const out = new Map<string, { balanceMinor: number; currency: string }>()
    const ids = [...new Set(reservationIds)]
    if (!ids.length) return out
    const folioRows = db.select().from(folios).where(inArray(folios.reservationId, ids)).all()
    const folioIds = folioRows.map((f) => f.id)
    if (!folioIds.length) return out
    const chargeRows = db.select().from(charges).where(inArray(charges.folioId, folioIds)).all()
    const payRows = db.select().from(payments).where(inArray(payments.folioId, folioIds)).all()
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
      const prev = out.get(f.reservationId)
      out.set(f.reservationId, {
        balanceMinor: (prev?.balanceMinor ?? 0) + totals.balanceMinor,
        currency: prev?.currency ?? f.currency
      })
    }
    return out
  }

  const withNames = (rows: readonly OccupantRow[]): OccupantView[] => {
    const names = userNames(rows.flatMap((o) => [o.kbsReportedBy, o.kbsCheckoutBy]))
    return rows.map((o) => ({
      ...o,
      kbsReportedByName: o.kbsReportedBy ? (names.get(o.kbsReportedBy) ?? null) : null,
      kbsCheckoutByName: o.kbsCheckoutBy ? (names.get(o.kbsCheckoutBy) ?? null) : null
    }))
  }

  /** Stays with room, room type, reservation and primary guest, in room order. */
  const stayJoin = (where: ReturnType<typeof and>) =>
    db
      .select({
        s: reservationRooms,
        roomNumber: rooms.number,
        typeName: roomTypes.name,
        typeNameI18n: roomTypes.nameI18n,
        code: reservations.code,
        note: reservations.notes,
        firstName: guests.firstName,
        lastName: guests.lastName
      })
      .from(reservationRooms)
      .innerJoin(rooms, eq(rooms.id, reservationRooms.roomId))
      .innerJoin(roomTypes, eq(roomTypes.id, rooms.roomTypeId))
      .innerJoin(reservations, eq(reservations.id, reservationRooms.reservationId))
      .innerJoin(guests, eq(guests.id, reservations.primaryGuestId))
      .where(where)
      .orderBy(asc(rooms.sort), asc(rooms.number))
      .all()

  /** Room number, the holder's name, a person's name or descriptor contains `needle` (normalised: "kızıl"). */
  const matches = (r: InHouseRoomView, needle: string): boolean =>
    !needle ||
    normalizeName(r.roomNumber).includes(needle) ||
    normalizeName(r.guestName).includes(needle) ||
    r.occupants.some(
      (o) =>
        normalizeName(o.fullName).includes(needle) || normalizeName(o.descriptorNote ?? '').includes(needle)
    )

  return {
    list(ctx: Ctx, stayId: string): OccupantRow[] {
      requirePermission(ctx, 'in_house', 'view')
      return db
        .select()
        .from(stayOccupants)
        .where(eq(stayOccupants.reservationRoomId, stayId))
        .orderBy(asc(stayOccupants.createdAt))
        .all()
    },

    /**
     * Adds a person, also during the stay ("sonradan gelen kişi"; arrived now). The person is checked against the
     * blacklist like the reservation's guest (G-45, §6.9): a match needs `blacklistConfirmed`, an "engelle" entry
     * is passed only by whoever may remove entries (Sahip, Müdür); the confirmation is kept in the audit row.
     */
    add(
      ctx: Ctx,
      stayId: string,
      input: OccupantInput,
      opts: { blacklistConfirmed?: boolean } = {}
    ): OccupantRow {
      requirePermission(ctx, 'in_house', 'edit')
      const data = parseInput(occupantInputSchema, input)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const stay = stayOf(tx, stayId)
        if (stay.status === 'cancelled' || stay.status === 'done')
          throw invalid('errors.invalidStayState', { status: stay.status })
        const guest = data.guestId ? tx.select().from(guests).where(eq(guests.id, data.guestId)).get() : null
        if (data.guestId && !guest) throw notFound('guest', data.guestId)
        const hits = blacklistMatches(
          tx,
          {
            name: data.fullName,
            phone: guest?.phone ?? null,
            idDocNumber: guest?.idDocNumber ?? null,
            guestId: guest?.id ?? null
          },
          ctx.can('blacklist', 'view')
        )
        if (hits.length && !opts.blacklistConfirmed) throw conflict('errors.blacklistMatch', { hits })
        if (hits.some((h) => h.severity === 'block') && !ctx.can('blacklist.remove', 'edit'))
          throw conflict('errors.blacklistBlocked', { hits })
        const id = newId(now)
        const row = {
          id,
          reservationRoomId: stayId,
          guestId: data.guestId ?? null,
          fullName: data.fullName,
          descriptorNote: data.descriptorNote ?? null,
          isPrimary: false,
          arrivedAt: data.arrivedAt ?? (stay.checkedInAt ? now.toISOString() : null),
          createdBy: ctx.userId,
          ...stamps(now)
        }
        tx.insert(stayOccupants).values(row).run()
        audit({
          entity: 'stay_occupant',
          entityId: id,
          action: 'create',
          after: row,
          reason: hits.length ? `blacklist: ${hits.map((h) => h.entryId).join(', ')}` : undefined
        })
        return occupantOf(tx, id)
      })
    },

    update(ctx: Ctx, id: string, input: Partial<OccupantInput>): OccupantRow {
      requirePermission(ctx, 'in_house', 'edit')
      const data = parseInput(occupantInputSchema.partial(), input)
      if (data.guestId && !db.select({ id: guests.id }).from(guests).where(eq(guests.id, data.guestId)).get())
        throw notFound('guest', data.guestId)
      return mark(ctx, id, () => ({
        ...(data.fullName ? { fullName: data.fullName } : {}),
        ...(data.descriptorNote !== undefined ? { descriptorNote: data.descriptorNote ?? null } : {}),
        ...(data.guestId !== undefined ? { guestId: data.guestId ?? null } : {})
      }))
    },

    markKbsReported(ctx: Ctx, id: string): OccupantRow {
      return mark(
        ctx,
        id,
        (now) => ({ kbsReportedAt: now, kbsReportedBy: ctx.userId }),
        undefined,
        (o) => !!o.kbsReportedAt
      )
    },

    /** Undo a mistaken mark (audited); not once the KBS check-out is reported too. */
    clearKbsReported(ctx: Ctx, id: string): OccupantRow {
      return mark(
        ctx,
        id,
        () => ({ kbsReportedAt: null, kbsReportedBy: null }),
        (o) => {
          if (o.kbsCheckoutAt) throw invalid('errors.kbsCheckoutMarked')
        }
      )
    },

    /**
     * The KBS check-out is done. A person who already left but was never marked as reported (the entry was done in
     * KBS and not ticked here) gets both marks in this one audited write: KBS has no check-out without an entry.
     * Someone still in the house needs the entry mark first.
     */
    markKbsCheckout(ctx: Ctx, id: string): OccupantRow {
      return mark(
        ctx,
        id,
        (now, o) => ({
          ...(o.kbsReportedAt ? {} : { kbsReportedAt: now, kbsReportedBy: ctx.userId }),
          kbsCheckoutAt: now,
          kbsCheckoutBy: ctx.userId
        }),
        (o, tx) => {
          if (o.kbsReportedAt || o.leftAt) return
          if (!stayOf(tx, o.reservationRoomId).checkedOutAt) throw invalid('errors.kbsNotReported')
        },
        (o) => !!o.kbsCheckoutAt
      )
    },

    /** One person leaves before the others (the stay goes on); KBS then asks for their check-out. */
    markLeft(ctx: Ctx, id: string): OccupantRow {
      return mark(
        ctx,
        id,
        (now) => ({ leftAt: now }),
        (o) => {
          if (o.leftAt) throw invalid('errors.alreadyLeft')
        }
      )
    },

    /**
     * "Otelde kalanlar" as the screen and its A4 night list show it (G-53, G-54): every room in the house with
     * its people (who marked KBS, when), the reservation note and — for payments viewers — the balance; plus the
     * people who left without a KBS check-out mark. `q` matches name, room or descriptor ("kızıl").
     */
    inHouseView(ctx: Ctx, q?: string): InHouseView {
      requirePermission(ctx, 'in_house', 'view')
      const now = deps.clock()
      const at = now.toISOString()
      const stays = stayJoin(
        and(eq(reservationRooms.status, 'in_house'), isNull(reservationRooms.checkedOutAt))
      )
      const occ = stays.length
        ? db
            .select()
            .from(stayOccupants)
            .where(
              inArray(
                stayOccupants.reservationRoomId,
                stays.map((r) => r.s.id)
              )
            )
            .orderBy(asc(stayOccupants.createdAt))
            .all()
        : []
      const showMoney = ctx.can('payments', 'view')
      const money = showMoney
        ? balances(stays.map((r) => r.s.reservationId))
        : new Map<string, { balanceMinor: number; currency: string }>()
      const checksOn = readSetting(db, 'kbs.checksEnabled')
      const issues = checksOn
        ? kbsMissing(
            stays.map((r) => toStay(r.s)),
            occ,
            at
          )
        : []
      const named = withNames(occ)
      const needle = q ? normalizeName(q) : ''
      const roomsView: InHouseRoomView[] = stays
        .map((r) => {
          const b = money.get(r.s.reservationId)
          return {
            stayId: r.s.id,
            reservationId: r.s.reservationId,
            reservationCode: r.code,
            roomId: r.s.roomId,
            roomNumber: r.roomNumber,
            roomTypeName: r.typeName,
            roomTypeNameI18n: r.typeNameI18n ?? null,
            checkIn: r.s.checkIn as LocalDate,
            checkOut: r.s.checkOut as LocalDate,
            people: occupantCount(toStay(r.s), occ, at),
            guestName: `${r.firstName} ${r.lastName}`.trim(),
            note: r.note,
            balanceMinor: showMoney ? (b?.balanceMinor ?? 0) : null,
            currency: showMoney ? (b?.currency ?? null) : null,
            kbsGaps: issues.filter((i) => i.reservationRoomId === r.s.id && i.kind !== 'checkout').length,
            occupants: named.filter((o) => o.reservationRoomId === r.s.id && !o.leftAt)
          }
        })
        .filter((r) => matches(r, needle))

      let checkoutPending: KbsCheckoutPending[] = []
      if (checksOn) {
        const { stays: candidates, occupants: people } = kbsCandidates(now)
        const numbers = new Map(
          db
            .select({ id: rooms.id, number: rooms.number })
            .from(rooms)
            .all()
            .map((x) => [x.id, x.number])
        )
        const byId = new Map(people.map((o) => [o.id, o]))
        const stayById = new Map(candidates.map((x) => [x.id, x]))
        checkoutPending = kbsMissing(candidates, people, at)
          .filter((i) => i.kind === 'checkout' && i.occupantId)
          .map((i) => ({
            occupantId: i.occupantId as string,
            stayId: i.reservationRoomId,
            fullName: i.fullName ?? '',
            roomNumber: numbers.get(i.roomId) ?? '',
            kbsReported: !!byId.get(i.occupantId as string)?.kbsReportedAt,
            leftAt:
              byId.get(i.occupantId as string)?.leftAt ??
              stayById.get(i.reservationRoomId)?.checkedOutAt ??
              null
          }))
          .filter((p) => !needle || matchesPending(p, needle))
      }
      return { today: localDateOf(now), showMoney, kbsChecks: checksOn, rooms: roomsView, checkoutPending }
    },

    /**
     * Today's arrivals and departures (G-92) and tonight's occupancy for the Today screen. Needs the Today
     * screen; the guest lines only for roles that see reservations or the people in the house (housekeeping
     * sees rooms, not people: K-38).
     */
    dayLists(ctx: Ctx): DayLists {
      requirePermission(ctx, 'today', 'view')
      const now = deps.clock()
      const at = now.toISOString()
      const today = localDateOf(now)
      const nowTime = localDateTimeOf(now).slice(11, 16)
      const checkoutTime = readSetting(db, 'hotel.checkoutTime')
      // Sellable tonight the way the reports count it: capacity history and blocks (out of order) left out.
      const tonight = { from: today, to: addDays(today, 1) }
      const cap = capacityInputs(db, tonight)
      let sellableRooms = 0
      forEachSellableDay(cap.rooms, cap.changes, cap.blocks, tonight, () => sellableRooms++)
      const soldTonight = new Set(
        db
          .select({ roomId: reservationRooms.roomId })
          .from(reservationRooms)
          .where(
            and(
              ne(reservationRooms.status, 'cancelled'),
              lte(reservationRooms.checkIn, today),
              gte(reservationRooms.checkOut, addDays(today, 1)),
              isNull(reservationRooms.checkedOutAt)
            )
          )
          .all()
          .map((r) => r.roomId)
      ).size
      const base = { at, today, nowTime, checkoutTime, sellableRooms, soldTonight }
      if (!ctx.can('calendar', 'view') && !ctx.can('in_house', 'view'))
        return { ...base, arrivals: null, departures: null }
      const rows = stayJoin(
        and(
          ne(reservationRooms.status, 'cancelled'),
          or(
            eq(reservationRooms.checkIn, today),
            eq(reservationRooms.checkOut, today),
            // Past their check-out day and still in the room (G-92: loud, like the handover).
            and(
              lt(reservationRooms.checkOut, today),
              isNotNull(reservationRooms.checkedInAt),
              isNull(reservationRooms.checkedOutAt)
            ),
            // Yesterday's arrival still awaited after midnight, until the check-out time (isLateArrival).
            and(eq(reservationRooms.checkIn, addDays(today, -1)), isNull(reservationRooms.checkedInAt))
          )
        )
      )
      const showMoney = ctx.can('payments', 'view')
      const money = showMoney
        ? balances(rows.map((r) => r.s.reservationId))
        : new Map<string, { balanceMinor: number; currency: string }>()
      const overdue = new Set(
        overdueCheckouts(
          rows.map((r) => toStay(r.s)),
          today,
          nowTime,
          checkoutTime
        ).map((x) => x.id)
      )
      const line = (r: (typeof rows)[number]): DayStay => {
        const b = money.get(r.s.reservationId)
        return {
          stayId: r.s.id,
          reservationId: r.s.reservationId,
          reservationCode: r.code,
          roomNumber: r.roomNumber,
          guestName: `${r.firstName} ${r.lastName}`.trim(),
          checkIn: r.s.checkIn as LocalDate,
          checkOut: r.s.checkOut as LocalDate,
          nights: diffDays(r.s.checkIn as LocalDate, r.s.checkOut as LocalDate),
          checkedInAt: r.s.checkedInAt,
          checkedOutAt: r.s.checkedOutAt,
          overdue: overdue.has(r.s.id),
          note: r.note,
          balanceMinor: showMoney ? (b?.balanceMinor ?? 0) : null,
          currency: showMoney ? (b?.currency ?? null) : null
        }
      }
      // A day use (in and out today) is both an arrival and a departure.
      const arrivals = rows
        .filter((r) => r.s.checkIn === today || isLateArrival(toStay(r.s), today, nowTime, checkoutTime))
        .map(line)
      const departures = rows
        .filter((r) => r.s.checkOut === today || (r.s.checkOut < today && overdue.has(r.s.id)))
        .map(line)
        .sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.checkOut.localeCompare(b.checkOut))
      return { ...base, arrivals, departures }
    },

    /** §6.15 for the whole hotel now (empty when the hotel switched KBS checks off). */
    kbsMissing(ctx: Ctx): KbsIssue[] {
      requirePermission(ctx, 'in_house', 'view')
      if (!readSetting(db, 'kbs.checksEnabled')) return []
      const now = deps.clock()
      const { stays, occupants } = kbsCandidates(now)
      return kbsMissing(stays, occupants, now.toISOString())
    },

    /** "Otelde kalanlar" (G-54): room · people · descriptor · KBS; `q` matches name, room or note ("kızıl"). */
    inHouse(ctx: Ctx, q?: string): InHouseRoom[] {
      requirePermission(ctx, 'in_house', 'view')
      const at = deps.clock().toISOString()
      const stays = db
        .select({ s: reservationRooms, number: rooms.number, code: reservations.code })
        .from(reservationRooms)
        .innerJoin(rooms, eq(reservationRooms.roomId, rooms.id))
        .innerJoin(reservations, eq(reservationRooms.reservationId, reservations.id))
        .where(and(eq(reservationRooms.status, 'in_house'), isNull(reservationRooms.checkedOutAt)))
        .orderBy(asc(rooms.sort), asc(rooms.number))
        .all()
      const occ = stays.length
        ? db
            .select()
            .from(stayOccupants)
            .where(
              inArray(
                stayOccupants.reservationRoomId,
                stays.map((s) => s.s.id)
              )
            )
            .all()
        : []
      const needle = q ? normalizeName(q) : ''
      return stays
        .map(({ s, number, code }) => {
          const occupants = occ.filter((o) => o.reservationRoomId === s.id && !o.leftAt)
          return {
            stayId: s.id,
            reservationId: s.reservationId,
            reservationCode: code,
            roomId: s.roomId,
            roomNumber: number,
            checkIn: s.checkIn as LocalDate,
            checkOut: s.checkOut as LocalDate,
            people: occupantCount(toStay(s), occ, at),
            occupants
          }
        })
        .filter(
          (r) =>
            !needle ||
            normalizeName(r.roomNumber).includes(needle) ||
            r.occupants.some(
              (o) =>
                normalizeName(o.fullName).includes(needle) ||
                normalizeName(o.descriptorNote ?? '').includes(needle)
            )
        )
    }
  }
}

export type OccupantsService = ReturnType<typeof createOccupantsService>
