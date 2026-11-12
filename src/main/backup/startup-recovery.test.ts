// Faz 16 madde 2 "çökme sonrası kurtarma": a database damaged on the disk is recognised at start, the newest local
// backup that passes integrity_check is scheduled, and the next start opens it — the damaged file kept aside.
import {
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  writeSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { depsOf, roleCtx, testClock } from '../../../tests/factories/ctx'
import { MIGRATIONS, SCHEMA_VERSION } from '../../../tests/factories/db'
import { openDatabase, type DatabaseHandle } from '../db/client'
import { seedBaseData } from '../db/seed/seed'
import { settings } from '../db/schema'
import { memoryKeyStore } from '../security/bismuth-key'
import { applyPendingRestore, createBackupService } from '../services/backup-service'
import { formatDate } from '@shared/format'
import { localDateOf } from '@shared/date'
import { setMainLocale } from '../app/i18n'
import { recoveryDetail } from '../app/recovery-text'
import {
  isDamagedDatabaseError,
  localBackups,
  prepareRecoveryRestore,
  scheduleRecoveryRestore
} from './startup-recovery'

const owner = roleCtx('owner', 'u-owner')
const temps: string[] = []
let handle: DatabaseHandle | undefined
afterEach(() => {
  handle?.close()
  handle = undefined
  for (const d of temps.splice(0)) rmSync(d, { recursive: true, force: true })
})

async function hotelWithBackups(times: string[]) {
  const root = mkdtempSync(join(tmpdir(), 'bismuth-recovery-'))
  temps.push(root)
  const paths = {
    dbFile: join(root, 'bismuth.db'),
    attachmentsDir: join(root, 'attachments'),
    backupsDir: join(root, 'backups'),
    markerPath: join(root, 'restore-pending.json')
  }
  mkdirSync(paths.attachmentsDir, { recursive: true })
  handle = await openDatabase({ file: paths.dbFile, migrationsFolder: MIGRATIONS })
  seedBaseData(handle.db)
  const clock = testClock(times[0])
  const backup = createBackupService({
    ...depsOf(handle, clock),
    sqlite: handle.sqlite,
    backupsDir: paths.backupsDir,
    attachmentsDir: paths.attachmentsDir,
    restoreMarkerPath: paths.markerPath,
    dataDir: root,
    dbFile: paths.dbFile,
    appVersion: '1.0.0',
    schemaVersion: () => handle!.schemaVersion,
    keys: memoryKeyStore(),
    driveDir: () => null,
    stepping: { pagesPerStep: 64, restMs: 0, sleep: () => Promise.resolve() }
  })
  for (const [i, at] of times.entries()) {
    clock.set(at)
    handle.db
      .insert(settings)
      .values({ key: 'hotel.name', valueJson: JSON.stringify(`Otel ${i + 1}`), updatedAt: at })
      .onConflictDoUpdate({ target: settings.key, set: { valueJson: JSON.stringify(`Otel ${i + 1}`) } })
      .run()
    await backup.run(owner)
  }
  handle.close()
  handle = undefined
  return paths
}

/** Overwrites the 100-byte SQLite header: the file is no longer a database. */
function damageHeader(file: string): void {
  const fd = openSync(file, 'r+')
  writeSync(fd, Buffer.alloc(100, 7), 0, 100, 0)
  closeSync(fd)
  for (const side of ['-wal', '-shm']) rmSync(file + side, { force: true })
}

describe('bozuk veritabanından kurtarma (Faz 16)', () => {
  it('başlığı bozulan veritabanı açılmaz ve bu hata "bozuk veri" olarak tanınır', async () => {
    const paths = await hotelWithBackups(['2026-10-01T09:00:00.000Z'])
    damageHeader(paths.dbFile)
    const error = await openDatabase({ file: paths.dbFile, migrationsFolder: MIGRATIONS }).catch(
      (e: unknown) => e
    )
    expect(error).toBeInstanceOf(Error)
    expect(isDamagedDatabaseError(error)).toBe(true)
    expect(isDamagedDatabaseError(new Error('disk full'))).toBe(false)
  })

  it('en yeni sağlam yedek seçilir; sonraki açılışta geri yüklenir, bozuk dosya güvenlik klasöründe kalır', async () => {
    const paths = await hotelWithBackups(['2026-10-01T09:00:00.000Z', '2026-10-02T09:00:00.000Z'])
    expect(localBackups(paths.backupsDir).map((b) => b.id)).toHaveLength(2)
    damageHeader(paths.dbFile)

    const chosen = await scheduleRecoveryRestore({
      backupsDir: paths.backupsDir,
      markerPath: paths.markerPath,
      programSchemaVersion: SCHEMA_VERSION
    })
    expect(chosen?.id).toBe(localBackups(paths.backupsDir)[0]!.id)
    expect(existsSync(paths.markerPath)).toBe(true)

    const result = applyPendingRestore(paths)
    expect(result).toMatchObject({ status: 'restored', backupId: chosen!.id })
    handle = await openDatabase({ file: paths.dbFile, migrationsFolder: MIGRATIONS })
    expect(handle.integrity).toBe('ok')
    expect(handle.db.select().from(settings).where(eq(settings.key, 'hotel.name')).get()?.valueJson).toBe(
      JSON.stringify('Otel 2')
    )
    // The damaged file was not deleted: the restore kept it in its safety folder.
    const safety = readdirSync(paths.backupsDir).find((n) => n.startsWith('bismuth-safety_'))
    expect(safety).toBeDefined()
    expect(existsSync(join(paths.backupsDir, safety!, 'bismuth.db'))).toBe(true)
  })

  it('en yeni yedek de bozuksa bir öncekine geçilir; hiç sağlam yedek yoksa öneri yapılmaz', async () => {
    const paths = await hotelWithBackups(['2026-10-01T09:00:00.000Z', '2026-10-02T09:00:00.000Z'])
    const [newest, older] = localBackups(paths.backupsDir)
    writeFileSync(join(paths.backupsDir, newest!.id), 'yarım kalmış dosya')
    const chosen = await scheduleRecoveryRestore({
      backupsDir: paths.backupsDir,
      markerPath: paths.markerPath,
      programSchemaVersion: SCHEMA_VERSION
    })
    expect(chosen?.id).toBe(older!.id)

    rmSync(paths.markerPath)
    copyFileSync(join(paths.backupsDir, newest!.id), join(paths.backupsDir, older!.id))
    expect(
      await scheduleRecoveryRestore({
        backupsDir: paths.backupsDir,
        markerPath: paths.markerPath,
        programSchemaVersion: SCHEMA_VERSION
      })
    ).toBeNull()
    expect(existsSync(paths.markerPath)).toBe(false)
  })

  it('en yeni yedek bozuksa soru, gerçekten geri yüklenecek eski yedeğin tarihini ve saatini söyler', async () => {
    const paths = await hotelWithBackups(['2026-10-01T09:00:00.000Z', '2026-10-02T09:00:00.000Z'])
    const [newest, older] = localBackups(paths.backupsDir)
    writeFileSync(join(paths.backupsDir, newest!.id), 'yarım kalmış dosya')
    const opts = {
      backupsDir: paths.backupsDir,
      markerPath: paths.markerPath,
      programSchemaVersion: SCHEMA_VERSION
    }
    const prepared = await prepareRecoveryRestore(opts)
    expect(prepared?.backup.id).toBe(older!.id)
    // Nothing is scheduled before the person answers.
    expect(existsSync(paths.markerPath)).toBe(false)
    setMainLocale('tr')
    const text = recoveryDetail('open', prepared!.backup.at)
    expect(text).toContain(formatDate(localDateOf(older!.at), 'tr'))
    expect(text).not.toContain(formatDate(localDateOf(newest!.at), 'tr'))
    expect(text).toContain('12:00')
    // "Vazgeç": the unpacked copy goes; "Geri yükle": the marker names that same backup.
    prepared!.discard()
    expect(readdirSync(join(paths.backupsDir, '.restore'))).toEqual([])
    const again = await prepareRecoveryRestore(opts)
    await again!.schedule()
    expect(JSON.parse(readFileSync(paths.markerPath, 'utf8'))).toMatchObject({ backupId: older!.id })
  })

  it('programdan yeni bir sürümle alınmış yedek önerilmez', async () => {
    const paths = await hotelWithBackups(['2026-10-01T09:00:00.000Z'])
    expect(
      await scheduleRecoveryRestore({
        backupsDir: paths.backupsDir,
        markerPath: paths.markerPath,
        programSchemaVersion: SCHEMA_VERSION - 1
      })
    ).toBeNull()
  })
})
