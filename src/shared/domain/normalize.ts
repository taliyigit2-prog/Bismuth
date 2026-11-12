// Normalised keys for matching and grouping (03-mimari.md §6.9; G-51, G-52, G-66, K-35): guest duplicates and
// blacklist hits by name/phone, expense description autocomplete and "en çok harcama" grouping.

const FOLD: Record<string, string> = {
  ç: 'c',
  ğ: 'g',
  ı: 'i',
  i: 'i',
  ö: 'o',
  ş: 's',
  ü: 'u',
  â: 'a',
  î: 'i',
  û: 'u'
}

/** "  GADİR  Garibov " → "gadir garibov"; Turkish lower-casing, diacritics and punctuation folded. */
export function normalizeName(raw: string): string {
  return raw
    .toLocaleLowerCase('tr-TR')
    .replace(/[çğıiöşüâîû]/g, (c) => FOLD[c] ?? c)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Expense description key: same folding as names ("Deniz maaş" = "deniz maas"). */
export const descriptionKey = normalizeName

/**
 * Digits-only international form. Turkish local forms become 90…: "0532 123 45 67" and "532 123 45 67" →
 * "905321234567"; "+44 20 7946 0958" / "0044 20…" → "442079460958". Empty → "".
 */
export function normalizePhone(raw: string): string {
  const trimmed = raw.trim()
  let digits = trimmed.replace(/\D/g, '')
  if (!digits) return ''
  if (trimmed.startsWith('+')) return digits
  if (digits.startsWith('00')) return digits.slice(2)
  if (digits.length === 11 && digits.startsWith('0')) digits = `90${digits.slice(1)}`
  else if (digits.length === 10 && digits.startsWith('5')) digits = `90${digits}`
  return digits
}

/** ID document numbers: upper case, letters and digits only ("u 123-456" → "U123456"). */
export function normalizeDocNumber(raw: string): string {
  return raw.toLocaleUpperCase('tr-TR').replace(/[^\p{L}\p{N}]/gu, '')
}

/**
 * The digit strings a typed phone search looks for in a normalised phone (QA3c1 #7): the digits as typed when there
 * are at least 4 ("0001" and "00 01" find the number ending 0001) and, because "0532 12" must find "90532 12…", the
 * digits without leading zeros when there are at least `minStripped`. Guest list and calendar search share it.
 */
export function phoneNeedles(raw: string, minStripped = 3): string[] {
  const digits = raw.replace(/\D/g, '')
  const stripped = digits.replace(/^0+/, '')
  const out: string[] = []
  if (digits.length >= 4) out.push(digits)
  if (stripped.length >= minStripped && !out.includes(stripped)) out.push(stripped)
  return out
}

const MASK_CHAR = '•'

/** Masked display of an identity number: keeps the first 2 and last 3 characters. */
export function maskDocNumber(raw: string): string {
  if (raw.includes(MASK_CHAR)) return raw // already masked (e.g. an audit row): masking twice would lose it
  const v = normalizeDocNumber(raw)
  if (v.length <= 5) return MASK_CHAR.repeat(v.length)
  return `${v.slice(0, 2)}${MASK_CHAR.repeat(v.length - 5)}${v.slice(-3)}`
}
