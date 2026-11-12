// Faz 13 madde 3 (the live part) and yasak 13: a computer in client mode keeps no hotel data; its window's calls go
// to the main computer through the main process (host-link + client-app), with the session cookie kept there.
// A real main computer listens on 127.0.0.1 (port 47466) over an in-memory hotel.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { handleIpcRequest } from '../../src/main/ipc/handle'
import { anonymousCtx, systemCtx } from '../../src/main/services/context'
import { clientBinding, createClientApp } from '../../src/main/server/client-app'
import { createConfigStore } from '../../src/main/server/connection-config'
import { createHostLink } from '../../src/main/server/host-link'
import { createListeners, type Listeners } from '../../src/main/server/listen'
import { setRemoteRuntime } from '../../src/main/server/remote-service'
import { hostIdentity } from '../../src/main/server/host-identity'
import { hostHarness, PASSWORD, type HostHarness } from './host-harness'

const PORT = 47466
const URL_ = `http://127.0.0.1:${PORT}`
const WINDOW = 3

let h: HostHarness
let listeners: Listeners
let dir: string

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'bismuth-client-'))
  h = await hostHarness()
  h.user('sahip', 'owner')
  // The host's hello names its version: the same as this "client" program.
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
  listeners = createListeners((req, env) => h.app.fetch(req, env), PORT)
  await listeners.sync(['127.0.0.1'])
})
afterEach(async () => {
  setRemoteRuntime(null)
  await listeners.close()
  h.close()
  rmSync(dir, { recursive: true, force: true })
})

function client(version = '0.1.0') {
  const config = createConfigStore(join(dir, 'connection.json'))
  config.update({ mode: 'client' })
  let left = 0
  const link = createHostLink({
    version,
    schemaVersion: h.handle.schemaVersion,
    deviceName: 'Sahibin Mac',
    platform: 'darwin',
    loadDevice: () => config.get().device ?? null,
    saveDevice: (device) => void config.update({ device }),
    probeEveryMs: 60_000
  })
  const app = createClientApp({
    link,
    config,
    discover: async () => [{ name: 'Bismuth (OTEL-PC)', url: URL_, hotelName: 'Pandora', version: '0.1.0' }],
    openExternal: () => undefined,
    leaveClient: () => void left++
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
  return { config, link, call, left: () => left }
}

describe('istemci modu', () => {
  it('ana bilgisayar seçilmeden pencere bağlantı ekranına gider; yerel veritabanı yok', async () => {
    const c = client()
    expect((await c.call('auth.state')).body).toEqual({ setup: 'needed', mode: 'client', session: null })
    const settings = await c.call<Record<string, unknown>>('settings.get')
    expect(settings.body['app.mode']).toBe('client')
    expect((await c.call('rooms.list')).status).toBe(503)
    expect(await c.call('remote.clientStatus')).toMatchObject({ body: { mode: 'client', state: 'none' } })
  })

  it('bulunan ana bilgisayara bağlanır, oturum açar, kayıt yazar; ana bilgisayar onu cihaz olarak görür', async () => {
    const c = client()
    const found = await c.call<{ url: string }[]>('remote.discover')
    expect(found.body[0]?.url).toBe(URL_)
    const connected = await c.call('remote.connect', { url: '127.0.0.1:47466' })
    expect(connected.body).toMatchObject({ state: 'connected', hostUrl: URL_, host: { app: 'bismuth' } })
    expect(JSON.parse(readFileSync(join(dir, 'connection.json'), 'utf8'))).toMatchObject({ hostUrl: URL_ })
    // The host is set up: the window goes to sign-in there.
    expect((await c.call('auth.state')).body).toMatchObject({ setup: 'done', session: null })
    expect((await c.call('auth.signIn', { username: 'sahip', secret: PASSWORD })).status).toBe(200)
    expect((await c.call('auth.state')).body).toMatchObject({ session: { user: { username: 'sahip' } } })
    // A write lands in the main computer's database.
    const room = await c.call<{ id: string; number: string }>('rooms.create', {
      number: '901',
      roomTypeId: (await c.call<{ id: string }[]>('rooms.listTypes')).body[0]!.id,
      beds: 2,
      validFrom: '2026-10-01'
    })
    expect(room.status).toBe(200)
    expect(h.services.rooms.listRooms(systemCtx(), {}).some((r) => r.number === '901')).toBe(true)
    // The main computer lists this computer as a desktop device named by itself; the device cookie is kept.
    const devices = h.services.auth.listDevices(systemCtx())
    expect(devices[0]).toMatchObject({ name: 'Sahibin Mac', kind: 'desktop', platform: 'darwin' })
    expect(c.config.get().device).toMatch(/^[0-9A-Z]{26}\./)
  })

  it('farklı sürüm: bağlantı "sürüm farklı" olur, yazma yapılmaz; tarayıcıda açma önerilir', async () => {
    const c = client('9.9.9')
    const res = await c.call('remote.connect', { url: URL_ })
    expect(res.body).toMatchObject({
      state: 'incompatible',
      host: { version: '0.1.0' },
      mine: { version: '9.9.9' }
    })
    expect((await c.call('auth.state')).body).toMatchObject({ setup: 'needed', mode: 'client' })
    const write = await c.call('rooms.list')
    expect(write).toMatchObject({ status: 503, body: { error: { messageKey: 'errors.hostVersion' } } })
  })

  it('ana bilgisayar kapanınca anlaşılır hata (503 "ulaşılamıyor"); açılınca yeniden çalışır', async () => {
    const c = client()
    await c.call('remote.connect', { url: URL_ })
    await c.call('auth.signIn', { username: 'sahip', secret: PASSWORD })
    await listeners.close()
    const down = await c.call('rooms.list')
    expect(down).toMatchObject({
      status: 503,
      body: { error: { code: 'UNAVAILABLE', messageKey: 'errors.hostUnreachable' } }
    })
    expect((await c.call('remote.clientStatus')).body).toMatchObject({ state: 'unreachable' })
    await listeners.sync(['127.0.0.1'])
    expect((await c.call('rooms.list')).status).toBe(200)
    expect((await c.call('remote.clientStatus')).body).toMatchObject({ state: 'connected' })
  })

  it('yanlış adres ve Bismuth olmayan adres anlaşılır hata verir', async () => {
    const c = client()
    expect((await c.call('remote.connect', { url: 'ftp://x' })).body).toMatchObject({
      error: { messageKey: 'errors.hostAddress' }
    })
    expect((await c.call('remote.connect', { url: '127.0.0.1:47469' })).body).toMatchObject({
      error: { messageKey: 'errors.hostUnreachable' }
    })
  })

  it('başka kimlik yalnız ekranda gösterilen parmak iziyle kabul edilir; arada anahtar değişince kabul reddedilir (N-7)', async () => {
    const runtimeWith = (identity: ReturnType<typeof hostIdentity>) =>
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
        identity,
        openAtLogin: () => null,
        setOpenAtLogin: () => undefined,
        becomeClient: () => undefined,
        discover: async () => [],
        version: '0.1.0',
        schemaVersion: () => h.handle.schemaVersion
      })
    const c = client()
    await c.call('remote.connect', { url: URL_ })
    const first = c.link.knownKey()
    // Another computer answers at the address; the screen shows its fingerprint.
    const second = hostIdentity(Buffer.alloc(32, 6))
    runtimeWith(second)
    const changed = await c.call<{ error: { details: { offered: string } } }>('remote.connect', { url: URL_ })
    expect(changed.status).toBe(409)
    const shown = changed.body.error.details.offered
    expect(shown).toBe(second.fingerprint)
    // Before the person accepts, a third key answers: neither way of accepting keeps it.
    const third = hostIdentity(Buffer.alloc(32, 8))
    runtimeWith(third)
    await c.link.probe().catch(() => undefined)
    const viaConnect = await c.call('remote.connect', { url: URL_, acceptIdentity: shown })
    expect(viaConnect).toMatchObject({
      status: 409,
      body: { error: { messageKey: 'errors.hostIdentityChanged' } }
    })
    const viaAccept = await c.call('remote.acceptHostIdentity', { fingerprint: shown })
    expect(viaAccept).toMatchObject({
      status: 409,
      body: { error: { details: { offered: third.fingerprint } } }
    })
    expect(c.link.knownKey()).toBe(first)
    // Without the fingerprint nothing is accepted at all.
    expect((await c.call('remote.acceptHostIdentity', {})).status).toBe(400)
    // The fingerprint shown now is accepted.
    const accepted = await c.call('remote.acceptHostIdentity', { fingerprint: third.fingerprint })
    expect(accepted).toMatchObject({ body: { state: 'connected', identity: { known: third.fingerprint } } })
  })

  it('"tek başına kur" ve adresi unutma yerelde yapılır', async () => {
    const c = client()
    await c.call('remote.connect', { url: URL_ })
    expect((await c.call('remote.forgetHost')).body).toMatchObject({ hostUrl: null, state: 'none' })
    expect((await c.call('remote.leaveClient')).status).toBe(202) // answered by this computer itself (P13b: 202, not the main computer's 200)
    expect(c.left()).toBe(1)
  })
})
