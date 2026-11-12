// Backups, restore, export and import (faz-14; G-120…G-123, K-05, K-30, K-32, S-42, S-43). Schemas of
// procedures/backup.ts; the services check permissions (G-23).
import * as z from 'zod'
import { APP_LOCALES } from '../format'
import { idSchema, localDateSchema } from './rooms'
import { currencyCode } from './settings'

// ---------------------------------------------------------------------------------------------------- backups
export const BACKUP_SOURCES = ['local', 'drive', 'preMigration'] as const
export type BackupSource = (typeof BACKUP_SOURCES)[number]
export const BACKUP_ITEM_KINDS = ['auto', 'manual', 'safety', 'pre_migration'] as const
/** ok: copies arrive · missing: no Drive folder · noKey: no safe place for the key on this computer · error. */
export const DRIVE_STATES = ['ok', 'missing', 'noKey', 'error'] as const
export type DriveState = (typeof DRIVE_STATES)[number]
/**
 * What the Today badge says: stale = no backup for two days; drive = the Drive copy is not made; failed;
 * restoreFailed = a restore could not be applied at start (P14fix #4); keyNotShown = the Bismuth key exists but was
 * never shown or typed in from paper (P14fix #8).
 */
export const BACKUP_WARNINGS = ['stale', 'drive', 'failed', 'restoreFailed', 'keyNotShown'] as const
export type BackupWarning = (typeof BACKUP_WARNINGS)[number]

export const backupItemSchema = z.object({
  /** File (or folder) name: what restore and verify take. */
  id: z.string(),
  source: z.enum(BACKUP_SOURCES),
  kind: z.enum(BACKUP_ITEM_KINDS),
  createdAt: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  encrypted: z.boolean(),
  /** null: not checked since it was made by an earlier version. */
  verified: z.boolean().nullable(),
  note: z.string().nullable()
})
export type BackupItem = z.infer<typeof backupItemSchema>

export const backupStatusSchema = z.object({
  lastBackupAt: z.string().nullable(),
  lastAutoAt: z.string().nullable(),
  nextAutoAt: z.string().nullable(),
  running: z.boolean(),
  drive: z.object({ state: z.enum(DRIVE_STATES), lastAt: z.string().nullable() }),
  warnings: z.array(z.enum(BACKUP_WARNINGS)),
  restorePending: z.boolean()
})
export type BackupStatus = z.infer<typeof backupStatusSchema>

export const backupOverviewSchema = z.object({
  status: backupStatusSchema,
  /** The hotel computer's own folders: null over the network (N-9: a phone learns no local paths). */
  dataDir: z.string().nullable(),
  dbBytes: z.number().int().nonnegative(),
  attachmentsBytes: z.number().int().nonnegative(),
  backupsDir: z.string().nullable(),
  /** Where the Drive copies go (found or set), null when there is none — and always over the network (N-9). */
  driveDir: z.string().nullable(),
  key: z.object({
    /** This computer can keep the key safely (Windows/macOS key store). */
    available: z.boolean(),
    exists: z.boolean(),
    createdAt: z.string().nullable()
  }),
  items: z.array(backupItemSchema),
  pendingRestore: z.object({ id: z.string(), requestedAt: z.string() }).nullable(),
  /** A restore that could not be applied at the last start, until someone has seen it (P14fix #4). */
  restoreFailed: z
    .object({
      id: z.string().nullable(),
      /** checksum: the copy changed on disk · missing · invalid marker · io: files could not be swapped. */
      reason: z.enum(['checksum', 'missing', 'invalid', 'io']),
      failedAt: z.string()
    })
    .nullable(),
  /** messageKey of the last failure (errors.*), null when the last run went well. */
  lastError: z.string().nullable(),
  /** Folders can be opened from this window (the program's own window, not a phone). */
  canOpenFolders: z.boolean()
})
export type BackupOverview = z.infer<typeof backupOverviewSchema>

export const backupRunInputSchema = z.object({ note: z.string().trim().max(200).optional() }).strict()

export const backupRefSchema = z
  .object({ source: z.enum(BACKUP_SOURCES), id: z.string().trim().min(1).max(200) })
  .strict()

/** The key as the owner keeps it on paper: 11 groups of 5 letters/digits (K-05). */
export const recoveryTextSchema = z.string().trim().min(20).max(120)

export const restoreInputSchema = z
  .object({
    source: z.enum(BACKUP_SOURCES),
    id: z.string().trim().min(1).max(200),
    /** Needed for a Drive copy on a computer that does not hold the key yet. */
    recoveryText: recoveryTextSchema.optional(),
    /** The person agreed to change this computer's own, different key to the paper's. */
    replace: z.boolean().optional()
  })
  .strict()

export const restoreScheduledSchema = z.object({ id: z.string(), requestedAt: z.string() })

export const FOLDER_KINDS = ['data', 'backups', 'drive'] as const
export const openFolderInputSchema = z.object({ which: z.enum(FOLDER_KINDS) }).strict()

export const recoveryTextOutputSchema = z.object({ text: z.string(), createdAt: z.string() })

// ---------------------------------------------------------------------------------------------------- export
export const EXPORT_DATASETS = [
  'reservationNights',
  'reservations',
  'occupants',
  'ledgerIncome',
  'ledgerExpenses',
  'expenseItems',
  'staff',
  'salaries',
  'staffTransactions',
  'leave',
  'workHours',
  'guests',
  'companies',
  'blacklist',
  'contacts',
  'products',
  'laundry',
  'tasks',
  'issues',
  'lostItems',
  // QA2x (G-122 "tüm tablolar", S-43): the tables the first list left out.
  'folioCharges',
  'reservationNotes',
  'roomTypes',
  'rooms',
  'roomCapacity',
  'roomBlocks',
  'cashHandovers',
  'ledgerDays',
  'employmentPeriods',
  'shiftHandovers',
  'boardNotes',
  'calendarDays',
  'fxRates',
  'laundryPrices',
  'laundrySettlements',
  'productCategories',
  'importBatches'
] as const
export type ExportDataset = (typeof EXPORT_DATASETS)[number]
export const EXPORT_FORMATS = ['csv', 'xlsx'] as const
export type ExportFormat = (typeof EXPORT_FORMATS)[number]

export const exportDatasetInfoSchema = z.object({
  id: z.enum(EXPORT_DATASETS),
  rows: z.number().int().nonnegative(),
  /** Identity numbers and descriptive notes are left out for this role. */
  sensitiveHidden: z.boolean()
})

export const exportRunInputSchema = z
  .object({
    /** One table, or every table the role may see as sheets of one workbook (xlsx only). */
    dataset: z.union([z.enum(EXPORT_DATASETS), z.literal('all')]),
    format: z.enum(EXPORT_FORMATS),
    locale: z.enum(APP_LOCALES),
    /** Inclusive range for dated tables (reservations, ledger…); absent = everything. */
    from: localDateSchema.optional(),
    to: localDateSchema.optional()
  })
  .strict()
  .refine((v) => v.format === 'xlsx' || v.dataset !== 'all', { path: ['dataset'], message: 'all needs xlsx' })
  .refine((v) => !v.from || !v.to || v.from <= v.to, { path: ['to'], message: 'to before from' })
export type ExportRunInput = z.input<typeof exportRunInputSchema>

export const exportFileSchema = z.object({
  fileName: z.string(),
  mime: z.string(),
  /** The file, for a browser to download ('' when the program's window saved it itself). */
  base64: z.string(),
  rows: z.number().int().nonnegative(),
  /**
   * download: the window downloads `base64` (phone, browser) · saved: the program's "Save as" dialog wrote it to
   * `savedPath` · canceled: the dialog was closed, nothing was written.
   */
  delivery: z.enum(['download', 'saved', 'canceled']),
  savedPath: z.string().nullable()
})
export type ExportFile = z.infer<typeof exportFileSchema>

// ---------------------------------------------------------------------------------------------------- import
/** P14fix #10: "Maaşlar" too (G-123): one row per employee and month. */
export const IMPORT_TEMPLATES = ['reservationGrid', 'ledgerRows', 'salaryRows'] as const
export type ImportTemplate = (typeof IMPORT_TEMPLATES)[number]

/** Columns a template reads; values are 0-based column numbers (null = not in this file). */
export const GRID_FIELDS = ['room', 'firstDay'] as const
export const LEDGER_FIELDS = [
  'date',
  'incomeCollected',
  'incomeAmount',
  'incomeCurrency',
  'incomeName',
  'incomeMethod',
  'incomeRoom',
  'incomeChannel',
  'expenseCollected',
  'expenseAmount',
  'expenseCurrency',
  'expenseDescription'
] as const
/** Salary sheet: employee, month, net monthly salary, amount paid, method; date and currency are optional. */
export const SALARY_FIELDS = ['employee', 'month', 'salary', 'paid', 'method', 'date', 'currency'] as const
export type GridField = (typeof GRID_FIELDS)[number]
export type LedgerField = (typeof LEDGER_FIELDS)[number]
export type SalaryField = (typeof SALARY_FIELDS)[number]
export type ImportField = GridField | LedgerField | SalaryField
const IMPORT_FIELDS = [...GRID_FIELDS, ...LEDGER_FIELDS, ...SALARY_FIELDS] as const

export const IMPORT_ERROR_CODES = [
  'unknownRoom',
  'emptyName',
  'badDate',
  'badAmount',
  'unknownCurrency',
  'unknownMethod',
  'unknownChannel',
  'noPrice',
  'mixedCurrency',
  /** Salary sheet: no employee by that name (employees are added on the Staff screen first). */
  'unknownEmployee',
  'badMonth',
  'conflict',
  'dayClosed',
  'refused',
  'failed'
] as const
export type ImportErrorCode = (typeof IMPORT_ERROR_CODES)[number]

/** 6 MB file → 8 MB base64: the IPC/HTTP body limit. */
export const IMPORT_MAX_BASE64 = 7_900_000

const columnIndex = z.number().int().min(0).max(500).nullable()

export const importInputSchema = z
  .object({
    template: z.enum(IMPORT_TEMPLATES),
    fileName: z.string().trim().min(1).max(200),
    contentBase64: z.string().min(1).max(IMPORT_MAX_BASE64),
    /** Sheet of an .xlsx file (0-based). */
    sheet: z.number().int().min(0).max(100).default(0),
    /** 1-based row of the column titles; absent = found by itself. */
    headerRow: z.number().int().min(1).max(1000).optional(),
    /** Column of each field; absent fields are guessed from the titles. */
    mapping: z.partialRecord(z.enum(IMPORT_FIELDS), columnIndex).default({}),
    /** Month of day headers that hold only a day number ("1", "2 (cts)"): 'YYYY-MM'. */
    month: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
      .optional(),
    channelId: idSchema.optional(),
    /** Currency of amounts written without one (default: the hotel's base currency). */
    currency: currencyCode.optional(),
    /** Reservation sheet: nights coloured "paid" get a payment with this method (K-30). */
    paidMethodId: idSchema.nullish(),
    /** Ledger: method of income lines that do not say one (salary sheet: of the payments). */
    defaultMethodId: idSchema.nullish(),
    /** Ledger: section of the expense lines (default: the general section). */
    sectionId: idSchema.optional(),
    /** Ledger: an income line on a room and day of an existing reservation becomes its payment. */
    matchReservations: z.boolean().default(true)
  })
  .strict()
export type ImportInput = z.input<typeof importInputSchema>

export const importErrorSchema = z.object({
  /** 1-based row of the file. */
  row: z.number().int(),
  /** Column title (or letter) the problem is in. */
  column: z.string().nullable(),
  code: z.enum(IMPORT_ERROR_CODES),
  value: z.string()
})
export type ImportError = z.infer<typeof importErrorSchema>

export const importRecordSchema = z.object({
  row: z.number().int(),
  kind: z.enum(['stay', 'dayUse', 'income', 'expense', 'salary']),
  date: z.string(),
  /** Last night + 1 for a stay. */
  until: z.string().nullable(),
  room: z.string().nullable(),
  name: z.string(),
  amountMinor: z.number().int(),
  currency: z.string(),
  /** Nights coloured paid / a ledger line marked "x" / the salary paid that month. */
  paidMinor: z.number().int(),
  marked: z.boolean(),
  detail: z.string().nullable(),
  /** Taken in by an earlier import still in force: skipped (P14fix #2). */
  already: z.boolean().default(false)
})
export type ImportRecord = z.infer<typeof importRecordSchema>

export const importDuplicateSchema = z.object({
  name: z.string(),
  /** Similar names: in the file or among the guests already saved. */
  similar: z.array(z.string())
})

export const importPreviewSchema = z.object({
  template: z.enum(IMPORT_TEMPLATES),
  sheetNames: z.array(z.string()),
  headerRow: z.number().int(),
  /** Titles of the header row ("A", "B"… when empty). */
  columns: z.array(z.string()),
  mapping: z.partialRecord(z.enum(IMPORT_FIELDS), columnIndex),
  /** Day headers need a month ("1", "2"…) and none was given. */
  needsMonth: z.boolean(),
  rows: z.number().int(),
  records: z.array(importRecordSchema),
  recordCount: z.number().int(),
  errors: z.array(importErrorSchema),
  errorCount: z.number().int(),
  duplicates: z.array(importDuplicateSchema),
  /** "SATILMAZ" cells skipped (room blocks are not reservations). */
  blockedCells: z.number().int(),
  /** Records an earlier import (not cancelled) took in already: the import skips them (P14fix #2). */
  alreadyImported: z.number().int(),
  /** This very file was imported before (and that import is in force): when. */
  sameFileAt: z.string().nullable()
})
export type ImportPreview = z.infer<typeof importPreviewSchema>

export const importReportSchema = z.object({
  /** The import's own record ("Bu aktarımı iptal et"); null when nothing was written. */
  batchId: z.string().nullable(),
  reservations: z.number().int(),
  nights: z.number().int(),
  payments: z.number().int(),
  expenses: z.number().int(),
  guestsCreated: z.number().int(),
  /** Salary sheet: salary amounts set and salary payments written. */
  salaries: z.number().int(),
  salaryPayments: z.number().int(),
  /** Records taken in by an earlier import: skipped. */
  skipped: z.number().int(),
  errors: z.array(importErrorSchema),
  errorCount: z.number().int(),
  duplicates: z.array(importDuplicateSchema)
})
export type ImportReport = z.infer<typeof importReportSchema>

// ---------------------------------------------------------------------------------------------- import batches
export const importBatchSchema = z.object({
  id: z.string(),
  template: z.enum(IMPORT_TEMPLATES),
  fileName: z.string(),
  createdAt: z.string(),
  createdByName: z.string().nullable(),
  /** What the import wrote: reservations, payments, expenses, salaries, salaryPayments… */
  summary: z.record(z.string(), z.number().int()),
  voidedAt: z.string().nullable(),
  voidReason: z.string().nullable()
})
export type ImportBatch = z.infer<typeof importBatchSchema>

/** "Bu aktarımı iptal et": everything the import wrote is voided through its service, with the reason. */
export const importVoidInputSchema = z
  .object({ id: idSchema, reason: z.string().trim().min(3).max(500) })
  .strict()

/** An empty file of a template with its column titles and two made-up rows (the owner fills it in). */
export const importSampleInputSchema = z
  .object({ template: z.enum(IMPORT_TEMPLATES), locale: z.enum(APP_LOCALES) })
  .strict()
