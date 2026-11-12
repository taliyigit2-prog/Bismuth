// Snapshot the live database before schema migrations (idea and naming from electron-db, MIT — see
// THIRD_PARTY_NOTICES.md). SQLite's online backup API copies a consistent image even with WAL pages
// that are not yet checkpointed. Daily and Drive backups: services/backup-service.ts (Faz 14, K-32). How many of
// these copies stay is the setting `backup.preMigrationKeep` (G-09; 10 by default), read straight from the
// database because it is not open through the services yet.
import { mkdirSync, readdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import type Database from 'better-sqlite3'

export const PRE_MIGRATION_PREFIX = 'bismuth-pre-migration_'
const DEFAULT_KEEP = 10

/** The `backup.preMigrationKeep` setting of this database (default 10; an old database has no settings table). */
export function preMigrationKeepOf(sqlite: Database.Database): number {
  try {
    const row = sqlite
      .prepare('select value_json as v from settings where key = ?')
      .get('backup.preMigrationKeep') as { v: string } | undefined
    const value: unknown = row ? JSON.parse(row.v) : DEFAULT_KEEP
    return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 100
      ? value
      : DEFAULT_KEEP
  } catch {
    return DEFAULT_KEEP
  }
}

function stamp(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

export async function backupBeforeMigration(
  sqlite: Database.Database,
  backupDir: string,
  appVersion: string,
  now: Date = new Date()
): Promise<string> {
  mkdirSync(backupDir, { recursive: true })
  const safeVersion = appVersion.replace(/[^0-9A-Za-z.-]/g, '_')
  const path = join(backupDir, `${PRE_MIGRATION_PREFIX}${safeVersion}_${stamp(now)}.db`)
  await sqlite.backup(path)
  prunePreMigration(backupDir, preMigrationKeepOf(sqlite))
  return path
}

/** The pre-migration copies in `backupDir`, oldest first. */
export const preMigrationFiles = (backupDir: string): string[] =>
  readdirSync(backupDir)
    .filter((f) => f.startsWith(PRE_MIGRATION_PREFIX) && f.endsWith('.db'))
    .sort((a, b) => (a.slice(-18) < b.slice(-18) ? -1 : a.slice(-18) > b.slice(-18) ? 1 : a < b ? -1 : 1))

/** Keeps the newest `keep` copies. Returns how many were removed. */
export function prunePreMigration(backupDir: string, keep: number): number {
  const files = preMigrationFiles(backupDir)
  const old = files.slice(0, Math.max(0, files.length - keep))
  for (const f of old) unlinkSync(join(backupDir, f))
  return old.length
}
