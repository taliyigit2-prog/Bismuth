// Spike S-B (faz-13 madde 2–3): the change log generated from the schema, and the read-only copy fed from it.
// A seeded random generator plays many sequences of inserts, updates (also of a key), deletes and appends on
// tables of every kind (single key, two-column key, settings, the append-only audit log); a snapshot is taken in the
// middle while writing goes on; the copy must end equal to the source table by table (digests), stay equal when
// everything is applied twice, and take 1 000 changes in under a second.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MIGRATIONS, SCHEMA_VERSION, seededDatabase } from '../../../tests/factories/db'
import { openReplicaDatabase, type DatabaseHandle, type ReplicaDatabase } from '../db/client'
import { allSchemaTables, copiedTables, LOCAL_ONLY_TABLES, SECRET_COLUMNS } from './tables'
import { changeLogTriggers, installedTriggers, installChangeLog, TRIGGER_PREFIX } from './triggers'
import { logBounds, readChanges, snapshotMeta, snapshotRows, tableDigests } from './feed'
import { applyChanges, applySnapshot, readState } from './apply'

/** mulberry32: a small seeded generator, so a failing sequence can be played again from its seed. */
function rng(seed: number) {
  let a = seed >>> 0
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    int: (n: number): number => Math.floor(next() * n),
    pick: <T>(list: readonly T[]): T => list[Math.floor(next() * list.length)]!
  }
}

let source: DatabaseHandle
let dir: string
let replica: ReplicaDatabase

beforeEach(async () => {
  source = await seededDatabase()
  dir = mkdtempSync(join(tmpdir(), 'bismuth-replica-'))
  replica = openReplicaDatabase({ file: join(dir, 'replica.db'), migrationsFolder: MIGRATIONS })
})
afterEach(() => {
  replica.close()
  source.close()
  rmSync(dir, { recursive: true, force: true })
})

const ALL = { identity: true }

/** Snapshot → copy, then every change after it, in pages. */
function sync(at = new Date('2026-10-05T10:00:00.000Z')): void {
  const meta = snapshotMeta(source.sqlite, SCHEMA_VERSION, at)
  applySnapshot(replica.writer, meta, snapshotRows(source.sqlite, ALL), {
    identity: true,
    source: 'live',
    asOf: at.toISOString()
  })
  catchUp()
}

function catchUp(): void {
  for (;;) {
    const page = readChanges(source.sqlite, readState(replica.writer).seq, 500, ALL)
    if (page.length === 0) return
    const r = applyChanges(replica.writer, page, { identity: true, source: 'live', asOf: 'x' })
    if (r.status !== 'applied' || !r.complete) throw new Error(`apply stopped: ${JSON.stringify(r)}`)
  }
}

const digestsEqual = (): void =>
  expect(tableDigests(replica.writer, ALL)).toEqual(tableDigests(source.sqlite, ALL))

describe('değişiklik günlüğü tetikleyicileri', () => {
  it('şemadaki her tablo ya çoğaltılır ya da gerekçesiyle yerelde kalır; yeni tablo unutulursa bu test kırılır', () => {
    const all = allSchemaTables().sort()
    const copied = copiedTables().map((t) => t.name)
    const local = Object.keys(LOCAL_ONLY_TABLES)
    expect([...copied, ...local].sort()).toEqual(all)
    // Every local-only table and every secret column exists in the schema (no stale names in the lists).
    for (const name of local) expect(all).toContain(name)
    for (const [tbl, cols] of Object.entries(SECRET_COLUMNS)) {
      const t = copiedTables().find((x) => x.name === tbl)!
      for (const c of cols) expect(t.columns.map((x) => x.name)).toContain(c)
    }
    // Each copied table has a key and its three triggers are installed exactly as the generator writes them.
    for (const t of copiedTables()) expect(t.primaryKey.length).toBeGreaterThan(0)
    expect(installedTriggers(source.sqlite)).toEqual(changeLogTriggers(SCHEMA_VERSION))
    expect(installedTriggers(source.sqlite).size).toBe(copiedTables().length * 3)
  })

  it('her çoğaltılan tabloya yazılan satır günlüğe bütün sütunlarıyla düşer', () => {
    const before = logBounds(source.sqlite).maxSeq
    source.sqlite
      .prepare(
        "INSERT INTO guests (id, first_name, last_name, name_normalized, id_doc_number, created_at, updated_at) VALUES ('g1', 'Ayşe', 'Yılmaz', 'ayse yilmaz', 'A123', 'x', 'x')"
      )
      .run()
    const [change] = readChanges(source.sqlite, before, 10, ALL)
    expect(change).toMatchObject({ tbl: 'guests', op: 'I', pk: ['g1'], epoch: 1 })
    const columns = copiedTables()
      .find((t) => t.name === 'guests')!
      .columns.map((c) => c.name)
    expect(Object.keys(change!.row!).sort()).toEqual([...columns].sort())
    expect(change!.row!['id_doc_number']).toBe('A123')
    // The same change without identity numbers for a reader who may not see them.
    expect(readChanges(source.sqlite, before, 10, { identity: false })[0]!.row).not.toHaveProperty(
      'id_doc_number'
    )
  })

  it('şifre ve PIN özetleri günlükten hiçbir okuyucuya çıkmaz', () => {
    const before = logBounds(source.sqlite).maxSeq
    const role = source.sqlite.prepare("SELECT id FROM roles WHERE code = 'owner'").get() as { id: string }
    source.sqlite
      .prepare(
        "INSERT INTO users (id, username, display_name, role_id, password_hash, pin_hash, created_at, updated_at) VALUES ('u1', 'sahip', 'Sahip', ?, 'scrypt$secret', 'scrypt$pin', 'x', 'x')"
      )
      .run(role.id)
    const [change] = readChanges(source.sqlite, before, 10, ALL)
    expect(change!.row).not.toHaveProperty('password_hash')
    expect(change!.row).not.toHaveProperty('pin_hash')
    expect(change!.row!['username']).toBe('sahip')
  })

  it('oturum, cihaz ve kurtarma kodu tabloları günlüğe yazılmaz', () => {
    const before = logBounds(source.sqlite).maxSeq
    source.sqlite
      .prepare(
        "INSERT INTO devices (id, name, kind, first_seen_at, last_seen_at, created_at, updated_at) VALUES ('d1', 'Mac', 'desktop', 'x', 'x', 'x', 'x')"
      )
      .run()
    expect(readChanges(source.sqlite, before, 10, ALL)).toEqual([])
    expect(
      [...installedTriggers(source.sqlite).keys()].some((n) => n.startsWith(`${TRIGGER_PREFIX}devices`))
    ).toBe(false)
  })

  it('tetikleyiciler şemayla uyumluyken yeniden kurulmaz, biri bozulursa düzeltilir', () => {
    expect(installChangeLog(source.sqlite, SCHEMA_VERSION)).toBe(0)
    source.sqlite.prepare('DROP TRIGGER cl_guests_u').run()
    expect(installChangeLog(source.sqlite, SCHEMA_VERSION)).toBe(1)
    expect(installedTriggers(source.sqlite)).toEqual(changeLogTriggers(SCHEMA_VERSION))
  })
})

/** One random write on the source. */
function randomWrite(r: ReturnType<typeof rng>, step: number, guestIds: string[], tagIds: string[]): void {
  const db = source.sqlite
  const now = `2026-10-05T10:${String(step % 60).padStart(2, '0')}:00.000Z`
  const roles = db.prepare('SELECT id FROM roles').all() as { id: string }[]
  switch (r.int(9)) {
    case 0:
    case 1: {
      const id = `g${step}`
      db.prepare(
        'INSERT INTO guests (id, first_name, last_name, name_normalized, phone, vip, id_doc_number, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(
        id,
        r.pick(['Ali', 'Ayşe', 'Oğuz']),
        r.pick(['Kaya', 'Demir']),
        'n',
        null,
        r.int(2),
        `P${step}`,
        now,
        now
      )
      guestIds.push(id)
      return
    }
    case 2:
      if (guestIds.length)
        db.prepare('UPDATE guests SET notes = ?, vip = ?, updated_at = ? WHERE id = ?').run(
          `not ${step}`,
          r.int(2),
          now,
          r.pick(guestIds)
        )
      return
    case 3:
      if (guestIds.length) {
        // A changed key: the copy must drop the old row and add the new one.
        const old = r.pick(guestIds)
        const next = `${old}x`
        db.prepare('UPDATE guests SET id = ? WHERE id = ?').run(next, old)
        guestIds.splice(guestIds.indexOf(old), 1, next)
      }
      return
    case 4:
      if (guestIds.length > 3) {
        const id = r.pick(guestIds)
        db.prepare('DELETE FROM guests WHERE id = ?').run(id)
        guestIds.splice(guestIds.indexOf(id), 1)
      }
      return
    case 5: {
      // Two-column key; insert or remove.
      const tag = r.pick(tagIds)
      const res = `r${r.int(5)}`
      const exists = db
        .prepare('SELECT 1 FROM reservation_tags WHERE reservation_id = ? AND tag_id = ?')
        .get(res, tag)
      if (exists)
        db.prepare('DELETE FROM reservation_tags WHERE reservation_id = ? AND tag_id = ?').run(res, tag)
      else db.prepare('INSERT INTO reservation_tags (reservation_id, tag_id) VALUES (?, ?)').run(res, tag)
      return
    }
    case 6:
      db.prepare(
        "INSERT INTO settings (key, value_json, updated_at) VALUES ('hotel.city', ?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at"
      ).run(JSON.stringify(`Şehir ${step}`), now)
      return
    case 7:
      db.prepare(
        "INSERT INTO audit_log (id, ts, entity, entity_id, action, after_json) VALUES (?, ?, 'guest', 'g', 'update', ?)"
      ).run(`a${step}`, now, JSON.stringify({ step }))
      return
    default:
      db.prepare('UPDATE role_permissions SET level = ? WHERE role_id = ? AND permission = ?').run(
        r.pick(['none', 'view', 'edit']),
        r.pick(roles).id,
        r.pick(['guests', 'calendar', 'today'])
      )
  }
}

describe('yedek kopya (S-B)', () => {
  it('rastgele işlem dizilerinde kopya kaynağa eşit kalır; arada alınan anlık görüntü ve iki kez uygulama sonucu değiştirmez', () => {
    const tagIds = (source.sqlite.prepare('SELECT id FROM status_tags').all() as { id: string }[]).map(
      (t) => t.id
    )
    for (let seed = 1; seed <= 12; seed++) {
      const r = rng(seed)
      const guestIds: string[] = []
      const steps = 40 + r.int(60)
      const snapAt = r.int(steps)
      let meta: ReturnType<typeof snapshotMeta> | null = null
      let rows: ReturnType<typeof snapshotRows> | null = null
      for (let step = 0; step < steps; step++) {
        if (step === snapAt) {
          // The snapshot starts; writing goes on while its rows are read (half now, the rest after more writes).
          meta = snapshotMeta(source.sqlite, SCHEMA_VERSION, new Date())
          rows = snapshotRows(source.sqlite, ALL)
        }
        randomWrite(r, seed * 1000 + step, guestIds, tagIds)
      }
      // Reading the snapshot's rows while the log moved on (fuzzy snapshot), then the changes after its point.
      applySnapshot(replica.writer, meta!, [...rows!], { identity: true, source: 'live', asOf: 'x' })
      catchUp()
      digestsEqual()
      // Everything once more from the snapshot point: nothing changes.
      const again = readChanges(source.sqlite, meta!.seq, 100_000, ALL)
      const before = readState(replica.writer).seq
      replica.writer.prepare("UPDATE _replica_meta SET value = ? WHERE key = 'seq'").run(String(meta!.seq))
      applyChanges(replica.writer, again, { identity: true, source: 'live', asOf: 'x' })
      expect(readState(replica.writer).seq).toBe(before)
      digestsEqual()
    }
  })

  it('1.000 değişiklik bir saniyeden kısa sürede uygulanır', () => {
    sync()
    const insert = source.sqlite.prepare(
      'INSERT INTO guests (id, first_name, last_name, name_normalized, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
    source.sqlite.transaction(() => {
      for (let i = 0; i < 1000; i++) insert.run(`p${i}`, 'Ad', 'Soyad', 'ad soyad', 'x', 'x')
    })()
    const changes = readChanges(source.sqlite, readState(replica.writer).seq, 5000, ALL)
    expect(changes).toHaveLength(1000)
    const started = performance.now()
    applyChanges(replica.writer, changes, { identity: true, source: 'live', asOf: 'x' })
    expect(performance.now() - started).toBeLessThan(1000)
    digestsEqual()
  })

  it('eski dönemin değişiklikleri uygulanmaz; yeni dönem önce anlık görüntü ister', () => {
    sync()
    const state = readState(replica.writer)
    const old = {
      seq: state.seq + 1,
      epoch: 0,
      tbl: 'settings',
      pk: ['hotel.city'],
      op: 'U' as const,
      row: { key: 'hotel.city', value_json: '"Eski"', updated_at: 'x', updated_by: null },
      schemaVersion: SCHEMA_VERSION,
      ts: 'x'
    }
    const result = applyChanges(replica.writer, [old], { identity: true, source: 'relay', asOf: 'x' })
    expect(result).toMatchObject({ status: 'applied', applied: 0, skipped: 1 })
    const newer = { ...old, epoch: state.epoch + 1, seq: 1 }
    expect(applyChanges(replica.writer, [newer], { identity: true, source: 'relay', asOf: 'x' }).status).toBe(
      'needSnapshot'
    )
    // An older term's snapshot never replaces the copy.
    expect(
      applySnapshot(replica.writer, { epoch: 0, seq: 0, schemaVersion: SCHEMA_VERSION, at: 'x' }, [], {
        identity: true,
        source: 'relay',
        asOf: 'x'
      })
    ).toBe(false)
  })

  it('kimlik numarası gelmeyen paket kopyadaki kimlik numarasını silmez', () => {
    source.sqlite
      .prepare(
        "INSERT INTO guests (id, first_name, last_name, name_normalized, id_doc_number, created_at, updated_at) VALUES ('k1', 'Ad', 'Soyad', 'n', 'TC123', 'x', 'x')"
      )
      .run()
    sync()
    source.sqlite.prepare("UPDATE guests SET notes = 'yeni' WHERE id = 'k1'").run()
    const changes = readChanges(source.sqlite, readState(replica.writer).seq, 10, { identity: false })
    applyChanges(replica.writer, changes, { identity: false, source: 'relay', asOf: 'x' })
    const row = replica.writer.prepare("SELECT notes, id_doc_number FROM guests WHERE id = 'k1'").get()
    expect(row).toEqual({ notes: 'yeni', id_doc_number: 'TC123' })
  })
})
