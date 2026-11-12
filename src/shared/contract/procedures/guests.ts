// Faz 6: guests, history, companies, standing requests, blacklist, merge.
// Spread into the contract by ./index.ts; handlers in src/main/api/handlers/guests.ts.
import * as z from 'zod'
import { blacklistHitSchema } from '../booking'
import {
  BLACKLIST_SEVERITIES,
  GUEST_FILTERS,
  ID_DOC_TYPES,
  STANDING_NOTE_LEVELS,
  blacklistInputSchema,
  blacklistListSchema,
  blacklistRemoveReasonSchema,
  companyInputSchema,
  companyListSchema,
  companyUpdateSchema,
  guestCandidateSchema,
  guestInputSchema,
  guestListSchema,
  guestTagsInputSchema,
  guestUpdateSchema,
  standingNoteInputSchema
} from '../guests'
import { byId, proc, type Procedure } from '../proc'
import { idSchema, localDateSchema, minorSchema } from '../rooms'

const moneyMap = z.record(z.string(), minorSchema)
const reasonSchema = z.enum(['name', 'id', 'phone'])

// ── Views ────────────────────────────────────────────────────────────────────────────────────────────────────

/** A guest as the user may see it: the document number masked without `guests.identity` view. */
export const guestViewSchema = z.object({
  id: idSchema,
  firstName: z.string(),
  lastName: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  nationality: z.string().nullable(),
  idDocType: z.enum(ID_DOC_TYPES).nullable(),
  idDocNumber: z.string().nullable(),
  identityMasked: z.boolean(),
  language: z.string().nullable(),
  vip: z.boolean(),
  standingNote: z.string().nullable(),
  standingNoteLevel: z.enum(STANDING_NOTE_LEVELS),
  notes: z.string().nullable(),
  companyId: idSchema.nullable(),
  mergedIntoId: idSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
})
export type GuestViewDto = z.output<typeof guestViewSchema>

export const companyViewSchema = z.object({
  id: idSchema,
  title: z.string(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  taxOffice: z.string().nullable(),
  taxNumber: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  iban: z.string().nullable(),
  contactPerson: z.string().nullable(),
  note: z.string().nullable(),
  favorite: z.boolean(),
  lastUsedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
})
export type CompanyViewDto = z.output<typeof companyViewSchema>

export const guestDuplicateSchema = z.object({ guest: guestViewSchema, reasons: z.array(reasonSchema) })

export const guestListRowSchema = z.object({
  id: idSchema,
  firstName: z.string(),
  lastName: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  nationality: z.string().nullable(),
  vip: z.boolean(),
  standingNote: z.string().nullable(),
  standingNoteLevel: z.enum(STANDING_NOTE_LEVELS),
  companyId: idSchema.nullable(),
  companyTitle: z.string().nullable(),
  stays: z.number().int(),
  lastStayDate: localDateSchema.nullable(),
  nextStayDate: localDateSchema.nullable(),
  totalSpent: moneyMap,
  blacklisted: z.boolean(),
  duplicateOf: z.object({ id: idSchema, name: z.string(), reasons: z.array(reasonSchema) }).nullable(),
  /** Guest tags (G-50), in the list's order; names come from `lists.list` (kind `guestTags`). */
  tagIds: z.array(idSchema),
  /**
   * With the room or date filter (G-190): the guest's stays that matched, latest first — room, days and the
   * reservation's state (a cancelled or no-show one is shown as such).
   */
  matchedStays: z
    .array(
      z.object({
        reservationId: idSchema,
        code: z.string(),
        roomNumber: z.string(),
        checkIn: localDateSchema,
        checkOut: localDateSchema,
        status: z.enum([
          'tentative',
          'confirmed',
          'checked_in',
          'checked_out',
          'cancelled',
          'no_show',
          'parked'
        ])
      })
    )
    .optional()
})
export type GuestListRowDto = z.output<typeof guestListRowSchema>

export const guestListResultSchema = z.object({
  rows: z.array(guestListRowSchema),
  total: z.number().int(),
  counts: z.record(z.enum(GUEST_FILTERS), z.number().int()),
  baseCurrency: z.string(),
  moneyHidden: z.boolean()
})

export const guestCardSchema = z.object({
  guest: guestViewSchema,
  mergedFrom: idSchema.nullable(),
  company: companyViewSchema.nullable(),
  duplicates: z.array(guestDuplicateSchema),
  blacklist: z.array(blacklistHitSchema),
  /** Guest tags (G-50), switched-off ones included (the card shows them faded). */
  tagIds: z.array(idSchema)
})
export type GuestCardDto = z.output<typeof guestCardSchema>

/** One stay of the price and payment history (§6.12, G-190). */
export const historyStaySchema = z.object({
  reservationId: idSchema,
  code: z.string(),
  primaryGuestId: idSchema,
  roomNumber: z.string(),
  checkIn: localDateSchema,
  checkOut: localDateSchema,
  status: z.enum(['tentative', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show', 'parked']),
  nights: z.array(z.object({ date: localDateSchema, priceMinor: minorSchema, currency: z.string() })),
  paidMinor: minorSchema,
  balanceMinor: minorSchema,
  currency: z.string(),
  methods: z.array(z.string().nullable()),
  methodIds: z.array(idSchema),
  channel: z.string().nullable(),
  channelId: idSchema.nullable()
})
export type HistoryStayDto = z.output<typeof historyStaySchema>

const historySummaryFields = {
  lastStayDate: localDateSchema.nullable(),
  lastNightly: z.object({ amountMinor: minorSchema, currency: z.string() }).nullable(),
  averageNightly: moneyMap,
  totalSpent: moneyMap,
  totalNights: z.number().int(),
  moneyHidden: z.boolean()
}

export const guestHistorySchema = z.object({
  guestId: idSchema,
  stays: z.array(historyStaySchema),
  standingNote: z
    .object({ text: z.string(), level: z.enum(STANDING_NOTE_LEVELS), requiresConfirm: z.boolean() })
    .nullable(),
  ...historySummaryFields
})
export type GuestHistoryDto = z.output<typeof guestHistorySchema>

export const companyListRowSchema = companyViewSchema.extend({ guestCount: z.number().int() })
export type CompanyListRowDto = z.output<typeof companyListRowSchema>

export const companyDetailSchema = z.object({
  company: companyViewSchema,
  guests: z.array(
    z.object({
      id: idSchema,
      firstName: z.string(),
      lastName: z.string(),
      phone: z.string().nullable(),
      vip: z.boolean()
    })
  ),
  stays: z.array(historyStaySchema.extend({ guestId: idSchema, guestName: z.string() })),
  stayCount: z.number().int(),
  totalNights: z.number().int(),
  totalSpent: moneyMap,
  moneyHidden: z.boolean()
})
export type CompanyDetailDto = z.output<typeof companyDetailSchema>

export const blacklistEntrySchema = z.object({
  id: idSchema,
  guestId: idSchema.nullable(),
  name: z.string(),
  idDocNumber: z.string().nullable(),
  identityMasked: z.boolean(),
  phoneNormalized: z.string().nullable(),
  severity: z.enum(BLACKLIST_SEVERITIES),
  reasonCode: z.string(),
  reasonText: z.string(),
  incidentDate: localDateSchema.nullable(),
  addedBy: z.string().nullable(),
  addedByName: z.string().nullable(),
  approvedByName: z.string().nullable(),
  status: z.enum(['active', 'removed']),
  removedAt: z.string().nullable(),
  removedByName: z.string().nullable(),
  removedReason: z.string().nullable(),
  createdAt: z.string()
})
export type BlacklistEntryDto = z.output<typeof blacklistEntrySchema>

// ── Procedures ───────────────────────────────────────────────────────────────────────────────────────────────

export const guestsProcedures = {
  'guests.list': proc(guestListSchema, guestListResultSchema),
  'guests.card': proc(byId, guestCardSchema),
  'guests.history': proc(z.object({ guestId: idSchema }).strict(), guestHistorySchema),
  'guests.create': proc(guestInputSchema, guestViewSchema),
  'guests.update': proc(z.object({ id: idSchema, patch: guestUpdateSchema }).strict(), guestViewSchema),
  'guests.setStandingNote': proc(
    z.object({ id: idSchema, note: standingNoteInputSchema }).strict(),
    guestViewSchema
  ),
  'guests.duplicates': proc(guestCandidateSchema, z.array(guestDuplicateSchema)),
  'guests.merge': proc(
    z.object({ keepId: idSchema, mergeId: idSchema }).strict(),
    z.object({
      guest: guestViewSchema,
      moved: z.object({
        reservations: z.number().int(),
        occupants: z.number().int(),
        blacklist: z.number().int(),
        mergedGuests: z.number().int(),
        tags: z.number().int()
      })
    })
  ),
  /** G-50: the card's tags as a whole; answers the tags it now carries. */
  'guests.setTags': proc(guestTagsInputSchema, z.object({ tagIds: z.array(idSchema) })),

  'companies.list': proc(companyListSchema, z.array(companyListRowSchema)),
  'companies.get': proc(byId, companyDetailSchema),
  'companies.create': proc(companyInputSchema, companyViewSchema),
  'companies.update': proc(
    z.object({ id: idSchema, patch: companyUpdateSchema }).strict(),
    companyViewSchema
  ),
  /** Copied to the clipboard or chosen for a guest: rises in the list (last used). */
  'companies.markUsed': proc(byId, companyViewSchema),

  'blacklist.list': proc(blacklistListSchema, z.array(blacklistEntrySchema)),
  'blacklist.add': proc(
    blacklistInputSchema,
    blacklistEntrySchema.omit({ addedByName: true, approvedByName: true, removedByName: true })
  ),
  'blacklist.remove': proc(
    z.object({ id: idSchema, reason: blacklistRemoveReasonSchema }).strict(),
    blacklistEntrySchema.omit({ addedByName: true, approvedByName: true, removedByName: true })
  ),
  'blacklist.check': proc(guestCandidateSchema, z.array(blacklistHitSchema))
} as const satisfies Record<string, Procedure>
