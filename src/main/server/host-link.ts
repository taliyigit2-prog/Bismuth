// Client mode's link to the hotel's main computer (faz-13 madde 3, the live part): every call of a window goes to
// `<host>/api/<procedure>` over HTTP. The session and device cookies stay in this main process, one session per
// window, exactly as a desktop window's token does (the screens never see them). The main computer checks this
// computer like any other device (cookies, Origin, rate limits, the role's network rule).
// Version gate: the main computer's `remote.hello` (and the version header on every answer) must match this
// program; otherwise the link stops and the screens say which side to update (or open the main computer's own
// screens in the web browser). When the main computer cannot be reached the link says so, tries again every few
// seconds, and the screens show "no connection — changes cannot be saved" until it answers.
// Identity (K-45 (1), trust on first use): the main computer signs a fresh nonce with its key; this computer keeps
// the key it met first. Nothing (no password, no cookie, no copy grant) goes to an address until its answer was
// checked in this run; another key at the hotel's address stops the link ("identityChanged") until the person
// accepts it (a legitimate new main computer after a takeover) or it goes away (a stranger on the Wi-Fi).
import { randomBytes } from 'node:crypto'
import type { ClientStatus, Hello, LinkState } from '@shared/contract/remote'
import { helloSchema } from '@shared/contract/remote'
import { DEVICE_COOKIE, SESSION_COOKIE } from './cookies'
import { checkProof, fingerprintOf } from './host-identity'

type FetchLike = (input: string, init: RequestInit) => Promise<Response>

export interface HostLinkDeps {
  fetch?: FetchLike
  version: string
  schemaVersion: number
  /** This computer's name and system, as the main computer's device list shows them. */
  deviceName: string
  platform: string
  loadDevice(): string | null
  saveDevice(value: string | null): void
  /** The main computer's public key this computer met first (kept in connection.json); in memory when absent. */
  loadHostKey?(): string | null
  saveHostKey?(key: string | null): void
  clock?: () => Date
  /** One call may take this long before the main computer counts as unreachable (default 15 s). */
  timeoutMs?: number
  /** Retry interval while unreachable (default 5 s). */
  probeEveryMs?: number
  onStateChange?(state: LinkState): void
}

export interface LinkAnswer {
  status: number
  body: string
}

const unavailable = (messageKey: string): LinkAnswer => ({
  status: 503,
  body: JSON.stringify({ error: { code: 'UNAVAILABLE', messageKey } })
})

/** Name and value of one `Set-Cookie` header, and whether it deletes the cookie. */
function readSetCookie(header: string): { name: string; value: string; remove: boolean } | null {
  const [pair, ...attrs] = header.split(';')
  const eq = pair?.indexOf('=') ?? -1
  if (!pair || eq <= 0) return null
  const name = pair.slice(0, eq).trim()
  const value = pair.slice(eq + 1).trim()
  const remove = attrs.some((a) => /^\s*max-age\s*=\s*0\s*$/i.test(a)) || value === ''
  return { name, value, remove }
}

/** What `probe` learned: the main computer's hello and its checked public key. */
export interface ProbeResult extends Hello {
  key: string
}

export class LinkError extends Error {
  constructor(readonly reason: 'unreachable' | 'notBismuth' | 'identityChanged') {
    super(reason)
    this.name = 'LinkError'
  }
}

export function createHostLink(deps: HostLinkDeps) {
  const doFetch: FetchLike = deps.fetch ?? ((input, init) => fetch(input, init))
  const clock = deps.clock ?? (() => new Date())
  const timeoutMs = deps.timeoutMs ?? 15_000
  let memoryKey: string | null = null
  const loadKey = (): string | null => (deps.loadHostKey ? deps.loadHostKey() : memoryKey)
  const saveKey = (key: string | null): void => {
    if (deps.saveHostKey) deps.saveHostKey(key)
    else memoryKey = key
  }
  /** The address whose identity was checked in this run (nothing is sent anywhere else). */
  let verifiedFor: string | null = null
  /** When that check happened (ms). A host that went away and was replaced between two calls is caught by age. */
  let verifiedAt = 0
  const FRESH_MS = 3_000
  /** Another key answered at the saved address (state `identityChanged`). */
  let offeredKey: string | null = null
  let hostUrl: string | null = null
  let state: LinkState = 'none'
  let host: Hello | null = null
  let lastContactAt: string | null = null
  let everReached = false
  let probeTimer: ReturnType<typeof setInterval> | null = null
  const windowSessions = new Map<number, string>()

  const setState = (next: LinkState): void => {
    if (next === state) return
    state = next
    // Gone away: whoever answers next at this address is checked again.
    if (next === 'unreachable' || next === 'identityChanged') verifiedFor = null
    deps.onStateChange?.(next)
    if (next === 'unreachable') startProbing()
    else stopProbing()
  }

  function startProbing(): void {
    if (probeTimer || !hostUrl) return
    probeTimer = setInterval(() => void probe().catch(() => undefined), deps.probeEveryMs ?? 5_000)
    probeTimer.unref?.()
  }
  function stopProbing(): void {
    if (probeTimer) clearInterval(probeTimer)
    probeTimer = null
  }

  const compatible = (hello: Pick<Hello, 'version' | 'schemaVersion'>): boolean =>
    hello.version === deps.version && hello.schemaVersion === deps.schemaVersion

  const headers = (url: string, windowId: number | null): Record<string, string> => {
    const cookies: string[] = []
    const device = deps.loadDevice()
    if (device) cookies.push(`${DEVICE_COOKIE}=${device}`)
    const session = windowId === null ? undefined : windowSessions.get(windowId)
    if (session) cookies.push(`${SESSION_COOKIE}=${session}`)
    return {
      'content-type': 'application/json',
      // The main computer accepts calls only from its own origin: this computer speaks as its own page would.
      origin: new URL(url).origin,
      'x-bismuth-client': 'desktop',
      'x-bismuth-device-name': deps.deviceName,
      'x-bismuth-platform': deps.platform,
      ...(cookies.length ? { cookie: cookies.join('; ') } : {})
    }
  }

  function keepCookies(response: Response, windowId: number | null): void {
    const list =
      typeof response.headers.getSetCookie === 'function'
        ? response.headers.getSetCookie()
        : (response.headers.get('set-cookie') ?? '').split(/,(?=\s*\w+=)/).filter(Boolean)
    for (const header of list) {
      const cookie = readSetCookie(header)
      if (!cookie) continue
      if (cookie.name === DEVICE_COOKIE) deps.saveDevice(cookie.remove ? null : cookie.value)
      if (cookie.name === SESSION_COOKIE && windowId !== null) {
        if (cookie.remove) windowSessions.delete(windowId)
        else windowSessions.set(windowId, cookie.value)
      }
    }
  }

  async function post(url: string, path: string, body: string, windowId: number | null): Promise<Response> {
    return doFetch(`${url}${path}`, {
      method: 'POST',
      headers: headers(url, windowId),
      body,
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs)
    })
  }

  /**
   * Asks `url` (default: the saved address) who it is and checks its signature over a fresh nonce. Throws
   * `LinkError`: unreachable, notBismuth (also: no valid identity), identityChanged (the saved address answers with
   * another key than the one kept; nothing more is sent there).
   */
  async function probe(url: string | null = hostUrl): Promise<ProbeResult> {
    if (!url) throw new LinkError('unreachable')
    const nonce = randomBytes(18).toString('base64url')
    const body = JSON.stringify({ nonce })
    let response: Response
    try {
      response = await post(url, '/api/remote.hello', body, null).catch(
        // Asking who answers changes nothing: once more, in case a kept-open connection had just been closed by a
        // restarted main computer.
        () => post(url, '/api/remote.hello', body, null)
      )
    } catch {
      if (url === hostUrl) setState('unreachable')
      throw new LinkError('unreachable')
    }
    let parsed: ReturnType<typeof helloSchema.safeParse>
    try {
      parsed = helloSchema.safeParse(await response.json())
    } catch {
      throw new LinkError('notBismuth')
    }
    if (!response.ok || !parsed.success) throw new LinkError('notBismuth')
    const identity = parsed.data.identity
    if (!identity?.proof || !checkProof(identity.key, nonce, identity.proof))
      throw new LinkError('notBismuth')
    if (url === hostUrl) {
      const known = loadKey()
      if (known && known !== identity.key) {
        offeredKey = identity.key
        verifiedFor = null
        setState('identityChanged')
        throw new LinkError('identityChanged')
      }
      // The first meeting (or a computer set up before identities): keep it.
      if (!known) saveKey(identity.key)
      offeredKey = null
      verifiedFor = url
      verifiedAt = clock().getTime()
      host = parsed.data
      lastContactAt = clock().toISOString()
      everReached = true
      setState(compatible(parsed.data) ? 'connected' : 'incompatible')
    }
    return { ...parsed.data, key: identity.key }
  }

  /** The saved address was checked in this run, else it is checked now (null: calls may go there). */
  async function verified(strict: boolean): Promise<LinkAnswer | null> {
    if (!hostUrl) return unavailable('errors.noHost')
    // Another computer may have taken the address while no call was made (K-45 (1)): the check is repeated before
    // credentials go out (sign-in, unlock) and when the last one is older than a few seconds.
    if (verifiedFor === hostUrl && !strict && clock().getTime() - verifiedAt < FRESH_MS) return null
    verifiedFor = null
    try {
      await probe()
      return verifiedFor === hostUrl ? null : unavailable('errors.hostUnreachable')
    } catch (error) {
      const reason = error instanceof LinkError ? error.reason : 'unreachable'
      return unavailable(
        reason === 'identityChanged'
          ? 'errors.hostIdentityChanged'
          : reason === 'notBismuth'
            ? 'errors.notBismuth'
            : 'errors.hostUnreachable'
      )
    }
  }

  const knownFingerprint = (): string | null => {
    const key = loadKey()
    return key ? fingerprintOf(key) : null
  }

  return {
    /**
     * A new (or no) main computer: windows sign in again there. `known`: its answer was just checked (probe), and
     * its key becomes the one kept.
     */
    setHost(url: string | null, known?: ProbeResult): void {
      stopProbing()
      hostUrl = url
      host = known ?? null
      windowSessions.clear()
      state = 'none'
      verifiedFor = null
      offeredKey = null
      if (url && known) {
        saveKey(known.key)
        verifiedFor = url
        verifiedAt = clock().getTime()
        lastContactAt = clock().toISOString()
        everReached = true
        setState(compatible(known) ? 'connected' : 'incompatible')
      }
    },
    /**
     * The person accepts the other key that answers at the saved address (after a takeover). Kept only when it has
     * the fingerprint the person saw (N-7): a key offered after the screen was drawn is not accepted unseen.
     */
    async acceptOffered(fingerprint: string): Promise<boolean> {
      if (!offeredKey || fingerprintOf(offeredKey) !== fingerprint) return false
      saveKey(offeredKey)
      offeredKey = null
      state = 'none'
      await probe().catch(() => undefined)
      return true
    },
    /** The key kept for the main computer (its fingerprint is what people compare). */
    knownKey: (): string | null => loadKey(),
    /** The saved address, once its identity was checked in this run (the copy's feed goes nowhere else). */
    verifiedHostUrl: (): string | null => (verifiedFor !== null && verifiedFor === hostUrl ? hostUrl : null),
    probe,
    compatible,
    hostUrl: () => hostUrl,
    /** The main computer answered at least once since this program started. */
    everReached: () => everReached,
    usable: (): boolean => hostUrl !== null && state !== 'incompatible',

    /** One procedure call of a window. */
    async call(windowId: number, path: string, body: string): Promise<LinkAnswer> {
      if (!hostUrl) return unavailable('errors.noHost')
      if (state === 'incompatible') return unavailable('errors.hostVersion')
      // No password, cookie or record goes to an address whose identity was not checked (K-45 (1)).
      const refused = await verified(path.startsWith('/api/auth.'))
      if (refused) return refused
      // The check may have found another version.
      if ((state as LinkState) === 'incompatible') return unavailable('errors.hostVersion')
      let response: Response
      try {
        response = await post(hostUrl, path, body, windowId)
      } catch {
        setState('unreachable')
        return unavailable('errors.hostUnreachable')
      }
      keepCookies(response, windowId)
      lastContactAt = clock().toISOString()
      everReached = true
      // Updated while we were away: stop before a different contract writes anything.
      const version = response.headers.get('x-bismuth-version')
      const schema = response.headers.get('x-bismuth-schema')
      if (version !== null && (version !== deps.version || Number(schema) !== deps.schemaVersion)) {
        host = host ? { ...host, version, schemaVersion: Number(schema) || host.schemaVersion } : host
        setState('incompatible')
        return unavailable('errors.hostVersion')
      }
      setState('connected')
      return { status: response.status, body: await response.text() }
    },

    /** The window closed: its session on the main computer ends too. */
    async forget(windowId: number): Promise<void> {
      if (!windowSessions.has(windowId) || !hostUrl || state !== 'connected' || verifiedFor !== hostUrl) {
        windowSessions.delete(windowId)
        return
      }
      try {
        await post(hostUrl, '/api/auth.signOut', '{}', windowId)
      } catch {
        // The session expires on its own.
      }
      windowSessions.delete(windowId)
    },

    status(): ClientStatus {
      return {
        mode: 'client',
        hostUrl,
        state,
        host,
        mine: { version: deps.version, schemaVersion: deps.schemaVersion },
        lastContactAt,
        identity: {
          known: knownFingerprint(),
          offered: offeredKey ? fingerprintOf(offeredKey) : null
        }
      }
    },

    close(): void {
      stopProbing()
    }
  }
}
export type HostLink = ReturnType<typeof createHostLink>
