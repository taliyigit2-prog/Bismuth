// Sign-in state of server-mode callers (faz-13 madde 1, "Faz 4'ten notlar"): phones, browsers and other computers.
// The session token and the device id live only in HttpOnly cookies the server sets; the lock state and the wrong
// unlock counter are kept per session (not per window). The same router and services as the desktop answer, with
// `transport: 'http'`, so every remote rule (role allowed from where, setup only on the hotel's computer) applies.
import { createHash } from 'node:crypto'
import type { DeviceInfo, DeviceKind, RemoteAccess } from '@shared/contract/users'
import type { SessionBinding } from '../api/session'
import type { RequestNetwork } from '../services/auth-service'
import { anonymousCtx, lockedCtx, setupCtx, type Ctx } from '../services/context'
import {
  DEVICE_COOKIE,
  DEVICE_COOKIE_DAYS,
  SESSION_COOKIE,
  serializeCookie,
  signDevice,
  verifyDevice
} from './cookies'

/** What the server knows about one request before any procedure runs. */
export interface HttpRequestInfo {
  cookies: Record<string, string>
  ip: string
  network: RequestNetwork
  device: { kind: DeviceKind; name: string; platform: string | null }
}

/** A server-mode caller's binding: the desktop's interface plus where it came from and the cookies to send back. */
export interface HttpSessionBinding extends SessionBinding {
  readonly transport: 'http'
  readonly ip: string
  readonly network: RequestNetwork
  /** Hours a new session lasts (`host.sessionHours`). */
  sessionHours(): number
  /** Set-Cookie headers for the response. */
  readonly setCookies: string[]
}

export const isHttpBinding = (b: SessionBinding | null | undefined): b is HttpSessionBinding =>
  !!b && (b as Partial<HttpSessionBinding>).transport === 'http'

export interface HttpSessionDeps {
  setupDone(): boolean
  /** The live session of a token (expired, revoked or unknown → null); refreshes last-seen and the IP. */
  resolve(token: string, ip: string): { userId: string; deviceId: string; locked?: boolean } | null
  /** Keeps the lock state with the session (D3: a restart of the hotel's computer does not open a locked phone). */
  setLocked?(token: string, locked: boolean): void
  /** ctx of a signed-in user for this network (null: the account or its role may not be used from here). */
  userCtx(userId: string, deviceId: string, network: RequestNetwork): Ctx | null
  /** Where the user's role may sign in from (tells "local network only" apart from a closed account). */
  remoteAccess(userId: string): RemoteAccess
  endSession(token: string): void
  /** Signs the device cookie (kept by the host, never sent). */
  secret: Uint8Array
  sessionHours(): number
}

export interface HttpCaller {
  ctx: Ctx
  binding: HttpSessionBinding
  /** Signed in, but the role is kept to the hotel's local network and this request came from the private network. */
  lanOnly: boolean
}

const tokenKey = (token: string): string => createHash('sha256').update(token).digest('hex')

export function createHttpSessions(deps: HttpSessionDeps) {
  /** Lock state per session (a phone locked by its owner stays locked when reopened). */
  const locks = new Map<string, { locked: boolean; unlockFailures: number }>()

  function open(info: HttpRequestInfo): HttpCaller {
    const setCookies: string[] = []
    const deviceId = verifyDevice(info.cookies[DEVICE_COOKIE], deps.secret)
    const deviceRef = deviceId ?? 'http'
    let token = info.cookies[SESSION_COOKIE] ?? null
    let lanOnly = false

    const clearSession = (): void => {
      setCookies.push(serializeCookie(SESSION_COOKIE, '', { maxAge: 0 }))
    }

    const binding: HttpSessionBinding = {
      transport: 'http',
      ip: info.ip,
      network: info.network,
      setCookies,
      sessionHours: () => deps.sessionHours(),
      device(): DeviceInfo {
        return {
          ...(deviceId ? { deviceId } : {}),
          deviceName: info.device.name,
          kind: info.device.kind,
          platform: info.device.platform,
          ip: info.ip
        }
      },
      signedIn(result) {
        // Another person signing in on this phone ends the earlier one's session.
        if (token && token !== result.token) {
          deps.endSession(token)
          locks.delete(tokenKey(token))
        }
        token = result.token
        locks.set(tokenKey(result.token), { locked: false, unlockFailures: 0 })
        setCookies.push(
          serializeCookie(SESSION_COOKIE, result.token, { maxAge: deps.sessionHours() * 3600 }),
          serializeCookie(DEVICE_COOKIE, signDevice(result.deviceId, deps.secret), {
            maxAge: DEVICE_COOKIE_DAYS * 86_400
          })
        )
      },
      signedOut() {
        if (token) {
          locks.delete(tokenKey(token))
          deps.endSession(token)
        }
        token = null
        clearSession()
      },
      lock() {
        if (!token) return
        locks.set(tokenKey(token), {
          ...(locks.get(tokenKey(token)) ?? { unlockFailures: 0 }),
          locked: true
        })
        deps.setLocked?.(token, true)
      },
      unlock() {
        if (!token) return
        locks.set(tokenKey(token), { locked: false, unlockFailures: 0 })
        deps.setLocked?.(token, false)
      },
      unlockFailed() {
        if (!token) return 0
        const entry = locks.get(tokenKey(token)) ?? { locked: true, unlockFailures: 0 }
        entry.unlockFailures += 1
        locks.set(tokenKey(token), entry)
        return entry.unlockFailures
      }
    }

    const ctx = ((): Ctx => {
      // The wizard runs only on the hotel's own computer: over the network it has no rights at all.
      if (!deps.setupDone()) return setupCtx(deviceRef, 'http', () => false)
      if (!token) return anonymousCtx(deviceRef, 'http')
      const live = deps.resolve(token, info.ip)
      if (!live) {
        locks.delete(tokenKey(token))
        token = null
        clearSession()
        return anonymousCtx(deviceRef, 'http')
      }
      if (locks.get(tokenKey(token))?.locked || live.locked)
        return lockedCtx(live.userId, live.deviceId, 'http')
      const user = deps.userCtx(live.userId, live.deviceId, info.network)
      if (user) return user
      lanOnly = info.network === 'private' && deps.remoteAccess(live.userId) === 'lan'
      return anonymousCtx(live.deviceId, 'http')
    })()

    return { ctx, binding, lanOnly }
  }

  return { open }
}
export type HttpSessions = ReturnType<typeof createHttpSessions>

/** "iPhone · Safari", "Android · Chrome", "Windows · Edge": a device name people recognise in the device list. */
export function describeUserAgent(ua: string | null | undefined): {
  kind: DeviceKind
  name: string
  platform: string | null
} {
  const text = ua ?? ''
  const os = /iPhone/.test(text)
    ? 'iPhone'
    : /iPad/.test(text)
      ? 'iPad'
      : /Android/.test(text)
        ? 'Android'
        : /Windows/.test(text)
          ? 'Windows'
          : /Mac OS X|Macintosh/.test(text)
            ? 'Mac'
            : /Linux/.test(text)
              ? 'Linux'
              : null
  const browser = /Edg\//.test(text)
    ? 'Edge'
    : /OPR\/|Opera/.test(text)
      ? 'Opera'
      : /Firefox\/|FxiOS/.test(text)
        ? 'Firefox'
        : /Chrome\/|CriOS/.test(text)
          ? 'Chrome'
          : /Safari\//.test(text)
            ? 'Safari'
            : null
  const mobile = /Mobi|iPhone|iPad|Android/.test(text)
  const name = [os, browser].filter(Boolean).join(' · ') || 'Browser'
  return { kind: mobile ? 'mobile' : 'browser', name, platform: os }
}
