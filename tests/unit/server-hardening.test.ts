// Faz 13 security re-review (P13sec2): what the server mode's front door still had to close — memory of the hotel
// computer against callers without a session (N-1), host names on the local network (N-4) and private-network
// callers that did not come in on the private network's card (N-5).
import { connect } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { createHostController } from '../../src/main/server/host-controller'
import { createListeners } from '../../src/main/server/listen'
import { hostHarness, PASSWORD, phone, type HostHarness } from './host-harness'

let h: HostHarness
afterEach(() => h?.close())

const signIn = (p: ReturnType<typeof phone>, username: string) =>
  p.call('auth.signIn', { username, secret: PASSWORD })

type StreamInit = RequestInit & { duplex: 'half'; headers?: Record<string, string> }

/** A chunked body that sends 1 KB, then waits until `release` before sending 8 MB more. */
const hanging = () => {
  let release: () => void = () => undefined
  const gate = new Promise<void>((resolve) => (release = resolve))
  let sent = false
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (!sent) {
        sent = true
        controller.enqueue(new Uint8Array(1024))
        return
      }
      await gate
      controller.enqueue(new Uint8Array(8 * 1024 * 1024))
      controller.close()
    }
  })
  return { body, release }
}

describe('oturumsuz bellek tüketme (N-1)', () => {
  it('aynı adresten 20 paralel, parçalı 8 MB istek: aynı anda açık sınırından sonrası gövdesi okunmadan 429', async () => {
    h = await hostHarness({ limits: { concurrentPerAddress: 4 } })
    h.user('sahip', 'owner')
    const p = phone(h.app)
    await signIn(p, 'sahip')
    const bodies = Array.from({ length: 20 }, hanging)
    const answers = bodies.map(({ body }) =>
      p.request('/api/rooms.list', { method: 'POST', body, duplex: 'half' } as StreamInit)
    )
    // The ones over the limit are answered at once, while every body is still waiting.
    const early = await Promise.all(answers.slice(4))
    expect(early.map((r) => r.status)).toEqual(Array(16).fill(429))
    for (const { release } of bodies) release()
    // 1 KB + 8 MB is over the window's own limit too: refused while it arrives.
    expect((await Promise.all(answers.slice(0, 4))).map((r) => r.status)).toEqual([413, 413, 413, 413])
    // The slots are free again.
    expect((await p.call('rooms.list')).status).toBe(200)
  })

  it('aynı anda açık istek bütün adreslerin toplamında da sınırlı', async () => {
    h = await hostHarness({ limits: { concurrentPerAddress: 4, concurrentTotal: 3 } })
    const bodies = Array.from({ length: 4 }, hanging)
    const answers = bodies.map(({ body }, i) =>
      phone(h.app, `192.168.1.${50 + i}`).request('/api/remote.hello', {
        method: 'POST',
        body,
        duplex: 'half'
      } as StreamInit)
    )
    expect((await answers[3]!).status).toBe(429)
    for (const { release } of bodies) release()
    expect((await Promise.all(answers.slice(0, 3))).map((r) => r.status)).toEqual([413, 413, 413])
  })

  it('oturumsuz remote.hello + 1 MB gövde 413; oturumla da herkese açık yordam 64 KB ile sınırlı', async () => {
    h = await hostHarness()
    h.user('sahip', 'owner')
    const p = phone(h.app)
    const mb = JSON.stringify({ pad: 'x'.repeat(1024 * 1024) })
    const res = await p.request('/api/remote.hello', { method: 'POST', body: mb })
    expect(res.status).toBe(413)
    expect(await res.json()).toMatchObject({ error: { messageKey: 'errors.requestTooLarge' } })
    // Without a session a procedure that needs one is limited the same way (its body is never read).
    expect((await p.request('/api/rooms.list', { method: 'POST', body: mb })).status).toBe(413)
    await signIn(p, 'sahip')
    expect((await p.request('/api/remote.hello', { method: 'POST', body: mb })).status).toBe(413)
    expect((await p.call('remote.hello')).status).toBe(200)
  })

  it('oturumlu büyük ama geçerli istek (içe aktarma önizlemesi, ~1,5 MB) hâlâ çalışır', async () => {
    h = await hostHarness()
    h.user('sahip', 'owner')
    const p = phone(h.app)
    await signIn(p, 'sahip')
    const rows = ['Tarih;Açıklama;Gelir;Gider']
    let size = 0
    for (let i = 0; size < 1024 * 1024; i++) {
      const row = `0${(i % 9) + 1}.03.2026;Satır ${i};${100 + (i % 50)};`
      rows.push(row)
      size += row.length + 1
    }
    const res = await p.call('dataImport.preview', {
      template: 'ledgerRows',
      fileName: 'defter.csv',
      contentBase64: Buffer.from(rows.join('\n')).toString('base64')
    })
    expect(res.status).toBe(200)
  })

  it('dinleyici aynı anda en fazla belirli sayıda bağlantı kabul eder (server.maxConnections)', async () => {
    const listeners = createListeners(() => new Response('ok'), 47633, { maxConnections: 2 })
    await listeners.sync(['127.0.0.1'])
    const sockets = Array.from({ length: 3 }, () => connect(47633, '127.0.0.1'))
    try {
      const closed = await Promise.all(
        sockets.map(
          (s) =>
            new Promise<boolean>((resolve) => {
              s.once('close', () => resolve(true))
              setTimeout(() => resolve(false), 800).unref()
            })
        )
      )
      expect(closed.filter(Boolean)).toHaveLength(1)
    } finally {
      for (const s of sockets) s.destroy()
      await listeners.close()
    }
  })
})

describe('yerel klasör yolları ağa gitmez (N-9)', () => {
  it('telefondaki sahip Hakkında bilgisinde veri klasörünün yolunu almaz', async () => {
    h = await hostHarness()
    h.user('sahip', 'owner')
    const p = phone(h.app)
    await signIn(p, 'sahip')
    const info = await p.call<{ dataDir: string; transport: string }>('app.getInfo')
    expect(info.status).toBe(200)
    expect(info.body).toMatchObject({ dataDir: '', transport: 'http' })
  })
})

describe('yerel ağ duyurusu yalnız yerel ağ açıkken (N-6)', () => {
  it('host.listenLan kapalıyken ilan yapılmaz; ayar açılınca yayınlanır, kapanınca geri çekilir', async () => {
    let lan = false
    const calls: string[] = []
    let published = false
    const discovery = {
      publish: () => {
        calls.push('publish')
        published = true
      },
      unpublish: async () => {
        calls.push('unpublish')
        published = false
      },
      published: () => published,
      browse: async () => [],
      destroy: () => undefined
    }
    const controller = createHostController({
      fetch: () => new Response('ok'),
      port: () => 47634,
      interfaces: () => ({}),
      listenLan: () => lan,
      discovery,
      announcement: () => ({ name: 'Bismuth ab12', schemaVersion: 16, hotelName: 'Otel' }),
      rescanMs: 60_000
    })
    await controller.start()
    // start() first stops whatever ran before (an unpublish); from here on only real changes are counted.
    calls.length = 0
    try {
      expect(calls).toEqual([])
      expect(controller.state().announced).toBe(false)
      lan = true
      await controller.rescan()
      expect(calls).toEqual(['publish'])
      expect(controller.state().announced).toBe(true)
      // The next rescans do not announce again.
      await controller.rescan()
      expect(calls).toEqual(['publish'])
      lan = false
      await controller.rescan()
      expect(calls).toEqual(['publish', 'unpublish'])
      expect(controller.state().announced).toBe(false)
    } finally {
      await controller.stop()
    }
  })
})

describe('ad ve adres denetimi (N-4, N-5)', () => {
  const post = (p: ReturnType<typeof phone>, host: string) =>
    p.request('/api/remote.hello', {
      method: 'POST',
      body: '{}',
      headers: { host, origin: `http://${host}` }
    })

  it("127.0.0.1'den Host: evil.local → 421; yerel ağ sonekleri yalnız bilgisayarın adıyla", async () => {
    h = await hostHarness()
    const local = phone(h.app, '127.0.0.1')
    expect((await post(local, 'evil.local:7373')).status).toBe(421)
    // From this computer even a private-network name is not how it names itself.
    expect((await post(local, 'pc.tail1.ts.net:7373')).status).toBe(421)
    expect((await post(local, '192.168.1.20:7373')).status).toBe(421)
    for (const own of [
      '127.0.0.1:7373',
      'localhost:7373',
      '[::1]:7373',
      'otel-pc:7373',
      'otel-pc.local:7373'
    ])
      expect((await post(local, own)).status, own).toBe(200)
    // From the Wi-Fi as well: another computer's name under .local/.lan/.home.arpa is refused.
    for (const other of ['evil.local:7373', 'evil.lan', 'evil.home.arpa:7373'])
      expect((await post(phone(h.app), other)).status, other).toBe(421)
    expect((await post(phone(h.app), 'otel-pc.local:7373')).status).toBe(200)
  })

  it('özel ağ yalnız kendi kartından ve aralığından: yerel 100.90.1.2/16, istemci 100.65.0.5 → 403', async () => {
    const card = (address: string, netmask: string) => ({
      address,
      netmask,
      family: 'IPv4' as const,
      internal: false,
      mac: '',
      cidr: null
    })
    h = await hostHarness({
      listenLan: false,
      interfaces: { en0: [card('192.168.1.20', '255.255.255.0')], utun4: [card('100.90.1.2', '255.255.0.0')] }
    })
    const outside = await phone(h.app, '100.65.0.5', {}, '100.90.1.2').call('remote.hello')
    expect(outside.status).toBe(403)
    expect(outside.body).toMatchObject({ error: { messageKey: 'errors.remoteForbidden' } })
    // A 100.x sender that came in on the Wi-Fi card (weak host model) is not the private network either.
    expect((await phone(h.app, '100.90.3.4', {}, '192.168.1.20').call('remote.hello')).status).toBe(403)
    // A real peer of the private network on its own card: served.
    expect((await phone(h.app, '100.90.3.4', {}, '100.90.1.2').call('remote.hello')).status).toBe(200)
  })
})
