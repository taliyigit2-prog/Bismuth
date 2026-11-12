// Test helper (imported by tests only, never by the app): an in-memory stand-in for the tasks, maintenance,
// handover and notes procedures over the shared settings/sign-in fake (src/renderer/test/render.tsx). It keeps the
// rules the screens show (done records who and when, a cancel needs a reason, a read handover leaves the unread
// list, closed notes leave the list) and records every call. Names and amounts are invented.
import {
  SETTINGS_DEFAULTS,
  type ProcedureName,
  type ProcedureOutput,
  type SettingsValues
} from '@shared/contract'
import { addDays, localDate, type LocalDate } from '@shared/date'
import { fakeTransport, type FakeTransportOptions } from '@/test/render'
import { ApiError, type Transport } from '@/lib/transport/types'
import type { TaskItem, TaskLookups, TemplateDetail, StayCounterGroup } from './task-data'

type Handover = ProcedureOutput<'shift.handovers'>[number]
type Summary = ProcedureOutput<'shift.summary'>
type Note = ProcedureOutput<'notes.list'>[number]

export const FAKE_TODAY = localDate('2026-10-12')
const AT = '2026-10-12T07:00:00.000Z'

export interface OperationsState {
  lookups: TaskLookups
  tasks: TaskItem[]
  templates: TemplateDetail[]
  counters: StayCounterGroup[]
  summary: Summary
  handovers: Handover[]
  notes: Note[]
}

export const task = (id: string, extra: Partial<TaskItem> = {}): TaskItem => ({
  id,
  templateId: null,
  title: `Görev ${id}`,
  titleI18n: null,
  description: null,
  assigneeUserId: null,
  assigneeRoleId: null,
  assigneeShiftId: null,
  roomId: null,
  dueAt: `${FAKE_TODAY}T15:00`,
  status: 'open',
  doneAt: null,
  doneBy: null,
  cancelReason: null,
  note: null,
  overdueNotifiedAt: null,
  createdBy: 'u-owner',
  createdAt: AT,
  updatedAt: AT,
  overdue: false,
  kind: 'general',
  templateCode: null,
  recurrence: null,
  roomNumber: null,
  assigneeName: null,
  doneByName: null,
  ...extra
})

export const template = (id: string, extra: Partial<TemplateDetail> = {}): TemplateDetail => ({
  id,
  code: null,
  kind: 'general',
  title: `Şablon ${id}`,
  titleI18n: null,
  description: null,
  assigneeUserId: null,
  assigneeRoleId: null,
  assigneeShiftId: null,
  assigneeName: null,
  roomId: null,
  roomNumber: null,
  recurrence: { kind: 'daily', time: '12:00' },
  firstDueAt: null,
  remindMinutesBefore: null,
  suggested: false,
  active: true,
  lastDoneAt: null,
  nextDueAt: null,
  openTaskId: null,
  openTaskDueAt: null,
  createdAt: AT,
  ...extra
})

const shift = (
  id: string,
  code: string,
  tr: string,
  en: string,
  ru: string,
  start: string,
  end: string,
  sort: number
) => ({
  id,
  code,
  name: null,
  displayName: { tr, en, ru },
  startTime: start,
  endTime: end,
  sort,
  active: true
})

export const emptySummary = (): Summary => ({
  at: AT,
  businessDate: FAKE_TODAY,
  arrivalsPending: [],
  overdueCheckouts: [],
  inHouse: { rooms: 0, people: 0 },
  kbsMissing: [],
  unpaid: [],
  openTasks: [],
  openIssues: [],
  cash: { pending: {}, drawer: {}, channels: {} }
})

export const handover = (id: string, extra: Partial<Handover> = {}): Handover => ({
  id,
  businessDate: FAKE_TODAY,
  fromShiftId: 'sh-night',
  toShiftId: 'sh-day',
  writtenBy: 'u-mehmet',
  writtenByName: 'Mehmet Yıldız',
  writtenAt: '2026-10-12T05:55:00.000Z',
  text: null,
  summary: emptySummary(),
  acknowledgedBy: null,
  acknowledgedByName: null,
  acknowledgedAt: null,
  createdAt: '2026-10-12T05:55:00.000Z',
  updatedAt: '2026-10-12T05:55:00.000Z',
  ...extra
})

export const note = (id: string, extra: Partial<Note> = {}): Note => ({
  id,
  kind: 'board',
  ownerUserId: null,
  text: `Not ${id}`,
  remindAt: null,
  pinned: false,
  doneAt: null,
  archivedAt: null,
  createdBy: 'u-owner',
  createdByName: 'Otel Sahibi',
  createdAt: AT,
  updatedAt: AT,
  ...extra
})

/** A small hotel day: a late task, today's tasks, a deep clean, upcoming and done ones; reminders; a handover. */
export function defaultOperations(): OperationsState {
  return {
    lookups: {
      userId: 'u-owner',
      canManage: true,
      users: [
        { id: 'u-owner', name: 'Otel Sahibi', active: true },
        { id: 'u-deniz', name: 'Deniz Arslan', active: true },
        { id: 'u-fatma', name: 'Fatma Kaya', active: true }
      ],
      roles: [
        {
          id: 'role-reception',
          code: 'reception',
          name: 'Resepsiyon',
          nameI18n: { tr: 'Resepsiyon', en: 'Reception', ru: 'Ресепшн' }
        },
        {
          id: 'role-housekeeping',
          code: 'housekeeping',
          name: 'Temizlik',
          nameI18n: { tr: 'Temizlik', en: 'Housekeeping', ru: 'Уборка' }
        }
      ],
      shifts: [
        shift('sh-day', 'day', 'Gündüz', 'Day', 'Дневная', '09:00', '21:00', 0),
        shift('sh-night', 'night', 'Gece', 'Night', 'Ночная', '21:00', '09:00', 1)
      ],
      rooms: [
        { id: 'room-101', number: '101', floor: '1', beds: 2, typeName: 'Standart', typeNameI18n: null },
        { id: 'room-102', number: '102', floor: '1', beds: 2, typeName: 'Standart', typeNameI18n: null },
        { id: 'room-201', number: '201', floor: '2', beds: 3, typeName: 'Aile', typeNameI18n: null }
      ]
    },
    tasks: [
      task('t-late', {
        title: 'KBS çıkış bildirimlerini kontrol et',
        templateId: 'tpl-kbs',
        templateCode: 'legal_kbs_checkout',
        kind: 'legal',
        recurrence: { kind: 'daily', time: '08:30' },
        dueAt: `${FAKE_TODAY}T08:30`,
        createdBy: null,
        overdue: true
      }),
      task('t-call', {
        title: 'Çıkış yapmayan odaları ara',
        assigneeRoleId: 'role-reception',
        dueAt: `${FAKE_TODAY}T12:00`
      }),
      task('t-deep', {
        title: 'Odayı derin temizle',
        templateId: 'tpl-deep',
        templateCode: 'deep_clean_every_n',
        kind: 'maintenance',
        roomId: 'room-102',
        roomNumber: '102',
        dueAt: null,
        createdBy: null,
        recurrence: { kind: 'everyNStays', n: 10, countDayUse: true }
      }),
      task('t-tourism', {
        title: 'Turizm Bakanlığı konaklama istatistiği',
        templateId: 'tpl-tourism',
        templateCode: 'legal_tourism_stats',
        kind: 'legal',
        dueAt: `${addDays(FAKE_TODAY, 3)}T09:00`,
        createdBy: null
      }),
      task('t-201', {
        title: '201 perdeyi tak',
        roomId: 'room-201',
        roomNumber: '201',
        assigneeUserId: 'u-fatma',
        assigneeName: 'Fatma Kaya',
        dueAt: `${addDays(FAKE_TODAY, 1)}T10:00`
      }),
      task('t-done', {
        title: 'Lobi çiçeklerini sula',
        status: 'done',
        doneAt: '2026-10-12T06:30:00.000Z',
        doneBy: 'u-deniz',
        doneByName: 'Deniz Arslan'
      })
    ],
    templates: [
      template('tpl-kbs', {
        code: 'legal_kbs_checkout',
        kind: 'legal',
        title: null,
        titleI18n: {
          tr: 'KBS çıkış bildirimlerini kontrol et',
          en: 'Check KBS check-out reports',
          ru: 'Проверить отметки выезда в KBS'
        },
        recurrence: { kind: 'daily', time: '08:30' },
        nextDueAt: `${FAKE_TODAY}T08:30`
      }),
      template('tpl-tourism', {
        code: 'legal_tourism_stats',
        kind: 'legal',
        title: 'Turizm Bakanlığı konaklama istatistiği',
        recurrence: { kind: 'monthly', day: 1, time: '09:00' },
        nextDueAt: '2026-11-01T09:00'
      }),
      template('tpl-laundry', {
        code: 'laundry_out',
        title: 'Kirli çamaşırları çamaşırhaneye teslim et',
        recurrence: { kind: 'daily', time: '15:00' },
        suggested: true,
        active: false
      }),
      template('tpl-elevator', {
        code: 'elevator_service',
        kind: 'maintenance',
        title: 'Asansör bakımı',
        recurrence: { kind: 'interval', unit: 'months', every: 1, time: '10:00' },
        firstDueAt: '2026-09-10T10:00',
        nextDueAt: '2026-10-10T10:00',
        lastDoneAt: '2026-09-10T08:00:00.000Z',
        openTaskId: 't-elev',
        openTaskDueAt: '2026-10-10T10:00',
        remindMinutesBefore: 4320
      }),
      template('tpl-water', {
        code: 'water_tank',
        kind: 'maintenance',
        title: 'Su deposu temizliği',
        recurrence: { kind: 'interval', unit: 'months', every: 6, time: '10:00' },
        firstDueAt: '2026-12-01T10:00',
        nextDueAt: '2026-12-01T10:00',
        assigneeRoleId: 'role-housekeeping'
      }),
      template('tpl-chimney', {
        code: 'chimney',
        kind: 'maintenance',
        title: 'Baca temizliği',
        recurrence: { kind: 'interval', unit: 'years', every: 1, time: '10:00' },
        suggested: true,
        active: false
      })
    ],
    counters: [
      {
        templateId: 'tpl-deep',
        code: 'deep_clean_every_n',
        title: null,
        titleI18n: { tr: 'Odayı derin temizle', en: 'Deep-clean the room', ru: 'Генеральная уборка номера' },
        n: 10,
        rooms: [
          {
            roomId: 'room-101',
            roomNumber: '101',
            count: 4,
            since: localDate('2026-09-20'),
            lastDoneAt: '2026-09-20T10:00:00.000Z',
            openTaskId: null
          },
          {
            roomId: 'room-102',
            roomNumber: '102',
            count: 10,
            since: localDate('2026-08-01'),
            lastDoneAt: null,
            openTaskId: 't-deep'
          },
          {
            roomId: 'room-201',
            roomNumber: '201',
            count: 0,
            since: localDate('2026-10-11'),
            lastDoneAt: null,
            openTaskId: null
          }
        ]
      }
    ],
    summary: {
      ...emptySummary(),
      arrivalsPending: [
        {
          stayId: 's1',
          reservationId: 'r1',
          reservationCode: 'R-2026-000001',
          roomNumber: '101',
          guestName: 'Ada Örnek',
          checkIn: FAKE_TODAY,
          checkOut: '2026-10-14'
        },
        {
          stayId: 's2',
          reservationId: 'r2',
          reservationCode: 'R-2026-000002',
          roomNumber: '102',
          guestName: 'Can Örnek',
          checkIn: FAKE_TODAY,
          checkOut: '2026-10-13'
        }
      ],
      inHouse: { rooms: 1, people: 2 },
      kbsMissing: [
        {
          occupantId: 'o2',
          reservationRoomId: 's3',
          roomId: 'room-201',
          roomNumber: '201',
          fullName: 'Efe Örnek',
          kind: 'checkin'
        }
      ],
      unpaid: [
        {
          reservationId: 'r3',
          reservationCode: 'R-2026-000003',
          guestName: 'Eda Örnek',
          roomNumbers: ['201'],
          balanceMinor: 600_000,
          currency: 'TRY'
        }
      ],
      openTasks: [task('t-call', { title: 'Çıkış yapmayan odaları ara' })],
      cash: { pending: { TRY: { cash: 150_000 } }, drawer: { TRY: 150_000 }, channels: {} }
    },
    handovers: [
      handover('h-unread', {
        text: '102 geç gelecek, anahtar resepsiyonda.',
        summary: {
          ...emptySummary(),
          kbsMissing: [
            {
              occupantId: 'o2',
              reservationRoomId: 's3',
              roomId: 'room-201',
              roomNumber: '201',
              fullName: 'Efe Örnek',
              kind: 'checkin'
            }
          ]
        }
      }),
      handover('h-old', {
        writtenAt: '2026-10-11T17:58:00.000Z',
        fromShiftId: 'sh-day',
        toShiftId: 'sh-night',
        writtenBy: 'u-deniz',
        writtenByName: 'Deniz Arslan',
        text: 'Sakin bir gün.',
        acknowledgedBy: 'u-mehmet',
        acknowledgedByName: 'Mehmet Yıldız',
        acknowledgedAt: '2026-10-11T18:05:00.000Z'
      })
    ],
    notes: [
      note('n-mine', {
        kind: 'personal',
        ownerUserId: 'u-owner',
        text: 'Banu Hanım’ı ara',
        remindAt: `${FAKE_TODAY}T09:00`
      }),
      note('n-later', {
        kind: 'personal',
        ownerUserId: 'u-owner',
        text: 'Fatura bilgilerini sor',
        remindAt: `${addDays(FAKE_TODAY, 2)}T18:00`
      }),
      note('n-pinned', { text: 'Asansör öğlen bakımda', pinned: true }),
      note('n-board', { text: 'Yeni havlular depoda' })
    ]
  }
}

export type OperationsTransport = Transport & {
  state: OperationsState
  calls: { name: ProcedureName; input: unknown }[]
}

export function operationsTransport(
  state: OperationsState = defaultOperations(),
  opts: FakeTransportOptions & {
    settings?: SettingsValues
    /** These procedures answer 403 (a role without the right). */
    forbid?: readonly ProcedureName[]
    /** These procedures fail (500). */
    fail?: readonly ProcedureName[]
  } = {}
): OperationsTransport {
  const base = fakeTransport(opts.settings ?? SETTINGS_DEFAULTS, opts)
  const calls: OperationsTransport['calls'] = []
  let next = 1
  const findTask = (id: string): TaskItem => {
    const found = state.tasks.find((t) => t.id === id)
    if (!found) throw new ApiError('NOT_FOUND', 404, 'errors.notFound')
    return found
  }
  const findTemplate = (id: string): TemplateDetail => {
    const found = state.templates.find((t) => t.id === id)
    if (!found) throw new ApiError('NOT_FOUND', 404, 'errors.notFound')
    return found
  }
  const replaceTask = (row: TaskItem): TaskItem => {
    state.tasks = state.tasks.map((t) => (t.id === row.id ? row : t))
    return row
  }
  const replaceTemplate = (row: TemplateDetail): TemplateDetail => {
    state.templates = state.templates.map((t) => (t.id === row.id ? row : t))
    return row
  }
  const replaceNote = (row: Note): Note => {
    state.notes = state.notes.map((n) => (n.id === row.id ? row : n))
    return row
  }
  return {
    kind: 'ipc',
    state,
    calls,
    async call(name: ProcedureName, input: unknown) {
      calls.push({ name, input })
      if (opts.forbid?.includes(name)) throw new ApiError('PERMISSION_DENIED', 403, 'errors.permissionDenied')
      if (opts.fail?.includes(name)) throw new ApiError('INTERNAL', 500, 'errors.internal')
      const out = (value: unknown) => value as never
      const body = (input ?? {}) as Record<string, unknown>
      switch (name) {
        case 'tasks.lookups':
          return out(state.lookups)
        case 'tasks.list': {
          const status = body['status'] as string[] | undefined
          const doneFrom = body['doneFrom'] as LocalDate | undefined
          return out(
            state.tasks.filter(
              (t) =>
                (!status || status.includes(t.status)) &&
                (!doneFrom || t.status !== 'done' || (t.doneAt ?? '') >= doneFrom)
            )
          )
        }
        case 'tasks.create': {
          const row = task(`t-new-${next++}`, { ...(body as Partial<TaskItem>), createdBy: 'u-owner' })
          state.tasks = [...state.tasks, row]
          return out(row)
        }
        case 'tasks.done': {
          const row = findTask(body['id'] as string)
          if (row.status !== 'open') throw new ApiError('VALIDATION', 400, 'errors.taskNotOpen')
          return out(
            replaceTask({ ...row, status: 'done', doneAt: AT, doneBy: 'u-owner', doneByName: 'Otel Sahibi' })
          )
        }
        case 'tasks.undoDone': {
          const row = findTask(body['id'] as string)
          return out(replaceTask({ ...row, status: 'open', doneAt: null, doneBy: null, doneByName: null }))
        }
        case 'tasks.cancel': {
          const row = findTask(body['id'] as string)
          return out(replaceTask({ ...row, status: 'cancelled', cancelReason: body['reason'] as string }))
        }
        case 'tasks.templates': {
          const kinds = body['kind'] as string[] | undefined
          return out(
            state.templates.filter(
              (t) => (!kinds || kinds.includes(t.kind)) && (body['includeInactive'] || t.active)
            )
          )
        }
        case 'tasks.addTemplate': {
          const row = template(`tpl-new-${next++}`, {
            ...(body as Partial<TemplateDetail>),
            kind: (body['kind'] as TemplateDetail['kind']) ?? 'general'
          })
          state.templates = [...state.templates, row]
          return out(row)
        }
        case 'tasks.editTemplate': {
          const row = findTemplate(body['id'] as string)
          return out(replaceTemplate({ ...row, ...(body['patch'] as Partial<TemplateDetail>) }))
        }
        case 'tasks.setTemplateActive': {
          const row = findTemplate(body['id'] as string)
          const active = body['active'] as boolean
          return out(replaceTemplate({ ...row, active, suggested: active ? false : row.suggested }))
        }
        case 'tasks.dismissSuggestion': {
          const row = findTemplate(body['id'] as string)
          return out(replaceTemplate({ ...row, suggested: false }))
        }
        case 'tasks.completeTemplate': {
          const row = findTemplate(body['id'] as string)
          const roomId = body['roomId'] as string | null | undefined
          if (roomId)
            state.counters = state.counters.map((g) => ({
              ...g,
              rooms: g.rooms.map((r) =>
                r.roomId === roomId ? { ...r, count: 0, openTaskId: null, lastDoneAt: AT } : r
              )
            }))
          else replaceTemplate({ ...row, lastDoneAt: AT, openTaskId: null })
          return out(task(`t-done-${next++}`, { status: 'done', templateId: row.id, doneAt: AT }))
        }
        case 'tasks.stayCounters':
          return out(state.counters)
        case 'shifts.list':
          return out(state.lookups.shifts)
        case 'shift.summary':
          return out(state.summary)
        case 'shift.unreadHandovers':
          return out(state.handovers.filter((h) => !h.acknowledgedAt && h.writtenBy !== state.lookups.userId))
        case 'shift.handovers':
          return out([...state.handovers].sort((a, b) => b.writtenAt.localeCompare(a.writtenAt)))
        case 'shift.saveHandover': {
          const row = handover(`h-new-${next++}`, {
            fromShiftId: (body['fromShiftId'] as string | null) ?? null,
            toShiftId: (body['toShiftId'] as string | null) ?? null,
            text: (body['text'] as string | null) ?? null,
            writtenBy: state.lookups.userId,
            writtenByName: 'Otel Sahibi',
            writtenAt: AT,
            summary: state.summary
          })
          state.handovers = [...state.handovers, row]
          return out(row)
        }
        case 'shift.acknowledge': {
          const row = state.handovers.find((h) => h.id === body['id'])!
          const read = {
            ...row,
            acknowledgedBy: 'u-owner',
            acknowledgedByName: 'Otel Sahibi',
            acknowledgedAt: AT
          }
          state.handovers = state.handovers.map((h) => (h.id === row.id ? read : h))
          return out(read)
        }
        case 'notes.list':
          return out(state.notes.filter((n) => !n.doneAt && !n.archivedAt))
        case 'notes.dueReminders':
          return out(state.notes.filter((n) => n.kind === 'personal' && n.remindAt && !n.doneAt))
        case 'notes.add': {
          const row = note(`n-new-${next++}`, {
            kind: body['kind'] as Note['kind'],
            text: body['text'] as string,
            remindAt: (body['remindAt'] as string | null) ?? null,
            pinned: Boolean(body['pinned']),
            ownerUserId: body['kind'] === 'personal' ? state.lookups.userId : null
          })
          state.notes = [...state.notes, row]
          return out(row)
        }
        case 'notes.setState': {
          const row = state.notes.find((n) => n.id === body['id'])!
          return out(
            replaceNote({
              ...row,
              ...(body['done'] !== undefined ? { doneAt: body['done'] ? AT : null } : {}),
              ...(body['archived'] !== undefined ? { archivedAt: body['archived'] ? AT : null } : {}),
              ...(body['pinned'] !== undefined ? { pinned: body['pinned'] as boolean } : {})
            })
          )
        }
        default:
          return base.call(name, input as never)
      }
    }
  } as OperationsTransport
}
