// Upgrading a real older database (G-133; faz-02 kabul ölçütü "migrasyonlar ileri yönde idempotent"): a database
// made by the first release (only 0000) is migrated to the current schema without losing a row, with a backup,
// and opening it again changes nothing.
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { openDatabase } from '../../src/main/db/client'
import { seedBaseData } from '../../src/main/db/seed/seed'
import { MIGRATIONS, SCHEMA_VERSION } from '../factories/db'

const temps: string[] = []
afterEach(() => {
  for (const d of temps.splice(0)) rmSync(d, { recursive: true, force: true })
})

/** A copy of the migrations folder that stops after the first `count` migrations. */
function migrationsUpTo(dir: string, count: number): string {
  const staged = join(dir, `drizzle-${count}`)
  cpSync(MIGRATIONS, staged, { recursive: true })
  const journalPath = join(staged, 'meta', '_journal.json')
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: { tag: string }[] }
  journal.entries = journal.entries.slice(0, count)
  writeFileSync(journalPath, JSON.stringify(journal))
  return staged
}

describe('eski veritabanının yükseltilmesi', () => {
  it('v0 (yalnız 0000) veritabanı verisini kaybetmeden güncel şemaya geçer; ikinci açılış hiçbir şey değiştirmez', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bismuth-upgrade-'))
    temps.push(dir)
    const file = join(dir, 'bismuth.db')
    const v0 = await openDatabase({ file, migrationsFolder: migrationsUpTo(dir, 1) })
    expect(v0.schemaVersion).toBe(1)
    v0.sqlite
      .prepare(
        "insert into settings (key, value_json, updated_at) values ('hotel.name', '\"Lale\"', '2026-09-01T00:00:00Z')"
      )
      .run()
    v0.sqlite
      .prepare(
        "insert into roles (id, name, is_system, created_at, updated_at) values ('r-old', 'Gece resepsiyonu', 0, 'x', 'x')"
      )
      .run()
    v0.close()

    const current = await openDatabase({
      file,
      migrationsFolder: MIGRATIONS,
      backupDir: join(dir, 'backups'),
      appVersion: '0.2.0'
    })
    expect(current.schemaVersion).toBe(SCHEMA_VERSION)
    expect(current.integrity).toBe('ok')
    expect(current.backupPath).not.toBeNull()
    const role = current.sqlite.prepare("select name, code from roles where id = 'r-old'").get()
    expect(role).toEqual({ name: 'Gece resepsiyonu', code: null })
    expect(current.sqlite.prepare("select value_json from settings where key = 'hotel.name'").get()).toEqual({
      value_json: '"Lale"'
    })
    seedBaseData(current.db)
    const tables = (
      current.sqlite.prepare("select count(*) n from sqlite_master where type = 'table'").get() as {
        n: number
      }
    ).n
    current.close()

    const again = await openDatabase({ file, migrationsFolder: MIGRATIONS, backupDir: join(dir, 'backups') })
    expect(again.backupPath).toBeNull() // nothing pending → no new backup
    expect(readdirSync(join(dir, 'backups'))).toHaveLength(1)
    expect(
      (
        again.sqlite.prepare("select count(*) n from sqlite_master where type = 'table'").get() as {
          n: number
        }
      ).n
    ).toBe(tables)
    expect(seedBaseData(again.db).inserted).toEqual({})
    again.close()
  })

  it('Faz 2 veritabanı (0000+0001) sonraki migrasyonlarla: rol bayrakları dolar, denetim kaydı değiştirilemez olur', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bismuth-upgrade-'))
    temps.push(dir)
    const file = join(dir, 'bismuth.db')
    const v1 = await openDatabase({ file, migrationsFolder: migrationsUpTo(dir, 2) })
    // The seed code follows the current schema, so the older roles are written as that version had them.
    const role = v1.sqlite.prepare(
      "insert into roles (id, name, is_system, code, created_at, updated_at) values (?, ?, 1, ?, 'x', 'x')"
    )
    for (const code of ['owner', 'reception', 'housekeeping', 'employee']) role.run(`r-${code}`, code, code)
    v1.sqlite
      .prepare(
        "insert into audit_log (id, ts, entity, entity_id, action) values ('a1', '2026-10-01T09:00:00Z', 'settings', 'x', 'update')"
      )
      .run()
    v1.close()

    const current = await openDatabase({
      file,
      migrationsFolder: MIGRATIONS,
      backupDir: join(dir, 'backups')
    })
    expect(current.schemaVersion).toBe(SCHEMA_VERSION)
    const flags = current.sqlite
      .prepare('select code, tasks_own_only flag from roles order by code')
      .all() as { code: string; flag: number }[]
    expect(flags.filter((r) => r.flag === 1).map((r) => r.code)).toEqual(['employee', 'housekeeping'])
    // 0005–0006: every older role may sign in from outside as before and none is archived.
    const access = current.sqlite.prepare('select remote_allowed r, archived_at a from roles').all() as {
      r: number
      a: string | null
    }[]
    expect(access.every((row) => row.r === 1 && row.a === null)).toBe(true)
    const columns = (table: string) =>
      (current.sqlite.prepare(`pragma table_info(${table})`).all() as { name: string }[]).map((c) => c.name)
    expect(columns('payments')).toContain('fx_rate_observed_at')
    expect(columns('expenses')).toContain('fx_rate_observed_at')
    const indexes = (
      current.sqlite.prepare("select name from sqlite_master where type = 'index'").all() as {
        name: string
      }[]
    ).map((i) => i.name)
    expect(indexes).toEqual(
      expect.arrayContaining([
        'expenses_drawer_idx',
        'reservation_rooms_status_idx',
        'stay_occupants_guest_idx',
        'fx_rates_source_idx'
      ])
    )
    expect(() => current.sqlite.prepare("update audit_log set reason = 'x' where id = 'a1'").run()).toThrow(
      /append-only/
    )
    expect(() => current.sqlite.prepare("delete from audit_log where id = 'a1'").run()).toThrow(/append-only/)
    // REPLACE removes the old row without a DELETE trigger: 0004 refuses a taken id at insert time.
    expect(() =>
      current.sqlite
        .prepare(
          "insert or replace into audit_log (id, ts, entity, entity_id, action) values ('a1', 'x', 'settings', 'y', 'update')"
        )
        .run()
    ).toThrow(/append-only/)
    current.sqlite
      .prepare(
        "insert into audit_log (id, ts, entity, entity_id, action) values ('a2', '2026-10-02T09:00:00Z', 'settings', 'x', 'update')"
      )
      .run()
    expect(current.sqlite.prepare('select id, entity_id from audit_log order by id').all()).toEqual([
      { id: 'a1', entity_id: 'x' },
      { id: 'a2', entity_id: 'x' }
    ])
    current.close()
  })

  it('0012: var olan her çalışan kartı kendi giriş/çıkış tarihleriyle bir çalışma dönemi alır (P7fix B6)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bismuth-upgrade-'))
    temps.push(dir)
    const file = join(dir, 'bismuth.db')
    const v11 = await openDatabase({ file, migrationsFolder: migrationsUpTo(dir, 12) })
    const add = v11.sqlite.prepare(
      "insert into employees (id, first_name, last_name, start_date, end_date, created_at, updated_at) values (?, 'A', 'B', ?, ?, 'x', 'x')"
    )
    add.run('e1', '2026-01-01', '2026-03-31')
    add.run('e2', '2026-02-15', null)
    v11.close()
    const current = await openDatabase({
      file,
      migrationsFolder: MIGRATIONS,
      backupDir: join(dir, 'backups')
    })
    expect(
      current.sqlite
        .prepare(
          'select employee_id e, start_date s, end_date x from employment_periods order by employee_id'
        )
        .all()
    ).toEqual([
      { e: 'e1', s: '2026-01-01', x: '2026-03-31' },
      { e: 'e2', s: '2026-02-15', x: null }
    ])
    current.close()
  })

  it("0000'dan son sürüme adım adım: her migrasyondan sonra önceki adımların bütün satırları korunur (Faz 16)", async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bismuth-upgrade-'))
    temps.push(dir)
    const file = join(dir, 'bismuth.db')
    /** Every row written so far, per table, as it read right after it was written. */
    const kept = new Map<string, Record<string, unknown>[]>()
    for (let step = 1; step <= SCHEMA_VERSION; step++) {
      const handle = await openDatabase({ file, migrationsFolder: migrationsUpTo(dir, step) })
      expect(handle.schemaVersion).toBe(step)
      expect(handle.integrity).toBe('ok')
      const tables = userTables(handle.sqlite)
      // Nothing written by an earlier version is lost or changed (new columns may be added beside it).
      for (const [table, rows] of kept) {
        expect(tables, `step ${step}: table ${table} kept`).toContain(table)
        const now = handle.sqlite.prepare(`select * from "${table}"`).all() as Record<string, unknown>[]
        for (const row of rows) {
          const seen = now.map((r) => JSON.stringify(pick(r, Object.keys(row))))
          expect(seen, `step ${step}: ${table} ${JSON.stringify(row)}`).toContain(JSON.stringify(row))
        }
      }
      // This version's own sample: one more row in every table, the references pointing at this step's rows.
      handle.sqlite.pragma('foreign_keys = OFF')
      for (const table of tables) {
        // The change log (0013) is written by the triggers on every other table, never by hand.
        if (table === 'change_log') continue
        const row = sampleRow(handle.sqlite, table, step)
        const cols = Object.keys(row)
        handle.sqlite
          .prepare(
            `insert into "${table}" (${cols.map((c) => `"${c}"`).join(', ')}) values (${cols.map(() => '?').join(', ')})`
          )
          .run(...Object.values(row))
        kept.set(table, [...(kept.get(table) ?? []), row])
      }
      handle.sqlite.pragma('foreign_keys = ON')
      expect(handle.sqlite.pragma('foreign_key_check')).toEqual([])
      handle.close()
    }
    const last = await openDatabase({ file, migrationsFolder: MIGRATIONS })
    expect(last.schemaVersion).toBe(SCHEMA_VERSION)
    const count = (table: string) =>
      (last.sqlite.prepare(`select count(*) n from "${table}"`).get() as { n: number }).n
    // v0's tables carry a row from every version; 0012 copied each older employee card into a period and the
    // last step added one more of its own.
    expect(count('settings')).toBe(SCHEMA_VERSION)
    expect(count('employees')).toBe(SCHEMA_VERSION - 1)
    expect(count('employment_periods')).toBe(SCHEMA_VERSION - 1)
    last.close()
  })
})

/** The program's tables (not drizzle's journal or SQLite's own). */
function userTables(sqlite: Database.Database): string[] {
  return (
    sqlite
      .prepare(
        "select name from sqlite_master where type = 'table' and name not like 'sqlite_%' and name <> '__drizzle_migrations' order by name"
      )
      .all() as { name: string }[]
  ).map((t) => t.name)
}

function pick(row: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(keys.map((k) => [k, row[k]]))
}

/**
 * One invented row for `table` at `step`: every column filled (a migration that rewrote or dropped a value would
 * show), ids and texts unique per step, references to the same step's row of the referenced table.
 */
function sampleRow(sqlite: Database.Database, table: string, step: number): Record<string, unknown> {
  const fks = new Map(
    (sqlite.pragma(`foreign_key_list("${table}")`) as { from: string; table: string }[]).map((f) => [
      f.from,
      f.table
    ])
  )
  const columns = sqlite.pragma(`table_info("${table}")`) as { name: string; type: string }[]
  return Object.fromEntries(
    columns.map((c) => {
      const ref = fks.get(c.name)
      if (ref) return [c.name, `${ref}-${step}`]
      if (c.name === 'id') return [c.name, `${table}-${step}`]
      if (/INT/i.test(c.type)) return [c.name, step]
      if (/REAL/i.test(c.type)) return [c.name, step + 0.5]
      return [c.name, `${table}.${c.name}.${step}`]
    })
  )
}
