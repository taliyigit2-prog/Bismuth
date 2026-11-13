// Backups (G-120, G-121; K-05, K-32, S-42): an online copy of the live database taken in small steps (it never
// stops data entry), checked with PRAGMA integrity_check, packed with the attachments into one compressed file
// `bismuth-yedek-YYYY-MM-DD-HHmm.bmy` in the program's backups folder, and the same file encrypted with the Bismuth
// key in the hotel's Google Drive folder (Bismuth only writes the file; Drive for desktop syncs it). Automatic
// copies are kept 30 days here and in Drive; manual and safety copies stay until removed by hand.
// Restoring never swaps the open database: the chosen copy is unpacked and checked now (integrity, version — a copy
// of a newer program is refused, an older one is migrated at start), a safety backup of today's data is taken, and
// the swap happens at the next start before the database is opened (a marker file).
// The files are the truth (a restored database does not know the backups made after it); `backups` rows index them
// for the audit log and remember the last check.
import { createHash } from 'node:crypto'
import {
  closeSync,
  cpSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import type Database from 'better-sqlite3'
import { and, desc, eq, inArray } from 'drizzle-orm'
import type {
  BackupItem,
  BackupOverview,
  BackupSource,
  BackupStatus,
  BackupWarning,
  DriveState
} from '@shared/contract/backup'
import { keepDaysSchema, type BackupKind } from '@shared/contract/users'
import { localDateOf } from '@shared/date'
import { ArchiveError, encryptFile, readArchive, sha256Of, writeArchive } from '../backup/archive'
import { prepareDriveBackupDir, resolveDriveBackupDir, type DriveProbe } from '../backup/drive'
import { PRE_MIGRATION_PREFIX, preMigrationFiles, prunePreMigration } from '../backup/pre-migration'
import { isDue, nextSlotAt } from '../backup/scheduler'
import { steppedBackup, type SteppedBackupOptions } from '../backup/stepped-backup'
import {
  integrityOfFile,
  integrityOfFileAsync,
  mergeWalOf,
  schemaVersionOfFileAsync,
  termOfFile
} from '../db/client'
import { auditLog, backups, settings } from '../db/schema'
import {
  clearRestoreFailure,
  isSafetyFolderName,
  readRestoreFailure,
  recordRestoreFailure,
  SAFETY_PREFIX,
  safetyFolders
} from '../backup/restore-state'
import {
  decodeRecoveryText,
  encodeRecoveryText,
  memoryKeyStore,
  sameKey,
  type BismuthKeyStore
} from '../security/bismuth-key'
import type { Ctx } from './context'
import { AppError } from './errors'
import { inTransaction, newId, parseInput, requirePermission, type ServiceDeps } from './kit'
import { readSetting } from './settings-service'

export type BackupRow = typeof backups.$inferSelect

export interface BackupDeps extends ServiceDeps {
  /** The live connection (online backup API). */
  sqlite: Database.Database
  /** userData/backups */
  backupsDir: string
  /** userData/attachments (packed into every backup, "ekler dahil"). */
  attachmentsDir: string
  /** userData/restore-pending.json */
  restoreMarkerPath: string
  /** userData (shown in Settings with "Klasörü aç"). */
  dataDir?: string
  /** The live database file (size on screen); absent for an in-memory database. */
  dbFile?: string
  appVersion?: string
  /** Migrations this program knows (drizzle journal): a backup with more is from a newer program. */
  schemaVersion?: () => number
  /** The Bismuth key (K-05); default: none can be kept (Drive copies are skipped). */
  keys?: BismuthKeyStore
  /** Drive folder for the encrypted copies; default: from the setting / Drive for desktop. */
  driveDir?: () => string | null
  /** Someone is using the program: the step-by-step copy waits (K-32). */
  isBusy?: () => boolean
  /** Step sizes and rests of the online copy (tests make it fast). */
  stepping?: SteppedBackupOptions
  /** Opens a folder in Explorer / Finder (Electron shell, main process only). */
  openPath?: (path: string) => Promise<string>
  /** Starts the program again (Electron app.relaunch). */
  relaunch?: () => void
  /** The system's folder dialog of the program window (main process only): the Drive folder (K-45 (3)). */
  pickFolder?: () => Promise<string | null>
  /** Where "Drive klasörünü bul" looks (tests); default: this computer's folders. */
  driveProbe?: DriveProbe
  /** Makes the folder "Drive klasörünü bul" found (tests); default: mkdir. */
  prepareDriveDir?: () => string | null
}

export interface RestoreMarker {
  /** File (or folder) name of the chosen backup. */
  backupId: string
  /** Folder inside the backups directory holding the unpacked copy (`.restore/…`). */
  dir: string
  sha256: string
  requestedAt: string
  requestedBy: string | null
  /** Where the backup was listed (P14fix #4: its index row gets `restored_at`); absent in older markers. */
  source?: BackupSource
}

export type RestoreFailure = 'checksum' | 'missing' | 'invalid' | 'io'

export type RestoreResult =
  | {
      status: 'restored'
      from: string
      safetyDir: string
      backupId: string
      source?: BackupSource
      /** Term of the data the restore replaced (0: none); the restored data starts a term above it. */
      previousTerm?: number
    }
  | { status: 'failed'; reason: RestoreFailure }

export const BACKUP_DB_NAME = 'bismuth.db'
const ATTACHMENTS = 'attachments'
const STAGING = '.restore'
const KEEP_SAFETY_FOLDERS = 3
/** No backup for this long → the Today badge (G-120). */
const STALE_MS = 48 * 3_600_000

const pad = (n: number): string => String(n).padStart(2, '0')
const stamp = (d: Date): string =>
  `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`

// bismuth-yedek-2026-10-04-0400.bmy · -elle (manual) · -guvenlik (before a restore) · -2 when the minute is taken.
const NAME = /^bismuth-yedek-(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(?:-(elle|guvenlik))?(?:-(\d+))?\.bmy$/
const SUFFIX: Record<BackupKind, string> = { auto: '', manual: '-elle', safety: '-guvenlik' }

interface ParsedName {
  kind: BackupKind
  at: Date
}
function parseName(name: string): ParsedName | null {
  const m = NAME.exec(name)
  if (!m) return null
  const at = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]))
  return { kind: m[6] === 'elle' ? 'manual' : m[6] === 'guvenlik' ? 'safety' : 'auto', at }
}

/** sha256 of a file read in blocks (a large database never sits in memory). */
function sha256FileSync(path: string): string {
  const hash = createHash('sha256')
  const fd = openSync(path, 'r')
  const buf = Buffer.alloc(1024 * 1024)
  try {
    for (;;) {
      const n = readSync(fd, buf, 0, buf.length, null)
      if (n === 0) break
      hash.update(buf.subarray(0, n))
    }
  } finally {
    closeSync(fd)
  }
  return hash.digest('hex')
}

/** A name resolved inside `dir` (never outside it). */
function inside(dir: string, name: string): string {
  const full = resolve(dir, name)
  const rel = relative(resolve(dir), full)
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new AppError('VALIDATION', 'errors.backupPath')
  return full
}

/** Every file under `dir` as archive entries ('/'-separated names under `prefix`). */
function filesUnder(dir: string, prefix: string): { name: string; path: string }[] {
  if (!existsSync(dir)) return []
  const out: { name: string; path: string }[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    const name = `${prefix}/${entry.name}`
    if (entry.isDirectory()) out.push(...filesUnder(path, name))
    else if (entry.isFile()) out.push({ name, path })
  }
  return out
}

function folderSize(dir: string): number {
  if (!existsSync(dir)) return 0
  let total = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) total += folderSize(path)
    else if (entry.isFile()) total += statSync(path).size
  }
  return total
}

/**
 * Applies a scheduled restore before the database is opened (main process start). Order: verify the unpacked copy,
 * copy the current data to a `bismuth-safety_…` folder, stage the copy next to the live files (`.restoring`, checked
 * again), then swap with renames and drop the old WAL side files. Any failure after the live files were touched puts
 * the safety copy back, so the program always opens either the restored data or the data it had. A copy whose
 * checksum no longer matches is refused and the marker becomes `.failed`. Returns null when nothing was scheduled.
 */
export function applyPendingRestore(opts: {
  dbFile: string
  attachmentsDir: string
  backupsDir: string
  markerPath: string
  now?: Date
}): RestoreResult | null {
  if (!existsSync(opts.markerPath)) return null
  const fail = (reason: RestoreFailure): RestoreResult => {
    // P14fix #4: kept with what and why, so Settings → Yedek and Today say it until someone has seen it.
    recordRestoreFailure(opts.markerPath, reason, opts.now ?? new Date())
    return { status: 'failed', reason }
  }
  let marker: RestoreMarker
  let source: string
  try {
    marker = JSON.parse(readFileSync(opts.markerPath, 'utf8')) as RestoreMarker
    source = inside(opts.backupsDir, marker.dir)
  } catch {
    return fail('invalid')
  }
  const sourceDb = join(source, BACKUP_DB_NAME)
  if (!existsSync(sourceDb)) return fail('missing')
  if (sha256FileSync(sourceDb) !== marker.sha256) return fail('checksum')

  const now = opts.now ?? new Date()
  const safetyDir = join(opts.backupsDir, `${SAFETY_PREFIX}${stamp(now)}`)
  const stagedDb = `${opts.dbFile}.restoring`
  const stagedAttachments = `${opts.attachmentsDir}.restoring`
  const cleanStaging = (): void => {
    rmSync(stagedDb, { force: true })
    rmSync(stagedAttachments, { recursive: true, force: true })
  }
  // 1. Stage everything without touching the live files.
  try {
    cleanStaging()
    mkdirSync(safetyDir, { recursive: true })
    for (const suffix of ['', '-wal', '-shm'])
      if (existsSync(opts.dbFile + suffix))
        cpSync(opts.dbFile + suffix, join(safetyDir, BACKUP_DB_NAME + suffix))
    if (existsSync(opts.attachmentsDir))
      cpSync(opts.attachmentsDir, join(safetyDir, ATTACHMENTS), { recursive: true })
    cpSync(sourceDb, stagedDb)
    if (sha256FileSync(stagedDb) !== marker.sha256 || integrityOfFile(stagedDb) !== 'ok') {
      cleanStaging()
      return fail('checksum')
    }
    if (existsSync(join(source, ATTACHMENTS)))
      cpSync(join(source, ATTACHMENTS), stagedAttachments, { recursive: true })
    else mkdirSync(stagedAttachments, { recursive: true })
  } catch {
    cleanStaging()
    return fail('io')
  }
  // The term the replaced data was in: the restored data starts above it (Faz 11/14 #1, noteRestored).
  const previousTerm = termOfFile(opts.dbFile)
  // 2. Swap. The old WAL must go with the old file (SQLite would replay it into the restored one).
  try {
    for (const suffix of ['-wal', '-shm']) rmSync(opts.dbFile + suffix, { force: true })
    renameSync(stagedDb, opts.dbFile)
    rmSync(opts.attachmentsDir, { recursive: true, force: true })
    renameSync(stagedAttachments, opts.attachmentsDir)
  } catch {
    // Put the data the program had back from the safety copy.
    for (const suffix of ['', '-wal', '-shm']) {
      rmSync(opts.dbFile + suffix, { force: true })
      const saved = join(safetyDir, BACKUP_DB_NAME + suffix)
      if (existsSync(saved)) cpSync(saved, opts.dbFile + suffix)
    }
    rmSync(opts.attachmentsDir, { recursive: true, force: true })
    if (existsSync(join(safetyDir, ATTACHMENTS)))
      cpSync(join(safetyDir, ATTACHMENTS), opts.attachmentsDir, { recursive: true })
    cleanStaging()
    return fail('io')
  }
  rmSync(opts.markerPath, { force: true })
  // The unpacked copy has done its job; the backup file itself stays.
  if (relative(resolve(opts.backupsDir), source).startsWith(STAGING))
    rmSync(source, { recursive: true, force: true })
  return {
    status: 'restored',
    from: marker.dir,
    safetyDir,
    backupId: marker.backupId,
    ...(marker.source ? { source: marker.source } : {}),
    previousTerm
  }
}

/** `bismuth-yedek-….bmy` → the same name with the next free `-N` in `dir` (Drive may hold another computer's). */
function freeName(dir: string, name: string): string {
  if (!existsSync(join(dir, name))) return name
  const base = name.replace(/(?:-\d+)?\.bmy$/, '')
  let n = 2
  while (existsSync(join(dir, `${base}-${n}.bmy`))) n++
  return `${base}-${n}.bmy`
}

const backupFailed = (): AppError => new AppError('INTERNAL', 'errors.backupFailed')

export function createBackupService(deps: BackupDeps) {
  const { db } = deps
  const keys = deps.keys ?? memoryKeyStore(null, false)
  const driveDir = (): string | null =>
    deps.driveDir ? deps.driveDir() : resolveDriveBackupDir(readSetting(db, 'backup.driveFolder'))
  const schemaVersion = (): number => deps.schemaVersion?.() ?? Number.MAX_SAFE_INTEGER
  mkdirSync(deps.backupsDir, { recursive: true })

  const state: {
    queue: Promise<unknown>
    running: number
    lastError: string | null
    drive: DriveState | null
    driveError: string | null
  } = { queue: Promise.resolve(), running: 0, lastError: null, drive: null, driveError: null }

  /** Backups one after the other (the scheduler, a manual one and a restore's safety copy never overlap). */
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = state.queue.then(fn, fn)
    state.queue = next.catch(() => undefined)
    return next
  }

  const archivesIn = (dir: string | null): { name: string; parsed: ParsedName; size: number }[] => {
    if (!dir || !existsSync(dir)) return []
    const out: { name: string; parsed: ParsedName; size: number }[] = []
    for (const name of readdirSync(dir)) {
      const parsed = parseName(name)
      if (!parsed) continue
      try {
        out.push({ name, parsed, size: statSync(join(dir, name)).size })
      } catch {
        // gone meanwhile
      }
    }
    return out.sort((a, b) => b.parsed.at.getTime() - a.parsed.at.getTime() || (a.name < b.name ? 1 : -1))
  }

  const rowsByPath = (): Map<string, BackupRow> => {
    const map = new Map<string, BackupRow>()
    for (const row of db.select().from(backups).orderBy(desc(backups.createdAt)).all()) {
      const key = `${row.location}:${row.path}`
      if (!map.has(key)) map.set(key, row)
    }
    return map
  }

  function items(): BackupItem[] {
    const rows = rowsByPath()
    const local = archivesIn(deps.backupsDir).map((a): BackupItem => {
      const row = rows.get(`local:${a.name}`)
      return {
        id: a.name,
        source: 'local',
        kind: a.parsed.kind,
        createdAt: row?.createdAt ?? a.parsed.at.toISOString(),
        sizeBytes: a.size,
        encrypted: false,
        verified: row ? row.verified : null,
        note: row?.note ?? null
      }
    })
    // Folder backups of the first version (Faz 2): still listed and restorable.
    const legacy = db
      .select()
      .from(backups)
      .all()
      .filter(
        (r) => r.location === 'local' && !parseName(r.path) && existsSync(join(deps.backupsDir, r.path))
      )
      .map((r): BackupItem => ({
        id: r.path,
        source: 'local',
        kind: r.kind,
        createdAt: r.createdAt,
        sizeBytes: r.sizeBytes,
        encrypted: r.encrypted,
        verified: r.verified,
        note: r.note
      }))
    // P14fix #12: the copy of the data taken just before a restore was applied (what was entered between
    // "Geri yükle" and the restart) is listed and can be restored like a backup.
    const safety = safetyFolders(deps.backupsDir).map((f): BackupItem => ({
      id: f.name,
      source: 'local',
      kind: 'safety',
      createdAt: f.at.toISOString(),
      sizeBytes: f.sizeBytes,
      encrypted: false,
      verified: rows.get(`local:${f.name}`)?.verified ?? null,
      note: null
    }))
    const drive = archivesIn(driveDir()).map((a): BackupItem => {
      const row = rows.get(`cloud:${a.name}`)
      return {
        id: a.name,
        source: 'drive',
        kind: a.parsed.kind,
        createdAt: row?.createdAt ?? a.parsed.at.toISOString(),
        sizeBytes: a.size,
        encrypted: true,
        verified: row ? row.verified : null,
        note: row?.note ?? null
      }
    })
    const pre = existsSync(deps.backupsDir)
      ? preMigrationFiles(deps.backupsDir).map((name): BackupItem => {
          const full = join(deps.backupsDir, name)
          const st = statSync(full)
          return {
            id: name,
            source: 'preMigration',
            kind: 'pre_migration',
            createdAt: st.mtime.toISOString(),
            sizeBytes: st.size,
            encrypted: false,
            verified: null,
            note: name.slice(PRE_MIGRATION_PREFIX.length).split('_')[0] ?? null
          }
        })
      : []
    return [...local, ...legacy, ...safety, ...drive, ...pre].sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0
    )
  }

  const lastAutoAt = (): Date | null => {
    const auto = archivesIn(deps.backupsDir).find((a) => a.parsed.kind === 'auto')
    return auto?.parsed.at ?? null
  }

  function driveState(): DriveState {
    const dir = driveDir()
    if (!dir) return 'missing'
    if (!keys.info().available && !keys.get()) return 'noKey'
    return state.drive === 'error' ? 'error' : 'ok'
  }

  /**
   * P14fix #8: the key was made (quietly, with the first Drive copy) but nobody has seen it on screen or typed it in
   * from paper — if this computer is lost, the Drive copies cannot be opened.
   */
  function keyNotShown(): boolean {
    let exists = false
    try {
      exists = keys.info().exists
    } catch {
      exists = false
    }
    if (!exists) return false
    return !db
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.entity, 'backup'),
          eq(auditLog.entityId, 'recovery_text'),
          inArray(auditLog.action, ['export', 'import'])
        )
      )
      .limit(1)
      .get()
  }

  function status(): BackupStatus {
    const now = deps.clock()
    const local = archivesIn(deps.backupsDir)
    const last = local[0]?.parsed.at ?? null
    const auto = lastAutoAt()
    const drive = driveState()
    const warnings: BackupWarning[] = []
    if (!last || now.getTime() - last.getTime() > STALE_MS) warnings.push('stale')
    if (drive !== 'ok') warnings.push('drive')
    if (state.lastError) warnings.push('failed')
    if (readRestoreFailure(deps.restoreMarkerPath)) warnings.push('restoreFailed')
    if (keyNotShown()) warnings.push('keyNotShown')
    const time = readSetting(db, 'backup.autoTime')
    return {
      lastBackupAt: last?.toISOString() ?? null,
      lastAutoAt: auto?.toISOString() ?? null,
      nextAutoAt: isDue(auto, now, time) ? null : nextSlotAt(now, time).toISOString(),
      running: state.running > 0,
      drive: { state: drive, lastAt: archivesIn(driveDir())[0]?.parsed.at.toISOString() ?? null },
      warnings,
      restorePending: existsSync(deps.restoreMarkerPath)
    }
  }

  function uniqueName(dir: string, now: Date, kind: BackupKind): string {
    const base = `bismuth-yedek-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${SUFFIX[kind]}`
    let name = `${base}.bmy`
    for (let n = 2; existsSync(join(dir, name)); n++) name = `${base}-${n}.bmy`
    return name
  }

  /** The copy for Drive: encrypted with the Bismuth key; skipped quietly without a folder or a key. */
  async function copyToDrive(ctx: Ctx, file: string, name: string, kind: BackupKind): Promise<void> {
    const dir = driveDir()
    if (!dir) {
      state.drive = 'missing'
      return
    }
    let key: Buffer | null
    try {
      key = keys.getOrCreate()
    } catch {
      key = null
    }
    if (!key) {
      state.drive = 'noKey'
      return
    }
    try {
      mkdirSync(dir, { recursive: true })
      // Never over a copy already in Drive (the same minute on another computer of the hotel): a new name instead.
      const driveName = freeName(dir, name)
      const { sizeBytes } = await encryptFile(file, join(dir, driveName), key)
      state.drive = 'ok'
      state.driveError = null
      const now = deps.clock()
      inTransaction(deps, ctx, (tx, audit) => {
        const row: BackupRow = {
          id: newId(now),
          createdAt: now.toISOString(),
          path: driveName,
          sizeBytes,
          sha256: '',
          verified: true,
          kind,
          location: 'cloud',
          encrypted: true,
          chunks: null,
          note: null,
          restoredAt: null,
          dbDay: localDateOf(now)
        }
        tx.insert(backups).values(row).run()
        audit({ entity: 'backup', entityId: row.id, action: 'backup', after: row })
      })
    } catch (error) {
      state.drive = 'error'
      state.driveError = error instanceof Error ? error.message : String(error)
    }
  }

  /** Removes automatic copies older than `days` here and in Drive (the newest one always stays). */
  function pruneFiles(ctx: Ctx, days: number): number {
    const cutoff = deps.clock().getTime() - days * 86_400_000
    const removed: string[] = []
    for (const [dir, location] of [
      [deps.backupsDir, 'local'],
      [driveDir(), 'cloud']
    ] as const) {
      const autos = archivesIn(dir).filter((a) => a.parsed.kind === 'auto')
      for (const a of autos.slice(1)) {
        if (a.parsed.at.getTime() >= cutoff) continue
        try {
          rmSync(join(dir!, a.name), { force: true })
          removed.push(`${location}:${a.name}`)
        } catch {
          // a Drive file locked by the sync program: next time
        }
      }
    }
    // Folder backups of the first version: by their row's age, automatic ones only.
    const oldFolders = db
      .select()
      .from(backups)
      .all()
      .filter(
        (r) =>
          r.kind === 'auto' &&
          r.location === 'local' &&
          !parseName(r.path) &&
          new Date(r.createdAt).getTime() < cutoff
      )
    for (const r of oldFolders) {
      rmSync(inside(deps.backupsDir, r.path), { recursive: true, force: true })
      removed.push(`local:${r.path}`)
    }
    if (removed.length)
      inTransaction(deps, ctx, (tx, audit) => {
        // A backups row only indexes a file: it goes with its file (the audit row keeps the list).
        for (const key of removed) {
          const [location, path] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)]
          for (const r of tx.select().from(backups).where(eq(backups.path, path)).all())
            if (r.location === location) tx.delete(backups).where(eq(backups.id, r.id)).run()
        }
        audit({
          entity: 'backup',
          entityId: 'prune',
          action: 'update',
          before: { files: removed },
          after: { keepDays: days }
        })
      })
    // Safety folders of applied restores: the newest few stay.
    const safety = readdirSync(deps.backupsDir)
      .filter((n) => n.startsWith(SAFETY_PREFIX))
      .sort()
    for (const n of safety.slice(0, Math.max(0, safety.length - KEEP_SAFETY_FOLDERS)))
      rmSync(join(deps.backupsDir, n), { recursive: true, force: true })
    prunePreMigration(deps.backupsDir, readSetting(db, 'backup.preMigrationKeep'))
    return removed.length
  }

  async function makeBackup(
    ctx: Ctx,
    kind: BackupKind,
    note: string | null,
    fast: boolean
  ): Promise<BackupItem> {
    state.running++
    const now = deps.clock()
    const id = newId(now)
    const name = uniqueName(deps.backupsDir, now, kind)
    const file = join(deps.backupsDir, name)
    const work = join(deps.backupsDir, `.work-${id}`)
    const sleep = deps.stepping?.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
    try {
      mkdirSync(work, { recursive: true })
      const copy = join(work, BACKUP_DB_NAME)
      const result = await steppedBackup(
        deps.sqlite,
        copy,
        fast ? { pagesPerStep: 1 << 20, restMs: 0 } : { isBusy: deps.isBusy, ...deps.stepping }
      )
      // P14fix #6: the copy is checked in a worker thread (the windows keep answering meanwhile).
      if ((await integrityOfFileAsync(copy)) !== 'ok') throw backupFailed()
      const manifest = {
        format: 1 as const,
        app: deps.appVersion ?? '0.0.0',
        schemaVersion: await schemaVersionOfFileAsync(copy),
        createdAt: now.toISOString(),
        kind,
        dbSha256: await sha256Of(copy)
      }
      const { sizeBytes, sha256 } = await writeArchive(
        file,
        manifest,
        [{ name: BACKUP_DB_NAME, path: copy }, ...filesUnder(deps.attachmentsDir, ATTACHMENTS)],
        fast ? undefined : () => sleep(deps.stepping?.restMs ?? 40)
      )
      const row: BackupRow = {
        id,
        createdAt: now.toISOString(),
        path: name,
        sizeBytes,
        sha256,
        verified: true,
        kind,
        location: 'local',
        encrypted: false,
        chunks: result.steps,
        note,
        restoredAt: null,
        dbDay: localDateOf(now)
      }
      inTransaction(deps, ctx, (tx, audit) => {
        tx.insert(backups).values(row).run()
        audit({ entity: 'backup', entityId: id, action: 'backup', after: row })
      })
      state.lastError = null
      await copyToDrive(ctx, file, name, kind)
      if (kind === 'auto') pruneFiles(ctx, readSetting(db, 'backup.keepDays'))
      return {
        id: name,
        source: 'local',
        kind,
        createdAt: row.createdAt,
        sizeBytes,
        encrypted: false,
        verified: true,
        note
      }
    } catch (error) {
      rmSync(file, { force: true }) // no half-written backup is left behind
      state.lastError = error instanceof AppError ? error.messageKey : 'errors.backupFailed'
      throw error instanceof AppError ? error : backupFailed()
    } finally {
      rmSync(work, { recursive: true, force: true })
      state.running--
    }
  }

  /** The file of a listed backup, and its key when it is a Drive copy. */
  function fileOf(source: BackupSource, id: string): string {
    const dir = source === 'drive' ? driveDir() : deps.backupsDir
    if (!dir) throw new AppError('NOT_FOUND', 'errors.backupNotFound')
    const valid =
      source === 'preMigration'
        ? id.startsWith(PRE_MIGRATION_PREFIX) && id.endsWith('.db')
        : parseName(id) !== null ||
          (source === 'local' &&
            (isSafetyFolderName(id) ||
              db.select().from(backups).where(eq(backups.path, id)).get() !== undefined))
    const full = inside(dir, id)
    if (!valid || !existsSync(full)) throw new AppError('NOT_FOUND', 'errors.backupNotFound')
    return full
  }

  /**
   * Unpacks (and decrypts) a backup into a fresh folder and checks it: integrity_check and the schema version.
   * Returns the folder (inside the backups directory) and the database's sha256.
   */
  async function stage(
    source: BackupSource,
    id: string,
    key: Buffer | null
  ): Promise<{ dir: string; rel: string; sha256: string; schemaVersion: number }> {
    const file = fileOf(source, id)
    const rel = join(STAGING, `${stamp(deps.clock())}-${newId(deps.clock()).slice(-6)}`)
    const dir = join(deps.backupsDir, rel)
    rmSync(dir, { recursive: true, force: true })
    mkdirSync(dir, { recursive: true })
    try {
      if (source === 'preMigration') {
        // Only the database was copied before the update: today's attachments stay as they are.
        cpSync(file, join(dir, BACKUP_DB_NAME))
        if (existsSync(deps.attachmentsDir))
          cpSync(deps.attachmentsDir, join(dir, ATTACHMENTS), { recursive: true })
      } else if (statSync(file).isDirectory()) {
        cpSync(file, dir, { recursive: true })
        mergeWalOf(join(dir, BACKUP_DB_NAME)) // a safety copy may carry the live -wal file (P14fix #12)
      } else {
        await readArchive(file, dir, key)
      }
      const dbFile = join(dir, BACKUP_DB_NAME)
      if (!existsSync(dbFile) || (await integrityOfFileAsync(dbFile)) !== 'ok')
        throw new AppError('CONFLICT', 'errors.backupDamaged')
      return {
        dir,
        rel,
        sha256: await sha256Of(dbFile),
        schemaVersion: await schemaVersionOfFileAsync(dbFile)
      }
    } catch (error) {
      rmSync(dir, { recursive: true, force: true })
      if (error instanceof ArchiveError)
        throw new AppError(
          'CONFLICT',
          error.reason === 'wrongKey'
            ? key
              ? 'errors.backupWrongKey'
              : 'errors.backupKeyMissing'
            : error.reason === 'notBackup'
              ? 'errors.backupNotBackup'
              : 'errors.backupDamaged'
        )
      if (error instanceof AppError) throw error
      throw new AppError('CONFLICT', 'errors.backupDamaged')
    }
  }

  const markVerified = (ctx: Ctx, source: BackupSource, id: string, ok: boolean): void => {
    const location = source === 'drive' ? 'cloud' : 'local'
    const row = db
      .select()
      .from(backups)
      .where(eq(backups.path, id))
      .all()
      .find((r) => r.location === location)
    if (!row || row.verified === ok) return
    inTransaction(deps, ctx, (tx, audit) => {
      tx.update(backups).set({ verified: ok }).where(eq(backups.id, row.id)).run()
      audit({
        entity: 'backup',
        entityId: row.id,
        action: 'update',
        before: { verified: row.verified },
        after: { verified: ok }
      })
    })
  }

  const keyFor = (source: BackupSource, recoveryText?: string): Buffer | null => {
    if (source !== 'drive') return null
    if (recoveryText) {
      const key = decodeRecoveryText(recoveryText)
      if (!key) throw new AppError('VALIDATION', 'errors.backupRecoveryText')
      return key
    }
    return keys.get()
  }

  const readMarker = (): RestoreMarker | null => {
    if (!existsSync(deps.restoreMarkerPath)) return null
    try {
      return JSON.parse(readFileSync(deps.restoreMarkerPath, 'utf8')) as RestoreMarker
    } catch {
      return null
    }
  }

  const desktopOnly = (ctx: Ctx): void => {
    if (ctx.transport !== 'ipc') throw new AppError('CONFLICT', 'errors.backupDesktopOnly')
  }

  return {
    /** The Today badge (P9c) and the first line of Settings → Yedek. */
    status(ctx: Ctx): BackupStatus {
      if (!ctx.can('today', 'view') && !ctx.can('settings.backup', 'view'))
        requirePermission(ctx, 'settings.backup', 'view')
      return status()
    },

    list(ctx: Ctx): BackupItem[] {
      requirePermission(ctx, 'settings.backup', 'view')
      return items()
    },

    overview(ctx: Ctx): BackupOverview {
      requirePermission(ctx, 'settings.backup', 'view')
      const marker = readMarker()
      const key = keys.info()
      // N-9: folder paths only in the hotel computer's own window; a phone sees sizes and dates, not paths.
      const local = ctx.transport === 'ipc'
      const dataDir = deps.dataDir ?? resolve(deps.backupsDir, '..')
      return {
        status: status(),
        dataDir: local ? dataDir : null,
        dbBytes:
          deps.dbFile && existsSync(deps.dbFile)
            ? ['', '-wal'].reduce(
                (n, s) => n + (existsSync(deps.dbFile! + s) ? statSync(deps.dbFile! + s).size : 0),
                0
              )
            : 0,
        attachmentsBytes: folderSize(deps.attachmentsDir),
        backupsDir: local ? deps.backupsDir : null,
        driveDir: local ? driveDir() : null,
        key: { available: key.available, exists: key.exists, createdAt: key.createdAt },
        items: items(),
        pendingRestore: marker ? { id: marker.backupId, requestedAt: marker.requestedAt } : null,
        restoreFailed: readRestoreFailure(deps.restoreMarkerPath),
        lastError: state.lastError,
        canOpenFolders: ctx.transport === 'ipc' && Boolean(deps.openPath)
      }
    },

    /** A backup now (manual: kept until removed by hand). */
    async run(ctx: Ctx, opts: { note?: string } = {}): Promise<BackupItem> {
      requirePermission(ctx, 'settings.backup', 'edit')
      return serial(() => makeBackup(ctx, 'manual', opts.note?.trim() || null, false))
    },

    /** The daily automatic backup (scheduler, systemCtx) and the one at closing (`fast`: no rests). */
    async runAuto(ctx: Ctx, opts: { fast?: boolean } = {}): Promise<BackupItem> {
      requirePermission(ctx, 'settings.backup', 'edit')
      return serial(() => makeBackup(ctx, 'auto', null, opts.fast ?? false))
    },

    lastAutoAt,

    /** Opens the copy and runs integrity_check on its database; the result is remembered. */
    async verify(ctx: Ctx, ref: { source: BackupSource; id: string }): Promise<BackupItem> {
      requirePermission(ctx, 'settings.backup', 'edit') // it writes the result and an audit row
      let ok = true
      try {
        const staged = await stage(ref.source, ref.id, keyFor(ref.source))
        rmSync(staged.dir, { recursive: true, force: true })
      } catch (error) {
        if (error instanceof AppError && error.messageKey !== 'errors.backupDamaged') throw error
        ok = false
      }
      markVerified(ctx, ref.source, ref.id, ok)
      const item = items().find((i) => i.source === ref.source && i.id === ref.id)
      if (!item) throw new AppError('NOT_FOUND', 'errors.backupNotFound')
      return { ...item, verified: ok }
    },

    /**
     * Schedules a restore for the next start: the copy is unpacked and checked now (a newer program's copy is
     * refused), today's data gets a safety backup first, then the marker is written.
     */
    async restore(
      ctx: Ctx,
      input: { source: BackupSource; id: string; recoveryText?: string; replace?: boolean }
    ): Promise<{ id: string; requestedAt: string }> {
      requirePermission(ctx, 'settings.backup', 'edit')
      // Replacing all the hotel's data, perhaps with the key typed in: the hotel's own window only (Y-1, K-45 (3)).
      desktopOnly(ctx)
      const key = keyFor(input.source, input.recoveryText)
      const staged = await stage(input.source, input.id, key)
      try {
        if (staged.schemaVersion > schemaVersion())
          throw new AppError('CONFLICT', 'errors.backupNewerVersion', {
            backup: staged.schemaVersion,
            program: schemaVersion()
          })
        // A new computer that learned the key from the owner's paper keeps it for the next Drive copies (a key it
        // made itself before the restore only ever encrypted the empty start-up data). A different key of its own
        // is changed only when the person agreed (Faz 11/14 #7), as in "Anahtarı gir" (setRecoveryText): the paper
        // has opened the copy by now, so the question is only about this computer's own key.
        const current = keys.get()
        const differs = current !== null && key !== null && !sameKey(current, key)
        if (input.recoveryText && differs && !input.replace)
          throw new AppError('CONFLICT', 'errors.backupKeyExists')
        if (input.recoveryText && key && keys.info().available && (!current || differs)) keys.set(key)
        await serial(() => makeBackup(ctx, 'safety', null, true))
      } catch (error) {
        rmSync(staged.dir, { recursive: true, force: true })
        throw error
      }
      const previous = readMarker()
      const marker: RestoreMarker = {
        backupId: input.id,
        dir: staged.rel,
        sha256: staged.sha256,
        requestedAt: deps.clock().toISOString(),
        requestedBy: ctx.userId,
        source: input.source
      }
      inTransaction(deps, ctx, (_tx, audit) => {
        audit({
          entity: 'backup',
          entityId: input.id,
          action: 'restore',
          after: { ...marker, source: input.source }
        })
        writeFileSync(deps.restoreMarkerPath, JSON.stringify(marker))
      })
      if (previous && previous.dir !== marker.dir && previous.dir.startsWith(STAGING))
        rmSync(join(deps.backupsDir, previous.dir), { recursive: true, force: true })
      return { id: input.id, requestedAt: marker.requestedAt }
    },

    /** Writes the audit row of a restore applied at start (the restored database did not know it yet). */
    noteRestored(ctx: Ctx, result: RestoreResult): void {
      requirePermission(ctx, 'settings.backup', 'edit')
      inTransaction(deps, ctx, (tx, audit, now) => {
        let term: { from: number; to: number } | null = null
        // P14fix #4: the backup's index row remembers when it came back (the restored data may not have the row).
        if (result.status === 'restored') {
          const location = result.source === 'drive' ? 'cloud' : 'local'
          const row = tx
            .select()
            .from(backups)
            .where(eq(backups.path, result.backupId))
            .all()
            .find((r) => r.location === location)
          if (row)
            tx.update(backups).set({ restoredAt: now.toISOString() }).where(eq(backups.id, row.id)).run()
          else {
            const parsed = parseName(result.backupId)
            tx.insert(backups)
              .values({
                id: newId(now),
                createdAt: parsed?.at.toISOString() ?? now.toISOString(),
                path: result.backupId,
                sizeBytes: 0,
                sha256: '',
                verified: true,
                kind:
                  result.source === 'preMigration'
                    ? 'pre_migration'
                    : (parsed?.kind ?? (isSafetyFolderName(result.backupId) ? 'safety' : 'manual')),
                location,
                encrypted: location === 'cloud',
                chunks: null,
                note: null,
                restoredAt: now.toISOString(),
                dbDay: localDateOf(now)
              })
              .run()
          }
          // Faz 11/14 #1: the restored file brings back its own change-log numbers and term. A new term makes every
          // read-only copy and the Drive box start again from a whole snapshot of the restored data (the box gets
          // one in the first minute), instead of continuing from numbers that now mean other changes.
          const termRow = tx.select().from(settings).where(eq(settings.key, 'host.epoch')).get()
          const restoredTerm = termRow ? Number(JSON.parse(termRow.valueJson)) || 1 : 1
          const next = Math.max(restoredTerm, result.previousTerm ?? 0) + 1
          const valueJson = JSON.stringify(next)
          tx.insert(settings)
            .values({ key: 'host.epoch', valueJson, updatedAt: now.toISOString(), updatedBy: ctx.userId })
            .onConflictDoUpdate({
              target: settings.key,
              set: { valueJson, updatedAt: now.toISOString(), updatedBy: ctx.userId }
            })
            .run()
          term = { from: restoredTerm, to: next }
        }
        audit({
          entity: 'backup',
          entityId: result.status === 'restored' ? result.backupId : 'restore',
          action: 'restore',
          after: term ? { ...result, term } : result
        })
      })
    },

    /** The restore waiting for the next start, if any. */
    pendingRestore(ctx: Ctx): RestoreMarker | null {
      requirePermission(ctx, 'settings.backup', 'view')
      return readMarker()
    },

    cancelRestore(ctx: Ctx): boolean {
      requirePermission(ctx, 'settings.backup', 'edit')
      // N-9: the restore planned at the desk is cancelled (or its failure seen) at the desk, not from a phone.
      desktopOnly(ctx)
      // P14fix #4: a restore that failed at start is "seen" here (the warning goes away).
      const failure = readRestoreFailure(deps.restoreMarkerPath)
      if (failure)
        inTransaction(deps, ctx, (_tx, audit) => {
          audit({ entity: 'backup', entityId: 'restore', action: 'acknowledge', before: failure })
          clearRestoreFailure(deps.restoreMarkerPath)
        })
      const marker = readMarker()
      if (!existsSync(deps.restoreMarkerPath)) return failure !== null
      inTransaction(deps, ctx, (_tx, audit) => {
        audit({ entity: 'backup', entityId: 'restore', action: 'cancel', before: marker })
        rmSync(deps.restoreMarkerPath, { force: true })
      })
      if (marker?.dir.startsWith(STAGING))
        rmSync(join(deps.backupsDir, marker.dir), { recursive: true, force: true })
      return true
    },

    /** Starts the program again (a scheduled restore is applied on the way). The program's own window only. */
    restart(ctx: Ctx): void {
      requirePermission(ctx, 'settings.backup', 'edit')
      desktopOnly(ctx)
      if (!deps.relaunch) throw new AppError('CONFLICT', 'errors.backupDesktopOnly')
      deps.relaunch()
    },

    async openFolder(ctx: Ctx, which: 'data' | 'backups' | 'drive'): Promise<void> {
      requirePermission(ctx, 'settings.backup', 'view')
      desktopOnly(ctx)
      const target =
        which === 'data'
          ? (deps.dataDir ?? resolve(deps.backupsDir, '..'))
          : which === 'backups'
            ? deps.backupsDir
            : driveDir()
      if (!target || !existsSync(target) || !deps.openPath)
        throw new AppError('NOT_FOUND', 'errors.backupNotFound')
      const failure = await deps.openPath(target)
      if (failure) throw new AppError('CONFLICT', 'errors.backupOpenFolder')
    },

    /** The Bismuth key as the owner writes it down (made now when there is none). Audited. */
    recoveryText(ctx: Ctx): { text: string; createdAt: string } {
      requirePermission(ctx, 'settings.backup', 'edit')
      requirePermission(ctx, 'remote.settings', 'edit')
      // The key opens every Drive copy and the box: shown only in the hotel's own window (Y-1, K-45 (3)).
      desktopOnly(ctx)
      const key = keys.getOrCreate()
      if (!key) throw new AppError('CONFLICT', 'errors.backupKeyUnavailable')
      inTransaction(deps, ctx, (_tx, audit) => {
        audit({ entity: 'backup', entityId: 'recovery_text', action: 'export' })
      })
      return { text: encodeRecoveryText(key), createdAt: keys.info().createdAt ?? deps.clock().toISOString() }
    },

    /**
     * A new computer learns the hotel's key from the owner's paper. When this computer already made a different key
     * of its own (it took backups before the paper was typed in), the person is asked first (`replace`): copies this
     * computer encrypted with its own key can then be read only with that key's paper.
     */
    setRecoveryText(ctx: Ctx, text: string, replace = false): void {
      requirePermission(ctx, 'settings.backup', 'edit')
      requirePermission(ctx, 'remote.settings', 'edit')
      desktopOnly(ctx)
      const key = decodeRecoveryText(text)
      if (!key) throw new AppError('VALIDATION', 'errors.backupRecoveryText')
      const current = keys.get()
      const differs = current !== null && !sameKey(current, key)
      if (differs && !replace) throw new AppError('CONFLICT', 'errors.backupKeyExists')
      if (!keys.info().available) throw new AppError('CONFLICT', 'errors.backupKeyUnavailable')
      keys.set(key)
      inTransaction(deps, ctx, (_tx, audit) => {
        audit({
          entity: 'backup',
          entityId: 'recovery_text',
          action: 'import',
          ...(differs ? { after: { replacedOwnKey: true } } : {})
        })
      })
    },

    /**
     * "Klasör seç" for the Drive copies (K-45 (3)): only the hotel's own window, only with the system's folder dialog
     * (nothing typed, nothing from the network). Null when the person closed the dialog. The setting itself is
     * written by the caller through the settings service (audited there; network paths refused there too).
     */
    async pickDriveFolder(ctx: Ctx): Promise<string | null> {
      requirePermission(ctx, 'settings.backup', 'edit')
      desktopOnly(ctx)
      if (!deps.pickFolder) throw new AppError('CONFLICT', 'errors.backupDesktopOnly')
      const chosen = await deps.pickFolder()
      if (chosen === null) return null
      if (!isAbsolute(chosen) || /^[\\/]{2}/.test(chosen))
        throw new AppError('VALIDATION', 'errors.backupDriveFolder')
      return chosen
    },

    /**
     * "Drive klasörünü bul": looks for Drive for desktop's folder on this computer (local folders only, no
     * network) and returns <My Drive>/Bismuth/yedekler, made if missing; null when Drive is not found. As with
     * "Klasör seç", only the hotel's own window; the caller writes the setting (audited there).
     */
    findDriveFolder(ctx: Ctx): string | null {
      requirePermission(ctx, 'settings.backup', 'edit')
      desktopOnly(ctx)
      return deps.prepareDriveDir ? deps.prepareDriveDir() : prepareDriveBackupDir(deps.driveProbe)
    },

    /** Removes automatic copies older than `keepDays` (setting `backup.keepDays`, S-42: 30). */
    prune(ctx: Ctx, keepDays?: number): number {
      requirePermission(ctx, 'settings.backup', 'edit')
      const days = parseInput(keepDaysSchema, keepDays ?? readSetting(db, 'backup.keepDays'))
      return pruneFiles(ctx, days)
    }
  }
}

export type BackupService = ReturnType<typeof createBackupService>
