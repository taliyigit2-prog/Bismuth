// Phone-book import (G-160, faz-12 madde 1): "ad; telefon; kategori" lines pasted from Excel or a CSV file.
// Separator: semicolon (Turkish Excel), tab (copied cells) or comma. A first line that names the columns is
// skipped. The category is matched to a seeded one by its code or its name in any of the three languages;
// anything else becomes the hotel's own label (custom). Pure: the screen previews, the service writes.
import { normalizeName } from './normalize'

/** The seeded categories (same list as the contacts.category column). */
export const CSV_CONTACT_CATEGORIES = [
  'supplier',
  'laundry',
  'plumber',
  'electrician',
  'taxi',
  'emergency',
  'other'
] as const
export type CsvContactCategory = (typeof CSV_CONTACT_CATEGORIES)[number]

/** Names people write for the seeded categories (tr / en / ru and common Turkish variants), normalised. */
const CATEGORY_WORDS: Record<CsvContactCategory, readonly string[]> = {
  supplier: ['tedarikci', 'tedarik', 'supplier', 'поставщик'],
  laundry: ['camasirhane', 'laundry', 'прачечная'],
  plumber: ['tesisatci', 'su tesisatcisi', 'plumber', 'сантехник'],
  electrician: ['elektrikci', 'electrician', 'электрик'],
  taxi: ['taksi', 'taxi', 'такси'],
  emergency: ['acil', 'emergency', 'экстренные', 'экстренная служба'],
  other: ['diger', 'other', 'другое', 'прочее']
}

const HEADER_WORDS = new Set([
  'ad',
  'adi',
  'isim',
  'name',
  'имя',
  'название',
  'firma',
  'kisi',
  'soyad',
  'soyadi',
  'soyisim',
  'unvan',
  'фио',
  'контакт'
])
const PHONE_HEADER_WORDS = new Set([
  'telefon',
  'tel',
  'phone',
  'telephone',
  'gsm',
  'numara',
  'телефон',
  'номер'
])

/**
 * A first line naming the columns ("Ad;Telefon;Kategori", "Adı Soyadı;Telefon", "Name,Phone"): its phone cell holds
 * no number and one of its first two cells is a column title.
 */
function isHeader(name: string, phone: string): boolean {
  if (phone.replace(/\D/g, '').length >= 3) return false
  const words = (text: string): string[] => normalizeName(text).split(' ').filter(Boolean)
  return words(name).some((w) => HEADER_WORDS.has(w)) || words(phone).some((w) => PHONE_HEADER_WORDS.has(w))
}

export interface CsvContact {
  /** 1-based line number in the pasted text. */
  line: number
  name: string
  phones: { label: string; number: string }[]
  category: CsvContactCategory | 'custom'
  customCategory: string | null
}

export interface CsvProblem {
  line: number
  reason: 'noName' | 'noPhone' | 'tooLong'
}

export interface CsvParseResult {
  rows: CsvContact[]
  problems: CsvProblem[]
}

/** Seeded category code for a written name; null when it is the hotel's own word. */
export function matchCategory(text: string): CsvContactCategory | null {
  const key = normalizeName(text)
  if (!key) return null
  for (const code of CSV_CONTACT_CATEGORIES)
    if (code === key || CATEGORY_WORDS[code].some((w) => normalizeName(w) === key)) return code
  return null
}

/** The line's text outside quoted cells (a comma inside "Yıldız Su, Ltd." is not a separator). */
const outsideQuotes = (line: string): string => line.replace(/"(?:[^"]|"")*"/g, '')

function separatorOf(line: string): string {
  const bare = outsideQuotes(line)
  if (bare.includes('\t')) return '\t'
  if (bare.includes(';')) return ';'
  return ','
}

/**
 * Splits a line into cells as spreadsheets write them: a quoted cell keeps its separators and a doubled quote
 * inside it is one quote ("Usta ""Ali""" → Usta "Ali").
 */
export function splitCsvLine(line: string, separator: string): string[] {
  const cells: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"' && !cell.trim()) {
      quoted = true
      cell = ''
    } else if (ch === separator) {
      cells.push(cell.trim())
      cell = ''
    } else cell += ch
  }
  cells.push(cell.trim())
  return cells
}

/** Several numbers in one cell: "0532 000 00 00 / 0212 000 00 00". */
const splitPhones = (cell: string): string[] =>
  cell
    .split(/[/|]|\s{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.replace(/\D/g, '').length >= 3)

export const CSV_MAX_ROWS = 500

/** Parses pasted rows; empty lines are ignored, each bad line is reported with its number. */
export function parseContactsCsv(text: string): CsvParseResult {
  const rows: CsvContact[] = []
  const problems: CsvProblem[] = []
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/)
  lines.forEach((raw, index) => {
    const line = index + 1
    if (!raw.trim()) return
    const cells = splitCsvLine(raw, separatorOf(raw))
    const [name = '', phone = '', category = ''] = cells
    if (rows.length === 0 && problems.length === 0 && isHeader(name, phone)) return
    if (!name) return void problems.push({ line, reason: 'noName' })
    if (name.length > 120 || category.length > 60) return void problems.push({ line, reason: 'tooLong' })
    const phones = splitPhones(phone)
    if (!phones.length) return void problems.push({ line, reason: 'noPhone' })
    if (phones.some((p) => p.length > 40)) return void problems.push({ line, reason: 'tooLong' })
    const code = matchCategory(category)
    const custom = !code && category.trim() ? category.trim() : null
    rows.push({
      line,
      name,
      phones: phones.slice(0, 10).map((number) => ({ label: '', number })),
      category: code ?? (custom ? 'custom' : 'other'),
      customCategory: custom
    })
  })
  return { rows: rows.slice(0, CSV_MAX_ROWS), problems }
}
