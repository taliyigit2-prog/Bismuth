// Starts and stops the server mode (faz-13 madde 1): listeners on the allowed addresses (net.ts), the bonjour
// announcement, and a rescan every half minute so a private network that connects after Bismuth (NetBird's service
// often starts later) is served without a restart. Electron-free: index.ts gives it the app and the interfaces.
import type { HostStatus } from '@shared/contract/remote'
import type { Announcement, Discovery } from '../discovery'
import { createListeners, type Listeners } from './listen'
import { hostAddresses, listenAddresses, unservedPrivateAddresses, type Interfaces } from './net'

type FetchHandler = (request: Request, env: Record<string, unknown>) => Response | Promise<Response>

export interface HostControllerDeps {
  fetch: FetchHandler
  port(): number
  interfaces(): Interfaces
  /** Serve the hotel's local network too (`host.listenLan`, K-45 (1)); default: this computer + private network. */
  listenLan?(): boolean
  discovery: Discovery | null
  announcement(): Omit<Announcement, 'port'>
  onError?(error: unknown, what: string): void
  /** Milliseconds between address rescans (default 30 s). */
  rescanMs?: number
}

export type ServerState = Pick<
  HostStatus,
  'running' | 'addresses' | 'error' | 'announced' | 'listenLan' | 'unservedPrivate'
>

const isPortInUse = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'EADDRINUSE'

export function createHostController(deps: HostControllerDeps) {
  let listeners: Listeners | null = null
  let port = 0
  let error: ServerState['error'] = null
  let timer: ReturnType<typeof setInterval> | null = null
  /** The announcement is out (or was tried: a name clash keeps it off without retrying every half minute). */
  let announcing = false
  const serve = () => ({ lan: deps.listenLan?.() ?? false })

  /**
   * N-6: the local network hears of this computer only while it is served there (`host.listenLan`); otherwise the
   * Wi-Fi would learn the hotel's name and an address that answers 403. Follows the setting on every rescan.
   */
  const announce = async (): Promise<void> => {
    const wanted = listeners !== null && serve().lan
    if (wanted && !announcing) {
      announcing = true
      try {
        deps.discovery?.publish({ ...deps.announcement(), port })
      } catch (e) {
        deps.onError?.(e, 'bonjour publish')
      }
    } else if (!wanted && announcing) {
      announcing = false
      await deps.discovery?.unpublish().catch((e: unknown) => deps.onError?.(e, 'bonjour unpublish'))
    }
  }

  const rescan = async (): Promise<void> => {
    if (!listeners) return
    try {
      await listeners.sync(listenAddresses(deps.interfaces(), serve()))
    } catch (e) {
      // One address failing (it vanished between scan and listen) does not stop the others.
      deps.onError?.(e, 'server rescan')
    }
    await announce()
  }

  async function stop(): Promise<void> {
    if (timer) clearInterval(timer)
    timer = null
    const current = listeners
    listeners = null
    announcing = false
    await deps.discovery?.unpublish().catch((e: unknown) => deps.onError?.(e, 'bonjour unpublish'))
    await current?.close()
  }

  async function start(): Promise<void> {
    await stop()
    error = null
    port = deps.port()
    const next = createListeners(deps.fetch, port)
    try {
      await next.sync(listenAddresses(deps.interfaces(), serve()))
    } catch (e) {
      // Without the computer's own address nothing works; other addresses failing is a rescan matter.
      if (!next.addresses().includes('127.0.0.1')) {
        await next.close()
        error = isPortInUse(e) ? 'portInUse' : 'failed'
        deps.onError?.(e, 'server start')
        return
      }
      deps.onError?.(e, 'server start (some addresses)')
    }
    listeners = next
    await announce()
    timer = setInterval(() => void rescan(), deps.rescanMs ?? 30_000)
    timer.unref?.()
  }

  return {
    start,
    stop,
    rescan,
    /** The listening addresses (for tests: never 0.0.0.0, never a public one). */
    listening: (): string[] => listeners?.addresses() ?? [],
    state(): ServerState {
      const running = listeners !== null
      return {
        running,
        addresses: running ? hostAddresses(deps.interfaces(), port, serve()) : [],
        error,
        announced: running && (deps.discovery?.published() ?? false),
        listenLan: serve().lan,
        unservedPrivate: unservedPrivateAddresses(deps.interfaces())
      }
    }
  }
}
export type HostController = ReturnType<typeof createHostController>
