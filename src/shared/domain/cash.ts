// Ledger ordering, drawer panel and revenue (03-mimari.md §4.5, §6.4, §6.10; G-62…G-64, 02-excel-analizi §1).
// "x" (collected_at) only says whether the owner has taken the money; it never changes revenue.
import type { CurrencyCode } from '../money'

export const METHOD_GROUPS = ['cash', 'bank', 'card', 'online', 'platform', 'account', 'other'] as const
export type MethodGroup = (typeof METHOD_GROUPS)[number]

/** The owner's day sort: cash → bank transfer (IBAN) → credit card, then the rest (02-excel-analizi §1.1). */
export const methodGroupRank = (g: MethodGroup): number => METHOD_GROUPS.indexOf(g)

export interface MoneyRowLike {
  amountMinor: number
  currency: CurrencyCode
  voided?: boolean
}

export interface PaymentRowLike extends MoneyRowLike {
  kind: 'payment' | 'deposit' | 'refund'
  methodGroup: MethodGroup
  isCash: boolean
  channelCode?: string | null
  /** Set when the owner "x"-ed (took) the money. */
  collected: boolean
  /** Amount in the hotel's base currency, frozen at write time (null when no rate was known). */
  amountBaseMinor?: number | null
}

export interface ExpenseRowLike extends MoneyRowLike {
  paidFromDrawer: boolean
  /** Set when the drawer expense was settled in a handover. */
  settled: boolean
  amountBaseMinor?: number | null
}

const signed = (p: PaymentRowLike): number => (p.kind === 'refund' ? -p.amountMinor : p.amountMinor)

type Matrix = Record<CurrencyCode, Partial<Record<MethodGroup, number>>>

export interface CashPanel {
  /** Not yet collected incoming money: currency × method group (the Excel "KASA DURUMU"). */
  pending: Matrix
  /** Cash that should physically be in the drawer: uncollected cash − unsettled drawer expenses. */
  drawer: Record<CurrencyCode, number>
  /** Channel totals of all (collected or not) payments, for the platform column. */
  channels: Record<string, Record<CurrencyCode, number>>
}

export function cashPanel(
  payments: readonly PaymentRowLike[],
  expenses: readonly ExpenseRowLike[]
): CashPanel {
  const pending: Matrix = {}
  const drawer: Record<CurrencyCode, number> = {}
  const channels: Record<string, Record<CurrencyCode, number>> = {}
  for (const p of payments) {
    if (p.voided) continue
    const amount = signed(p)
    if (p.channelCode) {
      const ch = (channels[p.channelCode] ??= {})
      ch[p.currency] = (ch[p.currency] ?? 0) + amount
    }
    if (p.collected) continue
    const row = (pending[p.currency] ??= {})
    row[p.methodGroup] = (row[p.methodGroup] ?? 0) + amount
    if (p.isCash) drawer[p.currency] = (drawer[p.currency] ?? 0) + amount
  }
  for (const e of expenses) {
    if (e.voided || !e.paidFromDrawer || e.settled) continue
    drawer[e.currency] = (drawer[e.currency] ?? 0) - e.amountMinor
  }
  return { pending, drawer, channels }
}

/** Revenue in the base currency: every non-voided payment (refunds negative), collected or not. */
export function revenueBase(payments: readonly PaymentRowLike[]): {
  totalMinor: number
  missingRate: number
} {
  let totalMinor = 0
  let missingRate = 0
  for (const p of payments) {
    if (p.voided) continue
    if (p.amountBaseMinor == null) {
      missingRate++
      continue
    }
    totalMinor += p.kind === 'refund' ? -p.amountBaseMinor : p.amountBaseMinor
  }
  return { totalMinor, missingRate }
}

/** Expenses in the base currency (voided excluded). */
export function expensesBase(expenses: readonly ExpenseRowLike[]): {
  totalMinor: number
  missingRate: number
} {
  let totalMinor = 0
  let missingRate = 0
  for (const e of expenses) {
    if (e.voided) continue
    if (e.amountBaseMinor == null) missingRate++
    else totalMinor += e.amountBaseMinor
  }
  return { totalMinor, missingRate }
}

/** Day rows in the owner's order: method group, then entry time. */
export function sortDayRows<T extends { methodGroup: MethodGroup; at: string }>(rows: readonly T[]): T[] {
  return [...rows].sort(
    (a, b) =>
      methodGroupRank(a.methodGroup) - methodGroupRank(b.methodGroup) ||
      (a.at < b.at ? -1 : a.at > b.at ? 1 : 0)
  )
}
