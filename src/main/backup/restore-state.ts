// What a restore leaves behind for the screens (P14fix #4, #12): a restore that could not be applied at start is
// remembered next to the marker (`restore-pending.json.failed`) until someone has seen it, and the copy of the data
// taken just before a restore was applied (`bismuth-safety_…`, holding what was entered between "Geri yükle" and
// the restart) is listed as a backup like any other.
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const SAFETY_PREFIX = 'bismuth-safety_'

export type RestoreFailureReason = 'checksum' | 'missing' | 'invalid' | 'io'

export interface RestoreFailureRecord {
  /** The backup that was to come back (null when the marker could not be read). */
  id: string | null
  reason: RestoreFailureReason
  failedAt: string
}

export const failureFileOf = (markerPath: string): string => `${markerPath}.failed`

/** Moves the marker aside as a failure record (what, why, when); the restore is not tried again. */
export function recordRestoreFailure(markerPath: string, reason: RestoreFailureReason, now: Date): void {
  let id: string | null = null
  try {
    const marker = JSON.parse(readFileSync(markerPath, 'utf8')) as { backupId?: unknown }
    id = typeof marker.backupId === 'string' ? marker.backupId : null
  } catch {
    // unreadable marker: the reason says so
  }
  const record: RestoreFailureRecord = { id, reason, failedAt: now.toISOString() }
  writeFileSync(failureFileOf(markerPath), JSON.stringify(record))
  rmSync(markerPath, { force: true })
}

const REASONS: readonly string[] = ['checksum', 'missing', 'invalid', 'io']

/** The failure waiting to be seen, if any (a file of the earlier version, a renamed marker, reads as "invalid"). */
export function readRestoreFailure(markerPath: string): RestoreFailureRecord | null {
  const file = failureFileOf(markerPath)
  if (!existsSync(file)) return null
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<RestoreFailureRecord> & {
      backupId?: unknown
    }
    if (typeof parsed.reason === 'string' && REASONS.includes(parsed.reason))
      return {
        id: typeof parsed.id === 'string' ? parsed.id : null,
        reason: parsed.reason as RestoreFailureReason,
        failedAt: typeof parsed.failedAt === 'string' ? parsed.failedAt : statSync(file).mtime.toISOString()
      }
    return {
      id: typeof parsed.backupId === 'string' ? parsed.backupId : null,
      reason: 'invalid',
      failedAt: statSync(file).mtime.toISOString()
    }
  } catch {
    return { id: null, reason: 'invalid', failedAt: statSync(file).mtime.toISOString() }
  }
}

export const clearRestoreFailure = (markerPath: string): void =>
  rmSync(failureFileOf(markerPath), { force: true })

/** `bismuth-safety_20261004-090102` → its local time. */
function stampTime(name: string): Date | null {
  const m = /^bismuth-safety_(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/.exec(name)
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]))
}

function folderBytes(dir: string): number {
  let total = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) total += folderBytes(path)
    else if (entry.isFile()) total += statSync(path).size
  }
  return total
}

/** The safety copies of applied restores, newest first. */
export function safetyFolders(backupsDir: string): { name: string; at: Date; sizeBytes: number }[] {
  if (!existsSync(backupsDir)) return []
  const out: { name: string; at: Date; sizeBytes: number }[] = []
  for (const name of readdirSync(backupsDir)) {
    const at = stampTime(name)
    const dir = join(backupsDir, name)
    if (!at || !existsSync(join(dir, 'bismuth.db'))) continue
    try {
      out.push({ name, at, sizeBytes: folderBytes(dir) })
    } catch {
      // removed meanwhile
    }
  }
  return out.sort((a, b) => b.at.getTime() - a.at.getTime())
}

export const isSafetyFolderName = (name: string): boolean => stampTime(name) !== null
