// Who may pull the change log (faz-13 madde 3, 10). A client computer (the owner's Mac) asks once, through a window
// signed in on it with `remote.settings` (Ayarlar → Uzaktan erişim): the main computer gives it a long random token,
// keeps only its sha256 and ties it to that person and that device. Every pull checks again: the person is active,
// the role may still see `remote.settings` and may reach the server from where the request comes, the device was not
// removed ("Cihazı çıkar" ends the copy too). No token → 401; a token that no longer allows it → 403. The copy is
// read-only; identity numbers go only to a person whose role may see them (`guests.identity`).
import { createHash, randomBytes } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'
import type { BismuthDb } from '../db/client'
import { devices, replicaGrants } from '../db/schema'
import { writeAudit } from '../services/audit'
import type { Ctx } from '../services/context'
import { writeRefusal } from '../services/kit'
import { ulid } from '@shared/ids'
import type { RequestNetwork } from '../services/auth-service'
import { ctxForUser } from '../services/users-service'

const sha256Hex = (value: string): string => createHash('sha256').update(value).digest('hex')

/**
 * A new grant for this person on this device (an earlier one of the device ends). Behind the services' write gate:
 * a read-only context or a replaced main computer hands out no copy grants.
 */
export function createGrant(
  db: BismuthDb,
  ctx: Ctx,
  now: Date,
  writeGate?: () => 'replaced' | null
): { token: string; userId: string } {
  const refusal = writeRefusal(writeGate ? { writeGate } : {}, ctx)
  if (refusal) throw refusal
  if (!ctx.userId) throw new Error('grant without a user')
  const userId = ctx.userId
  const token = randomBytes(32).toString('base64url')
  const at = now.toISOString()
  db.transaction((tx) => {
    tx.update(replicaGrants)
      .set({ revokedAt: at })
      .where(and(eq(replicaGrants.deviceId, ctx.deviceId), isNull(replicaGrants.revokedAt)))
      .run()
    const id = ulid(now.getTime())
    tx.insert(replicaGrants)
      .values({ id, userId, deviceId: ctx.deviceId, tokenHash: sha256Hex(token), createdAt: at })
      .run()
    writeAudit(
      tx,
      ctx,
      { entity: 'replica_grant', entityId: id, action: 'create', after: { deviceId: ctx.deviceId } },
      now
    )
  })
  return { token, userId }
}

export type GrantCheck =
  { ok: true; userId: string; deviceId: string; identity: boolean } | { ok: false; status: 401 | 403 }

/** The token of a pull: who it stands for now, or why not. */
export function checkGrant(
  db: BismuthDb,
  token: string | null,
  network: RequestNetwork,
  now: Date
): GrantCheck {
  if (!token || token.length > 200) return { ok: false, status: 401 }
  const grant = db
    .select()
    .from(replicaGrants)
    .where(and(eq(replicaGrants.tokenHash, sha256Hex(token)), isNull(replicaGrants.revokedAt)))
    .get()
  if (!grant) return { ok: false, status: 401 }
  const device = db.select().from(devices).where(eq(devices.id, grant.deviceId)).get()
  if (!device || device.revokedAt) return { ok: false, status: 401 }
  const ctx = ctxForUser(db, grant.userId, grant.deviceId, 'http', network)
  if (!ctx || !ctx.can('remote.settings', 'view')) return { ok: false, status: 403 }
  // Bookkeeping of the grant ("last pulled"), not hotel data: written even on a replaced computer (its feed stays
  // readable for the copies), without audit, like a session's "last seen".
  db.update(replicaGrants).set({ lastSeenAt: now.toISOString() }).where(eq(replicaGrants.id, grant.id)).run()
  return {
    ok: true,
    userId: grant.userId,
    deviceId: grant.deviceId,
    identity: ctx.can('guests.identity', 'view')
  }
}
