// Faz 7: day ledger, month view, expenses, cash drawer, collections (the owner's "x"), extra service sales, day
// close, the expense description dictionary. Payments written here are the same `payments` rows the reservation
// panel writes (tek giriş, G-60); expenses written by staff pay, laundry and supply stay theirs (kind ≠ manual).
// Spread into the contract by ./index.ts; handlers in src/main/api/handlers/ledger.ts.
import * as z from 'zod'
import { METHOD_GROUPS } from '../../domain/cash'
import { okSchema } from '../admin'
import {
  daySchema,
  descriptionSuggestSchema,
  expenseCreateSchema,
  expenseUpdateSchema,
  reasonSchema
} from '../expenses'
import { dayNoteSchema, yearMonthSchema } from '../ledger'
import { byId, empty, proc, type Procedure } from '../proc'
import { i18nTextSchema, idSchema, localDateSchema, minorSchema } from '../rooms'
import { extraSaleSchema, handoverSchema, paymentCreateSchema, paymentUpdateSchema } from '../reservations'
import { STAFF_TXN_KIND_VALUES } from '../staff'

export const LEDGER_SORTS = ['method', 'time'] as const
export type LedgerSort = (typeof LEDGER_SORTS)[number]

const methodGroupSchema = z.enum(METHOD_GROUPS)
/** Currency code → signed amount in minor units. */
const perCurrencySchema = z.record(z.string(), z.number().int())

/** The frozen base-currency value of a row (K-15, S-32): null base value = no rate was known. */
const fxFields = {
  amountBaseMinor: minorSchema.nullable(),
  /** Base units per unit × 1 000 000. */
  fxRateToBase: z.number().int().nullable(),
  /** When the rate used was observed; much older than the row = "son bilinen kur" (badge). */
  fxRateObservedAt: z.string().nullable(),
  fxSource: z.string().nullable()
}

export const ledgerIncomeRowSchema = z.object({
  id: idSchema,
  /** Entry time (ISO). */
  at: z.string(),
  date: localDateSchema,
  kind: z.enum(['payment', 'deposit', 'refund']),
  methodId: idSchema,
  methodCode: z.string(),
  methodGroup: methodGroupSchema,
  isCash: z.boolean(),
  amountMinor: minorSchema,
  currency: z.string(),
  ...fxFields,
  /** Currency of the payment's folio (typed rates of the edit form, K-43). */
  folioCurrency: z.string(),
  channelId: idSchema.nullable(),
  /** The payment's channel, else the reservation's (the Excel "Platform" column). */
  channelCode: z.string().nullable(),
  reservationId: idSchema.nullable(),
  reservationCode: z.string().nullable(),
  guestName: z.string().nullable(),
  roomNumbers: z.array(z.string()),
  /** A stand-alone sale (luggage storage…): the sale's title; null on a reservation. */
  saleTitle: z.string().nullable(),
  reference: z.string().nullable(),
  note: z.string().nullable(),
  collected: z.boolean(),
  collectedAt: z.string().nullable(),
  collectedByName: z.string().nullable(),
  handoverId: idSchema.nullable(),
  createdByName: z.string().nullable(),
  /** Employee card of the account that wrote the row (the month view's "çalışan" filter). */
  recordedByEmployeeId: idSchema.nullable(),
  voided: z.boolean(),
  voidReason: z.string().nullable()
})
export type LedgerIncomeRowView = z.infer<typeof ledgerIncomeRowSchema>

export const ledgerExpenseItemSchema = z.object({
  id: idSchema,
  productId: idSchema,
  productName: z.string().nullable(),
  qtyMilli: z.number().int(),
  unitPriceMinor: minorSchema,
  amountMinor: minorSchema
})

export const ledgerExpenseRowSchema = z.object({
  id: idSchema,
  at: z.string(),
  date: localDateSchema,
  sectionId: idSchema,
  sectionCode: z.string(),
  /** manual = written in the ledger; staff / laundry rows are written (and changed) by their own screens. */
  kind: z.enum(['manual', 'staff', 'laundry']),
  /** Salary, advance, leave payout… of a staff expense. */
  staffKind: z.enum(STAFF_TXN_KIND_VALUES).nullable(),
  description: z.string(),
  descriptionKey: z.string(),
  amountMinor: minorSchema,
  currency: z.string(),
  ...fxFields,
  methodId: idSchema.nullable(),
  methodGroup: methodGroupSchema,
  paidFromDrawer: z.boolean(),
  settled: z.boolean(),
  handoverId: idSchema.nullable(),
  employeeId: idSchema.nullable(),
  employeeName: z.string().nullable(),
  laundrySettlementId: idSchema.nullable(),
  items: z.array(ledgerExpenseItemSchema),
  createdByName: z.string().nullable(),
  recordedByEmployeeId: idSchema.nullable(),
  voided: z.boolean(),
  voidReason: z.string().nullable()
})
export type LedgerExpenseRowView = z.infer<typeof ledgerExpenseRowSchema>

export const ledgerTotalsSchema = z.object({
  baseCurrency: z.string(),
  revenueBaseMinor: minorSchema,
  expensesBaseMinor: minorSchema,
  netBaseMinor: minorSchema,
  /** Rows left out of the base totals because no rate was known. */
  missingRate: z.number().int(),
  /** Per original currency: income (refunds negative) and expenses of the visible rows. */
  byCurrency: z.array(
    z.object({ currency: z.string(), incomeMinor: minorSchema, expensesMinor: minorSchema })
  )
})

export const ledgerDaySchema = z.object({
  date: localDateSchema,
  status: z.enum(['open', 'closed']),
  closedAt: z.string().nullable(),
  closedByName: z.string().nullable(),
  note: z.string().nullable(),
  closingEnabled: z.boolean(),
  income: z.array(ledgerIncomeRowSchema),
  expenses: z.array(ledgerExpenseRowSchema),
  totals: ledgerTotalsSchema,
  /** A section is hidden from the caller: the expense totals are a partial view (kısmi görünüm). */
  partial: z.boolean()
})
export type LedgerDayView = z.infer<typeof ledgerDaySchema>

export const ledgerMonthSchema = z.object({
  year: z.number().int(),
  month: z.number().int(),
  from: localDateSchema,
  /** Exclusive end. */
  to: localDateSchema,
  baseCurrency: z.string(),
  closingEnabled: z.boolean(),
  /** Days with a note or a closed status. */
  days: z.array(
    z.object({ date: localDateSchema, status: z.enum(['open', 'closed']), note: z.string().nullable() })
  ),
  income: z.array(ledgerIncomeRowSchema),
  expenses: z.array(ledgerExpenseRowSchema),
  employees: z.array(z.object({ id: idSchema, name: z.string() })),
  partial: z.boolean()
})
export type LedgerMonthView = z.infer<typeof ledgerMonthSchema>

export const handoverViewSchema = z.object({
  id: idSchema,
  at: z.string(),
  byName: z.string().nullable(),
  note: z.string().nullable(),
  /** Uncollected money taken in this batch: currency × method group. */
  pending: z.record(z.string(), z.record(z.string(), z.number().int())),
  /** Cash per currency after the drawer expenses settled in the same batch. */
  drawer: perCurrencySchema,
  paymentCount: z.number().int(),
  expenseCount: z.number().int(),
  revertedAt: z.string().nullable(),
  revertedByName: z.string().nullable(),
  revertReason: z.string().nullable()
})
export type HandoverView = z.infer<typeof handoverViewSchema>

export const cashPanelSchema = z.object({
  baseCurrency: z.string(),
  /** Not yet collected: currency × method group (the Excel "KASA DURUMU"). */
  pending: z.record(z.string(), z.record(z.string(), z.number().int())),
  /** The same for rows dated today or earlier: what "everything up to today" takes (B17). */
  pendingToday: z.record(z.string(), z.record(z.string(), z.number().int())),
  /** What should be in the drawer per currency: uncollected cash − unsettled drawer expenses. */
  drawer: perCurrencySchema,
  /** The month's channel totals (collected or not): channel code → currency → amount. */
  channels: z.record(z.string(), perCurrencySchema),
  monthFrom: localDateSchema,
  uncollectedCount: z.number().int(),
  unsettledExpenseCount: z.number().int(),
  /** Oldest day with an uncollected row (null = nothing waiting). */
  oldestDate: localDateSchema.nullable(),
  lastHandover: handoverViewSchema.nullable(),
  partial: z.boolean(),
  /** Cash "everything up to today" takes (cash rows dated today or earlier), per currency (QA2a). */
  cashToday: perCurrencySchema,
  /** Unsettled drawer expenses per day and currency, staff money apart: settled with the cash a handover takes. */
  drawerOut: z.array(
    z.object({
      date: localDateSchema,
      currency: z.string(),
      expensesMinor: z.number().int(),
      staffMinor: z.number().int()
    })
  )
})
export type CashPanelView = z.infer<typeof cashPanelSchema>

/** The Today card (P9c): what is in the drawer, how much waits for the owner, the last handover. */
export const drawerSummarySchema = z.object({
  drawer: perCurrencySchema,
  /** Every uncollected payment (all methods) per currency. */
  pending: perCurrencySchema,
  uncollectedCount: z.number().int(),
  lastHandover: z.object({ at: z.string(), byName: z.string().nullable() }).nullable(),
  partial: z.boolean()
})
export type DrawerSummary = z.infer<typeof drawerSummarySchema>

export const reservationHitSchema = z.object({
  reservationId: idSchema,
  code: z.string(),
  guestName: z.string(),
  roomNumbers: z.array(z.string()),
  checkIn: localDateSchema,
  checkOut: localDateSchema,
  status: z.string(),
  currency: z.string(),
  balanceMinor: minorSchema,
  channelId: idSchema.nullable()
})
export type ReservationHit = z.infer<typeof reservationHitSchema>

const named = {
  id: idSchema,
  code: z.string().nullable(),
  name: z.string().nullable(),
  nameI18n: i18nTextSchema.nullable()
}

export const ledgerOptionsSchema = z.object({
  today: localDateSchema,
  baseCurrency: z.string(),
  currencies: z.array(z.string()),
  closingEnabled: z.boolean(),
  /** The caller's remembered order of the day's rows. */
  sort: z.enum(LEDGER_SORTS),
  methods: z.array(z.object({ ...named, group: methodGroupSchema, isCash: z.boolean() })),
  channels: z.array(z.object({ ...named, kind: z.string() })),
  extraServices: z.array(
    z.object({
      ...named,
      defaultPriceMinor: minorSchema.nullable(),
      defaultCurrency: z.string().nullable(),
      unit: z.string()
    })
  ),
  /** `drawerAllowed` false: the owner's hidden section is never paid from the drawer (K-42). */
  sections: z.array(z.object({ ...named, canEdit: z.boolean(), drawerAllowed: z.boolean() }))
})
export type LedgerOptions = z.infer<typeof ledgerOptionsSchema>

export const descriptionGroupSchema = z.object({
  key: z.string(),
  /** The newest spelling: what the autocomplete offers. */
  description: z.string(),
  count: z.number().int(),
  /** Spellings that fall into this group ("su", "Su ") with how often each was used. */
  spellings: z.array(z.object({ description: z.string(), count: z.number().int() }))
})
export type DescriptionGroup = z.infer<typeof descriptionGroupSchema>

const writtenSchema = z.object({ id: idSchema })

export const ledgerProcedures = {
  'ledger.options': proc(empty, ledgerOptionsSchema),
  'ledger.day': proc(
    z.object({ date: daySchema, includeVoided: z.boolean().optional() }).strict(),
    ledgerDaySchema
  ),
  'ledger.month': proc(yearMonthSchema.strict(), ledgerMonthSchema),
  'ledger.setSort': proc(z.object({ sort: z.enum(LEDGER_SORTS) }).strict(), okSchema),
  'ledger.setDayNote': proc(dayNoteSchema.strict(), okSchema),
  'ledger.closeDay': proc(z.object({ date: daySchema }).strict(), okSchema),
  'ledger.reopenDay': proc(z.object({ date: daySchema, reason: reasonSchema }).strict(), okSchema),

  // Drawer panel and the owner's "x" (G-64, S-30, S-31).
  'ledger.cashPanel': proc(empty, cashPanelSchema),
  'ledger.drawerSummary': proc(empty, drawerSummarySchema),
  'ledger.handovers': proc(
    z.object({ limit: z.number().int().min(1).max(200).optional() }).strict(),
    z.array(handoverViewSchema)
  ),
  'ledger.handover': proc(
    handoverSchema.strict(),
    z.object({ id: idSchema, payments: z.number().int(), expenses: z.number().int() })
  ),
  'ledger.revertHandover': proc(z.object({ id: idSchema, reason: reasonSchema }).strict(), okSchema),

  // Income: payments on a reservation (the same rows as the reservation panel) and extra service sales.
  'ledger.searchReservations': proc(
    z.object({ q: z.string().trim().max(80).optional(), date: daySchema }).strict(),
    z.array(reservationHitSchema)
  ),
  'ledger.addPayment': proc(paymentCreateSchema, writtenSchema),
  'ledger.updatePayment': proc(
    z.object({ id: idSchema, patch: paymentUpdateSchema }).strict(),
    writtenSchema
  ),
  'ledger.voidPayment': proc(z.object({ id: idSchema, reason: reasonSchema }).strict(), writtenSchema),
  'ledger.sellExtra': proc(
    extraSaleSchema.strict(),
    z.object({ folioId: idSchema, chargeId: idSchema, paymentId: idSchema.nullable() })
  ),

  // Expenses (G-66, G-67, G-71) and the description dictionary.
  'ledger.expense': proc(byId, ledgerExpenseRowSchema),
  'ledger.addExpense': proc(expenseCreateSchema, writtenSchema),
  'ledger.updateExpense': proc(
    z.object({ id: idSchema, patch: expenseUpdateSchema }).strict(),
    writtenSchema
  ),
  'ledger.voidExpense': proc(z.object({ id: idSchema, reason: reasonSchema }).strict(), writtenSchema),
  'ledger.suggestDescriptions': proc(
    descriptionSuggestSchema,
    z.array(z.object({ description: z.string(), key: z.string(), count: z.number().int() }))
  ),
  'ledger.descriptionGroups': proc(empty, z.array(descriptionGroupSchema)),
  'ledger.renameDescription': proc(
    z
      .object({
        key: z.string().min(1).max(200),
        description: z.string().trim().min(1).max(200),
        /** Rows on a closed day change only with `ledger.locked` and this reason (G-72). */
        reason: reasonSchema.optional()
      })
      .strict(),
    /** `skippedClosed`: rows on closed days that kept their text. */
    z.object({ changed: z.number().int(), key: z.string(), skippedClosed: z.number().int() })
  ),
  /** K-43: which currencies have no rate to the base currency now (the forms ask for a typed rate only then). */
  'ledger.knownRates': proc(
    z.object({ currencies: z.array(z.string().regex(/^[A-Z]{3}$/)).max(20) }).strict(),
    z.object({ base: z.string(), missing: z.array(z.string()) })
  )
} as const satisfies Record<string, Procedure>
