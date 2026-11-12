// The ministry table as a file (faz-10 madde 10: CSV/XLSX). The column names are the ministry panel's own field
// names (a data format like KBS_COLUMNS, not interface text): the file is read next to the panel, in Turkish.
import type { MinistryTableRow } from './ministry-table'

export const MINISTRY_COLUMNS = ['Ülke', 'Toplam Giriş', 'Toplam Geceleme'] as const
const TOTAL_LABEL = 'Toplam'
/** UTF-8 byte order mark: Excel reads the file as UTF-8 only with it. */
const BOM = String.fromCharCode(0xfeff)

type Line = Pick<MinistryTableRow, 'country' | 'arrivals' | 'nights'>

const csvCell = (v: string | number): string => {
  const s = String(v)
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * Semicolon-separated with a UTF-8 byte order mark: Excel set to Turkish opens it in columns with "ğ, ı, ş" intact
 * (a comma file lands in one column there); Numbers and LibreOffice detect the separator.
 */
export function ministryCsv(table: readonly Line[], totals: { arrivals: number; nights: number }): string {
  const lines = [
    MINISTRY_COLUMNS.join(';'),
    ...table.map((r) => [r.country, r.arrivals, r.nights].map(csvCell).join(';')),
    [TOTAL_LABEL, totals.arrivals, totals.nights].map(csvCell).join(';')
  ]
  return `${BOM}${lines.join('\r\n')}\r\n`
}

/** One sheet named after the month: header, a row per country, the total. */
export async function ministryXlsx(
  table: readonly Line[],
  totals: { arrivals: number; nights: number },
  period: string
): Promise<Uint8Array> {
  const { default: Excel } = await import('exceljs')
  const wb = new Excel.Workbook()
  const ws = wb.addWorksheet(period)
  ws.columns = [{ width: 36 }, { width: 14 }, { width: 16 }]
  ws.addRow([...MINISTRY_COLUMNS]).font = { bold: true }
  for (const r of table) ws.addRow([r.country, r.arrivals, r.nights])
  ws.addRow([TOTAL_LABEL, totals.arrivals, totals.nights]).font = { bold: true }
  return new Uint8Array(await wb.xlsx.writeBuffer())
}
