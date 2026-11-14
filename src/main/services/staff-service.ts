// Staff: employee cards, salary history, pay rules, leave, work time, money given to staff and the monthly
// salary table (03-mimari.md §4.6, §6.6; G-80…G-88, K-38, S-34…S-39). The pay maths lives in
// shared/domain/salary.ts; this file loads rows, checks the split permissions (staff, staff.salary, staff.leave,
// staff.overtime, staff.policy, staff.own_hours) and writes with audit rows. Money paid out to staff is also an
// expense row (G-69, tek giriş); a locked month keeps its snapshot and refuses new records.
import { and, asc, desc, eq, gte, inArray, isNull, lt, lte } from 'drizzle-orm'
import {
  employeeCreateSchema,
  employeeUpdateSchema,
  leaveDaysInputSchema,
  leaveInputSchema,
  PAY_POLICY_KEYS,
  payPolicyPatchSchema,
  payPolicyShape,
  rehireSchema,
  salaryInputSchema,
  salaryPeriodQuerySchema,
  staffRangeSchema,
  staffTxnInputSchema,
  staffVoidSchema,
  workInputSchema,
  type CommissionBase,
  type EmployeeCreateInput,
  type EmployeeUpdateInput,
  type LeaveDaysInput,
  type LeaveInput,
  type PayPolicyKey,
  type PayPolicyPatchInput,
  type PayPolicyValues,
  type RehireInput,
  type SalaryInput,
  type SalaryPeriodQuery,
  type StaffRangeInput,
  type StaffTxnInput,
  type WorkInput
} from '@shared/contract/staff'
import { yearMonthSchema } from '@shared/contract/ledger'
import { addDays, localDate, localDateOf, type LocalDate } from '@shared/date'
import type { I18nText } from '../db/schema/columns'
import {
  computeSalaryPeriod,
  DEFAULT_PAY_POLICY,
  employedIn,
  type EmploymentPeriod,
  minutesWorked,
  salaryOn,
  suggestedOvertimeMinutes,
  type PayPolicy,
  type SalaryHistoryEntry,
  type SalaryPeriod,
  type StaffTxnKind
} from '@shared/domain/salary'
import type { Money } from '@shared/money'
import {
  employees,
  employeeSalaries,
  employmentPeriods,
  expenses,
  expenseSections,
  leaveRecords,
  payPolicies,
  roles,
  salaryPeriods,
  staffTransactions,
  users,
  workRecords
} from '../db/schema'
import { createCalendarService } from './calendar-service'
import type { Ctx } from './context'
import { baseCurrencyOf } from './currency-service'
import { permissionDenied } from './errors'
import { assertDayWritable, checkExpenseRefs, insertExpenseTx } from './expenses-service'
import {
  conflict,
  inTransaction,
  invalid,
  newId,
  notFound,
  parseInput,
  requirePermission,
  stamps,
  type ServiceDeps,
  type Tx
} from './kit'
import { revenueBase } from './revenue-base'
import { readSetting } from './settings-service'

export type EmployeeRow = typeof employees.$inferSelect
export type SalaryRow = typeof employeeSalaries.$inferSelect
export type LeaveRow = typeof leaveRecords.$inferSelect
export type WorkRow = typeof workRecords.$inferSelect
export type StaffTxnRow = typeof staffTransactions.$inferSelect
export type SalaryPeriodRow = typeof salaryPeriods.$inferSelect

export interface CurrentSalary {
  monthlyMinor: number
  currency: string
  validFrom: string
}

/** The user account linked to an employee card (G-25): who signs in, with which role. */
export interface EmployeeAccount {
  id: string
  displayName: string
  roleCode: string | null
  roleName: string
  roleNameI18n: I18nText | null
  active: boolean
  lastLoginAt: string | null
}

export interface EmployeeView extends EmployeeRow {
  fullName: string
  /** Every employment period, oldest first; the card's start/end dates are the last one (B6). */
  periods: { startDate: string; endDate: string | null }[]
  account: EmployeeAccount | null
  /** Salary valid today: only for callers with `staff.salary` view (otherwise left out). */
  currentSalary?: CurrentSalary | null
}

/** An active account not linked to any employee card yet (the "account" choice of the card). */
export interface LinkableUser {
  id: string
  displayName: string
  roleCode: string | null
  roleName: string
  roleNameI18n: I18nText | null
}

export interface WorkView extends WorkRow {
  /** Minutes above the employee's standard day; Müdür/Sahip approve it as overtime (K-38). */
  suggestedOvertimeMinutes: number
}

/** Pay rules in effect: defaults ← hotel rule ← the employee's override (S-34…S-38). */
export interface ResolvedPayPolicy extends PayPolicy {
  commissionBase: CommissionBase
}

export interface PayPolicyView {
  employeeId: string | null
  values: ResolvedPayPolicy
  /** Keys the hotel rule sets. */
  hotel: PayPolicyValues
  /** Keys this employee overrides (empty for the hotel view). */
  employee: PayPolicyValues
}

export interface SalaryPeriodView extends SalaryPeriod {
  employeeId: string
  fullName: string
  position: string | null
  /** The commission base of the month (percentage commission only; null otherwise): same figure as the report. */
  commissionBaseMinor: number | null
  locked: boolean
  lockedAt: string | null
  lockedBy: string | null
}

export interface SalaryTable {
  year: number
  month: number
  rows: SalaryPeriodView[]
  /** Employees of the month without a salary valid on its first day (mid-month starters, missing card data). */
  withoutSalary: string[]
}

/** Excel "PERSONEL DURUMU": advance · leave entitled · used · left for the month. */
export interface StaffPanelRow {
  employeeId: string
  fullName: string
  position: string | null
  /** Null without `staff.salary` view. */
  advancesMinor: number | null
  currency: string | null
  leaveEntitled: number
  leaveUsed: number
  leaveLeft: number
}

type Reader = Pick<Tx, 'select'>

/** Staff transactions that are money handed out: each one is also an expense row (G-69). */
const PAID_OUT: ReadonlySet<StaffTxnKind> = new Set([
  'advance',
  'salary_payment',
  'leave_payout',
  'overtime_payment',
  'commission_payment'
])

const DEFAULT_COMMISSION_BASE: CommissionBase = 'room_revenue_all'

const fullName = (e: Pick<EmployeeRow, 'firstName' | 'lastName'>): string => `${e.firstName} ${e.lastName}`

function monthBounds(year: number, month: number): { from: LocalDate; to: LocalDate } {
  const from = localDate(`${year}-${String(month).padStart(2, '0')}-01`)
  const to =
    month === 12
      ? localDate(`${year + 1}-01-01`)
      : localDate(`${year}-${String(month + 1).padStart(2, '0')}-01`)
  return { from, to }
}

const yearMonthOf = (date: string): { year: number; month: number } => ({
  year: Number(date.slice(0, 4)),
  month: Number(date.slice(5, 7))
})

function employeeOf(db: Reader, id: string): EmployeeRow {
  const row = db.select().from(employees).where(eq(employees.id, id)).get()
  if (!row) throw notFound('employee', id)
  return row
}

/** The employee card linked to the caller's user account (K-38 own hours), if any. */
function ownEmployee(db: Reader, ctx: Ctx): EmployeeRow | undefined {
  if (!ctx.userId) return undefined
  return db.select().from(employees).where(eq(employees.userId, ctx.userId)).get()
}

function salaryHistory(db: Reader, employeeId: string): SalaryHistoryEntry[] {
  return db
    .select()
    .from(employeeSalaries)
    .where(eq(employeeSalaries.employeeId, employeeId))
    .orderBy(asc(employeeSalaries.validFrom), asc(employeeSalaries.createdAt))
    .all()
    .map((s) => ({ validFrom: s.validFrom as LocalDate, monthlyMinor: s.monthlyMinor, currency: s.currency }))
}

/**
 * Every employment period of a card, oldest first (B6: left and hired again). A card without rows (written before
 * the periods existed and not migrated, e.g. a test fixture) has the one period of its own dates.
 */
function periodsOf(db: Reader, e: Pick<EmployeeRow, 'id' | 'startDate' | 'endDate'>): EmploymentPeriod[] {
  const rows = db
    .select()
    .from(employmentPeriods)
    .where(eq(employmentPeriods.employeeId, e.id))
    .orderBy(asc(employmentPeriods.startDate), asc(employmentPeriods.createdAt))
    .all()
  if (!rows.length) return [{ from: e.startDate as LocalDate, until: e.endDate as LocalDate | null }]
  return rows.map((r) => ({ from: r.startDate as LocalDate, until: r.endDate as LocalDate | null }))
}

/** The salary of an employee's month: the one valid on the first day employed in it (G-80 salary history). */
function salaryOfMonth(
  history: readonly SalaryHistoryEntry[],
  periods: readonly EmploymentPeriod[],
  year: number,
  month: number
): Money | null {
  const range = employedIn(year, month, periods)
  return range ? salaryOn(history, range.start) : null
}

/** Stored policy values of one scope; a JSON null row means "inherit" (the key was reset). */
function policyValues(db: Reader, employeeId: string | null): PayPolicyValues {
  const rows = db
    .select()
    .from(payPolicies)
    .where(
      employeeId === null
        ? and(eq(payPolicies.scope, 'hotel'), isNull(payPolicies.employeeId))
        : and(eq(payPolicies.scope, 'employee'), eq(payPolicies.employeeId, employeeId))
    )
    .all()
  const out: Record<string, unknown> = {}
  for (const row of rows) {
    if (!(PAY_POLICY_KEYS as readonly string[]).includes(row.key)) continue
    const parsed = payPolicyShape[row.key as PayPolicyKey].safeParse(JSON.parse(row.valueJson))
    if (parsed.success) out[row.key] = parsed.data
  }
  return out as PayPolicyValues
}

function resolvePolicy(db: Reader, employeeId: string | null): PayPolicyView {
  const hotel = policyValues(db, null)
  const employee = employeeId ? policyValues(db, employeeId) : {}
  const values = {
    ...DEFAULT_PAY_POLICY,
    commissionBase: DEFAULT_COMMISSION_BASE,
    ...hotel,
    ...employee
  } as ResolvedPayPolicy
  return { employeeId, values, hotel, employee }
}

/** Mode-dependent keys that must have a value (domain/salary.ts would refuse the month otherwise). */
function missingPolicyKeys(p: ResolvedPayPolicy): PayPolicyKey[] {
  const missing: PayPolicyKey[] = []
  if (p.overtimeMode === 'hourly_fixed' && p.overtimeHourlyMinor === undefined)
    missing.push('overtimeHourlyMinor')
  if (p.commissionMode === 'pct' && p.commissionPct === undefined) missing.push('commissionPct')
  if (p.commissionMode === 'fixed' && p.commissionFixedMinor === undefined)
    missing.push('commissionFixedMinor')
  return missing
}

function periodRow(db: Reader, employeeId: string, year: number, month: number): SalaryPeriodRow | undefined {
  return db
    .select()
    .from(salaryPeriods)
    .where(
      and(
        eq(salaryPeriods.employeeId, employeeId),
        eq(salaryPeriods.year, year),
        eq(salaryPeriods.month, month)
      )
    )
    .get()
}

/** Records of a locked salary month cannot change (the snapshot was paid out). */
function assertPeriodOpen(db: Reader, employeeId: string, year: number, month: number): void {
  if (periodRow(db, employeeId, year, month)?.lockedAt)
    throw conflict('errors.salaryPeriodLocked', { year, month })
}

/** Employed for at least one day of [from, to) in any period. */
const employedBetween = (periods: readonly EmploymentPeriod[], from: LocalDate, to: LocalDate): boolean =>
  periods.some((p) => p.from < to && (p.until === null || p.until >= from))

/** A day outside every employment period of the card cannot carry leave or hours. */
function assertEmployedOn(tx: Reader, e: EmployeeRow, date: LocalDate): void {
  if (!periodsOf(tx, e).some((p) => date >= p.from && (p.until === null || date <= p.until)))
    throw invalid('errors.notEmployedOn', { date })
}

type AuditFn = Parameters<Parameters<typeof inTransaction>[2]>[1]

/** Keeps the last employment period equal to the card's dates (a card without rows gets its first one). */
function syncLastPeriod(tx: Tx, audit: AuditFn, now: Date, e: EmployeeRow): void {
  const last = tx
    .select()
    .from(employmentPeriods)
    .where(eq(employmentPeriods.employeeId, e.id))
    .orderBy(desc(employmentPeriods.startDate), desc(employmentPeriods.createdAt))
    .get()
  if (!last) {
    const row = {
      id: newId(now),
      employeeId: e.id,
      startDate: e.startDate,
      endDate: e.endDate,
      ...stamps(now)
    }
    tx.insert(employmentPeriods).values(row).run()
    audit({ entity: 'employment_period', entityId: row.id, action: 'create', after: row })
    return
  }
  if (last.startDate === e.startDate && last.endDate === e.endDate) return
  tx.update(employmentPeriods)
    .set({ startDate: e.startDate, endDate: e.endDate, updatedAt: now.toISOString() })
    .where(eq(employmentPeriods.id, last.id))
    .run()
  audit({
    entity: 'employment_period',
    entityId: last.id,
    action: 'update',
    before: last,
    after: { ...last, startDate: e.startDate, endDate: e.endDate }
  })
}

export function createStaffService(deps: ServiceDeps) {
  const { db } = deps
  const calendar = createCalendarService(deps)

  const accountOf = (userId: string | null): EmployeeAccount | null => {
    if (!userId) return null
    const row = db
      .select({
        id: users.id,
        displayName: users.displayName,
        active: users.active,
        lastLoginAt: users.lastLoginAt,
        roleCode: roles.code,
        roleName: roles.name,
        roleNameI18n: roles.nameI18n
      })
      .from(users)
      .innerJoin(roles, eq(roles.id, users.roleId))
      .where(eq(users.id, userId))
      .get()
    return row ? { ...row, roleNameI18n: row.roleNameI18n ?? null } : null
  }

  const view = (ctx: Ctx, e: EmployeeRow): EmployeeView => {
    const out: EmployeeView = {
      ...e,
      fullName: fullName(e),
      account: accountOf(e.userId),
      periods: periodsOf(db, e).map((p) => ({ startDate: p.from, endDate: p.until }))
    }
    if (ctx.can('staff.salary', 'view')) {
      const today = localDateOf(deps.clock())
      const current = db
        .select()
        .from(employeeSalaries)
        .where(and(eq(employeeSalaries.employeeId, e.id), lte(employeeSalaries.validFrom, today)))
        .all()
        .sort((a, b) =>
          a.validFrom !== b.validFrom
            ? a.validFrom < b.validFrom
              ? 1
              : -1
            : a.createdAt < b.createdAt
              ? 1
              : -1
        )[0]
      out.currentSalary = current
        ? { monthlyMinor: current.monthlyMinor, currency: current.currency, validFrom: current.validFrom }
        : null
    }
    return out
  }

  /** One user account belongs to at most one employee card. */
  const assertUserFree = (tx: Reader, userId: string | null | undefined, exceptId?: string): void => {
    if (!userId) return
    const other = tx.select().from(employees).where(eq(employees.userId, userId)).get()
    if (other && other.id !== exceptId) throw conflict('errors.userHasEmployee', { employeeId: other.id })
  }

  /** Unused rest days carried into `year-month` when the policy carries leave over (S-37: Pandora does not). */
  const carriedLeave = (e: EmployeeRow, policy: ResolvedPayPolicy, year: number, month: number): number => {
    const target = monthBounds(year, month).from
    let y = Number(e.startDate.slice(0, 4))
    let m = Number(e.startDate.slice(5, 7))
    let carried = 0
    // Start after the latest locked month before the target (its snapshot knows what was left).
    const locked = db
      .select()
      .from(salaryPeriods)
      .where(and(eq(salaryPeriods.employeeId, e.id)))
      .all()
      .filter((p) => p.lockedAt && monthBounds(p.year, p.month).from < target)
      .sort((a, b) => a.year - b.year || a.month - b.month)
      .at(-1)
    if (locked) {
      carried = Number((locked.snapshot as Partial<SalaryPeriod>).leaveLeft ?? 0)
      y = locked.month === 12 ? locked.year + 1 : locked.year
      m = locked.month === 12 ? 1 : locked.month + 1
    }
    const rest = db
      .select({ date: leaveRecords.date })
      .from(leaveRecords)
      .where(
        and(
          eq(leaveRecords.employeeId, e.id),
          eq(leaveRecords.kind, 'rest_day'),
          isNull(leaveRecords.voidedAt),
          lt(leaveRecords.date, target)
        )
      )
      .all()
    for (let guard = 0; guard < 600; guard++) {
      const { from, to } = monthBounds(y, m)
      if (from >= target) break
      const used = new Set(rest.filter((r) => r.date >= from && r.date < to).map((r) => r.date)).size
      carried = Math.max(0, policy.leaveDaysPerMonth + carried - used)
      if (m === 12) {
        y++
        m = 1
      } else m++
    }
    return carried
  }

  /** The month's salary row computed from today's records (not locked), with its commission base. */
  const compute = (
    ctx: Ctx,
    e: EmployeeRow,
    year: number,
    month: number
  ): SalaryPeriod & { commissionBaseMinor: number | null } => {
    const { from, to } = monthBounds(year, month)
    const policy = resolvePolicy(db, e.id).values
    const history = salaryHistory(db, e.id)
    const employment = periodsOf(db, e)
    const monthly = salaryOfMonth(history, employment, year, month)
    if (!monthly) throw invalid('errors.noSalary', { employeeId: e.id, year, month })
    const base =
      policy.commissionMode === 'pct'
        ? revenueBase(db, {
            base: policy.commissionBase,
            from,
            to,
            currency: monthly.currency,
            userId: e.userId
          })
        : null
    const leave = db
      .select()
      .from(leaveRecords)
      .where(
        and(
          eq(leaveRecords.employeeId, e.id),
          isNull(leaveRecords.voidedAt),
          gte(leaveRecords.date, from),
          lt(leaveRecords.date, to)
        )
      )
      .all()
      .map((l) => ({ date: l.date as LocalDate, kind: l.kind }))
    const work = db
      .select()
      .from(workRecords)
      .where(and(eq(workRecords.employeeId, e.id), gte(workRecords.date, from), lt(workRecords.date, to)))
      .all()
      .map((w) => ({
        date: w.date as LocalDate,
        kind: w.kind,
        minutesWorked: w.minutesWorked,
        overtimeMinutes: w.overtimeMinutes
      }))
    const txns = db
      .select()
      .from(staffTransactions)
      .where(
        and(
          eq(staffTransactions.employeeId, e.id),
          eq(staffTransactions.periodYear, year),
          eq(staffTransactions.periodMonth, month),
          isNull(staffTransactions.voidedAt)
        )
      )
      .all()
      .map((t) => ({ kind: t.kind, amountMinor: t.amountMinor, currency: t.currency }))
    const period = computeSalaryPeriod({
      year,
      month,
      policy,
      salaryHistory: history,
      leave,
      work,
      txns,
      holidayDates: calendar.holidayDatesBetween(ctx, from, to),
      commissionBaseMinor: base ?? undefined,
      carriedLeaveDays: policy.leaveCarryOver ? carriedLeave(e, policy, year, month) : undefined,
      employment
    })
    return { ...period, commissionBaseMinor: base }
  }

  const periodView = (ctx: Ctx, e: EmployeeRow, year: number, month: number): SalaryPeriodView => {
    const row = periodRow(db, e.id, year, month)
    const base = { employeeId: e.id, fullName: fullName(e), position: e.position }
    if (row?.lockedAt)
      return {
        commissionBaseMinor: null,
        ...(row.snapshot as unknown as SalaryPeriod & { commissionBaseMinor?: number | null }),
        ...base,
        locked: true,
        lockedAt: row.lockedAt,
        lockedBy: row.lockedBy
      }
    return { ...compute(ctx, e, year, month), ...base, locked: false, lockedAt: null, lockedBy: null }
  }

  /** Expense section of staff money (setting `staff.expenseSection`, falls back to Genel). */
  const staffSection = (tx: Reader) => {
    const code = readSetting(tx, 'staff.expenseSection')
    const section =
      tx.select().from(expenseSections).where(eq(expenseSections.code, code)).get() ??
      tx.select().from(expenseSections).where(eq(expenseSections.code, 'general')).get()
    if (!section) throw notFound('expense_section', code)
    return section
  }

  return {
    // ---- employee cards (staff) ----

    listEmployees(ctx: Ctx, opts: { includeInactive?: boolean } = {}): EmployeeView[] {
      requirePermission(ctx, 'staff', 'view')
      const q = db.select().from(employees)
      return (opts.includeInactive ? q : q.where(eq(employees.active, true)))
        .all()
        .sort(
          (a, b) => a.firstName.localeCompare(b.firstName, 'tr') || a.lastName.localeCompare(b.lastName, 'tr')
        )
        .map((e) => view(ctx, e))
    },

    getEmployee(ctx: Ctx, id: string): EmployeeView {
      const own = ownEmployee(db, ctx)
      if (own?.id !== id) requirePermission(ctx, 'staff', 'view')
      return view(ctx, employeeOf(db, id))
    },

    /** Active accounts without an employee card: what a card can be linked to (G-25). */
    linkableUsers(ctx: Ctx): LinkableUser[] {
      requirePermission(ctx, 'staff', 'edit')
      const linked = new Set(
        db
          .select({ userId: employees.userId })
          .from(employees)
          .all()
          .map((e) => e.userId)
          .filter((id): id is string => Boolean(id))
      )
      return db
        .select({
          id: users.id,
          displayName: users.displayName,
          active: users.active,
          roleCode: roles.code,
          roleName: roles.name,
          roleNameI18n: roles.nameI18n
        })
        .from(users)
        .innerJoin(roles, eq(roles.id, users.roleId))
        .all()
        .filter((u) => u.active && !linked.has(u.id))
        .sort((a, b) => a.displayName.localeCompare(b.displayName, 'tr'))
        .map((u) => ({
          id: u.id,
          displayName: u.displayName,
          roleCode: u.roleCode,
          roleName: u.roleName,
          roleNameI18n: u.roleNameI18n ?? null
        }))
    },

    /** The caller's own card (own hours, K-38); null when the account has none. */
    myEmployee(ctx: Ctx): EmployeeView | null {
      requirePermission(ctx, 'staff.own_hours', 'view')
      const own = ownEmployee(db, ctx)
      return own ? view(ctx, own) : null
    },

    createEmployee(ctx: Ctx, input: EmployeeCreateInput): EmployeeView {
      requirePermission(ctx, 'staff', 'edit')
      const data = parseInput(employeeCreateSchema, input)
      if (data.salary) requirePermission(ctx, 'staff.salary', 'edit')
      const created = inTransaction(deps, ctx, (tx, audit, now) => {
        assertUserFree(tx, data.userId)
        const row: EmployeeRow = {
          id: newId(now),
          firstName: data.firstName,
          lastName: data.lastName,
          position: data.position ?? null,
          phone: data.phone ?? null,
          startDate: data.startDate,
          endDate: data.endDate ?? null,
          active: true,
          notes: data.notes ?? null,
          userId: data.userId ?? null,
          ...stamps(now)
        }
        tx.insert(employees).values(row).run()
        audit({ entity: 'employee', entityId: row.id, action: 'create', after: row })
        const period = {
          id: newId(now),
          employeeId: row.id,
          startDate: row.startDate,
          endDate: row.endDate,
          ...stamps(now)
        }
        tx.insert(employmentPeriods).values(period).run()
        audit({ entity: 'employment_period', entityId: period.id, action: 'create', after: period })
        if (data.salary) {
          const salary = {
            id: newId(now),
            employeeId: row.id,
            validFrom: data.salary.validFrom ?? data.startDate,
            monthlyMinor: data.salary.monthlyMinor,
            currency: data.salary.currency,
            createdBy: ctx.userId,
            ...stamps(now)
          }
          tx.insert(employeeSalaries).values(salary).run()
          audit({ entity: 'employee_salary', entityId: salary.id, action: 'create', after: salary })
        }
        return row
      })
      return view(ctx, created)
    },

    updateEmployee(ctx: Ctx, id: string, patch: EmployeeUpdateInput): EmployeeView {
      requirePermission(ctx, 'staff', 'edit')
      const data = parseInput(employeeUpdateSchema, patch)
      const after = inTransaction(deps, ctx, (tx, audit, now) => {
        const before = employeeOf(tx, id)
        if (data.userId !== undefined) assertUserFree(tx, data.userId, id)
        const start = data.startDate ?? before.startDate
        const end = data.endDate === undefined ? before.endDate : data.endDate
        if (end && end < start)
          throw invalid('errors.validation', { fields: { endDate: ['end before start'] } })
        tx.update(employees)
          .set({ ...data, updatedAt: now.toISOString() })
          .where(eq(employees.id, id))
          .run()
        const row = employeeOf(tx, id)
        audit({ entity: 'employee', entityId: id, action: 'update', before, after: row })
        // The card's dates are its current (last) period: a correction changes that period only (B6).
        if (data.startDate !== undefined || data.endDate !== undefined) syncLastPeriod(tx, audit, now, row)
        return row
      })
      return view(ctx, after)
    },

    /**
     * Hires a former employee again from `startDate` (B6): a new employment period; the old one and its months
     * stay as they were, the months between are not employed.
     */
    rehire(ctx: Ctx, input: RehireInput): EmployeeView {
      requirePermission(ctx, 'staff', 'edit')
      const data = parseInput(rehireSchema, input)
      const after = inTransaction(deps, ctx, (tx, audit, now) => {
        const before = employeeOf(tx, data.employeeId)
        const last = periodsOf(tx, before).at(-1)
        if (!before.endDate || !last?.until) throw conflict('errors.employeeStillEmployed')
        if (data.startDate <= last.until) throw invalid('errors.rehireBeforeEnd', { endDate: last.until })
        if (!tx.select().from(employmentPeriods).where(eq(employmentPeriods.employeeId, before.id)).get()) {
          // A card from before the periods existed: its first stretch becomes a row too.
          const first = {
            id: newId(now),
            employeeId: before.id,
            startDate: last.from,
            endDate: last.until,
            ...stamps(now)
          }
          tx.insert(employmentPeriods).values(first).run()
          audit({ entity: 'employment_period', entityId: first.id, action: 'create', after: first })
        }
        const period = {
          id: newId(now),
          employeeId: before.id,
          startDate: data.startDate,
          endDate: null,
          ...stamps(now)
        }
        tx.insert(employmentPeriods).values(period).run()
        audit({ entity: 'employment_period', entityId: period.id, action: 'create', after: period })
        tx.update(employees)
          .set({ startDate: data.startDate, endDate: null, active: true, updatedAt: now.toISOString() })
          .where(eq(employees.id, before.id))
          .run()
        const row = employeeOf(tx, before.id)
        audit({ entity: 'employee', entityId: row.id, action: 'update', before, after: row })
        return row
      })
      return view(ctx, after)
    },

    // ---- salary history (staff.salary) ----

    salaryHistory(ctx: Ctx, employeeId: string): SalaryRow[] {
      requirePermission(ctx, 'staff.salary', 'view')
      employeeOf(db, employeeId)
      return db
        .select()
        .from(employeeSalaries)
        .where(eq(employeeSalaries.employeeId, employeeId))
        .orderBy(asc(employeeSalaries.validFrom), asc(employeeSalaries.createdAt))
        .all()
    },

    /** A new salary from a day on (raise); history is never rewritten. */
    addSalary(ctx: Ctx, input: SalaryInput): SalaryRow {
      requirePermission(ctx, 'staff.salary', 'edit')
      const data = parseInput(salaryInputSchema, input)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        employeeOf(tx, data.employeeId)
        const row = { id: newId(now), ...data, createdBy: ctx.userId, ...stamps(now) }
        tx.insert(employeeSalaries).values(row).run()
        audit({ entity: 'employee_salary', entityId: row.id, action: 'create', after: row })
        return row
      })
    },

    // ---- pay rules (staff.policy; K-38: owner + manager) ----

    getPolicy(ctx: Ctx, employeeId: string | null = null): PayPolicyView {
      if (!ctx.can('staff.policy', 'view') && !ctx.can('staff.salary', 'view')) throw permissionDenied()
      if (employeeId) employeeOf(db, employeeId)
      return resolvePolicy(db, employeeId)
    },

    /** Sets hotel-wide or per-employee values; `inherit` puts keys back to the inherited value. */
    setPolicy(ctx: Ctx, input: PayPolicyPatchInput): PayPolicyView {
      requirePermission(ctx, 'staff.policy', 'edit')
      const data = parseInput(payPolicyPatchSchema, input)
      const employeeId = data.employeeId ?? null
      return inTransaction(deps, ctx, (tx, audit, now) => {
        if (employeeId) employeeOf(tx, employeeId)
        const scope = employeeId ? ('employee' as const) : ('hotel' as const)
        const before = policyValues(tx, employeeId)
        const writes = new Map<string, string>()
        for (const [key, value] of Object.entries(data.values)) writes.set(key, JSON.stringify(value))
        for (const key of data.inherit) writes.set(key, 'null')
        const iso = now.toISOString()
        for (const [key, valueJson] of writes) {
          const where = and(
            eq(payPolicies.scope, scope),
            employeeId ? eq(payPolicies.employeeId, employeeId) : isNull(payPolicies.employeeId),
            eq(payPolicies.key, key)
          )
          const existing = tx.select({ id: payPolicies.id }).from(payPolicies).where(where).get()
          if (existing)
            tx.update(payPolicies)
              .set({ valueJson, updatedBy: ctx.userId, updatedAt: iso })
              .where(eq(payPolicies.id, existing.id))
              .run()
          else
            tx.insert(payPolicies)
              .values({
                id: newId(now),
                scope,
                employeeId,
                key,
                valueJson,
                updatedBy: ctx.userId,
                ...stamps(now)
              })
              .run()
        }
        // Every employee's resulting rules must stay computable (a pct commission needs its percentage…).
        const affected = employeeId
          ? [employeeId]
          : tx
              .select({ id: employees.id })
              .from(employees)
              .all()
              .map((e) => e.id)
        for (const id of [null, ...affected]) {
          const missing = missingPolicyKeys(resolvePolicy(tx, id).values)
          if (missing.length)
            throw invalid('errors.validation', {
              fields: Object.fromEntries(missing.map((k) => [k, ['required for this mode']]))
            })
        }
        const after = resolvePolicy(tx, employeeId)
        audit({
          entity: 'pay_policy',
          entityId: employeeId ?? 'hotel',
          action: 'update',
          before,
          after: employeeId ? after.employee : after.hotel
        })
        return after
      })
    },

    // ---- leave (staff.leave) ----

    listLeave(ctx: Ctx, input: StaffRangeInput): LeaveRow[] {
      requirePermission(ctx, 'staff.leave', 'view')
      const q = parseInput(staffRangeSchema, input)
      if (!q.employeeId) throw invalid('errors.validation', { fields: { employeeId: ['required'] } })
      return db
        .select()
        .from(leaveRecords)
        .where(
          and(
            eq(leaveRecords.employeeId, q.employeeId),
            gte(leaveRecords.date, q.from),
            lte(leaveRecords.date, q.to)
          )
        )
        .orderBy(asc(leaveRecords.date))
        .all()
    },

    /** One leave record per employee and day ("Selin izin kullandı"). */
    addLeave(ctx: Ctx, input: LeaveInput): LeaveRow {
      requirePermission(ctx, 'staff.leave', 'edit')
      const data = parseInput(leaveInputSchema, input)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        assertEmployedOn(tx, employeeOf(tx, data.employeeId), data.date as LocalDate)
        const { year, month } = yearMonthOf(data.date)
        assertPeriodOpen(tx, data.employeeId, year, month)
        const taken = tx
          .select({ id: leaveRecords.id })
          .from(leaveRecords)
          .where(
            and(
              eq(leaveRecords.employeeId, data.employeeId),
              eq(leaveRecords.date, data.date),
              isNull(leaveRecords.voidedAt)
            )
          )
          .get()
        if (taken) throw conflict('errors.leaveExists', { date: data.date })
        const row: LeaveRow = {
          id: newId(now),
          employeeId: data.employeeId,
          date: data.date,
          kind: data.kind,
          note: data.note ?? null,
          voidedAt: null,
          createdBy: ctx.userId,
          ...stamps(now)
        }
        tx.insert(leaveRecords).values(row).run()
        audit({ entity: 'leave_record', entityId: row.id, action: 'create', after: row })
        return row
      })
    },

    /** Leave of every employee in an inclusive day range (the schedule); cancelled records are left out. */
    leaveBetween(ctx: Ctx, input: StaffRangeInput): LeaveRow[] {
      requirePermission(ctx, 'staff.leave', 'view')
      const q = parseInput(staffRangeSchema, input)
      return db
        .select()
        .from(leaveRecords)
        .where(
          and(
            q.employeeId ? eq(leaveRecords.employeeId, q.employeeId) : undefined,
            isNull(leaveRecords.voidedAt),
            gte(leaveRecords.date, q.from),
            lte(leaveRecords.date, q.to)
          )
        )
        .orderBy(asc(leaveRecords.date))
        .all()
    },

    /** `days` consecutive leave days from a date in one go: all of them, or none when a day is taken. */
    addLeaveDays(ctx: Ctx, input: LeaveDaysInput): LeaveRow[] {
      requirePermission(ctx, 'staff.leave', 'edit')
      const data = parseInput(leaveDaysInputSchema, input)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        employeeOf(tx, data.employeeId)
        const out: LeaveRow[] = []
        for (let i = 0; i < data.days; i++) {
          const date = addDays(data.from as LocalDate, i)
          const { year, month } = yearMonthOf(date)
          assertPeriodOpen(tx, data.employeeId, year, month)
          const taken = tx
            .select({ id: leaveRecords.id })
            .from(leaveRecords)
            .where(
              and(
                eq(leaveRecords.employeeId, data.employeeId),
                eq(leaveRecords.date, date),
                isNull(leaveRecords.voidedAt)
              )
            )
            .get()
          if (taken) throw conflict('errors.leaveExists', { date })
          const row: LeaveRow = {
            id: newId(now),
            employeeId: data.employeeId,
            date,
            kind: data.kind,
            note: data.note ?? null,
            voidedAt: null,
            createdBy: ctx.userId,
            ...stamps(now)
          }
          tx.insert(leaveRecords).values(row).run()
          audit({ entity: 'leave_record', entityId: row.id, action: 'create', after: row })
          out.push(row)
        }
        return out
      })
    },

    voidLeave(ctx: Ctx, id: string, why: string): LeaveRow {
      requirePermission(ctx, 'staff.leave', 'edit')
      const { reason } = parseInput(staffVoidSchema, { reason: why })
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const before = tx.select().from(leaveRecords).where(eq(leaveRecords.id, id)).get()
        if (!before) throw notFound('leave_record', id)
        if (before.voidedAt) throw conflict('errors.alreadyCancelled')
        const { year, month } = yearMonthOf(before.date)
        assertPeriodOpen(tx, before.employeeId, year, month)
        tx.update(leaveRecords)
          .set({ voidedAt: now.toISOString(), updatedAt: now.toISOString() })
          .where(eq(leaveRecords.id, id))
          .run()
        const after = tx.select().from(leaveRecords).where(eq(leaveRecords.id, id)).get() as LeaveRow
        audit({ entity: 'leave_record', entityId: id, action: 'void', before, after, reason })
        return after
      })
    },

    // ---- work time (own hours: staff.own_hours; others and overtime: staff.overtime) ----

    /**
     * Upserts the day's work record. Employees enter their own start/end times (S-39); worked-minute
     * corrections, overtime, the day's kind and other people's records need `staff.overtime` (K-38).
     */
    recordWork(ctx: Ctx, input: WorkInput): WorkRow {
      const data = parseInput(workInputSchema, input)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const own = ownEmployee(tx, ctx)
        const employeeId = data.employeeId ?? own?.id
        const managerFields =
          data.minutesWorked !== undefined || data.overtimeMinutes !== undefined || data.kind !== undefined
        if (employeeId !== undefined && employeeId === own?.id && !managerFields)
          requirePermission(ctx, 'staff.own_hours', 'edit')
        else requirePermission(ctx, 'staff.overtime', 'edit')
        if (!employeeId) throw notFound('employee')
        // QA2a (K-46): an employee writes their own hours for today and `staff.ownHoursBackDays` days back, never
        // for a future day; Müdür and Sahip (overtime rights) may write any day.
        if (!ctx.can('staff.overtime', 'edit')) {
          const today = localDateOf(deps.clock())
          const back = readSetting(tx, 'staff.ownHoursBackDays')
          if (data.date > today || data.date < addDays(today, -back))
            throw invalid('errors.ownHoursDay', { from: addDays(today, -back), to: today })
        }
        assertEmployedOn(tx, employeeOf(tx, employeeId), data.date as LocalDate)
        const { year, month } = yearMonthOf(data.date)
        assertPeriodOpen(tx, employeeId, year, month)
        const before = tx
          .select()
          .from(workRecords)
          .where(and(eq(workRecords.employeeId, employeeId), eq(workRecords.date, data.date)))
          .get()
        const startTime = data.startTime ?? before?.startTime ?? null
        const endTime = data.endTime ?? before?.endTime ?? null
        // B22: minutes Müdür/Sahip corrected stay when the employee enters the same day's times again; a
        // manager entering new times recomputes them.
        const corrected =
          !!before &&
          (before.startTime && before.endTime
            ? before.minutesWorked !== minutesWorked(before.startTime, before.endTime)
            : before.minutesWorked > 0)
        const keepCorrection = corrected && !ctx.can('staff.overtime', 'edit')
        const minutes =
          data.minutesWorked ??
          (data.startTime !== undefined && startTime && endTime && !keepCorrection
            ? minutesWorked(startTime, endTime)
            : (before?.minutesWorked ?? 0))
        const fields = {
          startTime,
          endTime,
          minutesWorked: minutes,
          overtimeMinutes: data.overtimeMinutes ?? before?.overtimeMinutes ?? 0,
          kind: data.kind ?? before?.kind ?? ('normal' as const),
          note: data.note !== undefined ? (data.note ?? null) : (before?.note ?? null)
        }
        let id: string
        if (before) {
          id = before.id
          tx.update(workRecords)
            .set({ ...fields, updatedAt: now.toISOString() })
            .where(eq(workRecords.id, id))
            .run()
        } else {
          id = newId(now)
          tx.insert(workRecords)
            .values({ id, employeeId, date: data.date, ...fields, createdBy: ctx.userId, ...stamps(now) })
            .run()
        }
        const after = tx.select().from(workRecords).where(eq(workRecords.id, id)).get() as WorkRow
        audit({ entity: 'work_record', entityId: id, action: before ? 'update' : 'create', before, after })
        return after
      })
    },

    listWork(ctx: Ctx, input: StaffRangeInput): WorkView[] {
      const q = parseInput(staffRangeSchema, input)
      const own = ownEmployee(db, ctx)
      const employeeId = q.employeeId ?? own?.id
      if (employeeId !== undefined && employeeId === own?.id)
        requirePermission(ctx, 'staff.own_hours', 'view')
      else if (!ctx.can('staff.overtime', 'view') && !ctx.can('staff.salary', 'view'))
        throw permissionDenied()
      if (!employeeId) return []
      const standard = resolvePolicy(db, employeeId).values.standardHoursPerDay
      return db
        .select()
        .from(workRecords)
        .where(
          and(
            eq(workRecords.employeeId, employeeId),
            gte(workRecords.date, q.from),
            lte(workRecords.date, q.to)
          )
        )
        .orderBy(asc(workRecords.date))
        .all()
        .map((w) => ({ ...w, suggestedOvertimeMinutes: suggestedOvertimeMinutes(w.minutesWorked, standard) }))
    },

    // ---- money given to staff (staff.salary) ----

    listTransactions(ctx: Ctx, employeeId: string, year: number, month: number): StaffTxnRow[] {
      requirePermission(ctx, 'staff.salary', 'view')
      const p = parseInput(yearMonthSchema, { year, month })
      return db
        .select()
        .from(staffTransactions)
        .where(
          and(
            eq(staffTransactions.employeeId, employeeId),
            eq(staffTransactions.periodYear, p.year),
            eq(staffTransactions.periodMonth, p.month)
          )
        )
        .orderBy(asc(staffTransactions.date), asc(staffTransactions.createdAt))
        .all()
    },

    /**
     * Advance, salary part, leave/overtime/commission payment, bonus or deduction. Money handed out also writes
     * an expense row (kind staff) in the staff expense section; bonus and deduction only change the net.
     */
    addTransaction(ctx: Ctx, input: StaffTxnInput): StaffTxnRow {
      requirePermission(ctx, 'staff.salary', 'edit')
      const data = parseInput(staffTxnInputSchema, input)
      if ((data.periodYear === undefined) !== (data.periodMonth === undefined))
        throw invalid('errors.validation', { fields: { periodMonth: ['year and month go together'] } })
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const e = employeeOf(tx, data.employeeId)
        const year = data.periodYear ?? yearMonthOf(data.date).year
        const month = data.periodMonth ?? yearMonthOf(data.date).month
        // The salary period must be a month the person was employed in (an advance for a month nobody works
        // would vanish from every salary table).
        const bounds = monthBounds(year, month)
        if (!employedBetween(periodsOf(tx, e), bounds.from, bounds.to))
          throw invalid('errors.notEmployedInPeriod', { year, month })
        assertPeriodOpen(tx, e.id, year, month)
        const salary = salaryOfMonth(salaryHistory(tx, e.id), periodsOf(tx, e), year, month)
        const currency = data.currency ?? salary?.currency ?? baseCurrencyOf(tx)
        if (salary && currency !== salary.currency)
          throw invalid('errors.currencyMismatch', { expected: salary.currency, got: currency })
        // B9: any money handed out may come from the drawer (salary in cash, Excel "x maaş"); an advance only
        // while the hotel allows it; a bonus or deduction is no payout at all.
        if (data.paidFromDrawer) {
          if (!PAID_OUT.has(data.kind))
            throw invalid('errors.validation', { fields: { paidFromDrawer: ['not money handed out'] } })
          if (data.kind === 'advance' && !readSetting(tx, 'staff.advanceFromDrawer'))
            throw invalid('errors.drawerAdvanceDisabled')
        }
        const id = newId(now)
        let expenseId: string | null = null
        if (PAID_OUT.has(data.kind)) {
          const reason = assertDayWritable(tx, ctx, data.date, data.reason)
          checkExpenseRefs(tx, { methodId: data.methodId })
          const expense = insertExpenseTx(tx, ctx, now, {
            date: data.date,
            sectionId: staffSection(tx).id,
            amountMinor: data.amountMinor,
            currency,
            description: fullName(e),
            kind: 'staff',
            paidFromDrawer: data.paidFromDrawer,
            methodId: data.paidFromDrawer ? null : (data.methodId ?? null),
            employeeId: e.id,
            staffTxnId: id
          })
          expenseId = expense.id
          audit({ entity: 'expense', entityId: expense.id, action: 'create', after: expense, reason })
        }
        const row: StaffTxnRow = {
          id,
          employeeId: e.id,
          date: data.date,
          kind: data.kind,
          amountMinor: data.amountMinor,
          currency,
          periodYear: year,
          periodMonth: month,
          expenseId,
          note: data.note ?? null,
          voidedAt: null,
          voidReason: null,
          createdBy: ctx.userId,
          ...stamps(now)
        }
        tx.insert(staffTransactions).values(row).run()
        audit({ entity: 'staff_transaction', entityId: id, action: 'create', after: row })
        return row
      })
    },

    /** Voids the transaction and its expense row together (never deleted). */
    voidTransaction(ctx: Ctx, id: string, why: string, dayClosedReason?: string): StaffTxnRow {
      requirePermission(ctx, 'staff.salary', 'edit')
      const { reason } = parseInput(staffVoidSchema, { reason: why })
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const before = tx.select().from(staffTransactions).where(eq(staffTransactions.id, id)).get()
        if (!before) throw notFound('staff_transaction', id)
        if (before.voidedAt) throw conflict('errors.alreadyCancelled')
        assertPeriodOpen(tx, before.employeeId, before.periodYear, before.periodMonth)
        const iso = now.toISOString()
        if (before.expenseId) {
          const expense = tx.select().from(expenses).where(eq(expenses.id, before.expenseId)).get()
          if (expense && !expense.voidedAt) {
            if (expense.settledAt) throw conflict('errors.expenseSettled')
            // B8: the cancel reason is the closed-day reason too (as when voiding an expense, G-72).
            assertDayWritable(tx, ctx, expense.date, dayClosedReason ?? reason)
            tx.update(expenses)
              .set({ voidedAt: iso, voidReason: reason, updatedAt: iso })
              .where(eq(expenses.id, expense.id))
              .run()
            audit({ entity: 'expense', entityId: expense.id, action: 'void', before: expense, reason })
          }
        }
        tx.update(staffTransactions)
          .set({ voidedAt: iso, voidReason: reason, updatedAt: iso })
          .where(eq(staffTransactions.id, id))
          .run()
        const after = tx
          .select()
          .from(staffTransactions)
          .where(eq(staffTransactions.id, id))
          .get() as StaffTxnRow
        audit({ entity: 'staff_transaction', entityId: id, action: 'void', before, after, reason })
        return after
      })
    },

    // ---- salary table (staff.salary) ----

    /** One employee's month: the locked snapshot, or computed from today's records. */
    salaryPeriod(ctx: Ctx, query: SalaryPeriodQuery): SalaryPeriodView {
      requirePermission(ctx, 'staff.salary', 'view')
      const q = parseInput(salaryPeriodQuerySchema, query)
      return periodView(ctx, employeeOf(db, q.employeeId), q.year, q.month)
    },

    /** Every employee of the month (Excel "Maaş Tablosu"). */
    salaryTable(ctx: Ctx, y: number, m: number): SalaryTable {
      requirePermission(ctx, 'staff.salary', 'view')
      const { year, month } = parseInput(yearMonthSchema, { year: y, month: m })
      const { from, to } = monthBounds(year, month)
      const rows: SalaryPeriodView[] = []
      const withoutSalary: string[] = []
      // A locked month keeps its row even when the dates were corrected since (its snapshot was paid out).
      const staff = db
        .select()
        .from(employees)
        .all()
        .filter(
          (e) => employedBetween(periodsOf(db, e), from, to) || !!periodRow(db, e.id, year, month)?.lockedAt
        )
        .sort((a, b) => a.firstName.localeCompare(b.firstName, 'tr'))
      for (const e of staff) {
        const locked = periodRow(db, e.id, year, month)?.lockedAt
        if (!locked && !salaryOfMonth(salaryHistory(db, e.id), periodsOf(db, e), year, month)) {
          withoutSalary.push(e.id)
          continue
        }
        rows.push(periodView(ctx, e, year, month))
      }
      return { year, month, rows, withoutSalary }
    },

    /** Freezes the month's row (paid out): later record changes for that month are refused. */
    lockPeriod(ctx: Ctx, query: SalaryPeriodQuery): SalaryPeriodRow {
      requirePermission(ctx, 'staff.salary', 'edit')
      const q = parseInput(salaryPeriodQuerySchema, query)
      const e = employeeOf(db, q.employeeId)
      if (periodRow(db, e.id, q.year, q.month)?.lockedAt)
        throw conflict('errors.salaryPeriodLocked', { year: q.year, month: q.month })
      const snapshot = compute(ctx, e, q.year, q.month)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const before = periodRow(tx, e.id, q.year, q.month)
        const iso = now.toISOString()
        const set = {
          snapshot: snapshot as unknown as Record<string, unknown>,
          lockedAt: iso,
          lockedBy: ctx.userId,
          updatedAt: iso
        }
        if (before) tx.update(salaryPeriods).set(set).where(eq(salaryPeriods.id, before.id)).run()
        else
          tx.insert(salaryPeriods)
            .values({
              id: newId(now),
              employeeId: e.id,
              year: q.year,
              month: q.month,
              ...set,
              createdAt: iso
            })
            .run()
        const after = periodRow(tx, e.id, q.year, q.month) as SalaryPeriodRow
        audit({ entity: 'salary_period', entityId: after.id, action: 'close', before, after })
        return after
      })
    },

    /** Locks every open row of the month's table (the "Ayı kilitle" of the salary table); returns how many. */
    lockMonth(ctx: Ctx, y: number, m: number): { locked: number } {
      requirePermission(ctx, 'staff.salary', 'edit')
      const { year, month } = parseInput(yearMonthSchema, { year: y, month: m })
      const { from, to } = monthBounds(year, month)
      const open = db
        .select()
        .from(employees)
        .all()
        .filter((e) => employedBetween(periodsOf(db, e), from, to))
        .filter((e) => !periodRow(db, e.id, year, month)?.lockedAt)
        .filter((e) => salaryOfMonth(salaryHistory(db, e.id), periodsOf(db, e), year, month))
      if (!open.length) throw conflict('errors.salaryPeriodLocked', { year, month })
      const snapshots = open.map((e) => ({ e, snapshot: compute(ctx, e, year, month) }))
      inTransaction(deps, ctx, (tx, audit, now) => {
        const iso = now.toISOString()
        for (const { e, snapshot } of snapshots) {
          const before = periodRow(tx, e.id, year, month)
          const set = {
            snapshot: snapshot as unknown as Record<string, unknown>,
            lockedAt: iso,
            lockedBy: ctx.userId,
            updatedAt: iso
          }
          if (before) tx.update(salaryPeriods).set(set).where(eq(salaryPeriods.id, before.id)).run()
          else
            tx.insert(salaryPeriods)
              .values({ id: newId(now), employeeId: e.id, year, month, ...set, createdAt: iso })
              .run()
          const after = periodRow(tx, e.id, year, month) as SalaryPeriodRow
          audit({ entity: 'salary_period', entityId: after.id, action: 'close', before, after })
        }
      })
      return { locked: snapshots.length }
    },

    /** Opens every locked row of the month again (with a reason in the audit log). */
    unlockMonth(ctx: Ctx, y: number, m: number, why: string): { unlocked: number } {
      requirePermission(ctx, 'staff.salary', 'edit')
      const { year, month } = parseInput(yearMonthSchema, { year: y, month: m })
      const { reason } = parseInput(staffVoidSchema, { reason: why })
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const locked = tx
          .select()
          .from(salaryPeriods)
          .where(and(eq(salaryPeriods.year, year), eq(salaryPeriods.month, month)))
          .all()
          .filter((p) => p.lockedAt)
        if (!locked.length) throw conflict('errors.salaryPeriodNotLocked', { year, month })
        for (const before of locked) {
          tx.update(salaryPeriods)
            .set({ lockedAt: null, lockedBy: null, updatedAt: now.toISOString() })
            .where(eq(salaryPeriods.id, before.id))
            .run()
          const after = tx.select().from(salaryPeriods).where(eq(salaryPeriods.id, before.id)).get()
          audit({ entity: 'salary_period', entityId: before.id, action: 'reopen', before, after, reason })
        }
        return { unlocked: locked.length }
      })
    },

    unlockPeriod(ctx: Ctx, query: SalaryPeriodQuery, why: string): SalaryPeriodRow {
      requirePermission(ctx, 'staff.salary', 'edit')
      const q = parseInput(salaryPeriodQuerySchema, query)
      const { reason } = parseInput(staffVoidSchema, { reason: why })
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const before = periodRow(tx, q.employeeId, q.year, q.month)
        if (!before?.lockedAt)
          throw conflict('errors.salaryPeriodNotLocked', { year: q.year, month: q.month })
        tx.update(salaryPeriods)
          .set({ lockedAt: null, lockedBy: null, updatedAt: now.toISOString() })
          .where(eq(salaryPeriods.id, before.id))
          .run()
        const after = periodRow(tx, q.employeeId, q.year, q.month) as SalaryPeriodRow
        audit({ entity: 'salary_period', entityId: before.id, action: 'reopen', before, after, reason })
        return after
      })
    },

    /** Excel "PERSONEL DURUMU" panel for the month; advances only for `staff.salary` viewers. */
    staffPanel(ctx: Ctx, y: number, m: number): StaffPanelRow[] {
      requirePermission(ctx, 'staff', 'view')
      const { year, month } = parseInput(yearMonthSchema, { year: y, month: m })
      const { from, to } = monthBounds(year, month)
      const seeMoney = ctx.can('staff.salary', 'view')
      const staff = db
        .select()
        .from(employees)
        .all()
        // Someone who left during the month is still on its panel (their last days); a deactivated card without a
        // last day is not.
        .filter((e) => {
          const periods = periodsOf(db, e)
          return (
            employedBetween(periods, from, to) &&
            (e.active || periods.some((p) => p.until !== null && p.until >= from && p.from < to))
          )
        })
        .sort((a, b) => a.firstName.localeCompare(b.firstName, 'tr'))
      if (!staff.length) return []
      const ids = staff.map((e) => e.id)
      const rest = db
        .select({ employeeId: leaveRecords.employeeId, date: leaveRecords.date })
        .from(leaveRecords)
        .where(
          and(
            inArray(leaveRecords.employeeId, ids),
            eq(leaveRecords.kind, 'rest_day'),
            isNull(leaveRecords.voidedAt),
            gte(leaveRecords.date, from),
            lt(leaveRecords.date, to)
          )
        )
        .all()
      const advances = seeMoney
        ? db
            .select()
            .from(staffTransactions)
            .where(
              and(
                inArray(staffTransactions.employeeId, ids),
                eq(staffTransactions.kind, 'advance'),
                eq(staffTransactions.periodYear, year),
                eq(staffTransactions.periodMonth, month),
                isNull(staffTransactions.voidedAt)
              )
            )
            .all()
        : []
      return staff.map((e) => {
        const policy = resolvePolicy(db, e.id).values
        const used = new Set(rest.filter((r) => r.employeeId === e.id).map((r) => r.date)).size
        const mine = advances.filter((a) => a.employeeId === e.id)
        const salary = seeMoney ? salaryOfMonth(salaryHistory(db, e.id), periodsOf(db, e), year, month) : null
        // A joining or leaving month gets its share of the rest days (the salary rule's own rounding).
        const range = employedIn(year, month, periodsOf(db, e))
        const entitled =
          range && range.days < range.monthDays
            ? Math.floor((policy.leaveDaysPerMonth * range.days) / range.monthDays)
            : policy.leaveDaysPerMonth
        return {
          employeeId: e.id,
          fullName: fullName(e),
          position: e.position,
          advancesMinor: seeMoney ? mine.reduce((acc, a) => acc + a.amountMinor, 0) : null,
          currency: seeMoney ? (salary?.currency ?? mine[0]?.currency ?? null) : null,
          leaveEntitled: entitled,
          leaveUsed: used,
          // The same "kalan" as the salary table: carried rest days count when the hotel carries them over.
          leaveLeft: Math.max(
            0,
            entitled + (policy.leaveCarryOver ? carriedLeave(e, policy, year, month) : 0) - used
          )
        }
      })
    }
  }
}

export type StaffService = ReturnType<typeof createStaffService>
