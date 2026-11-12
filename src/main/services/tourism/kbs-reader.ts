// KBS "EGM Konaklayan Listesi" (.xlsx) reader (K-24, K-29, K-36; 03-mimari.md §6.11).
// Columns are located by header text, never by position: the export is sparse (empty cells are absent from the
// XML) and its column order may change. Privacy (KVKK, data minimisation): only the five columns the ministry
// statistics need are read; identity columns (Tc Kimlik No, Geçerli Belge, Adı, Soyadı, Araç Plakası) and
// Cinsiyet are never touched and never returned.
import type ExcelJS from 'exceljs'
import { isLocalDate, type LocalDate } from '@shared/date'
import { normalizeCountryKey } from './country-map'

export interface KbsRow {
  arrival: LocalDate
  /** null = still in-house (KBS writes the "1900-01-01" sentinel) or unusable. May be before `arrival` (bad row). */
  departure: LocalDate | null
  room: string
  nationalityRaw: string
  /** "Aktif" (in-house) or "Pasif" (checked out), as written. */
  status: string
}

export type KbsFormatErrorCode = 'KBS_UNREADABLE' | 'KBS_NO_SHEET' | 'KBS_MISSING_COLUMN'

/** The file is not a KBS export we understand. `column` names the missing header (Turkish, as in KBS). */
export class KbsFormatError extends Error {
  readonly code: KbsFormatErrorCode
  readonly column: string | null

  constructor(code: KbsFormatErrorCode, column: string | null = null) {
    super(column ? `${code}: ${column}` : code)
    this.name = 'KbsFormatError'
    this.code = code
    this.column = column
  }
}

/** Header texts of the columns we read, exactly as KBS writes them. Nothing else is looked up. */
export const KBS_COLUMNS = {
  arrival: 'Geliş Tarihi',
  departure: 'Çıkış Tarihi',
  room: 'Verilen Oda',
  nationality: 'Uyruğu',
  status: 'Durum'
} as const

type ColumnKey = keyof typeof KBS_COLUMNS
const COLUMN_KEYS = Object.keys(KBS_COLUMNS) as ColumnKey[]

/** How many leading rows may precede the header (title lines in a hand-edited export). */
const HEADER_SEARCH_ROWS = 10
/** Excel serial of 1970-01-01. */
const EXCEL_EPOCH_OFFSET = 25_569
const MS_PER_DAY = 86_400_000
/** Departures before this are KBS's "not checked out" sentinel (1900-01-01, Excel serial ≈ 1). */
const SENTINEL_BEFORE = '1901-01-01'

type Scalar = string | number | boolean | Date | null

function scalarOf(value: ExcelJS.CellValue): Scalar {
  if (value === null || value === undefined) return null
  if (typeof value !== 'object' || value instanceof Date) return value
  if ('result' in value) {
    const r = value.result
    return r === undefined || (typeof r === 'object' && !(r instanceof Date)) ? null : r
  }
  if ('richText' in value) return value.richText.map((t) => t.text).join('')
  if ('text' in value) return value.text
  return null // error cells
}

const textOf = (value: Scalar): string =>
  value === null ? '' : value instanceof Date ? value.toISOString() : String(value).trim()

function dayFromMs(ms: number): LocalDate | null {
  if (!Number.isFinite(ms)) return null
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return null
  const day = d.toISOString().slice(0, 10)
  return isLocalDate(day) ? day : null
}

/**
 * Excel cell → local calendar day without any time-zone shift. KBS serials are wall-clock times, so they are read
 * as UTC (a 23:30 arrival stays on its day); a local-time getter would move it in Türkiye (UTC+3).
 */
export function toLocalDay(value: unknown): LocalDate | null {
  if (value === null || value === undefined || value === '') return null
  if (value instanceof Date) return dayFromMs(value.getTime())
  if (typeof value === 'number') return dayFromMs(Math.round((value - EXCEL_EPOCH_OFFSET) * MS_PER_DAY))
  if (typeof value !== 'string') return null
  const s = value.trim()
  const dotted = /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s|$)/.exec(s) // "21.09.2026 14:30"
  if (dotted) {
    const [, d = '', m = '', y = ''] = dotted
    const day = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
    return isLocalDate(day) ? day : null
  }
  const iso = /^(\d{4}-\d{2}-\d{2})(?:[T\s]|$)/.exec(s)
  if (iso) return isLocalDate(iso[1]) ? iso[1] : null
  const n = Number(s.replace(',', '.'))
  return Number.isFinite(n) && s !== '' ? toLocalDay(n) : null
}

const headerKey = (text: string): string => normalizeCountryKey(text)
const REQUIRED_KEYS: ReadonlyMap<string, ColumnKey> = new Map(
  COLUMN_KEYS.map((k) => [headerKey(KBS_COLUMNS[k]), k] as const)
)

interface HeaderMatch {
  row: number
  columns: Partial<Record<ColumnKey, number>>
  found: number
}

function findHeader(ws: ExcelJS.Worksheet): HeaderMatch {
  let best: HeaderMatch = { row: 1, columns: {}, found: 0 }
  const last = Math.min(ws.rowCount, HEADER_SEARCH_ROWS)
  for (let r = 1; r <= last; r++) {
    const columns: Partial<Record<ColumnKey, number>> = {}
    let found = 0
    ws.getRow(r).eachCell({ includeEmpty: false }, (cell, col) => {
      const key = REQUIRED_KEYS.get(headerKey(textOf(scalarOf(cell.value))))
      if (key && columns[key] === undefined) {
        columns[key] = col
        found++
      }
    })
    if (found > best.found) best = { row: r, columns, found }
    if (found === COLUMN_KEYS.length) break
  }
  return best
}

async function loadWorkbook(buffer: Buffer | ArrayBuffer): Promise<ExcelJS.Workbook> {
  // Loaded on first use: the spreadsheet library is large and only the monthly KBS import needs it.
  const { default: Excel } = await import('exceljs')
  const wb = new Excel.Workbook()
  const bytes = buffer instanceof ArrayBuffer ? buffer : new Uint8Array(buffer).buffer // copies the Node buffer's bytes
  try {
    await wb.xlsx.load(bytes)
  } catch {
    throw new KbsFormatError('KBS_UNREADABLE')
  }
  return wb
}

/** Parse a KBS export. Throws `KbsFormatError` when the file has no sheet or misses a required column. */
export async function readKbsWorkbook(buffer: Buffer | ArrayBuffer): Promise<KbsRow[]> {
  const wb = await loadWorkbook(buffer)
  if (wb.worksheets.length === 0) throw new KbsFormatError('KBS_NO_SHEET')

  // The export has one sheet; if a user saved extra sheets, take the one whose header matches best.
  let sheet: ExcelJS.Worksheet | undefined
  let header: HeaderMatch | undefined
  for (const ws of wb.worksheets) {
    const h = findHeader(ws)
    if (!header || h.found > header.found) {
      sheet = ws
      header = h
    }
  }
  if (!sheet || !header) throw new KbsFormatError('KBS_NO_SHEET')
  const columns = {} as Record<ColumnKey, number>
  for (const k of COLUMN_KEYS) {
    const col = header.columns[k]
    if (col === undefined) throw new KbsFormatError('KBS_MISSING_COLUMN', KBS_COLUMNS[k])
    columns[k] = col
  }

  const rows: KbsRow[] = []
  const headerRow = header.row
  sheet.eachRow({ includeEmpty: false }, (row, n) => {
    if (n <= headerRow) return
    const get = (k: ColumnKey): Scalar => scalarOf(row.getCell(columns[k]).value)
    const arrival = toLocalDay(get('arrival'))
    if (!arrival) return // blank or footer row
    let departure = toLocalDay(get('departure'))
    // Before the sentinel cut-off = "not checked out". A real date before the arrival is kept as written: the row
    // is a data error (listed apart, never counted as a night or as in-house).
    if (departure && departure < SENTINEL_BEFORE) departure = null
    rows.push({
      arrival,
      departure,
      room: textOf(get('room')),
      nationalityRaw: textOf(get('nationality')),
      status: textOf(get('status'))
    })
  })
  return rows
}
