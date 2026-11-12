// Handlers of procedures/reports.ts (Faz 10): contract procedure → service call.
import type { reportsProcedures } from '@shared/contract/procedures/reports'
import type { Services } from '../../services'
import type { HandlersFor } from '../app'

export const reportsHandlers = (services: Services): HandlersFor<keyof typeof reportsProcedures> => ({
  'reports.context': (ctx) => services.reports.context(ctx),
  'reports.summary': (ctx, input) => services.reports.summary(ctx, input),
  'reports.monthly': (ctx, input) => services.reports.monthly(ctx, input),
  'reports.yearly': (ctx, input) => services.reports.yearly(ctx, input),
  'reports.occupancy': (ctx, input) => services.reports.occupancy(ctx, input),
  'reports.cash': (ctx, input) => services.reports.cash(ctx, input),
  'reports.expenses': (ctx, input) => services.reports.expenses(ctx, input),
  'reports.staff': (ctx, input) => services.reports.staff(ctx, input),
  'reports.monthEnd': (ctx, input) => services.reports.monthEnd(ctx, input),
  'reports.monthEndTicks': (ctx, input) => services.reports.monthEndTicks(ctx, input),
  'reports.setMonthEndTicks': (ctx, input) => services.reports.setMonthEndTicks(ctx, input),
  'reports.export': (ctx, input) => services.reports.export(ctx, input)
})
