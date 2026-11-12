// Reading the owner's spreadsheet cells (faz-14 madde 4; G-123, K-30; 02-excel-analizi.md §1.1, §2.2): amounts written
// the Turkish way ("2.500", "43.01 EURO"), currency words (TL, Euro, Dolar, Sterlin, Ruble), day headers
// ("01.10.2026", "1 (cts)"), reservation cells ("SEBAHATTİN SEVEN (2500 TL) sonra Serdar Işık (2500 TL)") and the
// cell colours of the reservation sheet (red = paid, yellow = unpaid, cyan = same-day stay, black = not for sale).
// Pure functions: the import service and its tests use them; nothing here touches the database.
import { isLocalDate, type LocalDate } from '../date'
import { parseAmountText, type CurrencyCode } from '../money'
import { normalizeName } from './normalize'

/** Currency words and symbols of the owner's sheets → ISO 4217 code (folded, lower case). */
const CURRENCY_WORDS: Readonly<Record<string, string>> = {
  tl: 'TRY',
  try: 'TRY',
  ytl: 'TRY',
  lira: 'TRY',
  '₺': 'TRY',
  euro: 'EUR',
  eur: 'EUR',
  avro: 'EUR',
  '€': 'EUR',
  dolar: 'USD',
  dollar: 'USD',
  usd: 'USD',
  $: 'USD',
  sterlin: 'GBP',
  gbp: 'GBP',
  pound: 'GBP',
  '£': 'GBP',
  ruble: 'RUB',
  rub: 'RUB',
  rubl: 'RUB',
  '₽': 'RUB'
}

/** "Euro", "TL", "₺", "usd" → ISO code; an ISO code passes through; anything else → null. */
export function parseCurrency(raw: string): string | null {
  const text = raw.trim()
  if (!text) return null
  const folded = normalizeName(text).replace(/\s+/g, '')
  const word = CURRENCY_WORDS[folded] ?? CURRENCY_WORDS[text]
  if (word) return word
  return /^[A-Z]{3}$/.test(text) ? text : null
}

/**
 * Amount text → minor units of `currency` (money.ts `parseAmountText`: the owner's separators, the currency's own
 * decimals). Null when it is not a number (or negative).
 */
export function parseAmountMinor(raw: string, currency: CurrencyCode): number | null {
  return parseAmountText(raw, currency)?.amountMinor ?? null
}

const pad = (n: number): string => String(n).padStart(2, '0')

/** A real day from year/month/day numbers, or null. */
export function dayOf(year: number, month: number, day: number): LocalDate | null {
  const text = `${String(year).padStart(4, '0')}-${pad(month)}-${pad(day)}`
  return isLocalDate(text) ? text : null
}

/**
 * Day header or date cell → local day. Accepts "01.10.2026", "1/10/2026", "2026-10-01", "1.10.26", and — with
 * `month` ('YYYY-MM') — a bare day number with anything after it ("1", "01 (cts)", "1.10"). Null otherwise.
 */
export function parseDayCell(raw: string, month?: string | null): LocalDate | null {
  const text = raw.trim()
  if (!text) return null
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text)
  if (m) return dayOf(Number(m[1]), Number(m[2]), Number(m[3]))
  m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})\b/.exec(text)
  if (m) {
    const y = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3])
    return dayOf(y, Number(m[2]), Number(m[1]))
  }
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return null
  const [y, mo] = month.split('-').map(Number) as [number, number]
  m = /^(\d{1,2})[./](\d{1,2})\b/.exec(text)
  if (m) return Number(m[2]) === mo ? dayOf(y, mo, Number(m[1])) : null
  m = /^(\d{1,2})(?!\d)/.exec(text)
  return m ? dayOf(y, mo, Number(m[1])) : null
}

/** Turkish-aware title case: "SEBAHATTİN SEVEN" → "Sebahattin Seven", "gadir garibov" → "Gadir Garibov". */
export function titleCaseName(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('tr-TR')
    .replace(/(^|[\s'-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toLocaleUpperCase('tr-TR'))
}

/** "Sebahattin Seven" → first name(s) + last name (the last word); one word → first name only. */
export function splitName(full: string): { firstName: string; lastName: string } {
  const words = titleCaseName(full).split(' ').filter(Boolean)
  if (words.length <= 1) return { firstName: words[0] ?? '', lastName: '' }
  return { firstName: words.slice(0, -1).join(' '), lastName: words[words.length - 1]! }
}

/** One guest written in a reservation cell. */
export interface CellGuest {
  /** Title-cased name ("Sebahattin Seven"). */
  name: string
  priceMinor: number | null
  currency: string | null
  /** Text after the price ("sonra kirli", "kapora"). */
  note: string | null
}

export type CellParse =
  | { kind: 'empty' }
  /** "SATILMAZ": the room was closed to sale (a room block, not a reservation). */
  | { kind: 'blocked' }
  | { kind: 'guests'; guests: CellGuest[] }
  | { kind: 'invalid'; reason: 'emptyName' | 'badAmount' }

const BLOCKED_WORDS = ['satilmaz', 'satisa kapali', 'kapali']
/** "X sonra Y": X leaves that day, Y stays the night. */
const THEN = /\s+(?:sonra|ardından|ardindan|then)\s+/iu

/** One "NAME (price currency) note" part. */
function parseGuest(part: string, defaultCurrency: CurrencyCode): CellGuest | 'emptyName' | 'badAmount' {
  const text = part.trim()
  const paren = /^(.*?)\s*\(([^)]*)\)\s*(.*)$/u.exec(text)
  let name = text
  let priceText = ''
  let note = ''
  if (paren) {
    name = paren[1]!
    priceText = paren[2]!.trim()
    note = paren[3]!.trim()
  } else {
    // "NAME 35 euro" / "NAME 2500"
    const tail = /^(.*?\p{L}.*?)\s+(\d[\d.,]*\s*[\p{L}₺€$£₽]*)$/u.exec(text)
    if (tail) {
      name = tail[1]!
      priceText = tail[2]!
    }
  }
  if (!normalizeName(name)) return 'emptyName'
  let priceMinor: number | null = null
  let currency: string | null = null
  if (priceText) {
    const m = /^(\d[\d.,\s]*?)\s*([\p{L}₺€$£₽.]*)$/u.exec(priceText)
    if (!/^\d/.test(priceText)) {
      // "(kapora)" and other notes in brackets: a note, no price.
      note = [priceText, note].filter(Boolean).join(' ')
    } else if (!m) return 'badAmount'
    else {
      const word = m[2]!.trim()
      if (word) {
        currency = parseCurrency(word)
        if (!currency) note = [word, note].filter(Boolean).join(' ')
      }
      priceMinor = parseAmountMinor(m[1]!, currency ?? defaultCurrency)
      if (priceMinor === null) return 'badAmount'
    }
  }
  return { name: titleCaseName(name), priceMinor, currency, note: note || null }
}

/** Reads one reservation-sheet cell; an amount without a currency word is in `defaultCurrency`. */
export function parseReservationCell(raw: string, defaultCurrency: CurrencyCode): CellParse {
  const text = raw.replace(/\s+/g, ' ').trim()
  if (!text) return { kind: 'empty' }
  if (BLOCKED_WORDS.includes(normalizeName(text))) return { kind: 'blocked' }
  const guests: CellGuest[] = []
  for (const part of text.split(THEN)) {
    const previous = guests[guests.length - 1]
    // "… sonra kirli": a later part without a price or brackets is a note on the guest before it.
    if (previous && !/[()\d]/.test(part)) {
      previous.note = [previous.note, `${text.match(THEN)?.[0]?.trim() ?? ''} ${part.trim()}`.trim()]
        .filter(Boolean)
        .join(' ')
      continue
    }
    const g = parseGuest(part, defaultCurrency)
    if (g === 'emptyName' || g === 'badAmount') return { kind: 'invalid', reason: g }
    guests.push(g)
  }
  return { kind: 'guests', guests }
}

/** What a cell colour of the reservation sheet means (02-excel-analizi.md §2.2). */
export type CellColorMeaning = 'paid' | 'unpaid' | 'partial' | 'dayuse' | 'pastEmpty' | 'empty' | 'blocked'

/** Reference colours (the owner's sheet and the defaults of the status tags, K-21). */
const COLOR_REFS: readonly (readonly [CellColorMeaning, number, number, number])[] = [
  ['paid', 0xef, 0x44, 0x44],
  ['paid', 0xff, 0x00, 0x00],
  ['paid', 0xea, 0x99, 0x99],
  ['unpaid', 0xff, 0xff, 0x00],
  ['unpaid', 0xfa, 0xcc, 0x15],
  ['unpaid', 0xff, 0xe5, 0x99],
  ['partial', 0xfb, 0x92, 0x3c],
  ['partial', 0xff, 0x99, 0x00],
  ['dayuse', 0x00, 0xff, 0xff],
  ['dayuse', 0x22, 0xd3, 0xee],
  ['pastEmpty', 0x9c, 0xa3, 0xaf],
  ['pastEmpty', 0xb7, 0xb7, 0xb7],
  ['empty', 0xff, 0xff, 0xff],
  ['blocked', 0x00, 0x00, 0x00],
  ['blocked', 0x11, 0x18, 0x27]
]

/** "FFFF0000" (ARGB) or "#ff0000" → the nearest meaning; null for no colour or one far from all of them. */
export function colorMeaning(raw: string | null | undefined): CellColorMeaning | null {
  if (!raw) return null
  const hex = raw.replace(/^#/, '')
  const rgb = hex.length === 8 ? hex.slice(2) : hex
  if (!/^[0-9a-fA-F]{6}$/.test(rgb)) return null
  const r = parseInt(rgb.slice(0, 2), 16)
  const g = parseInt(rgb.slice(2, 4), 16)
  const b = parseInt(rgb.slice(4, 6), 16)
  let best: CellColorMeaning | null = null
  let bestDistance = Infinity
  for (const [meaning, cr, cg, cb] of COLOR_REFS) {
    const d = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2
    if (d < bestDistance) {
      bestDistance = d
      best = meaning
    }
  }
  return bestDistance <= 90 ** 2 ? best : null
}

/** "x", "X", "✓", "evet" in the owner's "Kasa" column: handed over / paid from the drawer. */
export function isMarked(raw: string): boolean {
  return ['x', '✓', '✔', 'evet', 'yes', 'var', '1', 'true'].includes(raw.trim().toLocaleLowerCase('tr-TR'))
}

/** "---", "-", "yok" in a list column: nothing chosen. */
export function isBlankChoice(raw: string): boolean {
  return /^[-–—\s]*$/.test(raw) || ['yok', 'none'].includes(normalizeName(raw))
}

/** Levenshtein distance, stopping early above `max` (returns max + 1 then). */
export function editDistance(a: string, b: string, max = 3): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let rowMin = i
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1))
      cur.push(v)
      rowMin = Math.min(rowMin, v)
    }
    if (rowMin > max) return max + 1
    prev = cur
  }
  return prev[b.length]!
}

/**
 * Names that are probably the same person written differently ("Gadir Garibov" / "GADİR GADİROV"): the same first
 * word and a last name at most two letters apart, or the whole name one letter apart. Exact matches are not listed
 * (they are the same guest already).
 */
export function looksLikeSamePerson(a: string, b: string): boolean {
  const na = normalizeName(a)
  const nb = normalizeName(b)
  if (!na || !nb || na === nb) return false
  if (editDistance(na, nb, 1) <= 1) return true
  const wa = na.split(' ')
  const wb = nb.split(' ')
  if (wa.length < 2 || wb.length < 2 || wa[0] !== wb[0]) return false
  return editDistance(wa.slice(1).join(' '), wb.slice(1).join(' '), 2) <= 2
}
