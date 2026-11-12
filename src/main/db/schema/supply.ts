import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { bool, day, i18nJson, id, minor, timestamps } from './columns'

// Phone book, products and laundry (03-mimari.md §4.7; G-160, G-170, G-171, K-28, K-35).

export const CONTACT_CATEGORIES = [
  'supplier',
  'laundry',
  'plumber',
  'electrician',
  'taxi',
  'emergency',
  'other'
] as const

export const contacts = sqliteTable(
  'contacts',
  {
    id: id(),
    name: text('name').notNull(),
    nameNormalized: text('name_normalized').notNull(),
    /** A seeded category code, or the hotel's own label (`customCategory`). */
    category: text('category', { enum: [...CONTACT_CATEGORIES, 'custom'] }).notNull(),
    customCategory: text('custom_category'),
    phones: text('phones_json', { mode: 'json' }).$type<{ label: string; number: string }[]>().notNull(),
    address: text('address'),
    email: text('email'),
    note: text('note'),
    favorite: bool('favorite').notNull().default(false),
    active: bool('active').notNull().default(true),
    createdBy: text('created_by'),
    ...timestamps
  },
  (t) => [index('contacts_name_idx').on(t.nameNormalized)]
)

export const productCategories = sqliteTable(
  'product_categories',
  {
    id: id(),
    code: text('code'),
    name: text('name'),
    nameI18n: i18nJson('name_i18n_json'),
    sort: integer('sort').notNull().default(0),
    active: bool('active').notNull().default(true),
    ...timestamps
  },
  (t) => [uniqueIndex('product_categories_code_unique').on(t.code)]
)

export const products = sqliteTable(
  'products',
  {
    id: id(),
    name: text('name').notNull(),
    nameNormalized: text('name_normalized').notNull(),
    categoryId: text('category_id')
      .notNull()
      .references(() => productCategories.id),
    supplierContactId: text('supplier_contact_id').references(() => contacts.id),
    unit: text('unit', { enum: ['piece', 'kg', 'lt', 'pack', 'bag'] }).notNull(),
    /** Optional stock counter, off by default (S-63). */
    trackStock: bool('track_stock').notNull().default(false),
    stockQtyMilli: integer('stock_qty_milli'),
    active: bool('active').notNull().default(true),
    ...timestamps
  },
  (t) => [index('products_name_idx').on(t.nameNormalized)]
)

export const laundryItemTypes = sqliteTable(
  'laundry_item_types',
  {
    id: id(),
    code: text('code'),
    name: text('name'),
    nameI18n: i18nJson('name_i18n_json'),
    sort: integer('sort').notNull().default(0),
    active: bool('active').notNull().default(true),
    ...timestamps
  },
  (t) => [uniqueIndex('laundry_item_types_code_unique').on(t.code)]
)

/** K-28: agreed unit price per laundry × item type with a validity date (price increase history). */
export const laundryPrices = sqliteTable(
  'laundry_prices',
  {
    id: id(),
    laundryContactId: text('laundry_contact_id')
      .notNull()
      .references(() => contacts.id),
    itemTypeId: text('item_type_id')
      .notNull()
      .references(() => laundryItemTypes.id),
    validFrom: day('valid_from').notNull(),
    unitPriceMinor: minor('unit_price_minor').notNull(),
    currency: text('currency').notNull(),
    createdBy: text('created_by'),
    ...timestamps
  },
  (t) => [index('laundry_prices_lookup_idx').on(t.laundryContactId, t.itemTypeId, t.validFrom)]
)

export const laundryDeliveries = sqliteTable(
  'laundry_deliveries',
  {
    id: id(),
    date: day('date').notNull(),
    /** out = dirty handed to the laundry, in = clean slip received (S-95). */
    direction: text('direction', { enum: ['out', 'in'] }).notNull(),
    laundryContactId: text('laundry_contact_id')
      .notNull()
      .references(() => contacts.id),
    slipNo: text('slip_no'),
    note: text('note'),
    voidedAt: text('voided_at'),
    createdBy: text('created_by'),
    ...timestamps
  },
  (t) => [index('laundry_deliveries_date_idx').on(t.laundryContactId, t.date)]
)

export const laundryDeliveryItems = sqliteTable(
  'laundry_delivery_items',
  {
    deliveryId: text('delivery_id')
      .notNull()
      .references(() => laundryDeliveries.id),
    itemTypeId: text('item_type_id')
      .notNull()
      .references(() => laundryItemTypes.id),
    qty: integer('qty').notNull(),
    stainedQty: integer('stained_qty').notNull().default(0),
    slipUnitPriceMinor: minor('slip_unit_price_minor'),
    amountMinor: minor('amount_minor')
  },
  (t) => [primaryKey({ columns: [t.deliveryId, t.itemTypeId] })]
)

export const laundrySettlements = sqliteTable(
  'laundry_settlements',
  {
    id: id(),
    laundryContactId: text('laundry_contact_id')
      .notNull()
      .references(() => contacts.id),
    periodYear: integer('period_year').notNull(),
    periodMonth: integer('period_month').notNull(),
    computedQty: text('computed_qty_json', { mode: 'json' }).$type<Record<string, number>>().notNull(),
    computedTotalMinor: minor('computed_total_minor').notNull(),
    currency: text('currency').notNull(),
    invoicedTotalMinor: minor('invoiced_total_minor'),
    differenceMinor: minor('difference_minor'),
    note: text('note'),
    expenseId: text('expense_id'),
    settledAt: text('settled_at'),
    createdBy: text('created_by'),
    ...timestamps
  },
  (t) => [
    uniqueIndex('laundry_settlements_period_unique').on(t.laundryContactId, t.periodYear, t.periodMonth)
  ]
)
