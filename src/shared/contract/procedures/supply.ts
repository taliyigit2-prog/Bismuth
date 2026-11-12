// Faz 12: products and purchases, laundry deliveries and reconciliation.
// Spread into the contract by ./index.ts; handlers in src/main/api/handlers/supply.ts.
import * as z from 'zod'
import { okSchema } from '../admin'
import { expenseCreateSchema, expenseListSchema, reasonSchema } from '../expenses'
import { byId, includeInactive, proc, type Procedure } from '../proc'
import { i18nTextSchema, idSchema, localDateSchema, minorSchema } from '../rooms'
import {
  laundryDeliveryInputSchema,
  laundryDeliveryListSchema,
  laundryPriceInputSchema,
  laundrySettlementInputSchema,
  PRODUCT_UNITS,
  productCategoryNameSchema,
  productInputSchema,
  productListSchema,
  productUpdateSchema,
  yearMonthSchema
} from '../supply'
import { attachmentViewSchema, photoDataSchema, photoUploadSchema } from './contacts'

const moneySchema = z.object({ amountMinor: minorSchema, currency: z.string() })

// ── Products (G-170, S-63, S-73) ─────────────────────────────────────────────────────────────────────────────

export const productCategoryViewSchema = z.object({
  id: idSchema,
  code: z.string().nullable(),
  name: z.string().nullable(),
  /** Seeded name in three languages until the hotel renames it. */
  displayName: i18nTextSchema.nullable(),
  sort: z.number().int(),
  active: z.boolean()
})
export type ProductCategoryView = z.infer<typeof productCategoryViewSchema>

export const productRowSchema = z.object({
  id: idSchema,
  name: z.string(),
  categoryId: idSchema,
  supplierContactId: idSchema.nullable(),
  unit: z.enum(PRODUCT_UNITS),
  trackStock: z.boolean(),
  stockQtyMilli: z.number().int().nullable(),
  active: z.boolean()
})

export const priceChangeSchema = z.object({
  currency: z.string(),
  lastDate: localDateSchema,
  lastUnitMinor: minorSchema,
  previousDate: localDateSchema,
  previousUnitMinor: minorSchema,
  diffMinor: minorSchema,
  basisPoints: z.number().int().nullable(),
  isIncrease: z.boolean()
})

const consumptionSchema = z.object({
  purchaseCount: z.number().int(),
  /** Thousandths of the product's unit. */
  qty: z.number().int(),
  totals: z.array(moneySchema).readonly()
})

export const productOverviewSchema = productRowSchema.extend({
  supplierName: z.string().nullable(),
  priceChange: priceChangeSchema.nullable(),
  lastPurchase: z
    .object({ date: localDateSchema, unitPriceMinor: minorSchema, currency: z.string() })
    .nullable(),
  thisMonth: consumptionSchema,
  lastMonth: consumptionSchema
})
export type ProductOverview = z.infer<typeof productOverviewSchema>

export const historyLineSchema = z.object({
  date: localDateSchema,
  qty: z.number().int(),
  unitPriceMinor: minorSchema,
  amountMinor: minorSchema,
  currency: z.string(),
  expenseId: idSchema,
  supplierName: z.string().nullable()
})
export type HistoryLine = z.infer<typeof historyLineSchema>

export const monthSummarySchema = z.object({
  year: z.number().int(),
  month: z.number().int(),
  purchaseCount: z.number().int(),
  totals: z.array(moneySchema),
  byProduct: z.array(
    z.object({
      productId: idSchema,
      name: z.string(),
      unit: z.enum(PRODUCT_UNITS),
      qty: z.number().int(),
      purchaseCount: z.number().int(),
      totals: z.array(moneySchema)
    })
  ),
  bySupplier: z.array(
    z.object({
      contactId: idSchema.nullable(),
      name: z.string().nullable(),
      purchaseCount: z.number().int(),
      totals: z.array(moneySchema)
    })
  )
})
export type MonthSummary = z.infer<typeof monthSummarySchema>

// ── Purchases = expenses with product lines (S-74, K-35) ─────────────────────────────────────────────────────

export const purchaseViewSchema = z.object({
  id: idSchema,
  date: localDateSchema,
  amountMinor: minorSchema,
  currency: z.string(),
  description: z.string(),
  vendorContactId: idSchema.nullable(),
  vendorName: z.string().nullable(),
  paidFromDrawer: z.boolean(),
  methodId: idSchema.nullable(),
  sectionCode: z.string(),
  voidedAt: z.string().nullable(),
  voidReason: z.string().nullable(),
  createdAt: z.string(),
  items: z.array(
    z.object({
      id: idSchema,
      productId: idSchema,
      qtyMilli: z.number().int(),
      unitPriceMinor: minorSchema,
      amountMinor: minorSchema
    })
  )
})
export type PurchaseView = z.infer<typeof purchaseViewSchema>

export const expenseSectionChoiceSchema = z.object({
  id: idSchema,
  code: z.string(),
  name: z.string().nullable(),
  nameI18n: i18nTextSchema.nullable(),
  canEdit: z.boolean()
})

const writtenExpenseSchema = z.object({
  id: idSchema,
  date: localDateSchema,
  amountMinor: minorSchema,
  currency: z.string(),
  voidedAt: z.string().nullable()
})

// ── Laundry (G-171, K-28, S-95) ──────────────────────────────────────────────────────────────────────────────

export const laundryPriceViewSchema = z.object({
  id: idSchema,
  laundryContactId: idSchema,
  itemTypeId: idSchema,
  validFrom: localDateSchema,
  unitPriceMinor: minorSchema,
  currency: z.string(),
  createdAt: z.string()
})
export type LaundryPriceView = z.infer<typeof laundryPriceViewSchema>

export const laundryDeliveryViewSchema = z.object({
  id: idSchema,
  date: localDateSchema,
  direction: z.enum(['out', 'in']),
  laundryContactId: idSchema,
  slipNo: z.string().nullable(),
  note: z.string().nullable(),
  voidedAt: z.string().nullable(),
  createdAt: z.string(),
  items: z.array(
    z.object({
      itemTypeId: idSchema,
      qty: z.number().int(),
      stainedQty: z.number().int(),
      slipUnitPriceMinor: minorSchema.nullable(),
      amountMinor: minorSchema.nullable()
    })
  )
})
export type LaundryDeliveryView = z.infer<typeof laundryDeliveryViewSchema>

export const laundryOutstandingViewSchema = z.object({
  contactId: idSchema,
  until: localDateSchema,
  totalPendingQty: z.number().int(),
  lines: z
    .array(
      z.object({
        itemTypeId: idSchema,
        openingQty: z.number().int(),
        outQty: z.number().int(),
        inQty: z.number().int(),
        /** Positive: still at the laundry; negative: more came back than was sent (warning). */
        pendingQty: z.number().int(),
        openingPendingQty: z.number().int(),
        oldestOpenSince: localDateSchema.nullable(),
        daysOpen: z.number().int().nullable()
      })
    )
    .readonly()
})
export type LaundryOutstandingView = z.infer<typeof laundryOutstandingViewSchema>

export const laundryMonthViewSchema = z.object({
  contactId: idSchema,
  year: z.number().int(),
  month: z.number().int(),
  currency: z.string().nullable(),
  deliveryCount: z.number().int(),
  lines: z
    .array(
      z.object({
        itemTypeId: idSchema,
        qty: z.number().int(),
        stainedQty: z.number().int(),
        amountMinor: minorSchema.nullable(),
        unpricedQty: z.number().int()
      })
    )
    .readonly(),
  totalQty: z.number().int(),
  totalStainedQty: z.number().int(),
  totalAmountMinor: minorSchema.nullable(),
  unpricedQty: z.number().int(),
  /** The stored invoice of the month (null until the laundry's invoice is entered). */
  settled: z
    .object({
      id: idSchema,
      invoicedTotalMinor: minorSchema.nullable(),
      differenceMinor: minorSchema.nullable(),
      computedTotalMinor: minorSchema,
      note: z.string().nullable(),
      /** Set when it was marked paid: the expense in the ledger. */
      expenseId: idSchema.nullable(),
      settledAt: z.string().nullable()
    })
    .nullable()
})
export type LaundryMonthView = z.infer<typeof laundryMonthViewSchema>

export const laundryTrendPointSchema = z.object({
  year: z.number().int(),
  month: z.number().int(),
  qty: z.number().int(),
  stainedQty: z.number().int(),
  amountMinor: minorSchema.nullable(),
  currency: z.string(),
  invoicedTotalMinor: minorSchema.nullable()
})
export type LaundryTrendPoint = z.infer<typeof laundryTrendPointSchema>

const contactMonth = yearMonthSchema.extend({ contactId: idSchema }).strict()

/** Photos of a purchase (expense) or a laundry slip. */
const photoOwnerSchema = z.enum(['expense', 'laundry_delivery'])

export const supplyProcedures = {
  'supply.categories': proc(includeInactive, z.array(productCategoryViewSchema)),
  'supply.createCategory': proc(
    z.object({ name: productCategoryNameSchema }).strict(),
    productCategoryViewSchema
  ),
  'supply.overview': proc(
    yearMonthSchema.extend({ includeInactive: z.boolean().optional() }).strict(),
    z.array(productOverviewSchema)
  ),
  /** The bare product list (phone book links, pickers). */
  'supply.products': proc(productListSchema, z.array(productRowSchema)),
  'supply.createProduct': proc(productInputSchema, productRowSchema),
  'supply.updateProduct': proc(
    z.object({ id: idSchema, patch: productUpdateSchema }).strict(),
    productRowSchema
  ),
  'supply.priceHistory': proc(
    z.object({ productId: idSchema, since: localDateSchema.optional() }).strict(),
    z.array(historyLineSchema)
  ),
  'supply.monthSummary': proc(yearMonthSchema.strict(), monthSummarySchema),
  'supply.purchases': proc(expenseListSchema, z.array(purchaseViewSchema)),
  'supply.recordPurchase': proc(expenseCreateSchema, writtenExpenseSchema),
  'supply.voidPurchase': proc(
    z.object({ id: idSchema, reason: reasonSchema }).strict(),
    writtenExpenseSchema
  ),
  /** Expense sections the caller may see, with whether a purchase may be written to them (G-67). */
  'supply.sections': proc(z.object({}).strict(), z.array(expenseSectionChoiceSchema)),
  'supply.addPhoto': proc(photoUploadSchema.extend({ entity: photoOwnerSchema }), attachmentViewSchema),
  'supply.photos': proc(
    z.object({ entity: photoOwnerSchema, id: idSchema }).strict(),
    z.array(attachmentViewSchema)
  ),
  'supply.readPhoto': proc(byId, photoDataSchema),

  'laundry.prices': proc(z.object({ contactId: idSchema }).strict(), z.array(laundryPriceViewSchema)),
  'laundry.setPrice': proc(laundryPriceInputSchema, laundryPriceViewSchema),
  'laundry.deliveries': proc(laundryDeliveryListSchema, z.array(laundryDeliveryViewSchema)),
  'laundry.recordDelivery': proc(laundryDeliveryInputSchema, laundryDeliveryViewSchema),
  'laundry.voidDelivery': proc(z.object({ id: idSchema, reason: reasonSchema }).strict(), okSchema),
  'laundry.outstanding': proc(
    z.object({ contactId: idSchema, until: localDateSchema.optional() }).strict(),
    laundryOutstandingViewSchema
  ),
  'laundry.month': proc(contactMonth, laundryMonthViewSchema),
  'laundry.settle': proc(laundrySettlementInputSchema, laundryMonthViewSchema),
  'laundry.trend': proc(
    z
      .object({
        contactId: idSchema,
        until: localDateSchema,
        months: z.number().int().min(1).max(36).optional()
      })
      .strict(),
    z.array(laundryTrendPointSchema)
  )
} as const satisfies Record<string, Procedure>
