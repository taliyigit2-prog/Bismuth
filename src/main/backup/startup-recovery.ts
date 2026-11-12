// Recovery from a damaged database at start (Faz 16 madde 2, "çökme sonrası kurtarma"). WAL and synchronous=FULL keep
// a power cut from tearing a write (SQLite replays or drops the last transaction); what is left is a file damaged on
// the disk itself. Then the program cannot open the data (or integrity_check fails) and Settings → Yedek is out of
// reach, so the start offers the newest local backup that unpacks and passes integrity_check. Choosing it only writes
// the usual restore marker: the next start applies it with `applyPendingRestore`, which first copies the damaged files
// to a `bismuth-safety_…` folder — nothing is deleted. No Electron import (the dialog lives in app/startup.ts).
import { createHash } from 'node:crypto'
import { createReadStream, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { integrityOfFile, schemaVersionOfFile } from '../db/client'
import { isEncryptedArchive, readArchive } from './archive'

const BACKUP_DB_NAME = 'bismuth.db'
/** Same name pattern as backup-service.ts: bismuth-yedek-2026-10-04-0400[-elle|-guvenlik][-2].bmy */
const NAME = /^bismuth-yedek-(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(?:-(?:elle|guvenlik))?(?:-(\d+))?\.bmy$/
const STAGING = '.restore'

/** SQLite's own words for a file it cannot use as a database (SQLITE_CORRUPT, SQLITE_NOTADB). */
export function isDamagedDatabaseError(error: unknown): boolean {
  const seen = new Set<unknown>()
  for (let e: unknown = error; e && !seen.has(e); e = (e as { cause?: unknown }).cause) {
    seen.add(e)
    const code = String((e as { code?: unknown }).code ?? '')
    const message = String((e as { message?: unknown }).message ?? '')
    if (/^SQLITE_(CORRUPT|NOTADB)/.test(code)) return true
    if (/file is not a database|database disk image is malformed/i.test(message)) return true
  }
  return false
}

export interface LocalBackup {
  /** File name inside the backups folder. */
  id: string
  /** When it was taken (local time, from the name). */
  at: Date
}

/** Plain local backups (Drive copies are encrypted and need the key), newest first. */
export function localBackups(backupsDir: string): LocalBackup[] {
  if (!existsSync(backupsDir)) return []
  const out: LocalBackup[] = []
  for (const name of readdirSync(backupsDir)) {
    const m = NAME.exec(name)
    if (!m) continue
    const at = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]))
    try {
      if (isEncryptedArchive(join(backupsDir, name))) continue
    } catch {
      continue
    }
    out.push({ id: name, at })
  }
  // Same minute: "-2" was taken after the plain name.
  const seq = (id: string): number => Number(NAME.exec(id)?.[6] ?? 1)
  return out.sort((a, b) => b.at.getTime() - a.at.getTime() || seq(b.id) - seq(a.id))
}

async function sha256Of(path: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer)
  return hash.digest('hex')
}

const pad = (n: number): string => String(n).padStart(2, '0')
const stamp = (d: Date): string =>
  `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`

export interface RecoveryOptions {
  backupsDir: string
  markerPath: string
  /** Migrations this program knows: a backup from a newer program is not offered. */
  programSchemaVersion: number
  now?: Date
}

/** The backup a recovery would restore, already unpacked and checked; nothing is scheduled yet. */
export interface PreparedRecovery {
  backup: LocalBackup
  /** Writes the restore marker: the next start restores this backup. */
  schedule: () => Promise<void>
  /** The person said no: the unpacked copy goes. */
  discard: () => void
}

/**
 * Unpacks the newest usable local backup (whole, integrity_check "ok", not made by a newer program). A backup that
 * fails is skipped for the next older one. Null when none is usable. Run before the question, so the question names
 * the backup that will really be restored (QA2c #5).
 */
export async function prepareRecoveryRestore(opts: RecoveryOptions): Promise<PreparedRecovery | null> {
  const now = opts.now ?? new Date()
  for (const backup of localBackups(opts.backupsDir)) {
    const rel = join(STAGING, `recovery-${stamp(now)}`)
    const dir = join(opts.backupsDir, rel)
    rmSync(dir, { recursive: true, force: true })
    mkdirSync(dir, { recursive: true })
    try {
      await readArchive(join(opts.backupsDir, backup.id), dir)
      const db = join(dir, BACKUP_DB_NAME)
      if (
        !existsSync(db) ||
        integrityOfFile(db) !== 'ok' ||
        schemaVersionOfFile(db) > opts.programSchemaVersion
      )
        throw new Error('unusable backup')
      const sha256 = await sha256Of(db)
      return {
        backup,
        schedule: async () => {
          writeFileSync(
            opts.markerPath,
            JSON.stringify({
              backupId: backup.id,
              dir: rel,
              sha256,
              requestedAt: now.toISOString(),
              requestedBy: null
            })
          )
        },
        discard: () => rmSync(dir, { recursive: true, force: true })
      }
    } catch {
      rmSync(dir, { recursive: true, force: true })
    }
  }
  return null
}

/**
 * Unpacks the newest usable local backup and writes the restore marker for the next start (prepare + schedule).
 * Null when none is usable.
 */
export async function scheduleRecoveryRestore(opts: RecoveryOptions): Promise<LocalBackup | null> {
  const prepared = await prepareRecoveryRestore(opts)
  if (!prepared) return null
  await prepared.schedule()
  return prepared.backup
}
