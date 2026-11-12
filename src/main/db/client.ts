// The only place that opens SQLite (CLAUDE.md "Kod kuralları"; .claude/rules/db.md).
// Adapted from electron-db `src/main/db/index.ts` (MIT, © 2026 Arjune Mirchandani — THIRD_PARTY_NOTICES.md):
// pending-migration count, backup before migrating, MigrationError carrying the backup path.
// Changes: no Electron import (paths are passed in, so tests and the server harness can use it),
// integrity check on open, synchronous=FULL (the hotel PC may lose power), busy_timeout, ULID-free.
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { Worker } from 'node:worker_threads'
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import * as schema from './schema'
import { backupBeforeMigration } from '../backup/pre-migration'
import { dropChangeLog, installChangeLog } from '../replica/triggers'

export type BismuthDb = BetterSQLite3Database<typeof schema>
/** A database or an open transaction — what write helpers accept so they can join the caller's transaction. */
export type DbOrTx = BismuthDb | Parameters<Parameters<BismuthDb['transaction']>[0]>[0]

export interface OpenDatabaseOptions {
  /** Database file path, or ':memory:' for tests. */
  file: string
  /** Folder with drizzle-kit migrations (`drizzle/` in dev, `resources/drizzle` when packaged). */
  migrationsFolder: string
  /** Where pre-migration backups go; omitted → no backup (tests, in-memory). */
  backupDir?: string
  appVersion?: string
  /**
   * Install the change-log triggers after migrating (default true): the hotel's database feeds the owner's read-only
   * copy and the Drive box (Faz 13). Restore checks open copies read-only and never get them.
   */
  changeLog?: boolean
}

export interface DatabaseHandle {
  sqlite: Database.Database
  db: BismuthDb
  file: string
  /** Number of applied migrations (drizzle journal entries). */
  schemaVersion: number
  /** Result of PRAGMA integrity_check on open ("ok" when healthy). */
  integrity: string
  /** Backup written before this open's migrations, if any. */
  backupPath: string | null
  sqliteVersion: string
  close(): void
}

export class MigrationError extends Error {
  readonly backupPath: string | null

  constructor(cause: unknown, backupPath: string | null) {
    super(cause instanceof Error ? cause.message : String(cause), { cause })
    this.name = 'MigrationError'
    this.backupPath = backupPath
  }
}

function journalLength(folder: string): number {
  const journal = join(folder, 'meta', '_journal.json')
  if (!existsSync(journal)) throw new Error(`migrations journal not found: ${journal}`)
  const parsed = JSON.parse(readFileSync(journal, 'utf8')) as { entries?: unknown[] }
  return parsed.entries?.length ?? 0
}

function appliedMigrations(sqlite: Database.Database): number {
  try {
    const row = sqlite.prepare('select count(*) as c from __drizzle_migrations').get() as { c: number }
    return row.c
  } catch {
    return 0 // table not created yet → nothing applied
  }
}

function applyPragmas(sqlite: Database.Database): void {
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('synchronous = FULL')
  sqlite.pragma('foreign_keys = ON')
  sqlite.pragma('busy_timeout = 5000')
}

export async function openDatabase(options: OpenDatabaseOptions): Promise<DatabaseHandle> {
  const inMemory = options.file === ':memory:'
  const existedBefore = !inMemory && existsSync(options.file)
  const sqlite = new Database(options.file)
  try {
    applyPragmas(sqlite)
    const integrity = String(sqlite.pragma('integrity_check', { simple: true }))
    const db = drizzle(sqlite, { schema })

    const pending = journalLength(options.migrationsFolder) - appliedMigrations(sqlite)
    // A damaged file is not migrated (a migration would rewrite tables over broken pages and the copy taken before
    // it would be just as broken): stop here, as a damaged file that does not open at all, so the start offers the
    // newest backup (Faz 16 recovery). Without pending migrations it opens and warns (G-01: work goes on).
    if (pending > 0 && integrity !== 'ok')
      throw Object.assign(
        new Error(
          `database disk image is malformed (integrity_check before migration: ${integrity.slice(0, 200)})`
        ),
        { code: 'SQLITE_CORRUPT' }
      )
    let backupPath: string | null = null
    if (existedBefore && pending > 0 && options.backupDir) {
      backupPath = await backupBeforeMigration(sqlite, options.backupDir, options.appVersion ?? '0.0.0')
    }
    // A migration's own row rewrites are not logged half-way: the triggers go first and come back after (a copy with
    // another data version takes a fresh snapshot anyway).
    if (pending > 0) dropChangeLog(sqlite)
    try {
      migrate(db, { migrationsFolder: options.migrationsFolder })
    } catch (error) {
      throw new MigrationError(error, backupPath)
    }
    if (options.changeLog !== false) installChangeLog(sqlite, appliedMigrations(sqlite))

    const sqliteVersion = (sqlite.prepare('select sqlite_version() as v').get() as { v: string }).v
    return {
      sqlite,
      db,
      file: options.file,
      schemaVersion: appliedMigrations(sqlite),
      integrity,
      backupPath,
      sqliteVersion,
      close: () => sqlite.close()
    }
  } catch (error) {
    sqlite.close()
    throw error
  }
}

/** PRAGMA integrity_check of a database file opened read-only ("ok" when healthy): backups and restores. */
export function integrityOfFile(file: string): string {
  const db = new Database(file, { readonly: true, fileMustExist: true })
  try {
    return String(db.pragma('integrity_check', { simple: true }))
  } finally {
    db.close()
  }
}

/** Applied migrations of a database file opened read-only (0 when it has none): restore refuses a newer copy. */
export function schemaVersionOfFile(file: string): number {
  const db = new Database(file, { readonly: true, fileMustExist: true })
  try {
    return appliedMigrations(db)
  } finally {
    db.close()
  }
}

// ---- the same checks in a worker thread (P14fix #6) -------------------------------------------------------------
// A backup copy is checked while the program is in use (the missed morning backup runs in the afternoon): on the
// main thread a large file's integrity_check would hold every window's call for its whole length. The worker opens
// its own read-only connection (better-sqlite3 works in worker threads). Its source is a string, so the build needs
// no second entry; the module is required by its real path (in a packaged program better-sqlite3 is unpacked from
// the asar archive: `asarUnpack` in electron-builder.yml). If a worker cannot start, the check runs here as before.

const CHECK_WORKER = `
const { parentPort, workerData } = require('node:worker_threads')
let value
try {
  const Database = require(workerData.module)
  const db = new Database(workerData.file, { readonly: true, fileMustExist: true })
  try {
    if (workerData.task === 'integrity') value = String(db.pragma('integrity_check', { simple: true }))
    else {
      try {
        value = db.prepare('select count(*) as c from __drizzle_migrations').get().c
      } catch {
        value = 0
      }
    }
  } finally {
    db.close()
  }
} catch (error) {
  parentPort.postMessage({ ok: false, message: String((error && error.message) || error) })
  return
}
parentPort.postMessage({ ok: true, value })
`

/** better-sqlite3's entry file on disk (outside the asar archive when packaged). */
function sqliteModulePath(): string {
  const path = createRequire(import.meta.url).resolve('better-sqlite3')
  return path.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1')
}

class WorkerUnavailable extends Error {}

function inWorker<T>(task: 'integrity' | 'schemaVersion', file: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let worker: Worker
    try {
      worker = new Worker(`(() => {${CHECK_WORKER}})()`, {
        eval: true,
        workerData: { task, file, module: sqliteModulePath() }
      })
    } catch (error) {
      reject(new WorkerUnavailable(String(error)))
      return
    }
    let settled = false
    worker.once('message', (m: { ok: boolean; value?: T; message?: string }) => {
      settled = true
      if (m.ok) resolve(m.value as T)
      else reject(new Error(m.message))
      void worker.terminate()
    })
    worker.once('error', (error) => {
      if (settled) return
      settled = true
      reject(new WorkerUnavailable(String(error)))
    })
    worker.once('exit', () => {
      if (!settled) reject(new WorkerUnavailable('worker exited'))
    })
  })
}

async function offThread<T>(task: 'integrity' | 'schemaVersion', file: string, here: () => T): Promise<T> {
  try {
    return await inWorker<T>(task, file)
  } catch (error) {
    if (error instanceof WorkerUnavailable) return here()
    throw error
  }
}

/**
 * Folds a copied database's write-ahead log into the file (P14fix #12: a copy taken of the live files before a
 * restore was applied may carry a `-wal` file; restore and its checksum read the main file only).
 */
export function mergeWalOf(file: string): void {
  if (!existsSync(`${file}-wal`)) return
  const db = new Database(file, { fileMustExist: true })
  try {
    db.pragma('wal_checkpoint(TRUNCATE)')
    db.pragma('journal_mode = DELETE')
  } finally {
    db.close()
  }
}

/** `integrityOfFile` in a worker thread: the main process keeps answering meanwhile. */
export const integrityOfFileAsync = (file: string): Promise<string> =>
  offThread('integrity', file, () => integrityOfFile(file))

/** `schemaVersionOfFile` in a worker thread. */
export const schemaVersionOfFileAsync = (file: string): Promise<number> =>
  offThread('schemaVersion', file, () => schemaVersionOfFile(file))

/**
 * The term (`host.epoch`) a hotel database file was written in; 0 when the file or the setting is missing or
 * unreadable. A restore starts the next term above both files' (backup-service `noteRestored`).
 */
export function termOfFile(file: string): number {
  if (!existsSync(file)) return 0
  try {
    const db = new Database(file, { readonly: true, fileMustExist: true })
    try {
      const row = db.prepare("SELECT value_json FROM settings WHERE key = 'host.epoch'").get() as
        { value_json: string } | undefined
      const n = row ? Number(JSON.parse(row.value_json)) : 1
      return Number.isInteger(n) && n > 0 ? n : 1
    } finally {
      db.close()
    }
  } catch {
    return 0
  }
}

/** The read-only copy could not become the hotel's database: rows pointing at missing rows (`orphans`). */
export class PromoteError extends Error {
  constructor(
    readonly reason: 'orphans',
    readonly count: number
  ) {
    super(`promoted copy: ${count} rows point at missing rows`)
    this.name = 'PromoteError'
  }
}

/**
 * Takeover (Faz 13, "Bu bilgisayarı ana bilgisayar yap"): a consistent copy of the read-only copy becomes this
 * computer's hotel database at `target`; `adjust` runs on it in one transaction (next term, the person's new
 * password) before anything else opens it. The copy's own bookkeeping table goes. The copy is written without
 * foreign-key checks (it mirrors rows in the main computer's order): a row pointing at a missing one stops the
 * takeover here (PromoteError), and so does a failed integrity check; the half-made file is removed (the copy stays).
 */
export async function promoteReplica(
  writer: Database.Database,
  target: string,
  adjust: (db: Database.Database) => void
): Promise<void> {
  await writer.backup(target)
  const db = new Database(target)
  let made = false
  try {
    db.pragma('journal_mode = WAL')
    db.pragma('synchronous = FULL')
    db.transaction(() => {
      db.prepare('DROP TABLE IF EXISTS `_replica_meta`').run()
      adjust(db)
    })()
    const integrity = String(db.pragma('integrity_check', { simple: true }))
    if (integrity !== 'ok') throw new Error(`promoted copy failed integrity_check: ${integrity}`)
    const orphans = db.pragma('foreign_key_check') as unknown[]
    if (orphans.length > 0) throw new PromoteError('orphans', orphans.length)
    made = true
  } finally {
    db.close()
    if (!made) for (const suffix of ['', '-wal', '-shm']) rmSync(target + suffix, { force: true })
  }
}

/** The owner's read-only copy (Faz 13, client mode): a writer for the copier and a read-only side for the screens. */
export interface ReplicaDatabase {
  /** The copier's connection: applies changes and snapshots (src/main/replica/apply.ts). */
  writer: Database.Database
  /** What the screens read through (the same services as the hotel's computer, on a read-only connection). */
  reader: DatabaseHandle
  /** Migrations of this program applied to the copy. */
  schemaVersion: number
  close(): void
}

/**
 * Opens (or makes) the read-only copy kept on a client computer (yasak 13: never the hotel's database itself, a
 * separate file). Same migrations as the hotel's database so the same services can read it; no change-log
 * triggers and no foreign-key checks (it mirrors rows in the main computer's order); a small `_replica_meta`
 * table remembers how far the copy is. A copy made by a newer program cannot be used: MigrationError.
 */
export function openReplicaDatabase(options: { file: string; migrationsFolder: string }): ReplicaDatabase {
  const writer = new Database(options.file)
  let reader: Database.Database | null = null
  try {
    writer.pragma('journal_mode = WAL')
    writer.pragma('synchronous = NORMAL')
    writer.pragma('foreign_keys = OFF')
    writer.pragma('busy_timeout = 5000')
    if (appliedMigrations(writer) > journalLength(options.migrationsFolder))
      throw new MigrationError(new Error('copy made by a newer program'), null)
    try {
      migrate(drizzle(writer, { schema }), { migrationsFolder: options.migrationsFolder })
    } catch (error) {
      throw new MigrationError(error, null)
    }
    dropChangeLog(writer)
    writer
      .prepare('CREATE TABLE IF NOT EXISTS `_replica_meta` (`key` TEXT PRIMARY KEY, `value` TEXT NOT NULL)')
      .run()
    const schemaVersion = appliedMigrations(writer)
    const readerConn = new Database(options.file, { readonly: true, fileMustExist: true })
    reader = readerConn
    readerConn.pragma('busy_timeout = 5000')
    const sqliteVersion = (readerConn.prepare('select sqlite_version() as v').get() as { v: string }).v
    const handle: DatabaseHandle = {
      sqlite: readerConn,
      db: drizzle(readerConn, { schema }),
      file: options.file,
      schemaVersion,
      integrity: 'ok',
      backupPath: null,
      sqliteVersion,
      close: () => readerConn.close()
    }
    return {
      writer,
      reader: handle,
      schemaVersion,
      close: () => {
        readerConn.close()
        writer.close()
      }
    }
  } catch (error) {
    reader?.close()
    writer.close()
    throw error
  }
}
