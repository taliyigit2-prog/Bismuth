import { blob, index, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { id, timestamps } from './columns'
import { guests } from './guests'
import { reservations } from './reservations'
import { employees } from './staff'
import { users } from './auth'

// Camera module data (Faz 20, K-51…K-53, K-58), added in 0021. Biometric: a face vector and a crop are special
// category personal data, so:
//   - the vector and every crop are sealed with AES-256-GCM (`src/main/camera/crypto.ts`) before they reach a row:
//     these columns never hold a readable picture or vector;
//   - the two tables never leave this computer: no backup, export, read-only copy or Drive box carries them
//     (`BIOMETRIC_TABLES` in `src/main/backup/biometric.ts`, `LOCAL_ONLY_TABLES` in `replica/tables.ts`);
//   - K-52 EXCEPTION to "data is never deleted" (CLAUDE.md Yasak 11): rows here are physically deleted at check-out,
//     at the end of `camera.faceRetentionDays` and, for event crops, `camera.alertRetentionDays`. Every write and every
//     delete still goes through the service layer in a transaction with an `audit_log` row (without the sealed bytes);
//   - `staff_faces` (0022, S-107): staff who are excluded from alarms. Their face is sealed the same way and is only
//     compared to tell "staff, no alarm" from "unknown"; no name or room goes to the sidecar and no picture is kept;
//     rows are deleted when the person is taken off the list or leaves the hotel;
//   - there is no consent column (K-58: the owner's lawyer found the notice enough); who enrolled a face and when is
//     `enrolled_by` / `enrolled_at`.

/** One enrolled face of a guest (K-53: enrolled from the Guests tab, never typed into the camera panel). */
export const guestFaces = sqliteTable(
  'guest_faces',
  {
    id: id(),
    guestId: text('guest_id')
      .notNull()
      .references(() => guests.id),
    /** The stay it was enrolled for; the vector goes at check-out / retention end. */
    reservationId: text('reservation_id').references(() => reservations.id),
    /** Sealed face vector (version byte + iv + tag + ciphertext). */
    embeddingEnc: blob('embedding_enc', { mode: 'buffer' }).notNull(),
    /** Sealed face crop shown on the guest card; null when no picture is kept. */
    cropEnc: blob('crop_enc', { mode: 'buffer' }),
    /** Recognition model name and version, e.g. `buffalo_s@0.7`: vectors of different models are never compared. */
    model: text('model').notNull(),
    modelVersion: text('model_version'),
    /** ISO 8601 UTC. */
    enrolledAt: text('enrolled_at').notNull(),
    enrolledBy: text('enrolled_by')
      .notNull()
      .references(() => users.id),
    /** ISO 8601 UTC; null = until check-out. The retention job deletes rows past it. */
    expiresAt: text('expires_at'),
    ...timestamps
  },
  (t) => [
    index('guest_faces_guest_idx').on(t.guestId),
    index('guest_faces_reservation_idx').on(t.reservationId),
    index('guest_faces_expires_idx').on(t.expiresAt)
  ]
)

/** Something the cameras saw: an alarm (unknown person), a recognised guest, … (`kind` is open for later kinds). */
export const cameraEvents = sqliteTable(
  'camera_events',
  {
    id: id(),
    /** `alarm` | `recognized` | … (a text, not a list: the sidecar adds kinds). */
    kind: text('kind').notNull(),
    /** ISO 8601 UTC. */
    occurredAt: text('occurred_at').notNull(),
    /** What the staff did with it: `new` | `seen` | `handled`. */
    state: text('state').notNull().default('new'),
    /** The sidecar's track number of the person (not an identity). */
    trackRef: text('track_ref'),
    /** The sidecar's own row key (id + time), so the same alarm is not stored twice; null for events made here. */
    sourceRef: text('source_ref'),
    guestId: text('guest_id').references(() => guests.id),
    /** Sealed crop; deleted (set null) at `expires_at` while the event row stays (K-52). */
    cropEnc: blob('crop_enc', { mode: 'buffer' }),
    /** ISO 8601 UTC: when the crop goes (`occurred_at` + `camera.alertRetentionDays`); null = no crop kept. */
    expiresAt: text('expires_at'),
    seenBy: text('seen_by').references(() => users.id),
    seenAt: text('seen_at'),
    handledBy: text('handled_by').references(() => users.id),
    handledAt: text('handled_at'),
    ...timestamps
  },
  (t) => [
    index('camera_events_occurred_idx').on(t.occurredAt),
    index('camera_events_state_idx').on(t.state, t.occurredAt),
    index('camera_events_guest_idx').on(t.guestId),
    index('camera_events_expires_idx').on(t.expiresAt),
    uniqueIndex('camera_events_source_unique').on(t.sourceRef)
  ]
)

/**
 * A staff member on the exclusion list (S-107, K-58): the cameras see staff too, and an unknown face raises an alarm,
 * so the person's face is known to the sidecar as "staff" (no name, no room, no alarm). Only a sealed vector is kept,
 * never a picture. Deleted for real when the person is removed from the list or leaves (K-52), with an audit row.
 */
export const staffFaces = sqliteTable(
  'staff_faces',
  {
    id: id(),
    employeeId: text('employee_id')
      .notNull()
      .references(() => employees.id),
    /** Sealed face vector (version byte + iv + tag + ciphertext). */
    embeddingEnc: blob('embedding_enc', { mode: 'buffer' }).notNull(),
    model: text('model').notNull(),
    modelVersion: text('model_version'),
    /** ISO 8601 UTC. */
    enrolledAt: text('enrolled_at').notNull(),
    enrolledBy: text('enrolled_by')
      .notNull()
      .references(() => users.id),
    ...timestamps
  },
  (t) => [index('staff_faces_employee_idx').on(t.employeeId)]
)
