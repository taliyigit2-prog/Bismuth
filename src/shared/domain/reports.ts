// Report figures (03-mimari.md §6.10, §6.12; G-100…G-102, G-190). Inputs are plain rows the services read;
// ratios are integer basis points, money stays in minor units (averages via money.ts).
import type { LocalDate } from '../date'
import { money, multiplyRatio, type CurrencyCode } from '../money'

/** Ratio as basis points (73,68 % → 7368), rounded half up; 0 when the denominator is 0. */
export function basisPoints(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0
  return Number((BigInt(numerator) * 20000n + BigInt(denominator)) / (2n * BigInt(denominator)))
}

export interface OccupancyInput {
  soldNights: number
  /** Room-nights that could be sold: rooms × days − out-of-order days (K-27 capacity history applied). */
  sellableNights: number
}

/**
 * Days off of the staff report (screen and file alike): rest, annual, sick and unpaid leave. A worked public
 * holiday (`holiday_worked`) is a working day paid extra, not a day off.
 */
export function staffLeaveDays(leave: Readonly<Partial<Record<string, number>>>): number {
  return Object.entries(leave).reduce((s, [k, n]) => s + (k === 'holiday_worked' ? 0 : (n ?? 0)), 0)
}

export const occupancyBasisPoints = (i: OccupancyInput): number => basisPoints(i.soldNights, i.sellableNights)

/** Average daily rate = room revenue ÷ sold nights. */
export function adrMinor(roomRevenueMinor: number, soldNights: number, currency: CurrencyCode): number {
  if (soldNights <= 0) return 0
  return multiplyRatio(money(roomRevenueMinor, currency), 1, soldNights).amountMinor
}

/** Revenue per available room-night = room revenue ÷ sellable nights. */
export function revparMinor(
  roomRevenueMinor: number,
  sellableNights: number,
  currency: CurrencyCode
): number {
  if (sellableNights <= 0) return 0
  return multiplyRatio(money(roomRevenueMinor, currency), 1, sellableNights).amountMinor
}

export interface ExpenseForTop {
  amountBaseMinor: number
  description: string
  descriptionKey: string
  kind: 'manual' | 'staff' | 'laundry'
  items?: readonly { productCategoryId: string; amountBaseMinor: number }[]
}

export type TopGroup =
  | { kind: 'staff'; totalMinor: number }
  | { kind: 'laundry'; totalMinor: number }
  | { kind: 'category'; categoryId: string; totalMinor: number }
  | { kind: 'description'; key: string; label: string; totalMinor: number }

/**
 * "En çok ne harcadım" (§6.10): staff items (salary, advance, leave pay…) as one group, laundry as one group,
 * product lines by product category, the rest by description key (label = first spelling seen). Sorted by amount.
 */
export function topExpenses(expenses: readonly ExpenseForTop[]): TopGroup[] {
  let staff = 0
  let laundry = 0
  const categories = new Map<string, number>()
  const descriptions = new Map<string, { label: string; total: number }>()
  const addDescription = (key: string, label: string, amount: number): void => {
    if (amount === 0) return
    const cur = descriptions.get(key) ?? { label, total: 0 }
    cur.total += amount
    descriptions.set(key, cur)
  }
  for (const e of expenses) {
    if (e.kind === 'staff') staff += e.amountBaseMinor
    else if (e.kind === 'laundry') laundry += e.amountBaseMinor
    else if (e.items?.length) {
      let itemsTotal = 0
      for (const it of e.items) {
        categories.set(it.productCategoryId, (categories.get(it.productCategoryId) ?? 0) + it.amountBaseMinor)
        itemsTotal += it.amountBaseMinor
      }
      addDescription(e.descriptionKey, e.description, e.amountBaseMinor - itemsTotal)
    } else addDescription(e.descriptionKey, e.description, e.amountBaseMinor)
  }
  const out: TopGroup[] = []
  if (staff) out.push({ kind: 'staff', totalMinor: staff })
  if (laundry) out.push({ kind: 'laundry', totalMinor: laundry })
  for (const [categoryId, totalMinor] of categories) out.push({ kind: 'category', categoryId, totalMinor })
  for (const [key, d] of descriptions)
    out.push({ kind: 'description', key, label: d.label, totalMinor: d.total })
  return out.sort((a, b) => b.totalMinor - a.totalMinor)
}

export interface HistoryStay {
  reservationId: string
  roomNumber: string
  checkIn: LocalDate
  checkOut: LocalDate
  status: string
  nights: readonly { date: LocalDate; priceMinor: number; currency: CurrencyCode }[]
  paidMinor: number
  currency: CurrencyCode
  methods: readonly string[]
  channel?: string | null
}

export interface GuestHistorySummary {
  stays: HistoryStay[]
  lastStayDate: LocalDate | null
  lastNightly: { amountMinor: number; currency: CurrencyCode } | null
  /** Average nightly price per currency (a guest may have paid in TRY and EUR). */
  averageNightly: Record<CurrencyCode, number>
  totalSpent: Record<CurrencyCode, number>
  totalNights: number
  /** Counted stays (`isCountedStay`). */
  stayCount: number
}

const NOT_A_STAY = new Set(['cancelled', 'parked', 'no_show'])

/**
 * §6.12 "sayılan konaklama": a stay that has begun by `today`. Parked, no-show, cancelled and future ones are
 * listed but not counted (last stay, last nightly price, averages, nights, "tekrar gelen").
 */
export const isCountedStay = (s: { status: string; checkIn: LocalDate }, today: LocalDate): boolean =>
  !NOT_A_STAY.has(s.status) && s.checkIn <= today

/**
 * §6.12 `guestHistory`: newest stay first; the summary over the counted stays (`isCountedStay`). Money paid
 * (`totalSpent`) is every reservation's but a cancelled one's: a deposit for a coming stay is money taken.
 */
export function guestHistorySummary(stays: readonly HistoryStay[], today: LocalDate): GuestHistorySummary {
  const sorted = [...stays].sort((a, b) => (a.checkIn < b.checkIn ? 1 : a.checkIn > b.checkIn ? -1 : 0))
  const counted = sorted.filter((s) => isCountedStay(s, today))
  const sums = new Map<CurrencyCode, { total: number; n: number }>()
  const totalSpent: Record<CurrencyCode, number> = {}
  for (const s of sorted)
    if (s.status !== 'cancelled') totalSpent[s.currency] = (totalSpent[s.currency] ?? 0) + s.paidMinor
  let totalNights = 0
  for (const s of counted) {
    for (const n of s.nights) {
      const cur = sums.get(n.currency) ?? { total: 0, n: 0 }
      cur.total += n.priceMinor
      cur.n += 1
      sums.set(n.currency, cur)
      totalNights += 1
    }
  }
  const averageNightly: Record<CurrencyCode, number> = {}
  for (const [c, v] of sums) averageNightly[c] = multiplyRatio(money(v.total, c), 1, v.n).amountMinor
  const last = counted[0]
  const lastNight = last ? [...last.nights].sort((a, b) => (a.date < b.date ? 1 : -1))[0] : undefined
  return {
    stays: sorted,
    lastStayDate: last?.checkIn ?? null,
    lastNightly: lastNight ? { amountMinor: lastNight.priceMinor, currency: lastNight.currency } : null,
    averageNightly,
    totalSpent,
    totalNights,
    stayCount: counted.length
  }
}
