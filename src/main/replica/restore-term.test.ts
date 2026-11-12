// Faz 11/14 hata avı #1: a restored database brings back its own change-log numbers and term. Without a new term the
// owner's copy would go on from numbers that now mean other changes (rows deleted by the restore stay in the copy,
// new ones are skipped) and the Drive box writer would stay silent. The restore starts a new term: the live copy and
// the box copy both start again from a whole snapshot and end equal to the restored data, table by table.
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defaultPermissions } from '@shared/permissions'
import { MIGRATIONS, SCHEMA_VERSION } from '../../../tests/factories/db'
import {
  openDatabase,
  openReplicaDatabase,
  termOfFile,
  type DatabaseHandle,
  type ReplicaDatabase
} from '../db/client'
import { seedBaseData } from '../db/seed/seed'
import { readBox } from '../relay/reader'
import { createRelayWriter } from '../relay/writer'
import { createReplicaFeed, type FeedPage } from '../server/replica-routes'
import { createServices } from '../services'
import { createBackupService } from '../services/backup-service'
import { ctxFromPermissions, systemCtx } from '../services/context'
import { applyChanges, applySnapshot, hasData, readState } from './apply'
import { currentEpoch, tableDigests, type SnapshotMeta, type SnapshotRow } from './feed'

let dir: string
let host: DatabaseHandle
let live: ReplicaDatabase
let boxed: ReplicaDatabase
const key = randomBytes(32)
const at = new Date('2026-10-05T10:00:00.000Z')

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'bismuth-restore-term-'))
  host = await openDatabase({ file: join(dir, 'hotel.db'), migrationsFolder: MIGRATIONS })
  seedBaseData(host.db)
  live = openReplicaDatabase({ file: join(dir, 'live.db'), migrationsFolder: MIGRATIONS })
  boxed = openReplicaDatabase({ file: join(dir, 'boxed.db'), migrationsFolder: MIGRATIONS })
  mkdirSync(join(dir, 'kutu'))
})
afterEach(() => {
  live.close()
  boxed.close()
  host.close()
  rmSync(dir, { recursive: true, force: true })
})

const services = () =>
  createServices(host, {
    name: 'Bismuth',
    version: '0.1.0',
    packaged: false,
    dataDir: dir,
    electron: null,
    chrome: null
  })

/** The owner's computer pulling the live feed as replica-sync does: pages, or a whole snapshot when told to. */
async function pull(): Promise<void> {
  const feed = createReplicaFeed({
    db: host.db,
    sqlite: host.sqlite,
    schemaVersion: () => SCHEMA_VERSION,
    replaced: () => false
  })
  const caller = {
    token: null,
    sessionCtx: ctxFromPermissions('u-owner', 'mac', 'http', defaultPermissions('owner')),
    network: 'private' as const
  }
  for (let round = 0; round < 10; round++) {
    const s = readState(live.writer)
    const query = hasData(s) ? `after=${s.seq}&epoch=${s.epoch}` : 'after=0&epoch=0'
    const page = (await feed
      .handle(new Request(`http://h/api/replica/changes?${query}`), caller)
      .json()) as FeedPage
    if (page.snapshotNeeded || !hasData(s)) {
      const lines = (
        await feed
          .handle(new Request('http://h/api/replica/snapshot'), { ...caller, ip: `10.0.0.${round}` })
          .text()
      )
        .split('\n')
        .filter(Boolean)
      const first = JSON.parse(lines[0]!) as { meta: SnapshotMeta; identity: boolean }
      applySnapshot(
        live.writer,
        first.meta,
        lines.slice(1, -1).map((l) => JSON.parse(l) as SnapshotRow),
        { identity: first.identity, source: 'live', asOf: at.toISOString() }
      )
      continue
    }
    if (page.changes.length === 0) return
    applyChanges(live.writer, page.changes, { identity: true, source: 'live', asOf: at.toISOString() })
  }
}

async function box(): Promise<void> {
  await createRelayWriter({
    sqlite: host.sqlite,
    dir: () => join(dir, 'kutu'),
    key: () => key,
    enabled: () => true,
    excludeIdentity: () => true,
    schemaVersion: () => SCHEMA_VERSION,
    replaced: () => false,
    clock: () => at,
    pause: async () => undefined
  }).tick()
  expect(
    readBox({ writer: boxed.writer, schemaVersion: SCHEMA_VERSION }, join(dir, 'kutu'), key).status
  ).toBe('ok')
}

const names = (db: ReplicaDatabase['writer']) =>
  (db.prepare('SELECT first_name FROM guests ORDER BY first_name').all() as { first_name: string }[]).map(
    (r) => r.first_name
  )

describe('geri yükleme sonrası kopya ve kutu (Faz 11/14 #1)', () => {
  it('geri yüklemeden sonra kopya ve kutu yeni dönemin tam kopyasıyla başlar; tablo karmaları kaynağa eşit', async () => {
    let svc = services()
    for (const name of ['Ali', 'Ayşe']) svc.guests.create(systemCtx(), { firstName: name, lastName: 'Demir' })
    await pull()
    await box()
    // The backup the owner restores later.
    const backupFile = join(dir, 'yedek.db')
    await host.sqlite.backup(backupFile)
    // After the backup: rows the restore takes away.
    for (const name of ['Silinecek1', 'Silinecek2', 'Silinecek3'])
      svc.guests.create(systemCtx(), { firstName: name, lastName: 'Kaya' })
    await pull()
    await box()
    expect(names(live.writer)).toContain('Silinecek3')

    // Restore (what applyPendingRestore does at start) and the note written once the data is open.
    const dbFile = join(dir, 'hotel.db')
    const previousTerm = termOfFile(dbFile)
    host.close()
    for (const suffix of ['-wal', '-shm']) rmSync(dbFile + suffix, { force: true })
    copyFileSync(backupFile, dbFile)
    host = await openDatabase({ file: dbFile, migrationsFolder: MIGRATIONS })
    const backupsDir = join(dir, 'backups')
    createBackupService({
      db: host.db,
      clock: () => at,
      sqlite: host.sqlite,
      backupsDir,
      attachmentsDir: join(dir, 'attachments'),
      restoreMarkerPath: join(dir, 'restore-pending.json')
    }).noteRestored(systemCtx(), {
      status: 'restored',
      from: '.restore/x',
      safetyDir: join(backupsDir, 'x'),
      backupId: 'bismuth-yedek-2026-10-05-0400.bmy',
      previousTerm
    })
    expect(currentEpoch(host.sqlite)).toBe(previousTerm + 1)

    // The restored computer works on: more changes than the restore took away, so the old numbers are passed.
    svc = services()
    for (const name of ['Yeni1', 'Yeni2', 'Yeni3', 'Yeni4', 'Yeni5'])
      svc.guests.create(systemCtx(), { firstName: name, lastName: 'Öz' })
    await pull()
    await box()

    for (const copy of [live.writer, boxed.writer]) {
      expect(names(copy)).not.toContain('Silinecek1')
      expect(names(copy)).toContain('Yeni5')
      expect(readState(copy).epoch).toBe(previousTerm + 1)
    }
    // Every table equal to the restored data. The audit log is the one exception by design (G-24): it is
    // append-only in the copy as well, so the copy keeps the audit rows of the changes the restore took away, and
    // has every row the restored computer has.
    const withoutAudit = (d: Record<string, string>) =>
      Object.fromEntries(Object.entries(d).filter(([t]) => t !== 'audit_log'))
    expect(withoutAudit(tableDigests(live.writer, { identity: true }))).toEqual(
      withoutAudit(tableDigests(host.sqlite, { identity: true }))
    )
    expect(withoutAudit(tableDigests(boxed.writer, { identity: false }))).toEqual(
      withoutAudit(tableDigests(host.sqlite, { identity: false }))
    )
    const ids = (db: ReplicaDatabase['writer']) =>
      new Set((db.prepare('SELECT id FROM audit_log').all() as { id: string }[]).map((r) => r.id))
    const source = ids(host.sqlite)
    for (const copy of [live.writer, boxed.writer]) {
      const kept = ids(copy)
      expect([...source].filter((id) => !kept.has(id))).toEqual([])
    }
  })
})
