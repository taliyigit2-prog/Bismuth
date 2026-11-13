// Migration 0021 (K-51…K-53, K-58): guest_faces and camera_events, the camera module's biometric tables. Additive
// only; an older database keeps every row. Rows hold sealed blobs and may be deleted for real (K-52).
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { openDatabase } from '../../src/main/db/client'
import { BIOMETRIC_TABLES } from '../../src/main/backup/biometric'
import { allSchemaTables, copiedTables, LOCAL_ONLY_TABLES } from '../../src/main/replica/tables'
import { MIGRATIONS, memoryDatabase, SCHEMA_VERSION, seededDatabase } from '../factories/db'

const temps: string[] = []
afterEach(() => {
  for (const d of temps.splice(0)) rmSync(d, { recursive: true, force: true })
})

function migrationsUpTo(dir: string, count: number): string {
  const staged = join(dir, `drizzle-${count}`)
  cpSync(MIGRATIONS, staged, { recursive: true })
  const journalPath = join(staged, 'meta', '_journal.json')
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: { tag: string }[] }
  journal.entries = journal.entries.slice(0, count)
  writeFileSync(journalPath, JSON.stringify(journal))
  return staged
}

const columns = (s: Database.Database, table: string): string[] =>
  (s.pragma(`table_info("${table}")`) as { name: string }[]).map((c) => c.name)
const indexes = (s: Database.Database, table: string): string[] =>
  (s.pragma(`index_list("${table}")`) as { name: string }[]).map((i) => i.name)

const addGuest = (s: Database.Database): void => {
  s.prepare(
    "insert into guests (id, first_name, last_name, name_normalized, created_at, updated_at) values ('gu1', 'Örnek', 'Misafir', 'ornek misafir', 'x', 'x')"
  ).run()
}

describe('0021: kamera tabloları', () => {
  it('boş veritabanında 0000→0021: tablolar, sütunlar ve dizinler gelir; rıza sütunu yok; sağlık denetimleri temiz', async () => {
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(22)
    const db = await memoryDatabase()
    expect(columns(db.sqlite, 'guest_faces')).toEqual([
      'id',
      'guest_id',
      'reservation_id',
      'embedding_enc',
      'crop_enc',
      'model',
      'model_version',
      'enrolled_at',
      'enrolled_by',
      'expires_at',
      'created_at',
      'updated_at'
    ])
    expect(columns(db.sqlite, 'camera_events')).toEqual([
      'id',
      'kind',
      'occurred_at',
      'state',
      'track_ref',
      'source_ref',
      'guest_id',
      'crop_enc',
      'expires_at',
      'seen_by',
      'seen_at',
      'handled_by',
      'handled_at',
      'created_at',
      'updated_at'
    ])
    expect(columns(db.sqlite, 'guest_faces').some((c) => /consent/.test(c))).toBe(false) // K-58
    expect(indexes(db.sqlite, 'guest_faces')).toEqual(
      expect.arrayContaining([
        'guest_faces_guest_idx',
        'guest_faces_reservation_idx',
        'guest_faces_expires_idx'
      ])
    )
    expect(indexes(db.sqlite, 'camera_events')).toEqual(
      expect.arrayContaining([
        'camera_events_occurred_idx',
        'camera_events_state_idx',
        'camera_events_guest_idx',
        'camera_events_expires_idx',
        'camera_events_source_unique'
      ])
    )
    expect(db.sqlite.pragma('foreign_key_check')).toEqual([])
    expect(db.sqlite.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }])
    db.close()
  })

  it('durum varsayılanı new; olmayan misafire bağlanamaz; aynı kaynak anahtarı iki kez girmez; satır gerçekten silinebilir (K-52)', async () => {
    const db = await seededDatabase()
    const s = db.sqlite
    addGuest(s)
    s.prepare(
      "insert into camera_events (id, kind, occurred_at, source_ref, created_at, updated_at) values ('e1', 'alarm', '2026-10-01T09:00:00Z', 'a|1', 'x', 'x')"
    ).run()
    expect(
      s.prepare("select state, guest_id g, crop_enc c from camera_events where id = 'e1'").get()
    ).toEqual({
      state: 'new',
      g: null,
      c: null
    })
    expect(() =>
      s
        .prepare(
          "insert into camera_events (id, kind, occurred_at, source_ref, created_at, updated_at) values ('e2', 'alarm', 'x', 'a|1', 'x', 'x')"
        )
        .run()
    ).toThrow(/UNIQUE/)
    // Events made here (no sidecar key) may be many.
    for (const id of ['e3', 'e4'])
      s.prepare(
        "insert into camera_events (id, kind, occurred_at, created_at, updated_at) values (?, 'recognized', 'x', 'x', 'x')"
      ).run(id)
    const insertFace = (guest: string): unknown =>
      s
        .prepare(
          "insert into guest_faces (id, guest_id, embedding_enc, model, enrolled_at, enrolled_by, created_at, updated_at) values ('f1', ?, x'0102', 'sface', 'x', ?, 'x', 'x')"
        )
        .run(
          guest,
          (s.prepare('select id from users limit 1').get() as { id: string } | undefined)?.id ?? 'nobody'
        )
    expect(() => insertFace('yok')).toThrow(/FOREIGN KEY/)
    expect(() => s.prepare("insert into guest_faces (id) values ('f2')").run()).toThrow(/NOT NULL/)
    // Physical deletion is allowed on these two tables only (K-52); no trigger stands in the way.
    s.pragma('foreign_keys = OFF') // no user row in the bare seed: the face row only needs to exist
    insertFace('gu1')
    s.pragma('foreign_keys = ON')
    expect(s.prepare("delete from guest_faces where id = 'f1'").run().changes).toBe(1)
    expect(s.prepare("delete from camera_events where id = 'e1'").run().changes).toBe(1)
    const triggers = s
      .prepare(
        "select name from sqlite_master where type = 'trigger' and tbl_name in ('guest_faces', 'camera_events')"
      )
      .all()
    expect(triggers).toEqual([])
    db.close()
  })

  it('0020 veritabanı (dolu) 0021 ile yükselir: eski satırlar korunur, yeni tablolar boş gelir, sağlık denetimleri temiz', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bismuth-0021-'))
    temps.push(dir)
    const file = join(dir, 'bismuth.db')
    const old = await openDatabase({ file, migrationsFolder: migrationsUpTo(dir, 21) })
    addGuest(old.sqlite)
    expect(
      old.sqlite.prepare("select name from sqlite_master where name = 'guest_faces'").get()
    ).toBeUndefined()
    old.close()

    const current = await openDatabase({
      file,
      migrationsFolder: MIGRATIONS,
      backupDir: join(dir, 'backups')
    })
    expect(current.schemaVersion).toBe(SCHEMA_VERSION)
    expect(current.sqlite.prepare('select count(*) c from guests').get()).toEqual({ c: 1 })
    expect(current.sqlite.prepare('select count(*) c from guest_faces').get()).toEqual({ c: 0 })
    expect(current.sqlite.prepare('select count(*) c from camera_events').get()).toEqual({ c: 0 })
    expect(current.sqlite.pragma('foreign_key_check')).toEqual([])
    expect(current.sqlite.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }])
    current.close()
  })

  it('0018 anlık görüntüsü (eski yedek) yeni sürümde açılır', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bismuth-0021-'))
    temps.push(dir)
    const file = join(dir, 'bismuth.db')
    const old = await openDatabase({ file, migrationsFolder: migrationsUpTo(dir, 19) })
    addGuest(old.sqlite)
    old.close()
    const current = await openDatabase({
      file,
      migrationsFolder: MIGRATIONS,
      backupDir: join(dir, 'backups')
    })
    expect(current.sqlite.prepare('select count(*) c from guests').get()).toEqual({ c: 1 })
    expect(columns(current.sqlite, 'guest_faces')).toContain('embedding_enc')
    expect(current.sqlite.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }])
    current.close()
  })

  it('iki tablo da çoğaltmaya ve kutuya girmez: yerel-yalnız listede, tetikleyicisi ve değişiklik günlüğü yok', async () => {
    for (const table of BIOMETRIC_TABLES) {
      expect(Object.keys(LOCAL_ONLY_TABLES)).toContain(table)
      expect(allSchemaTables()).toContain(table)
      expect(copiedTables().map((t) => t.name)).not.toContain(table)
    }
    const db = await seededDatabase()
    const before = db.sqlite.prepare('select count(*) c from change_log').get() as { c: number }
    db.sqlite
      .prepare(
        "insert into camera_events (id, kind, occurred_at, created_at, updated_at) values ('e9', 'alarm', 'x', 'x', 'x')"
      )
      .run()
    expect(db.sqlite.prepare('select count(*) c from change_log').get()).toEqual(before)
    db.close()
  })
})
