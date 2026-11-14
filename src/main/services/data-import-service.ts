// Import wizard (faz-14 madde 4; G-123, K-30, S-08): the owner's 2026 spreadsheets come into the program. Two
// templates, the two files of 02-excel-analizi.md:
//  - "Rezervasyon (oda × gün)": a row per room, a column per day; a cell is "NAME (price currency)", two guests in a
//    day are "A (…) sonra B (…)"; in an .xlsx file the cell colour says the payment (red paid, yellow unpaid, cyan
//    same-day stay). Consecutive days of the same name in a room become one stay; a red night gets its payment.
//  - "Defter (günlük satırlar)": the day band (a date) then income columns (x, amount, currency, name, method, room,
//    channel) and expense columns (x, amount, currency, description) on the same rows.
//  - "Maaşlar" (P14fix #10, G-123): a row per employee and month — employee, month, monthly salary, amount paid,
//    method (optional payment date and currency); written through the staff service (salary history, salary
//    payment with its expense row).
// The same analysis feeds the preview (records, error list, possible duplicate guests) and the import, which writes
// through the reservation, payment, expense and staff services (their rules, permissions, audit rows and the
// closed-day guard apply); a row that fails is reported and the others go in.
// Import twice (P14fix #2): each record has a fingerprint (template + its content + its place among equal records of
// the file); a record whose fingerprint an earlier import still in force wrote is skipped ("zaten alınmış"). Every
// import is a batch that can be cancelled ("Bu aktarımı iptal et"): what it wrote is voided through the services,
// with the reason, in one transaction; its records may then be imported again.
import { createHash } from 'node:crypto'
import { and, asc, desc, eq, gte, inArray, isNull, lte, notInArray } from 'drizzle-orm'
import {
  importInputSchema,
  importSampleInputSchema,
  importVoidInputSchema,
  LEDGER_FIELDS,
  SALARY_FIELDS,
  type ExportFile,
  type GridField,
  type ImportBatch,
  type ImportError,
  type ImportErrorCode,
  type ImportField,
  type ImportInput,
  type ImportPreview,
  type ImportRecord,
  type ImportReport,
  type ImportTemplate,
  type LedgerField,
  type SalaryField
} from '@shared/contract/backup'
import { addDays, localDate, type LocalDate } from '@shared/date'
import { localDateIn } from '@shared/domain/weather'
import { IMPORT_AUDIT_REASON } from '@shared/audit'
import type { AppLocale } from '@shared/format'
import {
  colorMeaning,
  isBlankChoice,
  isMarked,
  looksLikeSamePerson,
  parseAmountMinor,
  parseCurrency,
  parseDayCell,
  parseReservationCell,
  splitName,
  titleCaseName,
  type CellGuest
} from '@shared/domain/import-cells'
import { normalizeName } from '@shared/domain/normalize'
import {
  businessDays,
  cashHandovers,
  charges,
  employees,
  employeeSalaries,
  expenses,
  expenseSections,
  folios,
  guests,
  importBatches,
  importRows,
  paymentMethods,
  payments,
  reservationRooms,
  reservations,
  rooms,
  salesChannels,
  staffTransactions,
  users
} from '../db/schema'
import type { Ctx } from './context'
import { chargeBaseMinor } from './currency-service'
import { AppError } from './errors'
import { assertDayWritable, drawerAllowedIn, type createExpensesService } from './expenses-service'
import {
  conflict,
  inChunks,
  inTransaction,
  newId,
  notFound,
  parseInput,
  requirePermission,
  stamps,
  type ServiceDeps
} from './kit'
import type { createPaymentsService } from './payments-service'
import type { createReservationsService } from './reservations-service'
import { readSetting } from './settings-service'
import type { createStaffService } from './staff-service'
import { translator } from './data-transfer/labels'
import { columnLetter, readTable, TableReadError, type SheetTable } from './data-transfer/table-reader'
import { toCsv } from './data-transfer/writers'

export interface DataImportDeps extends ServiceDeps {
  reservations: ReturnType<typeof createReservationsService>
  payments: ReturnType<typeof createPaymentsService>
  expenses: ReturnType<typeof createExpensesService>
  /** The salary sheet (P14fix #10); without it that template is refused. */
  staff?: ReturnType<typeof createStaffService>
  /** The program window's "Save as" dialog for the template file (as the export's); absent: bytes to the window. */
  saveFile?: (fileName: string, bytes: Buffer) => Promise<string | null>
}

type Input = ReturnType<typeof parse>
const parse = (input: ImportInput) => parseInput(importInputSchema, input)

/** Shown in the preview (the import itself takes them all). */
const PREVIEW_RECORDS = 200
const LIST_ERRORS = 500
/** Every write of an import carries this reason code (audit row, closed-day guard, G-72); the screen names it. */
const IMPORT_REASON = IMPORT_AUDIT_REASON

interface Night {
  date: LocalDate
  guest: CellGuest
  key: string
  paid: boolean
  row: number
  col: number
}

/** What makes a record "the same record" again (P14fix #2); `fp` is set once the file is analysed. */
interface Fingerprinted {
  content: string
  fp: string
}

interface StayPlan extends Fingerprinted {
  roomId: string
  room: string
  name: string
  checkIn: LocalDate
  /** = checkIn for a same-day stay. */
  checkOut: LocalDate
  prices: { date: LocalDate; priceMinor: number }[]
  currency: string
  paidMinor: number
  firstPaid: LocalDate | null
  note: string | null
  row: number
  col: number
}

interface LedgerLine extends Fingerprinted {
  kind: 'income' | 'expense'
  date: LocalDate
  amountMinor: number
  currency: string
  marked: boolean
  name: string
  room: string | null
  methodId: string | null
  channelId: string | null
  row: number
}

interface SalaryPlan extends Fingerprinted {
  employeeId: string
  name: string
  year: number
  month: number
  /** Monthly salary from that month on; null = not in the file. */
  salaryMinor: number | null
  paidMinor: number | null
  methodId: string | null
  /** Payment day written in the file (else the month's last day, not after today). */
  date: LocalDate | null
  currency: string | null
  row: number
}

interface Analysis {
  table: SheetTable
  headerRow: number
  columns: string[]
  mapping: Partial<Record<ImportField, number | null>>
  needsMonth: boolean
  errors: ImportError[]
  stays: StayPlan[]
  lines: LedgerLine[]
  salaries: SalaryPlan[]
  names: string[]
  blockedCells: number
}

const MONTHS: Record<string, number> = {
  ocak: 1,
  subat: 2,
  mart: 3,
  nisan: 4,
  mayis: 5,
  haziran: 6,
  temmuz: 7,
  agustos: 8,
  eylul: 9,
  ekim: 10,
  kasim: 11,
  aralik: 12,
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12
}

/** "Lale Rezervasyon 2026 - Ekim.csv" → '2026-10'. */
export function monthFromName(text: string): string | null {
  const words = normalizeName(text).split(' ')
  const year = words.find((w) => /^20\d\d$/.test(w))
  const month = words.map((w) => MONTHS[w]).find((m) => m !== undefined)
  return year && month ? `${year}-${String(month).padStart(2, '0')}` : null
}

/** A salary sheet's month: "2026-10", "10.2026", a day of it, or "Ekim 2026" → 'YYYY-MM'. */
export function parseMonthCell(raw: string): string | null {
  const text = raw.trim()
  if (!text) return null
  const valid = (y: number, m: number): string | null =>
    y >= 2000 && y <= 2100 && m >= 1 && m <= 12 ? `${y}-${String(m).padStart(2, '0')}` : null
  let m = /^(\d{4})[-./](\d{1,2})$/.exec(text)
  if (m) return valid(Number(m[1]), Number(m[2]))
  m = /^(\d{1,2})[-./](\d{4})$/.exec(text)
  if (m) return valid(Number(m[2]), Number(m[1]))
  const day = parseDayCell(text)
  if (day) return day.slice(0, 7)
  return monthFromName(text)
}

const sha256 = (text: string | Buffer): string => createHash('sha256').update(text).digest('hex')

/** Last day of a 'YYYY-MM' month. */
const lastDayOf = (year: number, month: number): LocalDate =>
  addDays(localDate(`${month === 12 ? year + 1 : year}-${String((month % 12) + 1).padStart(2, '0')}-01`), -1)

/** Titles a template's file may use for a field: its sample file's titles in every language, normalised. */
function sampleTitles(template: ImportTemplate, fields: readonly string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const locale of ['tr', 'en', 'ru'] as const) {
    const t = translator(locale)
    for (const field of fields) {
      const key = `dataTransfer.import.sample.${template}.${field}`
      const title = t(key)
      if (title === key) continue
      const list = (out[normalizeName(title)] ??= [])
      if (!list.includes(field)) list.push(field)
    }
  }
  return out
}

/** A table of rows with their fill colours, cut to rectangle-ish shape (no trailing empty rows). */
const cell = (t: SheetTable, r: number, c: number): string => (t.rows[r]?.[c] ?? '').trim()
const colorAt = (t: SheetTable, r: number, c: number): string | null => t.colors[r]?.[c] ?? null

/** Name of a list row in every language plus its code, normalised (matching "İban", "Kredi Kartı", "Booking"). */
function listMatcher(
  items: { id: string; code: string; name: string; nameI18n: Record<string, string | undefined> | null }[]
): (raw: string) => string | null {
  const keyed = items.map((i) => ({
    id: i.id,
    names: [i.code, i.name, ...Object.values(i.nameI18n ?? {})]
      .filter((n): n is string => Boolean(n))
      .map(normalizeName)
  }))
  return (raw) => {
    const key = normalizeName(raw)
    if (!key) return null
    const exact = keyed.find((k) => k.names.includes(key))
    if (exact) return exact.id
    const tokens = key.split(' ')
    const partial = keyed.filter((k) => k.names.some((n) => tokens.every((tk) => n.split(' ').includes(tk))))
    return partial.length === 1 ? partial[0]!.id : null
  }
}

/** Rolls back a run in which every record failed (its batch row would be empty). */
class NothingWritten extends Error {}

export function createDataImportService(deps: DataImportDeps) {
  const { db } = deps
  /** Text an import writes into a record's own note or title (payment, sale, handover): in the hotel's language. */
  const importText = () => translator(readSetting(db, 'ui.language'))('audit.importReason')

  function authorize(ctx: Ctx, input: Input): void {
    requirePermission(ctx, 'settings.backup', 'edit')
    if (input.template === 'reservationGrid') {
      requirePermission(ctx, 'calendar', 'edit')
      if (input.paidMethodId) requirePermission(ctx, 'payments', 'edit')
    } else if (input.template === 'salaryRows') {
      requirePermission(ctx, 'staff.salary', 'edit')
    } else {
      requirePermission(ctx, 'payments', 'edit')
      requirePermission(ctx, 'expenses', 'edit')
    }
  }

  async function load(input: Input): Promise<SheetTable> {
    try {
      return await readTable(input.fileName, Buffer.from(input.contentBase64, 'base64'), input.sheet)
    } catch (error) {
      if (error instanceof TableReadError) throw new AppError('VALIDATION', 'errors.importFile')
      throw error
    }
  }

  const titlesOf = (t: SheetTable, headerRow: number): string[] => {
    const width = Math.max(0, ...t.rows.map((r) => r.length))
    return Array.from({ length: width }, (_, c) => cell(t, headerRow - 1, c) || columnLetter(c))
  }

  const err = (
    list: ImportError[],
    row: number,
    column: string | null,
    code: ImportErrorCode,
    value: string
  ): void => {
    list.push({ row, column, code, value: value.slice(0, code === 'badDate' ? 40 : 120) })
  }

  // ------------------------------------------------------------------------------------------- reservation grid
  function analyzeGrid(t: SheetTable, input: Input): Analysis {
    const month = input.month ?? monthFromName(input.fileName) ?? null
    const errors: ImportError[] = []
    // Header: the first row with three or more day titles (bare day numbers count when a month is known).
    const dayish = (r: number): number =>
      (t.rows[r] ?? []).filter((v) => parseDayCell(v, month ?? '2000-01') !== null).length
    let headerRow = input.headerRow ?? 0
    if (!headerRow) {
      for (let r = 0; r < Math.min(t.rows.length, 30) && !headerRow; r++)
        if (dayish(r) >= 3) headerRow = r + 1
      headerRow ||= 1
    }
    const columns = titlesOf(t, headerRow)
    const h = headerRow - 1
    const guessRoom = columns.findIndex((title) =>
      ['oda no', 'oda', 'room', 'no'].includes(normalizeName(title))
    )
    const roomCol = input.mapping.room ?? (guessRoom >= 0 ? guessRoom : 0)
    const firstGuess = columns.findIndex(
      (_, c) => c !== roomCol && parseDayCell(cell(t, h, c), month ?? '2000-01') !== null
    )
    const firstDay = input.mapping.firstDay ?? (firstGuess >= 0 ? firstGuess : roomCol + 1)
    const mapping: Partial<Record<GridField, number | null>> = { room: roomCol, firstDay }
    const needsBareMonth = columns
      .slice(firstDay)
      .some((title) => parseDayCell(title) === null && parseDayCell(title, '2000-01') !== null)
    const needsMonth = needsBareMonth && !month
    const base = readSetting(db, 'hotel.baseCurrency')
    const defaultCurrency = input.currency ?? base
    const result: Analysis = {
      table: t,
      headerRow,
      columns,
      mapping,
      needsMonth,
      errors,
      stays: [],
      lines: [],
      salaries: [],
      names: [],
      blockedCells: 0
    }
    if (needsMonth) return result

    const dates = new Map<number, LocalDate>()
    for (let c = firstDay; c < columns.length; c++) {
      const title = cell(t, h, c)
      if (!title) continue
      const d = parseDayCell(title, month)
      if (d) dates.set(c, d)
      else err(errors, headerRow, columns[c] ?? columnLetter(c), 'badDate', title)
    }
    const roomRows = db.select({ id: rooms.id, number: rooms.number }).from(rooms).all()
    const roomOf = (raw: string) => {
      const token = raw.trim().split(/\s+/)[0] ?? ''
      return roomRows.find((r) => r.number === raw.trim()) ?? roomRows.find((r) => r.number === token) ?? null
    }
    for (let r = h + 1; r < t.rows.length; r++) {
      const roomText = cell(t, r, roomCol)
      const filled = [...dates.keys()].filter((c) => cell(t, r, c) !== '')
      if (!roomText) continue
      const room = roomOf(roomText)
      if (!room) {
        if (filled.length) err(errors, r + 1, columns[roomCol] ?? null, 'unknownRoom', roomText)
        continue
      }
      // Nights of this room by day, then the same-day stays.
      const nights = new Map<LocalDate, Night>()
      const dayUses: Night[] = []
      for (const c of [...dates.keys()].sort((a, b) => a - b)) {
        const date = dates.get(c)!
        const parsed = parseReservationCell(cell(t, r, c), defaultCurrency)
        const meaning = colorMeaning(colorAt(t, r, c))
        if (parsed.kind === 'empty') continue
        if (parsed.kind === 'blocked' || (meaning === 'blocked' && parsed.kind !== 'guests')) {
          result.blockedCells++
          continue
        }
        if (parsed.kind === 'invalid') {
          err(errors, r + 1, columns[c] ?? null, parsed.reason, cell(t, r, c))
          continue
        }
        const list = parsed.guests
        const paid = meaning === 'paid'
        const make = (g: CellGuest): Night => ({
          date,
          guest: g,
          key: normalizeName(g.name),
          paid,
          row: r + 1,
          col: c
        })
        if (list.length === 1 && meaning === 'dayuse') {
          dayUses.push(make(list[0]!))
          continue
        }
        const previous = nights.get(addDays(date, -1))
        list.slice(0, -1).forEach((g) => {
          // "A sonra B": A leaving that morning (A had the night before) or a same-day stay.
          if (previous?.key !== normalizeName(g.name)) dayUses.push(make(g))
        })
        nights.set(date, make(list[list.length - 1]!))
      }
      // Consecutive nights of the same name → one stay.
      const ordered = [...nights.values()].sort((a, b) => (a.date < b.date ? -1 : 1))
      const groups: Night[][] = []
      for (const n of ordered) {
        const last = groups[groups.length - 1]
        const prev = last?.[last.length - 1]
        if (prev && prev.key === n.key && addDays(prev.date, 1) === n.date) last!.push(n)
        else groups.push([n])
      }
      const plan = (group: Night[], dayUse: boolean): void => {
        const first = group[0]!
        const explicit = group.map((n) => n.guest.currency).filter((x): x is string => x !== null)
        const currency = explicit[0] ?? defaultCurrency
        if (explicit.some((x) => x !== currency)) {
          err(errors, first.row, columns[first.col] ?? null, 'mixedCurrency', first.guest.name)
          return
        }
        const known = group.find((n) => n.guest.priceMinor !== null)
        if (!known) {
          err(errors, first.row, columns[first.col] ?? null, 'noPrice', cell(t, first.row - 1, first.col))
          return
        }
        let price = known.guest.priceMinor!
        const prices = group.map((n) => {
          if (n.guest.priceMinor !== null) price = n.guest.priceMinor
          return { date: n.date, priceMinor: price }
        })
        const paidNights = prices.filter((_, i) => group[i]!.paid)
        result.stays.push({
          content: [
            room.number,
            first.date,
            dayUse ? first.date : addDays(group[group.length - 1]!.date, 1),
            normalizeName(first.guest.name),
            prices.map((p) => `${p.date}:${p.priceMinor}`).join(','),
            currency
          ].join('|'),
          fp: '',
          roomId: room.id,
          room: room.number,
          name: first.guest.name,
          checkIn: first.date,
          checkOut: dayUse ? first.date : addDays(group[group.length - 1]!.date, 1),
          prices,
          currency,
          paidMinor: paidNights.reduce((s, p) => s + p.priceMinor, 0),
          firstPaid: paidNights[0]?.date ?? null,
          note: [...new Set(group.map((n) => n.guest.note).filter(Boolean))].join(' · ') || null,
          row: first.row,
          col: first.col
        })
      }
      for (const g of groups) plan(g, false)
      for (const d of dayUses) plan([d], true)
    }
    result.stays.sort((a, b) => (a.checkIn < b.checkIn ? -1 : a.checkIn > b.checkIn ? 1 : a.row - b.row))
    result.names = result.stays.map((s) => s.name)
    return result
  }

  // ------------------------------------------------------------------------------------------------- ledger rows
  const LEDGER_TITLES: Record<string, LedgerField[]> = {
    tarih: ['date'],
    date: ['date'],
    gun: ['date'],
    kasa: ['incomeCollected', 'expenseCollected'],
    x: ['incomeCollected', 'expenseCollected'],
    ucret: ['incomeAmount'],
    tutar: ['incomeAmount'],
    gelir: ['incomeAmount'],
    birim: ['incomeCurrency', 'expenseCurrency'],
    'para birimi': ['incomeCurrency', 'expenseCurrency'],
    doviz: ['incomeCurrency', 'expenseCurrency'],
    isim: ['incomeName'],
    'ad soyad': ['incomeName'],
    misafir: ['incomeName'],
    'odeme yontemi': ['incomeMethod'],
    yontem: ['incomeMethod'],
    oda: ['incomeRoom'],
    platform: ['incomeChannel'],
    kanal: ['incomeChannel'],
    'satis kanali': ['incomeChannel'],
    gider: ['expenseAmount'],
    'gider tutari': ['expenseAmount'],
    'gider aciklamasi': ['expenseDescription'],
    aciklama: ['expenseDescription']
  }

  const ledgerSampleTitles = sampleTitles('ledgerRows', LEDGER_FIELDS) as Record<string, LedgerField[]>

  function guessLedgerMapping(columns: string[]): Partial<Record<LedgerField, number>> {
    const found: Partial<Record<LedgerField, number>> = {}
    columns.forEach((title, c) => {
      const key = normalizeName(title)
      const options = LEDGER_TITLES[key] ?? ledgerSampleTitles[key]
      const free = options?.find((f) => found[f] === undefined)
      if (free) found[free] = c
    })
    // A "Kasa"/"Birim" after the expense amount's column belongs to the expenses even when listed first.
    const expenseStart = found.expenseAmount
    if (expenseStart !== undefined) {
      for (const [income, expense] of [
        ['incomeCollected', 'expenseCollected'],
        ['incomeCurrency', 'expenseCurrency']
      ] as const) {
        if (found[income] !== undefined && found[income]! > expenseStart && found[expense] === undefined) {
          found[expense] = found[income]
          delete found[income]
        }
      }
    }
    return found
  }

  function analyzeLedger(t: SheetTable, input: Input): Analysis {
    const month = input.month ?? monthFromName(input.fileName) ?? null
    const errors: ImportError[] = []
    let headerRow = input.headerRow ?? 0
    if (!headerRow) {
      for (let r = 0; r < Math.min(t.rows.length, 40) && !headerRow; r++)
        if (Object.keys(guessLedgerMapping((t.rows[r] ?? []).map((v) => v.trim()))).length >= 3)
          headerRow = r + 1
      headerRow ||= 1
    }
    const columns = titlesOf(t, headerRow)
    const guessed = guessLedgerMapping(columns.map((c, i) => (cell(t, headerRow - 1, i) ? c : '')))
    const mapping: Partial<Record<LedgerField, number | null>> = { ...guessed }
    for (const [k, v] of Object.entries(input.mapping))
      if ((LEDGER_FIELDS as readonly string[]).includes(k)) mapping[k as LedgerField] = v
    const col = (f: LedgerField): number | null => mapping[f] ?? null
    const at = (r: number, f: LedgerField): string => {
      const c = col(f)
      return c === null ? '' : cell(t, r, c)
    }
    const title = (f: LedgerField): string | null => {
      const c = col(f)
      return c === null ? null : (columns[c] ?? columnLetter(c))
    }
    const base = readSetting(db, 'hotel.baseCurrency')
    const defaultCurrency = input.currency ?? base
    const method = listMatcher(db.select().from(paymentMethods).all())
    const channel = listMatcher(db.select().from(salesChannels).all())
    const lines: LedgerLine[] = []
    let current: LocalDate | null = null
    const sidesFilled = (r: number): boolean => at(r, 'incomeAmount') !== '' || at(r, 'expenseAmount') !== ''
    for (let r = headerRow; r < t.rows.length; r++) {
      const dateText = col('date') !== null ? at(r, 'date') : cell(t, r, 0)
      const d = parseDayCell(dateText, month)
      if (d) current = d
      else if (dateText.trim() !== '') {
        // A filled but unreadable date never lets the row (or the empty-dated rows after it) fall on the previous day.
        current = null
        if (sidesFilled(r)) err(errors, r + 1, title('date'), 'badDate', dateText)
        continue
      }
      const sides = [
        {
          kind: 'income' as const,
          amount: 'incomeAmount',
          currency: 'incomeCurrency',
          mark: 'incomeCollected'
        },
        {
          kind: 'expense' as const,
          amount: 'expenseAmount',
          currency: 'expenseCurrency',
          mark: 'expenseCollected'
        }
      ] as const
      for (const side of sides) {
        const amountText = at(r, side.amount)
        if (!amountText) continue
        const currencyText = at(r, side.currency)
        const currency = currencyText ? parseCurrency(currencyText) : defaultCurrency
        // The amount in its own currency's decimals (yen none, dinar three); an unknown currency is reported below.
        const amount = parseAmountMinor(amountText, currency ?? defaultCurrency)
        if (amount === null || amount === 0) {
          err(errors, r + 1, title(side.amount), 'badAmount', amountText)
          continue
        }
        if (!current) {
          err(errors, r + 1, title('date'), 'badDate', dateText)
          continue
        }
        if (!currency) {
          err(errors, r + 1, title(side.currency), 'unknownCurrency', currencyText)
          continue
        }
        const marked = isMarked(at(r, side.mark))
        if (side.kind === 'expense') {
          const description = at(r, 'expenseDescription')
          if (!description) {
            err(errors, r + 1, title('expenseDescription'), 'emptyName', '')
            continue
          }
          lines.push({
            content: '',
            fp: '',
            kind: 'expense',
            date: current,
            amountMinor: amount,
            currency,
            marked,
            name: description,
            room: null,
            methodId: null,
            channelId: null,
            row: r + 1
          })
          continue
        }
        const methodText = at(r, 'incomeMethod')
        const methodId = methodText ? method(methodText) : (input.defaultMethodId ?? null)
        if (!methodId) {
          err(errors, r + 1, title('incomeMethod'), 'unknownMethod', methodText)
          continue
        }
        const channelText = at(r, 'incomeChannel')
        const channelId = !channelText || isBlankChoice(channelText) ? null : channel(channelText)
        if (channelText && !isBlankChoice(channelText) && !channelId) {
          err(errors, r + 1, title('incomeChannel'), 'unknownChannel', channelText)
          continue
        }
        lines.push({
          content: '',
          fp: '',
          kind: 'income',
          date: current,
          amountMinor: amount,
          currency,
          marked,
          name: at(r, 'incomeName'),
          room: at(r, 'incomeRoom') || null,
          methodId,
          channelId,
          row: r + 1
        })
      }
    }
    return {
      table: t,
      headerRow,
      columns,
      mapping,
      needsMonth: false,
      errors,
      stays: [],
      lines: lines.map((l) => ({
        ...l,
        content: [
          l.kind,
          l.date,
          l.amountMinor,
          l.currency,
          l.marked ? 'x' : '',
          normalizeName(l.name),
          l.room ?? ''
        ].join('|')
      })),
      salaries: [],
      names: lines
        .filter((l) => l.kind === 'income' && l.name)
        .map((l) => l.name.replace(/\(.*\)/, '').trim()),
      blockedCells: 0
    }
  }

  // ------------------------------------------------------------------------------------------------ salary rows
  const SALARY_TITLES: Record<string, SalaryField[]> = {
    ...(sampleTitles('salaryRows', SALARY_FIELDS) as Record<string, SalaryField[]>),
    personel: ['employee'],
    calisan: ['employee'],
    'ad soyad': ['employee'],
    isim: ['employee'],
    ay: ['month'],
    donem: ['month'],
    maas: ['salary'],
    'net maas': ['salary'],
    'aylik maas': ['salary'],
    odenen: ['paid'],
    'net odenecek': ['paid'],
    'odenen tutar': ['paid'],
    'odeme yontemi': ['method'],
    yontem: ['method'],
    tarih: ['date'],
    'odeme tarihi': ['date'],
    birim: ['currency'],
    'para birimi': ['currency'],
    doviz: ['currency']
  }

  function guessSalaryMapping(columns: string[]): Partial<Record<SalaryField, number>> {
    const found: Partial<Record<SalaryField, number>> = {}
    columns.forEach((title, c) => {
      const free = SALARY_TITLES[normalizeName(title)]?.find((f) => found[f] === undefined)
      if (free) found[free] = c
    })
    return found
  }

  function analyzeSalary(t: SheetTable, input: Input): Analysis {
    const errors: ImportError[] = []
    let headerRow = input.headerRow ?? 0
    if (!headerRow) {
      for (let r = 0; r < Math.min(t.rows.length, 40) && !headerRow; r++)
        if (Object.keys(guessSalaryMapping((t.rows[r] ?? []).map((v) => v.trim()))).length >= 3)
          headerRow = r + 1
      headerRow ||= 1
    }
    const columns = titlesOf(t, headerRow)
    const mapping: Partial<Record<SalaryField, number | null>> = {
      ...guessSalaryMapping(columns.map((c, i) => (cell(t, headerRow - 1, i) ? c : '')))
    }
    for (const [k, v] of Object.entries(input.mapping))
      if ((SALARY_FIELDS as readonly string[]).includes(k)) mapping[k as SalaryField] = v
    const at = (r: number, f: SalaryField): string => {
      const c = mapping[f] ?? null
      return c === null ? '' : cell(t, r, c)
    }
    const title = (f: SalaryField): string | null => {
      const c = mapping[f] ?? null
      return c === null ? null : (columns[c] ?? columnLetter(c))
    }
    const fallbackMonth = input.month ?? monthFromName(input.fileName)
    const people = db
      .select({ id: employees.id, first: employees.firstName, last: employees.lastName })
      .from(employees)
      .all()
      .map((e) => ({ id: e.id, full: normalizeName(`${e.first} ${e.last}`), first: normalizeName(e.first) }))
    const employeeOf = (raw: string): { id: string } | null => {
      const key = normalizeName(raw)
      const exact = people.filter((p) => p.full === key)
      if (exact.length === 1) return exact[0]!
      const byFirst = people.filter((p) => p.first === key)
      return byFirst.length === 1 ? byFirst[0]! : null
    }
    const method = listMatcher(db.select().from(paymentMethods).all())
    const salaries: SalaryPlan[] = []
    for (let r = headerRow; r < t.rows.length; r++) {
      const name = at(r, 'employee')
      const salaryText = at(r, 'salary')
      const paidText = at(r, 'paid')
      if (!name && !salaryText && !paidText) continue
      if (!name) {
        err(errors, r + 1, title('employee'), 'emptyName', '')
        continue
      }
      const monthText = at(r, 'month')
      const period = monthText ? parseMonthCell(monthText) : fallbackMonth
      if (!period) {
        err(errors, r + 1, title('month'), 'badMonth', monthText)
        continue
      }
      const currencyText = at(r, 'currency')
      const currency = currencyText ? parseCurrency(currencyText) : (input.currency ?? null)
      // Amounts in their currency's decimals; without one, the hotel's base currency (as the salary service).
      const amountCurrency = currency ?? input.currency ?? readSetting(db, 'hotel.baseCurrency')
      const salaryMinor = salaryText ? parseAmountMinor(salaryText, amountCurrency) : null
      if (salaryText && !salaryMinor) {
        err(errors, r + 1, title('salary'), 'badAmount', salaryText)
        continue
      }
      const paidMinor = paidText ? parseAmountMinor(paidText, amountCurrency) : null
      if (paidText && paidMinor === null) {
        err(errors, r + 1, title('paid'), 'badAmount', paidText)
        continue
      }
      if (!salaryMinor && !paidMinor) continue
      const employee = employeeOf(name)
      if (!employee) {
        err(errors, r + 1, title('employee'), 'unknownEmployee', name)
        continue
      }
      if (currencyText && !currency) {
        err(errors, r + 1, title('currency'), 'unknownCurrency', currencyText)
        continue
      }
      const methodText = at(r, 'method')
      const methodId = methodText ? method(methodText) : (input.defaultMethodId ?? null)
      if (methodText && !methodId) {
        err(errors, r + 1, title('method'), 'unknownMethod', methodText)
        continue
      }
      const dateText = at(r, 'date')
      const date = dateText ? parseDayCell(dateText, period) : null
      if (dateText && !date) {
        err(errors, r + 1, title('date'), 'badDate', dateText)
        continue
      }
      const [year, month] = period.split('-').map(Number) as [number, number]
      salaries.push({
        content: [employee.id, period, salaryMinor ?? '', paidMinor ?? '', date ?? '', currency ?? ''].join(
          '|'
        ),
        fp: '',
        employeeId: employee.id,
        name: titleCaseName(name),
        year,
        month,
        salaryMinor,
        paidMinor,
        methodId,
        date,
        currency,
        row: r + 1
      })
    }
    return {
      table: t,
      headerRow,
      columns,
      mapping,
      needsMonth: false,
      errors,
      stays: [],
      lines: [],
      salaries,
      names: [],
      blockedCells: 0
    }
  }

  /** Names written differently that may be the same person: within the file and against saved guests. */
  function duplicates(names: string[]): { name: string; similar: string[] }[] {
    const unique = [...new Map(names.filter(Boolean).map((n) => [normalizeName(n), n])).values()]
    const saved = db
      .select({ first: guests.firstName, last: guests.lastName })
      .from(guests)
      .where(isNull(guests.mergedIntoId))
      .all()
      .map((g) => `${g.first} ${g.last}`.trim())
    const out: { name: string; similar: string[] }[] = []
    for (const name of unique) {
      const similar = [...unique, ...saved].filter((other) => looksLikeSamePerson(name, other))
      if (similar.length) out.push({ name, similar: [...new Set(similar)].slice(0, 5) })
    }
    return out.slice(0, 100)
  }

  async function analyze(ctx: Ctx, raw: ImportInput): Promise<{ input: Input; a: Analysis }> {
    const input = parse(raw)
    authorize(ctx, input)
    const table = await load(input)
    const a =
      input.template === 'reservationGrid'
        ? analyzeGrid(table, input)
        : input.template === 'ledgerRows'
          ? analyzeLedger(table, input)
          : analyzeSalary(table, input)
    // The n-th equal record of the file has its own fingerprint: two real equal sales on a day both go in.
    const seen = new Map<string, number>()
    for (const item of [...a.stays, ...a.lines, ...a.salaries]) {
      const n = (seen.get(item.content) ?? 0) + 1
      seen.set(item.content, n)
      item.fp = sha256(`${input.template}|${item.content}|${n}`)
    }
    return { input, a }
  }

  /** Fingerprints an import still in force (not cancelled) wrote. */
  function alreadyImported(fps: readonly string[]): Set<string> {
    const out = new Set<string>()
    for (const chunk of inChunks([...new Set(fps)]))
      for (const r of db
        .select({ fp: importRows.fingerprint })
        .from(importRows)
        .innerJoin(importBatches, eq(importBatches.id, importRows.batchId))
        .where(and(inArray(importRows.fingerprint, chunk), isNull(importBatches.voidedAt)))
        .all())
        out.add(r.fp)
    return out
  }

  const fingerprintsOf = (a: Analysis): string[] => [...a.stays, ...a.lines, ...a.salaries].map((x) => x.fp)

  const recordsOf = (a: Analysis, done: ReadonlySet<string>): ImportRecord[] => [
    ...a.stays.map((s): ImportRecord => ({
      row: s.row,
      kind: s.checkIn === s.checkOut ? 'dayUse' : 'stay',
      date: s.checkIn,
      until: s.checkOut,
      room: s.room,
      name: s.name,
      amountMinor: s.prices.reduce((n, p) => n + p.priceMinor, 0),
      currency: s.currency,
      paidMinor: s.paidMinor,
      marked: false,
      detail: s.note,
      already: done.has(s.fp)
    })),
    ...a.lines.map((l): ImportRecord => ({
      row: l.row,
      kind: l.kind,
      date: l.date,
      until: null,
      room: l.room,
      name: l.name,
      amountMinor: l.amountMinor,
      currency: l.currency,
      paidMinor: l.kind === 'income' ? l.amountMinor : 0,
      marked: l.marked,
      detail: null,
      already: done.has(l.fp)
    })),
    ...a.salaries.map((x): ImportRecord => ({
      row: x.row,
      kind: 'salary',
      date: `${x.year}-${String(x.month).padStart(2, '0')}-01`,
      until: null,
      room: null,
      name: x.name,
      amountMinor: x.salaryMinor ?? 0,
      currency: x.currency ?? readSetting(db, 'hotel.baseCurrency'),
      paidMinor: x.paidMinor ?? 0,
      marked: false,
      detail: null,
      already: done.has(x.fp)
    }))
  ]

  /** The channel of imported reservations: the one chosen, else the hotel's first "direct" channel. */
  function channelFor(input: Input): string {
    if (input.channelId) return input.channelId
    const all = db.select().from(salesChannels).orderBy(asc(salesChannels.sort)).all()
    const direct = all.find((c) => c.kind === 'direct' && c.active) ?? all.find((c) => c.active) ?? all[0]
    if (!direct) throw new AppError('CONFLICT', 'errors.importNoChannel')
    return direct.id
  }

  const errorOf = (error: unknown): ImportErrorCode => {
    if (!(error instanceof AppError)) return 'failed'
    if (error.code === 'PERMISSION_DENIED') return 'refused'
    if (error.messageKey === 'errors.dayClosed') return 'dayClosed'
    if (error.code === 'CONFLICT') return 'conflict'
    return 'failed'
  }

  /** A reservation of `room` on `date` whose guest's name shares a word with the ledger line. */
  function matchReservation(line: LedgerLine): string | null {
    const numbers = (line.room ?? '').split(/[,/+\s]+/).filter(Boolean)
    if (!numbers.length) return null
    const roomIds = db
      .select({ id: rooms.id })
      .from(rooms)
      .where(inArray(rooms.number, numbers))
      .all()
      .map((r) => r.id)
    if (!roomIds.length) return null
    const candidates = db
      .select({ id: reservations.id, first: guests.firstName, last: guests.lastName })
      .from(reservationRooms)
      .innerJoin(reservations, eq(reservations.id, reservationRooms.reservationId))
      .innerJoin(guests, eq(guests.id, reservations.primaryGuestId))
      .where(
        and(
          inArray(reservationRooms.roomId, roomIds),
          lte(reservationRooms.checkIn, line.date),
          gte(reservationRooms.checkOut, line.date),
          // P14fix #17: a cancelled reservation, a no-show or a released room took no money.
          notInArray(reservations.status, ['cancelled', 'no_show']),
          isNull(reservationRooms.releasedAt)
        )
      )
      .all()
    const words = new Set(
      normalizeName(line.name.replace(/\(.*\)/, ''))
        .split(' ')
        .filter((w) => w.length > 1)
    )
    const named = candidates.filter((c) =>
      normalizeName(`${c.first} ${c.last}`)
        .split(' ')
        .some((w) => words.has(w))
    )
    const unique = [...new Set((words.size ? named : candidates).map((c) => c.id))]
    return unique.length === 1 ? unique[0]! : null
  }

  /** Where one run's writes are recorded: the batch row (made before the first record) and each record's entities. */
  interface Run {
    ctx: Ctx
    input: Input
    a: Analysis
    report: ImportReport
    fileSha256: string
    batchId: string | null
  }

  type Tracked = (typeof importRows.$inferInsert)['entity']

  /** The run's batch row, made outside any record's savepoint (a record that fails must not take it along). */
  function openBatch(run: Run): string {
    if (run.batchId) return run.batchId
    run.batchId = inTransaction(deps, run.ctx, (tx, audit, now) => {
      const row = {
        id: newId(now),
        template: run.input.template,
        fileName: run.input.fileName,
        fileSha256: run.fileSha256,
        summaryJson: {},
        createdBy: run.ctx.userId,
        voidedAt: null,
        voidedBy: null,
        voidReason: null,
        ...stamps(now)
      }
      tx.insert(importBatches).values(row).run()
      audit({ entity: 'import_batch', entityId: row.id, action: 'import', after: row })
      return row.id
    })
    return run.batchId
  }

  /** Remembers what a record wrote (inside the record's own savepoint: both go in or neither). */
  function track(run: Run, fp: string, row: number, entity: Tracked, entityId: string): void {
    const now = deps.clock()
    db.insert(importRows)
      .values({
        id: newId(now),
        batchId: run.batchId!,
        fingerprint: fp,
        row,
        entity,
        entityId,
        ...stamps(now)
      })
      .run()
  }

  /** One record: its writes and their fingerprint rows in one savepoint (a failure leaves nothing behind). */
  const savepoint = <T>(fn: () => T): T => db.transaction(() => fn())

  /** The hotel's day (P14fix #14): at 01:30 in Istanbul yesterday's stay is over. */
  const hotelToday = (): LocalDate =>
    localDate(localDateIn(deps.clock().toISOString(), readSetting(db, 'hotel.timezone')))

  function importGrid(run: Run, done: ReadonlySet<string>): void {
    const { ctx, input, a, report } = run
    const channelId = channelFor(input)
    const today = hotelToday()
    const known = new Map<string, string>()
    for (const g of db
      .select({ id: guests.id, key: guests.nameNormalized })
      .from(guests)
      .where(isNull(guests.mergedIntoId))
      .orderBy(asc(guests.createdAt))
      .all())
      if (!known.has(g.key)) known.set(g.key, g.id)
    for (const s of a.stays) {
      if (done.has(s.fp)) {
        report.skipped++
        continue
      }
      const key = normalizeName(s.name)
      const existing = known.get(key)
      try {
        const detail = savepoint(() => {
          const detail = deps.reservations.create(ctx, {
            guest: existing ? { id: existing } : splitName(s.name),
            channelId,
            status: 'confirmed',
            currency: s.currency,
            stays: [{ roomId: s.roomId, checkIn: s.checkIn, checkOut: s.checkOut, prices: s.prices }],
            notes: s.note
          })
          track(run, s.fp, s.row, 'reservation', detail.reservation.id)
          // A stay that is over was lived: it is closed as checked out (no dirty-room or task follow-ups today).
          if (s.checkOut < today) {
            inTransaction(deps, ctx, (tx, audit, now) => {
              tx.update(reservations)
                .set({ status: 'checked_out', updatedAt: now.toISOString() })
                .where(eq(reservations.id, detail.reservation.id))
                .run()
              tx.update(reservationRooms)
                .set({ status: 'done', updatedAt: now.toISOString() })
                .where(eq(reservationRooms.reservationId, detail.reservation.id))
                .run()
              audit({
                entity: 'reservation',
                entityId: detail.reservation.id,
                action: 'import',
                before: { status: 'confirmed' },
                after: { status: 'checked_out' },
                reason: IMPORT_REASON
              })
            })
          }
          return detail
        })
        report.reservations++
        report.nights += s.prices.length
        if (!existing) {
          report.guestsCreated++
          known.set(key, detail.guest.id)
        }
        if (input.paidMethodId && s.paidMinor > 0 && s.firstPaid) {
          try {
            savepoint(() => {
              const payment = deps.payments.create(ctx, {
                reservationId: detail.reservation.id,
                date: s.firstPaid!,
                kind: 'payment',
                methodId: input.paidMethodId!,
                amountMinor: s.paidMinor,
                currency: s.currency,
                note: importText(),
                dayClosedReason: closedDay(s.firstPaid!) ? IMPORT_REASON : undefined
              })
              track(run, s.fp, s.row, 'payment', payment.id)
            })
            report.payments++
          } catch (error) {
            err(report.errors, s.row, a.columns[s.col] ?? null, errorOf(error), s.name)
          }
        }
      } catch (error) {
        err(report.errors, s.row, a.columns[s.col] ?? null, errorOf(error), s.name)
      }
    }
  }

  const closedDay = (date: string): boolean =>
    readSetting(db, 'businessDay.closingEnabled') &&
    db.select().from(businessDays).where(eq(businessDays.date, date)).get()?.status === 'closed'

  function importLedger(run: Run, done: ReadonlySet<string>): void {
    const { ctx, input, a, report } = run
    const generalSection =
      input.sectionId ??
      db.select().from(expenseSections).where(eq(expenseSections.code, 'general')).get()?.id ??
      db.select().from(expenseSections).orderBy(asc(expenseSections.sort)).get()?.id
    const handed: string[] = []
    // K-42 (1): a hidden section's expense is never paid from the drawer (the mark is kept only where allowed).
    const section = generalSection
      ? db.select().from(expenseSections).where(eq(expenseSections.id, generalSection)).get()
      : undefined
    const drawerOk = !section || drawerAllowedIn(section)
    for (const line of a.lines) {
      if (done.has(line.fp)) {
        report.skipped++
        continue
      }
      const reason = closedDay(line.date) ? IMPORT_REASON : undefined
      try {
        if (line.kind === 'expense') {
          if (!generalSection) throw new AppError('CONFLICT', 'errors.importNoSection')
          savepoint(() => {
            const expense = deps.expenses.createExpense(ctx, {
              date: line.date,
              sectionId: generalSection,
              amountMinor: line.amountMinor,
              currency: line.currency,
              description: line.name.slice(0, 200),
              paidFromDrawer: line.marked && drawerOk,
              reason
            })
            track(run, line.fp, line.row, 'expense', expense.id)
          })
          report.expenses++
          continue
        }
        const note = [line.name, line.room].filter(Boolean).join(' · ').slice(0, 500) || null
        const reservationId = input.matchReservations ? matchReservation(line) : null
        // P14fix #18: an income line of no known reservation is a stand-alone sale folio balanced by its charge,
        // written with its payment in one savepoint (the payment's rules decide; a refused one leaves nothing) and
        // under the same closed-day guard.
        const payment = savepoint(() => {
          let folioId: string | undefined
          if (!reservationId) {
            folioId = inTransaction(deps, ctx, (tx, audit, now) => {
              assertDayWritable(tx, ctx, line.date, reason)
              const id = newId(now)
              const folio = {
                id,
                kind: 'sale' as const,
                title: (note ?? importText()).slice(0, 200),
                currency: line.currency,
                createdBy: ctx.userId,
                ...stamps(now)
              }
              tx.insert(folios).values(folio).run()
              audit({ entity: 'folio', entityId: id, action: 'import', after: folio, reason: IMPORT_REASON })
              const chargeId = newId(now)
              tx.insert(charges)
                .values({
                  id: chargeId,
                  folioId: id,
                  date: line.date,
                  kind: 'adjustment',
                  description: (note ?? importText()).slice(0, 200),
                  qty: 1,
                  unitMinor: line.amountMinor,
                  amountMinor: line.amountMinor,
                  currency: line.currency,
                  amountBaseMinor: chargeBaseMinor(tx, line.amountMinor, line.currency, now),
                  createdBy: ctx.userId,
                  ...stamps(now)
                })
                .run()
              audit({ entity: 'charge', entityId: chargeId, action: 'import', reason: IMPORT_REASON })
              return id
            })
            track(run, line.fp, line.row, 'folio', folioId)
          }
          const payment = deps.payments.create(ctx, {
            ...(reservationId ? { reservationId } : { folioId }),
            date: line.date,
            kind: /kapora/i.test(line.name) ? 'deposit' : 'payment',
            methodId: line.methodId!,
            channelId: line.channelId,
            amountMinor: line.amountMinor,
            currency: line.currency,
            note,
            dayClosedReason: reason
          })
          track(run, line.fp, line.row, 'payment', payment.id)
          return payment
        })
        report.payments++
        if (line.marked) handed.push(payment.id)
      } catch (error) {
        err(report.errors, line.row, null, errorOf(error), line.name || String(line.amountMinor))
      }
    }
    // "x": the owner had received these; one handover marks them all (needs the handover right).
    if (handed.length) {
      try {
        savepoint(() => {
          const h = deps.payments.handover(ctx, { paymentIds: handed, note: importText() })
          track(run, 'handover', a.headerRow, 'cash_handover', h.id)
        })
      } catch (error) {
        err(report.errors, a.headerRow, null, errorOf(error), String(handed.length))
      }
    }
  }

  /** Salary sheet (P14fix #10): the month's salary into the history when it changed, the payment as staff money. */
  function importSalary(run: Run, done: ReadonlySet<string>): void {
    const { ctx, a, report } = run
    const staff = deps.staff
    if (!staff) throw new AppError('INTERNAL', 'errors.internal')
    const base = readSetting(db, 'hotel.baseCurrency')
    const today = hotelToday()
    for (const x of a.salaries) {
      if (done.has(x.fp)) {
        report.skipped++
        continue
      }
      const first = localDate(`${x.year}-${String(x.month).padStart(2, '0')}-01`)
      const last = lastDayOf(x.year, x.month)
      try {
        savepoint(() => {
          if (x.salaryMinor) {
            const current = db
              .select()
              .from(employeeSalaries)
              .where(
                and(eq(employeeSalaries.employeeId, x.employeeId), lte(employeeSalaries.validFrom, first))
              )
              .orderBy(desc(employeeSalaries.validFrom), desc(employeeSalaries.createdAt))
              .get()
            const currency = x.currency ?? current?.currency ?? base
            if (!current || current.monthlyMinor !== x.salaryMinor || current.currency !== currency) {
              const salary = staff.addSalary(ctx, {
                employeeId: x.employeeId,
                validFrom: first,
                monthlyMinor: x.salaryMinor,
                currency
              })
              track(run, x.fp, x.row, 'employee_salary', salary.id)
              report.salaries++
            }
          }
          if (x.paidMinor) {
            const date = x.date ?? (last <= today ? last : today < first ? last : today)
            const txn = staff.addTransaction(ctx, {
              employeeId: x.employeeId,
              date,
              kind: 'salary_payment',
              amountMinor: x.paidMinor,
              ...(x.currency ? { currency: x.currency } : {}),
              periodYear: x.year,
              periodMonth: x.month,
              note: importText(),
              methodId: x.methodId,
              reason: closedDay(date) ? IMPORT_REASON : undefined
            })
            track(run, x.fp, x.row, 'staff_transaction', txn.id)
            report.salaryPayments++
          }
        })
      } catch (error) {
        err(report.errors, x.row, null, errorOf(error), x.name)
      }
    }
  }

  function batchView(id: string): ImportBatch {
    const row = db
      .select({ b: importBatches, name: users.displayName })
      .from(importBatches)
      .leftJoin(users, eq(users.id, importBatches.createdBy))
      .where(eq(importBatches.id, id))
      .get()
    if (!row) throw notFound('import_batch', id)
    return {
      id: row.b.id,
      template: row.b.template,
      fileName: row.b.fileName,
      createdAt: row.b.createdAt,
      createdByName: row.name ?? null,
      summary: row.b.summaryJson,
      voidedAt: row.b.voidedAt,
      voidReason: row.b.voidReason
    }
  }

  /** Sample rows of each template (made-up names and amounts). */
  const SAMPLE_ROWS: Record<ImportTemplate, (base: string, locale: AppLocale) => string[][]> = {
    reservationGrid: (base) => [
      ['101', `Deneme Misafir (2000 ${base})`, `Deneme Misafir (2000 ${base})`, ''],
      ['102', '', `Örnek Konuk (1800 ${base})`, `Örnek Konuk (1800 ${base})`]
    ],
    ledgerRows: (base, locale) => {
      const day = locale === 'en' ? '01/10/2026' : '01.10.2026'
      return [
        [day, 'x', '2500', base, 'Deneme Misafir', 'Nakit', '101', '', '', '', '', ''],
        [day, '', '', '', '', '', '', '', 'x', '300', base, 'Deneme market']
      ]
    },
    salaryRows: (base, locale) => {
      const day = locale === 'en' ? '31/10/2026' : '31.10.2026'
      return [
        ['Deneme Çalışan', '2026-10', '40000', '31500', 'Nakit', day, base],
        ['Örnek Personel', '2026-10', '35000', '', '', '', base]
      ]
    }
  }

  return {
    /** Mapping, records, error list and possible duplicates; nothing is written. */
    async preview(ctx: Ctx, raw: ImportInput): Promise<ImportPreview> {
      const { input, a } = await analyze(ctx, raw)
      const done = alreadyImported(fingerprintsOf(a))
      const records = recordsOf(a, done)
      const fileSha256 = sha256(Buffer.from(input.contentBase64, 'base64'))
      const same = db
        .select({ at: importBatches.createdAt })
        .from(importBatches)
        .where(
          and(
            eq(importBatches.fileSha256, fileSha256),
            eq(importBatches.template, input.template),
            isNull(importBatches.voidedAt)
          )
        )
        .orderBy(desc(importBatches.createdAt))
        .get()
      return {
        template: input.template,
        sheetNames: a.table.sheetNames,
        headerRow: a.headerRow,
        columns: a.columns.slice(0, 200),
        mapping: a.mapping,
        needsMonth: a.needsMonth,
        rows: a.table.rows.length,
        records: records.slice(0, PREVIEW_RECORDS),
        recordCount: records.length,
        errors: a.errors.slice(0, LIST_ERRORS),
        errorCount: a.errors.length,
        duplicates: duplicates(a.names),
        blockedCells: a.blockedCells,
        alreadyImported: records.filter((r) => r.already).length,
        sameFileAt: same?.at ?? null
      }
    },

    /**
     * Imports every sound record not taken in already; the faulty ones (and those the services refuse) are
     * reported. The whole run is one transaction with a savepoint per record.
     */
    async run(ctx: Ctx, raw: ImportInput): Promise<ImportReport> {
      const { input, a } = await analyze(ctx, raw)
      if (a.needsMonth) throw new AppError('VALIDATION', 'errors.importNeedsMonth')
      const report: ImportReport = {
        batchId: null,
        reservations: 0,
        nights: 0,
        payments: 0,
        expenses: 0,
        guestsCreated: 0,
        salaries: 0,
        salaryPayments: 0,
        skipped: 0,
        errors: [...a.errors],
        errorCount: 0,
        duplicates: duplicates(a.names)
      }
      const run: Run = {
        ctx,
        input,
        a,
        report,
        fileSha256: sha256(Buffer.from(input.contentBase64, 'base64')),
        batchId: null
      }
      try {
        db.transaction(() => {
          const done = alreadyImported(fingerprintsOf(a))
          if (fingerprintsOf(a).some((fp) => !done.has(fp))) openBatch(run)
          if (input.template === 'reservationGrid') importGrid(run, done)
          else if (input.template === 'ledgerRows') importLedger(run, done)
          else importSalary(run, done)
          if (!run.batchId) return
          // Every record failed: no batch is left behind (the whole run rolls back; it wrote nothing else).
          if (!db.select().from(importRows).where(eq(importRows.batchId, run.batchId)).limit(1).get())
            throw new NothingWritten()
          const summary = {
            reservations: report.reservations,
            nights: report.nights,
            payments: report.payments,
            expenses: report.expenses,
            guestsCreated: report.guestsCreated,
            salaries: report.salaries,
            salaryPayments: report.salaryPayments
          }
          inTransaction(deps, ctx, (tx, audit, now) => {
            tx.update(importBatches)
              .set({ summaryJson: summary, updatedAt: now.toISOString() })
              .where(eq(importBatches.id, run.batchId!))
              .run()
            audit({ entity: 'import_batch', entityId: run.batchId!, action: 'update', after: summary })
          })
        })
      } catch (error) {
        if (!(error instanceof NothingWritten)) throw error
        run.batchId = null
      }
      report.batchId = run.batchId
      report.errorCount = report.errors.length
      report.errors = report.errors.sort((x, y) => x.row - y.row).slice(0, LIST_ERRORS)
      return report
    },

    /** Earlier imports, newest first (who, when, which file, what they wrote, cancelled or not). */
    batches(ctx: Ctx): ImportBatch[] {
      requirePermission(ctx, 'settings.backup', 'view')
      return db
        .select({ id: importBatches.id })
        .from(importBatches)
        .orderBy(desc(importBatches.createdAt))
        .limit(50)
        .all()
        .map((b) => batchView(b.id))
    },

    /**
     * "Bu aktarımı iptal et" (P14fix #2): everything the import wrote is voided through its own service, with the
     * reason, in one transaction (one refusal — a closed day, a later handover — changes nothing). Salary amounts
     * stay in the salary history (it is never rewritten); guest cards stay (they may have other stays).
     */
    voidBatch(ctx: Ctx, raw: { id: string; reason: string }): ImportBatch {
      requirePermission(ctx, 'settings.backup', 'edit')
      const { id, reason } = parseInput(importVoidInputSchema, raw)
      const batch = db.select().from(importBatches).where(eq(importBatches.id, id)).get()
      if (!batch) throw notFound('import_batch', id)
      if (batch.voidedAt) throw conflict('errors.alreadyCancelled')
      const rows = db
        .select()
        .from(importRows)
        .where(eq(importRows.batchId, id))
        .orderBy(desc(importRows.createdAt), desc(importRows.id))
        .all()
      const of = (entity: Tracked) => rows.filter((r) => r.entity === entity).map((r) => r.entityId)
      db.transaction(() => {
        // The handovers first: they hold the "x" payments (and the drawer expenses they settled).
        for (const hid of of('cash_handover')) {
          const h = db.select().from(cashHandovers).where(eq(cashHandovers.id, hid)).get()
          if (h && !h.revertedAt) deps.payments.revertHandover(ctx, hid, reason)
        }
        for (const pid of of('payment')) {
          const p = db.select().from(payments).where(eq(payments.id, pid)).get()
          if (p && !p.voidedAt) deps.payments.void(ctx, pid, reason)
        }
        for (const tid of of('staff_transaction')) {
          const tr = db.select().from(staffTransactions).where(eq(staffTransactions.id, tid)).get()
          if (tr && !tr.voidedAt) {
            if (!deps.staff) throw new AppError('INTERNAL', 'errors.internal')
            deps.staff.voidTransaction(ctx, tid, reason)
          }
        }
        for (const eid of of('expense')) {
          const e = db.select().from(expenses).where(eq(expenses.id, eid)).get()
          if (e && !e.voidedAt) deps.expenses.voidExpense(ctx, eid, reason)
        }
        for (const fid of of('folio')) {
          requirePermission(ctx, 'payments', 'edit')
          inTransaction(deps, ctx, (tx, audit, now) => {
            for (const c of tx
              .select()
              .from(charges)
              .where(and(eq(charges.folioId, fid), isNull(charges.voidedAt)))
              .all()) {
              assertDayWritable(tx, ctx, c.date, reason)
              tx.update(charges)
                .set({ voidedAt: now.toISOString(), voidReason: reason, updatedAt: now.toISOString() })
                .where(eq(charges.id, c.id))
                .run()
              audit({ entity: 'charge', entityId: c.id, action: 'void', before: c, reason })
            }
          })
        }
        for (const rid of of('reservation')) {
          const r = db.select().from(reservations).where(eq(reservations.id, rid)).get()
          if (!r || r.status === 'cancelled' || r.status === 'no_show') continue
          if (r.status === 'checked_out') {
            // The import closed a lived stay itself; it is opened the same way so the service can cancel it.
            requirePermission(ctx, 'calendar', 'edit')
            inTransaction(deps, ctx, (tx, audit, now) => {
              tx.update(reservations)
                .set({ status: 'confirmed', updatedAt: now.toISOString() })
                .where(eq(reservations.id, rid))
                .run()
              tx.update(reservationRooms)
                .set({ status: 'planned', updatedAt: now.toISOString() })
                .where(and(eq(reservationRooms.reservationId, rid), eq(reservationRooms.status, 'done')))
                .run()
              audit({
                entity: 'reservation',
                entityId: rid,
                action: 'update',
                before: { status: 'checked_out' },
                after: { status: 'confirmed' },
                reason
              })
            })
          }
          deps.reservations.cancel(ctx, rid, reason)
        }
        inTransaction(deps, ctx, (tx, audit, now) => {
          const after = { voidedAt: now.toISOString(), voidedBy: ctx.userId, voidReason: reason }
          tx.update(importBatches)
            .set({ ...after, updatedAt: now.toISOString() })
            .where(eq(importBatches.id, id))
            .run()
          audit({ entity: 'import_batch', entityId: id, action: 'void', before: batch, after, reason })
        })
      })
      return batchView(id)
    },

    /** The template as a CSV file to fill in: its column titles in the person's language and two made-up rows. */
    async sample(ctx: Ctx, raw: { template: ImportTemplate; locale: AppLocale }): Promise<ExportFile> {
      requirePermission(ctx, 'settings.backup', 'view')
      const { template, locale } = parseInput(importSampleInputSchema, raw)
      const t = translator(locale)
      const base = readSetting(db, 'hotel.baseCurrency')
      const titles =
        template === 'reservationGrid'
          ? [
              t('dataTransfer.import.sample.reservationGrid.room'),
              ...(locale === 'en'
                ? ['01/10/2026', '02/10/2026', '03/10/2026']
                : ['01.10.2026', '02.10.2026', '03.10.2026'])
            ]
          : (template === 'ledgerRows' ? LEDGER_FIELDS : SALARY_FIELDS).map((f) =>
              t(`dataTransfer.import.sample.${template}.${f}`)
            )
      const rows = SAMPLE_ROWS[template](base, locale)
      const columns = titles.map((label, i) => ({ key: String(i), label, type: 'text' as const }))
      const text = toCsv(
        {
          title: '',
          columns,
          rows: rows.map((r) => Object.fromEntries(r.map((v, i) => [String(i), v])))
        },
        { locale, t: (key) => key, timeZone: readSetting(db, 'hotel.timezone') }
      )
      const bytes = Buffer.from(text, 'utf8')
      const fileName = `${t(`dataTransfer.import.templates.${template}.name`)}.csv`.replace(
        /[\\/:*?"<>|×]/g,
        '-'
      )
      const base64 = bytes.toString('base64')
      const local = ctx.transport === 'ipc' && deps.saveFile ? deps.saveFile : null
      if (!local)
        return {
          fileName,
          mime: 'text/csv;charset=utf-8',
          base64,
          rows: rows.length,
          delivery: 'download',
          savedPath: null
        }
      const savedPath = await local(fileName, bytes)
      return {
        fileName,
        mime: 'text/csv;charset=utf-8',
        base64: '',
        rows: rows.length,
        delivery: savedPath === null ? 'canceled' : 'saved',
        savedPath
      }
    }
  }
}

export type DataImportService = ReturnType<typeof createDataImportService>
