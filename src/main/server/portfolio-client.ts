// The portfolio on a client computer (P21c, K-54): the owner's window asks `portfolio.*`; this computer answers for
// every saved hotel. The hotel in use is read live from its main computer (and from its read-only copy while that
// cannot be reached); every other hotel is read from its own read-only copy on this computer (`replica/<code>/`),
// as it was when it was last the hotel in use. Nothing is written, nothing is converted between currencies, and the
// copies are read through the same services as the screens, so the figures are the screens' figures.
// The permission is checked here from the window's session (and again by `hotelFigures`, G-23): the owner's rights
// at the hotel in use decide, because that is the person who is signed in.
import {
  portfolioGridInputSchema,
  portfolioHotelSchema,
  portfolioOverviewSchema,
  type PortfolioHotel
} from '@shared/contract/procedures/portfolio'
import { periodInputSchema } from '@shared/contract/procedures/reports'
import type { AuthState } from '@shared/contract/admin'
import type { SavedHotel } from '@shared/contract/remote'
import { ctxFromPermissions, readOnlyCtx, type Ctx } from '../services/context'
import { AppError } from '../services/errors'
import { hotelFigures, requirePortfolio } from '../services/portfolio-service'
import type { Services } from '../services'
import type { LinkAnswer } from './host-link'

/** 202: this computer answered itself (the screens learn nothing about the main computer from it; see client-app). */
const SELF = 202

/** A hotel's read-only copy on this computer, opened for reading. */
export interface PortfolioCopy {
  services: Pick<Services, 'occupants' | 'ledger' | 'reports' | 'calendar'>
  /** The hotel's data in the copy is up to this moment (ISO). */
  asOf: string | null
}

export interface PortfolioClientDeps {
  hotels(): SavedHotel[]
  /** One call of the window to the hotel in use (null when no main computer is set). */
  live(windowId: number, name: string, body: string): Promise<LinkAnswer>
  /** The window's signed-in person at the hotel in use (from the main computer, or the copy while it is away). */
  session(windowId: number): Promise<AuthState['session']>
  /** The copy of a saved hotel; null when this computer holds none (usable = it has data). */
  copy(code: string): PortfolioCopy | null
  onError?(error: unknown, what: string): void
}

const json = (status: number, value: unknown): LinkAnswer => ({ status, body: JSON.stringify(value) })
const failure = (status: number, code: string, messageKey: string): LinkAnswer =>
  json(status, { error: { code, messageKey } })

export function createPortfolioClient(deps: PortfolioClientDeps) {
  /** The caller as a read-only context, or the refusal to answer with. */
  async function caller(windowId: number): Promise<{ ctx: Ctx } | { refusal: LinkAnswer }> {
    const session = await deps.session(windowId)
    if (!session) return { refusal: failure(401, 'UNAUTHENTICATED', 'errors.unauthenticated') }
    if (session.locked) return { refusal: failure(401, 'UNAUTHENTICATED', 'errors.locked') }
    const ctx = readOnlyCtx(
      ctxFromPermissions(session.user.id, 'client', 'ipc', session.permissions),
      'replica'
    )
    try {
      requirePortfolio(ctx)
    } catch (error) {
      if (error instanceof AppError) return { refusal: failure(error.status, error.code, error.messageKey) }
      throw error
    }
    return { ctx }
  }

  /** What the live hotel's own computer answered, when it did. */
  async function liveJson<T>(windowId: number, name: string, body: unknown): Promise<T | null> {
    const answer = await deps.live(windowId, name, JSON.stringify(body))
    if (answer.status !== 200) return null
    try {
      return JSON.parse(answer.body) as T
    } catch {
      return null
    }
  }

  return {
    async overview(windowId: number, body: unknown): Promise<LinkAnswer> {
      const period = periodInputSchema.safeParse(body)
      if (!period.success) return failure(400, 'VALIDATION', 'errors.validation')
      const who = await caller(windowId)
      if ('refusal' in who) return who.refusal
      const hotels: PortfolioHotel[] = []
      for (const saved of deps.hotels()) {
        const base = { code: saved.code, name: saved.name, active: saved.active }
        if (saved.active) {
          const live = await liveJson<{ hotels?: unknown[] }>(windowId, 'portfolio.overview', period.data)
          const first = portfolioOverviewSchema.safeParse({ mode: 'host', hotels: live?.hotels ?? [] })
          const figures = first.success ? first.data.hotels[0]?.figures : null
          if (figures) {
            hotels.push({ ...base, source: 'live', syncedAt: null, state: 'ok', figures })
            continue
          }
        }
        const copy = deps.copy(saved.code)
        if (!copy) {
          hotels.push({ ...base, source: null, syncedAt: null, state: 'noCopy', figures: null })
          continue
        }
        try {
          hotels.push({
            ...base,
            source: 'copy',
            syncedAt: copy.asOf,
            state: 'ok',
            figures: hotelFigures(copy.services, who.ctx, period.data)
          })
        } catch (error) {
          deps.onError?.(error, `portfolio ${saved.code}`)
          hotels.push({ ...base, source: 'copy', syncedAt: copy.asOf, state: 'failed', figures: null })
        }
      }
      return json(SELF, portfolioOverviewSchema.parse({ mode: 'client', hotels: hotels.map(strip) }))
    },

    async grid(windowId: number, body: unknown): Promise<LinkAnswer> {
      const input = portfolioGridInputSchema.safeParse(body)
      if (!input.success) return failure(400, 'VALIDATION', 'errors.validation')
      const who = await caller(windowId)
      if ('refusal' in who) return who.refusal
      const saved = deps.hotels().find((h) => h.code === input.data.hotel)
      if (!saved) return failure(404, 'NOT_FOUND', 'errors.notFound')
      const { from, to } = input.data
      if (saved.active) {
        const live = await deps.live(windowId, 'portfolio.grid', JSON.stringify({ hotel: null, from, to }))
        if (live.status === 200) return { status: SELF, body: live.body }
      }
      const copy = deps.copy(saved.code)
      if (!copy) return failure(404, 'NOT_FOUND', 'errors.portfolioNoCopy')
      try {
        return json(SELF, {
          source: 'copy',
          syncedAt: copy.asOf,
          grid: copy.services.calendar.grid(who.ctx, { from, to })
        })
      } catch (error) {
        if (error instanceof AppError) return failure(error.status, error.code, error.messageKey)
        deps.onError?.(error, `portfolio grid ${saved.code}`)
        return failure(500, 'INTERNAL', 'errors.internal')
      }
    }
  }
}

/** Only what the contract names (a hotel entry parsed once more, so nothing extra leaves). */
const strip = (hotel: PortfolioHotel): PortfolioHotel => portfolioHotelSchema.parse(hotel)
export type PortfolioClient = ReturnType<typeof createPortfolioClient>
