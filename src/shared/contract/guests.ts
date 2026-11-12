// Guest, company and blacklist inputs (03-mimari.md §4.3; G-50…G-52, G-190…G-192). No birth date/place,
// parents' names, gender or address are accepted for guests (S-15, S-92; KVKK data minimisation).
// Update schemas are built from default-free fields: zod keeps `.default()` inside `.partial()`, which would
// silently reset a field the caller did not send.
import * as z from 'zod'
import { compactTaxNumber, isValidIban, isValidTurkishTaxNumber } from '../domain/tax-id'
import { idSchema, localDateSchema } from './rooms'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Trimmed optional text: '' clears the field (null); undefined leaves it unchanged on update. */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullish()

export const optionalEmail = optionalText(160).refine((v) => v == null || EMAIL.test(v), {
  message: 'email'
})

/** IBAN without spaces, upper case ("tr12 0006 …" → "TR120006…"). */
export const optionalIban = z
  .string()
  .transform((v) => v.replace(/\s+/g, '').toUpperCase())
  .transform((v) => (v === '' ? null : v))
  .refine((v) => v === null || isValidIban(v), { message: 'iban' })
  .nullish()

/** Tax number: 10 digits (VKN) or an 11-digit T.C. kimlik no with valid check digits; spaces and dots dropped. */
export const optionalTaxNumber = z
  .string()
  .transform(compactTaxNumber)
  .transform((v) => (v === '' ? null : v))
  .refine((v) => v === null || isValidTurkishTaxNumber(v), { message: 'taxNumber' })
  .nullish()

export const ID_DOC_TYPES = ['tc', 'passport', 'other'] as const
export const STANDING_NOTE_LEVELS = ['info', 'warn'] as const

const guestFields = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().max(80),
  phone: optionalText(40),
  email: optionalEmail,
  /** ISO 3166-1 alpha-2, optional and hidden by default (G-50). */
  nationality: optionalText(2)
    .refine((v) => v == null || /^[A-Za-z]{2}$/.test(v), { message: 'iso2' })
    .transform((v) => (v == null ? v : v.toUpperCase())),
  idDocType: z.enum(ID_DOC_TYPES).nullish(),
  idDocNumber: optionalText(40),
  language: optionalText(10),
  vip: z.boolean(),
  /** "Her gelişinde" note (G-192); `warn` asks for a confirmation before a reservation is saved. */
  standingNote: optionalText(500),
  standingNoteLevel: z.enum(STANDING_NOTE_LEVELS),
  notes: optionalText(2000),
  companyId: idSchema.nullish()
})

const docNeedsType = (g: { idDocNumber?: string | null; idDocType?: string | null }): boolean =>
  !g.idDocNumber || !!g.idDocType

export const guestInputSchema = guestFields
  .extend({
    lastName: z.string().trim().max(80).default(''),
    vip: z.boolean().default(false),
    standingNoteLevel: z.enum(STANDING_NOTE_LEVELS).default('info')
  })
  .refine(docNeedsType, { path: ['idDocType'], message: 'document type required' })
export type GuestInput = z.input<typeof guestInputSchema>

export const guestUpdateSchema = guestFields.partial()
export type GuestUpdate = z.input<typeof guestUpdateSchema>

export const standingNoteInputSchema = z.object({
  standingNote: optionalText(500),
  standingNoteLevel: z.enum(STANDING_NOTE_LEVELS).default('info')
})
export type StandingNoteInput = z.input<typeof standingNoteInputSchema>

/** A person typed into a form: duplicate check (G-51) and blacklist check (G-52). */
export const guestCandidateSchema = z.object({
  /** Full name as typed ("GADİR GADİROV"); may be empty when only a phone is known. */
  name: z.string().trim().max(160).default(''),
  phone: z.string().trim().max(40).nullish(),
  idDocNumber: z.string().trim().max(40).nullish(),
  /** The guest being edited (not its own duplicate). */
  excludeId: idSchema.optional()
})
export type GuestCandidate = z.input<typeof guestCandidateSchema>

export const guestSearchSchema = z.object({
  q: z
    .string()
    .trim()
    .min(1)
    .transform((q) => q.slice(0, 100).trim()),
  limit: z.number().int().min(1).max(100).default(20)
})

export const guestMergeSchema = z.object({ keepId: idSchema, mergeId: idSchema })

/** The guest's tags as a whole (G-50): tags left out are taken off; a switched-off tag may stay, not be added. */
export const guestTagsInputSchema = z.object({
  id: idSchema,
  tagIds: z.array(idSchema).max(50)
})
export type GuestTagsInput = z.input<typeof guestTagsInputSchema>

/** Guest list (faz-06 madde 1): search, one filter, sort, a page. */
export const GUEST_FILTERS = ['all', 'returning', 'vip', 'note', 'company', 'blacklist', 'duplicate'] as const
export type GuestFilter = (typeof GUEST_FILTERS)[number]
export const GUEST_SORTS = ['recent', 'name', 'stays', 'paid'] as const
export type GuestSort = (typeof GUEST_SORTS)[number]

export const guestListSchema = z
  .object({
    q: z
      .string()
      .trim()
      .transform((q) => q.slice(0, 100).trim())
      .optional(),
    filter: z.enum(GUEST_FILTERS).default('all'),
    sort: z.enum(GUEST_SORTS).default('recent'),
    offset: z.number().int().min(0).default(0),
    limit: z.number().int().min(1).max(500).default(50),
    /** G-190 "oda": guests who stayed in this room (its number, whole; '' = any room). */
    room: z.string().trim().max(20).optional(),
    /** G-190 "tarih": guests whose stay touches these days, both included ([check-in, check-out) overlap). */
    stayFrom: localDateSchema.optional(),
    stayTo: localDateSchema.optional(),
    /** Only guests carrying this tag (G-50; Ayarlar → Listeler → Misafir etiketleri). */
    tagId: idSchema.optional()
  })
  .refine((v) => !v.stayFrom || !v.stayTo || v.stayFrom <= v.stayTo, {
    path: ['stayTo'],
    message: 'stayTo before stayFrom'
  })
export type GuestListInput = z.input<typeof guestListSchema>

// --- Companies (G-191) -----------------------------------------------------------------------------------

const companyFields = z.object({
  title: z.string().trim().min(1).max(200),
  address: optionalText(500),
  city: optionalText(80),
  taxOffice: optionalText(120),
  taxNumber: optionalTaxNumber,
  phone: optionalText(40),
  email: optionalEmail,
  iban: optionalIban,
  contactPerson: optionalText(120),
  note: optionalText(1000),
  favorite: z.boolean()
})

export const companyInputSchema = companyFields.extend({ favorite: z.boolean().default(false) })
export type CompanyInput = z.input<typeof companyInputSchema>

export const companyUpdateSchema = companyFields.partial()
export type CompanyUpdate = z.input<typeof companyUpdateSchema>

export const COPY_LOCALES = ['tr', 'en', 'ru'] as const
export type CopyLocale = (typeof COPY_LOCALES)[number]
export const copyLocaleSchema = z.enum(COPY_LOCALES)
/** "multi" = one field per line (paste into an invoice program); "single" = one line. */
export const copyFormatSchema = z.enum(['multi', 'single'])
export type CopyFormat = z.infer<typeof copyFormatSchema>

export const companyListSchema = z.object({
  q: z
    .string()
    .trim()
    .transform((q) => q.slice(0, 100).trim())
    .optional()
})

// --- Blacklist (G-52, §6.9) ------------------------------------------------------------------------------

export const BLACKLIST_SEVERITIES = ['warn', 'block'] as const

export const blacklistInputSchema = z
  .object({
    /** Add from a guest card: name, document and phone default to the guest's. */
    guestId: idSchema.nullish(),
    name: z.string().trim().max(160).optional(),
    idDocNumber: optionalText(40),
    phone: optionalText(40),
    severity: z.enum(BLACKLIST_SEVERITIES),
    /** Short code chosen in the UI (damage, unpaid, behaviour…); the text explains. */
    reasonCode: z.string().trim().min(1).max(40),
    reasonText: z.string().trim().min(1).max(1000),
    incidentDate: localDateSchema.nullish()
  })
  .refine((b) => !!b.guestId || !!b.name, { path: ['name'], message: 'name or guest required' })
export type BlacklistInput = z.input<typeof blacklistInputSchema>

export const blacklistRemoveReasonSchema = z.string().trim().min(1).max(500)

export const blacklistListSchema = z.object({
  status: z.enum(['active', 'removed', 'all']).default('active')
})
export type BlacklistListInput = z.input<typeof blacklistListSchema>
