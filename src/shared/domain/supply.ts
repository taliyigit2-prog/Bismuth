// Supplies (G-170, G-71, K-35; 03-mimari.md §4.5 expense_items, §4.7 products, §6.13).
// A purchase is an expense with product lines; there is no separate purchases table. Price history, the
// price-rise badge and monthly consumption are derived from those lines; lines of a voided expense drop out.
import { type LocalDate } from '../date'
import { add, money, multiplyRatio, subtract, type CurrencyCode, type Money } from '../money'
import { isInMonth } from './local-datetime'

/**
 * expense_items ⋈ expenses (date, currency, voided_at). `qty` is the integer quantity stored in
 * expense_items.qty, in the product's unit; this module only adds quantities up, so whatever fixed-point
 * scale the schema uses for kg/lt passes through unchanged. Amounts are minor units of `currency`.
 */
export interface PurchaseLine {
  readonly productId: string
  readonly date: LocalDate
  readonly qty: number
  readonly unitPriceMinor: number
  readonly amountMinor: number
  readonly currency: CurrencyCode
  readonly voided?: boolean
}

/** The product's non-voided purchase lines by date; same-day lines keep their input (insertion) order. */
export function priceHistory(lines: readonly PurchaseLine[], productId: string): PurchaseLine[] {
  return lines
    .filter((l) => l.productId === productId && l.voided !== true)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

export interface PriceChange {
  readonly productId: string
  readonly currency: CurrencyCode
  readonly lastDate: LocalDate
  readonly lastUnitMinor: number
  readonly previousDate: LocalDate
  readonly previousUnitMinor: number
  /** last − previous unit price. */
  readonly diffMinor: number
  /** Change in basis points (+12.5% = 1250), rounded half away from zero; null if the previous price was 0. */
  readonly basisPoints: number | null
  /** The "zam" badge: the last unit price is higher than the previous one. */
  readonly isIncrease: boolean
}

/**
 * Last purchase's unit price against the purchase before it in the same currency (§6.13 "zam uyarısı");
 * null with fewer than two such purchases.
 */
export function priceChange(lines: readonly PurchaseLine[], productId: string): PriceChange | null {
  const history = priceHistory(lines, productId)
  const last = history.at(-1)
  if (last === undefined) return null
  const previous = history.slice(0, -1).findLast((l) => l.currency === last.currency)
  if (previous === undefined) return null
  const diff = subtract(
    money(last.unitPriceMinor, last.currency),
    money(previous.unitPriceMinor, last.currency)
  )
  return {
    productId,
    currency: last.currency,
    lastDate: last.date,
    lastUnitMinor: last.unitPriceMinor,
    previousDate: previous.date,
    previousUnitMinor: previous.unitPriceMinor,
    diffMinor: diff.amountMinor,
    // diff × 10 000 ÷ previous through money.ts (exact integer division, the project's rounding).
    basisPoints:
      previous.unitPriceMinor > 0 ? multiplyRatio(diff, 10_000, previous.unitPriceMinor).amountMinor : null,
    isIncrease: diff.amountMinor > 0
  }
}

export interface MonthlyConsumption {
  readonly productId: string
  readonly year: number
  readonly month: number
  readonly purchaseCount: number
  /** Σ qty in the product's unit. */
  readonly qty: number
  /** Σ amount, one entry per currency (normally just the hotel's), sorted by currency code. */
  readonly totals: readonly Money[]
}

/** Σ qty and Σ amount of the product's non-voided purchases dated in `month` of `year`. */
export function monthlyConsumption(
  lines: readonly PurchaseLine[],
  productId: string,
  year: number,
  month: number
): MonthlyConsumption {
  const byCurrency = new Map<CurrencyCode, Money>()
  let qty = 0
  let purchaseCount = 0
  for (const l of priceHistory(lines, productId)) {
    if (!isInMonth(l.date, year, month)) continue
    purchaseCount++
    qty += l.qty
    const amount = money(l.amountMinor, l.currency)
    const current = byCurrency.get(l.currency)
    byCurrency.set(l.currency, current === undefined ? amount : add(current, amount))
  }
  const totals = [...byCurrency.values()].sort((a, b) => (a.currency < b.currency ? -1 : 1))
  return { productId, year, month, purchaseCount, qty, totals }
}
