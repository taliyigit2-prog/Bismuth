// Expense inputs (03-mimari.md §4.5; G-66, G-67, G-71, G-72, K-35, S-33). No expense categories: a free
// description (normalised for autocomplete and "en çok harcama"), a visibility section and optional product lines.
import * as z from 'zod'
import { isLocalDate, type LocalDate } from '../date'
import { amountSchema, idSchema } from './rooms'
import { currencyCode } from './settings'

/** A real calendar day 'YYYY-MM-DD' (2026-02-31 is rejected), typed as LocalDate after parsing. */
export const daySchema = z
  .string()
  .refine(isLocalDate, 'YYYY-MM-DD')
  .transform((v) => v as LocalDate)

/** Why a record is voided, reopened or written into a closed day (audit reason). */
export const reasonSchema = z.string().trim().min(1).max(300)

export const expenseItemInputSchema = z.object({
  productId: idSchema,
  /** Quantity in thousandths (1,5 kg = 1500). */
  qtyMilli: z.number().int().positive().max(1_000_000_000),
  /** Price of one unit in the expense currency. */
  unitPriceMinor: amountSchema.nonnegative(),
  /**
   * The line amount as written on the slip (2,75 kg = 1.000 TL): kept exactly; the unit price is then only
   * informative (its rounding never changes the amount). Absent = unit price × quantity.
   */
  amountMinor: amountSchema.nonnegative().optional()
})
export type ExpenseItemInput = z.input<typeof expenseItemInputSchema>

const expenseFields = {
  date: daySchema,
  sectionId: idSchema,
  amountMinor: amountSchema.positive(),
  currency: currencyCode,
  description: z.string().trim().min(1).max(200),
  /** The Excel expense "x": paid out of the reception drawer. */
  paidFromDrawer: z.boolean(),
  /** How it was paid (cash, card, bank); optional. */
  methodId: idSchema.nullish(),
  vendorContactId: idSchema.nullish(),
  employeeId: idSchema.nullish(),
  /** Product lines of a purchase (G-71); their sum may not exceed the amount. */
  items: z.array(expenseItemInputSchema).max(200),
  /**
   * Manual rate (base units per unit × 1 000 000) for a foreign-currency expense when no rate is known (offline,
   * G-70); used only when the amount or currency is written and no rate is found.
   */
  manualRateMicro: z.number().int().positive().safe().optional(),
  /** Needed only when the day is closed (G-72): goes to the audit row. */
  reason: reasonSchema.optional()
}

export const expenseCreateSchema = z.object({
  ...expenseFields,
  paidFromDrawer: expenseFields.paidFromDrawer.default(false),
  items: expenseFields.items.default([])
})
export type ExpenseCreateInput = z.input<typeof expenseCreateSchema>

/** Only the fields sent change; `items` (when sent) replaces every product line. */
export const expenseUpdateSchema = z
  .object(expenseFields)
  .partial()
  .refine((p) => Object.keys(p).some((k) => k !== 'reason'), { message: 'empty patch' })
export type ExpenseUpdateInput = z.input<typeof expenseUpdateSchema>

export const expenseVoidSchema = z.object({ reason: reasonSchema })
export type ExpenseVoidInput = z.input<typeof expenseVoidSchema>

export const expenseListSchema = z
  .object({
    /** Inclusive range. */
    from: daySchema,
    to: daySchema,
    sectionId: idSchema.optional(),
    includeVoided: z.boolean().default(false)
  })
  .refine((r) => r.to >= r.from, { path: ['to'], message: 'to must not be before from' })
export type ExpenseListInput = z.input<typeof expenseListSchema>

export const descriptionSuggestSchema = z.object({
  prefix: z.string().max(100),
  limit: z.number().int().min(1).max(50).default(10)
})
export type DescriptionSuggestInput = z.input<typeof descriptionSuggestSchema>
