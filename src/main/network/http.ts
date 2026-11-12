// The one door to the internet (CLAUDE.md yasak 1; G-01, G-02): GET only, HTTPS only, allowed hosts only, 5 s
// timeout, and not a single request while `network.enabled` is off. Every caller is in src/main/network. Failures
// are values, never thrown at the caller's caller: a missing internet must never surface as an error window.

/** Hosts the optional data may come from (canli-dogrulama.md, K-04, K-06, K-13). Nothing else is reachable. */
export const ALLOWED_HOSTS: readonly string[] = [
  // Market mid rates (K-06) and the TCMB comparison line.
  'finans.truncgil.com',
  'cdn.jsdelivr.net',
  'latest.currency-api.pages.dev',
  'open.er-api.com',
  'api.exchangerate-api.com',
  'api.frankfurter.app',
  'www.tcmb.gov.tr',
  // Keyed rate providers (the hotel's own key).
  'openexchangerates.org',
  'api.currencyapi.com',
  'api.currencylayer.com',
  // Weather (K-13): MET Norway; Open-Meteo only when the owner switches it on.
  'api.met.no',
  'api.open-meteo.com',
  // Holiday check (K-04): Google Calendar's public Turkish holidays feed; Nager.Date as backup.
  'calendar.google.com',
  'date.nager.at'
]

export const TIMEOUT_MS = 5_000
/** Larger answers are refused (the holiday feed is the biggest, ~100 KB). */
const MAX_BYTES = 2 * 1024 * 1024

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>

export interface HttpResult {
  status: number
  headers: Headers
  text: string
}

export type HttpOutcome =
  | { ok: true; result: HttpResult }
  | { ok: false; reason: 'off' | 'notAllowed' | 'network' | 'timeout' | 'tooLarge' }

export interface HttpClient {
  get(url: string, headers?: Record<string, string>): Promise<HttpOutcome>
  /** Requests that actually left (tests: zero with the network off). */
  readonly requestCount: number
}

export interface HttpOptions {
  /** Read on every request: the setting can change while the program runs. */
  enabled: () => boolean
  fetch?: FetchLike
  /**
   * Development and tests only (never in a packaged build): every allowed URL is sent to this local origin instead,
   * `https://api.met.no/x?y` → `<origin>/api.met.no/x?y`, so a fake server can answer.
   */
  origin?: string | null
  timeoutMs?: number
}

export function isAllowedUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && ALLOWED_HOSTS.includes(u.hostname) && !u.username && !u.password
  } catch {
    return false
  }
}

export function createHttpClient(opts: HttpOptions): HttpClient {
  const doFetch: FetchLike = opts.fetch ?? ((url, init) => fetch(url, init))
  const timeout = opts.timeoutMs ?? TIMEOUT_MS
  let count = 0
  return {
    get requestCount() {
      return count
    },
    async get(url, headers = {}) {
      if (!opts.enabled()) return { ok: false, reason: 'off' }
      if (!isAllowedUrl(url)) return { ok: false, reason: 'notAllowed' }
      const target = (u: string): string =>
        opts.origin ? `${opts.origin.replace(/\/$/, '')}/${u.slice('https://'.length)}` : u
      try {
        // Redirects are followed by hand, and only to another allowed host (MET asks clients to follow them).
        let current = url
        for (let hop = 0; hop < 4; hop++) {
          count++
          const res = await doFetch(target(current), {
            method: 'GET',
            headers,
            redirect: 'manual',
            signal: AbortSignal.timeout(timeout)
          })
          const location = res.headers.get('location')
          if (res.status >= 300 && res.status < 400 && res.status !== 304 && location) {
            const next = new URL(location, current).toString()
            if (!isAllowedUrl(next)) return { ok: false, reason: 'notAllowed' }
            current = next
            continue
          }
          const length = Number(res.headers.get('content-length') ?? 0)
          if (length > MAX_BYTES) return { ok: false, reason: 'tooLarge' }
          const text = await res.text()
          if (text.length > MAX_BYTES) return { ok: false, reason: 'tooLarge' }
          return { ok: true, result: { status: res.status, headers: res.headers, text } }
        }
        return { ok: false, reason: 'network' }
      } catch (error) {
        const name = (error as { name?: string } | null)?.name
        return { ok: false, reason: name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'network' }
      }
    }
  }
}
