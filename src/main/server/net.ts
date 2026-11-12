// Which network an address belongs to, and where the server mode listens (faz-13 madde 1, 03-mimari.md §7).
// The hotel's computer serves only the hotel's local network (Wi-Fi, cable) and the private network the owner set up
// (NetBird Free, K-31; Tailscale also works: both use 100.64.0.0/10). It never listens on an address reachable from
// the internet, and a request that still arrives from one is refused. Pure, so every rule is unit-tested.
import { isIP } from 'node:net'
import type { NetworkInterfaceInfo } from 'node:os'

/** loopback = this computer; lan = the hotel's local network; private = NetBird/Tailscale; public = anything else. */
export type AddressClass = 'loopback' | 'lan' | 'private' | 'public'

const v4 = (ip: string): number[] | null => {
  if (isIP(ip) !== 4) return null
  return ip.split('.').map(Number)
}

/** `::ffff:192.168.1.5` (IPv4 through an IPv6 socket) → `192.168.1.5`; zone ids (`fe80::1%en0`) dropped. */
export function plainAddress(ip: string): string {
  const noZone = ip.split('%')[0] ?? ip
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(noZone)
  return mapped?.[1] ?? noZone
}

export function classifyAddress(raw: string): AddressClass {
  const ip = plainAddress(raw.trim())
  const p = v4(ip)
  if (p) {
    const [a = 0, b = 0] = p
    if (a === 127) return 'loopback'
    if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return 'lan'
    // Link-local (a cable straight between two computers, no router).
    if (a === 169 && b === 254) return 'lan'
    // 100.64.0.0/10: the shared address space NetBird and Tailscale give their peers.
    if (a === 100 && b >= 64 && b <= 127) return 'private'
    return 'public'
  }
  if (isIP(ip) === 6) {
    const lower = ip.toLowerCase()
    if (lower === '::1') return 'loopback'
    // Tailscale's IPv6 range sits inside the unique-local block: check it first.
    if (lower.startsWith('fd7a:115c:a1e0:')) return 'private'
    if (/^f[cd][0-9a-f]{2}:/.test(lower)) return 'lan'
    if (/^fe[89ab][0-9a-f]:/.test(lower)) return 'lan'
    return 'public'
  }
  return 'public'
}

/** The network a request counts as for role rules (`remote.allowed`): this computer counts as the local network. */
export const requestNetwork = (cls: Exclude<AddressClass, 'public'>): 'lan' | 'private' =>
  cls === 'private' ? 'private' : 'lan'

export type Interfaces = NodeJS.Dict<NetworkInterfaceInfo[]>

/** Which networks the server serves besides this computer (K-45 (1)). */
export interface ServeOptions {
  /**
   * The hotel's local network (Wi-Fi, cable): off unless switched on in Ayarlar → Uzaktan erişim (`host.listenLan`).
   * Plain HTTP on a Wi-Fi guests may share is readable by anyone on it; the private network encrypts.
   */
  lan: boolean
}

/**
 * Addresses the server listens on: IPv4 of this computer, the private network (NetBird/Tailscale) and, when switched
 * on, the local network. Never 0.0.0.0 and never a public address (a computer plugged straight into a modem keeps
 * the server to itself). A 100.64.0.0/10 address on any other network card is not a private network: internet
 * providers hand out the same range to their customers (carrier-grade NAT), so it is not served (D1).
 */
export function listenAddresses(interfaces: Interfaces, serve: ServeOptions = { lan: false }): string[] {
  const out = new Set<string>(['127.0.0.1'])
  for (const [iface, list] of Object.entries(interfaces)) {
    for (const info of list ?? []) {
      if (info.family !== 'IPv4') continue
      const cls = classifyAddress(info.address)
      if (cls === 'lan' && serve.lan) out.add(info.address)
      if (cls === 'private' && privateKind(iface) !== null) out.add(info.address)
    }
  }
  return [...out]
}

/** One address to open from another device, as Ayarlar → Uzaktan erişim shows it (with a QR code). */
export interface HostAddress {
  url: string
  address: string
  /** lan = hotel Wi-Fi/cable; netbird / tailscale = recognised by the interface name; private = another 100.x. */
  kind: 'lan' | 'netbird' | 'tailscale' | 'private'
  iface: string
}

/**
 * NetBird names its interface wt0 (Windows, Linux) or "NetBird"; Tailscale "tailscale0" / "Tailscale"; on macOS both
 * use a `utunN` tunnel. Null: a 100.x address on an ordinary network card (an internet provider's shared range).
 */
export function privateKind(iface: string): Exclude<HostAddress['kind'], 'lan'> | null {
  if (/^wt\d+$|netbird/i.test(iface)) return 'netbird'
  if (/tailscale/i.test(iface)) return 'tailscale'
  if (/^utun\d+$/i.test(iface)) return 'private'
  return null
}

const ORDER: Record<HostAddress['kind'], number> = { lan: 0, netbird: 1, tailscale: 2, private: 3 }

/** The addresses other devices can use, local network first (no loopback: only this computer could open it). */
export function hostAddresses(
  interfaces: Interfaces,
  port: number,
  serve: ServeOptions = { lan: false }
): HostAddress[] {
  const out: HostAddress[] = []
  for (const [iface, list] of Object.entries(interfaces)) {
    for (const info of list ?? []) {
      if (info.family !== 'IPv4' || info.internal) continue
      const cls = classifyAddress(info.address)
      if (cls === 'lan' && !serve.lan) continue
      if (cls !== 'lan' && cls !== 'private') continue
      // Link-local addresses only work on a direct cable; they would confuse more than help.
      if (info.address.startsWith('169.254.')) continue
      const kind = cls === 'lan' ? 'lan' : privateKind(iface)
      if (!kind) continue
      out.push({ url: `http://${info.address}:${port}`, address: info.address, kind, iface })
    }
  }
  return out.sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || a.address.localeCompare(b.address))
}

/**
 * 100.64.0.0/10 addresses on cards that are not NetBird or Tailscale (D1): not served; Ayarlar → Uzaktan erişim
 * warns, since the computer may be on an internet provider's shared network.
 */
export function unservedPrivateAddresses(interfaces: Interfaces): { address: string; iface: string }[] {
  const out: { address: string; iface: string }[] = []
  for (const [iface, list] of Object.entries(interfaces))
    for (const info of list ?? [])
      if (
        info.family === 'IPv4' &&
        classifyAddress(info.address) === 'private' &&
        privateKind(iface) === null
      )
        out.push({ address: info.address, iface })
  return out
}

/**
 * N-5: a 100.64.0.0/10 caller counts as the private network only when it reached this computer through the private
 * network's own card (the socket's local address is that card's address) and comes from that card's range. A computer
 * that accepts packets on any card ("weak host" model, macOS) would otherwise take a forged 100.x sender arriving over
 * the Wi-Fi as the private network — while the local network is switched off. Tailscale gives its card a single
 * address (/32) and reaches peers by route: the shared 100.64.0.0/10 range stands in for it.
 */
export function isPrivatePeer(interfaces: Interfaces, peer: string, local: string): boolean {
  const from = v4(plainAddress(peer.trim()))
  const at = plainAddress(local.trim())
  if (!from || classifyAddress(at) !== 'private') return false
  for (const [iface, list] of Object.entries(interfaces)) {
    if (privateKind(iface) === null) continue
    for (const info of list ?? []) {
      if (info.family !== 'IPv4' || info.address !== at) continue
      const own = v4(info.address)
      if (!own) continue
      const bits = prefixLength(info)
      // Never wider than the shared range itself; a single-address card means "by route" (Tailscale).
      const prefix = bits >= 32 || bits < 10 ? 10 : bits
      if (sameNetwork(from, own, prefix)) return true
    }
  }
  return false
}

const prefixLength = (info: NetworkInterfaceInfo): number => {
  const fromCidr = info.cidr ? Number(info.cidr.split('/')[1]) : NaN
  if (Number.isInteger(fromCidr)) return fromCidr
  const mask = v4(info.netmask)
  if (!mask) return 32
  return mask.reduce((n, octet) => n + (octet.toString(2).match(/1/g)?.length ?? 0), 0)
}

const toNumber = (p: number[]): number =>
  (((p[0] ?? 0) << 24) | ((p[1] ?? 0) << 16) | ((p[2] ?? 0) << 8) | (p[3] ?? 0)) >>> 0

const sameNetwork = (a: number[], b: number[], prefix: number): boolean => {
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0
  return (toNumber(a) & mask) >>> 0 === (toNumber(b) & mask) >>> 0
}

/** Names the private networks give their peers (bismuth-host.netbird.cloud, pc.tailnet.ts.net). */
const PRIVATE_NETWORK_NAME = /\.(netbird\.cloud|netbird\.selfhosted|ts\.net)$/

/**
 * Host names a browser may use to reach this computer. Anything else is refused (421): a web page elsewhere that
 * points its own name at this computer's address (DNS rebinding) gets no answer.
 *
 * N-4: the local network's suffixes (`.local`, `.lan`, `.home.arpa`) only with this computer's own name — anyone on
 * the Wi-Fi can announce `evil.local` over mDNS and then point it at 127.0.0.1. A request from this computer itself
 * (loopback) has to name it as this computer does: localhost, 127.0.0.1, [::1] or the computer's name.
 */
export function isAllowedHostName(
  hostHeader: string,
  machineName: string,
  from: AddressClass = 'lan'
): boolean {
  const host = hostHeader.trim().toLowerCase()
  // [::1]:7373 → ::1; 192.168.1.5:7373 → 192.168.1.5; name:7373 → name.
  const name = host.startsWith('[') ? host.slice(1, host.indexOf(']')) : (host.split(':')[0] ?? '')
  if (!name) return false
  // The computer's own name, bare or with the local network's suffixes; never `<name>.<anything>`: a site's name like
  // `otel-pc.saldirgan.example` could point at this computer (O-1).
  const machine = machineName.trim().toLowerCase()
  const ownName =
    !!machine && [machine, `${machine}.local`, `${machine}.lan`, `${machine}.home.arpa`].includes(name)
  if (from === 'loopback') return ownName || ['localhost', '127.0.0.1', '::1'].includes(name)
  if (isIP(name)) return classifyAddress(name) !== 'public'
  if (name === 'localhost' || ownName) return true
  return PRIVATE_NETWORK_NAME.test(name)
}
