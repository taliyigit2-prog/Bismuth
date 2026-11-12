import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { id } from './columns'

/** Append-only audit trail: who, from which device, when, what changed (G-24, CLAUDE.md yasak 11). */
export const auditLog = sqliteTable(
  'audit_log',
  {
    id: id(),
    ts: text('ts').notNull(),
    userId: text('user_id'),
    deviceId: text('device_id'),
    entity: text('entity').notNull(),
    entityId: text('entity_id').notNull(),
    action: text('action').notNull(),
    beforeJson: text('before_json'),
    afterJson: text('after_json'),
    reason: text('reason')
  },
  (t) => [index('audit_log_ts_idx').on(t.ts), index('audit_log_entity_idx').on(t.entity, t.entityId)]
)
