// Room, room type and block inputs (03-mimari.md §4.2; G-11, G-12, G-38, G-90, K-27).
// Update schemas are built from default-free fields: zod keeps `.default()` inside `.partial()`, which would
// silently reset a field the patch did not mention (a room's "sellable", a type's group).
import * as z from 'zod'
import { isLocalDate } from '../date'
import { MAX_AMOUNT_MINOR } from '../money'
import { currencyCode } from './settings'

/** A real calendar day "YYYY-MM-DD" (2026-02-31 is refused). */
export const localDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD')
  .refine(isLocalDate, 'invalid date')
export const idSchema = z.string().min(1).max(64)
export const minorSchema = z.number().int().safe()
/** Money a person types (prices, payments, expenses, salaries): within ±MAX_AMOUNT_MINOR (K-46). */
export const amountSchema = minorSchema.min(-MAX_AMOUNT_MINOR).max(MAX_AMOUNT_MINOR)
export const i18nTextSchema = z
  .object({ tr: z.string().max(120), en: z.string().max(120), ru: z.string().max(120) })
  .partial()

const roomTypeGroup = z.enum(['occupancy', 'tier', 'suite', 'view', 'building', 'feature', 'custom'])

const roomTypeFields = z.object({
  name: z.string().trim().min(1).max(80),
  group: roomTypeGroup,
  maxAdults: z.number().int().min(1).max(20).nullish(),
  maxChildren: z.number().int().min(0).max(20).nullish(),
  sizeM2: z.number().int().min(1).max(2000).nullish(),
  basePriceMinor: amountSchema.nonnegative().nullish(),
  weekendPriceMinor: amountSchema.nonnegative().nullish(),
  baseCurrency: currencyCode.nullish(),
  sort: z.number().int().optional(),
  active: z.boolean().optional()
})

export const roomTypeInputSchema = roomTypeFields.extend({ group: roomTypeGroup.default('custom') })
export type RoomTypeInput = z.input<typeof roomTypeInputSchema>

export const roomTypeUpdateSchema = roomTypeFields
  .partial()
  .refine((p) => Object.keys(p).length > 0, { message: 'empty patch' })
export type RoomTypeUpdate = z.input<typeof roomTypeUpdateSchema>

const roomFields = z.object({
  number: z.string().trim().min(1).max(20),
  floor: z.string().trim().max(20).nullish(),
  roomTypeId: idSchema,
  beds: z.number().int().min(1).max(50),
  sellable: z.boolean(),
  notes: z.string().max(500).nullish(),
  sort: z.number().int().optional(),
  /** Day the room (or its new capacity) counts from (K-27). */
  validFrom: localDateSchema
})

export const roomInputSchema = roomFields.extend({ sellable: z.boolean().default(true) })
export type RoomInput = z.input<typeof roomInputSchema>

export const roomUpdateSchema = roomFields
  .omit({ validFrom: true })
  .partial()
  .extend({ active: z.boolean().optional(), validFrom: localDateSchema, note: z.string().max(200).nullish() })
export type RoomUpdate = z.input<typeof roomUpdateSchema>

export const hkStatusSchema = z.enum(['clean', 'dirty', 'inspected', 'maintenance', 'out_of_order'])
/** Short note on a room's state ("çarşaf eksik"); empty = none. */
export const hkNoteSchema = z
  .string()
  .trim()
  .max(200)
  .transform((v) => (v === '' ? null : v))
  .nullish()

export const roomBlockInputSchema = z
  .object({
    roomId: idSchema,
    dateFrom: localDateSchema,
    /** Exclusive end, like a check-out. */
    dateTo: localDateSchema,
    kind: z.enum(['oos', 'ooo']),
    reason: z.string().trim().min(1).max(200),
    note: z.string().max(500).nullish(),
    roomIssueId: idSchema.nullish()
  })
  .refine((b) => b.dateTo > b.dateFrom, { path: ['dateTo'], message: 'dateTo must be after dateFrom' })
export type RoomBlockInput = z.input<typeof roomBlockInputSchema>
