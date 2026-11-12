// Test helper (imported by tests only, never by the app): an in-memory stand-in for the room status board, room
// issues and their photos over the shared settings/sign-in fake (src/renderer/test/render.tsx). It keeps the rules
// the screens show (a closing state needs the block right and opens a block, resolving ends the issue's block,
// only a resolved issue's photo can be deleted) and records every call. Names are invented.
import {
  SETTINGS_DEFAULTS,
  type ProcedureName,
  type ProcedureOutput,
  type SettingsValues
} from '@shared/contract'
import type { AttachmentView, BoardRoomView, RoomIssueView } from '@shared/contract/procedures/housekeeping'
import { addDays, localDate, type LocalDate } from '@shared/date'
import { blockKindOf, closesRoom, ISSUE_SEVERITY_RANK, type HkState } from '@shared/domain/housekeeping'
import { fakeTransport, type FakeTransportOptions } from '@/test/render'
import { ApiError, type Transport } from '@/lib/transport/types'

export const FAKE_TODAY = localDate('2026-10-12')

export interface HousekeepingState {
  today: LocalDate
  showGuests: boolean
  showIssues: boolean
  rooms: BoardRoomView[]
  issues: RoomIssueView[]
  photos: AttachmentView[]
}

const room = (number: string, floor: string, extra: Partial<BoardRoomView> = {}): BoardRoomView => ({
  id: `room-${number}`,
  number,
  floor,
  typeName: 'Standart',
  typeNameI18n: { tr: 'Standart', en: 'Standard', ru: 'Стандарт' },
  beds: 2,
  hk: 'clean',
  hkNote: null,
  hkAt: null,
  hkByName: null,
  guest: null,
  occupied: false,
  arriving: false,
  departing: false,
  openIssues: 0,
  block: null,
  ...extra
})

export const issue = (id: string, extra: Partial<RoomIssueView> = {}): RoomIssueView => ({
  id,
  roomId: null,
  roomNumber: null,
  area: null,
  title: `Arıza ${id}`,
  description: null,
  severity: 'medium',
  status: 'open',
  reportedBy: 'u-hk',
  reportedByName: 'Ayşe Kaya',
  reportedAt: '2026-10-12T07:50:00.000Z',
  assignedTo: null,
  plannedDate: null,
  resolvedAt: null,
  resolvedBy: null,
  resolvedByName: null,
  resolutionNote: null,
  history: [],
  blocksRoom: false,
  photos: 0,
  block: null,
  createdAt: '2026-10-12T07:50:00.000Z',
  updatedAt: '2026-10-12T07:50:00.000Z',
  ...extra
})

/** Six rooms on two floors: one in use and leaving today, one dirty with a note, one arriving, one with issues. */
export function defaultHousekeeping(): HousekeepingState {
  const rooms = [
    room('101', '1', {
      hk: 'dirty',
      hkNote: 'Çarşaf eksik',
      hkAt: '2026-10-12T06:10:00.000Z',
      hkByName: 'Deniz Arslan'
    }),
    room('102', '1', { guest: 'Örnek Yılmaz', occupied: true, departing: true }),
    room('103', '1', { arriving: true }),
    room('201', '2', { hk: 'inspected' }),
    room('202', '2', { hk: 'dirty' }),
    room('203', '2', { openIssues: 1 })
  ]
  return {
    today: FAKE_TODAY,
    showGuests: true,
    showIssues: true,
    rooms,
    issues: [
      issue('i1', {
        roomId: 'room-203',
        roomNumber: '203',
        title: 'Klozet kapağı kırık',
        severity: 'urgent',
        reportedAt: '2026-10-02T09:00:00.000Z',
        photos: 1
      }),
      issue('i2', { area: 'Lobi', title: 'Kapı gıcırdıyor', severity: 'low' }),
      issue('i3', {
        roomId: 'room-101',
        roomNumber: '101',
        title: 'Lavabo gideri yavaş',
        status: 'resolved',
        resolvedAt: '2026-10-03T12:00:00.000Z',
        resolvedByName: 'Deniz Arslan',
        resolutionNote: 'Gider açıldı',
        photos: 2
      })
    ],
    photos: [
      {
        id: 'p1',
        entity: 'room_issue',
        entityId: 'i1',
        mime: 'image/png',
        bytes: 70,
        width: 1,
        height: 1,
        createdAt: '2026-10-02T09:00:00.000Z',
        deletedAt: null
      },
      {
        id: 'p2',
        entity: 'room_issue',
        entityId: 'i3',
        mime: 'image/png',
        bytes: 70,
        width: 1,
        height: 1,
        createdAt: '2026-10-03T09:00:00.000Z',
        deletedAt: null
      },
      {
        id: 'p3',
        entity: 'room_issue',
        entityId: 'i3',
        mime: 'image/png',
        bytes: 70,
        width: 1,
        height: 1,
        createdAt: '2026-10-03T09:00:00.000Z',
        deletedAt: null
      }
    ]
  }
}

const PNG_1PX =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

export type HousekeepingTransport = Transport & {
  state: HousekeepingState
  calls: { name: ProcedureName; input: unknown }[]
}

export function housekeepingTransport(
  state: HousekeepingState = defaultHousekeeping(),
  opts: FakeTransportOptions & { settings?: SettingsValues; canBlock?: boolean; failBoard?: boolean } = {}
): HousekeepingTransport {
  const base = fakeTransport(opts.settings ?? SETTINGS_DEFAULTS, opts)
  const calls: HousekeepingTransport['calls'] = []
  let next = 1
  const at = `${state.today}T09:00:00.000Z`
  const findRoom = (id: string): BoardRoomView => {
    const r = state.rooms.find((x) => x.id === id)
    if (!r) throw new ApiError('NOT_FOUND', 404, 'errors.notFound')
    return r
  }
  const findIssue = (id: string): RoomIssueView => {
    const i = state.issues.find((x) => x.id === id)
    if (!i) throw new ApiError('NOT_FOUND', 404, 'errors.notFound')
    return i
  }
  const replaceIssue = (i: RoomIssueView): RoomIssueView => {
    state.issues = state.issues.map((x) => (x.id === i.id ? i : x))
    return i
  }
  const photosOf = (id: string) => state.photos.filter((p) => p.entityId === id && !p.deletedAt).length
  return {
    kind: 'ipc',
    state,
    calls,
    async call(name: ProcedureName, input: unknown) {
      calls.push({ name, input })
      const out = (value: unknown) => value as never
      switch (name) {
        case 'housekeeping.board':
          if (opts.failBoard) throw new ApiError('INTERNAL', 500, 'errors.internal')
          // Like the service: no guest names for a role that does not see reservations.
          return out({
            today: state.today,
            showGuests: state.showGuests,
            showIssues: state.showIssues,
            rooms: state.rooms.map((r) => (state.showGuests ? r : { ...r, guest: null }))
          })
        case 'housekeeping.setStatus': {
          const { roomId, status, note } = input as { roomId: string; status: HkState; note?: string | null }
          const r = findRoom(roomId)
          if (opts.canBlock === false && status !== r.hk && (closesRoom(status) || closesRoom(r.hk)))
            throw new ApiError('PERMISSION_DENIED', 403, 'errors.permissionDenied')
          const kind = blockKindOf(status)
          const block = kind
            ? {
                id: `b-${roomId}`,
                kind,
                reason: '',
                dateFrom: state.today,
                dateTo: addDays(state.today, 365),
                active: true,
                fromStatus: true,
                roomIssueId: null
              }
            : r.block?.fromStatus
              ? null
              : r.block
          Object.assign(r, { hk: status, hkNote: note ?? null, hkAt: at, hkByName: 'Otel Sahibi', block })
          return out({
            id: r.id,
            hk: r.hk,
            hkNote: r.hkNote,
            hkAt: r.hkAt,
            block: block
              ? {
                  ...block,
                  roomId,
                  note: null,
                  taskId: null,
                  source: 'hk_status',
                  cancelledAt: null,
                  createdAt: at,
                  updatedAt: at
                }
              : null
          })
        }
        case 'housekeeping.setNote': {
          const { roomId, note } = input as { roomId: string; note: string | null }
          const r = findRoom(roomId)
          r.hkNote = note
          return out({ id: r.id, hk: r.hk, hkNote: r.hkNote, hkAt: r.hkAt })
        }
        case 'housekeeping.openIssuesByRoom': {
          const open = state.issues.filter((i) => i.roomId && i.status !== 'resolved')
          const rooms = [...new Set(open.map((i) => i.roomId!))]
          return out(
            rooms.map((roomId) => {
              const list = open.filter((i) => i.roomId === roomId)
              return {
                roomId,
                roomNumber: list[0]!.roomNumber,
                count: list.length,
                severity: list
                  .map((i) => i.severity)
                  .sort((a, b) => ISSUE_SEVERITY_RANK[a] - ISSUE_SEVERITY_RANK[b])[0],
                oldestReportedAt: list[0]!.reportedAt,
                blocksRoom: list.some((i) => i.blocksRoom),
                issues: list.map((i) => ({
                  id: i.id,
                  title: i.title,
                  severity: i.severity,
                  status: i.status,
                  reportedAt: i.reportedAt,
                  blocksRoom: i.blocksRoom
                }))
              }
            })
          )
        }
        case 'housekeeping.issues': {
          const { roomId, status } = input as { roomId?: string; status?: string[] }
          return out(
            state.issues
              .filter((i) => (!roomId || i.roomId === roomId) && (!status || status.includes(i.status)))
              .map((i) => ({ ...i, photos: photosOf(i.id) }))
          )
        }
        case 'housekeeping.issue':
          return out(findIssue((input as { id: string }).id))
        case 'housekeeping.reportIssue': {
          const data = input as {
            roomId?: string | null
            area?: string | null
            title: string
            description?: string | null
            severity?: RoomIssueView['severity']
            blocksRoom?: boolean
          }
          if (data.blocksRoom && opts.canBlock === false)
            throw new ApiError('PERMISSION_DENIED', 403, 'errors.permissionDenied')
          const r = data.roomId ? findRoom(data.roomId) : null
          const made = issue(`new-${next++}`, {
            roomId: r?.id ?? null,
            roomNumber: r?.number ?? null,
            area: r ? null : (data.area ?? null),
            title: data.title,
            description: data.description ?? null,
            severity: data.severity ?? 'medium',
            reportedByName: 'Otel Sahibi',
            reportedAt: at,
            blocksRoom: !!data.blocksRoom,
            block:
              data.blocksRoom && r
                ? {
                    id: `ib-${next}`,
                    roomId: r.id,
                    dateFrom: state.today,
                    dateTo: addDays(state.today, 365),
                    kind: 'oos',
                    reason: data.title,
                    note: null,
                    roomIssueId: `new-${next - 1}`,
                    taskId: null,
                    source: null,
                    cancelledAt: null,
                    createdAt: at,
                    updatedAt: at
                  }
                : null
          })
          state.issues = [...state.issues, made]
          if (r) r.openIssues = (r.openIssues ?? 0) + 1
          return out(made)
        }
        case 'housekeeping.planIssue': {
          const { id, plannedDate, assignedTo } = input as {
            id: string
            plannedDate: LocalDate
            assignedTo?: string | null
          }
          return out(
            replaceIssue({ ...findIssue(id), status: 'planned', plannedDate, assignedTo: assignedTo ?? null })
          )
        }
        case 'housekeeping.resolveIssue': {
          const { id, resolutionNote } = input as { id: string; resolutionNote?: string | null }
          const before = findIssue(id)
          if (before.status === 'resolved') throw new ApiError('CONFLICT', 409, 'errors.issueResolved')
          return out(
            replaceIssue({
              ...before,
              status: 'resolved',
              resolvedAt: at,
              resolvedByName: 'Otel Sahibi',
              resolutionNote: resolutionNote ?? null,
              block: null
            })
          )
        }
        case 'rooms.list':
          return out(
            state.rooms.map((r, sort) => ({
              id: r.id,
              number: r.number,
              floor: r.floor,
              roomTypeId: 'type-standard',
              beds: r.beds,
              sellable: true,
              notes: null,
              sort,
              active: true
            }))
          )
        case 'rooms.listTypes':
          return out([
            {
              id: 'type-standard',
              code: 'standard',
              name: 'Standart',
              nameI18n: { tr: 'Standart', en: 'Standard', ru: 'Стандарт' },
              group: 'tier',
              isCustom: false,
              maxAdults: 2,
              basePriceMinor: null,
              weekendPriceMinor: null,
              baseCurrency: null,
              sort: 0,
              active: true
            }
          ] satisfies ProcedureOutput<'rooms.listTypes'>)
        case 'attachments.list': {
          const { entityId } = input as { entityId: string }
          return out(state.photos.filter((p) => p.entityId === entityId))
        }
        case 'attachments.read':
          return out({ id: (input as { id: string }).id, mime: 'image/png', dataBase64: PNG_1PX })
        case 'attachments.add': {
          const { entityId, mime } = input as { entityId: string; mime: string }
          const row: AttachmentView = {
            id: `p-new-${next++}`,
            entity: 'room_issue',
            entityId,
            mime,
            bytes: 70,
            width: 1,
            height: 1,
            createdAt: at,
            deletedAt: null
          }
          state.photos = [...state.photos, row]
          return out(row)
        }
        case 'attachments.deleteFile': {
          const { id } = input as { id: string }
          const row = state.photos.find((p) => p.id === id)!
          if (findIssue(row.entityId).status !== 'resolved')
            throw new ApiError('CONFLICT', 409, 'errors.attachmentKept')
          row.deletedAt = at
          return out(row)
        }
        default:
          return base.call(name, input as never)
      }
    }
  } as HousekeepingTransport
}
