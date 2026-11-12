// CSV and XLSX files of exported tables (faz-14 madde 3; G-122, S-43). Titles in the asking person's language;
// days and amounts written so a spreadsheet in that language reads them: XLSX keeps real dates and numbers with a
// display format ("₺2.500,00" in a Turkish Excel/LibreOffice/Numbers, the currency per row), CSV writes the same text
// the screens show (format.ts) with a UTF-8 mark (Turkish letters survive Excel) and ";" where the decimal mark is a
// comma (tr, ru). A text cell starting with = + - @ gets a leading apostrophe in CSV (no formula runs on opening).
import type ExcelJS from 'exceljs'
import { formatMoney, LOCALE_TAG, type AppLocale } from '@shared/format'
import { minorDigits, money, toDecimalString } from '@shared/money'
import type { LocalDate } from '@shared/date'
import type { Translate } from './labels'

/** `qty`: thousandths of a unit (7 500 = 7,5); `rate`: millionths (an exchange rate, 49 250 000 = 49,25). */
export type ColumnType = 'text' | 'date' | 'datetime' | 'money' | 'int' | 'bool' | 'qty' | 'rate' | 'enum'

export interface Column {
  key: string
  /** i18n key of the title. */
  label: string
  type: ColumnType
  /** money: the row field holding the currency (default `currency`). */
  currencyKey?: string
  /** enum: i18n prefix of the values (`dataTransfer.value.reservationStatus`). */
  enumPrefix?: string
  /** Identity numbers and descriptive notes: only for roles with `guests.identity`. */
  sensitive?: boolean
}

export type Row = Record<string, unknown>

export interface Table {
  /** Sheet / file title (already translated). */
  title: string
  columns: readonly Column[]
  rows: readonly Row[]
}

export interface WriteOptions {
  locale: AppLocale
  t: Translate
  /** IANA zone of the hotel: ISO times are shown in the hotel's local time. */
  timeZone: string
}

const pad = (n: number): string => String(n).padStart(2, '0')

/** ISO instant → hotel-local parts. */
function localParts(
  iso: string,
  timeZone: string
): { y: number; m: number; d: number; h: number; min: number } | null {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date)
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? 0)
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour'), min: get('minute') }
}

const dayParts = (value: string): { y: number; m: number; d: number } | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  return m ? { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) } : null
}

function dateText(p: { y: number; m: number; d: number }, locale: AppLocale): string {
  return locale === 'en' ? `${pad(p.d)}/${pad(p.m)}/${p.y}` : `${pad(p.d)}.${pad(p.m)}.${p.y}`
}

const enumText = (col: Column, value: unknown, t: Translate): string =>
  col.enumPrefix ? t(`${col.enumPrefix}.${String(value)}`) : String(value)

/** The text a cell shows (CSV, and the fallback of XLSX for text columns). */
export function cellText(col: Column, row: Row, opts: WriteOptions): string {
  const value = row[col.key]
  if (value === null || value === undefined || value === '') return ''
  switch (col.type) {
    case 'date': {
      const p = dayParts(String(value))
      return p ? dateText(p, opts.locale) : String(value)
    }
    case 'datetime': {
      const p = localParts(String(value), opts.timeZone)
      return p ? `${dateText(p, opts.locale)} ${pad(p.h)}:${pad(p.min)}` : String(value)
    }
    case 'money': {
      const currency = String(row[col.currencyKey ?? 'currency'] ?? '')
      if (!/^[A-Z]{3}$/.test(currency)) return String(value)
      return formatMoney(money(Number(value), currency), opts.locale, { showMinor: true })
    }
    case 'qty':
      return new Intl.NumberFormat(LOCALE_TAG[opts.locale], {
        maximumFractionDigits: 3,
        numberingSystem: 'latn'
      }).format(Number(value) / 1000)
    case 'rate':
      return new Intl.NumberFormat(LOCALE_TAG[opts.locale], {
        maximumFractionDigits: 6,
        numberingSystem: 'latn'
      }).format(Number(value) / 1_000_000)
    case 'int':
      return String(value)
    case 'bool':
      return value ? opts.t('dataTransfer.value.yes') : opts.t('dataTransfer.value.no')
    case 'enum':
      return enumText(col, value, opts.t)
    case 'text':
      return String(value)
  }
}

const csvDelimiter = (locale: AppLocale): string => (locale === 'en' ? ',' : ';')

function csvEscape(text: string, delimiter: string, isText: boolean): string {
  let v = text
  if (isText && /^[=+\-@\t\r]/.test(v)) v = `'${v}`
  return v.includes(delimiter) || /["\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

/** One table as CSV text (UTF-8 with BOM, CRLF line ends: what Excel expects). */
export function toCsv(table: Table, opts: WriteOptions): string {
  const d = csvDelimiter(opts.locale)
  const lines = [table.columns.map((c) => csvEscape(opts.t(c.label), d, true)).join(d)]
  for (const row of table.rows)
    lines.push(
      table.columns
        .map((c) => csvEscape(cellText(c, row, opts), d, c.type === 'text' || c.type === 'enum'))
        .join(d)
    )
  return `\ufeff${lines.join('\r\n')}\r\n`
}

/** Display format of an amount in `currency` for a spreadsheet (symbol where Intl puts it for the locale). */
export function moneyFormat(currency: string, locale: AppLocale): string {
  const digits = minorDigits(currency)
  const number = digits > 0 ? `#,##0.${'0'.repeat(digits)}` : '#,##0'
  const parts = new Intl.NumberFormat(LOCALE_TAG[locale], {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    numberingSystem: 'latn'
  }).formatToParts(1)
  const symbol = (parts.find((p) => p.type === 'currency')?.value ?? currency).replace(/"/g, '')
  const symbolFirst =
    parts.findIndex((p) => p.type === 'currency') < parts.findIndex((p) => p.type === 'integer')
  return symbolFirst ? `"${symbol}"${number}` : `${number} "${symbol}"`
}

const DATE_FMT: Record<AppLocale, string> = { tr: 'dd.mm.yyyy', en: 'dd/mm/yyyy', ru: 'dd.mm.yyyy' }

/** Sheet names: at most 31 characters, none of : \ / ? * [ ]; unique in the workbook. */
function sheetName(title: string, taken: Set<string>): string {
  const base =
    title
      .replace(/[:\\/?*[\]]/g, ' ')
      .slice(0, 31)
      .trim() || 'Sheet'
  let name = base
  for (let n = 2; taken.has(name.toLocaleLowerCase('tr')); n++) name = `${base.slice(0, 27)} (${n})`
  taken.add(name.toLocaleLowerCase('tr'))
  return name
}

/** Tables as the sheets of one workbook. */
export async function toXlsx(tables: readonly Table[], opts: WriteOptions): Promise<Buffer> {
  const { default: Excel } = await import('exceljs')
  const wb = new Excel.Workbook()
  wb.creator = 'Bismuth'
  wb.created = new Date()
  const taken = new Set<string>()
  for (const table of tables) {
    const ws: ExcelJS.Worksheet = wb.addWorksheet(sheetName(table.title, taken), {
      views: [{ state: 'frozen', ySplit: 1 }]
    })
    ws.columns = table.columns.map((c) => ({
      header: opts.t(c.label),
      key: c.key,
      width: c.type === 'text' ? 28 : c.type === 'datetime' ? 18 : 14
    }))
    ws.getRow(1).font = { bold: true }
    for (const row of table.rows) {
      const added = ws.addRow({})
      table.columns.forEach((c, i) => {
        const cell = added.getCell(i + 1)
        const value = row[c.key]
        if (value === null || value === undefined || value === '') return
        if (c.type === 'date') {
          const p = dayParts(String(value as LocalDate))
          if (p) {
            cell.value = new Date(Date.UTC(p.y, p.m - 1, p.d))
            cell.numFmt = DATE_FMT[opts.locale]
          } else cell.value = String(value)
        } else if (c.type === 'datetime') {
          const p = localParts(String(value), opts.timeZone)
          if (p) {
            cell.value = new Date(Date.UTC(p.y, p.m - 1, p.d, p.h, p.min))
            cell.numFmt = `${DATE_FMT[opts.locale]} hh:mm`
          } else cell.value = String(value)
        } else if (c.type === 'money') {
          const currency = String(row[c.currencyKey ?? 'currency'] ?? '')
          if (/^[A-Z]{3}$/.test(currency)) {
            cell.value = Number(toDecimalString(money(Number(value), currency)))
            cell.numFmt = moneyFormat(currency, opts.locale)
          } else cell.value = Number(value)
        } else if (c.type === 'int') cell.value = Number(value)
        else if (c.type === 'qty') {
          // A whole quantity gets no decimal sign ("160", not "160,"); a fraction keeps up to three digits ("7,5").
          cell.value = Number(value) / 1000
          cell.numFmt = Number(value) % 1000 === 0 ? '#,##0' : '#,##0.###'
        } else if (c.type === 'rate') {
          // An exchange rate keeps its digits (49,25 / 0,0203): up to six decimals, at least two.
          cell.value = Number(value) / 1_000_000
          cell.numFmt = '#,##0.00####'
        } else cell.value = cellText(c, row, opts)
      })
    }
    if (table.rows.length > 0)
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: table.columns.length } }
  }
  return Buffer.from(await wb.xlsx.writeBuffer())
}
