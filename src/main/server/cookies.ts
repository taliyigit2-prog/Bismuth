// Cookies of the server mode (faz-13 madde 1, "Faz 4'ten notlar"): the session token and the device id travel only
// as HttpOnly + SameSite=Strict cookies the server sets (no script can read them, no other site can send them).
// The device id is signed with the host's secret, so a caller cannot claim another device by typing its id.
import { createHmac, timingSafeEqual } from 'node:crypto'

export const SESSION_COOKIE = 'bismuth_session'
export const DEVICE_COOKIE = 'bismuth_device'
/** A device is remembered for a year without use (the browser keeps the cookie at most ~400 days). */
export const DEVICE_COOKIE_DAYS = 365

export function parseCookies(header: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!header) return out
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq <= 0) continue
    const name = part.slice(0, eq).trim()
    const value = part.slice(eq + 1).trim()
    // The first one wins (a browser sends the most specific path first); names are ours, values opaque.
    if (name && !(name in out) && /^[\w.-]{1,512}$/.test(value)) out[name] = value
  }
  return out
}

export interface CookieOptions {
  /** Seconds; 0 deletes the cookie; undefined = until the browser closes. */
  maxAge?: number
}

/** `name=value; HttpOnly; SameSite=Strict; Path=/` — never readable by scripts, never sent by another site. */
export function serializeCookie(name: string, value: string, options: CookieOptions = {}): string {
  const parts = [`${name}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Strict']
  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`)
  return parts.join('; ')
}

const mac = (id: string, secret: Uint8Array): string =>
  createHmac('sha256', secret).update(`device:${id}`).digest('base64url')

/** Device cookie value: `<id>.<hmac>`. */
export const signDevice = (id: string, secret: Uint8Array): string => `${id}.${mac(id, secret)}`

/** The device id of a cookie value, or null when it was not signed by this host. */
export function verifyDevice(value: string | undefined, secret: Uint8Array): string | null {
  if (!value) return null
  const dot = value.lastIndexOf('.')
  if (dot <= 0) return null
  const id = value.slice(0, dot)
  if (!/^[0-9A-HJKMNP-TV-Z]{26}$/.test(id)) return null
  const given = Buffer.from(value.slice(dot + 1))
  const expected = Buffer.from(mac(id, secret))
  return given.length === expected.length && timingSafeEqual(given, expected) ? id : null
}
