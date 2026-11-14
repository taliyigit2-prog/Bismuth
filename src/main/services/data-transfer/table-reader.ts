// Reads the file the owner chose in the import wizard (faz-14 madde 4): CSV (comma, semicolon or tab; UTF-8, or the
// Windows Turkish code page Excel uses when it saves "CSV") or an .xlsx workbook — there the cell colours of the
// reservation sheet come along (K-30: red = paid…). Everything becomes rows of cell texts.
import type ExcelJS from 'exceljs'

export interface SheetTable {
  sheetNames: string[]
  /** Cell texts, row by row (rows may differ in length). */
  rows: string[][]
  /** Fill colour of each cell ("FFFF0000"), xlsx only. */
  colors: (string | null)[][]
}

export class TableReadError extends Error {
  constructor() {
    super('unreadable table file')
    this.name = 'TableReadError'
  }
}

/** Text of a CSV file: UTF-8 (with or without BOM), else Windows-1254 (Turkish Excel). */
export function decodeText(bytes: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\ufeff/, '')
  } catch {
    return new TextDecoder('windows-1254').decode(bytes)
  }
}

/** The delimiter used most in the first line outside quotes. */
function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/).find((l) => l.trim()) ?? ''
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 }
  let quoted = false
  for (const ch of firstLine) {
    if (ch === '"') quoted = !quoted
    else if (!quoted && ch in counts) counts[ch]!++
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]![1] > 0
    ? Object.entries(counts).sort((a, b) => b[1] - a[1])[0]![0]
    : ','
}

/** RFC 4180 CSV (quotes, doubled quotes, line breaks inside quotes). */
export function parseCsv(text: string): string[][] {
  const delimiter = detectDelimiter(text)
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else quoted = false
      } else cell += ch
    } else if (ch === '"' && cell === '') quoted = true
    else if (ch === delimiter) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell !== '' || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

const pad = (n: number): string => String(n).padStart(2, '0')

function cellText(cell: ExcelJS.Cell): string {
  const v = cell.value
  if (v === null || v === undefined) return ''
  if (v instanceof Date)
    // exceljs gives the sheet's date as a UTC instant.
    return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`
  if (typeof v === 'object' && 'result' in v) {
    const r = (v as { result?: unknown }).result
    if (r instanceof Date) return `${r.getUTCFullYear()}-${pad(r.getUTCMonth() + 1)}-${pad(r.getUTCDate())}`
    return r === undefined || r === null ? '' : String(r)
  }
  if (typeof v === 'object' && 'richText' in v)
    return (v as { richText: { text: string }[] }).richText.map((p) => p.text).join('')
  try {
    return cell.text ?? String(v)
  } catch {
    return String(v)
  }
}

function cellColor(cell: ExcelJS.Cell): string | null {
  const fill = cell.fill
  if (!fill || fill.type !== 'pattern' || fill.pattern === 'none') return null
  return fill.fgColor?.argb ?? null
}

export const MAX_XLSX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024
export const MAX_XLSX_ROWS = 5000
export const MAX_XLSX_COLUMNS = 100

/**
 * Sum of the uncompressed sizes the zip central directory declares, read before anything is inflated (zip bomb
 * guard). A broken or zip64 directory counts as unreadable.
 */
export function zipUncompressedTotal(bytes: Buffer): number {
  const from = Math.max(0, bytes.length - 22 - 0xffff)
  let eocd = -1
  for (let i = bytes.length - 22; i >= from; i--) {
    if (bytes.readUInt32LE(i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new TableReadError()
  const entries = bytes.readUInt16LE(eocd + 10)
  let at = bytes.readUInt32LE(eocd + 16)
  if (entries === 0xffff || at === 0xffffffff) throw new TableReadError()
  let total = 0
  for (let n = 0; n < entries; n++) {
    if (at + 46 > bytes.length || bytes.readUInt32LE(at) !== 0x02014b50) throw new TableReadError()
    const size = bytes.readUInt32LE(at + 24)
    if (size === 0xffffffff) throw new TableReadError()
    total += size
    if (total > MAX_XLSX_UNCOMPRESSED_BYTES) throw new TableReadError()
    at += 46 + bytes.readUInt16LE(at + 28) + bytes.readUInt16LE(at + 30) + bytes.readUInt16LE(at + 32)
  }
  return total
}

export async function readTable(fileName: string, bytes: Buffer, sheet = 0): Promise<SheetTable> {
  const isZip = bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b
  if (!isZip) {
    if (/\.xlsx?$/i.test(fileName)) throw new TableReadError()
    const rows = parseCsv(decodeText(bytes))
    return { sheetNames: [], rows, colors: rows.map((r) => r.map(() => null)) }
  }
  zipUncompressedTotal(bytes)
  const { default: Excel } = await import('exceljs')
  const wb = new Excel.Workbook()
  try {
    await wb.xlsx.load(new Uint8Array(bytes).buffer)
  } catch {
    throw new TableReadError()
  }
  const sheets = wb.worksheets
  const ws = sheets[sheet] ?? sheets[0]
  if (!ws) throw new TableReadError()
  if (ws.rowCount > MAX_XLSX_ROWS || ws.columnCount > MAX_XLSX_COLUMNS) throw new TableReadError()
  const rows: string[][] = []
  const colors: (string | null)[][] = []
  const width = ws.columnCount
  for (let r = 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const texts: string[] = []
    const fills: (string | null)[] = []
    for (let c = 1; c <= width; c++) {
      const cell = row.getCell(c)
      texts.push(cellText(cell))
      fills.push(cellColor(cell))
    }
    rows.push(texts)
    colors.push(fills)
  }
  return { sheetNames: sheets.map((s) => s.name), rows, colors }
}

/** "A", "B", … "AA": spreadsheet letters of a 0-based column. */
export function columnLetter(index: number): string {
  let n = index + 1
  let out = ''
  while (n > 0) {
    const r = (n - 1) % 26
    out = String.fromCharCode(65 + r) + out
    n = Math.floor((n - 1) / 26)
  }
  return out
}
