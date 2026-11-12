// Faz 8: employees, salary history, advances, leave, timesheets, payroll (G-80…G-88, G-25, G-69, K-38).
// Spread into the contract by ./index.ts; handlers in src/main/api/handlers/staff.ts. The core keeps
// staff.getPolicy / setPolicy / listEmployees (settings and the setup wizard); everything the Personel screen
// reads and writes is here. Permissions are checked in staff-service (G-23), not by the router.
import * as z from 'zod'
import {
  employeeCreateSchema,
  employeeUpdateSchema,
  leaveDaysInputSchema,
  leaveInputSchema,
  LEAVE_KINDS,
  rehireSchema,
  salaryInputSchema,
  salaryPeriodQuerySchema,
  staffRangeSchema,
  staffTxnInputSchema,
  STAFF_TXN_KIND_VALUES,
  workInputSchema
} from '../staff'
import { reasonSchema } from '../expenses'
import { yearMonthSchema } from '../ledger'
import { i18nTextSchema, idSchema, localDateSchema } from '../rooms'
import { proc, type Procedure } from '../proc'

const iso = z.string()
const money = z.number().int()

export const employeeAccountSchema = z.object({
  id: idSchema,
  displayName: z.string(),
  roleCode: z.string().nullable(),
  roleName: z.string(),
  roleNameI18n: i18nTextSchema.nullable(),
  active: z.boolean(),
  lastLoginAt: iso.nullable()
})

/** An employee card; `currentSalary` only for callers who may see salaries (left out otherwise). */
export const employeeViewSchema = z.object({
  id: idSchema,
  firstName: z.string(),
  lastName: z.string(),
  fullName: z.string(),
  position: z.string().nullable(),
  phone: z.string().nullable(),
  startDate: localDateSchema,
  endDate: localDateSchema.nullable(),
  active: z.boolean(),
  notes: z.string().nullable(),
  userId: idSchema.nullable(),
  account: employeeAccountSchema.nullable(),
  /** Every employment period, oldest first (B6); the card's dates are the last one. */
  periods: z.array(z.object({ startDate: localDateSchema, endDate: localDateSchema.nullable() })).optional(),
  currentSalary: z
    .object({ monthlyMinor: money, currency: z.string(), validFrom: localDateSchema })
    .nullable()
    .optional()
})
export type EmployeeViewDto = z.infer<typeof employeeViewSchema>

export const linkableUserSchema = employeeAccountSchema.omit({ active: true, lastLoginAt: true })

export const salaryEntrySchema = z.object({
  id: idSchema,
  employeeId: idSchema,
  validFrom: localDateSchema,
  monthlyMinor: money,
  currency: z.string(),
  createdAt: iso
})

export const leaveRowSchema = z.object({
  id: idSchema,
  employeeId: idSchema,
  date: localDateSchema,
  kind: z.enum(LEAVE_KINDS),
  note: z.string().nullable(),
  voidedAt: iso.nullable(),
  createdAt: iso
})
export type LeaveRowDto = z.infer<typeof leaveRowSchema>

export const workRowSchema = z.object({
  id: idSchema,
  employeeId: idSchema,
  date: localDateSchema,
  startTime: z.string().nullable(),
  endTime: z.string().nullable(),
  minutesWorked: z.number().int(),
  overtimeMinutes: z.number().int(),
  kind: z.enum(['normal', 'holiday', 'rest_day']),
  note: z.string().nullable(),
  createdBy: z.string().nullable(),
  /** Minutes above the standard day: what Müdür/Sahip may approve as overtime (K-38). */
  suggestedOvertimeMinutes: z.number().int().optional()
})
export type WorkRowDto = z.infer<typeof workRowSchema>

export const staffTxnRowSchema = z.object({
  id: idSchema,
  employeeId: idSchema,
  date: localDateSchema,
  kind: z.enum(STAFF_TXN_KIND_VALUES),
  amountMinor: money,
  currency: z.string(),
  periodYear: z.number().int(),
  periodMonth: z.number().int(),
  expenseId: idSchema.nullable(),
  note: z.string().nullable(),
  voidedAt: iso.nullable(),
  voidReason: z.string().nullable(),
  createdAt: iso
})
export type StaffTxnRowDto = z.infer<typeof staffTxnRowSchema>

/** One row of the monthly salary table (03-mimari.md §6.6); amounts in minor units of `currency`. */
export const salaryPeriodViewSchema = z.object({
  employeeId: idSchema,
  fullName: z.string(),
  position: z.string().nullable(),
  year: z.number().int(),
  month: z.number().int(),
  currency: z.string(),
  monthly: money,
  employedDays: z.number().int().optional(),
  monthDays: z.number().int().optional(),
  salaryDue: money.optional(),
  /** Unpaid leave days and their deduction (B3; snapshots locked before it have none). */
  unpaidDays: z.number().int().optional(),
  unpaidDeduction: money.optional(),
  daily: money,
  hourly: money,
  leaveEntitled: z.number().int(),
  leaveCarriedIn: z.number().int(),
  leaveUsed: z.number().int(),
  leaveLeft: z.number().int(),
  leavePayout: money,
  overtimeMinutes: z.number().int(),
  overtimePay: money,
  holidayDays: z.number().int(),
  holidayMinutes: z.number().int(),
  holidayPay: money,
  commission: money,
  commissionBaseMinor: money.nullable(),
  advances: money,
  bonus: money,
  deductions: money,
  net: money,
  paid: money,
  remaining: money,
  locked: z.boolean(),
  lockedAt: iso.nullable(),
  lockedBy: z.string().nullable()
})
export type SalaryPeriodDto = z.infer<typeof salaryPeriodViewSchema>

export const salaryTableSchema = z.object({
  year: z.number().int(),
  month: z.number().int(),
  rows: z.array(salaryPeriodViewSchema),
  withoutSalary: z.array(idSchema)
})
export type SalaryTableDto = z.infer<typeof salaryTableSchema>

/** Excel "PERSONEL DURUMU": this month's advances (salary viewers only) and leave entitled / used / left. */
export const staffPanelRowSchema = z.object({
  employeeId: idSchema,
  fullName: z.string(),
  position: z.string().nullable(),
  advancesMinor: money.nullable(),
  currency: z.string().nullable(),
  leaveEntitled: z.number().int(),
  leaveUsed: z.number().int(),
  leaveLeft: z.number().int()
})
export type StaffPanelRowDto = z.infer<typeof staffPanelRowSchema>

const periodRowSchema = z.object({
  id: idSchema,
  employeeId: idSchema,
  year: z.number().int(),
  month: z.number().int(),
  lockedAt: iso.nullable(),
  lockedBy: z.string().nullable()
})

const ym = yearMonthSchema.strict()
const voidInput = z.object({ id: idSchema, reason: reasonSchema }).strict()

export const staffProcedures = {
  // Cards (staff) and accounts they can be linked to (G-25).
  'staff.employees': proc(
    z.object({ includeInactive: z.boolean().optional() }).strict(),
    z.array(employeeViewSchema)
  ),
  'staff.getEmployee': proc(z.object({ id: idSchema }).strict(), employeeViewSchema),
  'staff.myEmployee': proc(z.object({}).strict(), employeeViewSchema.nullable()),
  'staff.createEmployee': proc(employeeCreateSchema, employeeViewSchema),
  'staff.updateEmployee': proc(
    z.object({ id: idSchema, patch: employeeUpdateSchema }).strict(),
    employeeViewSchema
  ),
  'staff.linkableUsers': proc(z.object({}).strict(), z.array(linkableUserSchema)),
  'staff.rehire': proc(rehireSchema.strict(), employeeViewSchema),

  // Salary history (staff.salary): a raise is a new row from a day on.
  'staff.salaryHistory': proc(z.object({ employeeId: idSchema }).strict(), z.array(salaryEntrySchema)),
  'staff.addSalary': proc(salaryInputSchema, salaryEntrySchema),

  // Leave (staff.leave).
  'staff.leaveBetween': proc(staffRangeSchema, z.array(leaveRowSchema)),
  'staff.addLeave': proc(leaveInputSchema, leaveRowSchema),
  'staff.addLeaveDays': proc(leaveDaysInputSchema, z.array(leaveRowSchema)),
  'staff.voidLeave': proc(voidInput, leaveRowSchema),

  // Work time: own start/end (staff.own_hours), overtime and other people's days (staff.overtime).
  'staff.listWork': proc(staffRangeSchema, z.array(workRowSchema)),
  'staff.recordWork': proc(workInputSchema, workRowSchema),

  // Money given to staff (staff.salary): each payout is also a locked expense row (G-69).
  'staff.listTransactions': proc(
    yearMonthSchema.extend({ employeeId: idSchema }).strict(),
    z.array(staffTxnRowSchema)
  ),
  'staff.addTransaction': proc(staffTxnInputSchema, staffTxnRowSchema),
  'staff.voidTransaction': proc(
    z.object({ id: idSchema, reason: reasonSchema, dayClosedReason: reasonSchema.optional() }).strict(),
    staffTxnRowSchema
  ),

  // The monthly salary table and its lock (G-81, G-88).
  'staff.salaryTable': proc(ym, salaryTableSchema),
  'staff.salaryPeriod': proc(salaryPeriodQuerySchema.strict(), salaryPeriodViewSchema),
  'staff.lockMonth': proc(ym, z.object({ locked: z.number().int() })),
  'staff.unlockMonth': proc(
    yearMonthSchema.extend({ reason: reasonSchema }).strict(),
    z.object({ unlocked: z.number().int() })
  ),
  'staff.lockPeriod': proc(salaryPeriodQuerySchema.strict(), periodRowSchema),

  // "Personel durumu" panel of the month (also the Bugün card).
  'staff.panel': proc(ym, z.array(staffPanelRowSchema))
} as const satisfies Record<string, Procedure>
