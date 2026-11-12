// The hotel computer's side of Ayarlar → Uzaktan erişim (faz-13 madde 1): mode, port, addresses, start with the
// computer, switching to client mode. Permission checks here (G-23): `remote.settings` view to read, edit to change;
// switching the server or the computer's way of working only from the hotel's own window (IPC), never from a phone
// that would cut itself off. The main process plugs in the parts that need Electron or the network (RemoteRuntime);
// without them (tests, the phone e2e harness) the server simply reports "not running".
import type {
  ClientStatus,
  ConflictReport,
  EpochState,
  FoundHost,
  Hello,
  HostStatus,
  RelayHostStatus
} from '@shared/contract/remote'
import type { BismuthDb } from '../db/client'
import type { Change } from '../replica/feed'
import { createGrant } from '../replica/grants'
import type { ConflictItem, Replaced } from '../relay/epoch'
import type { HostIdentity } from './host-identity'
import type { Services } from '../services'
import { systemCtx, type Ctx } from '../services/context'
import { AppError } from '../services/errors'
import { conflict, requirePermission } from '../services/kit'

/**
 * P13b, on the computer that keeps the data: the Drive box and PDF summary (src/main/relay/runtime.ts), whether
 * another computer took over (epoch guard), and the grants that let a client computer keep a copy. The main
 * process installs it (electron-wiring.ts); tests install their own.
 */
export interface ReplicaHostRuntime {
  db: BismuthDb
  relayStatus(): RelayHostStatus
  relayRun(): Promise<void>
  replaced(): Replaced | null
  conflicts(): ConflictItem[]
  /** `identity`: identity numbers stay in the rows (the person's role may see them). */
  conflictRows(identity: boolean): Change[]
  /** "Save as" of the program window; null when the person cancelled. */
  saveFile?(fileName: string, bytes: Buffer): Promise<string | null>
  clock?: () => Date
}

let replicaHost: ReplicaHostRuntime | null = null

export function setReplicaHostRuntime(next: ReplicaHostRuntime | null): void {
  replicaHost = next
}

const requireReplicaHost = (): ReplicaHostRuntime => {
  if (!replicaHost) throw new AppError('CONFLICT', 'errors.remoteUnavailable')
  return replicaHost
}

export interface RemoteRuntime {
  /** Starts or stops the HTTP server and the bonjour announcement; resolves once it listens (or failed). */
  applyMode(mode: 'standalone' | 'host'): Promise<void>
  /** The running server right now. */
  server(): Pick<
    HostStatus,
    'running' | 'addresses' | 'error' | 'announced' | 'listenLan' | 'unservedPrivate'
  >
  /** Listens on the local network too, or stops (after `host.listenLan` changed). */
  applyListen?(): Promise<void>
  /** This computer's key pair (K-45 (1)): its public key and proof go out in `remote.hello`. */
  identity?: HostIdentity
  openAtLogin(): boolean | null
  setOpenAtLogin(enabled: boolean): void
  /** Writes the client-mode file and starts the program again. */
  becomeClient(): void
  /** Bismuth servers on the local network (a few seconds). */
  discover(): Promise<FoundHost[]>
  version: string
  schemaVersion(): number
}

const notRunning: RemoteRuntime = {
  applyMode: async () => undefined,
  server: () => ({
    running: false,
    addresses: [],
    error: null,
    announced: false,
    listenLan: false,
    unservedPrivate: []
  }),
  openAtLogin: () => null,
  setOpenAtLogin: () => undefined,
  becomeClient: () => {
    throw new AppError('CONFLICT', 'errors.remoteUnavailable')
  },
  discover: async () => [],
  version: '0.0.0',
  schemaVersion: () => 0
}

let runtime: RemoteRuntime = notRunning

/** The main process installs the real runtime once at start (index.ts); tests install fakes. */
export function setRemoteRuntime(next: RemoteRuntime | null): void {
  runtime = next ?? notRunning
}

/** The hotel's own window only: a phone or another computer cannot change how this computer works. */
const requireLocal = (transport: 'ipc' | 'http'): void => {
  if (transport !== 'ipc') throw new AppError('PERMISSION_DENIED', 'errors.remoteLocalOnly')
}

export function createRemoteService(services: Services) {
  /** The hotel's own values (mode, port, name): read as the program; the caller's right is checked separately. */
  const setting = <K extends 'app.mode' | 'host.port' | 'hotel.name'>(key: K) =>
    services.settings.get(systemCtx())[key]
  const status = (ctx: Ctx): HostStatus => {
    requirePermission(ctx, 'remote.settings', 'view')
    return {
      mode: setting('app.mode'),
      port: setting('host.port'),
      openAtLogin: runtime.openAtLogin(),
      identity: runtime.identity?.fingerprint ?? null,
      ...runtime.server()
    }
  }

  return {
    hello(nonce?: string): Hello {
      const identity = runtime.identity
      return {
        app: 'bismuth',
        version: runtime.version,
        schemaVersion: runtime.schemaVersion(),
        hotelName: setting('hotel.name'),
        identity: identity ? { key: identity.publicKey, proof: nonce ? identity.prove(nonce) : null } : null
      }
    },

    hostStatus: status,

    async setMode(ctx: Ctx, mode: 'standalone' | 'host', transport: 'ipc' | 'http'): Promise<HostStatus> {
      requirePermission(ctx, 'remote.settings', 'edit')
      requireLocal(transport)
      services.settings.set(ctx, { 'app.mode': mode })
      await runtime.applyMode(mode)
      return status(ctx)
    },

    /**
     * Serve the hotel's local network too (K-45 (1)): plain HTTP on the Wi-Fi is readable by anyone on it, so the
     * screen warns before this is switched on (guests' Wi-Fi must be a separate network).
     */
    async setListenLan(ctx: Ctx, enabled: boolean, transport: 'ipc' | 'http'): Promise<HostStatus> {
      requirePermission(ctx, 'remote.settings', 'edit')
      requireLocal(transport)
      services.settings.set(ctx, { 'host.listenLan': enabled })
      await runtime.applyListen?.()
      return status(ctx)
    },

    setOpenAtLogin(ctx: Ctx, enabled: boolean, transport: 'ipc' | 'http'): HostStatus {
      requirePermission(ctx, 'remote.settings', 'edit')
      requireLocal(transport)
      runtime.setOpenAtLogin(enabled)
      return status(ctx)
    },

    becomeClient(ctx: Ctx, transport: 'ipc' | 'http'): { ok: true } {
      // A computer another one took over from changes nothing, except this: start using the new main computer.
      requirePermission(ctx, 'remote.settings', ctx.readOnly === 'replaced' ? 'view' : 'edit')
      requireLocal(transport)
      runtime.becomeClient()
      return { ok: true }
    },

    /** On a computer that keeps its own data the client procedures only report that. */
    clientStatus(): ClientStatus {
      return {
        mode: 'local',
        hostUrl: null,
        state: 'none',
        host: null,
        mine: { version: runtime.version, schemaVersion: runtime.schemaVersion() },
        lastContactAt: null,
        identity: { known: null, offered: null }
      }
    },

    async discover(transport: 'ipc' | 'http'): Promise<FoundHost[]> {
      // Over the network nobody may make the hotel's computer search the local network.
      if (transport !== 'ipc') return []
      return runtime.discover()
    },

    notClient(): never {
      throw conflict('errors.notClientMode')
    },

    // ---- P13b: box, summary, term, conflicts, copy grants ----

    relayStatus(ctx: Ctx): RelayHostStatus {
      requirePermission(ctx, 'remote.settings', 'view')
      return requireReplicaHost().relayStatus()
    },

    async relayRun(ctx: Ctx): Promise<RelayHostStatus> {
      requirePermission(ctx, 'remote.settings', 'edit')
      // The Drive box is written from the main computer only (QA3d D3).
      if (ctx.transport !== 'ipc') throw new AppError('PERMISSION_DENIED', 'errors.remoteLocalOnly')
      const host = requireReplicaHost()
      if (host.replaced()) throw new AppError('CONFLICT', 'errors.notMainComputer')
      await host.relayRun()
      return host.relayStatus()
    },

    /** Every signed-in screen asks (the strip on top): no permission needed, nothing but the term is told. */
    epochState(): EpochState {
      const epoch = services.settings.get(systemCtx())['host.epoch']
      const replaced = replicaHost?.replaced() ?? null
      return {
        epoch,
        replaced: replaced ? { epoch: replaced.epoch, by: replaced.by, at: replaced.at } : null
      }
    },

    conflicts(ctx: Ctx): ConflictReport {
      requirePermission(ctx, 'remote.settings', 'view')
      const host = requireReplicaHost()
      const replaced = host.replaced()
      return {
        replaced: replaced ? { epoch: replaced.epoch, by: replaced.by, at: replaced.at } : null,
        items: replaced
          ? host.conflicts().map((c) => ({
              ...c,
              pk: c.pk.map((v) => (typeof v === 'string' || typeof v === 'number' ? v : null))
            }))
          : []
      }
    },

    /** The conflicting changes with their rows into a file (this computer's own window; it stays on this computer). */
    async saveConflicts(ctx: Ctx, transport: 'ipc' | 'http'): Promise<{ path: string | null }> {
      requirePermission(ctx, 'remote.settings', 'view')
      requireLocal(transport)
      const host = requireReplicaHost()
      const replaced = host.replaced()
      if (!replaced || !host.saveFile) throw new AppError('CONFLICT', 'errors.remoteUnavailable')
      // Identity numbers only for a person whose role may see them (D7), as everywhere else.
      const identity = ctx.can('guests.identity', 'view')
      const body = { replacedBy: replaced, changes: host.conflictRows(identity) }
      const day = (host.clock?.() ?? new Date()).toISOString().slice(0, 10)
      const path = await host.saveFile(
        `bismuth-cakisan-kayitlar-${day}.json`,
        Buffer.from(JSON.stringify(body, null, 2))
      )
      return { path }
    },

    /** A client computer (signed in over the network) starts keeping a read-only copy. */
    replicaGrant(ctx: Ctx, transport: 'ipc' | 'http'): { token: string; userId: string } {
      requirePermission(ctx, 'remote.settings', 'view')
      if (transport !== 'http' || !ctx.userId) throw new AppError('CONFLICT', 'errors.notClientMode')
      const host = requireReplicaHost()
      if (host.replaced()) throw new AppError('CONFLICT', 'errors.notMainComputer')
      return createGrant(host.db, ctx, host.clock?.() ?? new Date(), () =>
        host.replaced() ? 'replaced' : null
      )
    }
  }
}
