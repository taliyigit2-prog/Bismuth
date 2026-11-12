// Sign-in, sessions, devices, PIN quick switch and recovery codes (03-mimari.md §4.1, §8; G-22, G-144, K-16).
// Passwords, PINs: scrypt with a random salt, compared in constant time. Session tokens: 256-bit random values
// handed out once; only their sha256 is stored (§4.9-10). Every sign-in failure (unknown user, wrong secret,
// locked, inactive) is the same UNAUTHENTICATED error and costs the same scrypt work, so a caller cannot tell
// whether an account exists. Revoking a session or device takes effect on the very next request.
import { createHash, randomBytes, scrypt, scryptSync, timingSafeEqual, type ScryptOptions } from 'node:crypto'
import { and, desc, eq, gt, inArray, isNull, ne } from 'drizzle-orm'
import type * as z from 'zod'
import {
  changePasswordInputSchema,
  deviceInfoSchema,
  loginInputSchema,
  normalizeUsername,
  pinLoginInputSchema,
  recoverInputSchema,
  setPinInputSchema,
  type ChangePasswordInput,
  type DeviceInfo,
  type LoginInput,
  type PinLoginInput,
  type RecoverInput,
  type RemoteAccess,
  type SetPinInput
} from '@shared/contract/users'
import {
  PERMISSION_KEYS,
  PERMISSION_LEVELS,
  defaultPermissions,
  type PermissionKey,
  type PermissionLevel
} from '@shared/permissions'
import type { DbOrTx } from '../db/client'
import { devices, recoveryCodes, rolePermissions, roles, sessions, users } from '../db/schema'
import { writeAudit, writeAuditAs } from './audit'
import type { Ctx } from './context'
import { AppError, permissionDenied } from './errors'
import {
  inTransaction,
  invalid,
  newId,
  notFound,
  parseInput,
  requirePermission,
  stamps,
  type ServiceDeps
} from './kit'

// ── Secrets ─────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * scrypt work factor. The program: OWASP's equivalent of N=2^17/p=1 with a sixth of the memory (16 MiB), kind to the
 * hotel's old PC. Under Vitest (which sets VITEST) the unit tests, which hash and check thousands of passwords, use a
 * small factor: the same code path, and a stored hash carries its own parameters, so checking is unchanged. The
 * built program and the e2e runs never have VITEST set.
 */
export function scryptCost(env: Record<string, string | undefined> = process.env): {
  N: number
  r: number
  p: number
} {
  return env['VITEST'] ? { N: 1024, r: 8, p: 1 } : { N: 16_384, r: 8, p: 5 }
}
const KEY_LENGTH = 32
const SALT_BYTES = 16
/** How often a busy session writes its "last seen" time. */
export const LAST_SEEN_EVERY_MS = 60_000

/** scrypt hash of a password or PIN: `scrypt$N$r$p$<salt base64>$<hash base64>`. */
export function hashSecret(secret: string): string {
  const salt = randomBytes(SALT_BYTES)
  const { N, r, p } = scryptCost()
  const hash = scryptSync(secret.normalize('NFC'), salt, KEY_LENGTH, { N, r, p })
  return ['scrypt', N, r, p, salt.toString('base64'), hash.toString('base64')].join('$')
}

interface ParsedHash {
  salt: Buffer
  expected: Buffer
  options: ScryptOptions
}

/** The parts of a stored `hashSecret` value; null when it is malformed or empty. */
function parseHash(stored: string | null | undefined): ParsedHash | null {
  if (!stored) return null
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return null
  const n = Number(parts[1])
  const r = Number(parts[2])
  const p = Number(parts[3])
  if (!Number.isInteger(n) || n < 2 || n > 1 << 20 || (n & (n - 1)) !== 0) return null
  if (!Number.isInteger(r) || r < 1 || r > 32 || !Number.isInteger(p) || p < 1 || p > 16) return null
  const salt = Buffer.from(parts[4] ?? '', 'base64')
  const expected = Buffer.from(parts[5] ?? '', 'base64')
  if (salt.length < 8 || expected.length < 16) return null
  return { salt, expected, options: { N: n, r, p, maxmem: 256 * n * r } }
}

/** Constant-time check of `secret` against a stored `hashSecret` value; malformed or empty → false. */
export function verifySecret(secret: string, stored: string | null | undefined): boolean {
  const parsed = parseHash(stored)
  if (!parsed) return false
  const actual = scryptSync(secret.normalize('NFC'), parsed.salt, parsed.expected.length, parsed.options)
  return timingSafeEqual(actual, parsed.expected)
}

/**
 * `verifySecret` off the main thread (libuv pool): the server mode's sign-in path, so a burst of remote attempts
 * never freezes the hotel's own window (faz-13 "Faz 4'ten notlar").
 */
export function verifySecretAsync(secret: string, stored: string | null | undefined): Promise<boolean> {
  const parsed = parseHash(stored)
  if (!parsed) return Promise.resolve(false)
  return new Promise((resolve) => {
    scrypt(secret.normalize('NFC'), parsed.salt, parsed.expected.length, parsed.options, (error, actual) => {
      resolve(!error && timingSafeEqual(actual, parsed.expected))
    })
  })
}

/** `hashSecret` off the main thread (server mode). */
export function hashSecretAsync(secret: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES)
  const { N, r, p } = scryptCost()
  return new Promise((resolve, reject) => {
    scrypt(secret.normalize('NFC'), salt, KEY_LENGTH, { N, r, p }, (error, hash) => {
      if (error) reject(error)
      else resolve(['scrypt', N, r, p, salt.toString('base64'), hash.toString('base64')].join('$'))
    })
  })
}

export const sha256Hex = (value: string | Uint8Array): string =>
  createHash('sha256').update(value).digest('hex')

let dummy: string | undefined
/** A hash nobody knows the secret of: unknown users cost the same scrypt work as real ones. */
const dummyHash = (): string => (dummy ??= hashSecret(randomBytes(16).toString('hex')))

const RECOVERY_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const RECOVERY_CODES = 10

/**
 * "K7M2-Q9XD-PA4T-8HZC": 80 random bits (32 divides 256, so `byte % 32` has no bias). At 80 bits a stolen
 * hash cannot be brute-forced, so the stored sha256 (looked up directly) is enough.
 */
function newRecoveryCode(): string {
  const chars = [...randomBytes(16)].map((b) => RECOVERY_ALPHABET.charAt(b % 32)).join('')
  return chars.match(/.{4}/g)?.join('-') ?? chars
}

/** Case, spaces and dashes do not matter when a code is typed; O/I/L read as 0/1/1 (Crockford). */
const normalizeRecoveryCode = (code: string): string =>
  code
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')

// ── Permissions of a role (shared with users-service) ──────────────────────────────────────────────────────

const isPermissionKey = (v: string): v is PermissionKey => (PERMISSION_KEYS as readonly string[]).includes(v)
const isLevel = (v: string): v is PermissionLevel => (PERMISSION_LEVELS as readonly string[]).includes(v)

/** Every key with its level for a role; missing rows are `none`. The owner role always has edit on everything. */
export function loadRolePermissions(db: DbOrTx, roleId: string): Record<PermissionKey, PermissionLevel> {
  const role = db.select({ code: roles.code }).from(roles).where(eq(roles.id, roleId)).get()
  if (!role) throw notFound('role', roleId)
  if (role.code === 'owner') return defaultPermissions('owner')
  const out = Object.fromEntries(PERMISSION_KEYS.map((k) => [k, 'none'])) as Record<
    PermissionKey,
    PermissionLevel
  >
  for (const row of db.select().from(rolePermissions).where(eq(rolePermissions.roleId, roleId)).all()) {
    if (isPermissionKey(row.permission) && isLevel(row.level)) out[row.permission] = row.level
  }
  return out
}

/**
 * Nobody hands out more than they hold: granting a level, assigning a role, or managing an account of a role
 * requires the caller to have at least those levels (a manager with user rights cannot make an owner or reset
 * the owner's password). The owner holds everything, so this never limits the owner.
 */
export function assertCovers(
  ctx: Ctx,
  permissions: Readonly<Partial<Record<PermissionKey, PermissionLevel>>>
): void {
  for (const key of PERMISSION_KEYS) {
    const level = permissions[key] ?? 'none'
    if (level !== 'none' && !ctx.can(key, level)) throw permissionDenied()
  }
}

/** Ends a user's open sessions (optionally keeping the ones on `exceptDeviceId`). Returns how many ended. */
export function revokeUserSessions(tx: DbOrTx, userId: string, now: Date, exceptDeviceId?: string): number {
  const iso = now.toISOString()
  const conditions = [eq(sessions.userId, userId), isNull(sessions.revokedAt), gt(sessions.expiresAt, iso)]
  if (exceptDeviceId) conditions.push(ne(sessions.deviceId, exceptDeviceId))
  return tx
    .update(sessions)
    .set({ revokedAt: iso })
    .where(and(...conditions))
    .run().changes
}

export const unauthenticated = (): AppError => new AppError('UNAUTHENTICATED', 'errors.unauthenticated')
const invalidCredentials = (): AppError => new AppError('UNAUTHENTICATED', 'errors.invalidCredentials')
/**
 * The account is locked after too many wrong passwords: the screen says until when and that a recovery code still
 * opens it (Faz 4 bug hunt #4/#5). `until` is the ISO time the lock ends.
 */
export const accountLocked = (until: string): AppError =>
  new AppError('UNAUTHENTICATED', 'errors.accountLocked', { until })
/** A forced password change comes first: no PIN or recovery codes on a password someone else set (#6). */
const mustChangeFirst = (): AppError => new AppError('CONFLICT', 'errors.mustChangePasswordFirst')
/** A role kept to the hotel's local network, reached from the private network (403: the password was right). */
export const lanOnly = (): AppError => new AppError('PERMISSION_DENIED', 'errors.remoteLanOnly')

/**
 * Which network a server-mode request came from (server/net.ts decides it from the socket address): the hotel's
 * local network (and the computer itself) or the private network (NetBird, Tailscale: 100.64.0.0/10).
 */
export type RequestNetwork = 'lan' | 'private'

/** How a sign-in arrived: over HTTP (`remote`), from which network, and its session length (server mode setting). */
export interface SignInOptions {
  remote?: boolean
  /** Remote only; missing counts as the private network (the stricter side). */
  network?: RequestNetwork
  /** Remote only: hours this session lasts (`host.sessionHours`); else the service default. */
  sessionHours?: number
  /** Remote only: the caller's address, for the PIN pause (with the device). */
  ip?: string | null
}

/** Where a user may sign in from over the network (their role's rule; an unknown user: nowhere). */
export function remoteAccessOfUser(db: DbOrTx, userId: string): RemoteAccess {
  const user = db.select({ roleId: users.roleId }).from(users).where(eq(users.id, userId)).get()
  return user ? remoteAccessOf(db, user.roleId) : 'off'
}

/** Where a role's users may sign in from over the network (0010; older rows read through remote_allowed). */
export function remoteAccessOf(db: DbOrTx, roleId: string): RemoteAccess {
  const row = db
    .select({ access: roles.remoteAccess, allowed: roles.remoteAllowed })
    .from(roles)
    .where(eq(roles.id, roleId))
    .get()
  if (!row) return 'off'
  return row.allowed ? row.access : 'off'
}

/** Audit row for flows without a ctx (sign-in): the user or device may be unknown (null). */
const appendAudit = writeAuditAs

// ── Service ─────────────────────────────────────────────────────────────────────────────────────────────────

export interface AuthDeps extends ServiceDeps {
  /** Session lifetime in hours (default 12). */
  sessionHours?: number
  /** Failed sign-ins in a row before the account locks (default 5). */
  maxFailedAttempts?: number
  /** Lock duration in minutes (default 15). */
  lockMinutes?: number
}

export interface SignInResult {
  /** Bearer token: returned only here, never stored. */
  token: string
  sessionId: string
  userId: string
  /** Keep it and send it with the next sign-in from this device. */
  deviceId: string
  expiresAt: string
  /** The password was set by someone else: the UI asks for a new one first. */
  mustChange: boolean
}

export interface SessionInfo {
  sessionId: string
  userId: string
  deviceId: string
  expiresAt: string
  mustChange: boolean
  /** The session was locked by its user (a phone's lock screen; D3): kept across a restart. */
  locked: boolean
}

export type SessionRow = typeof sessions.$inferSelect
export type SessionView = Omit<SessionRow, 'tokenHash'>
export type DeviceRow = typeof devices.$inferSelect
export interface DeviceView extends DeviceRow {
  sessions: (Omit<SessionView, 'revokedAt' | 'deviceId'> & { userName: string; current: boolean })[]
}

type UserRow = typeof users.$inferSelect
type ParsedDevice = z.output<typeof deviceInfoSchema>
type Method = 'password' | 'pin' | 'recovery_code'

const sessionView = ({ tokenHash: _hash, ...rest }: SessionRow): SessionView => rest

export function createAuthService(deps: AuthDeps) {
  const { db, clock } = deps
  const sessionHours = deps.sessionHours ?? 12
  const maxFailed = deps.maxFailedAttempts ?? 5
  const lockMinutes = deps.lockMinutes ?? 15

  // Wrong PINs per device and per account (in memory: a restart is not a way in, it only resets the pause).
  const pinFailures = new Map<string, number[]>()
  const pinDeviceKey = (device: ParsedDevice): string => device.deviceId ?? device.deviceName ?? device.kind
  const recentPinFailures = (key: string): number[] => {
    const since = clock().getTime() - lockMinutes * 60_000
    const kept = (pinFailures.get(key) ?? []).filter((t) => t > since)
    if (kept.length) pinFailures.set(key, kept)
    else pinFailures.delete(key)
    return kept
  }
  // Over HTTP the caller's address counts too: a new device cookie is not a fresh set of PIN tries.
  const pinKeys = (deviceKey: string, userId: string, ip?: string | null): string[] => [
    `device:${deviceKey}`,
    `user:${userId}`,
    ...(ip ? [`ip:${ip}`] : [])
  ]
  const pinPaused = (deviceKey: string, userId: string, ip?: string | null): boolean =>
    pinKeys(deviceKey, userId, ip).some((key) => recentPinFailures(key).length >= maxFailed)
  const notePinFailure = (deviceKey: string, userId: string, ip?: string | null): void => {
    const at = clock().getTime()
    for (const key of pinKeys(deviceKey, userId, ip)) pinFailures.set(key, [...recentPinFailures(key), at])
  }

  const findByUsername = (username: string): UserRow | undefined =>
    db
      .select()
      .from(users)
      .where(eq(users.username, normalizeUsername(username)))
      .get()

  const existingDeviceId = (deviceId: string | undefined): string | null =>
    deviceId
      ? (db.select({ id: devices.id }).from(devices).where(eq(devices.id, deviceId)).get()?.id ?? null)
      : null

  /**
   * Returns the user when `secretOk` and the account may sign in; otherwise counts the failure (locking after
   * `maxFailed` in a row), writes a login_failed audit row and throws the one sign-in error.
   */
  function checkCredentials(
    user: UserRow | undefined,
    secretOk: boolean,
    method: Method,
    device: ParsedDevice | null,
    opts: SignInOptions = {},
    countFailure = true
  ): UserRow {
    const now = clock()
    const iso = now.toISOString()
    // Over the network the remote counter decides (K-45 (2)): wrong passwords from a phone lock only the remote
    // sign-in, so nobody on the network can lock the reception's own window. A valid recovery code opens a locked
    // account: it is the way out the locked screen points to (P4fix #5).
    const lockedUntil = opts.remote ? user?.remoteLockedUntil : user?.lockedUntil
    const locked = !!lockedUntil && lockedUntil > iso && !(method === 'recovery_code' && secretOk)
    // A role kept to the hotel's own computers cannot sign in from outside, even with the right password; a role
    // kept to the hotel's local network cannot from the private network.
    const access = opts.remote && user ? remoteAccessOf(db, user.roleId) : 'anywhere'
    const remoteBlocked = access === 'off'
    const lanBlocked = access === 'lan' && opts.network !== 'lan'
    if (user && user.active && !locked && secretOk && !remoteBlocked && !lanBlocked) return user
    const reason = !user
      ? 'unknown_user'
      : !user.active
        ? 'inactive'
        : locked
          ? 'locked'
          : !secretOk
            ? 'wrong_secret'
            : remoteBlocked
              ? 'remote_not_allowed'
              : 'remote_lan_only'
    // Set when this very failure locks the account.
    let lockedNow: string | null = null
    db.transaction((tx) => {
      let after: Record<string, unknown> = {
        method,
        reason,
        kind: device?.kind ?? null,
        ip: device?.ip ?? null,
        ...(opts.remote ? { network: opts.network ?? 'private' } : {})
      }
      if (user && reason === 'wrong_secret' && countFailure) {
        // A lock that ran out starts the count again: one wrong try after it is not another 15 minutes (#5).
        const before = opts.remote ? user.remoteFailedAttempts : user.failedAttempts
        const beforeUntil = opts.remote ? user.remoteLockedUntil : user.lockedUntil
        const lockOver = !!beforeUntil && beforeUntil <= iso
        const failedAttempts = (lockOver ? 0 : before) + 1
        const lockedUntil =
          failedAttempts >= maxFailed
            ? new Date(now.getTime() + lockMinutes * 60_000).toISOString()
            : lockOver
              ? null
              : beforeUntil
        tx.update(users)
          .set(
            opts.remote
              ? { remoteFailedAttempts: failedAttempts, remoteLockedUntil: lockedUntil, updatedAt: iso }
              : { failedAttempts, lockedUntil, updatedAt: iso }
          )
          .where(eq(users.id, user.id))
          .run()
        after = { ...after, failedAttempts, lockedUntil }
        if (failedAttempts >= maxFailed) lockedNow = lockedUntil
      }
      // An unknown username is never written down: people type passwords into that box.
      appendAudit(
        tx,
        { userId: user?.id ?? null, deviceId: existingDeviceId(device?.deviceId) },
        { entity: 'user', entityId: user?.id ?? 'unknown', action: 'login_failed', after },
        now
      )
    })
    // The password was right but this network is not the role's: say so (nothing is learned without the password).
    if (reason === 'remote_lan_only') throw lanOnly()
    // A locked account (or the try that just locked it) says so with the end time, even for the right password
    // (#4/#5); a wrong recovery code on a locked account stays "wrong code" (a right one would have opened it).
    // Over the network the lock is told only with the right password (QA3d); a wrong one stays "invalid", so
    // nothing is learned about the account by someone who does not know it.
    if (reason === 'locked' && method !== 'recovery_code' && lockedUntil && (!opts.remote || secretOk))
      throw accountLocked(lockedUntil)
    if (!opts.remote && lockedNow) throw accountLocked(lockedNow)
    throw invalidCredentials()
  }

  /** Known, not revoked device → refreshed; otherwise a new device row (a revoked id never comes back). */
  function touchDevice(tx: DbOrTx, userId: string, device: ParsedDevice, now: Date): string {
    const iso = now.toISOString()
    const existing = device.deviceId
      ? tx.select().from(devices).where(eq(devices.id, device.deviceId)).get()
      : undefined
    if (existing && !existing.revokedAt) {
      tx.update(devices)
        .set({
          lastSeenAt: iso,
          updatedAt: iso,
          ...(device.ip ? { lastIp: device.ip } : {}),
          ...(device.platform ? { platform: device.platform } : {})
        })
        .where(eq(devices.id, existing.id))
        .run()
      return existing.id
    }
    const id = newId(now)
    const row = {
      id,
      name: device.deviceName ?? existing?.name ?? device.kind,
      kind: device.kind,
      platform: device.platform ?? null,
      firstSeenAt: iso,
      lastSeenAt: iso,
      lastIp: device.ip ?? null,
      trusted: false,
      ...stamps(now)
    }
    tx.insert(devices).values(row).run()
    appendAudit(
      tx,
      { userId, deviceId: id },
      { entity: 'device', entityId: id, action: 'create', after: row },
      now
    )
    return id
  }

  function openSession(
    user: UserRow,
    method: Method,
    device: ParsedDevice,
    hours: number = sessionHours,
    remote = false
  ): SignInResult {
    const now = clock()
    const iso = now.toISOString()
    return db.transaction((tx) => {
      const deviceId = touchDevice(tx, user.id, device, now)
      tx.update(users)
        .set(
          remote
            ? { remoteFailedAttempts: 0, remoteLockedUntil: null, lastLoginAt: iso, updatedAt: iso }
            : { failedAttempts: 0, lockedUntil: null, lastLoginAt: iso, updatedAt: iso }
        )
        .where(eq(users.id, user.id))
        .run()
      const token = randomBytes(32).toString('base64url')
      const sessionId = newId(now)
      const expiresAt = new Date(now.getTime() + hours * 3_600_000).toISOString()
      tx.insert(sessions)
        .values({
          id: sessionId,
          userId: user.id,
          deviceId,
          tokenHash: sha256Hex(token),
          createdAt: iso,
          lastSeenAt: iso,
          expiresAt
        })
        .run()
      appendAudit(
        tx,
        { userId: user.id, deviceId },
        {
          entity: 'session',
          entityId: sessionId,
          action: 'login',
          after: { method, expiresAt, ip: device.ip ?? null }
        },
        now
      )
      return { token, sessionId, userId: user.id, deviceId, expiresAt, mustChange: user.mustChange }
    })
  }

  const requireUser = (ctx: Ctx): UserRow => {
    if (!ctx.userId) throw unauthenticated()
    const user = db.select().from(users).where(eq(users.id, ctx.userId)).get()
    if (!user || !user.active) throw unauthenticated()
    return user
  }

  /**
   * The current password asked again on a signed-in account (password, PIN or recovery-code change; P4fix #9, N-2):
   * a locked account is refused; a wrong password counts like a sign-in — on the remote counter when the call came
   * over the network (K-45 (2)), else on the desk's — and leaves a `reauth_failed` audit row, so an open session is
   * not a way to guess the password unseen. The try that locks also ends this session (like five wrong unlock
   * tries). `ok` is the caller's check of the password (sync on the desk, off the main thread over HTTP); the
   * caller's write then clears the count.
   */
  function settleReauth(ctx: Ctx, user: UserRow, ok: boolean, what: string): void {
    const now = clock()
    const iso = now.toISOString()
    const remote = ctx.transport !== 'ipc'
    const beforeUntil = remote ? user.remoteLockedUntil : user.lockedUntil
    if (beforeUntil && beforeUntil > iso) throw remote ? invalidCredentials() : accountLocked(beforeUntil)
    if (ok) return
    const lockOver = !!beforeUntil && beforeUntil <= iso
    const failedAttempts = (lockOver ? 0 : remote ? user.remoteFailedAttempts : user.failedAttempts) + 1
    const lockedUntil =
      failedAttempts >= maxFailed
        ? new Date(now.getTime() + lockMinutes * 60_000).toISOString()
        : lockOver
          ? null
          : beforeUntil
    const locks = failedAttempts >= maxFailed
    db.transaction((tx) => {
      tx.update(users)
        .set(
          remote
            ? { remoteFailedAttempts: failedAttempts, remoteLockedUntil: lockedUntil, updatedAt: iso }
            : { failedAttempts, lockedUntil, updatedAt: iso }
        )
        .where(eq(users.id, user.id))
        .run()
      const endedSessions = locks
        ? tx
            .update(sessions)
            .set({ revokedAt: iso })
            .where(
              and(
                eq(sessions.userId, user.id),
                eq(sessions.deviceId, ctx.deviceId),
                isNull(sessions.revokedAt)
              )
            )
            .run().changes
        : 0
      writeAudit(
        tx,
        ctx,
        {
          entity: 'user',
          entityId: user.id,
          action: 'reauth_failed',
          after: { what, remote, failedAttempts, lockedUntil, endedSessions }
        },
        now
      )
    })
    if (locks) throw remote ? unauthenticated() : accountLocked(lockedUntil as string)
    throw invalid('errors.wrongPassword')
  }
  /** A right current password clears the wrong-try count of where the call came from (like a sign-in). */
  const clearFailures = (ctx: Ctx) =>
    ctx.transport !== 'ipc'
      ? { remoteFailedAttempts: 0, remoteLockedUntil: null }
      : { failedAttempts: 0, lockedUntil: null }

  type PasswordChange = { user: UserRow; data: z.output<typeof changePasswordInputSchema> }
  const passwordChangeOf = (ctx: Ctx, input: ChangePasswordInput): PasswordChange => ({
    user: requireUser(ctx),
    data: parseInput(changePasswordInputSchema, input)
  })
  function finishPasswordChange(ctx: Ctx, { user }: PasswordChange, passwordHash: string): void {
    inTransaction(deps, ctx, (tx, audit, now) => {
      tx.update(users)
        .set({ passwordHash, mustChange: false, ...clearFailures(ctx), updatedAt: now.toISOString() })
        .where(eq(users.id, user.id))
        .run()
      const endedSessions = revokeUserSessions(tx, user.id, now, ctx.deviceId)
      audit({
        entity: 'user',
        entityId: user.id,
        action: 'update',
        after: { passwordChanged: true, endedSessions }
      })
    })
  }
  /** The new password must be new: a forced change is not passed by typing the given one again (#6). */
  const assertNewPassword = ({ data }: PasswordChange): void => {
    if (data.newPassword.normalize('NFC') === data.currentPassword.normalize('NFC'))
      throw invalid('errors.samePassword')
  }

  type PinChange = { user: UserRow; data: z.output<typeof setPinInputSchema> }
  const pinChangeOf = (ctx: Ctx, input: SetPinInput): PinChange => {
    const user = requireUser(ctx)
    const data = parseInput(setPinInputSchema, input)
    if (user.mustChange) throw mustChangeFirst()
    return { user, data }
  }
  function finishPinChange(ctx: Ctx, { user }: PinChange, pinHash: string): void {
    inTransaction(deps, ctx, (tx, audit, now) => {
      tx.update(users)
        .set({ pinHash, ...clearFailures(ctx), updatedAt: now.toISOString() })
        .where(eq(users.id, user.id))
        .run()
      audit({ entity: 'user', entityId: user.id, action: 'update', after: { pinSet: true } })
    })
  }

  /** Who gets new recovery codes: the caller (own) or an account the caller manages. */
  function codesTarget(ctx: Ctx, userId: string): { target: UserRow; own: boolean } {
    const own = ctx.userId !== null && ctx.userId === userId
    if (!own) requirePermission(ctx, 'settings.users', 'edit')
    const target = db.select().from(users).where(eq(users.id, userId)).get()
    if (!target) throw notFound('user', userId)
    if (!own) assertCovers(ctx, loadRolePermissions(db, target.roleId))
    // Own codes are a way back into the account: an open session alone is not enough, and a password someone
    // else set is changed first (#6).
    else if (target.mustChange) throw mustChangeFirst()
    return { target, own }
  }
  function issueCodes(ctx: Ctx, userId: string, own: boolean): string[] {
    const codes = Array.from({ length: RECOVERY_CODES }, newRecoveryCode)
    inTransaction(deps, ctx, (tx, audit, now) => {
      const iso = now.toISOString()
      const replaced = tx
        .update(recoveryCodes)
        .set({ usedAt: iso })
        .where(and(eq(recoveryCodes.userId, userId), isNull(recoveryCodes.usedAt)))
        .run().changes
      if (own)
        tx.update(users)
          .set({ ...clearFailures(ctx), updatedAt: iso })
          .where(eq(users.id, userId))
          .run()
      tx.insert(recoveryCodes)
        .values(
          codes.map((code) => ({
            id: newId(now),
            userId,
            codeHash: sha256Hex(normalizeRecoveryCode(code)),
            createdAt: iso
          }))
        )
        .run()
      audit({
        entity: 'recovery_codes',
        entityId: userId,
        action: 'create',
        after: { count: codes.length, replaced }
      })
    })
    return codes
  }

  const sessionByToken = (token: unknown): SessionRow | undefined =>
    typeof token === 'string' && token.length >= 32 && token.length <= 128
      ? db
          .select()
          .from(sessions)
          .where(eq(sessions.tokenHash, sha256Hex(token)))
          .get()
      : undefined

  // ── Sign-in steps shared by the desktop (sync) and the server mode (async hashing) ──
  type LoginTarget = { data: z.output<typeof loginInputSchema>; user: UserRow | undefined }
  const loginTarget = (input: LoginInput): LoginTarget => {
    const data = parseInput(loginInputSchema, input)
    const user =
      data.userId !== undefined
        ? db.select().from(users).where(eq(users.id, data.userId)).get()
        : findByUsername(data.username ?? '')
    return { data, user }
  }
  const loginFinish = ({ data, user }: LoginTarget, secretOk: boolean, opts: SignInOptions): SignInResult => {
    const valid = checkCredentials(user, secretOk && user !== undefined, 'password', data.device, opts)
    const result = openSession(valid, 'password', data.device, opts.sessionHours, opts.remote ?? false)
    // The password proves the person: PIN sign-in on this device and for this account works again.
    pinFailures.delete(`device:${pinDeviceKey(data.device)}`)
    pinFailures.delete(`user:${result.userId}`)
    if (opts.ip) pinFailures.delete(`ip:${opts.ip}`)
    return result
  }

  type PinTarget = {
    data: z.output<typeof pinLoginInputSchema>
    user: UserRow | undefined
    deviceKey: string
  }
  const pinTarget = (input: PinLoginInput, opts: SignInOptions): PinTarget => {
    const data = parseInput(pinLoginInputSchema, input)
    const deviceKey = pinDeviceKey(data.device)
    if (pinPaused(deviceKey, data.userId, opts.ip)) throw new AppError('UNAUTHENTICATED', 'errors.pinPaused')
    const user = db.select().from(users).where(eq(users.id, data.userId)).get()
    return { data, user, deviceKey }
  }
  const pinFinish = (
    { data, user, deviceKey }: PinTarget,
    pinOk: boolean,
    opts: SignInOptions
  ): SignInResult => {
    const ok = pinOk && !!user?.pinHash
    try {
      const valid = checkCredentials(user, ok, 'pin', data.device, opts, false)
      return openSession(valid, 'pin', data.device, opts.sessionHours, opts.remote ?? false)
    } catch (error) {
      if (!ok) notePinFailure(deviceKey, data.userId, opts.ip)
      throw error
    }
  }

  type UnlockTarget = { device: ParsedDevice | null; user: UserRow | undefined; wellFormed: boolean }
  const unlockTarget = (userId: string, secret: string, deviceInput: DeviceInfo | null): UnlockTarget => ({
    device: deviceInput ? parseInput(deviceInfoSchema, deviceInput) : null,
    user: db.select().from(users).where(eq(users.id, userId)).get(),
    wellFormed: typeof secret === 'string' && secret.length <= 256
  })
  const unlockFinish = ({ device, user }: UnlockTarget, ok: boolean, opts: SignInOptions = {}): void => {
    // The window counts wrong unlock tries (and signs out after a few); no counter is touched. Over the network the
    // remote lock is the one that applies (N-11, K-45 (2)).
    checkCredentials(user, ok, user?.pinHash ? 'pin' : 'password', device, opts, false)
  }

  type RecoverTarget = {
    data: z.output<typeof recoverInputSchema>
    valid: UserRow
    code: typeof recoveryCodes.$inferSelect | undefined
  }
  /** Checks the code (a sha256 lookup, no scrypt): a wrong one fails like any other sign-in. */
  const recoverTarget = (input: RecoverInput, opts: SignInOptions): RecoverTarget => {
    const data = parseInput(recoverInputSchema, input)
    const user = findByUsername(data.username)
    const codeHash = sha256Hex(normalizeRecoveryCode(data.code))
    const code = user
      ? db
          .select()
          .from(recoveryCodes)
          .where(
            and(
              eq(recoveryCodes.userId, user.id),
              eq(recoveryCodes.codeHash, codeHash),
              isNull(recoveryCodes.usedAt)
            )
          )
          .get()
      : undefined
    const valid = checkCredentials(user, code !== undefined, 'recovery_code', null, opts)
    return { data, valid, code }
  }
  const recoverFinish = ({ valid, code }: RecoverTarget, passwordHash: string): void => {
    // Write gate (no ctx on this path): a replaced main computer sets no new password.
    if (deps.writeGate?.()) throw new AppError('CONFLICT', 'errors.notMainComputer')
    const now = clock()
    const iso = now.toISOString()
    db.transaction((tx) => {
      if (code) tx.update(recoveryCodes).set({ usedAt: iso }).where(eq(recoveryCodes.id, code.id)).run()
      tx.update(users)
        // A forgotten password may mean a known PIN too: the PIN has to be set again.
        .set({
          passwordHash,
          pinHash: null,
          mustChange: false,
          failedAttempts: 0,
          lockedUntil: null,
          remoteFailedAttempts: 0,
          remoteLockedUntil: null,
          updatedAt: iso
        })
        .where(eq(users.id, valid.id))
        .run()
      const endedSessions = revokeUserSessions(tx, valid.id, now)
      appendAudit(
        tx,
        { userId: valid.id, deviceId: null },
        {
          entity: 'user',
          entityId: valid.id,
          action: 'update',
          after: { passwordRecovered: true, endedSessions }
        },
        now
      )
    })
  }

  return {
    /** Username (or picked account) + password sign-in. The token in the result is shown once; only its hash is kept. */
    login(input: LoginInput, opts: SignInOptions = {}): SignInResult {
      const target = loginTarget(input)
      const ok = verifySecret(target.data.secret, target.user?.passwordHash ?? dummyHash())
      return loginFinish(target, ok, opts)
    },

    /** `login` with the password hash computed off the main thread (server mode). */
    async loginAsync(input: LoginInput, opts: SignInOptions = {}): Promise<SignInResult> {
      const target = loginTarget(input)
      const ok = await verifySecretAsync(target.data.secret, target.user?.passwordHash ?? dummyHash())
      return loginFinish(target, ok, opts)
    },

    /** Quick user switch on a shared desk (G-22): pick the user, type the PIN. Same failure counter and lock. */
    /**
     * A wrong PIN does not count toward the account lock (anyone at the desk could lock the owner out with it);
     * instead PIN sign-in pauses for this device after `maxFailed` wrong PINs on any account, and for an account
     * after `maxFailed` wrong PINs from anywhere, for `lockMinutes` — the password still works.
     */
    loginWithPin(input: PinLoginInput, opts: SignInOptions = {}): SignInResult {
      const target = pinTarget(input, opts)
      const ok = verifySecret(target.data.pin, target.user?.pinHash ?? dummyHash())
      return pinFinish(target, ok, opts)
    },

    /** `loginWithPin` with the PIN hash computed off the main thread (server mode). */
    async loginWithPinAsync(input: PinLoginInput, opts: SignInOptions = {}): Promise<SignInResult> {
      const target = pinTarget(input, opts)
      const ok = await verifySecretAsync(target.data.pin, target.user?.pinHash ?? dummyHash())
      return pinFinish(target, ok, opts)
    },

    /**
     * Unlocks a locked window (G-22): the signed-in user's PIN or password. Same failure counter and lock as
     * sign-in (five wrong tries lock the account), no new session.
     */
    unlock(userId: string, secret: string, deviceInput: DeviceInfo | null): void {
      const target = unlockTarget(userId, secret, deviceInput)
      const ok =
        target.wellFormed &&
        (verifySecret(secret, target.user?.passwordHash ?? dummyHash()) ||
          (!!target.user?.pinHash && verifySecret(secret, target.user.pinHash)))
      unlockFinish(target, ok)
    },

    /**
     * `unlock` with the hashes computed off the main thread (server mode). Over the network only the password
     * unlocks (K-45 (2): the PIN is a quick switch at the hotel's own desk, too short for a phone anyone can reach).
     */
    async unlockAsync(
      userId: string,
      secret: string,
      deviceInput: DeviceInfo | null,
      opts: { pin?: boolean; remote?: boolean; network?: RequestNetwork } = {}
    ): Promise<void> {
      const target = unlockTarget(userId, secret, deviceInput)
      const allowPin = opts.pin ?? true
      const ok =
        target.wellFormed &&
        ((await verifySecretAsync(secret, target.user?.passwordHash ?? dummyHash())) ||
          (allowPin && !!target.user?.pinHash && (await verifySecretAsync(secret, target.user.pinHash))))
      unlockFinish(target, ok, opts.remote ? { remote: true, network: opts.network } : {})
    },

    /**
     * Token → who is calling, or null when the token is unknown, expired, revoked, its device was removed or its
     * user deactivated. Refreshes last-seen times (housekeeping, not audited).
     */
    resolveSession(token: string, ip?: string | null): SessionInfo | null {
      const session = sessionByToken(token)
      if (!session) return null
      const now = clock()
      const iso = now.toISOString()
      if (session.revokedAt || session.expiresAt <= iso) return null
      const user = db.select().from(users).where(eq(users.id, session.userId)).get()
      const device = db.select().from(devices).where(eq(devices.id, session.deviceId)).get()
      if (!user || !user.active || !device || device.revokedAt) return null
      // Every request resolves the session: "last seen" is written at most once a minute (or on a new IP). Not
      // audited: a heartbeat, not a change of data. Not behind the write gate either: a replaced computer still
      // answers read-only, and that needs its sessions.
      const stale = (at: string | null): boolean =>
        !at || now.getTime() - Date.parse(at) >= LAST_SEEN_EVERY_MS
      const touchSession = stale(session.lastSeenAt)
      const touchDevice = stale(device.lastSeenAt) || (!!ip && ip !== device.lastIp)
      if (touchSession || touchDevice)
        db.transaction((tx) => {
          if (touchSession)
            tx.update(sessions).set({ lastSeenAt: iso }).where(eq(sessions.id, session.id)).run()
          if (touchDevice)
            tx.update(devices)
              .set({ lastSeenAt: iso, ...(ip ? { lastIp: ip } : {}) })
              .where(eq(devices.id, device.id))
              .run()
        })
      return {
        sessionId: session.id,
        userId: session.userId,
        deviceId: session.deviceId,
        expiresAt: session.expiresAt,
        mustChange: user.mustChange,
        locked: session.lockedAt !== null
      }
    },

    /**
     * A phone or another computer locked (or unlocked) its session (server mode, D3): kept in the session row, so
     * restarting the hotel's computer does not open a locked phone. Housekeeping of this computer's own sign-in
     * table (never copied, not audited, like "last seen"); not behind the write gate: locking must work on a
     * replaced computer too.
     */
    setSessionLock(token: string, locked: boolean): void {
      const session = sessionByToken(token)
      if (!session || session.revokedAt) return
      const lockedAt = locked ? (session.lockedAt ?? clock().toISOString()) : null
      if (lockedAt === session.lockedAt) return
      db.transaction((tx) => {
        tx.update(sessions).set({ lockedAt }).where(eq(sessions.id, session.id)).run()
      })
    },

    /** Ends the caller's own session. False when the token was not an open session. */
    logout(token: string): boolean {
      const session = sessionByToken(token)
      const now = clock()
      if (!session || session.revokedAt || session.expiresAt <= now.toISOString()) return false
      db.transaction((tx) => {
        tx.update(sessions).set({ revokedAt: now.toISOString() }).where(eq(sessions.id, session.id)).run()
        appendAudit(
          tx,
          { userId: session.userId, deviceId: session.deviceId },
          { entity: 'session', entityId: session.id, action: 'logout' },
          now
        )
      })
      return true
    },

    /** Device list with open sessions ("Cihazlar", G-144). */
    listDevices(ctx: Ctx): DeviceView[] {
      requirePermission(ctx, 'devices', 'view')
      const iso = clock().toISOString()
      const open = db
        .select({ session: sessions, userName: users.displayName })
        .from(sessions)
        .innerJoin(users, eq(users.id, sessions.userId))
        .where(and(isNull(sessions.revokedAt), gt(sessions.expiresAt, iso)))
        .orderBy(desc(sessions.lastSeenAt))
        .all()
      return db
        .select()
        .from(devices)
        .orderBy(desc(devices.lastSeenAt))
        .all()
        .map((device) => ({
          ...device,
          sessions: open
            .filter((o) => o.session.deviceId === device.id)
            .map(({ session: { tokenHash: _h, revokedAt: _r, deviceId: _d, ...s }, userName }) => ({
              ...s,
              userName,
              current: s.userId === ctx.userId && device.id === ctx.deviceId
            }))
        }))
    },

    /** Ends one session now. Own sessions need no permission; others' need `devices` edit. */
    revokeSession(ctx: Ctx, sessionId: string): SessionView {
      const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get()
      if (!session || session.userId !== ctx.userId) requirePermission(ctx, 'devices', 'edit')
      if (!session) throw notFound('session', sessionId)
      if (session.revokedAt) return sessionView(session)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        tx.update(sessions).set({ revokedAt: now.toISOString() }).where(eq(sessions.id, sessionId)).run()
        const after = tx.select().from(sessions).where(eq(sessions.id, sessionId)).get() as SessionRow
        audit({ entity: 'session', entityId: sessionId, action: 'cancel', after: sessionView(after) })
        return sessionView(after)
      })
    },

    /** "Bu cihazı çıkar" (G-144): the device and all its sessions stop working immediately. */
    revokeDevice(ctx: Ctx, deviceId: string): DeviceRow {
      requirePermission(ctx, 'devices', 'edit')
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const before = tx.select().from(devices).where(eq(devices.id, deviceId)).get()
        if (!before) throw notFound('device', deviceId)
        const iso = now.toISOString()
        if (!before.revokedAt)
          tx.update(devices).set({ revokedAt: iso, updatedAt: iso }).where(eq(devices.id, deviceId)).run()
        const ended = tx
          .update(sessions)
          .set({ revokedAt: iso })
          .where(and(eq(sessions.deviceId, deviceId), isNull(sessions.revokedAt)))
          .run().changes
        const after = tx.select().from(devices).where(eq(devices.id, deviceId)).get() as DeviceRow
        audit({
          entity: 'device',
          entityId: deviceId,
          action: 'cancel',
          before,
          after: { ...after, endedSessions: ended }
        })
        return after
      })
    },

    /** Own password change; sessions on other devices end (this device stays signed in). */
    changePassword(ctx: Ctx, input: ChangePasswordInput): void {
      const change = passwordChangeOf(ctx, input)
      settleReauth(
        ctx,
        change.user,
        verifySecret(change.data.currentPassword, change.user.passwordHash),
        'password'
      )
      assertNewPassword(change)
      finishPasswordChange(ctx, change, hashSecret(change.data.newPassword))
    },

    /** `changePassword` with the hashes computed off the main thread (server mode, N-2). */
    async changePasswordAsync(ctx: Ctx, input: ChangePasswordInput): Promise<void> {
      const change = passwordChangeOf(ctx, input)
      const ok = await verifySecretAsync(change.data.currentPassword, change.user.passwordHash)
      settleReauth(ctx, change.user, ok, 'password')
      assertNewPassword(change)
      finishPasswordChange(ctx, change, await hashSecretAsync(change.data.newPassword))
    },

    /** Own PIN for the quick user switch; the current password confirms it. */
    setPin(ctx: Ctx, input: SetPinInput): void {
      const change = pinChangeOf(ctx, input)
      settleReauth(
        ctx,
        change.user,
        verifySecret(change.data.currentPassword, change.user.passwordHash),
        'pin'
      )
      finishPinChange(ctx, change, hashSecret(change.data.pin))
    },

    /** `setPin` with the hashes computed off the main thread (server mode, N-2). */
    async setPinAsync(ctx: Ctx, input: SetPinInput): Promise<void> {
      const change = pinChangeOf(ctx, input)
      const ok = await verifySecretAsync(change.data.currentPassword, change.user.passwordHash)
      settleReauth(ctx, change.user, ok, 'pin')
      finishPinChange(ctx, change, await hashSecretAsync(change.data.pin))
    },

    /**
     * Ten one-time recovery codes, returned once (only hashes are kept); earlier unused codes stop working.
     * Own codes need the current password; another user's need `settings.users` edit and at least that user's
     * rights.
     */
    generateRecoveryCodes(ctx: Ctx, userId: string, currentPassword?: string): string[] {
      const { target, own } = codesTarget(ctx, userId)
      if (own)
        settleReauth(ctx, target, verifySecret(currentPassword ?? '', target.passwordHash), 'recovery_codes')
      return issueCodes(ctx, userId, own)
    },

    /** `generateRecoveryCodes` with the password checked off the main thread (server mode, N-2). */
    async generateRecoveryCodesAsync(ctx: Ctx, userId: string, currentPassword?: string): Promise<string[]> {
      const { target, own } = codesTarget(ctx, userId)
      if (own)
        settleReauth(
          ctx,
          target,
          await verifySecretAsync(currentPassword ?? '', target.passwordHash),
          'recovery_codes'
        )
      return issueCodes(ctx, userId, own)
    },

    /**
     * Forgotten password: username + one unused recovery code sets a new password and ends every session.
     * Failures count toward the same lock and look like any other sign-in failure.
     */
    recoverWithCode(input: RecoverInput, opts: SignInOptions = {}): void {
      const target = recoverTarget(input, opts)
      // Same rule as a forced change: the new password must differ from the current one (the code stays unused).
      if (verifySecret(target.data.newPassword, target.valid.passwordHash))
        throw invalid('errors.samePassword')
      recoverFinish(target, hashSecret(target.data.newPassword))
    },

    /** `recoverWithCode` with the new password hashed off the main thread (server mode). */
    async recoverWithCodeAsync(input: RecoverInput, opts: SignInOptions = {}): Promise<void> {
      const target = recoverTarget(input, opts)
      if (await verifySecretAsync(target.data.newPassword, target.valid.passwordHash))
        throw invalid('errors.samePassword')
      recoverFinish(target, await hashSecretAsync(target.data.newPassword))
    },

    /** Open sessions of some users (the device screen); one's own need no permission, others' `devices` view. */
    openSessionsOf(ctx: Ctx, userIds: string[]): SessionView[] {
      if (userIds.some((id) => id !== ctx.userId)) requirePermission(ctx, 'devices', 'view')
      if (userIds.length === 0) return []
      const iso = clock().toISOString()
      return db
        .select()
        .from(sessions)
        .where(
          and(inArray(sessions.userId, userIds), isNull(sessions.revokedAt), gt(sessions.expiresAt, iso))
        )
        .all()
        .map(sessionView)
    }
  }
}

export type AuthService = ReturnType<typeof createAuthService>
