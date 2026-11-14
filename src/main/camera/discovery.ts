// Looking for cameras on the hotel's own network (Faz 20 P20g, K-49, K-59). The only file of Bismuth that opens UDP
// sockets (`node:dgram`; the ESLint and `no-network-guard` exceptions name this file alone). It starts only when the
// person asks (setup wizard, Ayarlar → Kamera "Yeniden tara"), listens for 5 seconds and closes everything again.
//  - ONVIF WS-Discovery: a Probe to the multicast group 239.255.255.250:3702; cameras answer with a ProbeMatch.
//  - Hikvision SADP: a Probe to the same group at port 37020; Hikvision devices answer with their address and serial.
// Only private IPv4 addresses count (10/8, 172.16/12, 192.168/16, 169.254/16): the probe leaves only through the
// computer's own private interfaces, and an answer from (or about) any other address is dropped. The parsers read
// untrusted text by plain tag matching (no XML engine, so no entities or external references are ever resolved) and
// keep only short, cleaned strings. Independent of `network.enabled`: this is the local network, not the internet.
import { randomUUID } from 'node:crypto'
import { createSocket, type Socket } from 'node:dgram'
import { networkInterfaces } from 'node:os'
import type { CameraDevice, CameraDiscovery } from '@shared/contract/camera'
import { isPrivateIpv4, parseIpv4 } from '@shared/domain/camera-source'

export const DISCOVERY_TIMEOUT_MS = 5_000
const MULTICAST_GROUP = '239.255.255.250'
const WS_DISCOVERY_PORT = 3702
const SADP_PORT = 37020
const MAX_PACKET = 16_384
const MAX_DEVICES = 50
/** Answers read per search and answers kept before merging: a flood on the group cannot grow memory or burn CPU. */
export const MAX_PACKETS = 400
export const MAX_FOUND = 200

// Namespace identifiers of the ONVIF/WS-Discovery message: names, not addresses anything connects to.
const NS_SOAP = 'http://www.w3.org/2003/05/soap-envelope'
const NS_ADDRESSING = 'http://schemas.xmlsoap.org/ws/2004/08/addressing'
const NS_DISCOVERY = 'http://schemas.xmlsoap.org/ws/2005/04/discovery'
const NS_ONVIF = 'http://www.onvif.org/ver10/network/wsdl'

/** The WS-Discovery Probe for network video transmitters (cameras). */
export const wsProbe = (id: string = randomUUID()): string =>
  '<?xml version="1.0" encoding="utf-8"?>' +
  `<e:Envelope xmlns:e="${NS_SOAP}" xmlns:w="${NS_ADDRESSING}" xmlns:d="${NS_DISCOVERY}" xmlns:dn="${NS_ONVIF}">` +
  `<e:Header><w:MessageID>uuid:${id}</w:MessageID>` +
  '<w:To e:mustUnderstand="true">urn:schemas-xmlsoap-org:ws:2005:04:discovery</w:To>' +
  `<w:Action e:mustUnderstand="true">${NS_DISCOVERY}/Probe</w:Action></e:Header>` +
  '<e:Body><d:Probe><d:Types>dn:NetworkVideoTransmitter</d:Types></d:Probe></e:Body></e:Envelope>'

/** The SADP inquiry. */
export const sadpProbe = (id: string = randomUUID()): string =>
  `<?xml version="1.0" encoding="utf-8"?><Probe><Uuid>${id.toUpperCase()}</Uuid><Types>inquiry</Types></Probe>`

// ── Parsers ─────────────────────────────────────────────────────────────────────────────────────────────────

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

/** A short single-line string safe to show: entities of the five basics decoded, control characters gone. */
function clean(text: string | undefined, max: number): string {
  if (!text) return ''
  return text
    .replace(/&(amp|lt|gt|quot|apos);/g, (_m, name: string) => ENTITIES[name] ?? '')
    .replace(/\p{C}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

/** The text of the first `<…:name>` element (any prefix), or undefined. */
function tag(xml: string, name: string): string | undefined {
  const m = new RegExp(`<(?:[\\w-]+:)?${name}(?:\\s[^>]*)?>([^<]*)</(?:[\\w-]+:)?${name}>`, 'i').exec(xml)
  return m?.[1]
}

/** Every `<…:name>…</…:name>` block, capped. */
function blocks(xml: string, name: string, cap = 20): string[] {
  const out: string[] = []
  const re = new RegExp(`<(?:[\\w-]+:)?${name}\\b(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${name}>`, 'gi')
  for (let m = re.exec(xml); m && out.length < cap; m = re.exec(xml)) out.push(m[1] ?? '')
  return out
}

const normalMac = (mac: string): string => {
  const hex = mac.replace(/[^0-9a-fA-F]/g, '').toLowerCase()
  return hex.length === 12 ? (hex.match(/../g) as string[]).join(':') : ''
}

const scopeValue = (scopes: string, kind: string): string => {
  const m = new RegExp(`onvif://www\\.onvif\\.org/${kind}/([^\\s/]+)`, 'i').exec(scopes)
  if (!m?.[1]) return ''
  try {
    return clean(decodeURIComponent(m[1]), 80)
  } catch {
    return clean(m[1], 80)
  }
}

/** The host of a service address inside an answer (`<scheme>://192.168.1.64:80/…`), or null. */
const hostOfAddress = (address: string): string | null => {
  const m = /^[a-z][a-z0-9+.-]*:\/\/(?:[^/@\s]*@)?(\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?(?:[/?#]|$)/i.exec(
    address
  )
  return m?.[1] ?? null
}

/** ONVIF answers: one device per ProbeMatch, `from` is the sender's address (a fallback when no address is given). */
export function parseWsDiscovery(xml: string, from: string): CameraDevice[] {
  const out: CameraDevice[] = []
  for (const match of blocks(xml, 'ProbeMatch')) {
    const addresses = (tag(match, 'XAddrs') ?? '').split(/\s+/).filter(Boolean)
    const ip = addresses.map(hostOfAddress).find((h): h is string => h !== null && isPrivateIpv4(h)) ?? from
    if (!isPrivateIpv4(ip)) continue
    const scopes = tag(match, 'Scopes') ?? ''
    out.push({
      ip,
      protocols: ['onvif'],
      model: scopeValue(scopes, 'hardware') || scopeValue(scopes, 'name'),
      serial: '',
      mac: '',
      activated: null
    })
  }
  return out
}

/** Hikvision SADP answers (`<ProbeMatch>` with the device's own fields). Our own inquiry (`<Probe>`) is no answer. */
export function parseSadp(xml: string): CameraDevice[] {
  const out: CameraDevice[] = []
  for (const match of blocks(xml, 'ProbeMatch', 5)) {
    const ip = clean(tag(match, 'IPv4Address'), 15)
    if (!isPrivateIpv4(ip)) continue
    const activated = tag(match, 'Activated')?.trim().toLowerCase()
    out.push({
      ip,
      protocols: ['sadp'],
      model: clean(tag(match, 'DeviceDescription'), 80),
      serial: clean(tag(match, 'DeviceSN'), 40),
      mac: normalMac(tag(match, 'MAC') ?? ''),
      activated: activated === 'true' ? true : activated === 'false' ? false : null
    })
  }
  return out
}

const ipOrder = (ip: string): number => {
  const p = parseIpv4(ip) ?? [0, 0, 0, 0]
  return ((p[0] * 256 + p[1]) * 256 + p[2]) * 256 + p[3]
}

/** One row per address: the protocols add up, the first non-empty name/serial/MAC wins; sorted by address. */
export function mergeDevices(found: readonly CameraDevice[]): CameraDevice[] {
  const byIp = new Map<string, CameraDevice>()
  for (const d of found) {
    const have = byIp.get(d.ip)
    if (!have) {
      if (byIp.size < MAX_DEVICES) byIp.set(d.ip, { ...d, protocols: [...d.protocols] })
      continue
    }
    for (const p of d.protocols) if (!have.protocols.includes(p)) have.protocols.push(p)
    have.model ||= d.model
    have.serial ||= d.serial
    have.mac ||= d.mac
    have.activated ??= d.activated
  }
  return [...byIp.values()].sort((a, b) => ipOrder(a.ip) - ipOrder(b.ip))
}

// ── The search ──────────────────────────────────────────────────────────────────────────────────────────────

/** This computer's own private IPv4 addresses (the interfaces a search may leave through). */
export function privateInterfaces(): string[] {
  const out: string[] = []
  for (const list of Object.values(networkInterfaces()))
    for (const a of list ?? [])
      if (a.family === 'IPv4' && !a.internal && isPrivateIpv4(a.address)) out.push(a.address)
  return [...new Set(out)]
}

export interface DiscoverOptions {
  timeoutMs?: number
  /** Tests: the local private addresses to search from. */
  interfaces?: () => string[]
  /** Tests: a stand-in for `dgram.createSocket`. */
  createSocket?: () => Socket
}

let running: Promise<CameraDiscovery> | null = null

/**
 * Asks the network for cameras and collects the answers for `timeoutMs` (5 s). It never throws: a socket that cannot
 * open (a busy SADP port, a firewall) only means fewer answers. `problem: 'network'` = no private interface to ask from.
 */
export function discoverCameras(opts: DiscoverOptions = {}): Promise<CameraDiscovery> {
  // One search at a time: a second call while one runs gets that search's answer (SADP's port can be bound only once).
  if (running) return running
  const search = runSearch(opts).finally(() => {
    running = null
  })
  running = search
  return search
}

function runSearch(opts: DiscoverOptions): Promise<CameraDiscovery> {
  const timeoutMs = opts.timeoutMs ?? DISCOVERY_TIMEOUT_MS
  const addresses = (opts.interfaces ?? privateInterfaces)()
  if (addresses.length === 0) return Promise.resolve({ devices: [], problem: 'network' })
  const make = opts.createSocket ?? (() => createSocket({ type: 'udp4', reuseAddr: true }))
  const found: CameraDevice[] = []
  const sockets: Socket[] = []
  let packets = 0
  const keep = (devices: CameraDevice[]): void => {
    for (const d of devices) if (found.length < MAX_FOUND) found.push(d)
  }

  const open = (onText: (text: string, from: string) => void): Socket | null => {
    try {
      const socket = make()
      socket.on('error', () => undefined)
      socket.on('message', (message, rinfo) => {
        // A private sender, a small packet: anything else is not a camera of this network.
        if (message.length > MAX_PACKET || !isPrivateIpv4(rinfo.address)) return
        if (++packets > MAX_PACKETS) return
        try {
          onText(message.toString('utf8'), rinfo.address)
        } catch {
          // a malformed answer is dropped
        }
      })
      sockets.push(socket)
      return socket
    } catch {
      return null
    }
  }
  const safely = (fn: () => void): void => {
    try {
      fn()
    } catch {
      // no route, interface gone: that interface just gets no answer
    }
  }

  // ONVIF: one socket per interface, answers come back to its own port.
  for (const address of addresses) {
    const socket = open((text, from) => keep(parseWsDiscovery(text, from)))
    if (!socket) continue
    safely(() =>
      socket.bind(0, address, () =>
        safely(() => {
          socket.setMulticastInterface(address)
          socket.setMulticastTTL(1)
          socket.send(wsProbe(), WS_DISCOVERY_PORT, MULTICAST_GROUP, () => undefined)
        })
      )
    )
  }

  // SADP: devices answer to the group at 37020, so one socket listens there on every interface.
  const sadp = open((text) => keep(parseSadp(text)))
  if (sadp)
    safely(() =>
      sadp.bind(SADP_PORT, () => {
        for (const address of addresses) safely(() => sadp.addMembership(MULTICAST_GROUP, address))
        safely(() => sadp.setMulticastTTL(1))
        const probe = sadpProbe()
        for (const address of addresses)
          safely(() => {
            sadp.setMulticastInterface(address)
            sadp.send(probe, SADP_PORT, MULTICAST_GROUP, () => undefined)
          })
      })
    )

  return new Promise((resolve) => {
    setTimeout(() => {
      for (const socket of sockets) safely(() => socket.close())
      resolve({ devices: mergeDevices(found), problem: null })
    }, timeoutMs)
  })
}
