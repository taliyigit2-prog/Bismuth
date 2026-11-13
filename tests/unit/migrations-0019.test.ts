// Migration 0019 (K-48, S-100): hourly day slots on room_nights, an hourly price on room types, and the reception
// refund right moving from the old default 'none' to 'edit'. An older database keeps every row; start_time stays null.
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { openDatabase } from '../../src/main/db/client'
import { MIGRATIONS, memoryDatabase, seededDatabase } from '../factories/db'

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

const columns = (sqlite: Database.Database, table: string): string[] =>
  (sqlite.pragma(`table_info("${table}")`) as { name: string }[]).map((c) => c.name)

const night = (
  sqlite: Database.Database,
  id: string,
  room: string,
  date: string,
  slot: 'night' | 'day',
  start: string | null = null,
  end: string | null = null
): void => {
  sqlite
    .prepare(
      "insert into room_nights (id, reservation_room_id, room_id, date, slot, start_time, end_time, price_minor, currency, created_at, updated_at) values (?, 'rr', ?, ?, ?, ?, ?, 1000, 'TRY', 'x', 'x')"
    )
    .run(id, room, date, slot, start, end)
}

describe('0019: saatlik konaklama dilimi', () => {
  it('boş veritabanında 0000→0019: yeni sütunlar boş başlar, sağlık denetimleri temiz', async () => {
    const db = await memoryDatabase()
    expect(columns(db.sqlite, 'room_nights')).toEqual(expect.arrayContaining(['start_time', 'end_time']))
    expect(columns(db.sqlite, 'room_types')).toContain('hourly_price_minor')
    expect(db.sqlite.pragma('foreign_key_check')).toEqual([])
    expect(db.sqlite.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }])
    db.close()
  })

  it('aynı odada aynı gün farklı başlangıçlı saatli kayıtlar durur; aynı kayıt, ikinci gece ve ikinci tüm-gün reddedilir', async () => {
    const db = await memoryDatabase()
    db.sqlite.pragma('foreign_keys = OFF')
    const s = db.sqlite
    night(s, 'h1', 'r1', '2026-11-01', 'day', '09:00', '12:00')
    night(s, 'h2', 'r1', '2026-11-01', 'day', '13:00', '16:00')
    night(s, 'h3', 'r1', '2026-11-01', 'day', '18:00', '20:00')
    night(s, 'n1', 'r1', '2026-11-01', 'night') // a night and day slots share a date
    night(s, 'h4', 'r2', '2026-11-01', 'day', '09:00', '12:00') // another room
    night(s, 'h5', 'r1', '2026-11-02', 'day', '09:00', '12:00') // another day
    expect(() => night(s, 'x1', 'r1', '2026-11-01', 'day', '13:00', '15:00')).toThrow(/UNIQUE/)
    expect(() => night(s, 'x2', 'r1', '2026-11-01', 'night')).toThrow(/UNIQUE/)
    night(s, 'w1', 'r3', '2026-11-01', 'day') // whole-day use, as before 0019
    expect(() => night(s, 'x3', 'r3', '2026-11-01', 'day')).toThrow(/UNIQUE/)
    // A night in the same room and date as a whole-day use is still two different slots.
    night(s, 'w2', 'r3', '2026-11-01', 'night')
    db.close()
  })

  it('0018 veritabanı yükseltilir: eski gece ve gündüz satırları korunur, start_time/end_time boş kalır', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bismuth-0019-'))
    temps.push(dir)
    const file = join(dir, 'bismuth.db')
    const old = await openDatabase({ file, migrationsFolder: migrationsUpTo(dir, 19 - 1) })
    expect(old.schemaVersion).toBe(18)
    expect(columns(old.sqlite, 'room_nights')).not.toContain('start_time')
    old.sqlite.pragma('foreign_keys = OFF')
    const insert = old.sqlite.prepare(
      "insert into room_nights (id, reservation_room_id, room_id, date, slot, price_minor, currency, created_at, updated_at) values (?, 'rr', ?, ?, ?, 2500, 'TRY', 'x', 'x')"
    )
    insert.run('n1', 'r1', '2026-10-01', 'night')
    insert.run('n2', 'r1', '2026-10-02', 'night')
    insert.run('d1', 'r1', '2026-10-02', 'day')
    old.sqlite
      .prepare(
        "insert into room_types (id, code, name, \"group\", is_custom, sort, active, created_at, updated_at) values ('t1', 'dbl', 'Double', 'tier', 0, 0, 1, 'x', 'x')"
      )
      .run()
    old.close()

    const current = await openDatabase({
      file,
      migrationsFolder: MIGRATIONS,
      backupDir: join(dir, 'backups')
    })
    expect(current.backupPath).not.toBeNull()
    expect(current.integrity).toBe('ok')
    // (the sample room_nights rows have no parents on purpose, so foreign_key_check is checked on the empty database above)
    expect(
      current.sqlite
        .prepare('select id, slot, start_time s, end_time e, price_minor p from room_nights order by id')
        .all()
    ).toEqual([
      { id: 'd1', slot: 'day', s: null, e: null, p: 2500 },
      { id: 'n1', slot: 'night', s: null, e: null, p: 2500 },
      { id: 'n2', slot: 'night', s: null, e: null, p: 2500 }
    ])
    expect(
      current.sqlite.prepare("select hourly_price_minor h from room_types where id = 't1'").get()
    ).toEqual({
      h: null
    })
    // The old rows are covered by the new indexes: another whole-day use / night on those days is refused.
    current.sqlite.pragma('foreign_keys = OFF')
    expect(() => night(current.sqlite, 'x1', 'r1', '2026-10-02', 'day')).toThrow(/UNIQUE/)
    expect(() => night(current.sqlite, 'x2', 'r1', '2026-10-02', 'night')).toThrow(/UNIQUE/)
    // ...while an hourly sale beside the old whole-day row is for the service to judge (K-48), not the index.
    night(current.sqlite, 'h1', 'r1', '2026-10-03', 'day', '09:00', '11:00')
    current.close()
  })

  it('S-100: resepsiyonun payments.refund = none satırı edit olur, denetim satırı yazılır; view/edit ve diğer roller korunur', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bismuth-0019-'))
    temps.push(dir)
    const file = join(dir, 'bismuth.db')
    const old = await openDatabase({ file, migrationsFolder: migrationsUpTo(dir, 18) })
    const role = old.sqlite.prepare(
      'insert into roles (id, name, is_system, code, created_at, updated_at) values (?, ?, ?, ?, ?, ?)'
    )
    role.run('r-reception', 'Reception', 1, 'reception', 'x', 'x')
    role.run('r-manager', 'Manager', 1, 'manager', 'x', 'x')
    role.run('r-custom', 'Night desk', 0, null, 'x', 'x') // an owner-made role
    role.run('r-copy', 'Reception copy', 0, 'reception_custom', 'x', 'x')
    const perm = old.sqlite.prepare(
      'insert into role_permissions (role_id, permission, level) values (?, ?, ?)'
    )
    perm.run('r-reception', 'payments.refund', 'none')
    perm.run('r-reception', 'payments.create', 'edit')
    perm.run('r-reception', 'reports.view', 'none') // another right at none stays
    perm.run('r-manager', 'payments.refund', 'none') // not reception: untouched
    perm.run('r-custom', 'payments.refund', 'none')
    perm.run('r-copy', 'payments.refund', 'none')
    old.close()

    const current = await openDatabase({
      file,
      migrationsFolder: MIGRATIONS,
      backupDir: join(dir, 'backups')
    })
    const levels = current.sqlite
      .prepare('select role_id r, permission p, level l from role_permissions order by role_id, permission')
      .all()
    expect(levels).toEqual([
      { r: 'r-copy', p: 'payments.refund', l: 'none' },
      { r: 'r-custom', p: 'payments.refund', l: 'none' },
      { r: 'r-manager', p: 'payments.refund', l: 'none' },
      { r: 'r-reception', p: 'payments.create', l: 'edit' },
      { r: 'r-reception', p: 'payments.refund', l: 'edit' },
      { r: 'r-reception', p: 'reports.view', l: 'none' }
    ])
    expect(
      current.sqlite
        .prepare('select id, entity, entity_id, action, before_json b, after_json a, reason from audit_log')
        .all()
    ).toEqual([
      {
        id: 'mig0019-r-reception',
        entity: 'role_permission',
        entity_id: 'r-reception:payments.refund',
        action: 'update',
        b: '{"level":"none"}',
        a: '{"level":"edit"}',
        reason: 'migration_0019_s100'
      }
    ])
    current.close()

    // Opening again runs nothing: no second audit row.
    const again = await openDatabase({ file, migrationsFolder: MIGRATIONS })
    expect((again.sqlite.prepare('select count(*) n from audit_log').get() as { n: number }).n).toBe(1)
    again.close()
  })

  it('S-100: resepsiyon satırı zaten view ya da edit ise dokunulmaz ve denetim satırı yazılmaz', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bismuth-0019-'))
    temps.push(dir)
    const file = join(dir, 'bismuth.db')
    const old = await openDatabase({ file, migrationsFolder: migrationsUpTo(dir, 18) })
    old.sqlite
      .prepare(
        "insert into roles (id, name, is_system, code, created_at, updated_at) values ('r-reception', 'Reception', 1, 'reception', 'x', 'x')"
      )
      .run()
    old.sqlite
      .prepare(
        "insert into role_permissions (role_id, permission, level) values ('r-reception', 'payments.refund', 'view')"
      )
      .run()
    old.close()
    const current = await openDatabase({
      file,
      migrationsFolder: MIGRATIONS,
      backupDir: join(dir, 'backups')
    })
    expect(current.sqlite.prepare('select level from role_permissions').all()).toEqual([{ level: 'view' }])
    expect((current.sqlite.prepare('select count(*) n from audit_log').get() as { n: number }).n).toBe(0)
    current.close()
  })

  it('yeni kurulum: tohum resepsiyona payments.refund = edit verir (migrasyon boş tabloya dokunmaz)', async () => {
    const db = await seededDatabase()
    expect(
      db.sqlite
        .prepare(
          "select rp.level l from role_permissions rp join roles r on r.id = rp.role_id where r.code = 'reception' and rp.permission = 'payments.refund'"
        )
        .get()
    ).toEqual({ l: 'edit' })
    expect(
      (db.sqlite.prepare("select count(*) n from audit_log where id like 'mig0019-%'").get() as { n: number })
        .n
    ).toBe(0)
    db.close()
  })
})
