// Camera alarms to Telegram (K-50, the one outside service of the camera module; CLAUDE.md yasak 14). Bismuth sends it,
// the Python sidecar never touches the internet (K-49). Rules, the same as every optional online call (yasak 1):
//   - not one request while `network.enabled` or `camera.telegram.enabled` is off (`enabled()` is read on every call),
//   - api.telegram.org only, HTTPS only, the token never leaves the URL path and is never returned or logged,
//   - 5 s timeout per request, no retry, no queue: a failure is a value (`ok: false`), never thrown.
// The alarm itself always lands in Bismuth first (notifications, P20c); Telegram is the extra copy.
import type { FetchLike } from '../http'

export const TELEGRAM_HOST = 'api.telegram.org'
export const TELEGRAM_TIMEOUT_MS = 5_000

export interface TelegramCredentials {
  token: string
  /** Chat or group ids ("-5390916610", "12345") or "@channel" names. */
  chatIds: string[]
}

/** BotFather token: "<bot id>:<secret>". Anything else is refused before it can shape a URL. */
const TOKEN_RE = /^\d{3,}:[A-Za-z0-9_-]{10,}$/
const CHAT_RE = /^(-?\d{1,20}|@[A-Za-z][A-Za-z0-9_]{3,31})$/

export const isValidToken = (token: string): boolean => TOKEN_RE.test(token)
export const isValidChatId = (chat: string): boolean => CHAT_RE.test(chat)

/** "-1001, 55 ,@kanal" → ["-1001", "55", "@kanal"]; invalid entries are dropped. */
export function parseChatIds(raw: string): string[] {
  return raw
    .split(/[,;\s]+/)
    .map((c) => c.trim())
    .filter((c) => c !== '' && isValidChatId(c))
}

export interface TelegramDeps {
  /** `network.enabled` and `camera.telegram.enabled`; read on every call (the settings can change while running). */
  enabled: () => boolean
  credentials: () => TelegramCredentials | null
  /** `camera.telegram.photo`: whether the alarm photo is attached when there is one. */
  photoEnabled?: () => boolean
  fetch?: FetchLike
  /** Development and tests only (never in a packaged build): requests go to `<origin>/api.telegram.org/bot…`. */
  origin?: string | null
  timeoutMs?: number
}

export type TelegramOutcome =
  | { ok: true; sent: number; failed: number }
  | { ok: false; reason: 'off' | 'noCredentials' | 'invalidCredentials' | 'network' | 'timeout' }

export interface TelegramAlert {
  /** The message (location, time, tracking number…); never a guest name. */
  text: string
  /** The alarm photo (JPEG); sent only when `camera.telegram.photo` is on. */
  photo?: Uint8Array | null
}

export interface TelegramClient {
  sendAlert(alert: TelegramAlert): Promise<TelegramOutcome>
  /** Requests that actually left (tests: zero while off). */
  readonly requestCount: number
}

export function createTelegramClient(deps: TelegramDeps): TelegramClient {
  const doFetch: FetchLike = deps.fetch ?? ((url, init) => fetch(url, init))
  const timeout = deps.timeoutMs ?? TELEGRAM_TIMEOUT_MS
  let count = 0

  const endpoint = (token: string, method: 'sendMessage' | 'sendPhoto'): string => {
    const path = `bot${token}/${method}`
    return deps.origin
      ? `${deps.origin.replace(/\/$/, '')}/${TELEGRAM_HOST}/${path}`
      : `https://${TELEGRAM_HOST}/${path}`
  }

  async function post(url: string, body: FormData | string, json: boolean): Promise<boolean> {
    count++
    const res = await doFetch(url, {
      method: 'POST',
      ...(json ? { headers: { 'content-type': 'application/json' } } : {}),
      body,
      redirect: 'error',
      signal: AbortSignal.timeout(timeout)
    })
    return res.ok
  }

  return {
    get requestCount() {
      return count
    },
    async sendAlert(alert) {
      if (!deps.enabled()) return { ok: false, reason: 'off' }
      const creds = deps.credentials()
      if (!creds || creds.chatIds.length === 0) return { ok: false, reason: 'noCredentials' }
      if (!isValidToken(creds.token) || !creds.chatIds.every(isValidChatId))
        return { ok: false, reason: 'invalidCredentials' }
      const withPhoto = Boolean(alert.photo && alert.photo.length > 0 && (deps.photoEnabled?.() ?? true))
      let sent = 0
      let failed = 0
      let timedOut = false
      for (const chat of creds.chatIds) {
        try {
          let ok: boolean
          if (withPhoto) {
            const form = new FormData()
            form.set('chat_id', chat)
            form.set('caption', alert.text)
            form.set(
              'photo',
              new Blob([new Uint8Array(alert.photo as Uint8Array)], { type: 'image/jpeg' }),
              'alert.jpg'
            )
            ok = await post(endpoint(creds.token, 'sendPhoto'), form, false)
          } else {
            ok = await post(
              endpoint(creds.token, 'sendMessage'),
              JSON.stringify({ chat_id: chat, text: alert.text }),
              true
            )
          }
          if (ok) sent++
          else failed++
        } catch (error) {
          failed++
          const name = (error as { name?: string } | null)?.name
          if (name === 'TimeoutError' || name === 'AbortError') timedOut = true
        }
      }
      if (sent === 0 && failed > 0) return { ok: false, reason: timedOut ? 'timeout' : 'network' }
      return { ok: true, sent, failed }
    }
  }
}
