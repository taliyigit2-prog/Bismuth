// Ministry accommodation statistics from the KBS export (03-mimari.md §6.11; G-150, K-24, K-29, K-36).
import * as z from 'zod'
import { isLocalDate, type LocalDate } from '../date'
import { idSchema, localDateSchema } from './rooms'

/** "YYYY-MM": the month the statistics are for (arrival month, K-29). */
export const statsPeriodSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'YYYY-MM')

/** A KBS month export is a few hundred rows (≈100 KB); anything far bigger is not a KBS file. */
export const KBS_MAX_BYTES = 20 * 1024 * 1024
/**
 * Over the wire the file travels as base64 inside the JSON envelope (≤ 8 MB, MAX_BODY_BYTES): about 5.6 MB of
 * file, fifty times a real month.
 */
export const KBS_MAX_BASE64 = 7_500_000

export const kbsImportInputSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  /** Omitted: taken from the file name ("…_01092026_30092026.xlsx"), otherwise from the rows' arrival month. */
  period: statsPeriodSchema.optional(),
  bytes: z
    .instanceof(Uint8Array)
    .refine((b) => b.byteLength > 0 && b.byteLength <= KBS_MAX_BYTES, { message: 'file size' })
})
export type KbsImportInput = z.input<typeof kbsImportInputSchema>

/** The user's one-time confirmation of a KBS nationality spelling (K-36); permanent in country_map. */
export const countryConfirmInputSchema = z.object({
  rawValue: z.string().trim().min(1).max(120),
  /** ISO 3166-1 alpha-2, "XC" for KKTC, or null for a value with no code (historical states). */
  iso2: z
    .string()
    .regex(/^[A-Z]{2}$/, 'ISO2')
    .nullable(),
  /** Name typed into the ministry panel. */
  ministryNameTr: z.string().trim().min(1).max(80)
})
export type CountryConfirmInput = z.input<typeof countryConfirmInputSchema>

const iso2Schema = z.string().regex(/^[A-Z]{2}$/, 'ISO2')

/**
 * The day range KBS writes into the export's name: "EGM_Konaklayan_Listesi_01092026_30092026.xlsx" → 1–30
 * September 2026. Null when the name carries no valid range (a renamed file): the rows decide the month then.
 */
export function kbsFileRange(fileName: string): { from: LocalDate; to: LocalDate } | null {
  const m = /(\d{2})(\d{2})(\d{4})[_\s-]+(\d{2})(\d{2})(\d{4})/.exec(fileName)
  if (!m) return null
  const [, d1 = '', m1 = '', y1 = '', d2 = '', m2 = '', y2 = ''] = m
  const from = `${y1}-${m1}-${d1}`
  const to = `${y2}-${m2}-${d2}`
  return isLocalDate(from) && isLocalDate(to) && from <= to ? { from, to } : null
}

/** The statistics month a file name points at (the month of its first day), or null. */
export const kbsFilePeriod = (fileName: string): string | null =>
  kbsFileRange(fileName)?.from.slice(0, 7) ?? null

// ---- procedure inputs ----

export const tourismImportRequestSchema = z
  .object({
    fileName: z.string().trim().min(1).max(255),
    /** The .xlsx bytes, base64 (the envelope is JSON). */
    dataBase64: z.string().min(1).max(KBS_MAX_BASE64),
    period: statsPeriodSchema.optional()
  })
  .strict()
export type TourismImportRequest = z.input<typeof tourismImportRequestSchema>

export const tourismImportRefSchema = z.object({ importId: idSchema }).strict()

export const tourismRenameInputSchema = z
  .object({
    iso2: iso2Schema,
    /** Name typed into the ministry panel; null puts Bismuth's own name back. */
    name: z.string().trim().min(1).max(80).nullable()
  })
  .strict()
export type TourismRenameInput = z.input<typeof tourismRenameInputSchema>

export const tourismStayUntilInputSchema = z
  .object({
    importId: idSchema,
    rowId: idSchema,
    /** Day an in-house guest is counted to (exclusive, like a departure); null = automatic again. */
    until: localDateSchema.nullable()
  })
  .strict()
export type TourismStayUntilInput = z.input<typeof tourismStayUntilInputSchema>

export const tourismReportedInputSchema = z.object({ importId: idSchema, reported: z.boolean() }).strict()

/** A row whose nationality KBS left empty, assigned to a country for this row only; null takes it back. */
export const tourismAssignRowInputSchema = z
  .object({ importId: idSchema, rowId: idSchema, iso2: iso2Schema.nullable() })
  .strict()
export type TourismAssignRowInput = z.input<typeof tourismAssignRowInputSchema>

export const tourismExportInputSchema = z
  .object({ importId: idSchema, format: z.enum(['csv', 'xlsx']) })
  .strict()

// ---- views ----

export const tourismImportViewSchema = z.object({
  id: idSchema,
  period: statsPeriodSchema,
  fileName: z.string(),
  importedAt: z.string(),
  rowCount: z.number().int(),
  sameDayCount: z.number().int(),
  activeCount: z.number().int(),
  rangeFrom: localDateSchema.nullable(),
  rangeTo: localDateSchema.nullable(),
  reportedAt: z.string().nullable(),
  reportedByName: z.string().nullable()
})
export type TourismImportView = z.output<typeof tourismImportViewSchema>

export const REVIEW_REASONS = ['typo', 'ambiguous', 'sensitive', 'historical', 'unknown'] as const
export const IN_HOUSE_BASES = ['plan', 'import_day', 'manual'] as const

const countryOptionSchema = z.object({ iso2: z.string(), name: z.string() })
export type TourismCountryOption = z.output<typeof countryOptionSchema>

export const tourismTableViewSchema = z.object({
  import: tourismImportViewSchema,
  period: statsPeriodSchema,
  daysInMonth: z.number().int(),
  /** Real beds of the month (capacity history, K-27); null when no room has beds yet. */
  beds: z.number().int().nullable(),
  table: z.array(
    z.object({
      country: z.string(),
      iso2: z.string().nullable(),
      /** The name was changed by the user (ministry spelling). */
      renamed: z.boolean(),
      mapped: z.boolean(),
      needsReview: z.boolean(),
      arrivals: z.number().int(),
      nights: z.number().int()
    })
  ),
  totals: z.object({ arrivals: z.number().int(), nights: z.number().int() }),
  /** nights ÷ (beds × days) in basis points (7368 = 73.68 %). */
  occupancyBasisPoints: z.number().int().nullable(),
  /** The day in-house guests without a planned departure are counted to. */
  countedTo: localDateSchema,
  inHouse: z.array(
    z.object({
      rowId: idSchema.nullable(),
      room: z.string(),
      arrival: localDateSchema,
      countedUntil: localDateSchema,
      nights: z.number().int(),
      basis: z.enum(IN_HOUSE_BASES)
    })
  ),
  review: z.array(
    z.object({
      key: z.string(),
      raw: z.string(),
      reason: z.enum(REVIEW_REASONS),
      suggestions: z.array(countryOptionSchema),
      rows: z.number().int()
    })
  ),
  /**
   * Rows KBS wrote without a nationality ("" or "-"): each is assigned to a country here (never remembered for
   * later files); the table can be copied once every one is assigned.
   */
  blankNationality: z.array(
    z.object({
      rowId: idSchema.nullable(),
      room: z.string(),
      arrival: localDateSchema,
      departure: localDateSchema.nullable(),
      raw: z.string(),
      country: countryOptionSchema.nullable()
    })
  ),
  /** Rows whose departure is before the arrival: listed apart, never counted as nights. */
  invalidDates: z.array(
    z.object({
      rowId: idSchema.nullable(),
      room: z.string(),
      arrival: localDateSchema,
      departure: localDateSchema
    })
  ),
  issues: z.object({
    sameDay: z.number().int(),
    active: z.number().int(),
    missingDeparture: z.number().int(),
    outsidePeriod: z.number().int(),
    invalidDates: z.number().int()
  }),
  /** Tab-separated "country · arrivals · nights" lines for the ministry panel (no header). */
  clipboard: z.string()
})
export type TourismTableView = z.output<typeof tourismTableViewSchema>

export const tourismComparisonViewSchema = z.object({
  period: statsPeriodSchema,
  /** Per country: KBS against Bismuth's own stays (guest nationality). Only lines that differ. */
  differences: z.array(
    z.object({
      country: z.string(),
      iso2: z.string().nullable(),
      kbsArrivals: z.number().int(),
      kbsNights: z.number().int(),
      programArrivals: z.number().int(),
      programNights: z.number().int()
    })
  ),
  programTotals: z.object({ arrivals: z.number().int(), nights: z.number().int() }),
  /** People in Bismuth's stays of the month whose nationality is not written ("uyruk eksik"). */
  missingNationality: z.array(
    z.object({
      reservationCode: z.string(),
      room: z.string(),
      arrival: localDateSchema,
      name: z.string()
    })
  ),
  /** Room + arrival day in KBS but not in Bismuth. */
  onlyInKbs: z.array(z.object({ room: z.string(), arrival: localDateSchema, people: z.number().int() })),
  /** Room + arrival day in Bismuth but not in KBS: possibly not reported (G-53). */
  onlyInProgram: z.array(
    z.object({ room: z.string(), arrival: localDateSchema, reservationCode: z.string() })
  ),
  matched: z.number().int(),
  /**
   * Stays of the month without any occupant record: counted from the reservation's adults (children are not
   * separate arrivals, K-29), so the screen can say the program side rests on that head count.
   */
  headCountStays: z.number().int()
})
export type TourismComparisonView = z.output<typeof tourismComparisonViewSchema>

export const tourismExportViewSchema = z.object({
  fileName: z.string(),
  mime: z.string(),
  dataBase64: z.string()
})
export type TourismExportView = z.output<typeof tourismExportViewSchema>

export const tourismCountriesSchema = z.array(countryOptionSchema)
