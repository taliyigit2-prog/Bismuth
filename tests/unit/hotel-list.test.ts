// P21b (K-54): a client computer knows several hotels, each with its own main computer. The saved list, the identity
// kept per hotel, switching without mixing credentials or copies, and the reason a connection failed (H-33).
// The main computers are fakes that answer `remote.hello` with their own key.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hostAddressProblem } from '../../src/shared/contract/remote'
import { handleIpcRequest } from '../../src/main/ipc/handle'
import { anonymousCtx } from '../../src/main/services/context'
import { clientBinding, createClientApp } from '../../src/main/server/client-app'
import { createConfigStore } from '../../src/main/server/connection-config'
import { createHostLink } from '../../src/main/server/host-link'
import { hostIdentity } from '../../src/main/server/host-identity'
import { copyFolder, migrateLegacyCopy } from '../../src/main/replica/store'

type Behaviour = 'ok' | 'timeout' | 'refused' | 'denied' | 'html'
const A = 'http://100.64.0.10:7373'
const B = 'http://100.64.0.20:7373'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'bismuth-hotels-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

/** Main computers by address; `seed` makes the key (another seed at the same address = another computer). */
function network() {
  const hosts = new Map<string, { seed: number; name: string; behaviour: Behaviour }>()
  const fetchLike = async (input: string, init: RequestInit): Promise<Response> => {
    const url = new URL(input)
    const host = hosts.get(url.origin)
    if (!host || host.behaviour === 'refused') throw new TypeError('fetch failed')
    if (host.behaviour === 'timeout') throw new DOMException('timed out', 'TimeoutError')
    if (host.behaviour === 'denied') return new Response('{}', { status: 403 })
    if (host.behaviour === 'html') return new Response('<html></html>', { status: 200 })
    const identity = hostIdentity(Buffer.alloc(32, host.seed))
    const { nonce } = JSON.parse(String(init.body)) as { nonce?: string }
    return new Response(
      JSON.stringify({
        app: 'bismuth',
        version: '0.1.0',
        schemaVersion: 11,
        hotelName: host.name,
        identity: { key: identity.publicKey, proof: nonce ? identity.prove(nonce) : null }
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )
  }
  return { hosts, fetchLike }
}

function client(net: ReturnType<typeof network>, file = join(dir, 'connection.json')) {
  const config = createConfigStore(file)
  if (config.get().mode !== 'client') config.update({ mode: 'client' })
  const changed: Array<string | null> = []
  const removed: string[] = []
  const link = createHostLink({
    fetch: net.fetchLike,
    version: '0.1.0',
    schemaVersion: 11,
    deviceName: 'Test',
    platform: 'linux',
    loadDevice: () => config.get().device ?? null,
    saveDevice: (device) => void config.update({ device }),
    loadHostKey: () => config.get().hostKey ?? null,
    saveHostKey: (hostKey) => void config.update({ hostKey }),
    probeEveryMs: 60_000
  })
  const app = createClientApp({
    link,
    config,
    discover: async () => [],
    openExternal: () => undefined,
    leaveClient: () => undefined,
    onHotelChanged: (code) => void changed.push(code),
    removeHotelData: (code) => void removed.push(code)
  })
  const call = async <T = unknown>(name: string, body: unknown = {}) => {
    const res = await handleIpcRequest(
      app,
      anonymousCtx('client', 'ipc'),
      { path: `/api/${name}`, body: JSON.stringify(body) },
      clientBinding(1, () => ({ deviceName: 'Test', kind: 'desktop' }))
    )
    return { status: res.status, body: JSON.parse(res.body) as T }
  }
  return { config, link, call, changed, removed }
}

type HotelView = { code: string; name: string; url: string; fingerprint: string | null; active: boolean }

describe('kayıtlı oteller', () => {
  it('bağlanılan her otel listeye girer; ad ana bilgisayarın bildirdiği addır, parmak izi tutulur', async () => {
    const net = network()
    net.hosts.set(A, { seed: 1, name: 'Pandora', behaviour: 'ok' })
    net.hosts.set(B, { seed: 2, name: 'Bosphorus Inn', behaviour: 'ok' })
    const c = client(net)
    expect((await c.call('remote.connect', { url: A })).status).toBe(202)
    expect((await c.call('remote.connect', { url: B })).status).toBe(202)
    const list = (await c.call<HotelView[]>('remote.hotels')).body
    expect(list.map((h) => h.name).sort()).toEqual(['Bosphorus Inn', 'Pandora'])
    expect(list.find((h) => h.name === 'Bosphorus Inn')).toMatchObject({ active: true, url: B })
    expect(list.find((h) => h.name === 'Pandora')?.fingerprint).toBe(
      hostIdentity(Buffer.alloc(32, 1)).fingerprint
    )
    expect(list.every((h) => /^[a-z0-9-]+$/.test(h.code))).toBe(true)
    expect(c.changed.length).toBe(2)
  })

  it('oteller arasında geçince her otelin cihaz çerezi ve kimliği ayrı kalır; yanlış parmak izinde bağlanmaz', async () => {
    const net = network()
    net.hosts.set(A, { seed: 1, name: 'Pandora', behaviour: 'ok' })
    net.hosts.set(B, { seed: 2, name: 'Bosphorus Inn', behaviour: 'ok' })
    const c = client(net)
    await c.call('remote.connect', { url: A })
    c.config.update({ device: 'deviceA.mac' })
    await c.call('remote.connect', { url: B })
    expect(c.config.get().device).toBeNull()
    c.config.update({ device: 'deviceB.mac' })
    // Back to the first: its own cookie and identity return, the second's are put aside.
    expect((await c.call('remote.connect', { url: A })).status).toBe(202)
    expect(c.config.get().device).toBe('deviceA.mac')
    expect(c.config.get().hostKey).toBe(hostIdentity(Buffer.alloc(32, 1)).publicKey)
    expect(c.config.get().parked?.[c.config.hotels().find((h) => h.url === B)!.code]?.device).toBe(
      'deviceB.mac'
    )

    // Another computer answers at the second hotel's address: nothing connects, both identities are shown.
    net.hosts.set(B, { seed: 9, name: 'Bosphorus Inn', behaviour: 'ok' })
    const refused = await c.call<{
      error: { messageKey: string; details: { known: string; offered: string } }
    }>('remote.connect', { url: B })
    expect(refused.status).toBe(409)
    expect(refused.body.error.messageKey).toBe('errors.hostIdentityChanged')
    expect(refused.body.error.details.known).toBe(hostIdentity(Buffer.alloc(32, 2)).fingerprint)
    expect(refused.body.error.details.offered).toBe(hostIdentity(Buffer.alloc(32, 9)).fingerprint)
    // Still the first hotel in use.
    expect((await c.call<HotelView[]>('remote.hotels')).body.find((h) => h.active)?.url).toBe(A)
    // The person accepts the fingerprint shown: connects, and the new identity is kept for that hotel.
    const accepted = await c.call('remote.connect', {
      url: B,
      acceptIdentity: hostIdentity(Buffer.alloc(32, 9)).fingerprint
    })
    expect(accepted.status).toBe(202)
    expect(c.config.get().hostKey).toBe(hostIdentity(Buffer.alloc(32, 9)).publicKey)
  })

  it('aynı ana bilgisayar yeni adresle bağlanınca yeni otel eklenmez, adresi güncellenir', async () => {
    const net = network()
    net.hosts.set(A, { seed: 1, name: 'Pandora', behaviour: 'ok' })
    const c = client(net)
    await c.call('remote.connect', { url: A })
    net.hosts.set(B, { seed: 1, name: 'Pandora', behaviour: 'ok' })
    await c.call('remote.connect', { url: B })
    const list = (await c.call<HotelView[]>('remote.hotels')).body
    expect(list).toHaveLength(1)
    expect(list[0]?.url).toBe(B)
  })

  it('ad değişir, kullanımdaki otelin adresi değişmez, başka otelin adresi çakışırsa reddedilir', async () => {
    const net = network()
    net.hosts.set(A, { seed: 1, name: 'Pandora', behaviour: 'ok' })
    net.hosts.set(B, { seed: 2, name: 'Bosphorus Inn', behaviour: 'ok' })
    const c = client(net)
    await c.call('remote.connect', { url: A })
    await c.call('remote.connect', { url: B })
    const [pandora] = (await c.call<HotelView[]>('remote.hotels')).body.filter((h) => h.url === A)
    const inUse = (await c.call<HotelView[]>('remote.hotels')).body.find((h) => h.active)!
    const renamed = await c.call<HotelView[]>('remote.hotelUpdate', {
      code: pandora!.code,
      name: 'Pandora Kadıköy'
    })
    expect(renamed.body.find((h) => h.code === pandora!.code)?.name).toBe('Pandora Kadıköy')
    const clash = await c.call<{ error: { messageKey: string } }>('remote.hotelUpdate', {
      code: pandora!.code,
      url: B
    })
    expect(clash.body.error.messageKey).toBe('errors.hotelExists')
    const moving = await c.call<{ error: { messageKey: string } }>('remote.hotelUpdate', {
      code: inUse.code,
      url: 'http://100.64.0.30:7373'
    })
    expect(moving.body.error.messageKey).toBe('errors.hotelInUse')
    const bad = await c.call('remote.hotelUpdate', { code: pandora!.code, url: 'http://:99999' })
    expect(bad.status).toBe(400)
    const moved = await c.call<HotelView[]>('remote.hotelUpdate', {
      code: pandora!.code,
      url: 'http://100.64.0.40:7373'
    })
    expect(moved.body.find((h) => h.code === pandora!.code)?.url).toBe('http://100.64.0.40:7373')
  })

  it('oteli kaldırınca listeden, bekleyen kimlik bilgilerinden ve kopyasından gider; kullanımdaki kaldırılırsa bağlantı kesilir', async () => {
    const net = network()
    net.hosts.set(A, { seed: 1, name: 'Pandora', behaviour: 'ok' })
    net.hosts.set(B, { seed: 2, name: 'Bosphorus Inn', behaviour: 'ok' })
    const c = client(net)
    await c.call('remote.connect', { url: A })
    await c.call('remote.connect', { url: B })
    const list = (await c.call<HotelView[]>('remote.hotels')).body
    const a = list.find((h) => h.url === A)!
    const b = list.find((h) => h.url === B)!
    const afterA = await c.call<HotelView[]>('remote.hotelRemove', { code: a.code })
    expect(afterA.body.map((h) => h.code)).toEqual([b.code])
    expect(c.config.get().parked?.[a.code]).toBeUndefined()
    expect(c.removed).toEqual([a.code])
    await c.call('remote.hotelRemove', { code: b.code })
    expect(c.config.get().hostUrl).toBeNull()
    expect(c.config.get().activeHotel).toBeNull()
    expect((await c.call('remote.clientStatus')).body).toMatchObject({ state: 'none', hostUrl: null })
    expect((await c.call('remote.hotelRemove', { code: b.code })).status).toBe(404)
  })

  it('"başka ana bilgisayar seç" oteli listede bırakır ve kimlik bilgilerini bekletir', async () => {
    const net = network()
    net.hosts.set(A, { seed: 1, name: 'Pandora', behaviour: 'ok' })
    const c = client(net)
    await c.call('remote.connect', { url: A })
    c.config.update({ device: 'deviceA.mac' })
    await c.call('remote.forgetHost')
    expect(c.config.get().hostUrl).toBeNull()
    expect(c.config.get().device).toBeNull()
    expect((await c.call<HotelView[]>('remote.hotels')).body).toHaveLength(1)
    await c.call('remote.connect', { url: A })
    expect(c.config.get().device).toBe('deviceA.mac')
  })

  it('kayıtlar dosyada kalır; tek adresli eski dosya ilk otel olur ve kopya klasörü taşınır', async () => {
    const file = join(dir, 'connection.json')
    writeFileSync(file, JSON.stringify({ mode: 'client', hostUrl: A, device: 'old.mac' }))
    const store = createConfigStore(file)
    const code = store.takeMigration()
    expect(code).toMatch(/^[a-z0-9-]+$/)
    expect(store.takeMigration()).toBeNull()
    expect(store.hotels()).toHaveLength(1)
    expect(store.get()).toMatchObject({ activeHotel: code, device: 'old.mac', hostUrl: A })
    expect(JSON.parse(readFileSync(file, 'utf8')).hotels).toHaveLength(1)

    mkdirSync(join(dir, 'replica'), { recursive: true })
    writeFileSync(join(dir, 'replica', 'replica.db'), 'copy')
    migrateLegacyCopy(dir, code!)
    expect(existsSync(join(dir, 'replica', 'replica.db'))).toBe(false)
    expect(readFileSync(join(copyFolder(dir, code), 'replica.db'), 'utf8')).toBe('copy')
    // Not again: a copy already under the code stays.
    writeFileSync(join(dir, 'replica', 'replica.db'), 'other')
    migrateLegacyCopy(dir, code!)
    expect(readFileSync(join(copyFolder(dir, code), 'replica.db'), 'utf8')).toBe('copy')
  })

  it('kopya izni de otel başına bekletilir (başka otelin kopyası karışmaz)', () => {
    const file = join(dir, 'connection.json')
    const store = createConfigStore(file)
    store.update({ mode: 'client' })
    const a = store.addHotel('Pandora', A)
    const b = store.addHotel('Pandora', B)
    expect([a, b]).toEqual(['pandora', 'pandora-2'])
    store.activate(a)
    const replica = { token: 'T'.repeat(24), userId: 'u1', userName: 'Sahip', folder: null }
    store.update({ replica })
    store.activate(b)
    expect(store.get().replica).toBeUndefined()
    store.activate(a)
    expect(store.get().replica).toEqual(replica)
  })
})

describe('nedenli bağlantı hatası (H-33)', () => {
  const cases: Array<[Behaviour, number, string]> = [
    ['refused', 503, 'errors.hostUnreachable'],
    ['timeout', 503, 'errors.hostTimeout'],
    ['denied', 503, 'errors.hostDenied'],
    ['html', 400, 'errors.notBismuth']
  ]
  it.each(cases)('%s → %s %s', async (behaviour, status, key) => {
    const net = network()
    net.hosts.set(A, { seed: 1, name: 'Pandora', behaviour })
    const c = client(net)
    const answer = await c.call<{ error: { messageKey: string } }>('remote.connect', { url: A })
    expect(answer.status).toBe(status)
    expect(answer.body.error.messageKey).toBe(key)
    // Nothing joined the list.
    expect((await c.call<HotelView[]>('remote.hotels')).body).toEqual([])
  })

  it('geçersiz adres sorulmadan reddedilir', async () => {
    const net = network()
    const spy = vi.spyOn(net, 'fetchLike')
    const c = client(net)
    for (const url of ['abc def', 'http://', 'host:99999', 'https://x.test'])
      expect((await c.call('remote.connect', { url })).status).toBe(400)
    expect(spy).not.toHaveBeenCalled()
  })

  it('adres sorunu yazılırken nedenini söyler', () => {
    expect(hostAddressProblem('')).toBe('empty')
    expect(hostAddressProblem('https://192.168.1.20')).toBe('scheme')
    expect(hostAddressProblem('192.168.1.20:99999')).toBe('port')
    expect(hostAddressProblem('http://')).toBe('invalid')
    expect(hostAddressProblem('192.168.1.20')).toBeNull()
    expect(hostAddressProblem('bismuth-b.netbird.cloud:7373')).toBeNull()
  })
})
