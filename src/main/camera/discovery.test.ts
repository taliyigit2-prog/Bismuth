// The camera search of the setup wizard (Faz 20 P20g): the two answer formats (ONVIF WS-Discovery ProbeMatch, Hikvision
// SADP) with made-up values, the private-address rule, and a whole search against stand-in sockets (no packet leaves).
import { EventEmitter } from 'node:events'
import type { Socket } from 'node:dgram'
import { describe, expect, it } from 'vitest'
import {
  MAX_PACKETS,
  discoverCameras,
  mergeDevices,
  parseSadp,
  parseWsDiscovery,
  sadpProbe,
  wsProbe
} from './discovery'

const NS = 'xmlns:d="urn:example:discovery" xmlns:a="urn:example:addressing"'

/** An ONVIF camera's answer (values invented). */
const wsAnswer = (
  xaddrs: string,
  scopes = 'onvif://www.onvif.org/name/Kamera%20Bir onvif://www.onvif.org/hardware/DS-2CD0000X-I'
): string =>
  `<?xml version="1.0" encoding="UTF-8"?><env:Envelope ${NS}><env:Body><d:ProbeMatches><d:ProbeMatch>` +
  '<a:EndpointReference><a:Address>urn:uuid:00000000-0000-4000-8000-000000000001</a:Address></a:EndpointReference>' +
  `<d:Types>dn:NetworkVideoTransmitter</d:Types><d:Scopes>${scopes}</d:Scopes><d:XAddrs>${xaddrs}</d:XAddrs>` +
  '<d:MetadataVersion>1</d:MetadataVersion></d:ProbeMatch></d:ProbeMatches></env:Body></env:Envelope>'

/** A Hikvision SADP answer (values invented). */
const sadpAnswer = (ip: string, extra = ''): string =>
  '<?xml version="1.0" encoding="utf-8"?><ProbeMatch><Uuid>AAAAAAAA-0000-4000-8000-000000000002</Uuid><Types>inquiry</Types>' +
  '<DeviceType>10001</DeviceType><DeviceDescription>DS-2CD0000X-I</DeviceDescription><DeviceSN>DS-2CD0000X-I0000000000</DeviceSN>' +
  `<CommandPort>8000</CommandPort><HttpPort>80</HttpPort><MAC>aa-bb-cc-00-11-22</MAC><IPv4Address>${ip}</IPv4Address>` +
  `<IPv4SubnetMask>255.255.255.0</IPv4SubnetMask><Activated>true</Activated>${extra}</ProbeMatch>`

describe('ONVIF WS-Discovery cevabı', () => {
  it('adres, model ve ad bilgisi ayrıştırılır; ad yüzde kodundan çözülür', () => {
    const [d] = parseWsDiscovery(wsAnswer('http://192.168.1.64:80/onvif/device_service'), '192.168.1.64')
    expect(d).toEqual({
      ip: '192.168.1.64',
      protocols: ['onvif'],
      model: 'DS-2CD0000X-I',
      serial: '',
      mac: '',
      activated: null
    })
    const [named] = parseWsDiscovery(
      wsAnswer('http://10.0.0.7/onvif/device_service', 'onvif://www.onvif.org/name/Kamera%20Bir'),
      '10.0.0.7'
    )
    expect(named?.model).toBe('Kamera Bir')
  })

  it('XAddrs içinde önce özel adres seçilir; yalnız genel adres varsa gönderenin özel adresi kullanılır', () => {
    const mixed = wsAnswer('http://8.8.8.8/x http://[fe80::1]/x http://172.16.4.2:8080/onvif/device_service')
    expect(parseWsDiscovery(mixed, '172.16.4.2')[0]?.ip).toBe('172.16.4.2')
    expect(parseWsDiscovery(wsAnswer('http://8.8.8.8/x'), '192.168.1.9')[0]?.ip).toBe('192.168.1.9')
  })

  it('özel adresi olmayan cevap atılır', () => {
    expect(parseWsDiscovery(wsAnswer('http://8.8.8.8/x'), '8.8.4.4')).toEqual([])
    expect(parseWsDiscovery(wsAnswer('http://192.168.1.1@evil.example/x'), '8.8.4.4')).toEqual([])
  })

  it('bozuk ya da ProbeMatch olmayan metin hata vermeden boş döner', () => {
    expect(parseWsDiscovery('', '192.168.1.1')).toEqual([])
    expect(parseWsDiscovery('<a><b>', '192.168.1.1')).toEqual([])
    expect(parseWsDiscovery(wsProbe(), '192.168.1.1')).toEqual([])
  })

  it('kendi sorgumuz cevap sayılmaz ve ad alanı adresleri bağlantı hedefi değildir', () => {
    expect(wsProbe('11111111-2222-4333-8444-555555555555')).toContain('NetworkVideoTransmitter')
    expect(parseWsDiscovery(wsProbe(), '192.168.1.5')).toEqual([])
  })
})

describe('Hikvision SADP cevabı', () => {
  it('adres, model, seri no, MAC ve etkinleştirme okunur', () => {
    expect(parseSadp(sadpAnswer('192.168.1.64'))).toEqual([
      {
        ip: '192.168.1.64',
        protocols: ['sadp'],
        model: 'DS-2CD0000X-I',
        serial: 'DS-2CD0000X-I0000000000',
        mac: 'aa:bb:cc:00:11:22',
        activated: true
      }
    ])
    expect(parseSadp(sadpAnswer('192.168.1.64').replace('>true<', '>false<'))[0]?.activated).toBe(false)
  })

  it('genel adres, bozuk adres ve kendi sorgumuz atılır', () => {
    expect(parseSadp(sadpAnswer('1.2.3.4'))).toEqual([])
    expect(parseSadp(sadpAnswer('999.1.1.1'))).toEqual([])
    expect(parseSadp(sadpProbe('aaaaaaaa-0000-4000-8000-000000000003'))).toEqual([])
    expect(parseSadp('')).toEqual([])
  })

  it('metin alanları kısaltılır, kontrol karakterleri ve XML varlıkları temizlenir', () => {
    const long = 'M'.repeat(500)
    const xml = sadpAnswer('10.1.1.1').replace(
      'DS-2CD0000X-I</DeviceDescription>',
      `${long}</DeviceDescription>`
    )
    expect(parseSadp(xml)[0]?.model).toHaveLength(80)
    const odd = sadpAnswer('10.1.1.1').replace(
      'DS-2CD0000X-I</DeviceDescription>',
      'A&amp;B\u0007C</DeviceDescription>'
    )
    expect(parseSadp(odd)[0]?.model).toBe('A&B C')
    // A nested tag in a text field is not text: that field is left empty, never half-parsed.
    const nested = sadpAnswer('10.1.1.1').replace(
      'DS-2CD0000X-I</DeviceDescription>',
      '<x>y</x></DeviceDescription>'
    )
    expect(parseSadp(nested)[0]?.model).toBe('')
  })
})

describe('birleştirme', () => {
  it('aynı adresin iki protokolü tek satırda toplanır, adrese göre sıralanır', () => {
    const merged = mergeDevices([
      ...parseWsDiscovery(wsAnswer('http://192.168.1.64/x'), '192.168.1.64'),
      ...parseSadp(sadpAnswer('192.168.1.9')),
      ...parseSadp(sadpAnswer('192.168.1.64'))
    ])
    expect(merged.map((d) => d.ip)).toEqual(['192.168.1.9', '192.168.1.64'])
    expect(merged[1]).toMatchObject({
      protocols: ['onvif', 'sadp'],
      model: 'DS-2CD0000X-I',
      serial: 'DS-2CD0000X-I0000000000',
      activated: true
    })
  })

  it('en çok 50 cihaz tutulur', () => {
    const many = Array.from(
      { length: 80 },
      (_, i) => parseSadp(sadpAnswer(`10.0.${Math.floor(i / 200)}.${i + 1}`))[0]!
    )
    expect(mergeDevices(many)).toHaveLength(50)
  })
})

// ── The whole search against stand-in sockets ───────────────────────────────────────────────────────────────

interface Sent {
  socket: number
  message: string
  port: number
  address: string
  via: string | null
}

/** Stand-in for a dgram socket: records what is sent and "receives" the given answers once a probe went out. */
function fakeNetwork(answers: { port: number; from: string; text: string }[]) {
  const sent: Sent[] = []
  const closed: number[] = []
  const options = { ttl: [] as number[], memberships: [] as string[] }
  let count = 0
  const make = (): Socket => {
    const id = count++
    const socket = new EventEmitter() as EventEmitter & Record<string, unknown>
    let iface: string | null = null
    socket['bind'] = (...args: unknown[]) => {
      const cb = args.find((a) => typeof a === 'function') as (() => void) | undefined
      queueMicrotask(() => cb?.())
    }
    socket['setMulticastInterface'] = (a: string) => void (iface = a)
    socket['setMulticastTTL'] = (n: number) => void options.ttl.push(n)
    socket['addMembership'] = (group: string, a: string) => void options.memberships.push(`${group}@${a}`)
    socket['send'] = (message: string, port: number, address: string, cb?: () => void) => {
      sent.push({ socket: id, message, port, address, via: iface })
      cb?.()
      for (const a of answers.filter((x) => x.port === port))
        queueMicrotask(() =>
          socket.emit('message', Buffer.from(a.text), {
            address: a.from,
            port: 40000,
            family: 'IPv4',
            size: 1
          })
        )
    }
    socket['close'] = () => void closed.push(id)
    return socket as unknown as Socket
  }
  return { make, sent, closed, options }
}

describe('arama', () => {
  it('her özel arayüzden iki sorgu çıkar; cevaplar birleşir; genel adresli cevap ve dev paket atılır; soketler kapanır', async () => {
    const net = fakeNetwork([
      { port: 3702, from: '192.168.1.64', text: wsAnswer('http://192.168.1.64/onvif/device_service') },
      { port: 3702, from: '8.8.8.8', text: wsAnswer('http://192.168.1.77/onvif/device_service') }, // sender is public
      { port: 37020, from: '192.168.1.64', text: sadpAnswer('192.168.1.64') },
      { port: 37020, from: '192.168.1.80', text: sadpAnswer('192.168.1.80') + ' '.repeat(20_000) } // too big
    ])
    const result = await discoverCameras({
      timeoutMs: 20,
      interfaces: () => ['192.168.1.10', '10.0.0.2'],
      createSocket: net.make
    })
    expect(result.problem).toBeNull()
    expect(result.devices).toHaveLength(1)
    expect(result.devices[0]).toMatchObject({
      ip: '192.168.1.64',
      protocols: ['onvif', 'sadp'],
      model: 'DS-2CD0000X-I'
    })

    // ONVIF: one probe per interface to the group's port 3702; SADP: a probe per interface to 37020, TTL 1.
    const ws = net.sent.filter((s) => s.port === 3702)
    expect(ws.map((s) => [s.address, s.via])).toEqual([
      ['239.255.255.250', '192.168.1.10'],
      ['239.255.255.250', '10.0.0.2']
    ])
    expect(ws.every((s) => s.message.includes('NetworkVideoTransmitter'))).toBe(true)
    const sadp = net.sent.filter((s) => s.port === 37020)
    expect(sadp.map((s) => s.via)).toEqual(['192.168.1.10', '10.0.0.2'])
    expect(sadp.every((s) => s.message.includes('<Types>inquiry</Types>'))).toBe(true)
    expect(net.options.memberships).toEqual(['239.255.255.250@192.168.1.10', '239.255.255.250@10.0.0.2'])
    expect(net.options.ttl.every((n) => n === 1)).toBe(true)
    // Nothing else leaves: every packet goes to the multicast group.
    expect(new Set(net.sent.map((s) => s.address))).toEqual(new Set(['239.255.255.250']))
    // Every socket is closed again.
    expect([...net.closed].sort()).toEqual([0, 1, 2])
  })

  it('bir arama sürerken ikinci çağrı yeni soket açmaz, aynı sonucu alır; bitince yeni arama başlar', async () => {
    const net = fakeNetwork([
      { port: 3702, from: '192.168.1.64', text: wsAnswer('http://192.168.1.64/onvif/d') }
    ])
    const opts = { timeoutMs: 20, interfaces: () => ['192.168.1.10'], createSocket: net.make }
    const [a, b] = await Promise.all([discoverCameras(opts), discoverCameras(opts)])
    expect(b).toBe(a)
    expect(net.sent).toHaveLength(2) // one ONVIF + one SADP probe, not four
    await discoverCameras(opts)
    expect(net.sent).toHaveLength(4)
  })

  it('bir aramada en çok MAX_PACKETS cevap okunur: ötesi atılır', async () => {
    const answers = Array.from({ length: MAX_PACKETS }, () => ({
      port: 3702,
      from: '10.0.0.1',
      text: wsAnswer('http://10.0.0.1/onvif/d')
    }))
    answers.push({ port: 3702, from: '10.0.0.2', text: wsAnswer('http://10.0.0.2/onvif/d') })
    const net = fakeNetwork(answers)
    const result = await discoverCameras({
      timeoutMs: 30,
      interfaces: () => ['192.168.1.10'],
      createSocket: net.make
    })
    expect(result.devices.map((d) => d.ip)).toEqual(['10.0.0.1'])
  })

  it('özel adresli arayüz yoksa hiç soket açmadan ağ sorunu bildirir', async () => {
    const net = fakeNetwork([])
    const result = await discoverCameras({ timeoutMs: 10, interfaces: () => [], createSocket: net.make })
    expect(result).toEqual({ devices: [], problem: 'network' })
    expect(net.sent).toEqual([])
  })

  it('açılamayan soket aramayı bozmaz: cevap yoksa boş liste döner', async () => {
    const result = await discoverCameras({
      timeoutMs: 10,
      interfaces: () => ['192.168.1.10'],
      createSocket: () => {
        throw new Error('EADDRINUSE')
      }
    })
    expect(result).toEqual({ devices: [], problem: null })
  })
})
