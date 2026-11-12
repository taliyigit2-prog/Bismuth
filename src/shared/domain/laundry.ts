// Laundry (G-171, K-28, S-95; 03-mimari.md §4.7 laundry_*, §6.13).
// Outgoing (dirty) and incoming (clean slip) deliveries are recorded separately. The monthly settlement
// counts only incoming slips and prices them with the slip price or the price valid on the slip's date;
// the outstanding view is per item type out − in (FIFO) so long-open differences can be highlighted.
// The program only sums and multiplies; it never guesses a missing price (amount null instead).
import { diffDays, type LocalDate } from '../date'
import { add, money, multiplyRatio, subtract, type CurrencyCode, type Money } from '../money'
import { isInMonth } from './local-datetime'

export type LaundryDirection = 'out' | 'in'

export interface LaundryDeliveryItem {
  readonly itemTypeId: string
  readonly qty: number
  readonly stainedQty: number
  /** Unit price printed on the slip (minor units, settlement currency); overrides the price table. */
  readonly slipUnitPriceMinor?: number | null
}

export interface LaundryDelivery {
  readonly id: string
  readonly date: LocalDate
  readonly direction: LaundryDirection
  readonly contactId: string
  readonly items: readonly LaundryDeliveryItem[]
}

/** laundry_prices row: agreed unit price per laundry × item type from `validFrom` on (price rises = new row). */
export interface LaundryPrice {
  readonly contactId: string
  readonly itemTypeId: string
  readonly validFrom: LocalDate
  readonly unitPriceMinor: number
  readonly currency: CurrencyCode
}

const byId = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/** The price row valid on `date`: latest `validFrom` ≤ date; on a tie the row given later wins. */
export function priceOn(
  prices: readonly LaundryPrice[],
  contactId: string,
  itemTypeId: string,
  date: LocalDate
): LaundryPrice | null {
  let best: LaundryPrice | null = null
  for (const p of prices) {
    if (p.contactId !== contactId || p.itemTypeId !== itemTypeId || p.validFrom > date) continue
    if (best === null || p.validFrom >= best.validFrom) best = p
  }
  return best
}

/**
 * Amount of one slip line: slip unit price × qty if printed, else the valid table price × qty; null when
 * neither exists. `currency` is the currency slip prices are written in.
 */
export function laundryLineAmount(
  item: LaundryDeliveryItem,
  date: LocalDate,
  contactId: string,
  prices: readonly LaundryPrice[],
  currency: CurrencyCode | null
): Money | null {
  if (item.slipUnitPriceMinor !== undefined && item.slipUnitPriceMinor !== null) {
    if (currency === null) throw new RangeError('laundry: a slip price needs a settlement currency')
    return multiplyRatio(money(item.slipUnitPriceMinor, currency), item.qty)
  }
  const price = priceOn(prices, contactId, item.itemTypeId, date)
  return price === null ? null : multiplyRatio(money(price.unitPriceMinor, price.currency), item.qty)
}

export interface LaundrySettlementLine {
  readonly itemTypeId: string
  readonly qty: number
  readonly stainedQty: number
  /** null when some of this type's quantity has no price (see unpricedQty). */
  readonly amountMinor: number | null
  readonly unpricedQty: number
}

export interface LaundrySettlement {
  readonly contactId: string
  readonly year: number
  readonly month: number
  readonly currency: CurrencyCode | null
  readonly deliveryCount: number
  readonly lines: readonly LaundrySettlementLine[]
  readonly totalQty: number
  readonly totalStainedQty: number
  /** null when any line is unpriced: the bill cannot be checked until the price is entered. */
  readonly totalAmountMinor: number | null
  readonly unpricedQty: number
}

function latestPriceCurrency(prices: readonly LaundryPrice[], contactId: string): CurrencyCode | null {
  let best: LaundryPrice | null = null
  for (const p of prices)
    if (p.contactId === contactId && (best === null || p.validFrom >= best.validFrom)) best = p
  return best?.currency ?? null
}

/**
 * Monthly settlement of one laundry (§6.13): incoming (clean) slips dated in `month` of `year`, per item
 * type Σ qty, Σ stained and the amount. Settlement currency: `opts.currency` (the hotel's base currency,
 * also used for slip prices), else the currency of the laundry's latest price row.
 */
export function laundrySettlement(
  deliveries: readonly LaundryDelivery[],
  prices: readonly LaundryPrice[],
  contactId: string,
  year: number,
  month: number,
  opts: { readonly currency?: CurrencyCode } = {}
): LaundrySettlement {
  const currency = opts.currency ?? latestPriceCurrency(prices, contactId)
  const acc = new Map<string, { qty: number; stained: number; amount: Money | null; unpriced: number }>()
  let deliveryCount = 0
  for (const d of deliveries) {
    if (d.contactId !== contactId || d.direction !== 'in' || !isInMonth(d.date, year, month)) continue
    deliveryCount++
    for (const item of d.items) {
      const line = acc.get(item.itemTypeId) ?? { qty: 0, stained: 0, amount: null, unpriced: 0 }
      line.qty += item.qty
      line.stained += item.stainedQty
      const amount = laundryLineAmount(item, d.date, contactId, prices, currency)
      if (amount === null) line.unpriced += item.qty
      else line.amount = line.amount === null ? amount : add(line.amount, amount)
      acc.set(item.itemTypeId, line)
    }
  }

  // Adding each type's amount to a settlement-currency total throws on a price in another currency.
  const lines: LaundrySettlementLine[] = []
  let total: Money | null = currency === null ? null : money(0, currency)
  let unpricedQty = 0
  for (const [itemTypeId, l] of [...acc.entries()].sort(([a], [b]) => byId(a, b))) {
    if (total !== null && l.amount !== null) total = add(total, l.amount)
    unpricedQty += l.unpriced
    lines.push({
      itemTypeId,
      qty: l.qty,
      stainedQty: l.stained,
      amountMinor: l.unpriced > 0 ? null : (l.amount?.amountMinor ?? 0),
      unpricedQty: l.unpriced
    })
  }
  return {
    contactId,
    year,
    month,
    currency,
    deliveryCount,
    lines,
    totalQty: lines.reduce((s, l) => s + l.qty, 0),
    totalStainedQty: lines.reduce((s, l) => s + l.stainedQty, 0),
    totalAmountMinor: unpricedQty > 0 ? null : (total?.amountMinor ?? 0),
    unpricedQty
  }
}

export interface LaundryInvoiceCheck extends LaundrySettlement {
  readonly invoicedTotalMinor: number
  /** invoiced − computed: positive = the laundry billed more than the slips add up to. null if unpriced. */
  readonly differenceMinor: number | null
  readonly matches: boolean | null
}

/** Settlement compared with the laundry's invoice total (same currency); a non-zero difference is highlighted. */
export function withInvoice(settlement: LaundrySettlement, invoicedTotalMinor: number): LaundryInvoiceCheck {
  if (settlement.totalAmountMinor === null || settlement.currency === null) {
    return { ...settlement, invoicedTotalMinor, differenceMinor: null, matches: null }
  }
  const diff = subtract(
    money(invoicedTotalMinor, settlement.currency),
    money(settlement.totalAmountMinor, settlement.currency)
  ).amountMinor
  return { ...settlement, invoicedTotalMinor, differenceMinor: diff, matches: diff === 0 }
}

export interface LaundryOutstandingLine {
  readonly itemTypeId: string
  readonly openingQty: number
  readonly outQty: number
  readonly inQty: number
  /** opening + out − in: positive = still at the laundry / missing; negative = more came back than sent. */
  readonly pendingQty: number
  /** Part of pendingQty that is still the opening balance (older than any recorded delivery). */
  readonly openingPendingQty: number
  /** Date of the oldest outgoing delivery not yet covered by incoming pieces (FIFO); null if none. */
  readonly oldestOpenSince: LocalDate | null
  /** Days from oldestOpenSince to `until`. */
  readonly daysOpen: number | null
}

export interface LaundryOutstanding {
  readonly contactId: string
  readonly until: LocalDate
  readonly lines: readonly LaundryOutstandingLine[]
  readonly totalPendingQty: number
}

/**
 * Per item type out − in up to and including `until` (S-95), carried over from the opening balance
 * (pieces at the laundry before tracking started). Incoming pieces cover the opening balance first, then
 * outgoing deliveries oldest first, whatever day they come back.
 */
export function laundryOutstanding(
  deliveries: readonly LaundryDelivery[],
  contactId: string,
  until: LocalDate,
  opening: Readonly<Record<string, number>> = {}
): LaundryOutstanding {
  const outs = new Map<string, { date: LocalDate; qty: number }[]>()
  const ins = new Map<string, number>()
  const types = new Set(Object.keys(opening))
  const relevant = deliveries
    .filter((d) => d.contactId === contactId && d.date <= until)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  for (const d of relevant) {
    for (const item of d.items) {
      types.add(item.itemTypeId)
      if (d.direction === 'in') ins.set(item.itemTypeId, (ins.get(item.itemTypeId) ?? 0) + item.qty)
      else {
        const list = outs.get(item.itemTypeId) ?? []
        list.push({ date: d.date, qty: item.qty })
        outs.set(item.itemTypeId, list)
      }
    }
  }

  const lines = [...types].sort(byId).map((itemTypeId): LaundryOutstandingLine => {
    const openingQty = opening[itemTypeId] ?? 0
    const sent = outs.get(itemTypeId) ?? []
    const outQty = sent.reduce((s, o) => s + o.qty, 0)
    const inQty = ins.get(itemTypeId) ?? 0
    const pendingQty = openingQty + outQty - inQty
    // Incoming pieces left after the opening balance (a negative opening = extra pieces already back).
    let covered = inQty - openingQty
    const openingPendingQty = pendingQty > 0 ? Math.min(pendingQty, Math.max(0, -covered)) : 0
    let oldestOpenSince: LocalDate | null = null
    if (pendingQty > 0) {
      covered = Math.max(0, covered)
      for (const o of sent) {
        if (covered >= o.qty) {
          covered -= o.qty
          continue
        }
        oldestOpenSince = o.date
        break
      }
    }
    return {
      itemTypeId,
      openingQty,
      outQty,
      inQty,
      pendingQty,
      openingPendingQty,
      oldestOpenSince,
      daysOpen: oldestOpenSince === null ? null : diffDays(oldestOpenSince, until)
    }
  })

  return { contactId, until, lines, totalPendingQty: lines.reduce((s, l) => s + l.pendingQty, 0) }
}
