// Users and roles (03-mimari.md §4.1, §5; G-20…G-25, K-38): the three-level permission matrix per role, user
// accounts with their initial password, and the Ctx of a signed-in user. Rules: the owner role always has
// every right and cannot be changed; nobody grants or manages more than they hold themselves (assertCovers);
// the last active owner account cannot be switched off. Sign-in itself is auth-service.
import { and, asc, eq, isNull, ne } from 'drizzle-orm'
import * as z from 'zod'
import {
  passwordSchema,
  pinSchema,
  roleInputSchema,
  roleUpdateSchema,
  userInputSchema,
  userUpdateSchema,
  usernameSchema,
  type RemoteAccess,
  type RoleInput,
  type RoleUpdate,
  type UserInput,
  type UserUpdate
} from '@shared/contract/users'
import { nameKey } from '@shared/name-key'
import { PERMISSION_KEYS, type PermissionKey, type PermissionLevel } from '@shared/permissions'
import type { DbOrTx } from '../db/client'
import { employees, recoveryCodes, rolePermissions, roles, taskTemplates, tasks, users } from '../db/schema'
import type { I18nText } from '../db/schema/columns'
import type { AuditEntry } from './audit'
import {
  assertCovers,
  hashSecret,
  loadRolePermissions,
  remoteAccessOf,
  revokeUserSessions,
  type RequestNetwork
} from './auth-service'
import { ctxFromPermissions, ctxKind, type Ctx } from './context'
import { permissionDenied } from './errors'
import {
  assertNameFree,
  conflict,
  inTransaction,
  notFound,
  newId,
  parseInput,
  requirePermission,
  stamps,
  type ServiceDeps,
  type Tx
} from './kit'

export type RoleRow = typeof roles.$inferSelect

const firstOwnerSchema = z.object({
  username: usernameSchema,
  displayName: z.string().trim().min(1).max(80),
  password: passwordSchema,
  pin: pinSchema.nullish()
})
type UserRow = typeof users.$inferSelect

export interface RoleView extends RoleRow {
  displayName: I18nText | null
  permissions: Record<PermissionKey, PermissionLevel>
  /** The owner role: every right, not editable. */
  locked: boolean
  userCount: number
}

/** A role as the account form offers it (Ayarlar → Kullanıcılar, without the role editor's rights). */
export interface RoleChoice {
  id: string
  code: string | null
  name: string
  displayName: I18nText | null
  locked: boolean
  /** The caller holds at least the role's rights, so may give it to an account. */
  assignable: boolean
}

/** A user without secrets (no password/PIN hash ever leaves the service). */
export type UserView = Omit<UserRow, 'passwordHash' | 'pinHash'> & {
  hasPin: boolean
  roleCode: string | null
}

type Reader = Pick<Tx, 'select'>
type AuditFn = (entry: AuditEntry) => void

const toUserView = ({ passwordHash: _p, pinHash, ...rest }: UserRow, roleCode: string | null): UserView => ({
  ...rest,
  hasPin: pinHash !== null,
  roleCode
})

function roleOf(db: Reader, id: string): RoleRow {
  const row = db.select().from(roles).where(eq(roles.id, id)).get()
  if (!row) throw notFound('role', id)
  return row
}

/** The roles still in use (a removed role's name may be used again). */
const activeRoles = (db: Reader): RoleRow[] => db.select().from(roles).where(isNull(roles.archivedAt)).all()

/** Usernames are stored lower-cased; "SAHIP" and "sahip" (dotless ı folded to i) are still one name. */
function usernameTaken(db: Reader, username: string): boolean {
  const key = nameKey(username)
  return db
    .select({ username: users.username })
    .from(users)
    .all()
    .some((u) => nameKey(u.username) === key)
}

function userOf(db: Reader, id: string): UserRow {
  const row = db.select().from(users).where(eq(users.id, id)).get()
  if (!row) throw notFound('user', id)
  return row
}

/** Ctx of a signed-in user from their role's matrix; null when the account is missing or switched off. */
export function ctxForUser(
  db: DbOrTx,
  userId: string,
  deviceId: string,
  transport: Ctx['transport'],
  /** HTTP only: where the request came from (server/net.ts); missing counts as the private network. */
  network?: RequestNetwork
): Ctx | null {
  const user = db.select().from(users).where(eq(users.id, userId)).get()
  if (!user || !user.active) return null
  // A role kept to the hotel's own computers loses an open remote session too, not only the next sign-in; a role
  // kept to the hotel's local network loses it on the private network.
  if (transport === 'http') {
    const access = remoteAccessOf(db, user.roleId)
    if (access === 'off' || (access === 'lan' && network !== 'lan')) return null
  }
  // A password set by someone else must be changed first: until then the account can do nothing else.
  if (user.mustChange) return { userId, deviceId, transport, can: () => false }
  return ctxFromPermissions(userId, deviceId, transport, loadRolePermissions(db, user.roleId))
}

/** Who is signed in, for the shell: the account (no secrets), its role's name and the full matrix. */
export function describeUser(
  db: DbOrTx,
  userId: string
): {
  user: {
    id: string
    username: string
    displayName: string
    roleId: string
    roleCode: string | null
    roleName: string
    roleNameI18n: I18nText | null
    hasPin: boolean
    mustChange: boolean
  }
  permissions: Record<PermissionKey, PermissionLevel>
} | null {
  const user = db.select().from(users).where(eq(users.id, userId)).get()
  if (!user || !user.active) return null
  const role = db.select().from(roles).where(eq(roles.id, user.roleId)).get()
  return {
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      roleId: user.roleId,
      roleCode: role?.code ?? null,
      roleName: role?.name ?? '',
      roleNameI18n: role?.nameI18n ?? null,
      hasPin: user.pinHash !== null,
      mustChange: user.mustChange
    },
    // Until the password is changed the account may do nothing else (ctxForUser): the shell shows no screens.
    permissions: user.mustChange
      ? (Object.fromEntries(PERMISSION_KEYS.map((k) => [k, 'none'])) as Record<
          PermissionKey,
          PermissionLevel
        >)
      : loadRolePermissions(db, user.roleId)
  }
}

/**
 * The sign-in screen's list (public): active accounts by name. Over HTTP only roles that may sign in from outside
 * are listed (server mode, Faz 13).
 */
export function signInUsers(
  db: DbOrTx,
  transport: Ctx['transport']
): { id: string; displayName: string; roleName: string; roleNameI18n: I18nText | null; hasPin: boolean }[] {
  return db
    .select({
      id: users.id,
      displayName: users.displayName,
      pinHash: users.pinHash,
      roleName: roles.name,
      roleNameI18n: roles.nameI18n,
      remoteAllowed: roles.remoteAllowed,
      remoteAccess: roles.remoteAccess
    })
    .from(users)
    .innerJoin(roles, eq(roles.id, users.roleId))
    .where(eq(users.active, true))
    .orderBy(asc(users.displayName))
    .all()
    .filter((u) => transport === 'ipc' || (u.remoteAllowed && u.remoteAccess !== 'off'))
    .map(({ pinHash, remoteAllowed: _r, remoteAccess: _a, ...u }) => ({ ...u, hasPin: pinHash !== null }))
}

/** The three-way choice from an input: `remoteAccess` wins; else `remoteAllowed` true → anywhere, false → off. */
const remoteAccessFrom = (data: {
  remoteAccess?: RemoteAccess | undefined
  remoteAllowed?: boolean | undefined
}): RemoteAccess | undefined =>
  data.remoteAccess ??
  (data.remoteAllowed === undefined ? undefined : data.remoteAllowed ? 'anywhere' : 'off')

export function createUsersService(deps: ServiceDeps) {
  const { db } = deps

  const roleView = (r: RoleRow): RoleView => ({
    ...r,
    /** Seeded roles keep their translations until renamed (the rename clears them). */
    displayName: r.nameI18n,
    permissions: loadRolePermissions(db, r.id),
    locked: r.code === 'owner',
    userCount: db.select({ id: users.id }).from(users).where(eq(users.roleId, r.id)).all().length
  })

  /** The employee card is linked through `employees.user_id` only (`users.employee_id` is unused). */
  const userView = (tx: Reader, u: UserRow): UserView =>
    toUserView(
      {
        ...u,
        employeeId:
          tx.select({ id: employees.id }).from(employees).where(eq(employees.userId, u.id)).get()?.id ?? null
      },
      tx.select({ code: roles.code }).from(roles).where(eq(roles.id, u.roleId)).get()?.code ?? null
    )

  /** Links the account to one employee card (or none); a card already linked to someone else is refused. */
  const linkEmployee = (
    tx: Tx,
    audit: AuditFn,
    now: Date,
    userId: string,
    employeeId: string | null
  ): void => {
    const current = tx.select().from(employees).where(eq(employees.userId, userId)).get()
    if ((current?.id ?? null) === employeeId) return
    if (employeeId) {
      const target = tx.select().from(employees).where(eq(employees.id, employeeId)).get()
      if (!target) throw notFound('employee', employeeId)
      if (target.userId && target.userId !== userId)
        throw conflict('errors.employeeHasUser', { userId: target.userId })
    }
    const iso = now.toISOString()
    if (current) {
      tx.update(employees).set({ userId: null, updatedAt: iso }).where(eq(employees.id, current.id)).run()
      audit({
        entity: 'employee',
        entityId: current.id,
        action: 'update',
        before: { userId },
        after: { userId: null }
      })
    }
    if (employeeId) {
      tx.update(employees).set({ userId, updatedAt: iso }).where(eq(employees.id, employeeId)).run()
      audit({
        entity: 'employee',
        entityId: employeeId,
        action: 'update',
        before: { userId: null },
        after: { userId }
      })
    }
  }

  /** Writes the full matrix of a role (keys not given are `none` on create, unchanged on update). */
  const writeMatrix = (
    tx: Tx,
    roleId: string,
    levels: Partial<Record<PermissionKey, PermissionLevel>>
  ): void => {
    for (const key of PERMISSION_KEYS) {
      const level = levels[key]
      if (level === undefined) continue
      tx.insert(rolePermissions)
        .values({ roleId, permission: key, level })
        .onConflictDoUpdate({ target: [rolePermissions.roleId, rolePermissions.permission], set: { level } })
        .run()
    }
  }

  /** Managing an account requires covering its role's rights (a manager cannot reset the owner's password). */
  const assertManages = (ctx: Ctx, user: UserRow): void =>
    assertCovers(ctx, loadRolePermissions(db, user.roleId))

  const activeOwners = (tx: Reader, exceptUserId?: string): number =>
    tx
      .select({ id: users.id })
      .from(users)
      .innerJoin(roles, eq(roles.id, users.roleId))
      .where(
        and(
          eq(roles.code, 'owner'),
          eq(users.active, true),
          exceptUserId ? ne(users.id, exceptUserId) : undefined
        )
      )
      .all().length

  return {
    /** Who is signed in (no ctx: the caller's own session decides who). */
    describe: (userId: string) => describeUser(db, userId),
    /** The sign-in screen's list (public). */
    signInList: (transport: Ctx['transport']) => signInUsers(db, transport),

    // ---- roles (settings.roles) ----

    listRoles(ctx: Ctx): RoleView[] {
      requirePermission(ctx, 'settings.roles', 'view')
      return db
        .select()
        .from(roles)
        .where(isNull(roles.archivedAt))
        .orderBy(asc(roles.createdAt))
        .all()
        .map(roleView)
    },

    /**
     * The roles an account can be given, for whoever manages accounts (`settings.users`) without seeing the role
     * editor (Faz 4 bug hunt #13): names only, and whether the caller may assign it (no more rights than their own).
     */
    roleChoices(ctx: Ctx): RoleChoice[] {
      requirePermission(ctx, 'settings.users', 'view')
      return db
        .select()
        .from(roles)
        .where(isNull(roles.archivedAt))
        .orderBy(asc(roles.createdAt))
        .all()
        .map((r) => {
          let assignable = true
          try {
            assertCovers(ctx, loadRolePermissions(db, r.id))
          } catch {
            assignable = false
          }
          return {
            id: r.id,
            code: r.code,
            name: r.name,
            displayName: r.nameI18n,
            locked: r.code === 'owner',
            assignable
          }
        })
    },

    /** A new role ("Gece resepsiyonu"); its levels may not exceed the caller's own. */
    createRole(ctx: Ctx, input: RoleInput): RoleView {
      requirePermission(ctx, 'settings.roles', 'edit')
      const data = parseInput(roleInputSchema, input)
      const permissions = data.permissions ?? {}
      assertCovers(ctx, permissions)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        assertNameFree(activeRoles(tx), data.name)
        const row: RoleRow = {
          id: newId(now),
          name: data.name,
          isSystem: false,
          description: data.description ?? null,
          code: null,
          nameI18n: null,
          tasksOwnOnly: data.tasksOwnOnly ?? false,
          remoteAllowed: (remoteAccessFrom(data) ?? 'anywhere') !== 'off',
          remoteAccess: remoteAccessFrom(data) ?? 'anywhere',
          archivedAt: null,
          ...stamps(now)
        }
        tx.insert(roles).values(row).run()
        const full = Object.fromEntries(PERMISSION_KEYS.map((k) => [k, permissions[k] ?? 'none'])) as Record<
          PermissionKey,
          PermissionLevel
        >
        writeMatrix(tx, row.id, full)
        audit({ entity: 'role', entityId: row.id, action: 'create', after: { ...row, permissions: full } })
        return roleView(row)
      })
    },

    /** Rename (drops a seeded name's translations), describe or change levels; the owner role is locked. */
    updateRole(ctx: Ctx, id: string, patch: RoleUpdate): RoleView {
      requirePermission(ctx, 'settings.roles', 'edit')
      const data = parseInput(roleUpdateSchema, patch)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const before = roleOf(tx, id)
        if (before.archivedAt) throw notFound('role', id)
        // The owner role is fixed: every right, and where it signs in from too (the role editor shows it locked;
        // Faz 4 bug hunt #14). Remote sign-in is the server mode's own setting, not a matter of the role.
        if (before.code === 'owner') throw conflict('errors.ownerRoleLocked')
        if (data.name !== undefined && nameKey(data.name) !== nameKey(before.name))
          assertNameFree(activeRoles(tx), data.name, id)
        const remoteAccess = remoteAccessFrom(data)
        const beforeLevels = loadRolePermissions(tx, id)
        // Changing a role's rights is managing every holder of it: the caller must cover both old and new.
        assertCovers(ctx, beforeLevels)
        if (data.permissions) assertCovers(ctx, data.permissions)
        tx.update(roles)
          .set({
            ...(data.name !== undefined ? { name: data.name, nameI18n: null } : {}),
            ...(data.description !== undefined ? { description: data.description ?? null } : {}),
            ...(data.tasksOwnOnly !== undefined ? { tasksOwnOnly: data.tasksOwnOnly } : {}),
            ...(remoteAccess !== undefined ? { remoteAccess, remoteAllowed: remoteAccess !== 'off' } : {}),
            updatedAt: now.toISOString()
          })
          .where(eq(roles.id, id))
          .run()
        if (data.permissions) writeMatrix(tx, id, data.permissions)
        const after = roleOf(tx, id)
        audit({
          entity: 'role',
          entityId: id,
          action: 'update',
          before: { ...before, permissions: beforeLevels },
          after: { ...after, permissions: loadRolePermissions(tx, id) }
        })
        return roleView(after)
      })
    },

    /**
     * "Rolü kaldır": a role no account, open task or active repeating task uses leaves every list. It is archived,
     * not deleted, so seeds never bring a removed hazır rol back and old audit rows still name it. The owner role
     * stays.
     */
    deleteRole(ctx: Ctx, id: string): void {
      requirePermission(ctx, 'settings.roles', 'edit')
      inTransaction(deps, ctx, (tx, audit, now) => {
        const before = roleOf(tx, id)
        if (before.code === 'owner') throw conflict('errors.ownerRoleLocked')
        if (before.archivedAt) return
        const holders = tx.select({ id: users.id }).from(users).where(eq(users.roleId, id)).all().length
        const openTasks = tx
          .select({ id: tasks.id })
          .from(tasks)
          .where(and(eq(tasks.assigneeRoleId, id), eq(tasks.status, 'open')))
          .all().length
        const templates = tx
          .select({ id: taskTemplates.id })
          .from(taskTemplates)
          .where(and(eq(taskTemplates.assigneeRoleId, id), eq(taskTemplates.active, true)))
          .all().length
        if (holders + openTasks + templates > 0)
          throw conflict('errors.roleInUse', { users: holders, tasks: openTasks + templates })
        assertCovers(ctx, loadRolePermissions(tx, id))
        const iso = now.toISOString()
        tx.update(roles).set({ archivedAt: iso, updatedAt: iso }).where(eq(roles.id, id)).run()
        audit({ entity: 'role', entityId: id, action: 'archive', before, after: { archivedAt: iso } })
      })
    },

    // ---- users (settings.users) ----

    listUsers(ctx: Ctx, opts: { includeInactive?: boolean } = {}): UserView[] {
      requirePermission(ctx, 'settings.users', 'view')
      const q = db.select().from(users)
      return (opts.includeInactive ? q : q.where(eq(users.active, true)))
        .orderBy(asc(users.displayName))
        .all()
        .map((u) => userView(db, u))
    },

    /**
     * The owner account the setup wizard creates (G-10): only while no account exists at all. The owner chose the
     * password, so it need not be changed; a PIN is optional (quick switch, G-22).
     */
    createFirstOwner(
      ctx: Ctx,
      input: { username: string; displayName: string; password: string; pin?: string | null }
    ): UserView {
      if (ctxKind(ctx) !== 'setup' && ctxKind(ctx) !== 'system') throw permissionDenied()
      const data = parseInput(firstOwnerSchema, input)
      const passwordHash = hashSecret(data.password)
      const pinHash = data.pin ? hashSecret(data.pin) : null
      return inTransaction(deps, ctx, (tx, audit, now) => {
        if (tx.select({ id: users.id }).from(users).limit(1).get()) throw conflict('errors.setupDone')
        const owner = tx.select().from(roles).where(eq(roles.code, 'owner')).get()
        if (!owner) throw notFound('role', 'owner')
        const row: UserRow = {
          id: newId(now),
          username: data.username,
          displayName: data.displayName,
          roleId: owner.id,
          employeeId: null,
          passwordHash,
          pinHash,
          mustChange: false,
          active: true,
          lastLoginAt: null,
          failedAttempts: 0,
          lockedUntil: null,
          remoteFailedAttempts: 0,
          remoteLockedUntil: null,
          ...stamps(now)
        }
        tx.insert(users).values(row).run()
        const view = userView(tx, row)
        audit({ entity: 'user', entityId: row.id, action: 'create', after: view })
        return view
      })
    },

    /** New account with an initial password the user must change at first sign-in. */
    createUser(ctx: Ctx, input: UserInput): UserView {
      requirePermission(ctx, 'settings.users', 'edit')
      const data = parseInput(userInputSchema, input)
      if (roleOf(db, data.roleId).archivedAt) throw notFound('role', data.roleId)
      assertCovers(ctx, loadRolePermissions(db, data.roleId))
      const passwordHash = hashSecret(data.password)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        if (usernameTaken(tx, data.username))
          throw conflict('errors.usernameTaken', { username: data.username })
        const row: UserRow = {
          id: newId(now),
          username: data.username,
          displayName: data.displayName,
          roleId: data.roleId,
          employeeId: null,
          passwordHash,
          pinHash: null,
          mustChange: true,
          active: true,
          lastLoginAt: null,
          failedAttempts: 0,
          lockedUntil: null,
          remoteFailedAttempts: 0,
          remoteLockedUntil: null,
          ...stamps(now)
        }
        tx.insert(users).values(row).run()
        if (data.employeeId) linkEmployee(tx, audit, now, row.id, data.employeeId)
        const view = userView(tx, row)
        audit({ entity: 'user', entityId: row.id, action: 'create', after: view })
        return view
      })
    },

    updateUser(ctx: Ctx, id: string, patch: UserUpdate): UserView {
      requirePermission(ctx, 'settings.users', 'edit')
      const data = parseInput(userUpdateSchema, patch)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const before = userOf(tx, id)
        assertManages(ctx, before)
        if (data.roleId && data.roleId !== before.roleId) {
          const target = roleOf(tx, data.roleId)
          if (target.archivedAt) throw notFound('role', data.roleId)
          assertCovers(ctx, loadRolePermissions(tx, target.id))
          const wasOwner = roleOf(tx, before.roleId).code === 'owner'
          if (wasOwner && target.code !== 'owner' && before.active && activeOwners(tx, id) === 0)
            throw conflict('errors.lastOwner')
        }
        const beforeView = userView(tx, before)
        const { employeeId, ...fields } = data
        tx.update(users)
          .set({ ...fields, updatedAt: now.toISOString() })
          .where(eq(users.id, id))
          .run()
        if (employeeId !== undefined) linkEmployee(tx, audit, now, id, employeeId)
        const after = userOf(tx, id)
        if (data.roleId && data.roleId !== before.roleId) revokeUserSessions(tx, id, now)
        const view = userView(tx, after)
        audit({ entity: 'user', entityId: id, action: 'update', before: beforeView, after: view })
        return view
      })
    },

    /** Sets a new password for someone who forgot theirs; they must change it at sign-in, sessions end. */
    resetPassword(ctx: Ctx, id: string, password: string): UserView {
      requirePermission(ctx, 'settings.users', 'edit')
      if (ctx.userId !== null && ctx.userId === id) throw conflict('errors.useChangePassword')
      const secret = parseInput(passwordSchema, password)
      const target = userOf(db, id)
      assertManages(ctx, target)
      const passwordHash = hashSecret(secret)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        tx.update(users)
          .set({
            passwordHash,
            pinHash: null,
            mustChange: true,
            failedAttempts: 0,
            lockedUntil: null,
            remoteFailedAttempts: 0,
            remoteLockedUntil: null,
            updatedAt: now.toISOString()
          })
          .where(eq(users.id, id))
          .run()
        const ended = revokeUserSessions(tx, id, now)
        // The person's unused recovery codes go too (#6): whoever reset the password should not leave a second
        // way in; the person makes new ones after choosing their own password.
        const droppedCodes = tx
          .update(recoveryCodes)
          .set({ usedAt: now.toISOString() })
          .where(and(eq(recoveryCodes.userId, id), isNull(recoveryCodes.usedAt)))
          .run().changes
        audit({
          entity: 'user',
          entityId: id,
          action: 'update',
          after: { passwordReset: true, endedSessions: ended, droppedRecoveryCodes: droppedCodes }
        })
        return userView(tx, userOf(tx, id))
      })
    },

    /** Switching an account off ends its sessions at once; the last active owner cannot be switched off. */
    setActive(ctx: Ctx, id: string, active: boolean): UserView {
      requirePermission(ctx, 'settings.users', 'edit')
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const before = userOf(tx, id)
        assertManages(ctx, before)
        if (!active && roleOf(tx, before.roleId).code === 'owner' && activeOwners(tx, id) === 0)
          throw conflict('errors.lastOwner')
        tx.update(users).set({ active, updatedAt: now.toISOString() }).where(eq(users.id, id)).run()
        if (!active) revokeUserSessions(tx, id, now)
        const view = userView(tx, userOf(tx, id))
        audit({
          entity: 'user',
          entityId: id,
          action: active ? 'restore' : 'cancel',
          before: userView(tx, before),
          after: view
        })
        return view
      })
    },

    /** The matrix in force for a user (the UI hides what the user cannot do; the services decide). */
    permissionsOf(ctx: Ctx, userId: string): Record<PermissionKey, PermissionLevel> {
      if (ctx.userId !== userId) requirePermission(ctx, 'settings.users', 'view')
      return loadRolePermissions(db, userOf(db, userId).roleId)
    }
  }
}

export type UsersService = ReturnType<typeof createUsersService>
