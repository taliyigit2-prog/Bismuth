// Database review #4 (P13sec2): the read-only copy is written without foreign-key checks (it mirrors rows in the main
// computer's order). When it becomes the hotel's database ("Bu bilgisayarı ana bilgisayar yap"), a row pointing at a
// missing row stops the takeover with a clear message; nothing is left half-made and the data kept before returns.
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MIGRATIONS, SCHEMA_VERSION, seededDatabase } from '../../../tests/factories/db'
import { openReplicaDatabase, type DatabaseHandle, type ReplicaDatabase } from '../db/client'
import { applySnapshot } from './apply'
import { snapshotMeta, snapshotRows } from './feed'
import { planTakeover, promoteCopy } from './takeover'

let source: DatabaseHandle
let dir: string
let replica: ReplicaDatabase
const AT = '2026-10-05T10:00:00.000Z'

beforeEach(async () => {
  source = await seededDatabase()
  const role = source.sqlite.prepare("SELECT id FROM roles WHERE code = 'owner'").get() as { id: string }
  source.sqlite
    .prepare(
      "INSERT INTO users (id, username, display_name, role_id, password_hash, created_at, updated_at) VALUES ('u-sahip', 'sahip', 'Sahip', ?, 'x', ?, ?)"
    )
    .run(role.id, AT, AT)
  dir = mkdtempSync(join(tmpdir(), 'bismuth-promote-'))
  replica = openReplicaDatabase({ file: join(dir, 'replica.db'), migrationsFolder: MIGRATIONS })
  applySnapshot(
    replica.writer,
    snapshotMeta(source.sqlite, SCHEMA_VERSION, new Date(AT)),
    snapshotRows(source.sqlite, { identity: true, reader: 'u-sahip' }),
    { identity: true, source: 'live', asOf: AT }
  )
})
afterEach(() => {
  replica.close()
  source.close()
  rmSync(dir, { recursive: true, force: true })
})

const takeOver = (hotelDb: string) =>
  promoteCopy({
    writer: replica.writer,
    hotelDb,
    plan: planTakeover(replica.writer, 1),
    userId: 'u-sahip',
    password: 'yeni-sifre-123',
    machineName: 'Sahibin Mac',
    now: new Date(AT)
  })

describe('kopyanın ana veritabanı olması', () => {
  it('yetim satır yoksa kopya ana veritabanı olur', async () => {
    const hotelDb = join(dir, 'bismuth.db')
    await expect(takeOver(hotelDb)).resolves.toEqual({ keptAside: null })
    expect(existsSync(hotelDb)).toBe(true)
  })

  it('olmayan satırı gösteren satır varsa (foreign_key_check) devralma durur, kişiye söylenir; önceki veri yerine döner', async () => {
    replica.writer
      .prepare(
        "INSERT INTO rooms (id, number, room_type_id, beds, created_at, updated_at) VALUES ('r-yetim', '999', 'olmayan-tip', 2, ?, ?)"
      )
      .run(AT, AT)
    const hotelDb = join(dir, 'bismuth.db')
    writeFileSync(hotelDb, 'onceki veri')
    await expect(takeOver(hotelDb)).rejects.toMatchObject({
      code: 'CONFLICT',
      messageKey: 'errors.takeoverOrphans',
      details: { count: 1 }
    })
    // Nothing half-made stays; the file this computer had is back in its place.
    expect(readFileSync(hotelDb, 'utf8')).toBe('onceki veri')
    expect(existsSync(`${hotelDb}-wal`)).toBe(false)
  })
})
