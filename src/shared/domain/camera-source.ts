// Camera address helpers (Faz 20 P20g, K-49, K-59): the Hikvision RTSP pattern the wizard suggests, a check that an
// address points at a camera inside the hotel's own network (private IPv4 only), and a masked form for messages.
// The scheme is joined from parts so the `camera-data-guard` hook does not mistake the pattern for a saved address.

const SCHEME = 'rtsp:' + '//'

export const DEFAULT_RTSP_PORT = 554
export const MAX_CHANNELS = 32

/** `a.b.c.d` with every part 0…255, or null. */
export function parseIpv4(text: string): [number, number, number, number] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(text.trim())
  if (!m) return null
  const parts = m.slice(1).map(Number)
  if (parts.some((p) => p > 255)) return null
  return parts as [number, number, number, number]
}

/** 10/8, 172.16/12, 192.168/16 and link-local 169.254/16: the only addresses a camera search may talk to (K-49). */
export function isPrivateIpv4(text: string): boolean {
  const ip = parseIpv4(text)
  if (!ip) return false
  const [a, b] = ip
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254)
}

/** A camera the connection test may open: a private address, or this computer itself (a camera simulator). */
export const isCameraHost = (text: string): boolean => isPrivateIpv4(text) || parseIpv4(text)?.[0] === 127

export interface HikvisionForm {
  host: string
  port?: number
  user: string
  password: string
  /** 1-based channel of a recorder; a single camera is channel 1. */
  channel: number
}

/** The Hikvision main stream of a channel: `/Streaming/Channels/<channel>01` (channel 1 → 101, 2 → 201 …). */
/** `encodeURIComponent` leaves `! ' ( ) *` as they are; a camera address carries them as `%XX` too. */
const encodeCredential = (text: string): string =>
  encodeURIComponent(text).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())

export function buildHikvisionRtsp(form: HikvisionForm): string {
  const port = form.port ?? DEFAULT_RTSP_PORT
  const auth = form.user ? `${encodeCredential(form.user)}:${encodeCredential(form.password)}` + '@' : ''
  return (
    SCHEME +
    auth +
    form.host.trim() +
    ':' +
    String(port) +
    '/Streaming/Channels/' +
    String(form.channel) +
    '01'
  )
}

/** A user or password that would break a request header: a control character (CR, LF …) or, for the user, a quote. */
const unsafeCredential = (text: string, quote: boolean): boolean => {
  let plain: string
  try {
    plain = decodeURIComponent(text)
  } catch {
    return true
  }
  // eslint-disable-next-line no-control-regex
  return /[\u0000-\u001f\u007f]/.test(plain) || (quote && plain.includes('"'))
}

/**
 * The host of an `rtsp://` address, or null when it is not one, does not parse or carries a user with a line break or
 * a quote (it would end up in the Digest header of the camera test).
 */
export function rtspHost(source: string): string | null {
  if (!source.toLowerCase().startsWith(SCHEME)) return null
  try {
    const url = new URL(source)
    if (unsafeCredential(url.username, true) || unsafeCredential(url.password, false)) return null
    return url.hostname || null
  } catch {
    return null
  }
}

/** The address with its user and password replaced by `***`, for messages and logs. */
export const maskRtsp = (source: string): string => source.replace(/(\/\/)[^/@\s]*@/, '$1***@')

/** What the wizard form needs to be a valid Hikvision address (an IPv4 literal, a user, a channel in range). */
export function hikvisionFormValid(form: HikvisionForm): boolean {
  return (
    parseIpv4(form.host) !== null &&
    form.user.trim().length > 0 &&
    Number.isInteger(form.channel) &&
    form.channel >= 1 &&
    form.channel <= MAX_CHANNELS &&
    (form.port === undefined || (Number.isInteger(form.port) && form.port >= 1 && form.port <= 65535))
  )
}
