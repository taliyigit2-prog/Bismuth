// Permission catalog (03-mimari.md §5; G-20…G-24, K-23, K-38). One key per screen or data area, three levels:
// none | view | edit (edit implies view). The owner picks a level per key in the role editor (Faz 4); the
// service layer is the only place that enforces them (G-23). System roles are starting suggestions.
import * as z from 'zod'

export const PERMISSION_LEVELS = ['none', 'view', 'edit'] as const
export type PermissionLevel = (typeof PERMISSION_LEVELS)[number]
export const permissionLevelSchema = z.enum(PERMISSION_LEVELS)

export const SYSTEM_ROLE_CODES = [
  'owner',
  'manager',
  'reception',
  'accountant',
  'housekeeping',
  'employee'
] as const
export type SystemRoleCode = (typeof SYSTEM_ROLE_CODES)[number]

export type PermissionArea = 'daily' | 'guests' | 'money' | 'staff' | 'operations' | 'reports' | 'system'

type Defaults = readonly [
  owner: PermissionLevel,
  manager: PermissionLevel,
  reception: PermissionLevel,
  accountant: PermissionLevel,
  housekeeping: PermissionLevel,
  employee: PermissionLevel
]

const N = 'none'
const V = 'view'
const E = 'edit'

/**
 * Key → area (role editor grouping) and default level for each system role, in SYSTEM_ROLE_CODES order.
 * Defaults follow the v1 matrix, the owner's answers (S-30 handover: owner + manager; S-34…S-39 overtime and
 * pay rates: owner + manager; S-13 audit log: owner only) and K-38 (housekeeping: room status, issues, own tasks).
 */
const CATALOG = {
  // Daily work
  today: ['daily', [E, E, E, E, V, V]],
  calendar: ['daily', [E, E, E, V, N, N]], // tape chart + reservations (edit = create, change, cancel, park)
  'calendar.notes': ['daily', [E, E, E, N, N, N]], // special days, holidays, notes
  'booking.undoCheckIn': ['daily', [E, E, N, N, N, N]], // K-55: take a check-in back (owner enables it for reception)
  in_house: ['daily', [E, E, E, N, N, N]], // room occupants + KBS marks (G-53, G-54)
  tasks: ['daily', [E, E, E, E, E, V]], // services narrow housekeeping/employee to their own tasks
  shift_notes: ['daily', [E, E, E, N, N, N]], // handover + board notes; personal notes need no permission
  // Guests
  guests: ['guests', [E, E, E, V, N, N]],
  'guests.identity': ['guests', [E, E, E, N, N, N]], // ID document fields
  'guests.merge': ['guests', [E, E, N, N, N, N]],
  blacklist: ['guests', [E, E, E, N, N, N]],
  'blacklist.remove': ['guests', [E, E, N, N, N, N]],
  companies: ['guests', [E, E, E, V, N, N]], // billing details (G-191)
  lost_items: ['guests', [E, E, E, N, V, N]],
  // Money
  payments: ['money', [E, E, E, E, N, N]],
  'payments.refund': ['money', [E, E, E, E, N, N]], // S-100: reception may refund (the owner can switch it off)
  'payments.void': ['money', [E, E, N, N, N, N]],
  'payments.handover': ['money', [E, E, N, N, N, N]], // the "x" (S-30, S-31)
  ledger: ['money', [E, E, V, E, N, N]], // day view, day note, sort
  'business_day.close': ['money', [E, E, N, E, N, N]],
  'ledger.locked': ['money', [E, N, N, N, N, N]], // write into a closed day
  cash: ['money', [E, E, V, E, N, N]], // drawer panel
  expenses: ['money', [E, E, E, E, N, N]], // general expense section
  'expenses.owner': ['money', [E, N, N, N, N, N]], // owner's hidden section (G-67)
  extras: ['money', [E, E, E, N, N, N]], // extra service sales (luggage storage…)
  currency: ['money', [E, E, V, V, N, N]],
  // Staff
  staff: ['staff', [E, V, N, E, N, N]],
  'staff.salary': ['staff', [E, N, N, E, N, N]], // salary table, payments, advances
  'staff.leave': ['staff', [E, E, N, E, N, N]],
  'staff.overtime': ['staff', [E, E, N, N, N, N]], // overtime hours: manager/owner only (S-39)
  'staff.policy': ['staff', [E, E, N, N, N, N]], // overtime, holiday and commission rates (S-34…S-36)
  'staff.own_hours': ['staff', [E, E, E, E, E, E]], // own start/end times (S-39)
  // Operations
  'rooms.status': ['operations', [E, E, E, V, E, N]],
  'rooms.block': ['operations', [E, E, E, N, N, N]],
  room_issues: ['operations', [E, E, E, N, E, N]],
  contacts: ['operations', [E, E, E, V, V, N]],
  supplies: ['operations', [E, E, E, E, N, N]],
  laundry: ['operations', [E, E, E, E, V, N]], // faz-12 madde 5: Muhasebeci edits (invoice, "Ödendi")
  camera: ['operations', [E, E, V, N, N, N]], // Faz 20 (K-49…K-53): view = status and alarms, edit = settings and secrets
  'camera.enroll': ['operations', [E, E, E, N, N, N]], // K-51: take a guest's face from the camera (biometric)
  // Reports
  'reports.operations': ['reports', [E, E, N, E, N, N]],
  'reports.finance': ['reports', [E, V, N, E, N, N]],
  'reports.staff': ['reports', [E, N, N, E, N, N]],
  'reports.export': ['reports', [E, E, N, E, N, N]],
  tourism_stats: ['reports', [E, E, N, E, N, N]],
  // System
  settings: ['system', [E, V, N, N, N, N]], // hotel settings (personal ui.* keys need nothing)
  'settings.rooms': ['system', [E, V, N, N, N, N]], // room types, rooms, capacity history
  'settings.lists': ['system', [E, V, N, N, N, N]], // payment methods, channels, extras, sections, categories
  'settings.colors': ['system', [E, V, N, N, N, N]], // status tags
  'settings.users': ['system', [E, N, N, N, N, N]],
  'settings.roles': ['system', [E, N, N, N, N, N]],
  'settings.backup': ['system', [E, N, N, E, N, N]],
  'remote.settings': ['system', [E, N, N, N, N, N]],
  devices: ['system', [E, N, N, N, N, N]],
  audit_log: ['system', [E, N, N, N, N, N]] // G-24: owner only by default
} as const satisfies Record<string, readonly [PermissionArea, Defaults]>

export type PermissionKey = keyof typeof CATALOG
export const PERMISSION_KEYS = Object.keys(CATALOG) as PermissionKey[]
export const permissionKeySchema = z.enum(PERMISSION_KEYS as [PermissionKey, ...PermissionKey[]])

export const permissionArea = (key: PermissionKey): PermissionArea => CATALOG[key][0]

/** Default permission rows for a system role (the owner role always gets edit on everything). */
export function defaultPermissions(role: SystemRoleCode): Record<PermissionKey, PermissionLevel> {
  const column = SYSTEM_ROLE_CODES.indexOf(role)
  const out = {} as Record<PermissionKey, PermissionLevel>
  for (const key of PERMISSION_KEYS)
    out[key] = role === 'owner' ? 'edit' : (CATALOG[key][1][column] ?? 'none')
  return out
}

/** edit implies view; none allows nothing. */
export function levelAllows(granted: PermissionLevel, needed: Exclude<PermissionLevel, 'none'>): boolean {
  return needed === 'view' ? granted === 'view' || granted === 'edit' : granted === 'edit'
}
