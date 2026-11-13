// Migration 0022 (S-107, K-51, K-58): staff_faces, the staff exclusion list's sealed face vectors. Additive only; an older
// database keeps every row; the table never leaves the computer (no backup, export, read-only copy or Drive box).
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { openDatabase } from '../../src/main/db/client'
import { BIOMETRIC_TABLES } from '../../src/main/backup/biometric'
import { allSchemaTables, copiedTables, LOCAL_ONLY_TABLES } from '../../src/main/replica/tables'
import { MIGRATIONS, memoryDatabase, SCHEMA_VERSION } from '../factories/db'

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

describe('0022: personel yüz tablosu', () => {
  it('boş veritabanında tablo, sütunlar ve dizin gelir; kırpma ve ad sütunu yok; sağlık denetimleri temiz', async () => {
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(23)
    const db = await memoryDatabase()
    expect(columns(db.sqlite, 'staff_faces')).toEqual([
      'id',
      'employee_id',
      'embedding_enc',
      'model',
      'model_version',
      'enrolled_at',
      'enrolled_by',
      'created_at',
      'updated_at'
    ])
    expect(
      (db.sqlite.pragma('index_list("staff_faces")') as { name: string }[])
        .map((i) => i.name)
        .filter((n) => !n.startsWith('sqlite_autoindex'))
    ).toEqual(['staff_faces_employee_idx'])
    expect(db.sqlite.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }])
    expect(db.sqlite.pragma('foreign_key_check')).toEqual([])
    db.close()
  })

  it('0021 anlık görüntüsü (eski yedek) yeni sürümde açılır, satırlar korunur', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bismuth-0022-'))
    temps.push(dir)
    const file = join(dir, 'bismuth.db')
    const old = await openDatabase({ file, migrationsFolder: migrationsUpTo(dir, 22) })
    old.sqlite
      .prepare(
        "insert into guests (id, first_name, last_name, name_normalized, created_at, updated_at) values ('gu1', 'Örnek', 'Misafir', 'ornek misafir', 'x', 'x')"
      )
      .run()
    old.close()
    const current = await openDatabase({
      file,
      migrationsFolder: MIGRATIONS,
      backupDir: join(dir, 'backups')
    })
    expect(current.sqlite.prepare('select count(*) c from guests').get()).toEqual({ c: 1 })
    expect(columns(current.sqlite, 'staff_faces')).toContain('embedding_enc')
    expect(current.sqlite.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }])
    current.close()
  })

  it('tablo yedeğe, çoğaltmaya ve kutuya girmez: biyometrik listede, yerel-yalnız listede, tetikleyicisi yok', async () => {
    expect(BIOMETRIC_TABLES).toContain('staff_faces')
    expect(Object.keys(LOCAL_ONLY_TABLES)).toContain('staff_faces')
    expect(allSchemaTables()).toContain('staff_faces')
    expect(copiedTables().map((t) => t.name)).not.toContain('staff_faces')
    const db = await memoryDatabase()
    const before = db.sqlite.prepare('select count(*) c from change_log').get() as { c: number }
    db.sqlite.pragma('foreign_keys = OFF')
    db.sqlite
      .prepare(
        "insert into staff_faces (id, employee_id, embedding_enc, model, enrolled_at, enrolled_by, created_at, updated_at) values ('s1', 'e1', x'00', 'buffalo_s', 'x', 'u1', 'x', 'x')"
      )
      .run()
    expect(db.sqlite.prepare('select count(*) c from change_log').get()).toEqual(before)
    db.close()
  })
})
