// One reading of a typed or pasted phone number (G-52 blacklist match by phone, guest and company cards).
// The field holds a country code and the national digits; whatever people paste ("+90 532 123 45 67",
// "0090 532…", "0532 123 45 67", "905321234567", "(0532) 123-45-67") is split into those two, so a code is never
// glued to the front of the number twice (H-05).

/** Country codes the phone field offers. */
export const DIAL_CODES = ['90', '7', '49', '44', '1', '33', '31', '98', '966', '994', '380', '971'] as const

/** National digits kept in a field (E.164 allows 15 digits in all). */
export const PHONE_MAX_DIGITS = 14
/** Digits a phone text has at least / at most (code included) to be taken as a number. */
export const PHONE_MIN_TOTAL_DIGITS = 6
export const PHONE_MAX_TOTAL_DIGITS = 17

/** Digits of a whole international number (E.164: 15 at most, the country code included). */
export const PHONE_MAX_INTL_DIGITS = 15

/**
 * `code` is one of DIAL_CODES, or '' for an international number whose country code is not on that list ("+86 …"):
 * then `number` holds all the digits, code included, and the text is kept as written ("+" + digits).
 */
export interface PhoneParts {
  code: string
  number: string
}

const byLength = [...DIAL_CODES].sort((a, b) => b.length - a.length)

/**
 * Splits typed or pasted text into a country code and national digits. `fallbackCode` is the code the field shows;
 * it is kept when the text carries no code of its own. Rules, in order:
 *  - "+" or "00" in front: the digits start with the code (a known one is cut off; an unknown one — "+86 …" — leaves
 *    code '' and the whole number, so it is kept as written);
 *  - a Turkish number written with its code but no plus ("90532…", 12 digits): the 90 is the code;
 *  - a leading trunk 0 is dropped ("0532…" → "532…").
 */
export function splitPhoneInput(raw: string | null | undefined, fallbackCode = '90'): PhoneParts {
  const text = (raw ?? '').trim()
  let digits = text.replace(/\D/g, '')
  if (!digits) return { code: fallbackCode, number: '' }
  const international = text.startsWith('+') || digits.startsWith('00')
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (international) {
    const code = byLength.find((c) => digits.startsWith(c))
    if (code) {
      let number = digits.slice(code.length).replace(/^0+/, '')
      // An older bad save glued the code on twice ("+90 905 320 00 00 00"): the second 90 goes.
      if (code === '90' && number.startsWith('90') && number.length === 12) number = number.slice(2)
      return { code, number: number.slice(0, PHONE_MAX_DIGITS) }
    }
    // A country code the field does not list: the number stays as typed, never put under another country's code.
    return { code: '', number: digits.slice(0, PHONE_MAX_INTL_DIGITS) }
  }
  // Written with the Turkish code and no plus: "905321234567" in a +90 field.
  if (fallbackCode === '90' && digits.startsWith('90') && digits.length >= 12)
    return { code: '90', number: digits.slice(2).replace(/^0+/, '').slice(0, PHONE_MAX_DIGITS) }
  return { code: fallbackCode, number: digits.replace(/^0+/, '').slice(0, PHONE_MAX_DIGITS) }
}

/** Digits in a phone text, code included. */
export const phoneDigitCount = (text: string): number => text.replace(/\D/g, '').length

/** A phone text a form may keep: digits with spaces and ( ) - . / + only, 6 to 17 digits. Empty is fine. */
export function isPlausiblePhone(text: string | null | undefined): boolean {
  const t = (text ?? '').trim()
  if (!t) return true
  if (!/^[+\d\s().\-/]+$/.test(t)) return false
  const n = phoneDigitCount(t)
  return n >= PHONE_MIN_TOTAL_DIGITS && n <= PHONE_MAX_TOTAL_DIGITS
}
