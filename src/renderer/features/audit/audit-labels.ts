// Names of what the audit log records (G-24): the services write snake_case entity names and an action
// (src/shared/audit.ts; `entity: '…'` in src/main/services). The screen shows them in the UI language;
// tests/unit/audit-labels.test.ts fails when a service writes an entity or action without a label here.
import type { TFunction } from 'i18next'
import type { AuditEntry } from '@shared/contract'
import { AUDIT_ACTIONS, type AuditAction } from '@shared/audit'
import { PERMISSION_KEYS, type PermissionKey } from '@shared/permissions'

export const AUDIT_ENTITIES = [
  'attachment',
  'backup',
  'blacklist',
  'business_day',
  'calendar_day',
  'calendar_generation',
  'cash_handover',
  'charge',
  'folio',
  'company',
  'contact',
  'country_map',
  'device',
  'employee',
  'employee_salary',
  'employment_period',
  'expense',
  'expense_section',
  'extra_service',
  'fx_rate',
  'guest',
  'guest_tag',
  'import_batch',
  'kbs_import',
  'laundry_delivery',
  'laundry_item_type',
  'laundry_price',
  'laundry_settlement',
  'leave_record',
  'lost_item',
  'note',
  'pay_policy',
  'payment',
  'payment_method',
  'product',
  'product_category',
  'recovery_codes',
  'replica_grant',
  'reservation',
  'reservation_note',
  'reservation_room',
  'role',
  'room',
  'room_block',
  'room_capacity_change',
  'room_issue',
  'room_type',
  'salary_period',
  'sales_channel',
  'session',
  'settings',
  'setup',
  'shift_definition',
  'shift_handover',
  'staff_transaction',
  'stay_occupant',
  'status_tag',
  'takeover',
  'task',
  'task_template',
  'user',
  'user_preference',
  'work_record'
] as const
export type AuditEntity = (typeof AUDIT_ENTITIES)[number]

export { AUDIT_ACTIONS, type AuditAction } from '@shared/audit'

export const isAuditEntity = (v: string): v is AuditEntity =>
  (AUDIT_ENTITIES as readonly string[]).includes(v)
export const isAuditAction = (v: string): v is AuditAction => (AUDIT_ACTIONS as readonly string[]).includes(v)

export const entityLabel = (t: TFunction, entity: string): string =>
  isAuditEntity(entity) ? t(`audit.entity.${entity}`) : entity

export const actionLabel = (t: TFunction, action: string): string =>
  isAuditAction(action) ? t(`audit.action.${action}`) : action

/** How an action reads as a badge: voids and cancellations stand out, sign-in noise stays quiet. */
export const actionTone = (action: string): 'default' | 'secondary' | 'destructive' | 'outline' =>
  action === 'void' ||
  action === 'cancel' ||
  action === 'delete' ||
  action === 'login_failed' ||
  action === 'reauth_failed'
    ? 'destructive'
    : action === 'create'
      ? 'default'
      : action === 'login' || action === 'logout'
        ? 'outline'
        : 'secondary'

/**
 * The last characters of a record id (ULIDs share their start for records made the same day); other ids — a
 * setting's key ("hotel.name"), a day ("2026-10-04") — are short and readable as they are.
 */
export const shortId = (id: string): string => (/^[0-9A-HJKMNP-TV-Z]{26}$/.test(id) ? `…${id.slice(-6)}` : id)

/** Settings the log names by their screen label instead of their key (the rest keep their key, "hotel.city"). */
const SETTING_LABELS = {
  'ui.language': 'settings.language',
  'ui.theme': 'settings.theme',
  'ui.density': 'settings.density',
  'ui.showMinor': 'settings.showMinor',
  'ui.startScreen': 'settings.startScreen',
  'ui.sidebarCollapsed': 'topbar.toggleSidebar',
  'ui.fontSize': 'settings.fontSize',
  'ui.zoom': 'settings.zoom',
  'ui.accentColor': 'themePreview.accent.title',
  'ui.accentColorDark': 'themePreview.accent.title',
  'hotel.name': 'settings.hotelName',
  'security.idleLockMinutes': 'settings.idleLock.title',
  'guide.tourForNewUsers': 'audit.setting.guideTour',
  'fx.hotelRates': 'audit.setting.hotelRates',
  'app.mode': 'audit.setting.appMode'
} as const

/**
 * A record without a name field: a setting by its label (a person's own choice is "<person id>:<key>"); a year or a
 * day ("2027"); nothing for the rest — a record id, a program key ("materialize:…", "setup") says nothing to the
 * reader (the full id stays in the row's tooltip and in the detail panel).
 */
export function recordRef(t: TFunction, entry: Pick<AuditEntry, 'entity' | 'entityId'>): string {
  if (entry.entity === 'settings' || entry.entity === 'user_preference') {
    const key = entry.entityId.split(':').at(-1) ?? entry.entityId
    if (key in SETTING_LABELS) return t(SETTING_LABELS[key as keyof typeof SETTING_LABELS])
    return ''
  }
  return /^\d{4}(-\d{2}-\d{2})?$/.test(entry.entityId) ? entry.entityId : ''
}

/** Fields that name a record ("201", "Booking.com", "deniz"): the first one found after (or before) the change. */
const NAME_FIELDS = ['number', 'name', 'username', 'displayName', 'title', 'code'] as const

export function recordName(entry: Pick<AuditEntry, 'before' | 'after'>): string | null {
  for (const side of [entry.after, entry.before]) {
    if (side === null || typeof side !== 'object' || Array.isArray(side)) continue
    for (const field of NAME_FIELDS) {
      const value = (side as Record<string, unknown>)[field]
      if (typeof value === 'string' && value.trim()) return value
    }
  }
  return null
}

/** Who did it: the account's name; the program itself (scheduler, setup) has no account. */
export const whoName = (t: TFunction, entry: Pick<AuditEntry, 'userId' | 'userName'>): string =>
  entry.userName ?? entry.userId ?? t('audit.system')

/**
 * Record fields the before/after view names in the UI language (the most common ones across the services); any
 * other field shows its program name, quietly.
 */
export const AUDIT_FIELDS = [
  'name',
  'displayName',
  'nameI18n',
  'title',
  'code',
  'username',
  'roleId',
  'active',
  'description',
  'note',
  'notes',
  'reason',
  'number',
  'floor',
  'beds',
  'sellable',
  'roomTypeId',
  'validFrom',
  'sort',
  'basePriceMinor',
  'weekendPriceMinor',
  'defaultPriceMinor',
  'amountMinor',
  'currency',
  'baseCurrency',
  'defaultCurrency',
  'commissionBp',
  'isCash',
  'group',
  'kind',
  'unit',
  'color',
  'enabled',
  'voidedAt',
  'voidReason',
  'archivedAt',
  'createdAt',
  'updatedAt',
  'mustChange',
  'failedAttempts',
  'lockedUntil',
  'hasPin',
  'lastLoginAt',
  'employeeId',
  'permissions',
  'remoteAllowed',
  'remoteAccess',
  'tasksOwnOnly',
  'value',
  'startTime',
  'endTime',
  'status'
] as const
export type AuditField = (typeof AUDIT_FIELDS)[number]
export const isAuditField = (v: string): v is AuditField => (AUDIT_FIELDS as readonly string[]).includes(v)

/** Bookkeeping times every row carries: never counted as "changed" (the change itself moved them). */
export const AUDIT_NOISE_FIELDS: ReadonlySet<string> = new Set(['createdAt', 'updatedAt'])

export const isPermissionKey = (v: string): v is PermissionKey =>
  (PERMISSION_KEYS as readonly string[]).includes(v)

type Underscored<S extends string> = S extends `${infer A}.${infer B}` ? `${A}_${Underscored<B>}` : S
/** i18n key of a permission's name (dots in permission keys would nest the JSON). */
export const permissionLabelKey = (key: PermissionKey) =>
  `permissions.key.${key.replaceAll('.', '_')}` as `permissions.key.${Underscored<PermissionKey>}`

/**
 * The name of one step of a field path ("permissions" → "Yetkiler", "permissions › staff" → "Personel kartları");
 * null when the program has no name for it (the raw name is shown).
 */
export function fieldStepLabel(t: TFunction, path: readonly string[], index: number): string | null {
  const step = path[index] ?? ''
  if (index === 0) return isAuditField(step) ? t(`audit.fieldName.${step}`) : null
  return path[index - 1] === 'permissions' && isPermissionKey(step) ? t(permissionLabelKey(step)) : null
}
