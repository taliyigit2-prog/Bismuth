// Faz 13 madde 3 and 10 (the copy part): the change feed of the main computer and the owner's read-only copy.
// A real main computer listens on 127.0.0.1:47474 over an in-memory hotel. The feed refuses callers without a
// session or grant (401) and roles without `remote.settings` (403); identity numbers only reach a role with
// `guests.identity`. A client computer that signs in as the owner starts its copy by itself; when the main
// computer goes away every screen reads from the copy (status 203, writes refused), and it is live again once the
// main computer answers.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MIGRATIONS } from '../factories/db'
import { rolePermissions, roles } from '../../src/main/db/schema'
import { handleIpcRequest } from '../../src/main/ipc/handle'
import { createReplicaStore, type ReplicaStore } from '../../src/main/replica/store'
import { memoryKeyStore } from '../../src/main/security/bismuth-key'
import { anonymousCtx, systemCtx } from '../../src/main/services/context'
import { clientBinding, createClientApp } from '../../src/main/server/client-app'
import { createConfigStore } from '../../src/main/server/connection-config'
import { createHostLink } from '../../src/main/server/host-link'
import { createListeners, type Listeners } from '../../src/main/server/listen'
import { createReplicaClient, type ReplicaClient } from '../../src/main/server/replica-client'
import {
  createRemoteService,
  setRemoteRuntime,
  setReplicaHostRuntime
} from '../../src/main/server/remote-service'
import { createReplicaSync } from '../../src/main/server/replica-sync'
import { openReplicaDatabase } from '../../src/main/db/client'
import { ctxForUser } from '../../src/main/services/users-service'
import { hostIdentity } from '../../src/main/server/host-identity'
import { hostHarness, PASSWORD, phone, type HostHarness } from './host-harness'

const PORT = 47474
const URL_ = `http://127.0.0.1:${PORT}`
const WINDOW = 4

let h: HostHarness
let listeners: Listeners
let dir: string
let store: ReplicaStore | null = null
let replica: ReplicaClient | null = null

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'bismuth-replica-live-'))
  h = await hostHarness({ replica: {} })
  h.user('sahip', 'owner')
  h.user('resepsiyon', 'reception')
  h.user('muhasebe', 'accountant')
  setRemoteRuntime({
    applyMode: async () => undefined,
    server: () => ({
      running: true,
      addresses: [],
      error: null,
      announced: false,
      listenLan: false,
      unservedPrivate: []
    }),
    identity: hostIdentity(Buffer.alloc(32, 5)),
    openAtLogin: () => null,
    setOpenAtLogin: () => undefined,
    becomeClient: () => undefined,
    discover: async () => [],
    version: '0.1.0',
    schemaVersion: () => h.handle.schemaVersion
  })
  setReplicaHostRuntime({
    db: h.handle.db,
    relayStatus: () => {
      throw new Error('not used')
    },
    relayRun: async () => undefined,
    replaced: () => null,
    conflicts: () => [],
    conflictRows: () => []
  })
  listeners = createListeners((req, env) => h.app.fetch(req, env), PORT)
  await listeners.sync(['127.0.0.1'])
})
afterEach(async () => {
  replica?.stop()
  replica = null
  store = null
  setRemoteRuntime(null)
  setReplicaHostRuntime(null)
  await listeners.close()
  h.close()
  rmSync(dir, { recursive: true, force: true })
})

const signedIn = async (username: string) => {
  const p = phone(h.app)
  expect((await p.call('auth.signIn', { username, secret: PASSWORD })).status).toBe(200)
  return p
}

const allowRemoteSettings = (code: string): void => {
  const role = h.handle.db.select().from(roles).where(eq(roles.code, code)).get()!
  h.handle.db
    .insert(rolePermissions)
    .values({ roleId: role.id, permission: 'remote.settings', level: 'view' })
    .onConflictDoUpdate({
      target: [rolePermissions.roleId, rolePermissions.permission],
      set: { level: 'view' }
    })
    .run()
}

const addGuest = (id: string, doc: string): void => {
  h.handle.sqlite
    .prepare(
      "INSERT INTO guests (id, first_name, last_name, name_normalized, id_doc_type, id_doc_number, created_at, updated_at) VALUES (?, 'Ayşe', 'Yılmaz', 'ayse yilmaz', 'tc', ?, 'x', 'x')"
    )
    .run(id, doc)
}

describe('değişiklik akışı güvenliği', () => {
  it('oturumsuz 401, uzaktan erişim ayarı izni olmayan 403, sahibe 200', async () => {
    const anonymous = phone(h.app)
    expect((await anonymous.request('/api/replica/changes?after=0', { method: 'GET' })).status).toBe(401)
    expect((await anonymous.request('/api/replica/snapshot', { method: 'GET' })).status).toBe(401)
    const reception = await signedIn('resepsiyon')
    expect((await reception.request('/api/replica/changes?after=0', { method: 'GET' })).status).toBe(403)
    expect((await reception.request('/api/replica/snapshot', { method: 'GET' })).status).toBe(403)
    const owner = await signedIn('sahip')
    const res = await owner.request('/api/replica/changes?after=0', { method: 'GET' })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ epoch: 1, snapshotNeeded: false })
    // A made-up grant is nobody.
    const fake = phone(h.app, undefined, { authorization: `Bearer ${'x'.repeat(43)}` })
    expect((await fake.request('/api/replica/changes?after=0', { method: 'GET' })).status).toBe(401)
  })

  it('kimlik numarası yalnız kimlik görme izni olan role gider; şifre özeti hiç gitmez', async () => {
    addGuest('g1', 'TC11122233344')
    allowRemoteSettings('accountant')
    const owner = await signedIn('sahip')
    const ownerText = await (
      await owner.request('/api/replica/changes?after=0&limit=5000', { method: 'GET' })
    ).text()
    expect(ownerText).toContain('TC11122233344')
    expect(ownerText).not.toContain('scrypt$')
    const accountant = await signedIn('muhasebe')
    const res = await accountant.request('/api/replica/snapshot', { method: 'GET' })
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('ayse yilmaz')
    expect(text).not.toContain('TC11122233344')
    expect(text).not.toContain('scrypt$')
    expect(text.trim().split('\n').at(-1)).toMatch(/"end":true/)
  })

  it('kopya izni yalnız ağ üzerinden ve izinli role verilir; cihaz çıkarılınca biter, rol izni kalkınca 403', async () => {
    const reception = await signedIn('resepsiyon')
    expect((await reception.call('remote.replicaGrant')).status).toBe(403)
    const owner = await signedIn('sahip')
    const grant = await owner.call<{ token: string; userId: string }>('remote.replicaGrant')
    expect(grant.status).toBe(200)
    const mac = phone(h.app, undefined, { authorization: `Bearer ${grant.body.token}` })
    expect((await mac.request('/api/replica/changes?after=0', { method: 'GET' })).status).toBe(200)
    // The owner's role cannot lose it, but a manager's can: make one and take the right away.
    allowRemoteSettings('manager')
    h.user('mudur', 'manager')
    const manager = await signedIn('mudur')
    const mGrant = await manager.call<{ token: string }>('remote.replicaGrant')
    expect(mGrant.status).toBe(200)
    const managerMac = phone(h.app, undefined, { authorization: `Bearer ${mGrant.body.token}` })
    expect((await managerMac.request('/api/replica/changes?after=0', { method: 'GET' })).status).toBe(200)
    const role = h.handle.db.select().from(roles).where(eq(roles.code, 'manager')).get()!
    h.handle.db
      .update(rolePermissions)
      .set({ level: 'none' })
      .where(eq(rolePermissions.roleId, role.id))
      .run()
    expect((await managerMac.request('/api/replica/changes?after=0', { method: 'GET' })).status).toBe(403)
    // "Cihazı çıkar" on the owner's device ends its grant.
    const device = h.handle.sqlite
      .prepare('SELECT device_id AS id FROM replica_grants WHERE user_id = ? AND revoked_at IS NULL')
      .get(grant.body.userId) as { id: string }
    h.services.auth.revokeDevice(systemCtx(), device.id)
    expect((await mac.request('/api/replica/changes?after=0', { method: 'GET' })).status).toBe(401)
  })
})

describe('kopya akışı sınırları ve kimlik numaraları (P13sec)', () => {
  it('aynı kişi/adres için en çok 2 açık akış; tam kopya dakikada en çok 2 (D4)', async () => {
    const owner = await signedIn('sahip')
    const open = async () =>
      owner.request('/api/replica/changes?after=0', {
        method: 'GET',
        headers: { accept: 'text/event-stream' }
      })
    const first = await open()
    const second = await open()
    const third = await open()
    expect([first.status, second.status, third.status]).toEqual([200, 200, 429])
    // Closing one makes room again.
    await first.body!.cancel()
    const again = await open()
    expect(again.status).toBe(200)
    await second.body!.cancel()
    await again.body!.cancel()
    const snaps = []
    for (let i = 0; i < 3; i++) {
      const res = await owner.request('/api/replica/snapshot', { method: 'GET' })
      snaps.push(res.status)
      await res.body?.cancel()
    }
    expect(snaps).toEqual([200, 200, 429])
  })

  it('rolünden kimlik görme izni kalkınca kopyadaki kimlik numaraları silinir (D6)', async () => {
    addGuest('g1', 'TC11122233344')
    allowRemoteSettings('accountant')
    const role = h.handle.db.select().from(roles).where(eq(roles.code, 'accountant')).get()!
    const setIdentity = (level: 'view' | 'none') =>
      h.handle.db
        .insert(rolePermissions)
        .values({ roleId: role.id, permission: 'guests.identity', level })
        .onConflictDoUpdate({
          target: [rolePermissions.roleId, rolePermissions.permission],
          set: { level }
        })
        .run()
    setIdentity('view')
    const accountant = await signedIn('muhasebe')
    const grant = await accountant.call<{ token: string }>('remote.replicaGrant')
    expect(grant.status).toBe(200)
    const copy = openReplicaDatabase({ file: join(dir, 'd6.db'), migrationsFolder: MIGRATIONS })
    const doc = () =>
      (
        copy.writer.prepare("SELECT id_doc_number AS d FROM guests WHERE id = 'g1'").get() as
          { d: string | null } | undefined
      )?.d
    const sync = createReplicaSync({
      fetch: (url, init) => {
        // In process: the Host header a real connection would carry.
        const headers = new Headers(init.headers)
        headers.set('host', '192.168.1.20:7373')
        return Promise.resolve(
          h.app.fetch(new Request(url, { ...init, headers }), {
            incoming: { socket: { remoteAddress: '192.168.1.45' } }
          })
        )
      },
      hostUrl: () => 'http://192.168.1.20:7373',
      token: () => grant.body.token,
      dropToken: () => undefined,
      writer: () => copy.writer,
      schemaVersion: () => h.handle.schemaVersion,
      retryMs: 50
    })
    try {
      sync.start()
      await waitFor(() => doc() === 'TC11122233344')
      setIdentity('none')
      sync.poke()
      await waitFor(() => doc() === null)
      // Allowed again: a fresh snapshot brings them back.
      setIdentity('view')
      sync.poke()
      await waitFor(() => doc() === 'TC11122233344')
    } finally {
      sync.stop()
      copy.close()
    }
  })

  it('çakışan kayıtlar dosyasına kimlik numarası yalnız kimlik görme izni olan rolle girer (D7)', async () => {
    const asked: boolean[] = []
    setReplicaHostRuntime({
      db: h.handle.db,
      relayStatus: () => {
        throw new Error('not used')
      },
      relayRun: async () => undefined,
      replaced: () => ({ epoch: 2, previousEpoch: 1, baseSeq: 0, by: 'Mac', at: 'x', seenAt: 'x' }),
      conflicts: () => [],
      conflictRows: (identity) => {
        asked.push(identity)
        return []
      },
      saveFile: async () => '/tmp/x.json'
    })
    const remote = createRemoteService(h.services)
    allowRemoteSettings('accountant')
    const accountant = ctxForUser(h.handle.db, 'u-muhasebe', 'dev', 'ipc')!
    const owner = ctxForUser(h.handle.db, 'u-sahip', 'dev', 'ipc')!
    await remote.saveConflicts(accountant, 'ipc')
    await remote.saveConflicts(owner, 'ipc')
    expect(asked).toEqual([false, true])
  })
})

function client() {
  const config = createConfigStore(join(dir, 'connection.json'))
  config.update({ mode: 'client', hostUrl: URL_ })
  const link = createHostLink({
    version: '0.1.0',
    schemaVersion: h.handle.schemaVersion,
    deviceName: 'Sahibin Mac',
    platform: 'darwin',
    loadDevice: () => config.get().device ?? null,
    saveDevice: (device) => void config.update({ device }),
    probeEveryMs: 200,
    timeoutMs: 15_000
  })
  link.setHost(URL_)
  store = createReplicaStore({ root: dir, migrationsFolder: MIGRATIONS, version: '0.1.0' })
  replica = createReplicaClient({
    store,
    config,
    link,
    keys: memoryKeyStore(null),
    hotelDbFile: join(dir, 'hotel.db'),
    machineName: 'Sahibin Mac',
    becomeMain: () => undefined
  })
  replica.start()
  const app = createClientApp({
    link,
    config,
    discover: async () => [],
    openExternal: () => undefined,
    leaveClient: () => undefined,
    replica: { client: replica, store }
  })
  const call = async <T = unknown>(name: string, body: unknown = {}) => {
    const res = await handleIpcRequest(
      app,
      anonymousCtx('client', 'ipc'),
      { path: `/api/${name}`, body: JSON.stringify(body) },
      clientBinding(WINDOW, () => ({ deviceName: 'Sahibin Mac', kind: 'desktop' }))
    )
    return { status: res.status, body: JSON.parse(res.body) as T }
  }
  return { config, link, call }
}

const waitFor = async (check: () => boolean | Promise<boolean>, ms = 30_000): Promise<void> => {
  const until = Date.now() + ms
  while (Date.now() < until) {
    if (await check()) return
    await new Promise((r) => setTimeout(r, 50))
  }
  throw new Error('timed out')
}

describe('yedek kopya (istemci)', () => {
  it('sahip oturum açınca kopya kendiliğinden başlar; ana bilgisayar kapanınca ekranlar kopyadan salt okunur açılır; geri gelince canlıya döner', async () => {
    addGuest('g1', 'TC99988877766')
    const c = client()
    expect((await c.call('auth.signIn', { username: 'sahip', secret: PASSWORD })).status).toBe(200)
    await waitFor(() => c.config.get().replica?.token != null)
    await waitFor(async () => (await c.call<{ state: string }>('remote.replicaStatus')).body.state === 'live')
    // A change on the main computer arrives in the copy within a few seconds.
    addGuest('g2', 'TC55566677788')
    await waitFor(
      () =>
        (store!.writer().prepare("SELECT count(*) AS n FROM guests WHERE id = 'g2'").get() as { n: number })
          .n === 1
    )
    expect(store!.writer().prepare("SELECT id_doc_number AS d FROM guests WHERE id = 'g2'").get()).toEqual({
      d: 'TC55566677788'
    })

    // The main computer goes away.
    await listeners.close()
    const list = await c.call<{ items?: unknown[] }>('guests.list', {})
    expect(list.status).toBe(203)
    expect((await c.call('auth.state')).body).toMatchObject({ session: { user: { username: 'sahip' } } })
    const status = await c.call<{ serving: boolean; userName: string }>('remote.replicaStatus')
    expect(status.body).toMatchObject({ serving: true, userName: 'sahip' })
    // Writes are refused with "read-only copy".
    const write = await c.call('guests.create', { firstName: 'Yeni', lastName: 'Misafir' })
    expect(write).toMatchObject({ status: 409, body: { error: { messageKey: 'errors.readOnlyCopy' } } })

    // Back: live again (200), the copy follows again.
    listeners = createListeners((req, env) => h.app.fetch(req, env), PORT)
    await listeners.sync(['127.0.0.1'])
    await waitFor(async () => (await c.call('guests.list', {})).status === 200)
  }, 90_000)

  it('kopyası olmayan istemci ana bilgisayar yokken bağlantı ekranında kalır (eski davranış)', async () => {
    const c = client()
    await listeners.close()
    expect((await c.call('auth.state')).body).toMatchObject({ setup: 'needed', mode: 'client' })
    expect((await c.call<{ state: string }>('remote.replicaStatus')).body.state).toBe('off')
  })
})
