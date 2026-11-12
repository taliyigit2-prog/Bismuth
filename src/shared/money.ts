// Money = integer minor units + ISO 4217 currency (CLAUDE.md yasak 6, G-131).
// Every monetary multiplication/division in Bismuth goes through this file; nothing here uses
// floating point arithmetic on amounts (BigInt for products, decimal strings for parsing).

export type CurrencyCode = string

export interface Money {
  readonly amountMinor: number
  readonly currency: CurrencyCode
}

// ISO 4217 minor units for the currencies that do not use 2 (every other code uses 2). A fixed table, not Intl:
// a stored amount's meaning must never change with the platform's ICU version. The hotel can accept any ISO
// currency (Ayarlar → Otel), so the table covers the whole standard, not only the common ones.
const MINOR_DIGITS: Readonly<Record<string, number>> = {
  BIF: 0,
  CLP: 0,
  DJF: 0,
  GNF: 0,
  ISK: 0,
  JPY: 0,
  KMF: 0,
  KRW: 0,
  PYG: 0,
  RWF: 0,
  UGX: 0,
  UYI: 0,
  VND: 0,
  VUV: 0,
  XAF: 0,
  XOF: 0,
  XPF: 0,
  BHD: 3,
  IQD: 3,
  JOD: 3,
  KWD: 3,
  LYD: 3,
  OMR: 3,
  TND: 3,
  CLF: 4,
  UYW: 4
}

const CURRENCY_PATTERN = /^[A-Z]{3}$/

/**
 * The largest amount a person may type into any money field (1.000.000.000,00 in a two-decimal currency): one
 * limit for every form and every procedure input (K-46), so a slip of the finger (99.999.999.999) never reaches
 * the books. Totals and reports are not limited by it.
 */
export const MAX_AMOUNT_MINOR = 100_000_000_000

export function minorDigits(currency: CurrencyCode): number {
  return MINOR_DIGITS[currency] ?? 2
}

export function money(amountMinor: number, currency: CurrencyCode): Money {
  if (!Number.isSafeInteger(amountMinor))
    throw new RangeError(`money: amountMinor must be a safe integer (${amountMinor})`)
  if (!CURRENCY_PATTERN.test(currency)) throw new RangeError(`money: invalid currency "${currency}"`)
  return { amountMinor: amountMinor === 0 ? 0 : amountMinor, currency }
}

export const zero = (currency: CurrencyCode): Money => money(0, currency)

function sameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) throw new TypeError(`money: currency mismatch ${a.currency} / ${b.currency}`)
}

function fromBig(value: bigint, currency: CurrencyCode): Money {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER))
    throw new RangeError('money: overflow')
  return money(Number(value), currency)
}

export function add(a: Money, b: Money): Money {
  sameCurrency(a, b)
  return fromBig(BigInt(a.amountMinor) + BigInt(b.amountMinor), a.currency)
}

export function subtract(a: Money, b: Money): Money {
  sameCurrency(a, b)
  return fromBig(BigInt(a.amountMinor) - BigInt(b.amountMinor), a.currency)
}

export function negate(a: Money): Money {
  return money(-a.amountMinor, a.currency)
}

export function sum(items: readonly Money[], currency: CurrencyCode): Money {
  return items.reduce((acc, m) => add(acc, m), zero(currency))
}

export function compare(a: Money, b: Money): -1 | 0 | 1 {
  sameCurrency(a, b)
  return a.amountMinor < b.amountMinor ? -1 : a.amountMinor > b.amountMinor ? 1 : 0
}

export const isZero = (m: Money): boolean => m.amountMinor === 0
export const isNegative = (m: Money): boolean => m.amountMinor < 0

/** Banker-free rounding: half away from zero, the way people round money by hand. */
function divRoundHalfAwayFromZero(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new RangeError('money: division by zero')
  const negative = numerator < 0n !== denominator < 0n
  const n = numerator < 0n ? -numerator : numerator
  const d = denominator < 0n ? -denominator : denominator
  const q = n / d
  const r = n % d
  const rounded = r * 2n >= d ? q + 1n : q
  return negative ? -rounded : rounded
}

/** m × numerator ÷ denominator with exact integer arithmetic (e.g. monthly salary ÷ 30 × leave days). */
export function multiplyRatio(m: Money, numerator: number | bigint, denominator: number | bigint = 1): Money {
  const num = BigInt(numerator)
  const den = BigInt(denominator)
  return fromBig(divRoundHalfAwayFromZero(BigInt(m.amountMinor) * num, den), m.currency)
}

/**
 * m rounded to a whole multiple of `unitMinor` minor units, half away from zero (₺2.347,50 to whole lira → ₺2.348;
 * to tens → ₺2.350). For amounts said out loud; records keep their minor units.
 */
export function roundToUnit(m: Money, unitMinor: number): Money {
  if (!Number.isSafeInteger(unitMinor) || unitMinor <= 0)
    throw new RangeError('money: rounding unit must be a positive integer')
  const unit = BigInt(unitMinor)
  return fromBig(divRoundHalfAwayFromZero(BigInt(m.amountMinor), unit) * unit, m.currency)
}

/**
 * Split m into parts proportional to integer weights; the parts always add up to m exactly
 * (largest-remainder method; earlier parts win ties).
 */
export function allocate(m: Money, weights: readonly number[]): Money[] {
  if (weights.length === 0) throw new RangeError('money: allocate needs at least one weight')
  const w = weights.map((x) => {
    if (!Number.isSafeInteger(x) || x < 0)
      throw new RangeError('money: weights must be non-negative integers')
    return BigInt(x)
  })
  const total = w.reduce((a, b) => a + b, 0n)
  if (total === 0n) throw new RangeError('money: weights sum to zero')
  const amount = BigInt(m.amountMinor)
  const sign = amount < 0n ? -1n : 1n
  const abs = amount * sign
  const base = w.map((x) => (abs * x) / total)
  const remainders = w.map((x, i) => ({ i, r: (abs * x) % total }))
  let left = abs - base.reduce((a, b) => a + b, 0n)
  remainders.sort((a, b) => (b.r > a.r ? 1 : b.r < a.r ? -1 : a.i - b.i))
  for (const { i } of remainders) {
    if (left === 0n) break
    base[i] = (base[i] ?? 0n) + 1n
    left -= 1n
  }
  return base.map((x) => fromBig(x * sign, m.currency))
}

/**
 * Parse a user-typed decimal ("2.500,50", "1250.5", "2 500", "-10") into minor units. `decimalSeparator` is the
 * locale's mark (tr/ru ",", en "."); the other one is grouping. QA3c1 rules, so "1250.5" never becomes 12.505:
 * - the locale's mark may appear once; groups before it are 1-3 digits, then exactly 3 digits each;
 * - the other mark alone: a single one followed by something that is not exactly 3 digits (or after a leading 0)
 *   is a decimal ("1250.5" = 1250,50 in tr; "12,5" = 12.50 in en); groups of exactly 3 digits are thousands
 *   ("1.250" = 1250 in tr; "1,250" = 1250 in en);
 * - the other mark after the locale's mark ("1,250.50" typed in tr) is an error, never a guess.
 */
export function parseMoney(input: string, currency: CurrencyCode, decimalSeparator: ',' | '.' = ','): Money {
  const digits = minorDigits(currency)
  const grouping = decimalSeparator === ',' ? '.' : ','
  const fail = (): never => {
    throw new RangeError(`money: cannot parse "${input}"`)
  }
  const cleaned = input.trim().replace(/[\s\u00a0\u202f]/g, '')
  const m = /^([+-]?)(\d[\d.,]*)$/.exec(cleaned)
  if (!m) return fail()
  const sign = m[1] ?? ''
  const body = m[2] ?? ''
  const decimalAt = body.indexOf(decimalSeparator)
  if (decimalAt !== body.lastIndexOf(decimalSeparator)) return fail()
  const isGroups = (text: string): boolean => {
    const parts = text.split(grouping)
    return (
      parts.every((p) => /^\d+$/.test(p)) &&
      parts.slice(1).every((p) => p.length === 3) &&
      (parts.length === 1 || ((parts[0] ?? '').length <= 3 && !(parts[0] ?? '').startsWith('0')))
    )
  }
  let whole: string
  let fraction = ''
  if (decimalAt >= 0) {
    const left = body.slice(0, decimalAt)
    fraction = body.slice(decimalAt + 1)
    if (!isGroups(left) || !/^\d*$/.test(fraction)) return fail()
    whole = left.split(grouping).join('')
  } else if (body.includes(grouping)) {
    const parts = body.split(grouping)
    const first = parts[0] ?? ''
    const last = parts[1] ?? ''
    if (parts.length === 2 && (last.length !== 3 || first.startsWith('0'))) {
      if (!/^\d+$/.test(first) || !/^\d+$/.test(last)) return fail()
      whole = first
      fraction = last
    } else {
      if (!isGroups(body)) return fail()
      whole = parts.join('')
    }
  } else whole = body
  if (fraction.length > digits) throw new RangeError(`money: too many decimals for ${currency}`)
  const minor = BigInt(whole) * 10n ** BigInt(digits) + BigInt(fraction.padEnd(digits, '0') || '0')
  return fromBig(sign === '-' ? -minor : minor, currency)
}

/**
 * An amount as people write it in a spreadsheet, whatever their locale (the import, faz-14 madde 4): "2.500" and
 * "2,500" are thousands when exactly three digits follow; "43.01", "2500,5" are decimals; "2.500,50" / "2,500.50"
 * take the last separator as the decimal mark. Spaces, a currency symbol and a currency word before or after are
 * ignored. The currency's own number of decimals counts (`minorDigits`: "2,5" is 250 kuruş, 3 yen cannot have
 * decimals, "1,250" dinar is thousands). Null when it is not a number, is negative or has too many decimals.
 */
export function parseAmountText(raw: string, currency: CurrencyCode): Money | null {
  const text = raw
    .replace(/[\s\u00a0\u202f]/g, '')
    .replace(/[₺€$£₽]/g, '')
    .replace(/[a-zA-ZçğıöşüÇĞİÖŞÜ]+\.?$/u, '')
    .replace(/^[a-zA-ZçğıöşüÇĞİÖŞÜ]+/u, '')
  if (!/^\d[\d.,]*$/.test(text)) return null
  const lastDot = text.lastIndexOf('.')
  const lastComma = text.lastIndexOf(',')
  let whole: string
  let fraction = ''
  if (lastDot >= 0 && lastComma >= 0) {
    const sep = lastDot > lastComma ? '.' : ','
    const at = Math.max(lastDot, lastComma)
    whole = text.slice(0, at).replace(/[.,]/g, '')
    fraction = text.slice(at + 1)
    if (fraction.includes(sep)) return null
  } else if (lastDot >= 0 || lastComma >= 0) {
    const sep = lastDot >= 0 ? '.' : ','
    const parts = text.split(sep)
    const thousands = parts.length > 1 && parts.slice(1).every((p) => p.length === 3) && parts[0]!.length <= 3
    if (thousands) whole = parts.join('')
    else if (parts.length === 2) {
      whole = parts[0]!
      fraction = parts[1]!
    } else return null
  } else whole = text
  const digits = minorDigits(currency)
  if (!/^\d+$/.test(whole) || !/^\d*$/.test(fraction) || fraction.length > digits) return null
  const minor = BigInt(whole) * 10n ** BigInt(digits) + BigInt(fraction.padEnd(digits, '0') || '0')
  if (minor > BigInt(Number.MAX_SAFE_INTEGER)) return null
  return fromBig(minor, currency)
}

/** Canonical decimal string ("2500.50"); used for display formatting and exports, never for arithmetic. */
export function toDecimalString(m: Money): string {
  const digits = minorDigits(m.currency)
  const negative = m.amountMinor < 0
  const abs = BigInt(Math.abs(m.amountMinor))
    .toString()
    .padStart(digits + 1, '0')
  const whole = digits === 0 ? abs : abs.slice(0, -digits)
  const fraction = digits === 0 ? '' : `.${abs.slice(-digits)}`
  return `${negative ? '-' : ''}${whole}${fraction}`
}
