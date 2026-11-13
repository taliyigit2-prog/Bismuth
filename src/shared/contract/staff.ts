// Staff inputs: employees, salary history, pay policies, leave, work time and money given to staff
// (03-mimari.md §4.6, §6.6; G-80…G-88, K-38, S-34…S-39). Pay policy keys mirror PayPolicy in domain/salary.ts.
import * as z from 'zod'
import { clockTime, currencyCode } from './settings'
import { daySchema, reasonSchema } from './expenses'
import { amountSchema, idSchema } from './rooms'
import { yearMonthSchema } from './ledger'
import { optionalPhone } from './text'

const name = z.string().trim().min(1).max(60)

export const employeeCreateSchema = z.object({
  firstName: name,
  lastName: name,
  position: z.string().trim().max(60).nullish(),
  phone: optionalPhone,
  startDate: daySchema,
  endDate: daySchema.nullish(),
  notes: z.string().max(1000).nullish(),
  /** The user account of this employee (own hours, K-38); one employee per user. */
  userId: idSchema.nullish(),
  /** Optional first salary (needs `staff.salary`); later changes go to the salary history. */
  salary: z
    .object({
      monthlyMinor: amountSchema.positive(),
      currency: currencyCode,
      /** Defaults to the start date. */
      validFrom: daySchema.optional()
    })
    .optional()
})
export type EmployeeCreateInput = z.input<typeof employeeCreateSchema>

export const employeeUpdateSchema = employeeCreateSchema
  .omit({ salary: true })
  .partial()
  .extend({ active: z.boolean().optional() })
  .refine((p) => Object.keys(p).length > 0, { message: 'empty patch' })
export type EmployeeUpdateInput = z.input<typeof employeeUpdateSchema>

/** Hiring a former employee again from a day after their last day (B6: a new employment period). */
export const rehireSchema = z.object({ employeeId: idSchema, startDate: daySchema })
export type RehireInput = z.input<typeof rehireSchema>

export const salaryInputSchema = z.object({
  employeeId: idSchema,
  validFrom: daySchema,
  monthlyMinor: amountSchema.positive(),
  currency: currencyCode
})
export type SalaryInput = z.input<typeof salaryInputSchema>

/** Non-negative decimal rate as text ("1.5", "2", "2,5"): no floating point reaches money (domain/salary.ts). */
const decimalRate = z
  .string()
  .trim()
  .regex(/^\d{1,6}(?:[.,]\d{1,6})?$/, 'decimal like 1.5')

export const COMMISSION_BASES = ['room_revenue_all', 'own_sales', 'extras'] as const
export type CommissionBase = (typeof COMMISSION_BASES)[number]

/** Every pay_policies key with its value schema (S-34…S-38; keys = PayPolicy fields + commissionBase). */
export const payPolicyShape = {
  leaveDaysPerMonth: z.number().int().min(0).max(31),
  unusedLeavePaid: z.boolean(),
  unusedLeaveMultiplier: decimalRate,
  dailyDivisor: z.union([z.number().int().min(1).max(31), z.literal('days_in_month')]),
  leaveCarryOver: z.boolean(),
  standardHoursPerDay: z.number().int().min(1).max(24),
  overtimeMode: z.enum(['none', 'hourly_fixed', 'multiplier']),
  overtimeHourlyMinor: amountSchema.nonnegative(),
  overtimeMultiplier: decimalRate,
  hourlyDivisor: z.number().int().min(1).max(744),
  holidayMultiplier: decimalRate,
  holidayPayMode: z.enum(['hourly', 'daily']),
  commissionMode: z.enum(['none', 'pct', 'fixed']),
  commissionPct: decimalRate,
  commissionFixedMinor: amountSchema.nonnegative(),
  /** What a percentage commission is computed from (default room_revenue_all). */
  commissionBase: z.enum(COMMISSION_BASES)
} as const
export type PayPolicyKey = keyof typeof payPolicyShape
export const PAY_POLICY_KEYS = Object.keys(payPolicyShape) as PayPolicyKey[]
export const payPolicyValuesSchema = z.object(payPolicyShape).partial().strict()
export type PayPolicyValues = z.output<typeof payPolicyValuesSchema>

export const payPolicyPatchSchema = z
  .object({
    /** null/omitted = hotel-wide rule; an id = override for one employee. */
    employeeId: idSchema.nullish(),
    values: payPolicyValuesSchema.default({}),
    /** Keys whose value goes back to the inherited one (hotel rule or default). */
    inherit: z.array(z.enum(PAY_POLICY_KEYS as [PayPolicyKey, ...PayPolicyKey[]])).default([])
  })
  .refine((p) => Object.keys(p.values).length + p.inherit.length > 0, { message: 'empty patch' })
export type PayPolicyPatchInput = z.input<typeof payPolicyPatchSchema>

export const LEAVE_KINDS = ['rest_day', 'annual', 'sick', 'unpaid', 'holiday_worked'] as const

export const leaveInputSchema = z.object({
  employeeId: idSchema,
  date: daySchema,
  kind: z.enum(LEAVE_KINDS),
  note: z.string().max(300).nullish()
})
export type LeaveInput = z.input<typeof leaveInputSchema>

/** Several consecutive leave days of one kind ("3 gün yıllık izin"); written together or not at all. */
export const leaveDaysInputSchema = z.object({
  employeeId: idSchema,
  from: daySchema,
  days: z.number().int().min(1).max(31),
  kind: z.enum(LEAVE_KINDS),
  note: z.string().max(300).nullish()
})
export type LeaveDaysInput = z.input<typeof leaveDaysInputSchema>

/**
 * One work record per employee and day (upserted). Start/end: the employee's own times (S-39); overtime and
 * corrected minutes: Müdür/Sahip only (K-38). `employeeId` omitted = the caller's own employee record.
 */
export const workInputSchema = z
  .object({
    employeeId: idSchema.optional(),
    date: daySchema,
    startTime: clockTime.optional(),
    endTime: clockTime.optional(),
    /** Correction of the derived minutes (e.g. a 24-hour shift). */
    minutesWorked: z.number().int().min(0).max(1440).optional(),
    overtimeMinutes: z.number().int().min(0).max(1440).optional(),
    kind: z.enum(['normal', 'holiday', 'rest_day']).optional(),
    note: z.string().max(300).nullish()
  })
  .refine((w) => (w.startTime === undefined) === (w.endTime === undefined), {
    path: ['endTime'],
    message: 'start and end time go together'
  })
  .refine(
    (w) =>
      w.startTime !== undefined ||
      w.minutesWorked !== undefined ||
      w.overtimeMinutes !== undefined ||
      w.kind !== undefined ||
      w.note !== undefined,
    { message: 'empty work record' }
  )
export type WorkInput = z.input<typeof workInputSchema>

export const STAFF_TXN_KIND_VALUES = [
  'advance',
  'salary_payment',
  'leave_payout',
  'overtime_payment',
  'commission_payment',
  'bonus',
  'deduction'
] as const
export type StaffTxnKindInput = (typeof STAFF_TXN_KIND_VALUES)[number]

export const staffTxnInputSchema = z.object({
  employeeId: idSchema,
  date: daySchema,
  kind: z.enum(STAFF_TXN_KIND_VALUES),
  amountMinor: amountSchema.positive(),
  /** Defaults to the salary currency of the period. */
  currency: currencyCode.optional(),
  /** Salary month the money belongs to; defaults to the month of `date`. */
  periodYear: yearMonthSchema.shape.year.optional(),
  periodMonth: yearMonthSchema.shape.month.optional(),
  note: z.string().max(300).nullish(),
  /** Advance paid from the reception drawer (only when `staff.advanceFromDrawer` is on; G-69, S-38). */
  paidFromDrawer: z.boolean().default(false),
  /** Payment method of the expense row (cash, bank…); optional. */
  methodId: idSchema.nullish(),
  /** Needed only when the expense day is closed (G-72). */
  reason: reasonSchema.optional()
})
export type StaffTxnInput = z.input<typeof staffTxnInputSchema>

export const salaryPeriodQuerySchema = yearMonthSchema.extend({ employeeId: idSchema })
export type SalaryPeriodQuery = z.input<typeof salaryPeriodQuerySchema>

/** Voiding a leave record or a staff transaction (never deleted; G-24). */
export const staffVoidSchema = z.object({ reason: reasonSchema })
export type StaffVoidInput = z.input<typeof staffVoidSchema>

/** Records of one employee (omitted = the caller's own card) in an inclusive day range. */
export const staffRangeSchema = z
  .object({ employeeId: idSchema.optional(), from: daySchema, to: daySchema })
  .refine((r) => r.to >= r.from, { path: ['to'], message: 'to must not be before from' })
export type StaffRangeInput = z.input<typeof staffRangeSchema>
