import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { bool, day, i18nJson, id, timestamps } from './columns'

// Guests, companies, blacklist and status tags (03-mimari.md §4.3; G-32, G-50…G-52, G-191, G-192).
// No birth date/place, parents' names, gender or address are kept (S-15, S-92; KVKK data minimisation).

export const companies = sqliteTable(
  'companies',
  {
    id: id(),
    title: text('title').notNull(),
    nameNormalized: text('name_normalized').notNull(),
    address: text('address'),
    city: text('city'),
    taxOffice: text('tax_office'),
    taxNumber: text('tax_number'),
    phone: text('phone'),
    email: text('email'),
    iban: text('iban'),
    contactPerson: text('contact_person'),
    note: text('note'),
    favorite: bool('favorite').notNull().default(false),
    lastUsedAt: text('last_used_at'),
    createdBy: text('created_by'),
    ...timestamps
  },
  (t) => [index('companies_name_idx').on(t.nameNormalized)]
)

export const guests = sqliteTable(
  'guests',
  {
    id: id(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    nameNormalized: text('name_normalized').notNull(),
    phone: text('phone'),
    phoneNormalized: text('phone_normalized'),
    email: text('email'),
    /** ISO2, optional (hidden by default; G-50). */
    nationality: text('nationality'),
    idDocType: text('id_doc_type', { enum: ['tc', 'passport', 'other'] }),
    /** Stored normalised (upper case, letters/digits only). */
    idDocNumber: text('id_doc_number'),
    language: text('language'),
    vip: bool('vip').notNull().default(false),
    standingNote: text('standing_note'),
    standingNoteLevel: text('standing_note_level', { enum: ['info', 'warn'] })
      .notNull()
      .default('info'),
    notes: text('notes'),
    companyId: text('company_id').references(() => companies.id),
    mergedIntoId: text('merged_into_id'),
    createdBy: text('created_by'),
    ...timestamps
  },
  (t) => [
    index('guests_name_idx').on(t.nameNormalized),
    index('guests_phone_idx').on(t.phoneNormalized),
    index('guests_doc_idx').on(t.idDocNumber)
  ]
)

export const blacklist = sqliteTable(
  'blacklist',
  {
    id: id(),
    guestId: text('guest_id').references(() => guests.id),
    name: text('name').notNull(),
    nameNormalized: text('name_normalized').notNull(),
    idDocNumber: text('id_doc_number'),
    phoneNormalized: text('phone_normalized'),
    severity: text('severity', { enum: ['warn', 'block'] }).notNull(),
    reasonCode: text('reason_code').notNull(),
    reasonText: text('reason_text').notNull(),
    incidentDate: day('incident_date'),
    addedBy: text('added_by'),
    approvedBy: text('approved_by'),
    status: text('status', { enum: ['active', 'removed'] })
      .notNull()
      .default('active'),
    removedAt: text('removed_at'),
    removedBy: text('removed_by'),
    removedReason: text('removed_reason'),
    ...timestamps
  },
  (t) => [
    index('blacklist_name_idx').on(t.nameNormalized),
    index('blacklist_doc_idx').on(t.idDocNumber),
    index('blacklist_phone_idx').on(t.phoneNormalized)
  ]
)

/**
 * Status tags (G-32, K-21): `auto` rows have fixed codes (paid, unpaid, partial, dayuse, pastEmpty, empty,
 * blocked) and can only be renamed, recoloured or switched off; `custom` rows are the hotel's own.
 * `color` null = theme default (`--status-*`).
 */
export const statusTags = sqliteTable(
  'status_tags',
  {
    id: id(),
    code: text('code').notNull(),
    kind: text('kind', { enum: ['auto', 'custom'] }).notNull(),
    name: text('name'),
    nameI18n: i18nJson('name_i18n_json'),
    color: text('color'),
    description: text('description'),
    enabled: bool('enabled').notNull().default(true),
    sort: integer('sort').notNull().default(0),
    priorityOverAuto: bool('priority_over_auto').notNull().default(false),
    ...timestamps
  },
  (t) => [uniqueIndex('status_tags_code_unique').on(t.code)]
)

export const reservationTags = sqliteTable(
  'reservation_tags',
  {
    reservationId: text('reservation_id').notNull(),
    tagId: text('tag_id')
      .notNull()
      .references(() => statusTags.id)
  },
  (t) => [primaryKey({ columns: [t.reservationId, t.tagId] })]
)
