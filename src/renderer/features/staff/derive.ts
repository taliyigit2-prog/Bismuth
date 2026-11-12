// Read model helpers of the Personel screen (G-80…G-88): what each employee does on a day (a leave record of that
// day, otherwise at work), the 14-day window, tenure and the salary table's totals. The pay maths is the service's
// (shared/domain/salary.ts); nothing here computes money except adding up a column.
import { addDays, type LocalDate } from '@shared/date'
import type { LeaveRowDto, SalaryPeriodDto } from '@shared/contract/procedures/staff'
import type { LEAVE_KINDS } from '@shared/contract/staff'

export type LeaveKind = (typeof LEAVE_KINDS)[number]
export type DayKind = 'work' | LeaveKind
export const DAY_KINDS = [
  'work',
  'rest_day',
  'annual',
  'sick',
  'unpaid',
  'holiday_worked'
] as const satisfies readonly DayKind[]

/** Kinds that mean "not at work today". */
export const OFF_KINDS: ReadonlySet<DayKind> = new Set(['rest_day', 'annual', 'sick', 'unpaid'])

/** employeeId → day → its leave record. */
export type LeaveIndex = Map<string, Map<string, LeaveRowDto>>

export function leaveIndex(rows: readonly LeaveRowDto[]): LeaveIndex {
  const out: LeaveIndex = new Map()
  for (const r of rows) {
    if (r.voidedAt) continue
    const days = out.get(r.employeeId) ?? new Map<string, LeaveRowDto>()
    days.set(r.date, r)
    out.set(r.employeeId, days)
  }
  return out
}

export const leaveOn = (index: LeaveIndex, employeeId: string, day: LocalDate): LeaveRowDto | undefined =>
  index.get(employeeId)?.get(day)

export const kindOn = (index: LeaveIndex, employeeId: string, day: LocalDate): DayKind =>
  leaveOn(index, employeeId, day)?.kind ?? 'work'

/** The schedule window: today and the next 13 days. */
export const windowDays = (today: LocalDate, length = 14): LocalDate[] =>
  Array.from({ length }, (_, i) => addDays(today, i))

/** Whole years and months since the start date (for "2 yıl 7 ay"). */
export function tenure(start: LocalDate, today: LocalDate): { years: number; months: number } {
  const total =
    (Number(today.slice(0, 4)) - Number(start.slice(0, 4))) * 12 +
    Number(today.slice(5, 7)) -
    Number(start.slice(5, 7)) -
    (Number(today.slice(8, 10)) < Number(start.slice(8, 10)) ? 1 : 0)
  const months = Math.max(0, total)
  return { years: Math.floor(months / 12), months: months % 12 }
}

export const SUM_KEYS = [
  'monthly',
  'salaryDue',
  'advances',
  'leavePayout',
  'overtimePay',
  'holidayPay',
  'commission',
  'bonus',
  'deductions',
  'unpaidDeduction',
  'net',
  'paid',
  'remaining'
] as const
export type SumKey = (typeof SUM_KEYS)[number]

/** Column totals of salary rows of one currency. */
export function totals(rows: readonly SalaryPeriodDto[]): Record<SumKey, number> {
  const out = Object.fromEntries(SUM_KEYS.map((k) => [k, 0])) as Record<SumKey, number>
  for (const r of rows) for (const k of SUM_KEYS) out[k] += r[k] ?? (k === 'salaryDue' ? r.monthly : 0)
  return out
}

/** Column totals per salary currency (B18: TRY and EUR salaries are never added together), currencies sorted. */
export function totalsByCurrency(
  rows: readonly SalaryPeriodDto[]
): { currency: string; sum: Record<SumKey, number> }[] {
  const currencies = [...new Set(rows.map((r) => r.currency))].sort()
  return currencies.map((currency) => ({
    currency,
    sum: totals(rows.filter((r) => r.currency === currency))
  }))
}

/** A joining or leaving month: fewer days employed than the month has. */
export const isPartial = (r: SalaryPeriodDto): boolean =>
  r.employedDays !== undefined && r.monthDays !== undefined && r.employedDays < r.monthDays
