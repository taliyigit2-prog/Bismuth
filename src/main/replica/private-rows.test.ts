// §4.9-12 in the copies (database review #1): a personal note ("kendime not") is readable only by its writer — not by
// the owner role either. It reaches only its own writer's read-only copy, never the encrypted Drive box; a copy that
// still holds someone else's note from an earlier version drops it at the next batch.
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MIGRATIONS, SCHEMA_VERSION, seededDatabase } from '../../../tests/factories/db'
import { openReplicaDatabase, type DatabaseHandle, type ReplicaDatabase } from '../db/client'
import { decodePackage } from '../relay/format'
import { createRelayWriter } from '../relay/writer'
import { applyChanges, applySnapshot, readState } from './apply'
import { readChanges, snapshotMeta, snapshotRows } from './feed'

let source: DatabaseHandle
let dir: string
let replica: ReplicaDatabase
const AT = '2026-10-05T10:00:00.000Z'

beforeEach(async () => {
  source = await seededDatabase()
  dir = mkdtempSync(join(tmpdir(), 'bismuth-private-'))
  replica = openReplicaDatabase({ file: join(dir, 'replica.db'), migrationsFolder: MIGRATIONS })
})
afterEach(() => {
  replica.close()
  source.close()
  rmSync(dir, { recursive: true, force: true })
})

const note = (id: string, kind: 'personal' | 'board', owner: string | null, text: string): void => {
  source.sqlite
    .prepare(
      'INSERT INTO notes (id, kind, owner_user_id, text, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)'
    )
    .run(id, kind, owner, text, AT, AT)
}
const notesIn = (db: ReplicaDatabase['writer']) =>
  db.prepare('SELECT id, text FROM notes ORDER BY id').all() as { id: string; text: string }[]

describe('kişisel notlar kopyada ve kutuda (§4.9-12)', () => {
  it("Resepsiyon'un kişisel notu sahibin kopyasında yok; sahibin kendi notu ve panodaki not var", () => {
    note('n-resepsiyon', 'personal', 'u-resepsiyon', 'Resepsiyonun özel notu')
    note('n-sahip', 'personal', 'u-sahip', 'Sahibin kendi notu')
    note('n-pano', 'board', null, 'Herkese not')
    const owner = { identity: false, reader: 'u-sahip' }
    applySnapshot(
      replica.writer,
      snapshotMeta(source.sqlite, SCHEMA_VERSION, new Date(AT)),
      snapshotRows(source.sqlite, owner),
      { identity: false, source: 'live', asOf: AT, reader: 'u-sahip' }
    )
    expect(notesIn(replica.writer).map((n) => n.id)).toEqual(['n-pano', 'n-sahip'])

    // A change to the receptionist's note goes out as a bare delete of its key: no text, no owner.
    const before = readState(replica.writer).seq
    source.sqlite.prepare("UPDATE notes SET text = 'Değişti' WHERE id = 'n-resepsiyon'").run()
    note('n-resepsiyon-2', 'personal', 'u-resepsiyon', 'Bir özel not daha')
    const changes = readChanges(source.sqlite, before, 10, owner)
    expect(changes).toHaveLength(2)
    for (const c of changes) expect(c).toMatchObject({ tbl: 'notes', op: 'D', row: null })
    expect(JSON.stringify(changes)).not.toMatch(/özel not|Değişti|u-resepsiyon/)
    expect(
      applyChanges(replica.writer, changes, { identity: false, source: 'live', asOf: AT })
    ).toMatchObject({
      status: 'applied',
      complete: true
    })
    expect(notesIn(replica.writer).map((n) => n.id)).toEqual(['n-pano', 'n-sahip'])
    // The receptionist's own copy gets them.
    expect(
      readChanges(source.sqlite, before, 10, { identity: false, reader: 'u-resepsiyon' })[1]
    ).toMatchObject({
      op: 'I',
      row: { text: 'Bir özel not daha' }
    })
  })

  it('kopyada daha önceki sürümden kalan başkasının kişisel notu sonraki uygulamada silinir', () => {
    note('n-resepsiyon', 'personal', 'u-resepsiyon', 'Eski sürümden sızan not')
    note('n-sahip', 'personal', 'u-sahip', 'Sahibin kendi notu')
    // An earlier version sent every note (no reader filter).
    applySnapshot(
      replica.writer,
      snapshotMeta(source.sqlite, SCHEMA_VERSION, new Date(AT)),
      [
        {
          tbl: 'notes',
          row: source.sqlite.prepare("SELECT * FROM notes WHERE id = 'n-resepsiyon'").get() as never
        },
        {
          tbl: 'notes',
          row: source.sqlite.prepare("SELECT * FROM notes WHERE id = 'n-sahip'").get() as never
        }
      ],
      { identity: false, source: 'live', asOf: AT }
    )
    expect(notesIn(replica.writer)).toHaveLength(2)
    note('n-pano', 'board', null, 'Herkese not')
    const changes = readChanges(source.sqlite, readState(replica.writer).seq, 10, {
      identity: false,
      reader: 'u-sahip'
    })
    applyChanges(replica.writer, changes, { identity: false, source: 'live', asOf: AT, reader: 'u-sahip' })
    expect(notesIn(replica.writer).map((n) => n.id)).toEqual(['n-pano', 'n-sahip'])
  })

  it('Drive kutusuna hiçbir kişisel not gitmez (sahibinki de); panodaki not gider', async () => {
    note('n-resepsiyon', 'personal', 'u-resepsiyon', 'Resepsiyonun özel notu')
    note('n-sahip', 'personal', 'u-sahip', 'Sahibin kendi notu')
    note('n-pano', 'board', null, 'Herkese not')
    const box = join(dir, 'kutu')
    mkdirSync(box, { recursive: true })
    const key = randomBytes(32)
    let now = new Date(AT)
    const w = createRelayWriter({
      sqlite: source.sqlite,
      dir: () => box,
      key: () => key,
      enabled: () => true,
      excludeIdentity: () => true,
      schemaVersion: () => SCHEMA_VERSION,
      replaced: () => false,
      clock: () => now,
      pause: async () => undefined
    })
    await w.tick()
    source.sqlite
      .prepare("UPDATE notes SET text = 'Resepsiyonun yeni özel notu' WHERE id = 'n-resepsiyon'")
      .run()
    now = new Date('2026-10-05T10:01:00.000Z')
    await w.tick()
    const lines = readdirSync(box)
      .filter((f) => f.endsWith('.bmr'))
      .flatMap((f) => decodePackage(readFileSync(join(box, f)), key).lines)
    const text = lines.join('\n')
    expect(text).toContain('Herkese not')
    expect(text).not.toMatch(/özel notu|Sahibin kendi notu|u-resepsiyon|u-sahip/)
  })
})
