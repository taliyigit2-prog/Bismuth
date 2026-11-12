import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { isDamagedDatabaseError } from '../../src/main/backup/startup-recovery'
import { MigrationError, openDatabase } from '../../src/main/db/client'
import { MIGRATIONS, SCHEMA_VERSION, memoryDatabase } from '../factories/db'

const temps: string[] = []
const tempDir = (): string => {
  const d = mkdtempSync(join(tmpdir(), 'bismuth-db-'))
  temps.push(d)
  return d
}
afterEach(() => {
  for (const d of temps.splice(0)) rmSync(d, { recursive: true, force: true })
})

describe('veritabanı açılışı', () => {
  it('bellekte açılır, migrasyonlar uygulanır, bütünlük "ok"', async () => {
    const h = await memoryDatabase()
    const tables = h.sqlite
      .prepare("select name from sqlite_master where type='table' and name not like 'sqlite_%' order by name")
      .all()
      .map((r) => (r as { name: string }).name)
    expect(tables).toEqual(
      expect.arrayContaining([
        'audit_log',
        'devices',
        'role_permissions',
        'roles',
        'sessions',
        'settings',
        'users'
      ])
    )
    expect(h.schemaVersion).toBe(SCHEMA_VERSION)
    expect(h.integrity).toBe('ok')
    expect(h.sqlite.pragma('foreign_keys', { simple: true })).toBe(1)
    h.close()
  })

  it('dosyada WAL ve tam eşzamanlı yazma ile açılır', async () => {
    const dir = tempDir()
    const h = await openDatabase({ file: join(dir, 'bismuth.db'), migrationsFolder: MIGRATIONS })
    expect(h.sqlite.pragma('journal_mode', { simple: true })).toBe('wal')
    expect(h.sqlite.pragma('synchronous', { simple: true })).toBe(2) // FULL
    h.close()
  })

  it('yeni migrasyon gelince önce yedek alır; migrasyon bozuksa yedek yolunu bildirir', async () => {
    const dir = tempDir()
    const file = join(dir, 'bismuth.db')
    const first = await openDatabase({ file, migrationsFolder: MIGRATIONS, backupDir: join(dir, 'backups') })
    expect(first.backupPath).toBeNull() // fresh database → nothing to protect
    first.close()

    // Stage a broken second migration in a copy of the migrations folder.
    const staged = join(dir, 'drizzle')
    cpSync(MIGRATIONS, staged, { recursive: true })
    writeFileSync(join(staged, '0001_broken.sql'), 'CREATE TABLE x (;')
    const journalPath = join(staged, 'meta', '_journal.json')
    const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: Record<string, unknown>[] }
    journal.entries.push({ ...journal.entries[0], idx: 1, when: Date.now(), tag: '0001_broken' })
    writeFileSync(journalPath, JSON.stringify(journal))

    const attempt = openDatabase({
      file,
      migrationsFolder: staged,
      backupDir: join(dir, 'backups'),
      appVersion: '0.2.0'
    })
    await expect(attempt).rejects.toBeInstanceOf(MigrationError)
    const error = (await attempt.catch((e: unknown) => e)) as MigrationError
    expect(error.backupPath).toMatch(/bismuth-pre-migration_0\.2\.0_\d{8}-\d{6}\.db$/)
    expect(existsSync(error.backupPath!)).toBe(true)
    expect(readdirSync(join(dir, 'backups'))).toHaveLength(1)
  })

  it('bozuk veritabanı (integrity_check ≠ ok) migrasyondan önce durur: yedek alınmaz, migrasyon çalışmaz, kurtarma önerilir', async () => {
    const dir = tempDir()
    const file = join(dir, 'bismuth.db')
    ;(await openDatabase({ file, migrationsFolder: MIGRATIONS })).close()
    // An index that no longer matches its table: the file opens, integrity_check does not say "ok".
    const raw = new Database(file)
    raw.exec('CREATE TABLE bozuk (a INTEGER, b INTEGER); CREATE INDEX bozuk_i ON bozuk (a);')
    raw.exec('INSERT INTO bozuk VALUES (1, 100), (2, 200), (3, 300)')
    raw.unsafeMode(true) // lifts SQLite's defensive mode for this test connection only
    raw.pragma('writable_schema = ON')
    raw
      .prepare("UPDATE sqlite_master SET sql = 'CREATE INDEX bozuk_i ON bozuk (b)' WHERE name = 'bozuk_i'")
      .run()
    raw.close()
    const check = new Database(file)
    expect(String(check.pragma('integrity_check', { simple: true }))).not.toBe('ok')
    check.close()

    const staged = join(dir, 'drizzle')
    cpSync(MIGRATIONS, staged, { recursive: true })
    writeFileSync(join(staged, '9999_yeni.sql'), 'CREATE TABLE yeni_tablo (id INTEGER);')
    const journalPath = join(staged, 'meta', '_journal.json')
    const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: Record<string, unknown>[] }
    journal.entries.push({
      ...journal.entries[0],
      idx: journal.entries.length,
      when: Date.now(),
      tag: '9999_yeni'
    })
    writeFileSync(journalPath, JSON.stringify(journal))

    const error = await openDatabase({
      file,
      migrationsFolder: staged,
      backupDir: join(dir, 'backups')
    }).catch((e: unknown) => e)
    expect(isDamagedDatabaseError(error)).toBe(true)
    expect(existsSync(join(dir, 'backups'))).toBe(false)
    const after = new Database(file, { readonly: true })
    expect(after.prepare("SELECT name FROM sqlite_master WHERE name = 'yeni_tablo'").get()).toBeUndefined()
    after.close()
    // Without a pending migration the same file still opens (work goes on; the start warns and offers a backup).
    const opened = await openDatabase({ file, migrationsFolder: MIGRATIONS })
    expect(opened.integrity).not.toBe('ok')
    opened.close()
  })
})
