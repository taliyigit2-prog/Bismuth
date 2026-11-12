// The server mode's HTTP front door (faz-13 madde 1, 10; "Faz 4'ten notlar"; 03-mimari.md §7, §8): the same router
// as the desktop window (api/app.ts) and the same React bundle, behind the checks only a network caller needs:
//   1. host name: an IP of this computer or a local/private-network name (DNS rebinding gets 421);
//   2. caller address: only this computer, the private network and — when switched on (`host.listenLan`, K-45 (1)) —
//      the local network (else 403);
//   3. requests per address per minute and requests open at the same time (per address and in all; 429) — checked
//      before any body is read; bodies up to 64 KB without a session or for public procedures, up to 8 MB (the
//      window's limit) only with a valid session (413, N-1);
//   4. /api: POST + `Content-Type: application/json` + `Origin` = this server (CSRF: another site's page cannot
//      call it, and no CORS header is ever sent, so a browser blocks cross-site reads too);
//   5. sign-in tries per address and per device, refused before any password hash is computed (429);
//   6. a role kept to the hotel's local network gets 403 on the private network.
// Then the session cookie becomes `ctx` (http-sessions.ts) and the call runs as on the desktop with
// `transport: 'http'` (setup is refused, remote rules apply). Static files get the same CSP as the window.
import { Hono, type Context } from 'hono'
import { accessOf, isProcedureName, type ApiErrorBody, type ErrorCode } from '@shared/contract'
import { MAX_BODY_BYTES } from '@shared/contract/transport'
import { ERROR_STATUS } from '@shared/contract'
import type { ApiEnv } from '../api/app'
import { DEVICE_COOKIE, parseCookies, SESSION_COOKIE, verifyDevice } from './cookies'
import { describeUserAgent, type HttpSessions } from './http-sessions'
import { ctxKind } from '../services/context'
import {
  classifyAddress,
  isAllowedHostName,
  isPrivatePeer,
  plainAddress,
  requestNetwork,
  type AddressClass,
  type Interfaces
} from './net'
import { createRateLimiter, type RateLimiter } from './rate-limit'
import type { ReplicaFeed } from './replica-routes'
import { CSP, readStatic } from './static'
import { mainLocale, tFor } from '../app/i18n'
import { APP_LOCALES, type AppLocale } from '@shared/format'

/** The first of the browser's languages Bismuth has (`Accept-Language: ru-RU,ru;q=0.9`); else the window's. */
export function browserLocale(header: string | undefined): AppLocale {
  for (const part of (header ?? '').split(',')) {
    const code = part.split(';')[0]!.trim().slice(0, 2).toLowerCase()
    if ((APP_LOCALES as readonly string[]).includes(code)) return code as AppLocale
  }
  return mainLocale()
}

/**
 * A refused page request gets a short sentence in the browser's language (G-08), not a bare English word; the status
 * code is the same for programs. /api answers stay JSON with an `errors.*` key.
 */
function refusal(c: Context<HostEnv>, key: string, status: 403 | 404 | 405 | 421): Response {
  return c.text(tFor(browserLocale(c.req.header('accept-language')))(key), status)
}

/**
 * Sign-in procedures: counted per address and per device before they run. The ones that ask a signed-in account
 * for its current password again are guesses at the password too (Faz 4 bug hunt #9).
 */
export const SIGN_IN_PROCEDURES = new Set([
  'auth.signIn',
  'auth.signInWithPin',
  'auth.recover',
  'auth.unlock',
  'auth.changePassword',
  'auth.setPin',
  'auth.newRecoveryCodes'
])

export interface HostLimits {
  /** Requests per address per minute (a phone opening Bugün makes ~20). */
  requestsPerMinute: number
  /** Failed sign-in tries per address and per device in `signInWindowMs`. */
  signInTries: number
  signInWindowMs: number
  /** Sign-in tries of one address being checked at the same time. */
  signInConcurrent: number
  /** /api requests of one address open at the same time (a browser opens at most 6 connections per site). */
  concurrentPerAddress: number
  /** /api requests open at the same time in all (N-1: N bodies × 8 MB cannot fill the hotel computer's memory). */
  concurrentTotal: number
  /** Request body without a valid session, or for a public procedure (sign-in, hello). */
  publicBodyBytes: number
}

export const DEFAULT_LIMITS: HostLimits = {
  requestsPerMinute: 600,
  signInTries: 10,
  signInWindowMs: 10 * 60_000,
  signInConcurrent: 2,
  concurrentPerAddress: 16,
  concurrentTotal: 48,
  publicBodyBytes: 64 * 1024
}

export interface HostAppOptions {
  /** The shared router, built with the server mode's sign-in handlers (auth-handlers.ts). */
  api: Hono<ApiEnv>
  sessions: HttpSessions
  /** Folder with the built renderer (out/renderer). */
  staticRoot: string
  /** This computer's name: `http://<name>.local:7373` is a valid address too. */
  machineName: string
  /** Version headers on every answer: a phone notices when the hotel's computer was updated. */
  version: string
  schemaVersion: () => number
  /** Signs the device cookie (the same secret as `sessions`). */
  secret: Uint8Array
  limits?: Partial<HostLimits>
  clock?: () => number
  /** The change feed of the owner's read-only copy (P13b): GET /api/replica/changes and /api/replica/snapshot. */
  replicaFeed?: ReplicaFeed
  /** The hotel's local network is served (`host.listenLan`); default off: only this computer and the private network. */
  listenLan?: () => boolean
  /**
   * This computer's network cards (N-5): a 100.x caller is the private network only when it came in on the
   * NetBird/Tailscale card and from its range. Without it no caller counts as the private network.
   */
  interfaces?: () => Interfaces
}

/** What the socket says (node-server puts the IncomingMessage in the bindings; tests pass a fake). */
type Bindings = {
  incoming?: { socket?: { remoteAddress?: string | undefined; localAddress?: string | undefined } }
}
type HostEnv = { Bindings: Bindings; Variables: { ip: string; cls: Exclude<AddressClass, 'public'> } }

const errorJson = (code: ErrorCode, messageKey: string): ApiErrorBody => ({ error: { code, messageKey } })

export function createHostApp(options: HostAppOptions) {
  const limits = { ...DEFAULT_LIMITS, ...options.limits }
  const clock = options.clock
  const requests: RateLimiter = createRateLimiter({
    limit: limits.requestsPerMinute,
    windowMs: 60_000,
    clock
  })
  const signInFailures: RateLimiter = createRateLimiter({
    limit: limits.signInTries,
    windowMs: limits.signInWindowMs,
    clock
  })
  const inFlight = new Map<string, number>()
  const open = new Map<string, number>()
  let openTotal = 0
  const now = clock ?? Date.now
  // The cards change rarely (NetBird coming up); looking them up once per request would be wasted work.
  let cards: { at: number; value: Interfaces } | null = null
  const interfaces = (): Interfaces => {
    if (!options.interfaces) return {}
    if (!cards || now() - cards.at > 10_000) cards = { at: now(), value: options.interfaces() }
    return cards.value
  }

  const app = new Hono<HostEnv>()

  app.use('*', async (c, next) => {
    await next()
    c.header('Content-Security-Policy', CSP)
    c.header('X-Content-Type-Options', 'nosniff')
    c.header('Referrer-Policy', 'no-referrer')
    c.header('X-Frame-Options', 'DENY')
    c.header('Cross-Origin-Opener-Policy', 'same-origin')
    c.header('Cross-Origin-Resource-Policy', 'same-origin')
    c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()')
    c.header('X-Bismuth-Version', options.version)
    c.header('X-Bismuth-Schema', String(options.schemaVersion()))
  })

  /** Where the caller is; a 100.x sender that did not come in on the private network's card is not trusted (N-5). */
  const classOf = (c: Context<HostEnv>, ip: string): AddressClass => {
    const cls = classifyAddress(ip)
    if (cls !== 'private') return cls
    return isPrivatePeer(interfaces(), ip, c.env?.incoming?.socket?.localAddress ?? '') ? 'private' : 'public'
  }

  // 1–2: who may talk to this server at all. The local network only when it is served (a request can still reach
  // the private-network address from the Wi-Fi when the router forwards it).
  app.use('*', async (c, next) => {
    const ip = plainAddress(c.env?.incoming?.socket?.remoteAddress ?? '')
    const cls = classOf(c, ip)
    if (!isAllowedHostName(c.req.header('host') ?? '', options.machineName, cls))
      return refusal(c, 'server.refused.misdirected', 421)
    if (cls === 'public' || (cls === 'lan' && !(options.listenLan?.() ?? false))) {
      return c.req.path.startsWith('/api/')
        ? c.json(
            errorJson('PERMISSION_DENIED', cls === 'lan' ? 'errors.remoteLanOff' : 'errors.remoteForbidden'),
            403
          )
        : refusal(c, cls === 'lan' ? 'errors.remoteLanOff' : 'errors.remoteForbidden', 403)
    }
    c.set('ip', ip)
    c.set('cls', cls)
    await next()
    return undefined
  })

  // 3 (N-1): requests per address, and requests open at the same time, before a single body byte is read — slow or
  // endless bodies from many connections cannot pile up in memory. Bodies are read later, within their limit.
  app.use('/api/*', async (c, next) => {
    const ip = c.get('ip')
    c.header('Cache-Control', 'no-store')
    if (!requests.take(`ip:${ip}`)) return c.json(errorJson('RATE_LIMITED', 'errors.tooManyRequests'), 429)
    if ((open.get(ip) ?? 0) >= limits.concurrentPerAddress || openTotal >= limits.concurrentTotal)
      return c.json(errorJson('RATE_LIMITED', 'errors.tooManyRequests'), 429)
    open.set(ip, (open.get(ip) ?? 0) + 1)
    openTotal += 1
    try {
      await next()
    } finally {
      openTotal -= 1
      const left = (open.get(ip) ?? 1) - 1
      if (left > 0) open.set(ip, left)
      else open.delete(ip)
    }
    return undefined
  })

  // The change feed takes no body at all.
  const tooLarge = (c: Context<HostEnv>) => c.json(errorJson('VALIDATION', 'errors.requestTooLarge'), 413)
  app.use('/api/replica/*', async (c, next) => {
    const length = Number(c.req.header('content-length') ?? '0')
    if (length > 0 || c.req.header('transfer-encoding')) return tooLarge(c)
    await next()
    return undefined
  })

  // The change feed (GET, read-only): a copy grant or a signed-in session with `remote.settings` (replica-routes.ts).
  app.get('/api/replica/*', (c) => {
    const ip = c.get('ip')
    const cls = c.get('cls')
    if (!options.replicaFeed) return c.json(errorJson('UNKNOWN_PROCEDURE', 'errors.unknownProcedure'), 404)
    const bearer = /^Bearer ([\w-]{20,200})$/.exec(c.req.header('authorization') ?? '')?.[1] ?? null
    const cookies = parseCookies(c.req.header('cookie'))
    let sessionCtx = null
    if (!bearer && cookies[SESSION_COOKIE]) {
      const caller = options.sessions.open({
        cookies,
        ip,
        network: requestNetwork(cls),
        device: describeUserAgent(c.req.header('user-agent'))
      })
      sessionCtx = caller.lanOnly ? null : caller.ctx
    }
    return options.replicaFeed.handle(c.req.raw, {
      token: bearer,
      sessionCtx,
      network: requestNetwork(cls),
      ip
    })
  })

  app.all('/api/*', async (c) => {
    const ip = c.get('ip')
    const cls = c.get('cls')
    if (c.req.method !== 'POST') return c.json(errorJson('UNKNOWN_PROCEDURE', 'errors.unknownProcedure'), 405)
    // 4: CSRF — JSON only (a form cannot send it without asking first), and only from this server's own pages.
    const type = (c.req.header('content-type') ?? '').split(';')[0]?.trim().toLowerCase()
    if (type !== 'application/json') return c.json(errorJson('VALIDATION', 'errors.validation'), 400)
    const origin = c.req.header('origin')
    const host = c.req.header('host') ?? ''
    const site = c.req.header('sec-fetch-site')
    if (!origin || origin.toLowerCase() !== `http://${host.toLowerCase()}`)
      return c.json(errorJson('PERMISSION_DENIED', 'errors.badOrigin'), 403)
    if (site && site !== 'same-origin' && site !== 'none')
      return c.json(errorJson('PERMISSION_DENIED', 'errors.badOrigin'), 403)

    const name = c.req.path.slice('/api/'.length)
    const cookies = parseCookies(c.req.header('cookie'))
    const deviceId = verifyDevice(cookies[DEVICE_COOKIE], options.secret)

    // 5: sign-in tries, refused before the session is even looked at.
    const signIn = SIGN_IN_PROCEDURES.has(name)
    const tryKeys = [`ip:${ip}`, ...(deviceId ? [`device:${deviceId}`] : [])]
    if (signIn) {
      if (
        tryKeys.some((k) => signInFailures.blocked(k)) ||
        (inFlight.get(ip) ?? 0) >= limits.signInConcurrent
      )
        return c.json(errorJson('RATE_LIMITED', 'errors.tooManyAttempts'), 429)
      inFlight.set(ip, (inFlight.get(ip) ?? 0) + 1)
    }

    try {
      const caller = options.sessions.open({
        cookies,
        ip,
        network: requestNetwork(cls),
        device: deviceInfo(c.req.header('user-agent'), c.req.header('x-bismuth-client'), {
          name: c.req.header('x-bismuth-device-name'),
          platform: c.req.header('x-bismuth-platform')
        })
      })
      // 6: local-network-only role on the private network.
      if (caller.lanOnly && isProcedureName(name) && !accessOf(name).includes('public')) {
        const res = c.json(errorJson('PERMISSION_DENIED', 'errors.remoteLanOnly'), 403)
        for (const cookie of caller.binding.setCookies) res.headers.append('Set-Cookie', cookie)
        return res
      }
      // N-1: 8 MB (an import file, a photo) only for a signed-in, unlocked session; everything else 64 KB.
      const maxBody =
        caller.ctx.userId !== null &&
        ctxKind(caller.ctx) === 'user' &&
        isProcedureName(name) &&
        !accessOf(name).includes('public')
          ? MAX_BODY_BYTES
          : limits.publicBodyBytes
      const body = await readBody(c.req.raw, maxBody)
      if (!body) {
        const res = tooLarge(c)
        for (const cookie of caller.binding.setCookies) res.headers.append('Set-Cookie', cookie)
        return res
      }
      const request = new Request(c.req.raw.url, {
        method: c.req.raw.method,
        headers: c.req.raw.headers,
        body
      })
      const answer = await options.api.fetch(request, {
        ctx: caller.ctx,
        session: caller.binding,
        transport: 'http'
      })
      if (signIn && answer.status !== 200 && answer.status !== ERROR_STATUS.VALIDATION)
        for (const k of tryKeys) signInFailures.hit(k)
      const res = new Response(answer.body, answer)
      res.headers.set('Cache-Control', 'no-store')
      for (const cookie of caller.binding.setCookies) res.headers.append('Set-Cookie', cookie)
      return res
    } finally {
      if (signIn) {
        const left = (inFlight.get(ip) ?? 1) - 1
        if (left > 0) inFlight.set(ip, left)
        else inFlight.delete(ip)
      }
    }
  })

  app.on(['GET', 'HEAD'], '*', async (c) => {
    const file = await readStatic(options.staticRoot, c.req.path)
    if (!file) return refusal(c, 'server.refused.notFound', 404)
    const immutable = c.req.path.startsWith('/assets/')
    return c.body(file.body as unknown as ArrayBuffer, 200, {
      'Content-Type': file.type,
      'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache'
    })
  })

  // Anything else (OPTIONS preflights included) is refused: no CORS, ever.
  app.all('*', (c) => refusal(c, 'server.refused.method', 405))

  return app
}

/**
 * The request body, read only up to `max` bytes (a declared longer length is refused before reading). Null: too
 * large. Chunked bodies are counted as they arrive and the rest is never read.
 */
async function readBody(request: Request, max: number): Promise<Uint8Array | null> {
  const declared = request.headers.get('content-length')
  if (declared !== null && Number(declared) > max) return null
  if (!request.body) return new Uint8Array(0)
  const reader = request.body.getReader()
  const parts: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > max) {
      await reader.cancel().catch(() => undefined)
      return null
    }
    parts.push(value)
  }
  const out = new Uint8Array(size)
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.byteLength
  }
  return out
}

/** The device a request comes from: Bismuth on another computer names itself; a browser is known by its UA. */
function deviceInfo(
  ua: string | undefined,
  client: string | undefined,
  hint: { name: string | undefined; platform: string | undefined }
) {
  const clean = (v: string | undefined, max: number): string | null => {
    const text = (v ?? '').replace(/[^\p{L}\p{N} ._()'·-]/gu, '').trim()
    return text ? text.slice(0, max) : null
  }
  if (client === 'desktop') {
    return {
      kind: 'desktop' as const,
      name: clean(hint.name, 100) ?? 'Bismuth',
      platform: clean(hint.platform, 32)
    }
  }
  return describeUserAgent(ua)
}
