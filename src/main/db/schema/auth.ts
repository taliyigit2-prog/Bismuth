import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { bool, i18nJson, id, timestamps } from './columns'

// Users, roles and the three-level permission matrix (03-mimari.md §4.1, §5; G-20…G-23).
// Screens and flows arrive in Faz 4; Faz 1 creates the tables so later migrations only add.

export const roles = sqliteTable(
  'roles',
  {
    id: id(),
    name: text('name').notNull(),
    isSystem: bool('is_system').notNull().default(false),
    description: text('description'),
    ...timestamps,
    /** System role code (owner, manager, …); null for roles the owner creates. Added in 0001. */
    code: text('code'),
    /** Translated name of a seeded role; cleared when the owner renames it. Added in 0001. */
    nameI18n: i18nJson('name_i18n_json'),
    /** Its users see only tasks given to them or to the role (K-38: Temizlik, Çalışan). Added in 0002. */
    tasksOwnOnly: bool('tasks_own_only').notNull().default(false),
    /** Its users may sign in from outside the hotel's computers (server mode, Faz 13). Added in 0005. */
    remoteAllowed: bool('remote_allowed').notNull().default(true),
    /**
     * Where from (Faz 13, 0010): anywhere | lan (the hotel's local network only) | off. `remote_allowed` is kept in
     * step (= not off) for older readers; 0010 filled it from remote_allowed (1 → anywhere, 0 → off).
     */
    remoteAccess: text('remote_access', { enum: ['anywhere', 'lan', 'off'] })
      .notNull()
      .default('anywhere'),
    /** "Rolü kaldır": the role leaves every list but its rows stay (seeds never bring it back). Added in 0006. */
    archivedAt: text('archived_at')
  },
  (t) => [uniqueIndex('roles_code_unique').on(t.code)]
)

export const rolePermissions = sqliteTable(
  'role_permissions',
  {
    roleId: text('role_id')
      .notNull()
      .references(() => roles.id),
    permission: text('permission').notNull(),
    level: text('level', { enum: ['none', 'view', 'edit'] }).notNull()
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permission] })]
)

export const users = sqliteTable(
  'users',
  {
    id: id(),
    username: text('username').notNull(),
    displayName: text('display_name').notNull(),
    roleId: text('role_id')
      .notNull()
      .references(() => roles.id),
    /** Unused: the account's employee card is `employees.user_id` (one link, kept in one place). */
    employeeId: text('employee_id'),
    passwordHash: text('password_hash').notNull(),
    pinHash: text('pin_hash'),
    mustChange: bool('must_change').notNull().default(false),
    active: bool('active').notNull().default(true),
    lastLoginAt: text('last_login_at'),
    failedAttempts: integer('failed_attempts').notNull().default(0),
    lockedUntil: text('locked_until'),
    /**
     * Wrong passwords over the network (phones, other computers; K-45 (2)): counted apart, so a stranger on the
     * network locks only the remote sign-in, never the hotel's own window.
     */
    remoteFailedAttempts: integer('remote_failed_attempts').notNull().default(0),
    remoteLockedUntil: text('remote_locked_until'),
    ...timestamps
  },
  (t) => [uniqueIndex('users_username_unique').on(t.username)]
)

export const devices = sqliteTable('devices', {
  id: id(),
  name: text('name').notNull(),
  kind: text('kind', { enum: ['desktop', 'browser', 'mobile'] }).notNull(),
  platform: text('platform'),
  firstSeenAt: text('first_seen_at').notNull(),
  lastSeenAt: text('last_seen_at').notNull(),
  lastIp: text('last_ip'),
  trusted: bool('trusted').notNull().default(false),
  revokedAt: text('revoked_at'),
  ...timestamps
})

export const sessions = sqliteTable(
  'sessions',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    deviceId: text('device_id')
      .notNull()
      .references(() => devices.id),
    tokenHash: text('token_hash').notNull(),
    createdAt: text('created_at').notNull(),
    lastSeenAt: text('last_seen_at').notNull(),
    expiresAt: text('expires_at').notNull(),
    revokedAt: text('revoked_at'),
    /** A phone or other computer locked by its user (server mode): stays locked across a restart of the host (D3). */
    lockedAt: text('locked_at')
  },
  (t) => [uniqueIndex('sessions_token_hash_unique').on(t.tokenHash), index('sessions_user_idx').on(t.userId)]
)

export const recoveryCodes = sqliteTable(
  'recovery_codes',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    codeHash: text('code_hash').notNull(),
    usedAt: text('used_at'),
    createdAt: text('created_at').notNull()
  },
  (t) => [index('recovery_codes_user_idx').on(t.userId)]
)
