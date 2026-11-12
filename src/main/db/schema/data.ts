import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { bool, day, id, timestamps } from './columns'

// Exchange rates, KBS statistics imports, country mapping and backups (03-mimari.md §4.8; G-70, G-112, G-120,
// G-150, K-24, K-29, K-36). KBS rows never contain names or identity numbers (§4.9-8).

export const fxRates = sqliteTable(
  'fx_rates',
  {
    id: id(),
    ts: text('ts').notNull(),
    base: text('base').notNull(),
    quote: text('quote').notNull(),
    midRateMicro: integer('mid_rate_micro').notNull(),
    source: text('source', { enum: ['market_mid', 'user_api', 'tcmb', 'manual', 'hotel'] }).notNull(),
    provider: text('provider'),
    isManual: bool('is_manual').notNull().default(false),
    createdBy: text('created_by'),
    createdAt: text('created_at').notNull()
  },
  (t) => [
    uniqueIndex('fx_rates_unique').on(t.ts, t.base, t.quote, t.source),
    index('fx_rates_pair_idx').on(t.base, t.quote, t.ts),
    // The freeze lookup reads the newest rate per source. Added in 0002.
    index('fx_rates_source_idx').on(t.base, t.quote, t.source, t.ts)
  ]
)

export const kbsImports = sqliteTable('kbs_imports', {
  id: id(),
  periodYear: integer('period_year').notNull(),
  periodMonth: integer('period_month').notNull(),
  fileName: text('file_name').notNull(),
  importedAt: text('imported_at').notNull(),
  rowCount: integer('row_count').notNull(),
  sameDayCount: integer('same_day_count').notNull(),
  activeCount: integer('active_count').notNull(),
  createdBy: text('created_by'),
  /** Day range written in the KBS file name ("01092026_30092026"); null when the name has none. Added in 0008. */
  rangeFrom: day('range_from'),
  rangeTo: day('range_to'),
  /** When the table was entered into the ministry panel ("bildirildi"), and by whom. Added in 0008. */
  reportedAt: text('reported_at'),
  reportedBy: text('reported_by'),
  ...timestamps
})

export const kbsStayRows = sqliteTable(
  'kbs_stay_rows',
  {
    id: id(),
    importId: text('import_id')
      .notNull()
      .references(() => kbsImports.id),
    arrivalAt: day('arrival_at').notNull(),
    departureAt: day('departure_at'),
    roomNo: text('room_no').notNull(),
    gender: text('gender'),
    nationalityRaw: text('nationality_raw').notNull(),
    nationalityIso: text('nationality_iso'),
    /**
     * A row whose nationality KBS left empty ("" or "-"), assigned to a country by the user for this row only
     * (never remembered in country_map; added in 0014).
     */
    assignedIso2: text('assigned_iso2'),
    statusRaw: text('status_raw'),
    nightsComputed: integer('nights_computed').notNull(),
    // 'manual': the user corrected the day an in-house guest is counted to (no CHECK constraint, no migration).
    nightsBasis: text('nights_basis', { enum: ['actual', 'plan', 'import_day', 'manual'] }).notNull(),
    countedUntil: day('counted_until'),
    inPeriod: bool('in_period').notNull()
  },
  (t) => [index('kbs_stay_rows_import_idx').on(t.importId)]
)

/** K-36: normalised KBS spelling → ISO2 + ministry Turkish name; user confirmations are permanent. */
export const countryMap = sqliteTable('country_map', {
  keyNormalized: text('key_normalized').primaryKey(),
  rawExample: text('raw_example').notNull(),
  iso2: text('iso2'),
  ministryNameTr: text('ministry_name_tr'),
  source: text('source', { enum: ['seed', 'user'] }).notNull(),
  confirmedBy: text('confirmed_by'),
  confirmedAt: text('confirmed_at'),
  ...timestamps
})

export const backups = sqliteTable(
  'backups',
  {
    id: id(),
    createdAt: text('created_at').notNull(),
    path: text('path').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    sha256: text('sha256').notNull(),
    verified: bool('verified').notNull().default(false),
    kind: text('kind', { enum: ['auto', 'manual', 'safety', 'pre_migration'] }).notNull(),
    location: text('location', { enum: ['local', 'cloud'] })
      .notNull()
      .default('local'),
    encrypted: bool('encrypted').notNull().default(false),
    chunks: integer('chunks'),
    note: text('note'),
    restoredAt: text('restored_at'),
    dbDay: day('db_day')
  },
  (t) => [index('backups_created_idx').on(t.createdAt)]
)

/**
 * One run of the import wizard (faz-14 madde 4; P14fix #2): which file went in, and, once a person cancelled it,
 * when and why (the rows it wrote are voided through their services; nothing is deleted).
 */
export const importBatches = sqliteTable(
  'import_batches',
  {
    id: id(),
    template: text('template', { enum: ['reservationGrid', 'ledgerRows', 'salaryRows'] }).notNull(),
    fileName: text('file_name').notNull(),
    /** sha256 of the file's bytes: the same file again is pointed out in the preview. */
    fileSha256: text('file_sha256').notNull(),
    /** Counts of what was written ({reservations, payments, expenses, …}). */
    summaryJson: text('summary_json', { mode: 'json' }).$type<Record<string, number>>().notNull(),
    createdBy: text('created_by'),
    voidedAt: text('voided_at'),
    voidedBy: text('voided_by'),
    voidReason: text('void_reason'),
    ...timestamps
  },
  (t) => [index('import_batches_created_idx').on(t.createdAt)]
)

/**
 * What one imported record wrote, under its fingerprint (template + the record's content + its place among equal
 * records of the file): a record whose fingerprint belongs to a batch still in force is "already imported".
 */
export const importRows = sqliteTable(
  'import_rows',
  {
    id: id(),
    batchId: text('batch_id')
      .notNull()
      .references(() => importBatches.id),
    fingerprint: text('fingerprint').notNull(),
    /** 1-based row of the file. */
    row: integer('row').notNull(),
    entity: text('entity', {
      enum: [
        'reservation',
        'payment',
        'expense',
        'folio',
        'cash_handover',
        'staff_transaction',
        'employee_salary'
      ]
    }).notNull(),
    entityId: text('entity_id').notNull(),
    ...timestamps
  },
  (t) => [
    index('import_rows_fingerprint_idx').on(t.fingerprint),
    index('import_rows_batch_idx').on(t.batchId)
  ]
)
