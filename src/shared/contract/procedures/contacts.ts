// Faz 12: phone book, lost and found.
// Spread into the contract by ./index.ts; handlers in src/main/api/handlers/contacts.ts.
import * as z from 'zod'
import { okSchema } from '../admin'
import {
  lostItemInputSchema,
  lostItemListFilterSchema,
  lostItemReturnSchema,
  lostItemUpdateSchema
} from '../operations'
import { byId, proc, type Procedure } from '../proc'
import { idSchema } from '../rooms'
import {
  contactCategorySchema,
  contactInputSchema,
  contactListSchema,
  contactPhoneSchema,
  contactUpdateSchema
} from '../supply'

// ── Phone book (G-160) ───────────────────────────────────────────────────────────────────────────────────────

export const contactViewSchema = z.object({
  id: idSchema,
  name: z.string(),
  category: contactCategorySchema,
  customCategory: z.string().nullable(),
  phones: z.array(contactPhoneSchema),
  address: z.string().nullable(),
  email: z.string().nullable(),
  note: z.string().nullable(),
  favorite: z.boolean(),
  active: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string()
})
export type ContactView = z.infer<typeof contactViewSchema>

/** Rows checked on the screen first (CSV preview); the service skips names already in the book. */
export const CONTACT_IMPORT_LIMIT = 500
export const contactImportSchema = z
  .object({ contacts: z.array(contactInputSchema).min(1).max(CONTACT_IMPORT_LIMIT) })
  .strict()

export const contactImportResultSchema = z.object({
  created: z.array(contactViewSchema),
  /** Names already in the phone book (not added twice). */
  skipped: z.array(z.string())
})

// ── Lost and found (G-55) ────────────────────────────────────────────────────────────────────────────────────

export const lostItemViewSchema = z.object({
  id: idSchema,
  /** Local minute "YYYY-MM-DDTHH:MM". */
  foundAt: z.string(),
  roomId: idSchema.nullable(),
  roomNumber: z.string().nullable(),
  locationText: z.string().nullable(),
  foundBy: z.string().nullable(),
  description: z.string(),
  storageLocation: z.string().nullable(),
  status: z.enum(['stored', 'returned', 'disposed']),
  returnedTo: z.string().nullable(),
  returnedAt: z.string().nullable(),
  note: z.string().nullable(),
  createdByName: z.string().nullable(),
  createdAt: z.string(),
  /** Who changed the status last and when (sahibine verildi / elden çıkarıldı / geri alındı). */
  statusChange: z
    .object({ at: z.string(), byName: z.string().nullable(), reason: z.string().nullable() })
    .nullable()
})
export type LostItemView = z.infer<typeof lostItemViewSchema>

// ── Photos (K-25): files go to userData/attachments; bytes travel as base64 over the one JSON channel ────────

/** The IPC envelope is ≤ 8 MB: the screen shrinks photos before sending (a phone photo becomes ~0,5 MB). */
export const PHOTO_MAX_BASE64 = 7_500_000

export const photoUploadSchema = z
  .object({
    id: idSchema,
    fileName: z.string().trim().min(1).max(255),
    mime: z.string().trim().min(1).max(100),
    dataBase64: z.string().min(1).max(PHOTO_MAX_BASE64)
  })
  .strict()

export const attachmentViewSchema = z.object({
  id: idSchema,
  mime: z.string(),
  bytes: z.number().int(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  createdAt: z.string(),
  deletedAt: z.string().nullable()
})
export type AttachmentView = z.infer<typeof attachmentViewSchema>

export const photoDataSchema = z.object({ id: idSchema, mime: z.string(), dataBase64: z.string() })

export const contactsProcedures = {
  'contacts.list': proc(contactListSchema, z.array(contactViewSchema)),
  /** Bugün → "Acil numaralar" (G-160): the active favourites. */
  'contacts.favorites': proc(z.object({}).strict(), z.array(contactViewSchema)),
  'contacts.create': proc(contactInputSchema, contactViewSchema),
  'contacts.update': proc(z.object({ id: idSchema, patch: contactUpdateSchema }).strict(), contactViewSchema),
  'contacts.setActive': proc(z.object({ id: idSchema, active: z.boolean() }).strict(), contactViewSchema),
  'contacts.import': proc(contactImportSchema, contactImportResultSchema),

  'lostItems.list': proc(lostItemListFilterSchema, z.array(lostItemViewSchema)),
  'lostItems.create': proc(lostItemInputSchema, z.object({ id: idSchema })),
  'lostItems.update': proc(z.object({ id: idSchema, patch: lostItemUpdateSchema }).strict(), okSchema),
  'lostItems.markReturned': proc(z.object({ id: idSchema, input: lostItemReturnSchema }).strict(), okSchema),
  'lostItems.markDisposed': proc(
    z.object({ id: idSchema, reason: z.string().trim().min(1).max(300) }).strict(),
    okSchema
  ),
  'lostItems.restore': proc(
    z.object({ id: idSchema, reason: z.string().trim().min(1).max(300) }).strict(),
    okSchema
  ),
  'lostItems.addPhoto': proc(photoUploadSchema, attachmentViewSchema),
  'lostItems.photos': proc(byId, z.array(attachmentViewSchema)),
  'lostItems.readPhoto': proc(byId, photoDataSchema)
} as const satisfies Record<string, Procedure>
