// The bridge to the Python sidecar (K-49): the one place the camera module talks HTTP, and only to 127.0.0.1 on the
// port Bismuth chose, with the token Bismuth made (`X-Bismuth-Token`). The path must be an `/api/…` path, so no
// caller can steer a request to another host. No CORS, no Origin: this is the main process, not a web page.
import { createHmac } from 'node:crypto'
import { redactSecrets } from './redact'

export const BRIDGE_HOST = '127.0.0.1'
export const BRIDGE_TIMEOUT_MS = 5_000
export const TOKEN_HEADER = 'X-Bismuth-Token'

export type BridgeFetch = (url: string, init: RequestInit) => Promise<Response>

export interface BridgeHealth {
  ok: boolean
  /** `starting` while the models load, `running`, or `failed` (the sidecar says why in `error`). */
  state: 'starting' | 'running' | 'failed'
  error: string | null
  uptimeSeconds: number
  /** The analysis loop: `ok`, `degraded` (errors lately) or `stalled` (no pass for 10 s). */
  loop: 'ok' | 'degraded' | 'stalled' | null
}

export interface BridgeResponse {
  status: number
  json: unknown
}

export interface Bridge {
  readonly baseUrl: string
  request(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<BridgeResponse>
  /** The sidecar's answer, or null when it cannot be reached (or answers nonsense). */
  health(): Promise<BridgeHealth | null>
  /**
   * A short-lived signed address for the `<img>` live picture (an image tag cannot send headers); the token itself
   * never goes into a URL. Same scheme as `bridge_security.make_stream_token` on the Python side.
   */
  streamUrl(ttlSeconds?: number, nowMs?: number): string
}

export interface BridgeOptions {
  port: number
  token: string
  fetch?: BridgeFetch
  timeoutMs?: number
}

const API_PATH = /^\/api\/[A-Za-z0-9/_.-]*(\?[A-Za-z0-9=&_.%-]*)?$/

/** `<expiry epoch seconds>.<hex hmac-sha256(token, "stream:<expiry>")>`. */
export function makeStreamToken(secret: string, expiresAt: number): string {
  return `${expiresAt}.${createHmac('sha256', secret).update(`stream:${expiresAt}`).digest('hex')}`
}

export function createBridge(opts: BridgeOptions): Bridge {
  if (!Number.isInteger(opts.port) || opts.port < 1024 || opts.port > 65535)
    throw new Error('bridge: bad port')
  if (opts.token.length < 32) throw new Error('bridge: token too short')
  const baseUrl = `http://${BRIDGE_HOST}:${opts.port}`
  const doFetch: BridgeFetch = opts.fetch ?? ((url, init) => fetch(url, init))
  const timeout = opts.timeoutMs ?? BRIDGE_TIMEOUT_MS

  async function request(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: unknown
  ): Promise<BridgeResponse> {
    if (!API_PATH.test(path)) throw new Error('bridge: path must be an /api/ path')
    const res = await doFetch(`${baseUrl}${path}`, {
      method,
      headers: {
        [TOKEN_HEADER]: opts.token,
        ...(body === undefined ? {} : { 'content-type': 'application/json' })
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: 'error',
      signal: AbortSignal.timeout(timeout)
    })
    const text = await res.text()
    let json: unknown = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      json = null
    }
    return { status: res.status, json }
  }

  return {
    baseUrl,
    request,
    async health() {
      try {
        const res = await request('GET', '/api/health')
        if (res.status !== 200 && res.status !== 503) return null
        const j = res.json as Record<string, unknown> | null
        if (!j || typeof j !== 'object') return null
        const state = j['state']
        if (state !== 'starting' && state !== 'running' && state !== 'failed') return null
        const loop = (j['loop'] as { state?: unknown } | undefined)?.state
        return {
          ok: j['ok'] === true,
          state,
          error: typeof j['error'] === 'string' ? redactSecrets(j['error']) : null,
          uptimeSeconds: typeof j['uptime_seconds'] === 'number' ? j['uptime_seconds'] : 0,
          loop: loop === 'ok' || loop === 'degraded' || loop === 'stalled' ? loop : null
        }
      } catch {
        return null
      }
    },
    streamUrl(ttlSeconds = 60, nowMs = Date.now()) {
      const expiresAt = Math.floor(nowMs / 1000) + ttlSeconds
      return `${baseUrl}/api/stream?st=${makeStreamToken(opts.token, expiresAt)}`
    }
  }
}
