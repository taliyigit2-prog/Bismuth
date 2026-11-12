// Phone book, products, laundry (03-mimari.md §4.7, §6.13; G-160, G-170, G-171, K-28, K-35) and the
// operations inputs that go with them: room issues and attachments (§4.2; G-180, K-25).
// Update schemas are built from default-free fields (zod keeps `.default()` inside `.partial()`).
import * as z from 'zod'
import { optionalEmail, optionalText } from './guests'
import { amountSchema, idSchema, localDateSchema } from './rooms'

// --- Phone book (G-160) ----------------------------------------------------------------------------------

/** Seeded contact categories (same list as the `contacts.category` column); 'custom' uses customCategory. */
export const CONTACT_CATEGORY_CODES = [
  'supplier',
  'laundry',
  'plumber',
  'electrician',
  'taxi',
  'emergency',
  'other'
] as const
export const contactCategorySchema = z.enum([...CONTACT_CATEGORY_CODES, 'custom'])
export type ContactCategory = z.infer<typeof contactCategorySchema>

export const contactPhoneSchema = z.object({
  /** "cep", "iş", "WhatsApp"… free label. */
  label: z.string().trim().max(40).default(''),
  number: z.string().trim().min(1).max(40)
})

const contactFields = z.object({
  name: z.string().trim().min(1).max(120),
  category: contactCategorySchema,
  customCategory: optionalText(60),
  phones: z.array(contactPhoneSchema).max(10),
  address: optionalText(500),
  email: optionalEmail,
  note: optionalText(1000),
  favorite: z.boolean()
})

export const contactInputSchema = contactFields
  .extend({ phones: z.array(contactPhoneSchema).max(10).default([]), favorite: z.boolean().default(false) })
  .refine((c) => c.category !== 'custom' || !!c.customCategory, {
    path: ['customCategory'],
    message: 'custom category label required'
  })
export type ContactInput = z.input<typeof contactInputSchema>

export const contactUpdateSchema = contactFields.partial()
export type ContactUpdate = z.input<typeof contactUpdateSchema>

export const contactListSchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: contactCategorySchema.optional(),
  includeInactive: z.boolean().default(false)
})
export type ContactListInput = z.input<typeof contactListSchema>

// --- Products and categories (G-170, S-63, S-73) -------------------------------------------------------

export const PRODUCT_UNITS = ['piece', 'kg', 'lt', 'pack', 'bag'] as const

export const productCategoryNameSchema = z.string().trim().min(1).max(80)

const productFields = z.object({
  name: z.string().trim().min(1).max(120),
  categoryId: idSchema,
  supplierContactId: idSchema.nullish(),
  unit: z.enum(PRODUCT_UNITS),
  /** Optional stock counter, off by default (S-63). */
  trackStock: z.boolean(),
  /** Thousandths of the unit (1,5 kg = 1500), like expense_items.qty_milli. */
  stockQtyMilli: z.number().int().safe().nullish(),
  active: z.boolean()
})

export const productInputSchema = productFields
  .omit({ active: true })
  .extend({ trackStock: z.boolean().default(false) })
export type ProductInput = z.input<typeof productInputSchema>

export const productUpdateSchema = productFields.partial()
export type ProductUpdate = z.input<typeof productUpdateSchema>

export const productListSchema = z.object({
  q: z.string().trim().max(100).optional(),
  categoryId: idSchema.optional(),
  includeInactive: z.boolean().default(false)
})
export type ProductListInput = z.input<typeof productListSchema>

export const yearMonthSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12)
})

// --- Laundry (G-171, K-28, S-95) -------------------------------------------------------------------------

export const laundryPriceInputSchema = z.object({
  contactId: idSchema,
  itemTypeId: idSchema,
  validFrom: localDateSchema,
  /** In the hotel's base currency (settlements are computed in it). */
  unitPriceMinor: amountSchema.nonnegative()
})
export type LaundryPriceInput = z.input<typeof laundryPriceInputSchema>

export const laundryDeliveryItemSchema = z
  .object({
    itemTypeId: idSchema,
    qty: z.number().int().min(0).max(100_000),
    stainedQty: z.number().int().min(0).max(100_000).default(0),
    /** Unit price printed on the slip, if any (overrides the price table). */
    slipUnitPriceMinor: amountSchema.nonnegative().nullish()
  })
  .refine((i) => i.stainedQty <= i.qty, { path: ['stainedQty'], message: 'stained > qty' })

export const laundryDeliveryInputSchema = z
  .object({
    date: localDateSchema,
    /** out = dirty handed over, in = clean slip received (S-95). */
    direction: z.enum(['out', 'in']),
    contactId: idSchema,
    slipNo: optionalText(40),
    note: optionalText(500),
    items: z.array(laundryDeliveryItemSchema).min(1).max(100)
  })
  .refine((d) => new Set(d.items.map((i) => i.itemTypeId)).size === d.items.length, {
    path: ['items'],
    message: 'item type listed twice'
  })
export type LaundryDeliveryInput = z.input<typeof laundryDeliveryInputSchema>

export const laundryDeliveryListSchema = z.object({
  /** One laundry's slips (a hotel may use more than one). */
  contactId: idSchema.optional(),
  from: localDateSchema.optional(),
  /** Inclusive. */
  to: localDateSchema.optional(),
  includeVoided: z.boolean().default(false)
})
export type LaundryDeliveryListInput = z.input<typeof laundryDeliveryListSchema>

export const laundrySettlementInputSchema = yearMonthSchema.extend({
  contactId: idSchema,
  /** The laundry's invoice total in the base currency. */
  invoicedTotalMinor: amountSchema.nonnegative(),
  note: optionalText(500),
  /**
   * "Ödendi": the invoice becomes one expense in the ledger (G-71). false = only the invoice is recorded and
   * compared with the slips (an earlier expense of the month is voided).
   */
  paid: z.boolean().default(true),
  /** The invoice expense goes on the month's last day; when that day is closed (G-72): `ledger.locked` + reason. */
  dayClosedReason: z.string().trim().min(3).max(200).optional()
})
export type LaundrySettlementInput = z.input<typeof laundrySettlementInputSchema>

/** Pieces already at the laundry before tracking started, per item type id. */
export const laundryOpeningSchema = z.record(idSchema, z.number().int().min(-100_000).max(100_000))

// --- Room issues (G-180; faz-09) -------------------------------------------------------------------------

export const ROOM_ISSUE_SEVERITIES = ['low', 'medium', 'urgent'] as const
export const ROOM_ISSUE_STATUSES = ['open', 'planned', 'resolved'] as const

export const roomIssueInputSchema = z
  .object({
    /** null = general area ("genel alan"). */
    roomId: idSchema.nullish(),
    /** Area name when there is no room ("Lobi"); ignored for a room. */
    area: optionalText(80),
    title: z.string().trim().min(1).max(120),
    description: optionalText(2000),
    severity: z.enum(ROOM_ISSUE_SEVERITIES).default('medium'),
    /** "Odayı satışa kapat": an out-of-service block while the issue is open. */
    blocksRoom: z.boolean().default(false)
  })
  .refine((i) => !i.blocksRoom || !!i.roomId, { path: ['blocksRoom'], message: 'needs a room' })
export type RoomIssueInput = z.input<typeof roomIssueInputSchema>

export const roomIssueUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    area: optionalText(80),
    description: optionalText(2000),
    severity: z.enum(ROOM_ISSUE_SEVERITIES)
  })
  .partial()
export type RoomIssueUpdate = z.input<typeof roomIssueUpdateSchema>

export const roomIssuePlanSchema = z.object({
  plannedDate: localDateSchema,
  /** A user id or a name ("Tesisatçı Ahmet"). */
  assignedTo: optionalText(120)
})
export type RoomIssuePlan = z.input<typeof roomIssuePlanSchema>

export const roomIssueResolveSchema = z.object({ resolutionNote: optionalText(2000) })
export type RoomIssueResolve = z.input<typeof roomIssueResolveSchema>

export const roomIssueListSchema = z.object({
  status: z.array(z.enum(ROOM_ISSUE_STATUSES)).min(1).optional(),
  roomId: idSchema.optional()
})
export type RoomIssueListInput = z.input<typeof roomIssueListSchema>

// --- Attachments (K-25) ----------------------------------------------------------------------------------

export const ATTACHMENT_ENTITY_CODES = [
  'room_issue',
  'expense',
  'laundry_delivery',
  'lost_item',
  'task'
] as const
export const attachmentEntitySchema = z.enum(ATTACHMENT_ENTITY_CODES)
export type AttachmentEntity = z.infer<typeof attachmentEntitySchema>

export const ATTACHMENT_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const
export type AttachmentMime = (typeof ATTACHMENT_MIME_TYPES)[number]
export const ATTACHMENT_MAX_BYTES = 15 * 1024 * 1024

export const attachmentInputSchema = z.object({
  entity: attachmentEntitySchema,
  entityId: idSchema,
  fileName: z.string().trim().min(1).max(255),
  /** Checked against ATTACHMENT_MIME_TYPES and the file signature in the service. */
  mime: z.string().trim().min(1).max(100),
  bytes: z.instanceof(Uint8Array)
})
export type AttachmentInput = z.input<typeof attachmentInputSchema>
