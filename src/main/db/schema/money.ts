import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { bool, day, i18nJson, id, minor, timestamps } from './columns'
import { paymentMethods } from './reservations'

// Expenses, cash handovers and business days (03-mimari.md §4.5; G-62…G-72, K-35). No ready-made expense
// categories (S-33): free description + normalised key; visibility by section (general / owner, G-67).

export const expenseSections = sqliteTable(
  'expense_sections',
  {
    id: id(),
    code: text('code').notNull(),
    name: text('name'),
    nameI18n: i18nJson('name_i18n_json'),
    /** Permission needed to see and write this section's rows. */
    visibilityPermission: text('visibility_permission', { enum: ['expenses', 'expenses.owner'] }).notNull(),
    sort: integer('sort').notNull().default(0),
    active: bool('active').notNull().default(true),
    ...timestamps
  },
  (t) => [uniqueIndex('expense_sections_code_unique').on(t.code)]
)

export const expenses = sqliteTable(
  'expenses',
  {
    id: id(),
    date: day('date').notNull(),
    sectionId: text('section_id')
      .notNull()
      .references(() => expenseSections.id),
    amountMinor: minor('amount_minor').notNull(),
    currency: text('currency').notNull(),
    fxRateToBase: integer('fx_rate_to_base'),
    fxRateAt: text('fx_rate_at'),
    fxSource: text('fx_source'),
    amountBaseMinor: minor('amount_base_minor'),
    /** When the rate used was observed ("kur 9 saat önceki"); null = same currency or no rate. Added in 0002. */
    fxRateObservedAt: text('fx_rate_observed_at'),
    description: text('description').notNull(),
    /** Normalised description: autocomplete and "en çok harcama" grouping. */
    descriptionKey: text('description_key').notNull(),
    vendorContactId: text('vendor_contact_id'),
    kind: text('kind', { enum: ['manual', 'staff', 'laundry'] })
      .notNull()
      .default('manual'),
    /** The Excel expense "x": paid out of the reception drawer. */
    paidFromDrawer: bool('paid_from_drawer').notNull().default(false),
    methodId: text('method_id').references(() => paymentMethods.id),
    settledAt: text('settled_at'),
    handoverId: text('handover_id'),
    employeeId: text('employee_id'),
    staffTxnId: text('staff_txn_id'),
    laundrySettlementId: text('laundry_settlement_id'),
    voidedAt: text('voided_at'),
    voidReason: text('void_reason'),
    createdBy: text('created_by'),
    ...timestamps
  },
  (t) => [
    index('expenses_date_idx').on(t.date),
    index('expenses_key_idx').on(t.descriptionKey),
    index('expenses_section_idx').on(t.sectionId),
    // Unsettled drawer expenses for the cash panel and the handover. Added in 0002.
    index('expenses_drawer_idx').on(t.paidFromDrawer, t.settledAt)
  ]
)

/** Product lines of a purchase written as an expense (G-71, K-35). Quantities in thousandths (1,5 kg = 1500). */
export const expenseItems = sqliteTable(
  'expense_items',
  {
    id: id(),
    expenseId: text('expense_id')
      .notNull()
      .references(() => expenses.id),
    productId: text('product_id').notNull(),
    qtyMilli: integer('qty_milli').notNull(),
    unitPriceMinor: minor('unit_price_minor').notNull(),
    amountMinor: minor('amount_minor').notNull(),
    ...timestamps
  },
  (t) => [
    index('expense_items_expense_idx').on(t.expenseId),
    index('expense_items_product_idx').on(t.productId)
  ]
)

export const cashHandovers = sqliteTable(
  'cash_handovers',
  {
    id: id(),
    at: text('at').notNull(),
    byUser: text('by_user'),
    note: text('note'),
    totals: text('totals_json', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
    /** Undoing a handover is a new state of the same batch, never a deletion (§6.4). */
    revertedAt: text('reverted_at'),
    revertedBy: text('reverted_by'),
    revertReason: text('revert_reason'),
    ...timestamps
  },
  (t) => [index('cash_handovers_at_idx').on(t.at)]
)

export const businessDays = sqliteTable('business_days', {
  date: day('date').primaryKey(),
  status: text('status', { enum: ['open', 'closed'] })
    .notNull()
    .default('open'),
  closedAt: text('closed_at'),
  closedBy: text('closed_by'),
  /** The owner's day note ("Selin izin kullandı"). */
  note: text('note'),
  sortPref: text('sort_pref'),
  ...timestamps
})
