// Test helper (imported by tests only): an in-memory stand-in for the P9c procedures — "Otelde kalanlar", the Today
// summary and its cards' own reads, calendar notes — over the weather fake (fake-external.ts). It keeps the rules
// the screens show (KBS marks with who and when, the "kızıl" search, bulk notes counted like the service); the
// service and router tests cover the rest. Names and amounts are invented.
import type { ProcedureName, ProcedureOutput } from '@shared/contract'
import type {
  CalendarEntryDto,
  InHouseRoomDto,
  InHouseViewDto,
  TodaySummaryDto
} from '@shared/contract/procedures/today'
import { addDays, diffDays, weekday, type LocalDate } from '@shared/date'
import { normalizeName } from '@shared/domain/normalize'
import { ApiError } from '@/lib/transport/types'
import { withExternal } from './fake-external'
import type { FakeTransport } from './render'

type Issue = ProcedureOutput<'housekeeping.issues'>[number]
type Contact = ProcedureOutput<'contacts.favorites'>[number]
type StaffRow = ProcedureOutput<'staff.panel'>[number]
type Backup = ProcedureOutput<'backup.status'>

export const DAY = '2026-10-04' as LocalDate
const AT = '2026-10-04T10:00:00.000Z' // 13:00 in Istanbul, after the 12:00 check-out

const person = (
  id: string,
  fullName: string,
  extra: Partial<InHouseRoomDto['occupants'][number]> = {}
): InHouseRoomDto['occupants'][number] => ({
  id,
  fullName,
  isPrimary: false,
  descriptorNote: null,
  arrivedAt: '2026-10-03T12:00:00.000Z',
  leftAt: null,
  kbsReportedAt: null,
  kbsReportedByName: null,
  kbsCheckoutAt: null,
  kbsCheckoutByName: null,
  ...extra
})

const room = (n: string, extra: Partial<InHouseRoomDto>): InHouseRoomDto => ({
  stayId: `stay-${n}`,
  reservationId: `res-${n}`,
  reservationCode: `2026-0${n}`,
  roomId: `room-${n}`,
  roomNumber: n,
  roomTypeName: 'Standart',
  roomTypeNameI18n: { tr: 'Standart', en: 'Standard', ru: 'Стандарт' },
  checkIn: '2026-10-03' as LocalDate,
  checkOut: '2026-10-06' as LocalDate,
  people: 1,
  guestName: 'Misafir',
  note: null,
  balanceMinor: 0,
  currency: 'TRY',
  kbsGaps: 0,
  occupants: [],
  ...extra
})

/** 101: two people, "Kızıl saçlı" Elif not yet reported; 102: one person reported by Deniz; 104 left without KBS. */
export function sampleInHouse(): InHouseViewDto {
  return {
    today: DAY,
    showMoney: true,
    kbsChecks: true,
    rooms: [
      room('101', {
        guestName: 'Ahmet Yılmaz',
        people: 2,
        kbsGaps: 1,
        balanceMinor: 280_000,
        note: 'Geç gelecek',
        occupants: [
          person('o-1', 'Ahmet Yılmaz', {
            isPrimary: true,
            kbsReportedAt: '2026-10-03T12:05:00.000Z',
            kbsReportedByName: 'Deniz Arslan'
          }),
          person('o-2', 'Elif Yılmaz', { descriptorNote: 'Kızıl saçlı, gözlüklü' })
        ]
      }),
      room('102', {
        guestName: 'Anna Schmidt',
        checkOut: DAY,
        occupants: [
          person('o-3', 'Anna Schmidt', {
            isPrimary: true,
            kbsReportedAt: '2026-10-04T08:00:00.000Z',
            kbsReportedByName: 'Deniz Arslan'
          })
        ]
      })
    ],
    checkoutPending: [
      {
        occupantId: 'o-9',
        stayId: 'stay-104',
        fullName: 'Ivan Petrov',
        roomNumber: '104',
        kbsReported: true,
        leftAt: '2026-10-03T08:00:00.000Z'
      }
    ]
  }
}

const stay = (n: string, extra: Partial<NonNullable<TodaySummaryDto['arrivals']>[number]>) => ({
  stayId: `stay-${n}`,
  reservationId: `res-${n}`,
  reservationCode: `2026-0${n}`,
  roomNumber: n,
  guestName: 'Misafir',
  checkIn: DAY,
  checkOut: addDays(DAY, 2),
  nights: 2,
  checkedInAt: null,
  checkedOutAt: null,
  overdue: false,
  note: null,
  balanceMinor: 0,
  currency: 'TRY',
  ...extra
})

/** The owner's Today: 103 past check-out time, 201 arriving late, a KBS gap, two dirty rooms, two tasks, a holiday. */
export function sampleSummary(): TodaySummaryDto {
  return {
    at: AT,
    today: DAY,
    nowTime: '13:00',
    checkoutTime: '12:00',
    sellableRooms: 6,
    soldTonight: 3,
    arrivals: [
      stay('201', { guestName: 'Maryam Hosseini', note: 'Geç gelecek, 23:30 civarı', balanceMinor: 600_000 })
    ],
    departures: [
      stay('103', {
        guestName: 'Carlos Ruiz',
        checkIn: '2026-10-01' as LocalDate,
        checkOut: DAY,
        checkedInAt: '2026-10-01T12:00:00.000Z',
        overdue: true
      }),
      stay('102', {
        guestName: 'Anna Schmidt',
        checkIn: '2026-10-02' as LocalDate,
        checkOut: DAY,
        checkedInAt: '2026-10-02T12:00:00.000Z',
        checkedOutAt: '2026-10-04T07:30:00.000Z'
      })
    ],
    inHouse: { rooms: 2, people: 3 },
    kbsMissing: [
      { occupantId: 'o-2', stayId: 'stay-101', roomNumber: '101', fullName: 'Elif Yılmaz', kind: 'checkin' }
    ],
    dirtyRooms: [
      { id: 'room-102', number: '102' },
      { id: 'room-202', number: '202' }
    ],
    tasks: [
      {
        id: 't-1',
        title: '12:00 çıkış yapmayan odaları ara',
        titleI18n: null,
        dueAt: '2026-10-04T12:00',
        overdue: true,
        roomNumber: null,
        templateCode: null
      },
      {
        id: 't-2',
        title: 'Turizm',
        titleI18n: {
          tr: "Turizm Bakanlığı konaklama istatistiği (ayın 1–10'u)",
          en: 'Ministry of Tourism accommodation statistics (1st–10th of the month)',
          ru: 'Статистика размещения для Минтуризма (1–10 число месяца)'
        },
        dueAt: '2026-10-01T09:00',
        overdue: true,
        roomNumber: null,
        templateCode: 'legal_tourism_stats'
      }
    ],
    handovers: {
      count: 1,
      latest: { id: 'h-1', writtenAt: '2026-10-04T06:00:00.000Z', text: '203 klima sesi var.' }
    },
    drawer: [{ currency: 'TRY', amountMinor: 1_250_000 }],
    specialDays: [
      {
        id: 'cd-1',
        kind: 'special',
        title: 'Fuar',
        titleI18n: null,
        note: 'Kahvaltı 06:30',
        color: '#0ea5e9',
        estimated: false
      }
    ],
    reminders: [{ kind: 'tourism', period: '2026-09', dueDate: '2026-10-10' as LocalDate, daysLeft: 7 }]
  }
}

/** What a housekeeping role gets back: no guests, no KBS, no drawer, no handover. */
export function housekeepingSummary(): TodaySummaryDto {
  return {
    ...sampleSummary(),
    arrivals: null,
    departures: null,
    inHouse: null,
    kbsMissing: null,
    handovers: null,
    drawer: null,
    reminders: []
  }
}

export function sampleIssues(): Issue[] {
  const issue = (id: string, title: string, severity: Issue['severity'], reportedAt: string): Issue => ({
    id,
    roomId: 'room-501',
    roomNumber: '501',
    area: null,
    history: [],
    title,
    description: null,
    severity,
    status: 'open',
    reportedBy: null,
    reportedByName: null,
    reportedAt,
    assignedTo: null,
    plannedDate: null,
    resolvedAt: null,
    resolvedBy: null,
    resolvedByName: null,
    resolutionNote: null,
    blocksRoom: false,
    photos: 0,
    block: null,
    createdAt: reportedAt,
    updatedAt: reportedAt
  })
  return [
    issue('i-1', 'Tuvalet kapağı kırık', 'medium', '2026-09-26T08:00:00.000Z'),
    issue('i-2', 'Tavandan su damlıyor', 'urgent', '2026-10-04T07:00:00.000Z')
  ]
}

const contact = (id: string, name: string, number: string): Contact => ({
  id,
  name,
  category: 'other',
  customCategory: null,
  phones: [{ label: '', number }],
  address: null,
  email: null,
  note: null,
  favorite: true,
  active: true,
  createdAt: AT,
  updatedAt: AT
})

export interface P9cState {
  inHouse: InHouseViewDto
  summary: TodaySummaryDto
  issues: Issue[]
  favorites: Contact[]
  staff: StaffRow[]
  backup: Backup
  days: CalendarEntryDto[]
  highlight: number[]
  /** Procedures that answer 403 (a role without the right). */
  denied: ProcedureName[]
  /** Procedures that never answer (loading states). */
  hang: ProcedureName[]
  /** Procedures that fail (error states). */
  fail: ProcedureName[]
  /** Who the fake writes as (KBS marks). */
  userName: string
}

export function sampleState(): P9cState {
  return {
    inHouse: sampleInHouse(),
    summary: sampleSummary(),
    issues: sampleIssues(),
    favorites: [contact('c-1', 'Su tesisatçısı Kemal', '0532 111 22 33')],
    staff: [
      {
        employeeId: 'e-1',
        fullName: 'Deniz Arslan',
        position: 'Resepsiyon',
        advancesMinor: 500_000,
        currency: 'TRY',
        leaveEntitled: 4,
        leaveUsed: 1,
        leaveLeft: 3
      }
    ],
    backup: {
      lastBackupAt: '2026-10-01T03:00:00.000Z',
      lastAutoAt: '2026-10-01T03:00:00.000Z',
      nextAutoAt: null,
      running: false,
      drive: { state: 'ok', lastAt: null },
      warnings: ['stale'],
      restorePending: false
    },
    days: [],
    highlight: [6, 0],
    denied: [],
    hang: [],
    fail: [],
    userName: 'Otel Sahibi'
  }
}

/** Generated public holidays of a year (two fixed days are enough for the screen) and its notes. */
const holidaysOf = (year: number): CalendarEntryDto[] =>
  [
    { date: `${year}-04-23`, tr: 'Ulusal Egemenlik ve Çocuk Bayramı' },
    { date: `${year}-10-29`, tr: 'Cumhuriyet Bayramı' }
  ].map((h) => ({
    id: `gen-${h.date}`,
    date: h.date as LocalDate,
    occurrenceDate: h.date as LocalDate,
    kind: 'holiday' as const,
    title: null,
    titleI18n: { tr: h.tr, en: h.tr, ru: h.tr },
    note: null,
    color: null,
    source: 'generated' as const,
    estimated: false,
    groupKey: null,
    recurringYearly: false,
    repeated: false,
    generatedYear: year
  }))

export function withP9c(state: P9cState = sampleState(), base?: FakeTransport) {
  const t = withExternal({}, base)
  const call = t.call.bind(t)
  const generated = new Set<number>()
  let next = 1
  const answer = async (name: ProcedureName, input: unknown): Promise<unknown> => {
    switch (name) {
      case 'today.summary':
        return state.summary
      case 'today.completeTask': {
        const { id } = input as { id: string }
        state.summary = { ...state.summary, tasks: state.summary.tasks?.filter((x) => x.id !== id) ?? null }
        return { ok: true }
      }
      case 'housekeeping.issues':
        return state.issues
      case 'contacts.favorites':
        return state.favorites
      case 'staff.panel':
        return state.staff
      case 'staff.myEmployee':
        return null
      case 'backup.status':
        return state.backup
      case 'inHouse.list': {
        const q = normalizeName((input as { q?: string }).q ?? '')
        return {
          ...state.inHouse,
          rooms: state.inHouse.rooms.filter(
            (r) =>
              !q ||
              [
                r.roomNumber,
                r.guestName,
                ...r.occupants.flatMap((o) => [o.fullName, o.descriptorNote ?? ''])
              ].some((x) => normalizeName(x).includes(q))
          )
        }
      }
      case 'inHouse.markKbs': {
        const { occupantId, mark } = input as { occupantId: string; mark: string }
        if (mark === 'checkout') {
          state.inHouse = {
            ...state.inHouse,
            checkoutPending: state.inHouse.checkoutPending.filter((p) => p.occupantId !== occupantId)
          }
          return { ok: true }
        }
        state.inHouse = {
          ...state.inHouse,
          rooms: state.inHouse.rooms.map((r) => {
            const occupants = r.occupants.map((o) =>
              o.id !== occupantId
                ? o
                : mark === 'reported'
                  ? { ...o, kbsReportedAt: AT, kbsReportedByName: state.userName }
                  : { ...o, kbsReportedAt: null, kbsReportedByName: null }
            )
            return { ...r, occupants, kbsGaps: occupants.filter((o) => !o.kbsReportedAt).length }
          })
        }
        return { ok: true }
      }
      case 'inHouse.addPerson': {
        const data = input as {
          stayId: string
          fullName: string
          descriptorNote?: string | null
          kbsReported?: boolean
        }
        state.inHouse = {
          ...state.inHouse,
          rooms: state.inHouse.rooms.map((r) => {
            if (r.stayId !== data.stayId) return r
            const added = person(`o-new-${next++}`, data.fullName, {
              descriptorNote: data.descriptorNote ?? null,
              ...(data.kbsReported ? { kbsReportedAt: AT, kbsReportedByName: state.userName } : {})
            })
            const occupants = [...r.occupants, added]
            return {
              ...r,
              occupants,
              people: occupants.length,
              kbsGaps: occupants.filter((o) => !o.kbsReportedAt).length
            }
          })
        }
        return { ok: true }
      }
      case 'calendarNotes.list': {
        const { from, to } = input as { from: string; to: string }
        const year = Number(from.slice(0, 4))
        if (!generated.has(year)) {
          generated.add(year)
          state.days.push(...holidaysOf(year))
        }
        return {
          highlightWeekdays: state.highlight,
          days: state.days
            .filter((d) => d.occurrenceDate >= from && d.occurrenceDate < to)
            .sort((a, b) => a.occurrenceDate.localeCompare(b.occurrenceDate))
        }
      }
      case 'calendarNotes.add': {
        const data = input as {
          kind?: CalendarEntryDto['kind']
          title: string
          note?: string | null
          color?: string | null
          recurringYearly?: boolean
          target:
            | { mode: 'single'; date: string }
            | { mode: 'range'; from: string; to: string }
            | { mode: 'weekdays'; from: string; to: string; weekdays: number[] }
            | { mode: 'list'; dates: string[] }
        }
        const tg = data.target
        let dates: string[]
        if (tg.mode === 'single') dates = [tg.date]
        else if (tg.mode === 'list') dates = tg.dates
        else {
          const span = diffDays(tg.from as LocalDate, tg.to as LocalDate) + 1
          dates = Array.from({ length: span }, (_, i) => addDays(tg.from as LocalDate, i)).filter(
            (d) => tg.mode === 'range' || tg.weekdays.includes(weekday(d))
          )
        }
        const groupKey = dates.length > 1 ? `note:${next++}` : null
        for (const date of dates)
          state.days.push({
            id: `note-${next++}`,
            date: date as LocalDate,
            occurrenceDate: date as LocalDate,
            kind: data.kind ?? 'note',
            title: data.title,
            titleI18n: null,
            note: data.note ?? null,
            color: data.color ?? null,
            source: 'user',
            estimated: false,
            groupKey,
            recurringYearly: data.recurringYearly ?? false,
            repeated: false,
            generatedYear: null
          })
        return { count: dates.length }
      }
      case 'calendarNotes.edit': {
        const { id, patch } = input as { id: string; patch: Partial<CalendarEntryDto> & { title?: string } }
        const day = state.days.find((d) => d.id === id)!
        Object.assign(day, patch, patch.title !== undefined ? { titleI18n: null } : {}, { source: 'user' })
        if (patch.date) day.occurrenceDate = patch.date
        return day
      }
      case 'calendarNotes.cancel': {
        const { id } = input as { id: string }
        state.days = state.days.filter((d) => d.id !== id)
        return { ok: true }
      }
      case 'calendarNotes.cancelGroup': {
        const { groupKey } = input as { groupKey: string }
        const before = state.days.length
        state.days = state.days.filter((d) => d.groupKey !== groupKey)
        return { count: before - state.days.length }
      }
      default:
        return call(name, input as never)
    }
  }
  t.call = (async (name: ProcedureName, input: unknown) => {
    if (state.hang.includes(name)) return new Promise(() => {})
    if (state.fail.includes(name)) {
      t.calls.push({ name, input })
      throw new ApiError('INTERNAL', 500, 'errors.internal')
    }
    if (state.denied.includes(name)) {
      t.calls.push({ name, input })
      throw new ApiError('PERMISSION_DENIED', 403, 'errors.permissionDenied')
    }
    const known = [
      'today.summary',
      'today.completeTask',
      'housekeeping.issues',
      'contacts.favorites',
      'staff.panel',
      'staff.myEmployee',
      'backup.status',
      'inHouse.list',
      'inHouse.markKbs',
      'inHouse.addPerson',
      'calendarNotes.list',
      'calendarNotes.add',
      'calendarNotes.edit',
      'calendarNotes.cancel',
      'calendarNotes.cancelGroup'
    ]
    if (known.includes(name)) t.calls.push({ name, input })
    return answer(name, input)
  }) as FakeTransport['call']
  return Object.assign(t, { p9c: state })
}
