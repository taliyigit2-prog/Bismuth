// Faz 10: reports, KPIs, month-end check, exports (G-100…G-105, G-70; 03-mimari.md §6.10).
// Spread into the contract by ./index.ts; handlers in src/main/api/handlers/reports.ts.
// Periods are [from, to) local days; money is integer minor units in the hotel's base currency (rates frozen when the
// row was written, K-15) unless a field says "original"; ratios are basis points.
import * as z from 'zod'
import { APP_LOCALES } from '../../format'
import { diffDays, isLocalDate, type LocalDate } from '../../date'
import { METHOD_GROUPS } from '../../domain/cash'
import { MAX_PERIOD_DAYS } from '../../domain/reports-period'
import { exportFileSchema } from '../backup'
import { proc, type Procedure } from '../proc'
import { i18nTextSchema, idSchema, localDateSchema, minorSchema } from '../rooms'
import { salaryPeriodViewSchema } from './staff'

const count = z.number().int().nonnegative()
const bp = z.number().int()
const methodGroupSchema = z.enum(METHOD_GROUPS)

/** A list row's display name: the hotel's own name, or the seeded name in three languages. */
export const listNameSchema = z.object({ name: z.string().nullable(), nameI18n: i18nTextSchema.nullable() })
export type ListName = z.infer<typeof listNameSchema>

const periodRules = <T extends z.ZodType<{ from: string; to: string }>>(schema: T) =>
  schema
    .refine((p) => p.from < p.to, { path: ['to'], message: 'to after from' })
    .refine(
      (p) =>
        !isLocalDate(p.from) ||
        !isLocalDate(p.to) ||
        diffDays(p.from as LocalDate, p.to as LocalDate) <= MAX_PERIOD_DAYS,
      { path: ['to'], message: 'period too long' }
    )

export const periodInputSchema = periodRules(
  z.object({ from: localDateSchema, to: localDateSchema }).strict()
)
export type PeriodInput = z.input<typeof periodInputSchema>

/** "Konaklama türü" filter of the occupancy views (K-48): nights only, hourly (same-day) stays only, or both. */
export const STAY_KINDS = ['all', 'overnight', 'hourly'] as const
export type StayKind = (typeof STAY_KINDS)[number]

/** A period read that can be narrowed to one kind of stay (summary KPIs, occupancy report). */
export const kindedPeriodInputSchema = periodRules(
  z.object({ from: localDateSchema, to: localDateSchema, stayKind: z.enum(STAY_KINDS).optional() }).strict()
)
export type KindedPeriodInput = z.input<typeof kindedPeriodInputSchema>

const yearSchema = z.number().int().min(2000).max(2100)

export const missingRateSchema = z.object({ payments: count, expenses: count })

// ── Context ─────────────────────────────────────────────────────────────────────────────────────────────────────

export const reportsContextSchema = z.object({
  today: localDateSchema,
  baseCurrency: z.string(),
  /** First day with any payment, expense or night; null on an empty hotel. */
  firstDay: localDateSchema.nullable(),
  /** Same-day and hourly stays always count (S-105); the old `reports.dayUseInOccupancy` switch is gone. */
  dayUseIncluded: z.boolean()
})
export type ReportsContext = z.infer<typeof reportsContextSchema>

// ── KPI summary (S-40 order: revenue, profit, expenses, occupancy) ──────────────────────────────────────────────

export const reportSummarySchema = z.object({
  from: localDateSchema,
  to: localDateSchema,
  baseCurrency: z.string(),
  occupancy: z.object({
    soldNights: count,
    /** Same-day and hourly sales in the period (each room-day with one counts once in `soldNights`). */
    dayUseNights: count,
    sellableNights: count,
    occupancyBp: bp,
    dayUseIncluded: z.boolean(),
    /** Overnight stays checking in in the period and their average length (hundredths of a night). */
    stays: count,
    alosHundredths: count
  }),
  /** Null without `reports.finance`. */
  finance: z
    .object({
      revenueMinor: minorSchema,
      expensesMinor: minorSchema,
      profitMinor: minorSchema,
      /** Room-night charges of the period's nights (ADR, RevPAR). */
      roomRevenueMinor: minorSchema,
      adrMinor: minorSchema,
      revparMinor: minorSchema,
      missingRate: missingRateSchema,
      /** Room-night charges in another currency with no rate known yet: left out of the room revenue. */
      missingNightRates: count,
      /** Some expense section is hidden from the caller. */
      partial: z.boolean()
    })
    .nullable()
})
export type ReportSummary = z.infer<typeof reportSummarySchema>

// ── Monthly summary ("Eylül Özet") ──────────────────────────────────────────────────────────────────────────────

export const incomeCellSchema = z.object({
  methodGroup: methodGroupSchema,
  currency: z.string(),
  /** Original currency, refunds subtracted. */
  amountMinor: minorSchema,
  baseMinor: minorSchema
})

export const channelTotalSchema = listNameSchema.extend({
  /** 'none' = payments with no sales channel at all. */
  code: z.string(),
  baseMinor: minorSchema
})

export const dailyRowSchema = z.object({
  date: localDateSchema,
  revenueMinor: minorSchema,
  expensesMinor: minorSchema,
  byMethod: z.partialRecord(methodGroupSchema, minorSchema),
  byChannel: z.record(z.string(), minorSchema)
})
export type DailyRow = z.infer<typeof dailyRowSchema>

export const sectionTotalSchema = listNameSchema.extend({
  code: z.string(),
  ownerOnly: z.boolean(),
  totalMinor: minorSchema
})

export const topGroupSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('staff'), totalMinor: minorSchema }),
  z.object({ kind: z.literal('laundry'), totalMinor: minorSchema }),
  z.object({ kind: z.literal('category'), categoryId: z.string(), totalMinor: minorSchema }),
  z.object({ kind: z.literal('description'), key: z.string(), label: z.string(), totalMinor: minorSchema })
])

export const categoryNameSchema = listNameSchema.extend({ id: idSchema })

/** Where a foreign-currency row's frozen rate came from (`none` = no rate known yet, left out of the totals). */
export const FX_SOURCE_KINDS = ['market_mid', 'user_api', 'tcmb', 'hotel', 'manual', 'none'] as const
export type FxSourceKind = (typeof FX_SOURCE_KINDS)[number]

/**
 * Faz 11 teslimat 5: the period's foreign-currency payments and (visible, K-42) expenses by currency × rate source;
 * `provider` names the market source (truncgil, frankfurter…) when the rate was a market one.
 */
export const fxSourceRowSchema = z.object({
  kind: z.enum(['payment', 'expense']),
  source: z.enum(FX_SOURCE_KINDS),
  provider: z.string().nullable(),
  currency: z.string(),
  rows: count,
  /** Original currency, refunds subtracted. */
  amountMinor: minorSchema,
  /** Base currency (0 for rows without a rate). */
  baseMinor: minorSchema
})
export type FxSourceRow = z.infer<typeof fxSourceRowSchema>

/**
 * Faz 12 teslimat 2 "tedarik giderleri": purchases with product lines in the caller's sections, by product
 * category in the base currency (each line's share with its purchase's own rate); null without `supplies`.
 */
export const supplySpendSchema = z.object({
  totalMinor: minorSchema,
  purchases: count,
  /** Purchases in another currency with no rate yet: not in the totals. */
  missingRate: count,
  categories: z.array(z.object({ categoryId: idSchema, totalMinor: minorSchema, purchases: count }))
})
export type SupplySpend = z.infer<typeof supplySpendSchema>

export const monthlyReportSchema = z.object({
  from: localDateSchema,
  to: localDateSchema,
  baseCurrency: z.string(),
  revenueMinor: minorSchema,
  expensesMinor: minorSchema,
  profitMinor: minorSchema,
  /** Method × currency (the Excel "GELİR DETAYLARI"). */
  income: z.array(incomeCellSchema),
  /** Platform totals: part of the revenue, never added to it again. */
  channels: z.array(channelTotalSchema),
  /** Days with income or expenses, oldest first. */
  daily: z.array(dailyRowSchema),
  /** Visible expense sections ("Resmi giderler" / "Yönetici giderleri", G-67). */
  sections: z.array(sectionTotalSchema),
  /** The owner's hidden section by description (Tutar · Açıklama); null without `expenses.owner`. */
  ownerExpenses: z.array(topGroupSchema).nullable(),
  topExpenses: z.array(topGroupSchema),
  categories: z.array(categoryNameSchema),
  /** Supply spending by product category; null without `supplies`. */
  supply: supplySpendSchema.nullable(),
  fxSources: z.array(fxSourceRowSchema),
  missingRate: missingRateSchema,
  partial: z.boolean()
})
export type MonthlyReport = z.infer<typeof monthlyReportSchema>

// ── Yearly summary ──────────────────────────────────────────────────────────────────────────────────────────────

export const yearlyInputSchema = z
  .object({ years: z.array(yearSchema).min(1).max(2) })
  .strict()
  .refine((v) => new Set(v.years).size === v.years.length, { path: ['years'], message: 'same year twice' })

export const yearlyReportSchema = z.object({
  baseCurrency: z.string(),
  years: z.array(
    z.object({
      year: yearSchema,
      months: z.array(
        z.object({
          month: z.number().int().min(1).max(12),
          revenueMinor: minorSchema,
          expensesMinor: minorSchema
        })
      )
    })
  ),
  partial: z.boolean()
})
export type YearlyReport = z.infer<typeof yearlyReportSchema>

// ── Occupancy and room KPIs ─────────────────────────────────────────────────────────────────────────────────────

const nightsSchema = z.object({ soldNights: count, dayUseNights: count, sellableNights: count })

export const occupancyReportSchema = z.object({
  from: localDateSchema,
  to: localDateSchema,
  baseCurrency: z.string(),
  dayUseIncluded: z.boolean(),
  months: z.array(nightsSchema.extend({ month: z.string() })),
  /** Month × weekday (0 = Sunday): the Saturday effect. */
  heatmap: z.array(nightsSchema.extend({ month: z.string(), weekday: z.number().int().min(0).max(6) })),
  roomTypes: z.array(
    nightsSchema.extend({
      id: idSchema,
      name: z.string(),
      nameI18n: i18nTextSchema.nullable(),
      revenueMinor: minorSchema.nullable()
    })
  ),
  rooms: z.array(
    nightsSchema.extend({
      id: idSchema,
      number: z.string(),
      typeId: idSchema,
      revenueMinor: minorSchema.nullable()
    })
  ),
  /** Guests with a stay checking in in the period, and those who had stayed before (or twice in it). */
  guests: z.object({ total: count, repeat: count, repeatBp: bp }),
  /** Most revenue by guest; null without `reports.finance` and `guests`. */
  topGuests: z
    .array(z.object({ guestId: idSchema, name: z.string(), stays: count, revenueMinor: minorSchema }))
    .nullable(),
  /**
   * Bookings that did not happen and money that went back, each on its own line (K-55): cancelled and "gelmedi"
   * reservations of the period; refund rows and their base-currency total (null without `reports.finance`).
   */
  outcomes: z.object({
    cancelled: count,
    noShow: count,
    refundRows: count.nullable(),
    refundMinor: minorSchema.nullable()
  }),
  /** Room-night charges in another currency with no rate known yet: left out of the room revenue. */
  missingNightRates: count
})
export type OccupancyReport = z.infer<typeof occupancyReportSchema>

// ── Cash drawer and payments ────────────────────────────────────────────────────────────────────────────────────

export const AGE_BUCKETS = ['d0_7', 'd8_30', 'd31_90', 'd90'] as const
export type AgeBucket = (typeof AGE_BUCKETS)[number]

export const cashReportSchema = z.object({
  from: localDateSchema,
  to: localDateSchema,
  today: localDateSchema,
  baseCurrency: z.string(),
  methods: z.array(
    listNameSchema.extend({
      methodId: idSchema,
      code: z.string(),
      group: methodGroupSchema,
      currency: z.string(),
      amountMinor: minorSchema,
      baseMinor: minorSchema,
      pendingMinor: minorSchema,
      rows: count,
      pendingRows: count
    })
  ),
  handovers: z.array(
    z.object({
      id: idSchema,
      at: z.string(),
      byName: z.string().nullable(),
      paymentCount: count,
      totals: z.array(z.object({ currency: z.string(), amountMinor: minorSchema })),
      reverted: z.boolean()
    })
  ),
  /** Money not yet taken by the owner (all days up to the period's end), by age. */
  aging: z.array(z.object({ bucket: z.enum(AGE_BUCKETS), baseMinor: minorSchema, rows: count })),
  /** Non-cash rows of the period without the "x" (card, IBAN and the hotel's own methods; newest first, ≤ 300). */
  unchecked: z.array(
    z.object({
      id: idSchema,
      date: localDateSchema,
      group: methodGroupSchema,
      amountMinor: minorSchema,
      currency: z.string(),
      guestName: z.string().nullable(),
      reservationCode: z.string().nullable(),
      channelCode: z.string().nullable()
    })
  ),
  uncheckedTotal: count,
  /** What should be in the drawer now, per currency (uncollected cash − unsettled drawer expenses). */
  drawer: z.array(z.object({ currency: z.string(), amountMinor: minorSchema }))
})
export type CashReport = z.infer<typeof cashReportSchema>

// ── Expenses ────────────────────────────────────────────────────────────────────────────────────────────────────

export const expensesReportSchema = z.object({
  from: localDateSchema,
  to: localDateSchema,
  baseCurrency: z.string(),
  totalMinor: minorSchema,
  staffMinor: minorSchema,
  revenueMinor: minorSchema,
  /** Staff cost ÷ revenue (salary, advance, leave pay, overtime, bonus paid). */
  laborRatioBp: bp,
  months: z.array(z.object({ month: z.string(), totalMinor: minorSchema, staffMinor: minorSchema })),
  sections: z.array(sectionTotalSchema),
  topExpenses: z.array(topGroupSchema),
  categories: z.array(categoryNameSchema),
  /** Foreign-currency expenses by rate source (no payments here). */
  fxSources: z.array(fxSourceRowSchema),
  missingRate: missingRateSchema,
  partial: z.boolean()
})
export type ExpensesReport = z.infer<typeof expensesReportSchema>

// ── Staff ───────────────────────────────────────────────────────────────────────────────────────────────────────

export const STAFF_COST_KINDS = [
  'salary_payment',
  'advance',
  'leave_payout',
  'overtime_payment',
  'commission_payment',
  'other'
] as const
export const LEAVE_KINDS = ['rest_day', 'annual', 'sick', 'unpaid', 'holiday_worked'] as const

export const staffInputSchema = z.object({ year: yearSchema }).strict()

export const staffReportSchema = z.object({
  year: yearSchema,
  baseCurrency: z.string(),
  /** `staff.salary`: the money columns are filled (null / empty without it). */
  salaryVisible: z.boolean(),
  /** Some expense section is hidden from the caller: costs are the visible part. */
  partial: z.boolean(),
  employees: z.array(
    z.object({
      id: idSchema,
      name: z.string(),
      position: z.string().nullable(),
      active: z.boolean(),
      /** Null without `staff.salary`. */
      costMinor: minorSchema.nullable(),
      byKind: z.partialRecord(z.enum(STAFF_COST_KINDS), minorSchema),
      leave: z.partialRecord(z.enum(LEAVE_KINDS), count),
      workedMinutes: count,
      overtimeMinutes: count
    })
  ),
  months: z.array(z.object({ month: z.number().int().min(1).max(12), costMinor: minorSchema.nullable() })),
  /** Null without `reports.finance`. */
  revenueMinor: minorSchema.nullable(),
  /** Null without `staff.salary` and `reports.finance`. */
  laborRatioBp: bp.nullable()
})
export type StaffReport = z.infer<typeof staffReportSchema>

// ── Month-end check (G-100, akislar.md §2) ──────────────────────────────────────────────────────────────────────

/** Always on the month-end table; every other method group appears when it has money in the month (G-100). */
export const CHECK_GROUPS = ['card', 'bank', 'cash'] as const

export const monthEndInputSchema = z
  .object({ year: yearSchema, month: z.number().int().min(1).max(12) })
  .strict()

export const monthEndSchema = z.object({
  year: yearSchema,
  month: z.number().int(),
  from: localDateSchema,
  to: localDateSchema,
  today: localDateSchema,
  baseCurrency: z.string(),
  methods: z.array(
    z.object({
      group: methodGroupSchema,
      totalMinor: minorSchema,
      receivedMinor: minorSchema,
      pendingMinor: minorSchema,
      pendingRows: count
    })
  ),
  bankByChannel: z.array(channelTotalSchema),
  revenueMinor: minorSchema,
  expensesMinor: minorSchema,
  profitMinor: minorSchema,
  previous: z.object({ revenueMinor: minorSchema, expensesMinor: minorSchema, profitMinor: minorSchema }),
  occupancy: z.object({
    soldNights: count,
    sellableNights: count,
    previousSold: count,
    previousSellable: count
  }),
  topExpenses: z.array(topGroupSchema),
  categories: z.array(categoryNameSchema),
  /** Null without `staff.salary`. */
  salaries: z.object({ rows: z.array(salaryPeriodViewSchema), withoutSalary: count }).nullable(),
  /** The ministry statistics of the month; null without `tourism_stats`. */
  tourism: z
    .object({ imported: z.boolean(), reportedAt: z.string().nullable(), due: localDateSchema })
    .nullable(),
  fxSources: z.array(fxSourceRowSchema),
  missingRate: missingRateSchema,
  partial: z.boolean()
})
export type MonthEnd = z.infer<typeof monthEndSchema>

/**
 * The owner's own "baktım" ticks of the month-end check (K-46 (6)): kept per person on the main computer, so every
 * device shows the same ticks; a personal view, not a record (no audit row). The other steps tick from the records.
 */
export const MONTH_END_MANUAL_STEPS = ['results', 'top'] as const
export type MonthEndManualStep = (typeof MONTH_END_MANUAL_STEPS)[number]
export const monthEndTicksSchema = z.object({ ticks: z.array(z.enum(MONTH_END_MANUAL_STEPS)) })
export const monthEndTicksInputSchema = z
  .object({
    year: yearSchema,
    month: z.number().int().min(1).max(12),
    ticks: z.array(z.enum(MONTH_END_MANUAL_STEPS)).max(MONTH_END_MANUAL_STEPS.length),
    /** Adds to the ticks already kept instead of replacing them (the one-time move of a device's old ticks). */
    merge: z.boolean().optional()
  })
  .strict()
export type MonthEndTicksInput = z.input<typeof monthEndTicksInputSchema>

// ── Export (G-122, S-43: every table) ───────────────────────────────────────────────────────────────────────────

export const REPORT_KINDS = [
  'summary',
  'monthly',
  'yearly',
  'occupancy',
  'cash',
  'expenses',
  'staff',
  'monthEnd'
] as const
export type ReportKind = (typeof REPORT_KINDS)[number]

export const reportExportInputSchema = z
  .object({
    report: z.enum(REPORT_KINDS),
    /** One table of the report (CSV needs one); absent = every table of it as sheets of one workbook. */
    table: z.string().max(40).optional(),
    format: z.enum(['csv', 'xlsx']),
    locale: z.enum(APP_LOCALES),
    from: localDateSchema.optional(),
    to: localDateSchema.optional(),
    years: z.array(yearSchema).min(1).max(2).optional(),
    year: yearSchema.optional(),
    month: z.number().int().min(1).max(12).optional()
  })
  .strict()
  .refine((v) => v.format === 'xlsx' || !!v.table, { path: ['table'], message: 'csv needs one table' })

export type ReportExportInput = z.input<typeof reportExportInputSchema>

export const reportsProcedures = {
  'reports.context': proc(z.object({}).strict(), reportsContextSchema),
  'reports.summary': proc(kindedPeriodInputSchema, reportSummarySchema),
  'reports.monthly': proc(periodInputSchema, monthlyReportSchema),
  'reports.yearly': proc(yearlyInputSchema, yearlyReportSchema),
  'reports.occupancy': proc(kindedPeriodInputSchema, occupancyReportSchema),
  'reports.cash': proc(periodInputSchema, cashReportSchema),
  'reports.expenses': proc(periodInputSchema, expensesReportSchema),
  'reports.staff': proc(staffInputSchema, staffReportSchema),
  'reports.monthEnd': proc(monthEndInputSchema, monthEndSchema),
  'reports.monthEndTicks': proc(monthEndInputSchema, monthEndTicksSchema),
  'reports.setMonthEndTicks': proc(monthEndTicksInputSchema, monthEndTicksSchema),
  'reports.export': proc(reportExportInputSchema, exportFileSchema)
} as const satisfies Record<string, Procedure>
