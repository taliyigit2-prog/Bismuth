// Month-end check state (G-100, akislar.md §2): which steps are done. Card/IBAN, salaries and the ministry report
// tick themselves from the records; "ciro ve kâr" and "en çok harcama" are the owner's own "baktım" ticks, kept per
// person and month on the main computer (use-ticks.ts; K-46 (6)) — a reminder, not a record.
import { MONTH_END_MANUAL_STEPS, type MonthEnd } from '@shared/contract/procedures/reports'

export const STEPS = ['cards', 'salaries', 'results', 'top', 'tourism'] as const
export type Step = (typeof STEPS)[number]
export const MANUAL_STEPS: readonly Step[] = MONTH_END_MANUAL_STEPS

/** Steps the role sees: salaries need `staff.salary`, the ministry step `tourism_stats` (the service sends null). */
export function visibleSteps(m: MonthEnd): Step[] {
  return STEPS.filter((s) =>
    s === 'salaries' ? m.salaries !== null : s === 'tourism' ? m.tourism !== null : true
  )
}

type SalaryRow = NonNullable<MonthEnd['salaries']>['rows'][number]

/**
 * What is still to pay, per salary currency (TRY and EUR salaries are never added together): each employee's
 * remaining above zero — one overpaid employee does not cover another who got nothing.
 */
export function salaryLeftByCurrency(
  rows: readonly SalaryRow[]
): { currency: string; amountMinor: number }[] {
  const out = new Map<string, number>()
  for (const r of rows) if (r.remaining > 0) out.set(r.currency, (out.get(r.currency) ?? 0) + r.remaining)
  return [...out]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([currency, amountMinor]) => ({ currency, amountMinor }))
}

/** Steps the records already close. */
export function autoDone(m: MonthEnd): Partial<Record<Step, boolean>> {
  const pendingRows = m.methods.filter((x) => x.group !== 'cash').reduce((s, x) => s + x.pendingRows, 0)
  return {
    cards: pendingRows === 0,
    salaries: !!m.salaries && m.salaries.rows.length > 0 && m.salaries.rows.every((r) => r.remaining <= 0),
    tourism: !!m.tourism?.reportedAt
  }
}

/** "2026-09" → { year, month }. */
export const ym = (month: string): { year: number; month: number } => ({
  year: Number(month.slice(0, 4)),
  month: Number(month.slice(5, 7))
})
