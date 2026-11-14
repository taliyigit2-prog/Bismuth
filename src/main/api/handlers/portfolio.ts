// Handlers of procedures/portfolio.ts (P21c) on a computer that keeps its own data (alone or the hotel's main
// computer): only its own hotel, live. In client mode src/main/server/portfolio-client.ts answers the same names for
// every saved hotel, and asks the hotel in use through these handlers.
import type { portfolioProcedures } from '@shared/contract/procedures/portfolio'
import type { Services } from '../../services'
import { AppError } from '../../services/errors'
import { hotelFigures, requirePortfolio } from '../../services/portfolio-service'
import type { HandlersFor } from '../app'

export const portfolioHandlers = (services: Services): HandlersFor<keyof typeof portfolioProcedures> => ({
  'portfolio.overview': (ctx, input) => {
    requirePortfolio(ctx)
    return {
      mode: 'host' as const,
      hotels: [
        {
          code: null,
          name: services.settings.get(ctx)['hotel.name'],
          active: true,
          source: 'live' as const,
          syncedAt: null,
          state: 'ok' as const,
          figures: hotelFigures(services, ctx, input)
        }
      ]
    }
  },
  'portfolio.grid': (ctx, input) => {
    requirePortfolio(ctx)
    // A main computer holds its own hotel only; the other hotel is reached from the owner's own computer.
    if (input.hotel !== null) throw new AppError('NOT_FOUND', 'errors.notFound')
    return {
      source: 'live' as const,
      syncedAt: null,
      grid: services.calendar.grid(ctx, { from: input.from, to: input.to })
    }
  }
})
