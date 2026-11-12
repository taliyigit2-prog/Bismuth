// Users, roles, sign-in, devices, recovery codes, audit log filter and backups (03-mimari.md §4.1, §4.8, §5, §8;
// G-20…G-25, G-120, G-121, G-144, K-16, K-23). Inputs only: authorisation lives in the services (G-23).
import * as z from 'zod'
import { permissionKeySchema, permissionLevelSchema } from '../permissions'

const idSchema = z.string().min(1).max(64)

/** Usernames compare case-insensitively with Turkish rules ("AYŞE" = "ayşe", "İrem" = "irem"). */
export const normalizeUsername = (value: string): string =>
  value.trim().normalize('NFC').toLocaleLowerCase('tr-TR')

export const usernameSchema = z
  .string()
  .trim()
  .min(2)
  .max(40)
  .regex(/^[\p{L}\p{N}._@-]+$/u, 'letters, digits . _ @ -')
  .transform(normalizeUsername)

export const passwordSchema = z.string().min(8).max(256)
/** PINs anyone tries first: one digit repeated, a run up or down (1234, 4321), and the usual few. */
const COMMON_PINS: ReadonlySet<string> = new Set([
  '1212',
  '2580',
  '0852',
  '1122',
  '1313',
  '2000',
  '1004',
  '6969',
  '7777',
  '1010'
])
export function isWeakPin(pin: string): boolean {
  if (/^(\d)\1+$/.test(pin)) return true
  const digits = [...pin].map(Number)
  const steps = digits.slice(1).map((d, i) => d - digits[i]!)
  if (steps.every((s) => s === 1) || steps.every((s) => s === -1)) return true
  return COMMON_PINS.has(pin)
}

/** Quick user switch PIN (G-22): 4–8 digits, not one of the first ones anybody tries. */
export const pinSchema = z
  .string()
  .regex(/^\d{4,8}$/, '4-8 digits')
  .refine((pin) => !isWeakPin(pin), 'weak pin')

/** Role editor matrix: key → none | view | edit. Keys left out are `none` on create and unchanged on update. */
export const permissionsMapSchema = z.partialRecord(permissionKeySchema, permissionLevelSchema)
export type PermissionsMap = z.infer<typeof permissionsMapSchema>

/**
 * Where a role's users may sign in from besides the hotel's own computers (server mode, Faz 13): anywhere (local
 * network and the private network, e.g. NetBird), only the hotel's local network (Wi-Fi), or nowhere.
 */
export const REMOTE_ACCESS = ['anywhere', 'lan', 'off'] as const
export type RemoteAccess = (typeof REMOTE_ACCESS)[number]
export const remoteAccessSchema = z.enum(REMOTE_ACCESS)

const roleName = z.string().trim().min(1).max(60)
const roleDescription = z.string().trim().max(300).nullish()

export const roleInputSchema = z.object({
  name: roleName,
  description: roleDescription,
  permissions: permissionsMapSchema.optional(),
  /** Its users see only tasks given to them or to the role (K-38). */
  tasksOwnOnly: z.boolean().optional(),
  /** Its users may sign in from outside the hotel's computers (server mode). Default yes. */
  remoteAllowed: z.boolean().optional(),
  /** Three-way form of `remoteAllowed` (wins when both are given). Default anywhere. */
  remoteAccess: remoteAccessSchema.optional()
})
export type RoleInput = z.input<typeof roleInputSchema>

export const roleUpdateSchema = z
  .object({
    name: roleName.optional(),
    description: roleDescription,
    permissions: permissionsMapSchema.optional(),
    tasksOwnOnly: z.boolean().optional(),
    remoteAllowed: z.boolean().optional(),
    remoteAccess: remoteAccessSchema.optional()
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'empty patch' })
export type RoleUpdate = z.input<typeof roleUpdateSchema>

export const userInputSchema = z.object({
  username: usernameSchema,
  displayName: z.string().trim().min(1).max(80),
  roleId: idSchema,
  /** Staff card linked to this account (G-25). */
  employeeId: idSchema.nullish(),
  /** Initial password; the user must change it at first sign-in. */
  password: passwordSchema
})
export type UserInput = z.input<typeof userInputSchema>

export const userUpdateSchema = z
  .object({
    displayName: z.string().trim().min(1).max(80).optional(),
    roleId: idSchema.optional(),
    employeeId: idSchema.nullable().optional()
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'empty patch' })
export type UserUpdate = z.input<typeof userUpdateSchema>

export const DEVICE_KINDS = ['desktop', 'browser', 'mobile'] as const
export type DeviceKind = (typeof DEVICE_KINDS)[number]

/** The device a sign-in comes from: a known `deviceId` (returned by an earlier sign-in) or a name for a new one. */
export const deviceInfoSchema = z
  .object({
    deviceId: idSchema.optional(),
    deviceName: z.string().trim().min(1).max(100).optional(),
    kind: z.enum(DEVICE_KINDS),
    platform: z.string().trim().max(100).nullish(),
    ip: z.string().trim().max(64).nullish()
  })
  .refine((d) => d.deviceId !== undefined || d.deviceName !== undefined, {
    path: ['deviceName'],
    message: 'deviceId or deviceName required'
  })
export type DeviceInfo = z.input<typeof deviceInfoSchema>

// Sign-in inputs are deliberately loose (no format rules): a malformed value is just a failed sign-in.
// The account is named by username (typed) or by id (picked from the sign-in cards, G-22).
export const loginInputSchema = z
  .object({
    username: z.string().max(200).optional(),
    userId: idSchema.optional(),
    secret: z.string().max(256),
    device: deviceInfoSchema
  })
  .refine((d) => (d.username === undefined) !== (d.userId === undefined), {
    message: 'username or userId required'
  })
export type LoginInput = z.input<typeof loginInputSchema>

export const pinLoginInputSchema = z.object({
  userId: idSchema,
  pin: z.string().max(16),
  device: deviceInfoSchema
})
export type PinLoginInput = z.input<typeof pinLoginInputSchema>

export const changePasswordInputSchema = z.object({
  currentPassword: z.string().max(256),
  newPassword: passwordSchema
})
export type ChangePasswordInput = z.input<typeof changePasswordInputSchema>

export const setPinInputSchema = z.object({ currentPassword: z.string().max(256), pin: pinSchema })
export type SetPinInput = z.input<typeof setPinInputSchema>

export const recoverInputSchema = z.object({
  username: z.string().max(200),
  code: z.string().max(64),
  newPassword: passwordSchema
})
export type RecoverInput = z.input<typeof recoverInputSchema>

// Audit log (G-24): read-only filter. Times are ISO-8601 UTC; `from` inclusive, `to` exclusive.
export const AUDIT_PAGE_MAX = 500
export const auditFilterSchema = z.object({
  entity: z.string().trim().min(1).max(64).optional(),
  entityId: z.string().trim().min(1).max(64).optional(),
  userId: idSchema.optional(),
  deviceId: idSchema.optional(),
  action: z.string().trim().min(1).max(32).optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  limit: z.number().int().min(1).max(AUDIT_PAGE_MAX).default(100),
  /** `nextCursor` of the previous page. */
  cursor: z.string().max(200).optional()
})
export type AuditFilter = z.input<typeof auditFilterSchema>

// Backups (G-120, G-121).
export const BACKUP_KINDS = ['manual', 'auto', 'safety'] as const
export type BackupKind = (typeof BACKUP_KINDS)[number]
export const backupKindSchema = z.enum(BACKUP_KINDS)
/** Days a local backup file is kept (G-120: 30). */
export const keepDaysSchema = z.number().int().min(1).max(3650)
