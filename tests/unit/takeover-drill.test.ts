// Spike S-D (faz-13 madde 5, kabul "Devral tatbikatı"): two service instances on one machine. The hotel's computer
// (A) works and fills the Drive box; the owner's computer (B) keeps a read-only copy from the box; A "dies";
// B takes over (next term, new password, epoch file in the box) and becomes the main computer; A comes back,
// finds the newer term in the box, refuses every change and lists what it wrote after B's last known change;
// a third computer that follows the box ends on B's data, never on A's late changes. Nothing A had is lost.
import type Database from 'better-sqlite3'
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MIGRATIONS, SCHEMA_VERSION } from '../factories/db'
import { openDatabase, openReplicaDatabase } from '../../src/main/db/client'
import { readState } from '../../src/main/replica/apply'
import { tableDigests } from '../../src/main/replica/feed'
import { createReplicaStore } from '../../src/main/replica/store'
import { conflictingChanges, createEpochGuard, findNewerTerm } from '../../src/main/relay/epoch'
import { readBox } from '../../src/main/relay/reader'
import { createRelayWriter, listBox } from '../../src/main/relay/writer'
import { encodeRecoveryText, memoryKeyStore } from '../../src/main/security/bismuth-key'
import { createServices } from '../../src/main/services'
import { verifySecret } from '../../src/main/services/auth-service'
import { guardedCtx, systemCtx } from '../../src/main/services/context'
import { ctxForUser } from '../../src/main/services/users-service'
import { createConfigStore } from '../../src/main/server/connection-config'
import { createHostLink } from '../../src/main/server/host-link'
import { createReplicaClient } from '../../src/main/server/replica-client'
import { hostHarness, type HostHarness } from './host-harness'
import { tempDataDir } from '../factories/runtime'

let a: HostHarness
let dir: string
let box: string
const key = randomBytes(32)
let clock = new Date('2026-10-05T08:00:00.000Z')

beforeEach(async () => {
  a = await hostHarness({ clock: () => clock })
  dir = mkdtempSync(join(tmpdir(), 'bismuth-drill-'))
  box = join(dir, 'drive', 'Bismuth', 'kutu')
  mkdirSync(box, { recursive: true })
  clock = new Date('2026-10-05T08:00:00.000Z')
})
afterEach(() => {
  a.close()
  rmSync(dir, { recursive: true, force: true })
})

const relayOf = (sqlite: Database.Database, replaced: () => boolean = () => false) =>
  createRelayWriter({
    sqlite,
    dir: () => box,
    key: () => key,
    enabled: () => true,
    excludeIdentity: () => true,
    schemaVersion: () => SCHEMA_VERSION,
    replaced,
    clock: () => clock,
    pause: async () => undefined
  })

describe('devral tatbikatı (S-D)', () => {
  it('veri kaybı olmadan devralır; eski bilgisayar geri gelince yazamaz ve çakışan kayıtları listeler', async () => {
    const owner = a.user('sahip', 'owner')
    const ownerCtx = ctxForUser(a.handle.db, owner, 'dev-a', 'ipc')!
    // A works: guests through the service, a few days of activity.
    for (const name of ['Ali', 'Ayşe', 'Oğuz'])
      a.services.guests.create(ownerCtx, { firstName: name, lastName: 'Demir' })
    const relayA = relayOf(a.handle.sqlite)
    await relayA.tick()
    a.services.guests.create(ownerCtx, { firstName: 'Zeynep', lastName: 'Kaya' })
    clock = new Date('2026-10-05T08:01:00.000Z')
    await relayA.tick()

    // B: client computer with the copy, fed from the box.
    const root = join(dir, 'mac')
    mkdirSync(root, { recursive: true })
    const store = createReplicaStore({ root, migrationsFolder: MIGRATIONS, version: '0.1.0' })
    const config = createConfigStore(join(root, 'connection.json'))
    config.update({
      mode: 'client',
      hostUrl: 'http://127.0.0.1:9',
      replica: { token: null, userId: owner, userName: 'Sahip', folder: join(dir, 'drive', 'Bismuth') }
    })
    const link = createHostLink({
      fetch: () => Promise.reject(new Error('down')),
      version: '0.1.0',
      schemaVersion: SCHEMA_VERSION,
      deviceName: 'Mac',
      platform: 'darwin',
      loadDevice: () => null,
      saveDevice: () => undefined,
      probeEveryMs: 60_000
    })
    link.setHost('http://127.0.0.1:9')
    let becameMain = 0
    const hotelDb = join(root, 'hotel.db')
    const client = createReplicaClient({
      store,
      config,
      link,
      keys: memoryKeyStore(key),
      hotelDbFile: hotelDb,
      machineName: 'Sahibin Mac',
      fetch: () => Promise.reject(new Error('down')),
      clock: () => clock,
      becomeMain: () => void becameMain++
    })
    expect(client.syncNow()).toMatchObject({ state: 'relay', takeover: { possible: true, reason: null } })
    const atDeath = tableDigests(a.handle.sqlite, { identity: false })
    expect(tableDigests(store.writer(), { identity: false })).toEqual(atDeath)
    const deathSeq = readState(store.writer()).seq

    // A "dies" — but first it writes one more thing that never reaches the box (written in two places later).
    a.services.guests.create(ownerCtx, { firstName: 'Kayıp', lastName: 'Değil' })

    // B takes over: only with the Bismuth key from the paper typed again (K-45 (4), O-5); another key is refused and
    // nothing changes.
    clock = new Date('2026-10-05T09:00:00.000Z')
    await expect(
      client.takeOver('yeni-sifre-123', false, encodeRecoveryText(randomBytes(32)))
    ).rejects.toThrowError(/takeoverKeyMismatch/)
    expect(existsSync(hotelDb)).toBe(false)
    expect(becameMain).toBe(0)
    await client.takeOver('yeni-sifre-123', false, encodeRecoveryText(key))
    expect(becameMain).toBe(1)
    expect(existsSync(hotelDb)).toBe(true)
    const notes = listBox(box).filter((f) => f.kind === 'epoch')
    expect(notes).toEqual([{ kind: 'epoch', name: 'epoch-0002.bmr', epoch: 2 }])

    // B as the main computer: term 2, the owner signs in with the new password, everything A had is there.
    const b = await openDatabase({ file: hotelDb, migrationsFolder: MIGRATIONS })
    try {
      const bServices = createServices(b, {
        name: 'Bismuth',
        version: '0.1.0',
        packaged: false,
        dataDir: tempDataDir(),
        electron: null,
        chrome: null
      })
      expect(bServices.settings.get(ownerCtx)['host.epoch']).toBe(2)
      const row = b.sqlite.prepare('SELECT password_hash FROM users WHERE id = ?').get(owner) as {
        password_hash: string
      }
      expect(verifySecret('yeni-sifre-123', row.password_hash)).toBe(true)
      const atTakeover = tableDigests(b.sqlite, { identity: false })
      for (const [table, digest] of Object.entries(atDeath)) {
        if (['settings', 'audit_log', 'users'].includes(table)) continue // the takeover itself changed these
        expect(atTakeover[table], table).toBe(digest)
      }
      const names = (
        b.sqlite.prepare('SELECT first_name FROM guests ORDER BY first_name').all() as {
          first_name: string
        }[]
      ).map((g) => g.first_name)
      expect(names).toEqual(['Ali', 'Ayşe', 'Oğuz', 'Zeynep'])
      // B writes in its own term; its changes carry epoch 2.
      const bOwner = ctxForUser(b.db, owner, 'dev-b', 'ipc')!
      bServices.guests.create(bOwner, { firstName: 'Yeni', lastName: 'Dönem' })
      const lastB = b.sqlite.prepare('SELECT epoch FROM change_log ORDER BY seq DESC LIMIT 1').get()
      expect(lastB).toEqual({ epoch: 2 })
      clock = new Date('2026-10-05T09:01:00.000Z')
      await relayOf(b.sqlite).tick()

      // A comes back: it sees term 2 in the box, writes nothing more, lists its conflicting change.
      const note = findNewerTerm(box, key, 1)
      expect(note).toMatchObject({ epoch: 2, previousEpoch: 1, baseSeq: deathSeq, by: 'Sahibin Mac' })
      const guard = createEpochGuard(join(dir, 'replaced.json'))
      guard.mark(note!, clock)
      const replaced = (): boolean => guard.replaced() !== null
      const aCtx = guardedCtx(ownerCtx, replaced)
      expect(() => a.services.guests.create(aCtx, { firstName: 'Geç', lastName: 'Yazım' })).toThrowError(
        /errors.notMainComputer/
      )
      // Reading still works on A.
      expect(() => a.services.guests.list(aCtx, {})).not.toThrow()
      const conflicts = conflictingChanges(a.handle.sqlite, note!)
      expect(conflicts.some((c) => c.tbl === 'guests' && c.op === 'I')).toBe(true)
      expect(conflicts.every((c) => c.seq > deathSeq)).toBe(true)
      // A's box writer stops; the guard survives a restart.
      expect((await relayOf(a.handle.sqlite, replaced).tick()).problem).toBe('replaced')
      expect(createEpochGuard(join(dir, 'replaced.json')).replaced()).toMatchObject({ epoch: 2 })

      // A third computer following the box ends on B's data (term 2), never on A's late change.
      const third = openReplicaDatabase({ file: join(dir, 'third.db'), migrationsFolder: MIGRATIONS })
      try {
        expect(readBox({ writer: third.writer, schemaVersion: SCHEMA_VERSION }, box, key).status).toBe('ok')
        expect(readState(third.writer).epoch).toBe(2)
        const thirdNames = (
          third.writer.prepare('SELECT first_name FROM guests').all() as {
            first_name: string
          }[]
        ).map((g) => g.first_name)
        expect(thirdNames).toContain('Yeni')
        expect(thirdNames).not.toContain('Kayıp')
      } finally {
        third.close()
      }
    } finally {
      b.close()
      store.close()
    }
  })

  it('ana bilgisayar ulaşılabilirken devral onay ister; kopyası, anahtarı ya da klasörü olmayan devralamaz', async () => {
    const root = join(dir, 'mac2')
    mkdirSync(root, { recursive: true })
    const store = createReplicaStore({ root, migrationsFolder: MIGRATIONS, version: '0.1.0' })
    const config = createConfigStore(join(root, 'connection.json'))
    config.update({ mode: 'client' })
    const link = createHostLink({
      fetch: () => Promise.reject(new Error('down')),
      version: '0.1.0',
      schemaVersion: SCHEMA_VERSION,
      deviceName: 'Mac',
      platform: 'darwin',
      loadDevice: () => null,
      saveDevice: () => undefined
    })
    const client = createReplicaClient({
      store,
      config,
      link,
      keys: memoryKeyStore(null),
      hotelDbFile: join(root, 'hotel.db'),
      machineName: 'Mac',
      fetch: () => Promise.reject(new Error('down')),
      becomeMain: () => undefined
    })
    try {
      expect(client.status().takeover).toEqual({ possible: false, reason: 'noCopy' })
      await expect(
        client.takeOver('yeni-sifre-123', false, encodeRecoveryText(randomBytes(32)))
      ).rejects.toThrowError(/takeoverNoCopy/)
      expect(existsSync(join(root, 'hotel.db'))).toBe(false)
    } finally {
      store.close()
    }
  })

  it('devralınmış bilgisayarda görüntüleme yetkisiyle yazan yordamlar ve programın kendi işleri hiçbir şey yazmaz (O-4)', async () => {
    let replaced = false
    const old = await hostHarness({ clock: () => clock, writeGate: () => (replaced ? 'replaced' : null) })
    try {
      const owner = old.user('sahip2', 'owner')
      const ctx = guardedCtx(ctxForUser(old.handle.db, owner, 'dev-a', 'ipc')!, () => replaced)
      const before = old.handle.sqlite.prepare('SELECT count(*) AS n FROM audit_log').get()
      replaced = true
      // "Okudum" needs only the view right: the central gate refuses it before anything is looked up.
      expect(() => old.services.shifts.acknowledge(ctx, 'yok')).toThrowError(/errors.notMainComputer/)
      expect(() =>
        old.services.auth.changePassword(ctx, {
          currentPassword: 'gizli-sifre-1',
          newPassword: 'yeni-sifre-99'
        })
      ).toThrowError(/errors.notMainComputer/)
      // The program's own jobs (systemCtx: rates, backups) write nothing either.
      expect(() =>
        old.services.currency.ingestMarketRates(
          systemCtx(),
          [{ currency: 'EUR', micro: 36_000_000, provider: 'x' }],
          'market_mid'
        )
      ).toThrowError(/errors.notMainComputer/)
      expect(() => old.services.settings.set(ctx, { 'ui.language': 'en' })).toThrowError(
        /errors.notMainComputer/
      )
      expect(old.handle.sqlite.prepare('SELECT count(*) AS n FROM audit_log').get()).toEqual(before)
    } finally {
      old.close()
    }
  })
})
