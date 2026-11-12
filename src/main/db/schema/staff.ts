import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { bool, day, id, minor, timestamps } from './columns'

// Staff, salary history, pay policies, leave, work time and money given to staff (03-mimari.md §4.6;
// G-80…G-88, K-38). Times are integer minutes.

export const employees = sqliteTable(
  'employees',
  {
    id: id(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    position: text('position'),
    phone: text('phone'),
    startDate: day('start_date').notNull(),
    endDate: day('end_date'),
    active: bool('active').notNull().default(true),
    notes: text('notes'),
    userId: text('user_id'),
    ...timestamps
  },
  (t) => [index('employees_user_idx').on(t.userId)]
)

/**
 * Every stretch an employee worked for the hotel (P7fix B6: left, hired again). The card's start/end dates are
 * the current (latest) period; the months between two periods have no salary row.
 */
export const employmentPeriods = sqliteTable(
  'employment_periods',
  {
    id: id(),
    employeeId: text('employee_id')
      .notNull()
      .references(() => employees.id),
    startDate: day('start_date').notNull(),
    endDate: day('end_date'),
    ...timestamps
  },
  (t) => [index('employment_periods_employee_idx').on(t.employeeId, t.startDate)]
)

export const employeeSalaries = sqliteTable(
  'employee_salaries',
  {
    id: id(),
    employeeId: text('employee_id')
      .notNull()
      .references(() => employees.id),
    validFrom: day('valid_from').notNull(),
    monthlyMinor: minor('monthly_minor').notNull(),
    currency: text('currency').notNull(),
    createdBy: text('created_by'),
    ...timestamps
  },
  (t) => [index('employee_salaries_employee_idx').on(t.employeeId, t.validFrom)]
)

/** Hotel-wide (employee_id null) or per-employee overrides; keys and defaults in src/shared/domain/salary.ts. */
export const payPolicies = sqliteTable(
  'pay_policies',
  {
    id: id(),
    scope: text('scope', { enum: ['hotel', 'employee'] }).notNull(),
    employeeId: text('employee_id').references(() => employees.id),
    key: text('key').notNull(),
    valueJson: text('value_json').notNull(),
    updatedBy: text('updated_by'),
    ...timestamps
  },
  (t) => [index('pay_policies_lookup_idx').on(t.scope, t.employeeId, t.key)]
)

export const leaveRecords = sqliteTable(
  'leave_records',
  {
    id: id(),
    employeeId: text('employee_id')
      .notNull()
      .references(() => employees.id),
    date: day('date').notNull(),
    kind: text('kind', { enum: ['rest_day', 'annual', 'sick', 'unpaid', 'holiday_worked'] }).notNull(),
    note: text('note'),
    voidedAt: text('voided_at'),
    createdBy: text('created_by'),
    ...timestamps
  },
  (t) => [index('leave_records_employee_idx').on(t.employeeId, t.date)]
)

export const workRecords = sqliteTable(
  'work_records',
  {
    id: id(),
    employeeId: text('employee_id')
      .notNull()
      .references(() => employees.id),
    date: day('date').notNull(),
    /** 'HH:MM' entered by the employee (S-39). */
    startTime: text('start_time'),
    endTime: text('end_time'),
    minutesWorked: integer('minutes_worked').notNull().default(0),
    /** Entered only by the manager/owner (K-38). */
    overtimeMinutes: integer('overtime_minutes').notNull().default(0),
    kind: text('kind', { enum: ['normal', 'holiday', 'rest_day'] })
      .notNull()
      .default('normal'),
    note: text('note'),
    createdBy: text('created_by'),
    ...timestamps
  },
  (t) => [index('work_records_employee_idx').on(t.employeeId, t.date)]
)

export const STAFF_TXN_KINDS = [
  'advance',
  'salary_payment',
  'leave_payout',
  'overtime_payment',
  'commission_payment',
  'bonus',
  'deduction'
] as const

export const staffTransactions = sqliteTable(
  'staff_transactions',
  {
    id: id(),
    employeeId: text('employee_id')
      .notNull()
      .references(() => employees.id),
    date: day('date').notNull(),
    kind: text('kind', { enum: STAFF_TXN_KINDS }).notNull(),
    amountMinor: minor('amount_minor').notNull(),
    currency: text('currency').notNull(),
    periodYear: integer('period_year').notNull(),
    periodMonth: integer('period_month').notNull(),
    /** Money paid out also appears as an expense (G-69); bonus/deduction only change the net. */
    expenseId: text('expense_id'),
    note: text('note'),
    voidedAt: text('voided_at'),
    voidReason: text('void_reason'),
    createdBy: text('created_by'),
    ...timestamps
  },
  (t) => [index('staff_transactions_period_idx').on(t.employeeId, t.periodYear, t.periodMonth)]
)

export const salaryPeriods = sqliteTable(
  'salary_periods',
  {
    id: id(),
    employeeId: text('employee_id')
      .notNull()
      .references(() => employees.id),
    year: integer('year').notNull(),
    month: integer('month').notNull(),
    snapshot: text('snapshot_json', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
    lockedAt: text('locked_at'),
    lockedBy: text('locked_by'),
    ...timestamps
  },
  (t) => [uniqueIndex('salary_periods_employee_month_unique').on(t.employeeId, t.year, t.month)]
)
