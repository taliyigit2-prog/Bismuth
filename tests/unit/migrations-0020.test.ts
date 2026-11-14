// Migration 0020 (G-194, S-101, S-106): group bookings. A new reservation_groups table and a nullable
// reservations.group_id; reservations made before it stay without a group (no backfill). An older database keeps
// every row, and the group folio mode setting defaults to a single folio on the leader.
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { openDatabase } from '../../src/main/db/client'
import { SETTINGS_DEFAULTS, settingsShape } from '../../src/shared/contract/settings'
import { MIGRATIONS, memoryDatabase, seededDatabase } from '../factories/db'

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

const columns = (sqlite: Database.Database, table: string): string[] =>
  (sqlite.pragma(`table_info("${table}")`) as { name: string }[]).map((c) => c.name)

const indexes = (sqlite: Database.Database, table: string): string[] =>
  (sqlite.pragma(`index_list("${table}")`) as { name: string }[]).map((i) => i.name)

describe('0020: grup rezervasyonları', () => {
  it('boş veritabanında 0000→0020: tablo, sütun ve indeks gelir; sağlık denetimleri temiz', async () => {
    const db = await memoryDatabase()
    expect(columns(db.sqlite, 'reservation_groups')).toEqual([
      'id',
      'name',
      'leader_guest_id',
      'folio_mode',
      'voided_at',
      'created_at',
      'updated_at'
    ])
    expect(columns(db.sqlite, 'reservations')).toContain('group_id')
    expect(indexes(db.sqlite, 'reservations')).toContain('reservations_group_idx')
    expect(db.sqlite.pragma('foreign_key_check')).toEqual([])
    expect(db.sqlite.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }])
    db.close()
  })

  it('folio_mode varsayılanı single; var olmayan lidere ve var olmayan gruba bağlanılamaz', async () => {
    const db = await seededDatabase()
    const s = db.sqlite
    s.prepare(
      "insert into reservation_groups (id, name, created_at, updated_at) values ('g1', 'Grup', 'x', 'x')"
    ).run()
    expect(
      s
        .prepare(
          "select folio_mode f, leader_guest_id l, voided_at v from reservation_groups where id = 'g1'"
        )
        .get()
    ).toEqual({ f: 'single', l: null, v: null })
    expect(() =>
      s
        .prepare(
          "insert into reservation_groups (id, name, leader_guest_id, created_at, updated_at) values ('g2', 'Grup', 'yok', 'x', 'x')"
        )
        .run()
    ).toThrow(/FOREIGN KEY/)
    s.prepare(
      "insert into guests (id, first_name, last_name, name_normalized, created_at, updated_at) values ('gu1', 'Örnek', 'Lider', 'ornek lider', 'x', 'x')"
    ).run()
    s.prepare(
      "insert into reservation_groups (id, name, leader_guest_id, folio_mode, created_at, updated_at) values ('g3', 'Grup', 'gu1', 'per_room', 'x', 'x')"
    ).run()
    const channel = s.prepare('select id from sales_channels limit 1').get() as { id: string }
    const insert = s.prepare(
      "insert into reservations (id, code, primary_guest_id, channel_id, status, kind, group_id, created_at, updated_at) values (?, ?, 'gu1', ?, 'confirmed', 'overnight', ?, 'x', 'x')"
    )
    insert.run('r1', 'R-1', channel.id, 'g3')
    insert.run('r2', 'R-2', channel.id, null)
    expect(() => insert.run('r3', 'R-3', channel.id, 'yok')).toThrow(/FOREIGN KEY/)
    expect(s.pragma('foreign_key_check')).toEqual([])
    db.close()
  })

  it('0019 veritabanı yükseltilir: eski rezervasyonlar grupsuz kalır, hiçbir satır kaybolmaz', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bismuth-0020-'))
    temps.push(dir)
    const file = join(dir, 'bismuth.db')
    const old = await openDatabase({ file, migrationsFolder: migrationsUpTo(dir, 20 - 1) })
    expect(old.schemaVersion).toBe(19)
    expect(columns(old.sqlite, 'reservations')).not.toContain('group_id')
    old.sqlite.pragma('foreign_keys = OFF')
    const insert = old.sqlite.prepare(
      "insert into reservations (id, code, primary_guest_id, channel_id, status, kind, created_at, updated_at) values (?, ?, 'g', 'c', 'confirmed', 'overnight', 'x', 'x')"
    )
    insert.run('r1', 'R-1')
    insert.run('r2', 'R-2')
    old.close()

    const current = await openDatabase({
      file,
      migrationsFolder: MIGRATIONS,
      backupDir: join(dir, 'backups')
    })
    expect(current.backupPath).not.toBeNull()
    expect(current.integrity).toBe('ok')
    expect(current.sqlite.prepare('select id, group_id g from reservations order by id').all()).toEqual([
      { id: 'r1', g: null },
      { id: 'r2', g: null }
    ])
    expect(current.sqlite.prepare('select count(*) n from reservation_groups').get()).toEqual({ n: 0 })
    current.close()
  })

  it('ayar kataloğu: booking.groupFolioMode per_room ve single kabul eder, başka değeri reddeder', () => {
    expect(SETTINGS_DEFAULTS['booking.groupFolioMode']).toBe('single')
    const shape = settingsShape['booking.groupFolioMode']
    expect(shape.safeParse('per_room').success).toBe(true)
    expect(shape.safeParse('single').success).toBe(true)
    expect(shape.safeParse('shared').success).toBe(false)
  })
})
