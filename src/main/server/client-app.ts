// The window's router in client mode (faz-13 madde 3, CLAUDE.md yasak 13): no local database is opened. The client
// procedures (connection screen) are answered here; every other call goes to the hotel's main computer through the
// link, which keeps this window's session there. Until a main computer answers, the window is told "set up is
// needed in client mode" (it shows the connection screen) and gets the default look (last language and theme).
import { Hono } from 'hono'
import {
  SETTINGS_DEFAULTS,
  isProcedureName,
  type AuthState,
  type ErrorCode,
  type SettingsValues
} from '@shared/contract'
import {
  acceptHostIdentitySchema,
  connectInputSchema,
  hotelCodeInputSchema,
  hotelUpdateInputSchema,
  normalizeHostUrl,
  replicaFolderInputSchema,
  replicaKeyInputSchema,
  takeOverInputSchema,
  type FoundHost,
  type SavedHotel
} from '@shared/contract/remote'
import { levelAllows } from '@shared/permissions'
import type { ApiEnv } from '../api/app'
import type { SessionBinding } from '../api/session'
import type { ReplicaStore } from '../replica/store'
import { createPortfolioClient, type PortfolioCopy } from './portfolio-client'
import { AppError } from '../services/errors'
import { hostOf, type ConfigStore } from './connection-config'
import { fingerprintOf } from './host-identity'
import { LINK_FAILURE_KEY, LinkError, type HostLink, type LinkAnswer, type ProbeResult } from './host-link'
import type { ReplicaClient } from './replica-client'

/**
 * Status of an answer this computer gives itself (connection screen, the copy's own settings): 202, so the screens
 * learn nothing about the main computer from it (200 = it answered, 203 = the read-only copy answered).
 */
export const LOCAL_ANSWER = 202
const LOCAL = LOCAL_ANSWER

/** How long the first call after start waits for the main computer before the copy answers. */
const FIRST_CONTACT_MS = 4_000
/** Sign-in answers that carry the signed-in person (the copy grant is asked for after them). */
const SIGN_IN_ANSWERS = new Set(['auth.signIn', 'auth.signInWithPin', 'auth.unlock'])

/** A window in client mode: the main process gives each one its own session on the main computer. */
export interface ClientBinding extends SessionBinding {
  readonly windowId: number
}

export const isClientBinding = (b: SessionBinding | null | undefined): b is ClientBinding =>
  !!b && typeof (b as Partial<ClientBinding>).windowId === 'number'

/** A binding whose sign-in methods do nothing locally: the main computer keeps the session (cookies). */
export function clientBinding(windowId: number, device: SessionBinding['device']): ClientBinding {
  const none = (): void => undefined
  return {
    windowId,
    device,
    signedIn: none,
    signedOut: none,
    lock: none,
    unlock: none,
    unlockFailed: () => 0
  }
}

export interface ClientAppDeps {
  link: HostLink
  config: ConfigStore
  discover(): Promise<FoundHost[]>
  /** Opens the main computer's address in the system's web browser. */
  openExternal(url: string): void
  /** Back to keeping the data here: writes the file and starts the program again. */
  leaveClient(): void
  /**
   * The read-only copy (P13b): answers the windows while the main computer cannot be reached; absent → the
   * connection strip only, as before.
   */
  replica?: { client: ReplicaClient; store: Pick<ReplicaStore, 'call'> }
  /** P21b: another hotel is in use now (or none): the copy follows (its own folder). */
  onHotelChanged?(code: string | null): void
  /** P21b: a hotel left the list: its copy on this computer goes. */
  removeHotelData?(code: string): void
  /** P21c: a saved hotel's read-only copy opened for the portfolio (null: none with data on this computer). */
  portfolioCopy?(code: string): PortfolioCopy | null
  onError?(error: unknown, what: string): void
}

const json = (status: number, value: unknown): LinkAnswer => ({ status, body: JSON.stringify(value) })
const identityChanged = (known: string, offered: string): LinkAnswer =>
  json(409, {
    error: {
      code: 'CONFLICT',
      messageKey: 'errors.hostIdentityChanged',
      details: { known: fingerprintOf(known), offered: fingerprintOf(offered) }
    }
  })
const failure = (status: number, code: ErrorCode, messageKey: string): LinkAnswer =>
  json(status, { error: { code, messageKey } })
/** A failed first contact, with the reason (H-33): the screen says which one it was. */
const linkFailure = (reason: LinkError['reason']): LinkAnswer =>
  reason === 'notBismuth'
    ? failure(400, 'VALIDATION', LINK_FAILURE_KEY[reason])
    : failure(503, 'UNAVAILABLE', LINK_FAILURE_KEY[reason])

export function createClientApp(deps: ClientAppDeps): Hono<ApiEnv> {
  const { link, config } = deps

  /** Until a main computer answers, the window shows the connection screen. */
  const notConnectedState: AuthState = { setup: 'needed', mode: 'client', session: null }
  const localSettings = (): SettingsValues => ({
    ...SETTINGS_DEFAULTS,
    ...config.get().display,
    'app.mode': 'client'
  })

  const replica = deps.replica

  /** The saved hotels, last used first (the one in use shows the name its main computer announces when none was typed). */
  function hotelViews(): SavedHotel[] {
    const active = config.get().activeHotel ?? null
    const announced = link.status().host?.hotelName ?? ''
    return [...config.hotels()]
      .sort((a, b) => (b.lastUsedAt ?? '').localeCompare(a.lastUsedAt ?? ''))
      .map((h) => {
        const key = config.hotelKey(h.code)
        return {
          code: h.code,
          name: h.name || (h.code === active ? announced : '') || hostOf(h.url),
          url: h.url,
          fingerprint: key ? fingerprintOf(key) : null,
          lastUsedAt: h.lastUsedAt,
          active: h.code === active
        }
      })
  }

  /** The hotel in use changes: this computer's windows start over there (their sessions end in the link). */
  function useHotel(code: string | null): void {
    config.activate(code)
    link.setHost(code ? (config.get().hostUrl ?? null) : null)
    deps.onHotelChanged?.(code)
  }

  /** The copy answers (status 203 = "from the read-only copy"). */
  async function fromCopy(name: string, text: string): Promise<LinkAnswer | null> {
    const userId = replica?.client.userId()
    if (!replica || !userId || !replica.client.usable()) return null
    replica.client.served()
    return replica.store.call(name, text, userId)
  }

  /** The main computer is away (or speaks another version) and the copy can stand in. */
  const copyStandsIn = (): boolean => {
    if (!replica || !replica.client.usable() || !link.hostUrl()) return false
    const state = link.status().state
    return state === 'unreachable' || state === 'incompatible'
  }

  /**
   * A window's call: to the main computer; while it cannot be reached, from the read-only copy. Right after start
   * the copy answers when the main computer is slow to say anything (it keeps trying in the background).
   */
  async function forward(name: string, text: string, windowId: number): Promise<LinkAnswer> {
    if (copyStandsIn()) return (await fromCopy(name, text)) ?? link.call(windowId, `/api/${name}`, text)
    const live = link.call(windowId, `/api/${name}`, text)
    let answer: LinkAnswer | null
    if (!link.everReached() && replica?.client.usable()) {
      answer = await Promise.race([
        live,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), FIRST_CONTACT_MS).unref?.())
      ])
      if (answer === null) return (await fromCopy(name, text)) ?? live
    } else answer = await live
    if (answer.status === 503 && (link.status().state !== 'connected' || !link.everReached())) {
      const copy = await fromCopy(name, text)
      if (copy) return copy
    }
    return answer
  }

  /** P21c: the owner's portfolio of every saved hotel. */
  const portfolio = createPortfolioClient({
    hotels: hotelViews,
    live: (windowId, name, body) => link.call(windowId, `/api/${name}`, body),
    session: async (windowId) => {
      const answer = await forward('auth.state', '{}', windowId)
      if (answer.status !== 200 && answer.status !== 203) return null
      return (JSON.parse(answer.body) as AuthState).session
    },
    copy: (code) => deps.portfolioCopy?.(code) ?? null,
    ...(deps.onError ? { onError: deps.onError } : {})
  })

  /** A signed-in answer from the main computer: the copy grant is asked for once (when the role allows). */
  function afterSignedIn(windowId: number, session: unknown): void {
    if (!replica) return
    void replica.client.maybeGrant(
      () => link.call(windowId, '/api/remote.replicaGrant', '{}'),
      session as Parameters<ReplicaClient['maybeGrant']>[1]
    )
  }

  async function replicaCall(name: string, body: unknown): Promise<LinkAnswer | null> {
    if (!name.startsWith('remote.replica') && name !== 'remote.takeOver') return null
    if (!replica) return failure(409, 'CONFLICT', 'errors.notClientMode')
    const client = replica.client
    try {
      switch (name) {
        case 'remote.replicaStatus':
          return json(LOCAL, client.status())
        case 'remote.replicaSync':
          return json(LOCAL, client.syncNow())
        case 'remote.replicaSetKey': {
          const input = replicaKeyInputSchema.safeParse(body)
          if (!input.success) return failure(400, 'VALIDATION', 'errors.backupRecoveryText')
          return json(LOCAL, client.setKey(input.data.text, input.data.replace ?? false))
        }
        case 'remote.replicaSetFolder': {
          const input = replicaFolderInputSchema.safeParse(body)
          if (!input.success) return failure(400, 'VALIDATION', 'errors.replicaFolder')
          return json(LOCAL, client.setFolder(input.data.folder))
        }
        case 'remote.replicaPickFolder':
          return json(LOCAL, await client.pickFolder())
        case 'remote.takeOver': {
          const input = takeOverInputSchema.safeParse(body)
          if (!input.success) return failure(400, 'VALIDATION', 'errors.validation')
          await client.takeOver(input.data.password, input.data.force ?? false, input.data.keyText)
          return json(LOCAL, { ok: true })
        }
        default:
          return null
      }
    } catch (error) {
      if (error instanceof AppError) return failure(error.status, error.code, error.messageKey)
      throw error
    }
  }

  /**
   * Who may change the hotel list from this window (G-23, P21bfix). Before any sign-in (first set-up, choosing a
   * hotel on the connection screen) the screen is open: the list is only a convenience of this computer and every
   * real right is the hotel's own. A window signed in at its hotel needs `remote.settings` (edit) there, and is
   * not locked. When a session exists but the main computer cannot say who is signed in (error or any answer other
   * than 200/203), the change is refused (fail closed).
   */
  async function mayChangeHotels(windowId: number): Promise<boolean> {
    if (!link.hasSession(windowId)) return true
    let session: AuthState['session']
    try {
      const answer = await forward('auth.state', '{}', windowId)
      if (answer.status !== 200 && answer.status !== 203) return false
      session = (JSON.parse(answer.body) as AuthState).session
    } catch {
      return false
    }
    if (!session) return true
    return !session.locked && levelAllows(session.permissions['remote.settings'] ?? 'none', 'edit')
  }
  const denied = (): LinkAnswer => failure(403, 'PERMISSION_DENIED', 'errors.permissionDenied')

  async function local(name: string, body: unknown, windowId: number): Promise<LinkAnswer | null> {
    const copyAnswer = await replicaCall(name, body)
    if (copyAnswer) return copyAnswer
    switch (name) {
      case 'portfolio.overview':
        return portfolio.overview(windowId, body)
      case 'portfolio.grid':
        return portfolio.grid(windowId, body)
      case 'remote.clientStatus':
        return json(LOCAL, link.status())
      case 'remote.discover':
        return json(LOCAL, await deps.discover())
      case 'remote.connect': {
        if (!(await mayChangeHotels(windowId))) return denied()
        const parsed = connectInputSchema.safeParse(body)
        const url = parsed.success ? normalizeHostUrl(parsed.data.url) : null
        if (!url) return failure(400, 'VALIDATION', 'errors.hostAddress')
        // N-7: the fingerprint the person saw; only a key with exactly that fingerprint is accepted.
        const accept = parsed.success ? (parsed.data.acceptIdentity ?? null) : null
        // P21b: a saved hotel (by its address) has its own identity; the one in use is checked by the link itself.
        const saved = config.findByUrl(url)
        const inUse = saved !== undefined && saved.code === (config.get().activeHotel ?? null)
        try {
          let hello: ProbeResult
          try {
            hello = await link.probe(url)
          } catch (error) {
            // The saved address answers with another key: accepted only when the person said so, for that key.
            if (!(error instanceof LinkError && error.reason === 'identityChanged' && accept)) throw error
            if (!(await link.acceptOffered(accept))) throw error
            hello = await link.probe(url)
          }
          const known = inUse ? link.knownKey() : saved ? config.hotelKey(saved.code) : null
          // K-45 (1): another computer than the one met before answers. Not connected until the person accepts it.
          if (known && known !== hello.key && fingerprintOf(hello.key) !== accept)
            return identityChanged(known, hello.key)
          // The same main computer under a new address is the same hotel; else a new hotel joins the list.
          const same = saved ?? config.findByKey(hello.key)
          const code = same?.code ?? config.addHotel(hello.hotelName.trim() || hostOf(url), url)
          if (same && same.url !== url) config.updateHotel(same.code, { url })
          if (same && !same.name) config.updateHotel(same.code, { name: hello.hotelName.trim().slice(0, 80) })
          if (code === (config.get().activeHotel ?? null)) {
            config.update({ hostUrl: url })
            link.setHost(url, hello)
          } else {
            config.activate(code)
            link.setHost(url, hello)
            deps.onHotelChanged?.(code)
          }
          return json(LOCAL, link.status())
        } catch (error) {
          if (error instanceof LinkError && error.reason === 'identityChanged') {
            const { known, offered } = link.status().identity
            return json(409, {
              error: {
                code: 'CONFLICT',
                messageKey: 'errors.hostIdentityChanged',
                details: { known, offered }
              }
            })
          }
          return linkFailure(error instanceof LinkError ? error.reason : 'unreachable')
        }
      }
      case 'remote.hotels':
        return json(LOCAL, hotelViews())
      case 'remote.hotelUpdate': {
        if (!(await mayChangeHotels(windowId))) return denied()
        const parsed = hotelUpdateInputSchema.safeParse(body)
        if (!parsed.success) return failure(400, 'VALIDATION', 'errors.validation')
        const { code, name, url: typed } = parsed.data
        const entry = config.hotels().find((h) => h.code === code)
        if (!entry) return failure(404, 'NOT_FOUND', 'errors.notFound')
        let url: string | undefined
        if (typed !== undefined) {
          const normalized = normalizeHostUrl(typed)
          if (!normalized) return failure(400, 'VALIDATION', 'errors.hostAddress')
          if (normalized !== entry.url) {
            // The hotel in use keeps its address (the link and its checked identity stand on it).
            if (code === (config.get().activeHotel ?? null))
              return failure(409, 'CONFLICT', 'errors.hotelInUse')
            if (config.findByUrl(normalized)) return failure(409, 'CONFLICT', 'errors.hotelExists')
            url = normalized
          }
        }
        config.updateHotel(code, { ...(name !== undefined ? { name } : {}), ...(url ? { url } : {}) })
        return json(LOCAL, hotelViews())
      }
      case 'remote.hotelRemove': {
        if (!(await mayChangeHotels(windowId))) return denied()
        const parsed = hotelCodeInputSchema.safeParse(body)
        if (!parsed.success) return failure(400, 'VALIDATION', 'errors.validation')
        const { code } = parsed.data
        if (!config.hotels().some((h) => h.code === code)) return failure(404, 'NOT_FOUND', 'errors.notFound')
        if (code === (config.get().activeHotel ?? null)) useHotel(null)
        config.removeHotel(code)
        deps.removeHotelData?.(code)
        return json(LOCAL, hotelViews())
      }
      case 'remote.acceptHostIdentity': {
        if (!(await mayChangeHotels(windowId))) return denied()
        const parsed = acceptHostIdentitySchema.safeParse(body)
        if (!parsed.success) return failure(400, 'VALIDATION', 'errors.validation')
        // N-7: the key answering now must be the one the screen showed; otherwise show the new one first.
        if (!(await link.acceptOffered(parsed.data.fingerprint))) {
          const { known, offered } = link.status().identity
          return json(409, {
            error: { code: 'CONFLICT', messageKey: 'errors.hostIdentityChanged', details: { known, offered } }
          })
        }
        return json(LOCAL, link.status())
      }
      case 'remote.forgetHost':
        if (!(await mayChangeHotels(windowId))) return denied()
        // The hotel stays in the list; this computer uses none until one is chosen.
        useHotel(null)
        return json(LOCAL, link.status())
      case 'remote.leaveClient':
        if (!(await mayChangeHotels(windowId))) return denied()
        deps.leaveClient()
        return json(LOCAL, { ok: true })
      case 'remote.openInBrowser': {
        const url = link.hostUrl()
        if (!url) return failure(409, 'CONFLICT', 'errors.noHost')
        deps.openExternal(url)
        return json(LOCAL, { ok: true })
      }
      case 'auth.state': {
        if (!link.usable() && !copyStandsIn()) return json(LOCAL, notConnectedState)
        const answer = await forward('auth.state', '{}', windowId)
        // Not reached once since start: the connection screen, which says what is wrong and retries.
        if (answer.status === 503 && !link.everReached()) return json(LOCAL, notConnectedState)
        if (answer.status === 503 && !link.usable()) return json(LOCAL, notConnectedState)
        if (answer.status === 200) afterSignedIn(windowId, (JSON.parse(answer.body) as AuthState).session)
        return answer
      }
      case 'settings.get': {
        if (!link.usable() && !copyStandsIn()) return json(LOCAL, localSettings())
        const answer = await forward('settings.get', '{}', windowId)
        if (answer.status === 503) return json(LOCAL, localSettings())
        if (answer.status !== 200 && answer.status !== 203) return answer
        const values = JSON.parse(answer.body) as SettingsValues
        // The look follows the person here as well when the main computer is away.
        config.update({ display: { 'ui.language': values['ui.language'], 'ui.theme': values['ui.theme'] } })
        return json(answer.status, { ...values, 'app.mode': 'client' })
      }
      default:
        return null
    }
  }

  const app = new Hono<ApiEnv>()
  app.post('/api/:name', async (c) => {
    const name = c.req.param('name')
    const session = c.env?.session
    if (!isProcedureName(name) || !isClientBinding(session)) {
      const answer = failure(404, 'UNKNOWN_PROCEDURE', 'errors.unknownProcedure')
      return c.body(answer.body, 404, { 'content-type': 'application/json' })
    }
    const text = await c.req.text()
    let body: unknown = {}
    try {
      body = text ? JSON.parse(text) : {}
    } catch {
      body = null
    }
    const answer =
      (await local(name, body, session.windowId)) ?? (await forward(name, text, session.windowId))
    if (answer.status === 200 && SIGN_IN_ANSWERS.has(name))
      afterSignedIn(session.windowId, JSON.parse(answer.body))
    return c.body(answer.body, answer.status as 200, { 'content-type': 'application/json' })
  })
  app.notFound((c) => c.body(failure(404, 'UNKNOWN_PROCEDURE', 'errors.unknownProcedure').body, 404))
  return app
}
