// Faz 4 contract shapes: who is signed in, the setup wizard, users and roles, rooms and room types, the hotel's
// lists, shifts, task templates, pay rules, the calendar's generated days and the audit log (G-10…G-25, G-47,
// G-48, G-82, G-144). Outputs list only what the screens read: the router strips anything else a service returns.
import * as z from 'zod'
import { APP_LOCALES } from '../format'
import { PERMISSION_KEYS, permissionLevelSchema, type PermissionKey } from '../permissions'
import { currencyCode, clockTime, MAX_ACCEPTED_CURRENCIES, timeZoneSchema } from './settings'
import {
  amountSchema,
  i18nTextSchema,
  idSchema,
  localDateSchema,
  minorSchema,
  roomInputSchema,
  roomTypeInputSchema
} from './rooms'
import { OWN_TASKS_MAX, ownTaskSchema } from './operations'
import { payPolicyShape, payPolicyValuesSchema } from './staff'
import { passwordSchema, pinSchema, recoverInputSchema, remoteAccessSchema, usernameSchema } from './users'

const i18n = i18nTextSchema.nullable()
const iso = z.string()
const ok = z.object({ ok: z.literal(true) })
export const okSchema = ok

// ── Who is signed in ─────────────────────────────────────────────────────────────────────────────────────────

export const APP_MODES = ['standalone', 'host', 'client'] as const
export type AppMode = (typeof APP_MODES)[number]
export const appModeSchema = z.enum(APP_MODES)

/** Every permission key with its level: what the shell hides and what the role editor shows. */
export const permissionLevelsSchema = z.record(
  z.enum(PERMISSION_KEYS as unknown as [PermissionKey, ...PermissionKey[]]),
  permissionLevelSchema
)

export const meSchema = z.object({
  user: z.object({
    id: idSchema,
    username: z.string(),
    displayName: z.string(),
    roleId: idSchema,
    roleCode: z.string().nullable(),
    roleName: z.string(),
    roleNameI18n: i18n,
    hasPin: z.boolean(),
    /** The password was set by someone else: the UI asks for a new one before anything else. */
    mustChange: z.boolean()
  }),
  permissions: permissionLevelsSchema,
  /** The window is locked (idle or "Kilitle"): only unlock, sign-out and the user list answer. */
  locked: z.boolean()
})
export type Me = z.infer<typeof meSchema>

/** What the window shows at start: the wizard, the connection screen (client mode), sign-in, lock or the app. */
export const authStateSchema = z.object({
  setup: z.enum(['needed', 'done']),
  mode: appModeSchema,
  session: meSchema.nullable()
})
export type AuthState = z.infer<typeof authStateSchema>

/** The sign-in screen's list: names only, never usernames of people who cannot sign in here. */
export const signInUserSchema = z.object({
  id: idSchema,
  displayName: z.string(),
  roleName: z.string(),
  roleNameI18n: i18n,
  hasPin: z.boolean()
})
export type SignInUser = z.infer<typeof signInUserSchema>

// The window's own device is added by the main process; the renderer never sends device data.
/** Typed username, or the account picked from the sign-in cards; the secret is the password. */
export const signInRequestSchema = z.union([
  z.object({ username: z.string().max(200), secret: z.string().max(256) }),
  z.object({ userId: idSchema, secret: z.string().max(256) })
])
export const pinSignInRequestSchema = z.object({ userId: idSchema, pin: z.string().max(16) })
export const unlockRequestSchema = z.object({ secret: z.string().max(256) })
export const recoverRequestSchema = recoverInputSchema
export const newRecoveryCodesRequestSchema = z.object({ currentPassword: z.string().max(256) })
export const recoveryCodesSchema = z.object({ codes: z.array(z.string()) })

export const deviceViewSchema = z.object({
  id: idSchema,
  name: z.string(),
  kind: z.enum(['desktop', 'browser', 'mobile']),
  platform: z.string().nullable(),
  firstSeenAt: iso,
  lastSeenAt: iso,
  lastIp: z.string().nullable(),
  trusted: z.boolean(),
  revokedAt: iso.nullable(),
  sessions: z.array(
    z.object({
      id: idSchema,
      userId: idSchema,
      userName: z.string(),
      createdAt: iso,
      lastSeenAt: iso,
      expiresAt: iso,
      /** The caller's own sign-in ("Bu oturum"). */
      current: z.boolean()
    })
  )
})

// ── Users and roles (G-20…G-22, G-25) ────────────────────────────────────────────────────────────────────────

export const userViewSchema = z.object({
  id: idSchema,
  username: z.string(),
  displayName: z.string(),
  roleId: idSchema,
  roleCode: z.string().nullable(),
  active: z.boolean(),
  hasPin: z.boolean(),
  mustChange: z.boolean(),
  lastLoginAt: iso.nullable(),
  lockedUntil: iso.nullable(),
  /** The staff card linked to this account (G-25). */
  employeeId: idSchema.nullable()
})
export type UserViewDto = z.infer<typeof userViewSchema>

export const roleViewSchema = z.object({
  id: idSchema,
  code: z.string().nullable(),
  name: z.string(),
  displayName: i18n,
  description: z.string().nullable(),
  isSystem: z.boolean(),
  permissions: permissionLevelsSchema,
  /** The owner role: every right, not editable or removable. */
  locked: z.boolean(),
  userCount: z.number().int(),
  tasksOwnOnly: z.boolean(),
  /** Its users may sign in from outside the hotel's computers (server mode, Faz 13). */
  remoteAllowed: z.boolean(),
  /** Where from: anywhere, only the hotel's local network, or nowhere (missing: from `remoteAllowed`). */
  remoteAccess: remoteAccessSchema.optional()
})
export type RoleViewDto = z.infer<typeof roleViewSchema>

// ── Rooms, room types and the hotel's lists (G-11…G-15, G-48) ───────────────────────────────────────────────

export const roomTypeViewSchema = z.object({
  id: idSchema,
  code: z.string(),
  name: z.string(),
  nameI18n: i18n,
  group: z.enum(['occupancy', 'tier', 'suite', 'view', 'building', 'feature', 'custom']),
  isCustom: z.boolean(),
  maxAdults: z.number().int().nullable(),
  basePriceMinor: minorSchema.nullable(),
  weekendPriceMinor: minorSchema.nullable(),
  hourlyPriceMinor: minorSchema.nullish(),
  baseCurrency: z.string().nullable(),
  sort: z.number().int(),
  active: z.boolean()
})
export type RoomTypeView = z.infer<typeof roomTypeViewSchema>

export const roomViewSchema = z.object({
  id: idSchema,
  number: z.string(),
  floor: z.string().nullable(),
  roomTypeId: idSchema,
  beds: z.number().int(),
  sellable: z.boolean(),
  notes: z.string().nullable(),
  sort: z.number().int(),
  /** In use today (by the capacity history: a planned change waits for its day, K-27). */
  active: z.boolean(),
  /** A room not opened yet: the day it opens ("rooms.list" only). */
  opensOn: z.string().nullable().optional(),
  /** The next planned capacity change after today ("rooms.list" only). */
  nextChange: z
    .object({
      id: idSchema,
      validFrom: z.string(),
      active: z.boolean(),
      sellable: z.boolean(),
      beds: z.number().int()
    })
    .nullable()
    .optional()
})
export type RoomView = z.infer<typeof roomViewSchema>

/** One row of a room's capacity history (Ayarlar → Odalar → Kapasite geçmişi; K-27). */
export const capacityChangeViewSchema = z.object({
  id: idSchema,
  roomId: idSchema,
  validFrom: z.string(),
  active: z.boolean(),
  sellable: z.boolean(),
  beds: z.number().int(),
  note: z.string().nullable(),
  createdAt: z.string(),
  createdBy: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  cancelledBy: z.string().nullable()
})
export type CapacityChangeView = z.infer<typeof capacityChangeViewSchema>

export const LIST_KINDS = [
  'paymentMethods',
  'salesChannels',
  'extraServices',
  'expenseSections',
  'laundryItemTypes',
  'productCategories',
  /** G-50, K-46 (2): labels on guest cards ("Düzenli", "Firma misafiri"…); nothing seeded. */
  'guestTags'
] as const
export type ListKind = (typeof LIST_KINDS)[number]
export const listKindSchema = z.enum(LIST_KINDS)

/** One row of a hotel list; the kind's own columns ride along (payment group, channel commission, …). */
export const listItemSchema = z.object({
  id: idSchema,
  code: z.string().nullable(),
  name: z.string().nullable(),
  nameI18n: i18n,
  active: z.boolean(),
  sort: z.number().int(),
  /** Seeded rows (payment "Nakit", channel "Booking.com", …) keep their code; the hotel's own rows have none. */
  seeded: z.boolean(),
  group: z.string().optional(),
  isCash: z.boolean().optional(),
  kind: z.string().optional(),
  commissionBp: z.number().int().nullable().optional(),
  defaultCollectedBy: z.enum(['hotel', 'channel']).optional(),
  defaultPriceMinor: minorSchema.nullable().optional(),
  defaultCurrency: z.string().nullable().optional(),
  unit: z.string().optional(),
  visibilityPermission: z.enum(['expenses', 'expenses.owner']).optional()
})
export type ListItem = z.infer<typeof listItemSchema>

/** Groups the hotel picks from when it adds its own payment method. */
export const PAYMENT_METHOD_NEW_GROUPS = ['cash', 'card', 'bank', 'other'] as const

export const listCreateSchema = z.object({
  kind: listKindSchema,
  name: z.string().trim().min(1).max(80),
  /** Payment methods: is it cash (counts in the drawer). */
  isCash: z.boolean().optional(),
  /**
   * Payment methods: the group the reports and the month-end check put it in (cash = the drawer; every other group
   * waits for the "x"). Wins over `isCash`; absent = cash when `isCash`, otherwise "other".
   */
  group: z.enum(PAYMENT_METHOD_NEW_GROUPS).optional(),
  /** Sales channels: who collects the money by default. */
  defaultCollectedBy: z.enum(['hotel', 'channel']).optional(),
  commissionBp: z.number().int().min(0).max(10_000).nullish(),
  /** Extra services: suggested price. */
  defaultPriceMinor: amountSchema.nonnegative().nullish(),
  defaultCurrency: currencyCode.nullish(),
  unit: z.enum(['per_booking', 'per_night', 'per_person', 'per_item', 'per_bag_day']).optional()
})
export type ListCreateInput = z.input<typeof listCreateSchema>

export const listUpdateSchema = z.object({
  kind: listKindSchema,
  id: idSchema,
  patch: z
    .object({
      /** A new name replaces the translated seed name in every language. */
      name: z.string().trim().min(1).max(80).optional(),
      active: z.boolean().optional(),
      sort: z.number().int().optional(),
      commissionBp: z.number().int().min(0).max(10_000).nullish(),
      defaultPriceMinor: amountSchema.nonnegative().nullish()
    })
    .refine((p) => Object.keys(p).length > 0, { message: 'empty patch' })
})
export type ListUpdateInput = z.input<typeof listUpdateSchema>

// ── Shifts, task templates, pay rules, calendar days ─────────────────────────────────────────────────────────

export const shiftViewSchema = z.object({
  id: idSchema,
  code: z.string().nullable(),
  name: z.string().nullable(),
  displayName: i18n,
  startTime: clockTime,
  endTime: clockTime,
  sort: z.number().int(),
  active: z.boolean()
})

export const taskTemplateViewSchema = z.object({
  id: idSchema,
  code: z.string().nullable(),
  title: z.string().nullable(),
  titleI18n: i18n,
  description: z.string().nullable(),
  kind: z.enum(['general', 'maintenance', 'legal']),
  recurrence: z.record(z.string(), z.unknown()),
  suggested: z.boolean(),
  active: z.boolean()
})

export const payPolicyViewSchema = z.object({
  employeeId: idSchema.nullable(),
  /** Rules in effect (defaults ← hotel ← employee); keys without a value have none (e.g. no overtime rate). */
  values: z.object(payPolicyShape).partial(),
  hotel: payPolicyValuesSchema,
  employee: payPolicyValuesSchema
})

export const employeeSummarySchema = z.object({
  id: idSchema,
  firstName: z.string(),
  lastName: z.string(),
  fullName: z.string(),
  position: z.string().nullable(),
  active: z.boolean(),
  userId: idSchema.nullable()
})

export const calendarDayViewSchema = z.object({
  id: idSchema,
  date: localDateSchema,
  occurrenceDate: localDateSchema,
  kind: z.enum(['holiday', 'half_holiday', 'special', 'note', 'event']),
  title: z.string().nullable(),
  titleI18n: i18n,
  source: z.enum(['generated', 'verified', 'user']),
  estimated: z.boolean()
})

// ── Audit log (G-24) ─────────────────────────────────────────────────────────────────────────────────────────

export const auditEntrySchema = z.object({
  id: idSchema,
  ts: iso,
  userId: idSchema.nullable(),
  userName: z.string().nullable(),
  deviceId: z.string().nullable(),
  deviceName: z.string().nullable(),
  entity: z.string(),
  entityId: z.string(),
  action: z.string(),
  before: z.unknown(),
  after: z.unknown(),
  reason: z.string().nullable()
})
export const auditPageSchema = z.object({
  entries: z.array(auditEntrySchema),
  nextCursor: z.string().nullable()
})
export type AuditEntry = z.infer<typeof auditEntrySchema>

// ── Setup wizard (G-10, faz-04 madde 1) ──────────────────────────────────────────────────────────────────────

/** A room type picked in the wizard: a seeded one by id, or the hotel's own one by a temporary key. */
const roomTypeRef = z.union([z.object({ id: idSchema }), z.object({ tempKey: z.string().min(1).max(40) })])

export const setupDraftSchema = z.object({
  language: z.enum(APP_LOCALES),
  theme: z.enum(['light', 'dark', 'system']),
  hotel: z.object({
    name: z.string().trim().min(1).max(80),
    /** ISO 3166-1 alpha-2 (holidays, weather). */
    country: z.string().regex(/^[A-Z]{2}$/),
    city: z.string().trim().max(80),
    timezone: timeZoneSchema,
    checkinTime: clockTime,
    checkoutTime: clockTime
  }),
  money: z.object({
    baseCurrency: currencyCode,
    currencies: z.array(currencyCode).min(1).max(MAX_ACCEPTED_CURRENCIES)
  }),
  roomTypes: z.object({
    /** Seeded types the hotel uses, with suggested prices (G-48); every other seeded type is switched off. */
    selected: z
      .array(
        z.object({
          id: idSchema,
          basePriceMinor: amountSchema.nonnegative().nullish(),
          weekendPriceMinor: amountSchema.nonnegative().nullish(),
          /** The optional hourly-stay step of the wizard (K-48): the price of one hour. */
          hourlyPriceMinor: amountSchema.nonnegative().nullish()
        })
      )
      .max(100),
    custom: z
      .array(
        roomTypeInputSchema
          .pick({ name: true, basePriceMinor: true, weekendPriceMinor: true, hourlyPriceMinor: true })
          .extend({ tempKey: z.string().min(1).max(40) })
      )
      .max(50)
  }),
  rooms: z
    .array(
      roomInputSchema
        .pick({ number: true, floor: true, beds: true, sellable: true })
        .extend({ roomType: roomTypeRef })
    )
    .min(1)
    .max(500),
  lists: z.object({
    /** Ids of the seeded rows kept on; every other seeded row of the three lists is switched off. */
    paymentMethods: z.array(idSchema).max(100),
    salesChannels: z.array(idSchema).max(100),
    extraServices: z.array(idSchema).max(100),
    /** The hotel's own additions, by name. */
    customPaymentMethods: z.array(z.string().trim().min(1).max(80)).max(50).default([]),
    customSalesChannels: z.array(z.string().trim().min(1).max(80)).max(50).default([]),
    customExtraServices: z.array(z.string().trim().min(1).max(80)).max(50).default([])
  }),
  staff: z.object({
    policy: payPolicyValuesSchema,
    advanceFromDrawer: z.boolean()
  }),
  /** The hotel's shifts; ids of seeded shifts update them, rows without id are added, seeded ones left out end. */
  shifts: z
    .array(
      z.object({
        id: idSchema.optional(),
        name: z.string().trim().min(1).max(60),
        startTime: clockTime,
        endTime: clockTime
      })
    )
    .max(10),
  /**
   * Suggested task templates to switch on (G-94), the legal reminders (on/off) and the hotel's own repeating
   * tasks (added as active templates).
   */
  tasks: z.object({
    suggestions: z.array(idSchema).max(200),
    legalReminders: z.boolean(),
    custom: z.array(ownTaskSchema).max(OWN_TASKS_MAX).default([])
  }),
  employees: z
    .array(
      z.object({
        firstName: z.string().trim().min(1).max(60),
        lastName: z.string().trim().min(1).max(60),
        position: z.string().trim().max(60).nullish(),
        startDate: localDateSchema,
        /** A sign-in account for the employee (G-25); must change the password at first sign-in. */
        account: z.object({ username: usernameSchema, password: passwordSchema, roleId: idSchema }).nullish()
      })
    )
    .max(100),
  calendar: z.object({
    highlightWeekdays: z.array(z.number().int().min(0).max(6)).max(7),
    dayClosing: z.boolean()
  }),
  owner: z.object({
    username: usernameSchema,
    displayName: z.string().trim().min(1).max(80),
    password: passwordSchema,
    pin: pinSchema.nullish()
  })
})
export type SetupDraft = z.input<typeof setupDraftSchema>

/** Progress saved after each step (passwords and PINs are never kept). */
export const setupProgressSchema = z.object({
  step: z.number().int().min(0).max(50),
  draft: z.record(z.string(), z.unknown())
})
export type SetupProgress = z.infer<typeof setupProgressSchema>

export const setupStateSchema = z.object({
  done: z.boolean(),
  mode: appModeSchema,
  progress: setupProgressSchema.nullable()
})

/** Choices the wizard offers: seeded lists with their translated names and the default pay rules. */
export const setupOptionsSchema = z.object({
  roomTypes: z.array(roomTypeViewSchema),
  paymentMethods: z.array(listItemSchema),
  salesChannels: z.array(listItemSchema),
  extraServices: z.array(listItemSchema),
  shifts: z.array(shiftViewSchema),
  taskTemplates: z.array(taskTemplateViewSchema),
  roles: z.array(roleViewSchema),
  payPolicy: z.object(payPolicyShape).partial(),
  /**
   * Public holidays the calendar will mark (Türkiye, generated offline; G-16), this year and next, for the
   * calendar step's preview. Religious feasts are `estimated` (±1 day from Diyanet).
   */
  holidays: z.array(
    z.object({
      date: localDateSchema,
      kind: z.enum(['holiday', 'half_holiday']),
      titleI18n: i18n,
      estimated: z.boolean()
    })
  )
})

export const setupFinishSchema = z.object({
  /** Shown once: the owner writes them down (forgotten password, G-22). */
  recoveryCodes: z.array(z.string()),
  me: meSchema
})
