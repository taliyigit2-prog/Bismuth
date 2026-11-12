// Checks for the identifiers a company card holds (QA3c1 #15): IBAN check digits (ISO 7064 mod 97-10) and the Turkish
// tax number (10 digits for a company, VKN; 11 digits for a person, T.C. kimlik no, with its own check digits).
// Pure functions; no number is ever stored in the repository from here.

/** IBAN without spaces, upper case; true when the shape is right and the check digits are (mod 97 = 1). */
export function isValidIban(raw: string): boolean {
  const iban = raw.replace(/\s+/g, '').toUpperCase()
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return false
  const moved = iban.slice(4) + iban.slice(0, 4)
  let remainder = 0
  for (const ch of moved) {
    const value = ch >= 'A' ? String(ch.charCodeAt(0) - 55) : ch
    for (const digit of value) remainder = (remainder * 10 + Number(digit)) % 97
  }
  return remainder === 1
}

/** T.C. kimlik no: 11 digits, first not 0; the 10th and 11th digits follow from the others. */
export function isValidTckn(raw: string): boolean {
  if (!/^[1-9]\d{10}$/.test(raw)) return false
  const d = [...raw].map(Number)
  const odd = d[0]! + d[2]! + d[4]! + d[6]! + d[8]!
  const even = d[1]! + d[3]! + d[5]! + d[7]!
  const tenth = (((odd * 7 - even) % 10) + 10) % 10
  const eleventh = d.slice(0, 10).reduce((a, b) => a + b, 0) % 10
  return d[9] === tenth && d[10] === eleventh
}

/** Tax number as written on a card: 10 digits (VKN) or an 11-digit T.C. kimlik no that passes its check digits. */
export function isValidTurkishTaxNumber(raw: string): boolean {
  const digits = raw.replace(/[\s.-]/g, '')
  if (/^\d{10}$/.test(digits)) return true
  return isValidTckn(digits)
}

/** Tax number with spaces, dots and dashes taken out ("123 456 78 90" → "1234567890"). */
export const compactTaxNumber = (raw: string): string => raw.replace(/[\s.-]/g, '')
