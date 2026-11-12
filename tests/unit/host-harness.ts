// Test helper (Faz 13): the server mode's front door over a real in-memory hotel — owner, receptionist and
// housekeeper accounts with known passwords — called as a phone would (cookies, Origin, the socket's address).
import { randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { RemoteAccess } from '@shared/contract/users'
import { createApiApp } from '../../src/main/api/app'
import { createHandlers } from '../../src/main/api/handlers'
import { roles, users } from '../../src/main/db/schema'
import type { DatabaseHandle } from '../../src/main/db/client'
import { createServices } from '../../src/main/services'
import { hashSecret, remoteAccessOfUser } from '../../src/main/services/auth-service'
import { readSetting } from '../../src/main/services/settings-service'
import { ctxForUser } from '../../src/main/services/users-service'
import { httpAuthHandlers } from '../../src/main/server/auth-handlers'
import { createHostApp, type HostLimits } from '../../src/main/server/host-app'
import { createHttpSessions } from '../../src/main/server/http-sessions'
import { classifyAddress, type Interfaces } from '../../src/main/server/net'
import { createReplicaFeed } from '../../src/main/server/replica-routes'
import { seededDatabase } from '../factories/db'
import { tempDataDir } from '../factories/runtime'

export const PASSWORD = 'gizli-sifre-1'
export const HOST = '192.168.1.20:7373'
export const ORIGIN = `http://${HOST}`
export const LAN_PHONE = '192.168.1.45'
export const NETBIRD_PHONE = '100.64.0.7'
/** The hotel computer's cards: the Wi-Fi and the NetBird card (wt0, 100.64.0.0/16) its private-network phones reach. */
export const HOST_LAN = '192.168.1.20'
export const HOST_NETBIRD = '100.64.0.1'
const card = (address: string, netmask: string) => ({
  address,
  netmask,
  family: 'IPv4' as const,
  internal: false,
  mac: '',
  cidr: null
})
export const HOST_INTERFACES: Interfaces = {
  Ethernet: [card(HOST_LAN, '255.255.255.0')],
  wt0: [card(HOST_NETBIRD, '255.255.0.0')]
}

export interface HostHarness {
  handle: DatabaseHandle
  services: ReturnType<typeof createServices>
  app: ReturnType<typeof createHostApp>
  secret: Uint8Array
  user(username: string, role: string, opts?: { password?: string; pinHash?: string }): string
  setRoleAccess(role: string, access: RemoteAccess): void
  close(): void
}

export async function hostHarness(
  options: {
    limits?: Partial<HostLimits>
    version?: string
    clock?: () => Date
    /** P13b: the change feed for read-only copies (GET /api/replica/*); `replaced` = another computer took over. */
    replica?: { replaced?: () => boolean }
    /**
     * The hotel's local network is served (`host.listenLan`, K-45 (1)). The harness's phones sit on the hotel's
     * Wi-Fi, so it is on here; the program's default (off) has its own tests.
     */
    listenLan?: boolean
    /** The process-wide write gate of a computer another one took over from (O-4). */
    writeGate?: () => 'replaced' | null
    /** This computer's network cards (N-5); default HOST_INTERFACES. */
    interfaces?: Interfaces
  } = {}
): Promise<HostHarness> {
  const handle = await seededDatabase()
  const services = createServices(
    handle,
    {
      name: 'Bismuth',
      version: '0.1.0',
      packaged: false,
      dataDir: tempDataDir(),
      electron: null,
      chrome: null
    },
    {
      ...(options.clock ? { clock: options.clock } : {}),
      ...(options.writeGate ? { writeGate: options.writeGate } : {})
    }
  )
  const db = handle.db
  const secret = randomBytes(32)
  const sessions = createHttpSessions({
    setupDone: () => services.setup.isDone(),
    resolve: (token, ip) => services.auth.resolveSession(token, ip),
    setLocked: (token, locked) => services.auth.setSessionLock(token, locked),
    userCtx: (userId, deviceId, network) => ctxForUser(db, userId, deviceId, 'http', network),
    remoteAccess: (userId) => remoteAccessOfUser(db, userId),
    endSession: (token) => void services.auth.logout(token),
    secret,
    sessionHours: () => readSetting(db, 'host.sessionHours')
  })
  const api = createApiApp({ handlers: { ...createHandlers(services), ...httpAuthHandlers(services) } })
  const app = createHostApp({
    api,
    sessions,
    staticRoot: '/nonexistent',
    machineName: 'OTEL-PC',
    version: options.version ?? '0.1.0',
    schemaVersion: () => handle.schemaVersion,
    secret,
    listenLan: () => options.listenLan ?? true,
    interfaces: () => options.interfaces ?? HOST_INTERFACES,
    ...(options.limits ? { limits: options.limits } : {}),
    ...(options.replica
      ? {
          replicaFeed: createReplicaFeed({
            db,
            sqlite: handle.sqlite,
            schemaVersion: () => handle.schemaVersion,
            replaced: options.replica.replaced ?? (() => false)
          })
        }
      : {})
  })
  const roleId = (code: string) => db.select().from(roles).where(eq(roles.code, code)).get()!.id
  return {
    handle,
    services,
    app,
    secret,
    user(username, role, opts = {}) {
      const id = `u-${username}`
      db.insert(users)
        .values({
          id,
          username,
          displayName: username,
          roleId: roleId(role),
          passwordHash: hashSecret(opts.password ?? PASSWORD),
          pinHash: opts.pinHash ?? null,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z'
        })
        .run()
      return id
    },
    setRoleAccess(role, access) {
      db.update(roles)
        .set({ remoteAccess: access, remoteAllowed: access !== 'off' })
        .where(eq(roles.id, roleId(role)))
        .run()
    },
    close: () => handle.close()
  }
}

/**
 * A browser-like client of the harness: keeps its cookies, sends Origin and JSON like the page does. It reaches the
 * hotel computer's card of its own network (`local`: the socket's local address); a browser on the hotel computer
 * itself (127.0.0.1) opens http://127.0.0.1:7373.
 */
export function phone(
  app: HostHarness['app'],
  from = LAN_PHONE,
  extra: Record<string, string> = {},
  local?: string
) {
  const jar = new Map<string, string>()
  const cls = classifyAddress(from)
  const at = local ?? (cls === 'private' ? HOST_NETBIRD : cls === 'loopback' ? '127.0.0.1' : HOST_LAN)
  const host = cls === 'loopback' ? '127.0.0.1:7373' : HOST
  const request = async (path: string, init: RequestInit & { headers?: Record<string, string> } = {}) => {
    const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ')
    const res = await app.fetch(
      new Request(`http://${host}${path}`, {
        ...init,
        headers: {
          host,
          origin: `http://${host}`,
          'content-type': 'application/json',
          'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1',
          ...(cookie ? { cookie } : {}),
          ...extra,
          ...init.headers
        }
      }),
      { incoming: { socket: { remoteAddress: from, localAddress: at } } }
    )
    for (const header of res.headers.getSetCookie()) {
      const [pair] = header.split(';')
      const [name, value] = (pair ?? '').split('=')
      if (!name) continue
      if (/max-age=0/i.test(header) || !value) jar.delete(name)
      else jar.set(name, value)
    }
    return res
  }
  return {
    jar,
    request,
    async call<T = unknown>(name: string, body: unknown = {}, headers: Record<string, string> = {}) {
      const res = await request(`/api/${name}`, { method: 'POST', body: JSON.stringify(body), headers })
      const text = await res.text()
      return { status: res.status, body: (text ? JSON.parse(text) : null) as T, headers: res.headers }
    }
  }
}
