// Face rows of the camera module (Faz 20 P20c; K-51…K-53): who is in the house now, which sealed face rows a guest has,
// and how they leave. K-52: a face row is deleted for real (not voided) when the guest checks out, when its keep-until
// date passes, or when staff delete it; every delete writes an `audit_log` row without the sealed bytes.
// These are plain functions over a transaction so the reservation service can release faces inside the same
// transaction as a check-out.
import { localDateOf } from '@shared/date'
import { and, eq, gte, inArray, isNotNull, isNull, lt, lte, or } from 'drizzle-orm'
import {
  cameraEvents,
  employees,
  guestFaces,
  guests,
  reservationRooms,
  rooms,
  staffFaces,
  stayOccupants
} from '../db/schema'
import type { BismuthDb } from '../db/client'
import type { AuditEntry } from './audit'
import { readSetting } from './settings-service'

type Reader = Pick<BismuthDb, 'select'>
type Writer = Pick<BismuthDb, 'select' | 'update' | 'delete' | 'insert'>
type AuditFn = (entry: AuditEntry) => void

/** The most face rows one guest may have (a few angles; the sidecar compares against every one). */
export const MAX_FACES_PER_GUEST = 5
/** The most face rows one staff member may have. */
export const MAX_FACES_PER_STAFF = 3

export interface InHouseGuest {
  guestId: string
  name: string
  room: string
  reservationId: string
}

/** Guests who are in the house now (arrived, not left, in an in-house stay), one row per guest; names in `Intl` order is the caller's. */
export function inHouseGuests(db: Reader): InHouseGuest[] {
  const rows = db
    .select({
      guestId: stayOccupants.guestId,
      first: guests.firstName,
      last: guests.lastName,
      room: rooms.number,
      reservationId: reservationRooms.reservationId
    })
    .from(stayOccupants)
    .innerJoin(reservationRooms, eq(reservationRooms.id, stayOccupants.reservationRoomId))
    .innerJoin(rooms, eq(rooms.id, reservationRooms.roomId))
    .innerJoin(guests, eq(guests.id, stayOccupants.guestId))
    .where(
      and(
        isNotNull(stayOccupants.guestId),
        isNotNull(stayOccupants.arrivedAt),
        isNull(stayOccupants.leftAt),
        eq(reservationRooms.status, 'in_house')
      )
    )
    .all()
  const seen = new Map<string, InHouseGuest>()
  for (const r of rows) {
    if (r.guestId && !seen.has(r.guestId))
      seen.set(r.guestId, {
        guestId: r.guestId,
        name: `${r.first} ${r.last}`.trim(),
        room: r.room,
        reservationId: r.reservationId
      })
  }
  return [...seen.values()]
}

/** Whether the guest is in the house now. */
export function isInHouse(db: Reader, guestId: string): boolean {
  return inHouseGuests(db).some((g) => g.guestId === guestId)
}

/** A face row that goes with an in-house guest: what the sidecar needs to know them (the sealed vector is opened later). */
export interface ActiveFaceRow {
  id: string
  guestId: string
  name: string
  room: string
}

/** The faces the sidecar should watch for: rows of guests who are in the house now. Label data only, nothing sealed. */
export function activeFaces(db: Reader): ActiveFaceRow[] {
  const here = new Map(inHouseGuests(db).map((g) => [g.guestId, g]))
  if (here.size === 0) return []
  const rows = db
    .select({ id: guestFaces.id, guestId: guestFaces.guestId })
    .from(guestFaces)
    .where(inArray(guestFaces.guestId, [...here.keys()]))
    .all()
  return rows
    .map((r) => {
      const g = here.get(r.guestId)
      return g ? { id: r.id, guestId: r.guestId, name: g.name, room: g.room } : null
    })
    .filter((r): r is ActiveFaceRow => r !== null)
    .sort((a, b) => a.id.localeCompare(b.id))
}

const addDaysIso = (now: Date, days: number): string =>
  new Date(now.getTime() + days * 86_400_000).toISOString()

/** Deletes one face row for real (K-52) and records it, without the sealed bytes. */
export function deleteFaceRow(
  tx: Writer,
  audit: AuditFn,
  row: { id: string; guestId: string; model: string },
  reason: string
): void {
  tx.delete(guestFaces).where(eq(guestFaces.id, row.id)).run()
  audit({
    entity: 'guest_face',
    entityId: row.id,
    action: 'delete',
    before: { guestId: row.guestId, model: row.model },
    reason
  })
}

/**
 * Faces of guests who are no longer in the house (K-52): `camera.faceRetentionDays` = 0 deletes them now; more gives
 * them a keep-until date. `guestIds` limits the pass to those guests (a check-out), `undefined` looks at every guest
 * with a face (the retention job: a way out the check-out did not see, e.g. a check-in taken back).
 */
export function releaseFaces(tx: Writer, audit: AuditFn, now: Date, guestIds?: readonly string[]): number {
  if (guestIds && guestIds.length === 0) return 0
  const where = guestIds ? inArray(guestFaces.guestId, [...guestIds]) : undefined
  const rows = tx
    .select({
      id: guestFaces.id,
      guestId: guestFaces.guestId,
      model: guestFaces.model,
      expiresAt: guestFaces.expiresAt
    })
    .from(guestFaces)
    .where(where)
    .all()
  if (rows.length === 0) return 0
  const here = new Set(inHouseGuests(tx).map((g) => g.guestId))
  const retention = readSetting(tx, 'camera.faceRetentionDays')
  let released = 0
  for (const row of rows) {
    if (here.has(row.guestId)) continue
    if (retention === 0) {
      deleteFaceRow(tx, audit, row, 'checkout')
      released++
    } else if (row.expiresAt === null) {
      const expiresAt = addDaysIso(now, retention)
      tx.update(guestFaces)
        .set({ expiresAt, updatedAt: now.toISOString() })
        .where(eq(guestFaces.id, row.id))
        .run()
      audit({
        entity: 'guest_face',
        entityId: row.id,
        action: 'update',
        before: { expiresAt: null },
        after: { expiresAt },
        reason: 'checkout'
      })
      released++
    }
  }
  return released
}

export interface PurgeResult {
  faces: number
  crops: number
  /** Staff faces removed because the person left the hotel. */
  staff: number
}

/** A staff face row's id and owner as the sidecar sync needs them (S-107). */
export interface StaffFaceRow {
  id: string
  employeeId: string
}

/** Employed on `today`: an active record with no end date, or the end date has not passed. */
export const employedOn = (today: string) =>
  and(eq(employees.active, true), or(isNull(employees.endDate), gte(employees.endDate, today)))

/** Deletes one staff face row for real (K-52, S-107) and records it, without the sealed bytes. */
export function deleteStaffFaceRow(
  tx: Writer,
  audit: AuditFn,
  row: { id: string; employeeId: string; model: string },
  reason: string
): void {
  tx.delete(staffFaces).where(eq(staffFaces.id, row.id)).run()
  audit({
    entity: 'staff_face',
    entityId: row.id,
    action: 'delete',
    before: { employeeId: row.employeeId, model: row.model },
    reason
  })
}

/** The staff faces the sidecar should know as "staff, no alarm": rows of people still employed. Nothing sealed. */
export function activeStaffFaces(db: Reader, now: Date): StaffFaceRow[] {
  return db
    .select({ id: staffFaces.id, employeeId: staffFaces.employeeId })
    .from(staffFaces)
    .innerJoin(employees, eq(employees.id, staffFaces.employeeId))
    .where(employedOn(localDateOf(now)))
    .all()
    .sort((a, b) => a.id.localeCompare(b.id))
}

/**
 * The retention job (K-52): faces past their keep-until date go, faces of guests who left without the check-out seeing
 * it are released, and the sealed crops of alarms older than `camera.alertRetentionDays` are emptied (the event row
 * stays). Staff faces of people who left the hotel go too (S-107). Faces and crops each write their own audit rows;
 * the crops one summary row with the count.
 *
 * A guest who is in the house is never touched: a keep-until date left from an earlier stay (a guest who came back)
 * is cleared first, so the new stay's face cannot be deleted under the guest; the check-out sets a fresh date.
 */
export function purgeExpired(tx: Writer, audit: AuditFn, now: Date): PurgeResult {
  const iso = now.toISOString()
  let faces = 0
  const here = new Set(inHouseGuests(tx).map((g) => g.guestId))
  const dated = tx
    .select({
      id: guestFaces.id,
      guestId: guestFaces.guestId,
      model: guestFaces.model,
      expiresAt: guestFaces.expiresAt
    })
    .from(guestFaces)
    .where(isNotNull(guestFaces.expiresAt))
    .all()
  for (const row of dated) {
    if (here.has(row.guestId)) {
      tx.update(guestFaces).set({ expiresAt: null, updatedAt: iso }).where(eq(guestFaces.id, row.id)).run()
      audit({
        entity: 'guest_face',
        entityId: row.id,
        action: 'update',
        before: { expiresAt: row.expiresAt },
        after: { expiresAt: null },
        reason: 'back in house'
      })
    } else if (row.expiresAt !== null && row.expiresAt <= iso) {
      deleteFaceRow(tx, audit, row, 'retention')
      faces++
    }
  }
  faces += releaseFaces(tx, audit, now)
  // Staff who left the hotel: their face has no reason to be kept.
  const gone = tx
    .select({ id: staffFaces.id, employeeId: staffFaces.employeeId, model: staffFaces.model })
    .from(staffFaces)
    .innerJoin(employees, eq(employees.id, staffFaces.employeeId))
    .where(
      or(
        eq(employees.active, false),
        and(isNotNull(employees.endDate), lt(employees.endDate, localDateOf(now)))
      )
    )
    .all()
  for (const row of gone) deleteStaffFaceRow(tx, audit, row, 'staff-left')
  // One statement: no id list (parameter limit), and the cleared rows leave the expiry index scan.
  const crops = tx
    .update(cameraEvents)
    .set({ cropEnc: null, expiresAt: null, guestId: null, updatedAt: iso })
    .where(
      and(
        isNotNull(cameraEvents.cropEnc),
        isNotNull(cameraEvents.expiresAt),
        lte(cameraEvents.expiresAt, iso)
      )
    )
    .run().changes
  // KVKK: an event with no sealed picture left keeps no link to a guest either (the row stays, the field is cleared).
  const unlinked = tx
    .update(cameraEvents)
    .set({ guestId: null, updatedAt: iso })
    .where(and(isNull(cameraEvents.cropEnc), isNotNull(cameraEvents.guestId)))
    .run().changes
  // One summary entry: only the count, never the sealed bytes (K-52).
  if (unlinked > 0)
    audit({
      entity: 'camera_event',
      entityId: 'retention-unlink',
      action: 'update',
      after: { unlinked },
      reason: 'retention'
    })
  if (crops > 0)
    audit({
      entity: 'camera_event',
      entityId: 'retention',
      action: 'delete',
      after: { crops },
      reason: 'retention'
    })
  return { faces, crops, staff: gone.length }
}
