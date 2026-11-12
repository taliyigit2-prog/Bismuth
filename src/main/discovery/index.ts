// Local-network discovery for server mode (faz-13 madde 1; 03-mimari.md §2, §11): the hotel's main computer
// announces itself as `_bismuth._tcp` (bonjour / mDNS, the local network only — multicast never leaves it), and the
// connection screen of another computer lists what it hears for a few seconds. Nothing goes to the internet.
// Only while the hotel's local network is served (`host.listenLan`, N-6): otherwise the address would answer 403.
import { Bonjour, type Service } from 'bonjour-service'
import type { FoundHost } from '@shared/contract/remote'
import { classifyAddress } from '../server/net'

export const SERVICE_TYPE = 'bismuth'

export interface Announcement {
  /** "Bismuth (OTEL-PC)": unique on the local network. */
  name: string
  port: number
  schemaVersion: number
  hotelName: string
}

export interface Discovery {
  publish(info: Announcement): void
  unpublish(): Promise<void>
  published(): boolean
  /** Bismuth servers heard within `ms` (this computer's own announcement included). */
  browse(ms?: number): Promise<FoundHost[]>
  destroy(): void
}

type BonjourLike = Pick<Bonjour, 'publish' | 'find' | 'unpublishAll' | 'destroy'>

/** The address to show for an announcement: a local-network IPv4 first, then a private-network one. */
export function urlOfService(service: Pick<Service, 'addresses' | 'referer' | 'port'>): string | null {
  const candidates = [...(service.addresses ?? []), ...(service.referer ? [service.referer.address] : [])]
  const v4 = candidates.filter((a) => /^\d+\.\d+\.\d+\.\d+$/.test(a))
  const rank = (a: string): number => {
    const cls = classifyAddress(a)
    return cls === 'lan' ? 0 : cls === 'private' ? 1 : cls === 'loopback' ? 2 : 9
  }
  const best = v4.sort((a, b) => rank(a) - rank(b))[0]
  return best && rank(best) < 9 ? `http://${best}:${service.port}` : null
}

export function foundHostOf(
  service: Pick<Service, 'name' | 'addresses' | 'referer' | 'port' | 'txt'>
): FoundHost | null {
  const url = urlOfService(service)
  if (!url) return null
  const txt = (service.txt ?? {}) as Record<string, unknown>
  const text = (v: unknown): string | null => (typeof v === 'string' && v.length <= 200 ? v : null)
  return { name: service.name.slice(0, 200), url, hotelName: text(txt['h']), version: text(txt['v']) }
}

export function createDiscovery(factory: () => BonjourLike = () => new Bonjour()): Discovery {
  let bonjour: BonjourLike | null = null
  let announced = false
  const instance = (): BonjourLike => (bonjour ??= factory())

  return {
    publish(info) {
      const service = instance().publish({
        name: info.name,
        type: SERVICE_TYPE,
        port: info.port,
        // No program version (N-6): the Wi-Fi need not learn which release runs here; the data version is enough
        // for the connection screen and the full version is checked after connecting (remote.hello).
        txt: { s: String(info.schemaVersion), h: info.hotelName.slice(0, 120) },
        disableIPv6: true
      })
      announced = true
      // Another Bismuth with the same name on the network: keep serving, just unannounced.
      service.on('error', () => {
        announced = false
      })
    },
    unpublish() {
      return new Promise((resolve) => {
        if (!bonjour || !announced) return resolve()
        announced = false
        bonjour.unpublishAll(() => resolve())
      })
    },
    published: () => announced,
    browse(ms = 3000) {
      return new Promise((resolve) => {
        const found = new Map<string, FoundHost>()
        const browser = instance().find({ type: SERVICE_TYPE }, (service) => {
          const host = foundHostOf(service)
          if (host) found.set(host.url, host)
        })
        setTimeout(() => {
          browser.stop()
          resolve([...found.values()])
        }, ms).unref?.()
      })
    },
    destroy() {
      bonjour?.destroy()
      bonjour = null
      announced = false
    }
  }
}
