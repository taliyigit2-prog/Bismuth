import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { normalizeHostUrl } from '@shared/contract/remote'
import { createDiscovery, foundHostOf } from '../discovery'
import { createConfigStore, readConnectionConfig } from './connection-config'
import { hostIdentity } from './host-identity'
import { createHostLink } from './host-link'

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})
const tempFile = () => {
  const dir = mkdtempSync(join(tmpdir(), 'bismuth-conn-'))
  dirs.push(dir)
  return join(dir, 'connection.json')
}

describe('istemci modu dosyası (yasak 13: mod veritabanında değil)', () => {
  it('dosya yoksa ya da bozuksa bu bilgisayar kendi verisini tutar', () => {
    const file = tempFile()
    expect(readConnectionConfig(file)).toEqual({ mode: 'local', hostUrl: null })
    writeFileSync(file, '{bozuk')
    expect(readConnectionConfig(file).mode).toBe('local')
  })

  it('istemci modu, adres ve cihaz çerezi saklanır; adres düzeltilir', () => {
    const file = tempFile()
    const store = createConfigStore(file)
    store.update({ mode: 'client', hostUrl: '192.168.1.20', device: 'X.y' })
    expect(readConnectionConfig(file)).toEqual({
      mode: 'client',
      hostUrl: 'http://192.168.1.20:7373',
      device: 'X.y'
    })
  })
})

describe('adres yazımı', () => {
  it('IP, ad ve port biçimleri http://ad:port olur; geçersizler reddedilir', () => {
    expect(normalizeHostUrl('192.168.1.20')).toBe('http://192.168.1.20:7373')
    // QA3d: a name no DNS could hold is not an address (a format error, not "unreachable").
    expect(normalizeHostUrl('a'.repeat(300))).toBeNull()
    expect(normalizeHostUrl(`${'ab.'.repeat(120)}com`)).toBeNull()
    expect(normalizeHostUrl(' bismuth-host.netbird.cloud:7374 ')).toBe(
      'http://bismuth-host.netbird.cloud:7374'
    )
    expect(normalizeHostUrl('http://100.64.0.2:7373/#/today')).toBe('http://100.64.0.2:7373')
    expect(normalizeHostUrl('https://x')).toBeNull()
    expect(normalizeHostUrl('ftp://x')).toBeNull()
    expect(normalizeHostUrl('a b')).toBeNull()
    expect(normalizeHostUrl('http://u:p@x')).toBeNull()
    expect(normalizeHostUrl('')).toBeNull()
  })
})

describe('yerel ağ duyurusu (bonjour)', () => {
  it('duyurudan yerel ağ adresi seçilir; yalnız genel adres varsa gösterilmez', () => {
    expect(
      foundHostOf({
        name: 'Bismuth (OTEL-PC)',
        addresses: ['85.105.1.2', '100.64.0.2', '192.168.1.20'],
        port: 7373,
        txt: { v: '0.1.0', h: 'Pandora' }
      } as never)
    ).toEqual({
      name: 'Bismuth (OTEL-PC)',
      url: 'http://192.168.1.20:7373',
      hotelName: 'Pandora',
      version: '0.1.0'
    })
    expect(foundHostOf({ name: 'x', addresses: ['85.105.1.2'], port: 7373, txt: {} } as never)).toBeNull()
  })

  it('duyuru _bismuth._tcp türüyle, veri sürümü ve otel adıyla yapılır (program sürümü yok); arama süre sonunda biter', async () => {
    const published: unknown[] = []
    const services = [
      { name: 'Bismuth (OTEL-PC)', addresses: ['192.168.1.20'], port: 7373, txt: { h: 'Pandora' } }
    ]
    const fake = {
      publish: (o: unknown) => {
        published.push(o)
        return { on: () => undefined }
      },
      find: (_o: unknown, onUp: (s: unknown) => void) => {
        for (const s of services) onUp(s)
        return { stop: vi.fn() }
      },
      unpublishAll: (cb: () => void) => cb(),
      destroy: vi.fn()
    }
    const discovery = createDiscovery(() => fake as never)
    discovery.publish({
      name: 'Bismuth (OTEL-PC)',
      port: 7373,
      schemaVersion: 11,
      hotelName: 'Pandora'
    })
    expect(published[0]).toMatchObject({
      type: 'bismuth',
      port: 7373,
      txt: { s: '11', h: 'Pandora' }
    })
    // N-6: the program's full version is not announced to the Wi-Fi.
    expect((published[0] as { txt: Record<string, unknown> }).txt).not.toHaveProperty('v')
    expect(discovery.published()).toBe(true)
    expect(await discovery.browse(10)).toEqual([
      { name: 'Bismuth (OTEL-PC)', url: 'http://192.168.1.20:7373', hotelName: 'Pandora', version: null }
    ])
    await discovery.unpublish()
    expect(discovery.published()).toBe(false)
  })
})

describe('kopya izni dosyada mühürlü (D5)', () => {
  const sealer = {
    seal: (text: string) => `muhur:${Buffer.from(text).reverse().toString('base64')}`,
    open: (sealed: string) =>
      sealed.startsWith('muhur:') ? Buffer.from(sealed.slice(6), 'base64').reverse().toString() : null
  }
  const token = 'g'.repeat(43)

  it('sistem anahtar deposu varsa izin belirteci dosyaya açık yazılmaz; okununca bellekte açılır', () => {
    const file = tempFile()
    const store = createConfigStore(file, sealer)
    store.update({
      mode: 'client',
      replica: { token, userId: 'u-1', userName: 'Sahip', folder: null }
    })
    expect(readFileSync(file, 'utf8')).not.toContain(token)
    expect(store.get().replica?.token).toBe(token)
    expect(createConfigStore(file, sealer).get().replica?.token).toBe(token)
    // Without the key store (another account, a copied file) the grant is simply gone.
    expect(createConfigStore(file).get().replica?.token).toBeNull()
  })

  it('önceden açık yazılmış izin ilk açılışta mühürlenir', () => {
    const file = tempFile()
    createConfigStore(file).update({
      mode: 'client',
      replica: { token, userId: 'u-1', userName: 'Sahip', folder: null }
    })
    expect(readFileSync(file, 'utf8')).toContain(token)
    expect(createConfigStore(file, sealer).get().replica?.token).toBe(token)
    expect(readFileSync(file, 'utf8')).not.toContain(token)
  })
})

describe('ana bilgisayar bağlantısı', () => {
  const hello = {
    app: 'bismuth' as const,
    version: '0.1.0',
    schemaVersion: 11,
    hotelName: 'Pandora',
    key: hostIdentity(Buffer.alloc(32, 1)).publicKey
  }
  const make = (fetch: (url: string, init: RequestInit) => Promise<Response>) =>
    createHostLink({
      fetch,
      version: '0.1.0',
      schemaVersion: 11,
      deviceName: 'Sahibin Mac',
      platform: 'darwin',
      loadDevice: () => null,
      saveDevice: () => undefined,
      probeEveryMs: 60_000
    })

  it('her çağrı kendi kaynağından (Origin) ve masaüstü cihaz adıyla gider; pencere oturumu ayrı tutulur', async () => {
    const seen: RequestInit[] = []
    const id = hostIdentity(Buffer.alloc(32, 1))
    const link = make(async (url, init) => {
      if (new URL(url).pathname === '/api/remote.hello') {
        // Sign-in checks who answers first (K-45); that check is not one of the calls under test.
        const { nonce } = JSON.parse(String(init.body)) as { nonce: string }
        return Response.json(
          { ...hello, identity: { key: id.publicKey, proof: id.prove(nonce) } },
          { headers: { 'x-bismuth-version': '0.1.0', 'x-bismuth-schema': '11' } }
        )
      }
      seen.push(init)
      return new Response('{}', {
        headers: {
          'x-bismuth-version': '0.1.0',
          'x-bismuth-schema': '11',
          'set-cookie': 'bismuth_session=abc; Path=/; HttpOnly; SameSite=Strict'
        }
      })
    })
    link.setHost('http://192.168.1.20:7373', hello)
    await link.call(1, '/api/auth.signIn', '{}')
    await link.call(1, '/api/rooms.list', '{}')
    await link.call(2, '/api/rooms.list', '{}')
    const headers = seen.map((i) => i.headers as Record<string, string>)
    expect(headers[0]).toMatchObject({
      origin: 'http://192.168.1.20:7373',
      'x-bismuth-client': 'desktop',
      'x-bismuth-device-name': 'Sahibin Mac'
    })
    expect(headers[1]?.cookie).toBe('bismuth_session=abc')
    expect(headers[2]?.cookie).toBeUndefined()
  })

  it('yanıttaki sürüm değişirse (ana bilgisayar güncellendi) yazma durur: "sürüm farklı"', async () => {
    const link = make(
      async () => new Response('{}', { headers: { 'x-bismuth-version': '0.2.0', 'x-bismuth-schema': '12' } })
    )
    link.setHost('http://192.168.1.20:7373', hello)
    const res = await link.call(1, '/api/rooms.create', '{}')
    expect(res.status).toBe(503)
    expect(JSON.parse(res.body)).toMatchObject({ error: { messageKey: 'errors.hostVersion' } })
    expect(link.status()).toMatchObject({ state: 'incompatible', host: { version: '0.2.0' } })
    expect(link.usable()).toBe(false)
  })
})
