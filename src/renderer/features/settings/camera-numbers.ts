// Number fields of Ayarlar → Kamera (Faz 20 P20b): what a typed value may be. Pure, so it is unit-tested.

export interface NumberRule {
  min: number
  max: number
  integer: boolean
}

/** "0,45" and "0.45" both read as 0.45; anything that is not a number is NaN. */
export const parseNumber = (text: string): number => {
  const clean = text.trim().replace(',', '.')
  return clean === '' || !/^-?\d*\.?\d+$/.test(clean) ? NaN : Number(clean)
}

export const numberValid = (text: string, f: NumberRule): boolean => {
  const n = parseNumber(text)
  return Number.isFinite(n) && n >= f.min && n <= f.max && (!f.integer || Number.isInteger(n))
}
