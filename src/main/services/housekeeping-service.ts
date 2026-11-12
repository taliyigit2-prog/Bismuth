// Room status board (G-90, S-96, G-180, G-38): every room with its state, note, who changed it and when, who is
// in it, today's movement, open issues and its block — one read for the floor plan and the list. Guest names
// only for roles that see reservations (housekeeping sees rooms, not people). Also the open issues per room that
// other screens show (calendar row icon, reservation panel warning, Today card).
import { and, asc, eq, gt, inArray, isNull, or } from 'drizzle-orm'
import { localDateOf, type LocalDate } from '@shared/date'
import { ISSUE_SEVERITY_RANK } from '@shared/domain/housekeeping'
import {
  guests,
  reservationRooms,
  reservations,
  roomBlocks,
  roomIssues,
  rooms,
  roomTypes,
  users
} from '../db/schema'
import type { Ctx } from './context'
import { permissionDenied } from './errors'
import { capacityReader } from './room-capacity'
import { requirePermission, type ServiceDeps } from './kit'

type Severity = keyof typeof ISSUE_SEVERITY_RANK

export interface BoardBlock {
  id: string
  kind: 'oos' | 'ooo'
  reason: string
  dateFrom: string
  dateTo: string
  /** Covers today (else it starts later). */
  active: boolean
  /** Opened by the status board (maintenance / out of order); ends when the state changes. */
  fromStatus: boolean
  roomIssueId: string | null
}

export interface BoardRoom {
  id: string
  number: string
  floor: string | null
  typeName: string
  typeNameI18n: { tr?: string; en?: string; ru?: string } | null
  beds: number
  hk: (typeof rooms.$inferSelect)['hkStatus']
  hkNote: string | null
  hkAt: string | null
  hkByName: string | null
  /** Who is in the room now (null when empty, or when the caller may not see guests). */
  guest: string | null
  occupied: boolean
  /** A stay starts today and nobody has checked in yet. */
  arriving: boolean
  /** The stay in the room ends today (or is overdue) and the guest has not checked out. */
  departing: boolean
  /** Open + planned issues of the room; null when the caller may not see issues. */
  openIssues: number | null
  block: BoardBlock | null
}

export interface Board {
  today: LocalDate
  showGuests: boolean
  showIssues: boolean
  rooms: BoardRoom[]
}

export interface RoomOpenIssues {
  roomId: string
  roomNumber: string
  count: number
  /** The most serious severity among them. */
  severity: Severity
  /** First report time of the oldest open one (ISO). */
  oldestReportedAt: string
  blocksRoom: boolean
  issues: {
    id: string
    title: string
    severity: Severity
    status: 'open' | 'planned'
    reportedAt: string
    blocksRoom: boolean
  }[]
}

/** Who may read the open-issue summary: anyone who sees rooms on a screen that shows the marker. */
const ISSUE_SUMMARY_KEYS = ['room_issues', 'calendar', 'today', 'rooms.status'] as const

export function createHousekeepingService(deps: ServiceDeps) {
  const { db } = deps

  const openIssueRows = () =>
    db
      .select()
      .from(roomIssues)
      .where(inArray(roomIssues.status, ['open', 'planned']))
      .orderBy(asc(roomIssues.reportedAt))
      .all()

  return {
    board(ctx: Ctx): Board {
      requirePermission(ctx, 'rooms.status', 'view')
      const today = localDateOf(deps.clock())
      const showGuests = ctx.can('calendar', 'view') || ctx.can('in_house', 'view')
      const showIssues = ctx.can('room_issues', 'view')
      const capacity = capacityReader(db)
      const roomRows = db
        .select({
          room: rooms,
          typeName: roomTypes.name,
          typeNameI18n: roomTypes.nameI18n,
          byName: users.displayName
        })
        .from(rooms)
        .innerJoin(roomTypes, eq(roomTypes.id, rooms.roomTypeId))
        .leftJoin(users, eq(users.id, rooms.hkStatusBy))
        .orderBy(asc(rooms.sort), asc(rooms.number))
        .all()
        // Rooms in use today by their capacity history (K-27), with today's beds.
        .flatMap((row) => {
          const state = capacity.on(row.room, today)
          return state?.active ? [{ ...row, room: { ...row.room, ...state } }] : []
        })
      // Stays that matter today: in the house now, or starting today and not checked in yet.
      const stays = db
        .select({
          roomId: reservationRooms.roomId,
          status: reservationRooms.status,
          checkIn: reservationRooms.checkIn,
          checkOut: reservationRooms.checkOut,
          firstName: guests.firstName,
          lastName: guests.lastName
        })
        .from(reservationRooms)
        .innerJoin(reservations, eq(reservations.id, reservationRooms.reservationId))
        .innerJoin(guests, eq(guests.id, reservations.primaryGuestId))
        .where(
          or(
            eq(reservationRooms.status, 'in_house'),
            and(
              eq(reservationRooms.status, 'planned'),
              eq(reservationRooms.checkIn, today),
              inArray(reservations.status, ['tentative', 'confirmed', 'checked_in'])
            )
          )
        )
        .all()
      const issues = showIssues ? openIssueRows() : []
      const blocks = db
        .select()
        .from(roomBlocks)
        .where(and(isNull(roomBlocks.cancelledAt), gt(roomBlocks.dateTo, today)))
        .orderBy(asc(roomBlocks.dateFrom))
        .all()
      return {
        today,
        showGuests,
        showIssues,
        rooms: roomRows.map(({ room, typeName, typeNameI18n, byName }) => {
          const inHouse = stays.find((s) => s.roomId === room.id && s.status === 'in_house')
          const block =
            blocks.find((b) => b.roomId === room.id && b.dateFrom <= today) ??
            blocks.find((b) => b.roomId === room.id) ??
            null
          return {
            id: room.id,
            number: room.number,
            floor: room.floor,
            typeName,
            typeNameI18n: typeNameI18n ?? null,
            beds: room.beds,
            hk: room.hkStatus,
            hkNote: room.hkNote,
            hkAt: room.hkStatusAt,
            hkByName: byName ?? null,
            guest: inHouse && showGuests ? `${inHouse.firstName} ${inHouse.lastName}`.trim() : null,
            occupied: !!inHouse,
            arriving: stays.some((s) => s.roomId === room.id && s.status === 'planned'),
            departing: !!inHouse && inHouse.checkOut <= today,
            openIssues: showIssues ? issues.filter((i) => i.roomId === room.id).length : null,
            block: block
              ? {
                  id: block.id,
                  kind: block.kind,
                  reason: block.reason,
                  dateFrom: block.dateFrom,
                  dateTo: block.dateTo,
                  active: block.dateFrom <= today,
                  fromStatus: block.source === 'hk_status',
                  roomIssueId: block.roomIssueId
                }
              : null
          }
        })
      }
    },

    /**
     * Open and planned issues grouped by room (general-area issues are left out): the calendar's row icon, the
     * reservation panel's "this room has an open issue" and the room tiles read this.
     */
    openIssuesByRoom(ctx: Ctx): RoomOpenIssues[] {
      if (!ISSUE_SUMMARY_KEYS.some((key) => ctx.can(key, 'view'))) throw permissionDenied()
      // The marker (count, severity, closed room) is for every screen above; what the issues are only for
      // roles that may read the issues themselves.
      const showIssues = ctx.can('room_issues', 'view')
      const numbers = new Map(
        db
          .select({ id: rooms.id, number: rooms.number })
          .from(rooms)
          .all()
          .map((r) => [r.id, r.number])
      )
      const byRoom = new Map<string, RoomOpenIssues>()
      for (const issue of openIssueRows()) {
        if (!issue.roomId || issue.status === 'resolved') continue
        const entry = byRoom.get(issue.roomId) ?? {
          roomId: issue.roomId,
          roomNumber: numbers.get(issue.roomId) ?? '',
          count: 0,
          severity: issue.severity,
          oldestReportedAt: issue.reportedAt,
          blocksRoom: false,
          issues: []
        }
        entry.count += 1
        if (ISSUE_SEVERITY_RANK[issue.severity] < ISSUE_SEVERITY_RANK[entry.severity])
          entry.severity = issue.severity
        if (issue.reportedAt < entry.oldestReportedAt) entry.oldestReportedAt = issue.reportedAt
        entry.blocksRoom ||= issue.blocksRoom
        if (showIssues)
          entry.issues.push({
            id: issue.id,
            title: issue.title,
            severity: issue.severity,
            status: issue.status,
            reportedAt: issue.reportedAt,
            blocksRoom: issue.blocksRoom
          })
        byRoom.set(issue.roomId, entry)
      }
      for (const entry of byRoom.values())
        entry.issues.sort(
          (a, b) =>
            ISSUE_SEVERITY_RANK[a.severity] - ISSUE_SEVERITY_RANK[b.severity] ||
            b.reportedAt.localeCompare(a.reportedAt)
        )
      return [...byRoom.values()]
    }
  }
}

export type HousekeepingService = ReturnType<typeof createHousekeepingService>
