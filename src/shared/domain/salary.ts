// Monthly salary table (G-81, G-82, G-84…G-87, K-38; 03-mimari.md §6.6, pay_policies keys §4.6). Pure: no DB.
// The owner's Excel formula is kept: net = monthly − advances + unused-leave payout, extended with overtime,
// holiday work, commission, bonus and deductions. Every money component is ONE multiplyRatio call from its
// base amount (no intermediate rounding), so Excel-verified values hold to the kuruş (31.500; 2.328,33; 6.666,67).
// Policy rates are decimal strings ("1.5") turned into integer ratios: no floating point touches money.
import { add, money, multiplyRatio, subtract, type CurrencyCode, type Money } from '../money'
import { addDays, diffDays, localDate, type LocalDate } from '../date'

export type OvertimeMode = 'none' | 'hourly_fixed' | 'multiplier'
export type HolidayPayMode = 'hourly' | 'daily'
export type CommissionMode = 'none' | 'pct' | 'fixed'
export type LeaveKind = 'rest_day' | 'annual' | 'sick' | 'unpaid' | 'holiday_worked'
export type WorkKind = 'normal' | 'holiday' | 'rest_day'
export type StaffTxnKind =
  | 'advance'
  | 'salary_payment'
  | 'leave_payout'
  | 'overtime_payment'
  | 'commission_payment'
  | 'bonus'
  | 'deduction'

/** pay_policies (scope hotel, overridable per employee). Rates are decimal strings: "1.5", "2", "2.5". */
export interface PayPolicy {
  leaveDaysPerMonth: number
  unusedLeavePaid: boolean
  unusedLeaveMultiplier: string
  /** Daily wage = monthly ÷ 30 (Excel) or ÷ the month's day count. */
  dailyDivisor: number | 'days_in_month'
  /** Unused leave moves to the next month instead of being paid out. */
  leaveCarryOver: boolean
  /** Shown next to worked hours; not part of the pay formula (overtime hours are entered by Müdür, K-38). */
  standardHoursPerDay: number
  overtimeMode: OvertimeMode
  overtimeHourlyMinor?: number
  overtimeMultiplier: string
  hourlyDivisor: number
  holidayMultiplier: string
  holidayPayMode: HolidayPayMode
  commissionMode: CommissionMode
  /** Percent of the commission base, e.g. "2.5" = 2,5 %. */
  commissionPct?: string
  commissionFixedMinor?: number
}

/**
 * Safe fallback only (yasak 10, P7fix B29): the hotel's rules are `pay_policies` rows seeded at the first start
 * (src/main/db/seed/lists.ts PAY_POLICY_SEED) and changed in Personel; these values fill a key without a row.
 */
export const DEFAULT_PAY_POLICY: Readonly<PayPolicy> = Object.freeze({
  leaveDaysPerMonth: 4,
  unusedLeavePaid: true,
  unusedLeaveMultiplier: '1',
  dailyDivisor: 30,
  leaveCarryOver: false,
  standardHoursPerDay: 8,
  overtimeMode: 'none',
  overtimeMultiplier: '1.5',
  hourlyDivisor: 225,
  holidayMultiplier: '2',
  holidayPayMode: 'hourly',
  commissionMode: 'none'
})

export interface SalaryHistoryEntry {
  validFrom: LocalDate
  monthlyMinor: number
  currency: CurrencyCode
}

export interface LeaveEntry {
  date: LocalDate
  kind: LeaveKind
}

export interface WorkEntry {
  date: LocalDate
  kind: WorkKind
  minutesWorked: number
  overtimeMinutes: number
}

export interface StaffTxnEntry {
  kind: StaffTxnKind
  amountMinor: number
  currency: CurrencyCode
}

export interface SalaryPeriodInput {
  year: number
  /** 1–12 */
  month: number
  policy: PayPolicy
  salaryHistory: readonly SalaryHistoryEntry[]
  /** Leave and work records outside the month are ignored. */
  leave: readonly LeaveEntry[]
  work: readonly WorkEntry[]
  /** Staff transactions of this period (staff_transactions.period_year/period_month), any date. */
  txns: readonly StaffTxnEntry[]
  /** Work on these dates counts as holiday work even when the record's kind is 'normal'. */
  holidayDates?: readonly LocalDate[]
  /** Commission base for the month in the salary currency (room revenue, own sales or extras). */
  commissionBaseMinor?: number
  /** Unused leave days carried in from the previous month; only used when policy.leaveCarryOver. */
  carriedLeaveDays?: number
  /**
   * First and last (inclusive) day of employment. A month the person works only part of (joined or left in it)
   * pays salary ÷ daily divisor × days employed and a share of the leave days (rounded down); omitted = the
   * whole month (the Excel case).
   */
  employedFrom?: LocalDate
  employedUntil?: LocalDate | null
  /**
   * Every employment period (B6: left and hired again). Takes the place of employedFrom/employedUntil; the
   * months between two periods are not employed at all.
   */
  employment?: readonly EmploymentPeriod[]
}

/** One stretch of employment, inclusive; `until` null = still employed. */
export interface EmploymentPeriod {
  from: LocalDate
  until: LocalDate | null
}

/** One row of the monthly salary table; every amount is in minor units of `currency`. */
export interface SalaryPeriod {
  year: number
  month: number
  currency: CurrencyCode
  /** The monthly salary rate valid in the month. */
  monthly: number
  /** Days of the month the person was employed, and the month's day count. */
  employedDays: number
  monthDays: number
  /** Salary for the days employed: `monthly`, or monthly ÷ divisor × days in a joining/leaving month. */
  salaryDue: number
  /** Unpaid leave days of the month and what they take off the salary (daily wage each, at most salaryDue). */
  unpaidDays: number
  unpaidDeduction: number
  daily: number
  hourly: number
  leaveEntitled: number
  leaveCarriedIn: number
  leaveUsed: number
  leaveLeft: number
  leavePayout: number
  overtimeMinutes: number
  overtimePay: number
  holidayDays: number
  holidayMinutes: number
  holidayPay: number
  commission: number
  advances: number
  bonus: number
  deductions: number
  net: number
  paid: number
  remaining: number
}

const PAYMENT_KINDS: ReadonlySet<StaffTxnKind> = new Set([
  'salary_payment',
  'leave_payout',
  'overtime_payment',
  'commission_payment'
])

interface Ratio {
  num: bigint
  den: bigint
}

const DECIMAL = /^(\d+)(?:[.,](\d+))?$/

/** "1.5" → 15/10. Non-negative decimals only; "," is accepted as the decimal separator too. */
export function parseDecimalRatio(value: string): Ratio {
  const m = DECIMAL.exec(value.trim())
  if (!m) throw new RangeError(`salary: invalid decimal "${value}"`)
  const [, whole = '0', fraction = ''] = m
  return { num: BigInt(whole + fraction), den: 10n ** BigInt(fraction.length) }
}

const CLOCK = /^(\d{1,2}):(\d{2})$/

function clockMinutes(value: string): number {
  const m = CLOCK.exec(value.trim())
  const h = Number(m?.[1])
  const min = Number(m?.[2])
  if (!m || h > 23 || min > 59) throw new RangeError(`salary: invalid time "${value}"`)
  return h * 60 + min
}

/**
 * Minutes between an employee's start and end time ("HH:MM"). End before start = the shift crosses midnight
 * (+24 h). Equal times give 0 (a 24-hour shift is entered by correcting hours_worked).
 */
export function minutesWorked(start: string, end: string): number {
  const s = clockMinutes(start)
  const e = clockMinutes(end)
  return e >= s ? e - s : e + 24 * 60 - s
}

interface MonthBounds {
  first: LocalDate
  next: LocalDate
  days: number
}

function monthBounds(year: number, month: number): MonthBounds {
  if (!Number.isInteger(year) || year < 1000 || year > 9998)
    throw new RangeError(`salary: invalid year ${year}`)
  if (!Number.isInteger(month) || month < 1 || month > 12)
    throw new RangeError(`salary: invalid month ${month}`)
  const first = localDate(`${year}-${String(month).padStart(2, '0')}-01`)
  const next =
    month === 12
      ? localDate(`${year + 1}-01-01`)
      : localDate(`${year}-${String(month + 1).padStart(2, '0')}-01`)
  return { first, next, days: diffDays(first, next) }
}

/** The salary valid on a day: the latest entry with validFrom ≤ that day (later input wins ties). */
export function salaryOn(history: readonly SalaryHistoryEntry[], day: LocalDate): Money | null {
  let chosen: SalaryHistoryEntry | undefined
  for (const entry of history)
    if (entry.validFrom <= day && (!chosen || entry.validFrom >= chosen.validFrom)) chosen = entry
  return chosen ? money(chosen.monthlyMinor, chosen.currency) : null
}

/** The salary valid in a month: the one valid on the month's first day. */
export function salaryForMonth(
  history: readonly SalaryHistoryEntry[],
  year: number,
  month: number
): Money | null {
  return salaryOn(history, monthBounds(year, month).first)
}

/**
 * The days of a month someone employed from `from` to `until` (inclusive) works for the hotel: [start, end).
 * Null when the employment does not touch the month.
 */
export function employedRange(
  year: number,
  month: number,
  from?: LocalDate,
  until?: LocalDate | null
): { start: LocalDate; end: LocalDate; days: number; monthDays: number } | null {
  const bounds = monthBounds(year, month)
  const start = from && from > bounds.first ? from : bounds.first
  const after = until ? addDays(until, 1) : bounds.next
  const end = after < bounds.next ? after : bounds.next
  if (start >= end) return null
  return { start, end, days: diffDays(start, end), monthDays: bounds.days }
}

/**
 * The days of a month covered by any of the employment periods: first and last day touched, how many days.
 * Null when no period touches the month (the months between leaving and coming back).
 */
export function employedIn(
  year: number,
  month: number,
  periods: readonly EmploymentPeriod[]
): { start: LocalDate; end: LocalDate; days: number; monthDays: number } | null {
  const hits = periods.flatMap((p) => {
    const r = employedRange(year, month, p.from, p.until)
    return r ? [r] : []
  })
  const first = hits[0]
  if (!first) return null
  return hits.slice(1).reduce(
    (acc, r) => ({
      start: r.start < acc.start ? r.start : acc.start,
      end: r.end > acc.end ? r.end : acc.end,
      days: acc.days + r.days,
      monthDays: r.monthDays
    }),
    first
  )
}

/**
 * Overtime the day's worked minutes suggest: what is above the standard day (10 h worked, 8 h standard → 120).
 * Only a suggestion — overtime is entered (approved) by Müdür/Sahip (K-38, S-39).
 */
export function suggestedOvertimeMinutes(minutesWorked: number, standardHoursPerDay: number): number {
  return Math.max(0, minutesWorked - standardHoursPerDay * 60)
}

function nonNegativeInt(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new RangeError(`salary: ${name} must be a non-negative integer (${value})`)
  return value
}

function positiveInt(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new RangeError(`salary: ${name} must be a positive integer (${value})`)
  return value
}

function required<T>(value: T | undefined, name: string): T {
  if (value === undefined) throw new RangeError(`salary: policy.${name} is required for this mode`)
  return value
}

function sumTxns(txns: readonly StaffTxnEntry[], kinds: (k: StaffTxnKind) => boolean, zero: Money): Money {
  let total = zero
  for (const t of txns) {
    if (!kinds(t.kind)) continue
    if (t.currency !== zero.currency)
      throw new TypeError(`salary: ${t.kind} in ${t.currency}, salary is in ${zero.currency}`)
    total = add(total, money(t.amountMinor, t.currency))
  }
  return total
}

/** The month's salary table row for one employee (03-mimari.md §6.6). */
export function computeSalaryPeriod(input: SalaryPeriodInput): SalaryPeriod {
  const { year, month, policy } = input
  const bounds = monthBounds(year, month)
  const periods = input.employment ?? [
    { from: input.employedFrom ?? bounds.first, until: input.employedUntil ?? null }
  ]
  const employed = employedIn(year, month, periods)
  if (!employed) throw new RangeError(`salary: not employed in ${year}-${month}`)
  const monthly = salaryOn(input.salaryHistory, employed.start)
  if (!monthly) throw new RangeError(`salary: no salary valid on ${employed.start}`)
  const currency = monthly.currency
  const zero = money(0, currency)
  const inMonth = (d: LocalDate): boolean => d >= bounds.first && d < bounds.next
  const employedOn = (d: LocalDate): boolean =>
    inMonth(d) && periods.some((p) => d >= p.from && (p.until === null || d <= p.until))
  const partial = employed.days < bounds.days

  const dailyDivisor = positiveInt(
    policy.dailyDivisor === 'days_in_month' ? bounds.days : policy.dailyDivisor,
    'dailyDivisor'
  )
  // A joining or leaving month: the days employed at the daily wage, never more than the month's salary.
  let salaryDue = monthly
  if (partial) {
    const share = multiplyRatio(monthly, employed.days, dailyDivisor)
    if (share.amountMinor < monthly.amountMinor) salaryDue = share
  }
  // B3: an unpaid leave day costs a daily wage (same divisor as the leaving month); never more than the salary due.
  const unpaidDays = new Set(
    input.leave.filter((l) => l.kind === 'unpaid' && employedOn(l.date)).map((l) => l.date)
  ).size
  let unpaidDeduction = zero
  if (unpaidDays > 0) {
    unpaidDeduction = multiplyRatio(monthly, unpaidDays, dailyDivisor)
    if (unpaidDeduction.amountMinor > salaryDue.amountMinor) unpaidDeduction = salaryDue
  }
  const hourlyDivisor = positiveInt(policy.hourlyDivisor, 'hourlyDivisor')
  // Parse every rate up front so a bad policy fails the same way whatever the month's records are.
  const leaveMult = parseDecimalRatio(policy.unusedLeaveMultiplier)
  const overtimeMult = parseDecimalRatio(policy.overtimeMultiplier)
  const holidayMult = parseDecimalRatio(policy.holidayMultiplier)

  // Leave: entitled − rest days taken (+ carried days); never below zero, excess is not deducted.
  const fullEntitlement = nonNegativeInt(policy.leaveDaysPerMonth, 'leaveDaysPerMonth')
  const leaveEntitled = partial
    ? Math.floor((fullEntitlement * employed.days) / bounds.days)
    : fullEntitlement
  const leaveCarriedIn = policy.leaveCarryOver
    ? nonNegativeInt(input.carriedLeaveDays ?? 0, 'carriedLeaveDays')
    : 0
  const restDays = new Set(
    input.leave.filter((l) => l.kind === 'rest_day' && inMonth(l.date)).map((l) => l.date)
  )
  const leaveUsed = restDays.size
  const leaveLeft = Math.max(0, leaveEntitled + leaveCarriedIn - leaveUsed)
  let leavePayout = zero
  if (policy.unusedLeavePaid && !policy.leaveCarryOver && leaveLeft > 0) {
    leavePayout = multiplyRatio(
      monthly,
      BigInt(leaveLeft) * leaveMult.num,
      BigInt(dailyDivisor) * leaveMult.den
    )
  }

  // Overtime: hours are entered only by Müdür/Sahip (K-38); Pandora pays none.
  const work = input.work.filter((w) => inMonth(w.date))
  const overtimeMinutes = work.reduce(
    (acc, w) => acc + nonNegativeInt(w.overtimeMinutes, 'overtimeMinutes'),
    0
  )
  let overtimePay = zero
  if (policy.overtimeMode === 'multiplier' && overtimeMinutes > 0) {
    overtimePay = multiplyRatio(
      monthly,
      BigInt(overtimeMinutes) * overtimeMult.num,
      60n * BigInt(hourlyDivisor) * overtimeMult.den
    )
  } else if (policy.overtimeMode === 'hourly_fixed' && overtimeMinutes > 0) {
    const rate = money(
      nonNegativeInt(required(policy.overtimeHourlyMinor, 'overtimeHourlyMinor'), 'overtimeHourlyMinor'),
      currency
    )
    overtimePay = multiplyRatio(rate, overtimeMinutes, 60)
  }

  // Holiday work: the extra part above a normal day, (multiplier − 1) × hourly or daily wage.
  const holidaySet = new Set(input.holidayDates ?? [])
  const holidayWork = work.filter((w) => w.kind === 'holiday' || holidaySet.has(w.date))
  // B15: a "bayramda çalıştı" leave record without a work record of that day counts as a standard holiday day.
  const workedDates = new Set(holidayWork.map((w) => w.date))
  const leaveHolidays = new Set(
    input.leave
      .filter((l) => l.kind === 'holiday_worked' && inMonth(l.date) && !workedDates.has(l.date))
      .map((l) => l.date)
  )
  const standardMinutes = nonNegativeInt(policy.standardHoursPerDay * 60, 'standardHoursPerDay')
  const holidayMinutes =
    holidayWork.reduce((acc, w) => acc + nonNegativeInt(w.minutesWorked, 'minutesWorked'), 0) +
    leaveHolidays.size * standardMinutes
  const holidayDays = workedDates.size + leaveHolidays.size
  let holidayPay = zero
  const extra = holidayMult.num > holidayMult.den ? holidayMult.num - holidayMult.den : 0n
  if (extra > 0n) {
    holidayPay =
      policy.holidayPayMode === 'daily'
        ? multiplyRatio(monthly, BigInt(holidayDays) * extra, BigInt(dailyDivisor) * holidayMult.den)
        : multiplyRatio(
            monthly,
            BigInt(holidayMinutes) * extra,
            60n * BigInt(hourlyDivisor) * holidayMult.den
          )
  }

  let commission = zero
  if (policy.commissionMode === 'pct') {
    const pct = parseDecimalRatio(required(policy.commissionPct, 'commissionPct'))
    commission = multiplyRatio(money(input.commissionBaseMinor ?? 0, currency), pct.num, 100n * pct.den)
  } else if (policy.commissionMode === 'fixed') {
    commission = money(required(policy.commissionFixedMinor, 'commissionFixedMinor'), currency)
  }

  const advances = sumTxns(input.txns, (k) => k === 'advance', zero)
  const bonus = sumTxns(input.txns, (k) => k === 'bonus', zero)
  const deductions = sumTxns(input.txns, (k) => k === 'deduction', zero)
  const paid = sumTxns(input.txns, (k) => PAYMENT_KINDS.has(k), zero)

  // Excel: maaş (ay içinde başlayan/ayrılanda gün payı) − ücretsiz izin − avans + izin parası (+ mesai + bayram + prim + ikramiye − kesinti). May go negative.
  const net = [leavePayout, overtimePay, holidayPay, commission, bonus].reduce(
    (acc, m) => add(acc, m),
    subtract(subtract(subtract(salaryDue, unpaidDeduction), advances), deductions)
  )

  return {
    year,
    month,
    currency,
    monthly: monthly.amountMinor,
    employedDays: employed.days,
    monthDays: bounds.days,
    salaryDue: salaryDue.amountMinor,
    unpaidDays,
    unpaidDeduction: unpaidDeduction.amountMinor,
    daily: multiplyRatio(monthly, 1, dailyDivisor).amountMinor,
    hourly: multiplyRatio(monthly, 1, hourlyDivisor).amountMinor,
    leaveEntitled,
    leaveCarriedIn,
    leaveUsed,
    leaveLeft,
    leavePayout: leavePayout.amountMinor,
    overtimeMinutes,
    overtimePay: overtimePay.amountMinor,
    holidayDays,
    holidayMinutes,
    holidayPay: holidayPay.amountMinor,
    commission: commission.amountMinor,
    advances: advances.amountMinor,
    bonus: bonus.amountMinor,
    deductions: deductions.amountMinor,
    net: net.amountMinor,
    paid: paid.amountMinor,
    remaining: subtract(net, paid).amountMinor
  }
}
