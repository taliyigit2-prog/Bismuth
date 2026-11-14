// Portföy ekranının saf kuralları: toplam yalnız aynı para biriminde olan oteller arasında alınır (kur çevirisi
// yok, K-54); farklı para birimi ayrı satırdır. Parasal toplama `src/shared/money.ts` ile yapılır.
import type { PortfolioFigures, PortfolioHotel } from '@shared/contract/procedures/portfolio'
import { money, sum } from '@shared/money'
import { occupancyBasisPoints } from '@shared/domain/reports'

export interface CurrencyTotal {
  currency: string
  /** How many hotels this line adds up. */
  hotels: number
  revenueMinor: number
  expensesMinor: number
  profitMinor: number
}

/** Hotels with figures, grouped by base currency, in the order the currencies first appear. */
export function totalsByCurrency(hotels: readonly PortfolioHotel[]): CurrencyTotal[] {
  const groups = new Map<string, PortfolioFigures[]>()
  for (const h of hotels) {
    if (!h.figures) continue
    groups.set(h.figures.baseCurrency, [...(groups.get(h.figures.baseCurrency) ?? []), h.figures])
  }
  return [...groups].map(([currency, list]) => {
    const total = (pick: (f: PortfolioFigures) => number): number =>
      sum(
        list.map((f) => money(pick(f), currency)),
        currency
      ).amountMinor
    return {
      currency,
      hotels: list.length,
      revenueMinor: total((f) => f.period.revenueMinor),
      expensesMinor: total((f) => f.period.expensesMinor),
      profitMinor: total((f) => f.period.profitMinor)
    }
  })
}

/** Tonight's occupancy of one hotel (basis points). */
export const tonightBasisPoints = (f: PortfolioFigures): number =>
  occupancyBasisPoints({ soldNights: f.soldTonight, sellableNights: f.sellableRooms })

/** The hotels whose calendar can be shown (their figures were read). */
export const readable = (hotels: readonly PortfolioHotel[]): PortfolioHotel[] =>
  hotels.filter((h) => h.state === 'ok')

/** Value of the calendar's hotel selector: a saved hotel's code, or `own` for the computer's own hotel. */
export const OWN = '_own'
export const hotelKey = (h: Pick<PortfolioHotel, 'code'>): string => h.code ?? OWN
export const hotelOfKey = (key: string): string | null => (key === OWN ? null : key)
