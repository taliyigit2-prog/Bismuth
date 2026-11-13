// K-51: a backup (and so the Drive copy, which is the same file encrypted) and a pre-migration snapshot carry no
// face vector or crop; the live database keeps its rows. Names and bytes are invented.
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { depsOf, roleCtx, testClock } from '../../../tests/factories/ctx'
import { MIGRATIONS } from '../../../tests/factories/db'
import { BIOMETRIC_TABLES, scrubBiometricData } from '../backup/biometric'
import { readArchive } from '../backup/archive'
import { backupBeforeMigration } from '../backup/pre-migration'
import { openDatabase, type DatabaseHandle } from '../db/client'
import { seedBaseData } from '../db/seed/seed'
import { BACKUP_DB_NAME, createBackupService } from './backup-service'

const MARK = 'SEALED-FACE-BYTES-0123456789'
let handle: DatabaseHandle | undefined
const temps: string[] = []
afterEach(() => {
  handle?.close()
  handle = undefined
  for (const d of temps.splice(0)) rmSync(d, { recursive: true, force: true })
})

function fillBiometric(h: DatabaseHandle): void {
  const s = h.sqlite
  s.pragma('foreign_keys = OFF') // the rows below only need to exist
  const face = s.prepare(
    "insert into guest_faces (id, guest_id, embedding_enc, crop_enc, model, enrolled_at, enrolled_by, created_at, updated_at) values (?, 'g1', ?, ?, 'sface', 'x', 'u1', 'x', 'x')"
  )
  for (let i = 0; i < 40; i++) face.run(`f${i}`, Buffer.from(MARK.repeat(30)), Buffer.from(MARK.repeat(60)))
  s.prepare(
    "insert into camera_events (id, kind, occurred_at, crop_enc, created_at, updated_at) values ('e1', 'alarm', 'x', ?, 'x', 'x')"
  ).run(Buffer.from(MARK))
  s.pragma('foreign_keys = ON')
}

const count = (file: string, table: string): number => {
  const db = new Database(file, { readonly: true })
  try {
    return (db.prepare(`select count(*) c from ${table}`).get() as { c: number }).c
  } finally {
    db.close()
  }
}

describe('biyometrik tablolar yedeğe girmez (K-51)', () => {
  it('elle yedek: arşivdeki veritabanında yüz ve olay satırı yok, dosyada işaretli bayt kalmaz; canlı veritabanı korunur', async () => {
    const root = mkdtempSync(join(tmpdir(), 'bismuth-bio-'))
    temps.push(root)
    mkdirSync(join(root, 'attachments'))
    handle = await openDatabase({ file: join(root, 'bismuth.db'), migrationsFolder: MIGRATIONS })
    seedBaseData(handle.db)
    fillBiometric(handle)
    const backupsDir = join(root, 'backups')
    const svc = createBackupService({
      ...depsOf(handle, testClock('2026-10-01T09:00:00.000Z')),
      sqlite: handle.sqlite,
      backupsDir,
      attachmentsDir: join(root, 'attachments'),
      restoreMarkerPath: join(root, 'restore-pending.json'),
      dbFile: join(root, 'bismuth.db'),
      schemaVersion: () => handle!.schemaVersion,
      stepping: { pagesPerStep: 8, restMs: 0, sleep: () => new Promise<void>((r) => setImmediate(r)) }
    })
    const item = await svc.run(roleCtx('owner', 'u-owner'), {})
    const out = join(root, 'acilan')
    await readArchive(join(backupsDir, item.id), out)
    const copy = join(out, BACKUP_DB_NAME)
    for (const table of BIOMETRIC_TABLES) expect(count(copy, table)).toBe(0)
    expect(readFileSync(copy).includes(Buffer.from(MARK))).toBe(false)
    expect(count(join(root, 'bismuth.db'), 'guest_faces')).toBe(40)
    expect(count(join(root, 'bismuth.db'), 'camera_events')).toBe(1)
  })

  it('migrasyon öncesi anlık kopya da yüz verisi taşımaz', async () => {
    const root = mkdtempSync(join(tmpdir(), 'bismuth-bio-'))
    temps.push(root)
    handle = await openDatabase({ file: join(root, 'bismuth.db'), migrationsFolder: MIGRATIONS })
    fillBiometric(handle)
    const snapshot = await backupBeforeMigration(handle.sqlite, join(root, 'b'), '1.0.0')
    expect(readdirSync(join(root, 'b'))).toHaveLength(1)
    expect(count(snapshot, 'guest_faces')).toBe(0)
    expect(readFileSync(snapshot).includes(Buffer.from(MARK))).toBe(false)
    expect(count(join(root, 'bismuth.db'), 'guest_faces')).toBe(40)
  })

  it('tablolar boş olsa da önceki silmelerden kalan serbest sayfalardaki baytlar kopyada kalmaz', async () => {
    const root = mkdtempSync(join(tmpdir(), 'bismuth-bio-'))
    temps.push(root)
    const file = join(root, 'copy.db')
    handle = await openDatabase({ file, migrationsFolder: MIGRATIONS })
    fillBiometric(handle)
    handle.sqlite.exec('delete from guest_faces; delete from camera_events')
    handle.close()
    handle = undefined
    expect(scrubBiometricData(file)).toBe(0)
    expect(readFileSync(file).includes(Buffer.from(MARK))).toBe(false)
  })

  it('scrubBiometricData: tabloları olmayan eski şema kopyasını bozmaz', () => {
    const root = mkdtempSync(join(tmpdir(), 'bismuth-bio-'))
    temps.push(root)
    const file = join(root, 'old.db')
    const db = new Database(file)
    db.exec('create table guests (id text)')
    db.close()
    expect(scrubBiometricData(file)).toBe(0)
  })
})
