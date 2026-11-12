// Test helper (imported by tests only, never by the app): an in-memory stand-in for the admin procedures — users,
// roles, rooms and types, lists, shifts, task templates, pay rules, employees, calendar days, the audit log and
// devices — over the shared settings/status-tag fake (src/renderer/test/render.tsx). It keeps the services' rules
// the screens show (role in use, last owner, owner role locked, room number taken) and records every call.
// Names and amounts are invented.
import {
  SETTINGS_DEFAULTS,
  type AuditEntry,
  type CapacityChangeView,
  type ListItem,
  type ListKind,
  type ProcedureName,
  type ProcedureOutput,
  type RoleViewDto,
  type RoomTypeView,
  type RoomView,
  type SettingsValues,
  type UserViewDto
} from '@shared/contract'
import {
  defaultPermissions,
  PERMISSION_KEYS,
  SYSTEM_ROLE_CODES,
  type PermissionLevel
} from '@shared/permissions'
import { localDate } from '@shared/date'
import { nameKey } from '@shared/name-key'
import { DEFAULT_PAY_POLICY } from '@shared/domain/salary'
import { fakeTransport } from '@/test/render'
import { ApiError, type Transport } from '@/lib/transport/types'

type Shift = ProcedureOutput<'shifts.list'>[number]
type Template = ProcedureOutput<'tasks.listTemplates'>[number]
type Employee = ProcedureOutput<'staff.listEmployees'>[number]
type Day = ProcedureOutput<'calendar.days'>[number]
type Device = ProcedureOutput<'auth.devices'>[number]
type Policy = ProcedureOutput<'staff.getPolicy'>

export interface AdminState {
  users: UserViewDto[]
  roles: RoleViewDto[]
  roomTypes: RoomTypeView[]
  rooms: RoomView[]
  lists: Record<ListKind, ListItem[]>
  shifts: Shift[]
  templates: Template[]
  policy: Policy
  employees: Employee[]
  days: Day[]
  audit: AuditEntry[]
  devices: Device[]
  /** Capacity history per room id (missing: one opening row from the room as it is). */
  capacity?: Record<string, CapacityChangeView[]>
}

const ROLE_NAMES = {
  owner: { tr: 'Sahip', en: 'Owner', ru: 'Владелец' },
  manager: { tr: 'Müdür', en: 'Manager', ru: 'Управляющий' },
  reception: { tr: 'Resepsiyon', en: 'Reception', ru: 'Ресепшн' },
  accountant: { tr: 'Muhasebe', en: 'Accountant', ru: 'Бухгалтер' },
  housekeeping: { tr: 'Temizlik', en: 'Housekeeping', ru: 'Уборка' },
  employee: { tr: 'Çalışan', en: 'Employee', ru: 'Сотрудник' }
} as const

const roles = (): RoleViewDto[] =>
  SYSTEM_ROLE_CODES.map((code) => ({
    id: `role-${code}`,
    code,
    name: ROLE_NAMES[code].tr,
    displayName: { ...ROLE_NAMES[code] },
    description: null,
    isSystem: true,
    permissions: defaultPermissions(code),
    locked: code === 'owner',
    userCount: 0,
    tasksOwnOnly: code === 'housekeeping' || code === 'employee',
    remoteAllowed: true
  }))

const user = (
  id: string,
  username: string,
  displayName: string,
  role: string,
  extra: Partial<UserViewDto> = {}
): UserViewDto => ({
  id,
  username,
  displayName,
  roleId: `role-${role}`,
  roleCode: role,
  active: true,
  hasPin: false,
  mustChange: false,
  lastLoginAt: null,
  lockedUntil: null,
  employeeId: null,
  ...extra
})

const type = (
  code: string,
  group: RoomTypeView['group'],
  tr: string,
  extra: Partial<RoomTypeView> = {}
): RoomTypeView => ({
  id: `type-${code}`,
  code,
  name: tr,
  nameI18n: { tr, en: tr, ru: tr },
  group,
  isCustom: false,
  maxAdults: 2,
  basePriceMinor: null,
  weekendPriceMinor: null,
  baseCurrency: null,
  sort: 0,
  active: false,
  ...extra
})

const room = (number: string, typeId: string, extra: Partial<RoomView> = {}): RoomView => ({
  id: `room-${number}`,
  number,
  floor: number.slice(0, 1),
  roomTypeId: typeId,
  beds: 2,
  sellable: true,
  notes: null,
  sort: 0,
  active: true,
  ...extra
})

const item = (code: string, tr: string, sort: number, extra: Partial<ListItem> = {}): ListItem => ({
  id: `list-${code}`,
  code,
  name: null,
  nameI18n: { tr, en: tr, ru: tr },
  active: true,
  sort,
  seeded: true,
  ...extra
})

const year = new Date().getFullYear()
const day = (monthDay: string) => localDate(`${year}-${monthDay}`)

/** 120 entries a minute apart, newest first: three pages of 50. */
function auditEntries(): AuditEntry[] {
  const start = Date.UTC(year, 9, 4, 12, 0, 0)
  return Array.from({ length: 120 }, (_, i) => {
    const n = 119 - i
    const ts = new Date(start + n * 60_000).toISOString()
    if (n === 119)
      return {
        id: `audit-${n}`,
        ts,
        userId: 'user-owner',
        userName: 'Otel Sahibi',
        deviceId: 'device-1',
        deviceName: 'Resepsiyon bilgisayarı',
        entity: 'payment',
        entityId: '01JXAMPLEPAYMENT000000ABCD',
        action: 'void',
        before: { amountMinor: 250_000, currency: 'TRY', voidedAt: null, note: 'Kapora' },
        after: {
          amountMinor: 250_000,
          currency: 'TRY',
          voidedAt: `${year}-10-04T12:59:00.000Z`,
          note: 'Kapora'
        },
        reason: 'Yanlış oda'
      }
    if (n === 118)
      return {
        id: `audit-${n}`,
        ts,
        userId: 'user-owner',
        userName: 'Otel Sahibi',
        deviceId: 'device-1',
        deviceName: 'Resepsiyon bilgisayarı',
        entity: 'employee_salary',
        entityId: '01JXAMPLESALARY0000000WXYZ',
        action: 'create',
        before: null,
        after: { hidden: true },
        reason: null
      }
    // A role's levels changed: the whole matrix (about 60 keys) on both sides, and the time stamp.
    if (n === 117) {
      const levels = defaultPermissions('reception')
      return {
        id: `audit-${n}`,
        ts,
        userId: 'user-owner',
        userName: 'Otel Sahibi',
        deviceId: 'device-1',
        deviceName: 'Resepsiyon bilgisayarı',
        entity: 'role',
        entityId: 'role-reception',
        action: 'update',
        before: {
          name: 'Resepsiyon',
          remoteAllowed: true,
          updatedAt: `${year}-10-01T08:00:00.000Z`,
          permissions: levels
        },
        after: {
          name: 'Resepsiyon',
          remoteAllowed: true,
          updatedAt: `${year}-10-04T12:57:00.000Z`,
          permissions: { ...levels, staff: 'view' }
        },
        reason: null
      }
    }
    // A room type added: nothing before it.
    if (n === 116)
      return {
        id: `audit-${n}`,
        ts,
        userId: 'user-owner',
        userName: 'Otel Sahibi',
        deviceId: 'device-1',
        deviceName: 'Resepsiyon bilgisayarı',
        entity: 'room_type',
        entityId: '01JXAMPLEROOMTYPE000000XYZ',
        action: 'create',
        before: null,
        after: { name: 'Bahçe odası', basePriceMinor: 320_000, baseCurrency: 'EUR', beds: 2 },
        reason: null
      }
    return {
      id: `audit-${n}`,
      ts,
      userId: n % 2 ? 'user-owner' : 'user-deniz',
      userName: n % 2 ? 'Otel Sahibi' : 'Deniz Arslan',
      deviceId: 'device-1',
      deviceName: 'Resepsiyon bilgisayarı',
      entity: n % 3 ? 'room' : 'settings',
      entityId: n % 3 ? `01JXAMPLEROOM0000000000${String(n).padStart(3, '0')}` : 'hotel.name',
      action: 'update',
      before: n % 3 ? { beds: 2, sellable: true } : 'Bismuth',
      after: n % 3 ? { beds: 3, sellable: true } : 'Örnek Otel',
      reason: null
    }
  })
}

export function defaultAdminState(): AdminState {
  const all = roles()
  return {
    roles: all,
    users: [
      user('user-owner', 'sahip', 'Otel Sahibi', 'owner', {
        hasPin: true,
        lastLoginAt: `${year}-10-04T07:30:00.000Z`
      }),
      user('user-deniz', 'deniz', 'Deniz Arslan', 'reception', { employeeId: 'emp-deniz' }),
      user('user-mert', 'mert', 'Mert Yıldız', 'housekeeping', { active: false })
    ],
    roomTypes: [
      type('double', 'occupancy', 'Çift kişilik (Double)', {
        active: true,
        basePriceMinor: 280_000,
        weekendPriceMinor: 320_000
      }),
      type('twin', 'occupancy', 'İki yataklı (Twin)', { active: true, basePriceMinor: 270_000, sort: 1 }),
      type('single', 'occupancy', 'Tek kişilik', { sort: 2 }),
      type('suite', 'suite', 'Süit', { sort: 3 })
    ],
    rooms: [room('101', 'type-double'), room('102', 'type-double'), room('201', 'type-twin', { beds: 3 })],
    lists: {
      paymentMethods: [
        item('cash', 'Nakit', 1, { group: 'cash', isCash: true }),
        item('card', 'Kredi kartı', 2, { group: 'card', isCash: false }),
        item('bank', 'Havale/EFT', 3, { group: 'bank', isCash: false })
      ],
      salesChannels: [
        item('direct', 'Doğrudan', 1, { kind: 'direct', commissionBp: null, defaultCollectedBy: 'hotel' }),
        item('booking', 'Booking.com', 2, { kind: 'ota', commissionBp: 1500, defaultCollectedBy: 'hotel' })
      ],
      extraServices: [
        item('luggage', 'Bavul emaneti', 1, {
          defaultPriceMinor: 10_000,
          defaultCurrency: 'TRY',
          unit: 'per_bag_day'
        })
      ],
      expenseSections: [
        item('general', 'Genel', 1, { visibilityPermission: 'expenses' }),
        item('owner', 'Sahip', 2, { visibilityPermission: 'expenses.owner' })
      ],
      laundryItemTypes: [item('sheet', 'Çarşaf', 1)],
      productCategories: [item('cleaning', 'Temizlik malzemesi', 1)],
      guestTags: []
    },
    shifts: [
      {
        id: 'shift-day',
        code: 'day',
        name: null,
        displayName: { tr: 'Gündüz', en: 'Day', ru: 'Дневная' },
        startTime: '09:00',
        endTime: '21:00',
        sort: 1,
        active: true
      },
      {
        id: 'shift-night',
        code: 'night',
        name: null,
        displayName: { tr: 'Gece', en: 'Night', ru: 'Ночная' },
        startTime: '21:00',
        endTime: '09:00',
        sort: 2,
        active: true
      }
    ],
    templates: [
      {
        id: 'tpl-legal',
        code: 'legal_tourism_stats',
        title: null,
        titleI18n: { tr: 'Turizm istatistiği', en: 'Tourism statistics', ru: 'Статистика туризма' },
        description: null,
        kind: 'legal',
        recurrence: { kind: 'monthly', day: 1, time: '09:00' },
        suggested: false,
        active: true
      },
      {
        id: 'tpl-call',
        code: 'call_late_checkouts',
        title: null,
        titleI18n: { tr: 'Çıkış yapmayan odaları ara', en: 'Call late rooms', ru: 'Позвонить в номера' },
        description: null,
        kind: 'general',
        recurrence: { kind: 'daily', time: '12:00' },
        suggested: true,
        active: false
      },
      {
        id: 'tpl-own',
        code: null,
        title: 'Otelin kendi görevi',
        titleI18n: null,
        description: null,
        kind: 'general',
        recurrence: { kind: 'none' },
        suggested: false,
        active: true
      }
    ],
    policy: { employeeId: null, values: { ...DEFAULT_PAY_POLICY }, hotel: {}, employee: {} },
    employees: [
      {
        id: 'emp-deniz',
        firstName: 'Deniz',
        lastName: 'Arslan',
        fullName: 'Deniz Arslan',
        position: 'Resepsiyon',
        active: true,
        userId: 'user-deniz'
      },
      {
        id: 'emp-ece',
        firstName: 'Ece',
        lastName: 'Tan',
        fullName: 'Ece Tan',
        position: 'Temizlik',
        active: true,
        userId: null
      }
    ],
    days: [
      {
        id: 'day-1',
        date: day('04-23'),
        occurrenceDate: day('04-23'),
        kind: 'holiday',
        title: null,
        titleI18n: {
          tr: 'Ulusal Egemenlik ve Çocuk Bayramı',
          en: 'National Sovereignty Day',
          ru: 'День суверенитета'
        },
        source: 'generated',
        estimated: false
      },
      {
        id: 'day-2',
        date: day('10-28'),
        occurrenceDate: day('10-28'),
        kind: 'half_holiday',
        title: null,
        titleI18n: { tr: 'Cumhuriyet Bayramı arifesi', en: 'Republic Day eve', ru: 'Канун Дня Республики' },
        source: 'generated',
        estimated: true
      },
      {
        id: 'day-3',
        date: day('06-01'),
        occurrenceDate: day('06-01'),
        kind: 'note',
        title: 'Boya',
        titleI18n: null,
        source: 'user',
        estimated: false
      }
    ],
    audit: auditEntries(),
    devices: [
      {
        id: 'device-1',
        name: 'Resepsiyon bilgisayarı',
        kind: 'desktop',
        platform: 'win32',
        firstSeenAt: `${year}-10-01T08:00:00.000Z`,
        lastSeenAt: `${year}-10-04T07:30:00.000Z`,
        lastIp: null,
        trusted: true,
        revokedAt: null,
        sessions: [
          {
            id: 'session-1',
            userId: 'user-owner',
            userName: 'Otel Sahibi',
            createdAt: `${year}-10-04T07:30:00.000Z`,
            lastSeenAt: `${year}-10-04T07:30:00.000Z`,
            expiresAt: `${year}-10-05T07:30:00.000Z`,
            current: false
          }
        ]
      },
      {
        id: 'device-2',
        name: 'Kayıp telefon',
        kind: 'mobile',
        platform: 'iOS',
        firstSeenAt: `${year}-09-01T08:00:00.000Z`,
        lastSeenAt: `${year}-09-02T08:00:00.000Z`,
        lastIp: '100.64.0.7',
        trusted: false,
        revokedAt: null,
        sessions: []
      }
    ]
  }
}

const conflict = (key: string, details?: unknown) => new ApiError('CONFLICT', 409, key, details)
const notFound = () => new ApiError('NOT_FOUND', 404, 'errors.notFound')

export type AdminTransport = Transport & {
  settings: SettingsValues
  state: AdminState
  calls: { name: ProcedureName; input: unknown }[]
  callsTo: (name: ProcedureName) => unknown[]
}

/**
 * `refuse` answers a procedure with an error (e.g. 403 from the service); `roleTasks` counts open tasks per role id
 * (errors.roleInUse details).
 */
export function adminTransport(
  opts: {
    settings?: SettingsValues
    state?: Partial<AdminState>
    refuse?: Partial<Record<ProcedureName, ApiError>>
    roleTasks?: Record<string, number>
  } = {}
): AdminTransport {
  const base = fakeTransport(opts.settings ?? SETTINGS_DEFAULTS)
  const state: AdminState = { ...defaultAdminState(), ...opts.state }
  const calls: { name: ProcedureName; input: unknown }[] = []
  let next = 1
  const id = (prefix: string) => `${prefix}-new-${next++}`
  const countUsers = () => {
    for (const r of state.roles) r.userCount = state.users.filter((u) => u.roleId === r.id).length
  }
  countUsers()
  const activeOwners = (except?: string) =>
    state.users.filter((u) => u.roleId === 'role-owner' && u.active && u.id !== except).length

  const handle = (name: ProcedureName, input: never): unknown => {
    const i = input as Record<string, unknown> & { id: string; patch: Record<string, unknown> }
    switch (name) {
      case 'users.list':
        return state.users.filter((u) => i.includeInactive || u.active)
      case 'users.create': {
        if (state.users.some((u) => u.username === i.username)) throw conflict('errors.usernameTaken')
        const role = state.roles.find((r) => r.id === i.roleId)
        const created = user(id('user'), String(i.username), String(i.displayName), role?.code ?? 'x', {
          roleId: String(i.roleId),
          roleCode: role?.code ?? null,
          mustChange: true,
          employeeId: (i.employeeId as string | null) ?? null
        })
        state.users.push(created)
        countUsers()
        return created
      }
      case 'users.update': {
        const u = state.users.find((x) => x.id === i.id)
        if (!u) throw notFound()
        if (
          i.patch.roleId &&
          u.roleId === 'role-owner' &&
          i.patch.roleId !== 'role-owner' &&
          activeOwners(u.id) === 0
        )
          throw conflict('errors.lastOwner')
        Object.assign(u, i.patch)
        countUsers()
        return u
      }
      case 'users.setActive': {
        const u = state.users.find((x) => x.id === i.id)
        if (!u) throw notFound()
        if (!i.active && u.roleId === 'role-owner' && activeOwners(u.id) === 0)
          throw conflict('errors.lastOwner')
        u.active = Boolean(i.active)
        return u
      }
      case 'users.resetPassword': {
        const u = state.users.find((x) => x.id === i.id)
        if (!u) throw notFound()
        u.mustChange = true
        return u
      }
      case 'roles.list':
        return state.roles
      case 'users.roleChoices':
        return state.roles.map((r) => ({
          id: r.id,
          code: r.code,
          name: r.name,
          displayName: r.displayName,
          locked: r.locked,
          assignable: true
        }))
      case 'roles.create': {
        const levels = (i.permissions ?? {}) as Record<string, PermissionLevel>
        const created: RoleViewDto = {
          id: id('role'),
          code: null,
          name: String(i.name),
          displayName: null,
          description: (i.description as string | null) ?? null,
          isSystem: false,
          permissions: Object.fromEntries(
            PERMISSION_KEYS.map((k) => [k, levels[k] ?? 'none'])
          ) as RoleViewDto['permissions'],
          locked: false,
          userCount: 0,
          tasksOwnOnly: Boolean(i.tasksOwnOnly),
          remoteAllowed: i.remoteAllowed === undefined ? true : Boolean(i.remoteAllowed)
        }
        state.roles.push(created)
        return created
      }
      case 'roles.update': {
        const r = state.roles.find((x) => x.id === i.id)
        if (!r) throw notFound()
        if (r.locked) throw conflict('errors.ownerRoleLocked')
        const {
          permissions,
          name: newName,
          ...rest
        } = i.patch as { permissions?: Record<string, PermissionLevel>; name?: string }
        if (permissions) r.permissions = { ...r.permissions, ...permissions }
        if (newName !== undefined) Object.assign(r, { name: newName, displayName: null })
        Object.assign(r, rest)
        return r
      }
      case 'roles.delete': {
        const r = state.roles.find((x) => x.id === i.id)
        if (!r) throw notFound()
        if (r.locked) throw conflict('errors.ownerRoleLocked')
        const users = state.users.filter((u) => u.roleId === r.id).length
        const tasks = opts.roleTasks?.[r.id] ?? 0
        if (users || tasks) throw conflict('errors.roleInUse', { users, tasks })
        state.roles = state.roles.filter((x) => x.id !== r.id)
        return { ok: true }
      }
      case 'rooms.listTypes':
        return state.roomTypes.filter((t) => i.includeInactive || t.active)
      case 'rooms.createType': {
        if (state.roomTypes.some((x) => nameKey(x.name) === nameKey(String(i.name))))
          throw conflict('errors.nameTaken')
        const created = type(id('custom'), 'custom', String(i.name), {
          id: id('type'),
          nameI18n: null,
          isCustom: true,
          active: true,
          basePriceMinor: (i.basePriceMinor as number | null) ?? null,
          weekendPriceMinor: (i.weekendPriceMinor as number | null) ?? null,
          baseCurrency: (i.baseCurrency as string | null) ?? null
        })
        state.roomTypes.push(created)
        return created
      }
      case 'rooms.updateType': {
        const t = state.roomTypes.find((x) => x.id === i.id)
        if (!t) throw notFound()
        Object.assign(t, i.patch, i.patch.name ? { nameI18n: null } : {})
        return t
      }
      case 'rooms.list':
        return state.rooms.filter((r) => i.includeInactive || r.active)
      case 'rooms.create':
      case 'rooms.createMany': {
        const inputs = (name === 'rooms.create' ? [i] : (i.rooms as Record<string, unknown>[])) as Record<
          string,
          unknown
        >[]
        for (const r of inputs)
          if (state.rooms.some((x) => x.number === r.number)) throw conflict('errors.roomNumberTaken')
        const created = inputs.map((r) =>
          room(String(r.number), String(r.roomTypeId), {
            id: id('room'),
            floor: (r.floor as string | null) ?? null,
            beds: Number(r.beds),
            sellable: r.sellable !== false
          })
        )
        state.rooms.push(...created)
        return name === 'rooms.create' ? created[0] : created
      }
      case 'rooms.update': {
        const r = state.rooms.find((x) => x.id === i.id)
        if (!r) throw notFound()
        const { validFrom: _v, note: _n, ...fields } = i.patch
        Object.assign(r, fields)
        return r
      }
      case 'rooms.capacityHistory': {
        const r = state.rooms.find((x) => x.id === i.roomId)
        if (!r) throw notFound()
        return (
          state.capacity?.[r.id] ?? [
            {
              id: `cap-${r.id}`,
              roomId: r.id,
              validFrom: '2026-01-01',
              active: r.active,
              sellable: r.sellable,
              beds: r.beds,
              note: null,
              createdAt: '2026-01-01T09:00:00.000Z',
              createdBy: null,
              cancelledAt: null,
              cancelledBy: null
            }
          ]
        )
      }
      case 'rooms.cancelCapacityChange': {
        const change = Object.values(state.capacity ?? {})
          .flat()
          .find((c) => c.id === i.id)
        if (!change) throw notFound()
        change.cancelledAt = '2026-10-05T09:00:00.000Z'
        const r = state.rooms.find((x) => x.id === change.roomId)
        if (r?.nextChange?.id === change.id) r.nextChange = null
        return change
      }
      case 'lists.list':
        return state.lists[i.kind as ListKind].filter((x) => i.includeInactive || x.active)
      case 'lists.create': {
        const kind = i.kind as ListKind
        const created: ListItem = {
          id: id('list'),
          code: null,
          name: String(i.name),
          nameI18n: null,
          active: true,
          sort: state.lists[kind].length + 1,
          seeded: false
        }
        state.lists[kind].push(created)
        return created
      }
      case 'lists.update': {
        const row = state.lists[i.kind as ListKind].find((x) => x.id === i.id)
        if (!row) throw notFound()
        Object.assign(row, i.patch, i.patch.name ? { nameI18n: null } : {})
        return row
      }
      case 'shifts.list':
        return state.shifts.filter((s) => i.includeInactive || s.active)
      case 'shifts.create': {
        const created: Shift = {
          id: id('shift'),
          code: null,
          name: String(i.name),
          displayName: null,
          startTime: String(i.startTime),
          endTime: String(i.endTime),
          sort: state.shifts.length + 1,
          active: true
        }
        state.shifts.push(created)
        return created
      }
      case 'shifts.update': {
        const s = state.shifts.find((x) => x.id === i.id)
        if (!s) throw notFound()
        Object.assign(s, i.patch, i.patch.name ? { displayName: null } : {})
        return s
      }
      case 'tasks.listTemplates':
        return state.templates.filter((t) => i.includeInactive || t.active)
      case 'tasks.createTemplate': {
        const created: Template = {
          id: id('tpl'),
          code: null,
          title: String(i.title),
          titleI18n: null,
          description: null,
          kind: 'general',
          recurrence: i.recurrence as Template['recurrence'],
          suggested: false,
          active: true
        }
        state.templates.push(created)
        return created
      }
      case 'tasks.activateTemplate':
      case 'tasks.deactivateTemplate': {
        const t = state.templates.find((x) => x.id === i.id)
        if (!t) throw notFound()
        t.active = name === 'tasks.activateTemplate'
        t.suggested = false
        return t
      }
      case 'staff.getPolicy':
        return state.policy
      case 'staff.setPolicy': {
        const values = i.values as Policy['values']
        state.policy = {
          ...state.policy,
          values: { ...state.policy.values, ...values },
          hotel: { ...state.policy.hotel, ...values }
        }
        return state.policy
      }
      case 'staff.listEmployees':
        return state.employees.filter((e) => i.includeInactive || e.active)
      case 'calendar.days':
        return state.days.filter((d) => d.date >= String(i.from) && d.date <= String(i.to))
      case 'audit.list': {
        const rows = state.audit.filter(
          (e) =>
            (!i.entity || e.entity === i.entity) &&
            (!i.action || e.action === i.action) &&
            (!i.userId || e.userId === i.userId) &&
            (!i.from || e.ts >= String(i.from)) &&
            (!i.to || e.ts < String(i.to))
        )
        const start = i.cursor ? Number(i.cursor) : 0
        const limit = Number(i.limit ?? 100)
        const end = start + limit
        return { entries: rows.slice(start, end), nextCursor: end < rows.length ? String(end) : null }
      }
      case 'auth.devices':
        return state.devices
      case 'auth.revokeDevice': {
        const d = state.devices.find((x) => x.id === i.id)
        if (!d) throw notFound()
        d.revokedAt = new Date().toISOString()
        d.sessions = []
        return { ok: true }
      }
      case 'auth.revokeSession':
        for (const d of state.devices) d.sessions = d.sessions.filter((s) => s.id !== i.id)
        return { ok: true }
      default:
        return base.call(name, input)
    }
  }

  return {
    kind: 'ipc',
    get settings() {
      return base.settings
    },
    state,
    calls,
    callsTo: (name) => calls.filter((c) => c.name === name).map((c) => c.input),
    async call(name, input) {
      calls.push({ name, input })
      const refused = opts.refuse?.[name]
      if (refused) throw refused
      // A copy, as over IPC: the screen never shares objects with the "database".
      return structuredClone(await handle(name, input as never)) as never
    }
  } as AdminTransport
}

/** The 403 a service answers for a right the caller lacks. */
export const permissionDenied = () => new ApiError('PERMISSION_DENIED', 403, 'errors.permissionDenied')
