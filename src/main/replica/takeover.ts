// "Otel bilgisayarı bozuldu mu? Bu bilgisayarı ana bilgisayar yap" (faz-13 madde 5; spike S-D). On the owner's
// computer (client mode with a read-only copy):
//   1. the copy is brought as far as it can go (the caller syncs from the Drive box first);
//   2. the copy becomes this computer's hotel database (a file that was there is kept aside, never deleted), with
//      the next term (`host.epoch` = highest known + 1) and the person's new password — sign-in hashes never leave
//      the old main computer, so everyone else gets a new password from Ayarlar → Kullanıcılar;
//   3. `epoch-<n>.bmr` goes into the box: the old computer, back on, sees it and writes nothing more;
//   4. this computer keeps its own data from now on as the main computer (server mode); the program restarts.
// No automatic merge: what the old computer wrote after `baseSeq` is listed there as conflicting records.
import { existsSync, renameSync } from 'node:fs'
import type Database from 'better-sqlite3'
import { promoteReplica, PromoteError } from '../db/client'
import { AppError } from '../services/errors'
import { hashSecret } from '../services/auth-service'
import { ulid } from '@shared/ids'
import { readState } from './apply'

export interface TakeoverPlan {
  /** The term this computer starts. */
  epoch: number
  previousEpoch: number
  /** Last change of the previous term in the copy. */
  baseSeq: number
}

/** The next term: above the copy's and above any term already announced in the box. */
export function planTakeover(writer: Database.Database, announced: number): TakeoverPlan {
  const state = readState(writer)
  return { epoch: Math.max(state.epoch, announced) + 1, previousEpoch: state.epoch, baseSeq: state.seq }
}

const setting = (db: Database.Database, key: string, value: unknown, at: string): void => {
  db.prepare(
    'INSERT INTO settings (key, value_json, updated_at, updated_by) VALUES (?, ?, ?, NULL) ' +
      'ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at, updated_by = NULL'
  ).run(key, JSON.stringify(value), at)
}

/**
 * Makes `hotelDb` from the copy. A database file already there (this computer kept its own data once) is renamed
 * aside first. Returns the name it was kept under, if any.
 */
export async function promoteCopy(options: {
  writer: Database.Database
  hotelDb: string
  plan: TakeoverPlan
  userId: string
  password: string
  machineName: string
  now: Date
}): Promise<{ keptAside: string | null }> {
  const { plan, now } = options
  const at = now.toISOString()
  let keptAside: string | null = null
  if (existsSync(options.hotelDb)) {
    keptAside = `${options.hotelDb}.onceki-${at.replace(/[:.]/g, '-')}`
    renameSync(options.hotelDb, keptAside)
    for (const suffix of ['-wal', '-shm'])
      if (existsSync(options.hotelDb + suffix)) renameSync(options.hotelDb + suffix, keptAside + suffix)
  }
  const hash = hashSecret(options.password)
  try {
    await promote()
  } catch (error) {
    // Nothing was made: the data this computer kept before goes back where it was.
    if (keptAside && !existsSync(options.hotelDb)) {
      renameSync(keptAside, options.hotelDb)
      for (const suffix of ['-wal', '-shm'])
        if (existsSync(keptAside + suffix)) renameSync(keptAside + suffix, options.hotelDb + suffix)
    }
    if (error instanceof PromoteError)
      throw new AppError('CONFLICT', 'errors.takeoverOrphans', { count: error.count })
    throw error
  }
  return { keptAside }

  function promote(): Promise<void> {
    return promoteReplica(options.writer, options.hotelDb, (db) => {
      setting(db, 'host.epoch', plan.epoch, at)
      setting(db, 'app.mode', 'host', at)
      const changed = db
        .prepare(
          'UPDATE users SET password_hash = ?, must_change = 0, failed_attempts = 0, locked_until = NULL, updated_at = ? WHERE id = ? AND active = 1'
        )
        .run(hash, at, options.userId).changes
      if (changed !== 1) throw new Error('the person taking over is not an active user in the copy')
      // Everyone else signs in again with a password the owner gives (their hashes stayed on the old computer).
      db.prepare(
        "UPDATE users SET must_change = 1, pin_hash = NULL WHERE id <> ? AND password_hash = ''"
      ).run(options.userId)
      db.prepare(
        'INSERT INTO audit_log (id, ts, user_id, device_id, entity, entity_id, action, before_json, after_json, reason) ' +
          "VALUES (?, ?, ?, 'system', 'takeover', ?, 'create', ?, ?, NULL)"
      ).run(
        ulid(now.getTime()),
        at,
        options.userId,
        String(plan.epoch),
        JSON.stringify({ epoch: plan.previousEpoch, seq: plan.baseSeq }),
        JSON.stringify({ epoch: plan.epoch, by: options.machineName })
      )
    })
  }
}
