// Handlers of procedures/external.ts (Faz 11): contract procedure → service call.
import type { externalProcedures } from '@shared/contract/procedures/external'
import type { Services } from '../../services'
import type { HandlersFor } from '../app'

export const externalHandlers = (services: Services): HandlersFor<keyof typeof externalProcedures> => ({
  'fx.overview': (ctx) => services.external.fxOverview(ctx),
  'fx.refresh': (ctx) => services.external.refreshFx(ctx),
  'fx.setHotelRate': (ctx, input) => {
    services.currency.setHotelRate(ctx, input)
    return { ok: true as const }
  },
  'fx.sources': (ctx) => services.external.fxSources(ctx),
  'fx.setApiKey': (ctx, input) => {
    services.external.setApiKey(ctx, input.provider, input.key)
    return { ok: true as const }
  },
  'weather.get': (ctx) => services.external.weather(ctx),
  'weather.refresh': (ctx) => services.external.refreshWeather(ctx),
  'holidays.check': (ctx, input) => services.external.checkHolidays(ctx, input.year),
  'holidays.lastChecks': (ctx) => services.external.lastHolidayChecks(ctx)
})
