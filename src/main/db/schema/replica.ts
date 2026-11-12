import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { users, devices } from './auth'
import { id } from './columns'

// Faz 13 madde 2–4 (K-19, 03-mimari.md §11): the change log the owner's read-only copy and the encrypted Drive box
// are fed from, and the long-lived grants that let a client computer pull it. Both live only on the computer that
// keeps the hotel's data; neither is copied anywhere (src/main/replica/tables.ts).

/**
 * One row per changed row of a copied table, written by SQLite triggers generated from this schema
 * (src/main/replica/triggers.ts), so a write a service forgets to announce is still copied. `seq` only grows;
 * `epoch` is the main computer's term (`host.epoch`, raised by "Bu bilgisayarı ana bilgisayar yap").
 */
export const changeLog = sqliteTable(
  'change_log',
  {
    seq: integer('seq').primaryKey({ autoIncrement: true }),
    epoch: integer('epoch').notNull(),
    tbl: text('tbl').notNull(),
    /** JSON array of the primary key values. */
    pk: text('pk').notNull(),
    op: text('op', { enum: ['I', 'U', 'D'] }).notNull(),
    /** The whole new row (json_object of every column); null for a delete. */
    rowJson: text('row_json'),
    schemaVersion: integer('schema_version').notNull(),
    ts: text('ts').notNull()
  },
  (t) => [index('change_log_ts_idx').on(t.ts)]
)

/**
 * A client computer (the owner's Mac) may pull the change log with this grant: made once by a signed-in user with
 * `remote.settings` on that device, checked on every pull (user active, role still allowed, device not removed).
 * Only the sha256 of the token is kept; removing the device ends it.
 */
export const replicaGrants = sqliteTable(
  'replica_grants',
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
    lastSeenAt: text('last_seen_at'),
    revokedAt: text('revoked_at')
  },
  (t) => [
    index('replica_grants_token_idx').on(t.tokenHash),
    index('replica_grants_device_idx').on(t.deviceId)
  ]
)
