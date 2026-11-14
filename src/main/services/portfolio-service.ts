// P21c (K-54): one hotel's portfolio figures, built from the same services the screens use (Today, the cash panel and
// the reports), so the numbers are the ones those screens show. Works on any `Services` — the hotel's own, or the
// one over a read-only copy of another hotel on a client computer. No Electron; no money arithmetic of its own.
import type { PortfolioFigures } from '@shared/contract/procedures/portfolio'
import type { Ctx } from './context'
import { permissionDenied } from './errors'
import type { Services } from '.'

/**
 * The portfolio is the owner's view of every hotel: it needs the owner-only rights to the hotel's connection settings
 * and the money reports (G-23; a role the owner switched those on for sees it too, nobody else does).
 */
export function requirePortfolio(ctx: Ctx): void {
  if (!ctx.can('remote.settings', 'view') || !ctx.can('reports.finance', 'view')) throw permissionDenied()
}

type FiguresServices = Pick<Services, 'occupants' | 'ledger' | 'reports'>

/** Today's occupancy and drawer, and the income, expense and occupancy of [from, to). */
export function hotelFigures(
  services: FiguresServices,
  ctx: Ctx,
  period: { from: string; to: string }
): PortfolioFigures {
  requirePortfolio(ctx)
  const day = services.occupants.dayLists(ctx)
  const drawer = Object.entries(services.ledger.cashPanel(ctx).drawer)
    .filter(([, amount]) => amount !== 0)
    .map(([currency, amountMinor]) => ({ currency, amountMinor }))
  const summary = services.reports.summary(ctx, period)
  if (!summary.finance) throw permissionDenied()
  return {
    today: day.today,
    baseCurrency: summary.baseCurrency,
    sellableRooms: day.sellableRooms,
    soldTonight: day.soldTonight,
    drawer,
    period: {
      from: summary.from,
      to: summary.to,
      occupancyBp: summary.occupancy.occupancyBp,
      revenueMinor: summary.finance.revenueMinor,
      expensesMinor: summary.finance.expensesMinor,
      profitMinor: summary.finance.profitMinor,
      partial: summary.finance.partial
    }
  }
}
