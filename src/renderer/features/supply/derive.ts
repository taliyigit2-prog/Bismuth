// Supply screen helpers (G-170, G-71, §6.13): quantities are kept in thousandths of the unit (1,5 kg = 1500, like
// expense_items.qty_milli); line amounts and the unit price behind a typed amount go through the money module.
import { yearMonthOf } from '@shared/domain/local-datetime'
import type { LocalDate } from '@shared/date'
import { money, multiplyRatio } from '@shared/money'
import type { PRODUCT_UNITS } from '@shared/contract/supply'

export type ProductUnit = (typeof PRODUCT_UNITS)[number]

export const QTY_SCALE = 1000

/** Line amount = unit price × qty (milli), as the expenses service computes it. */
export const lineAmount = (unitMinor: number, qtyMilli: number, currency: string): number =>
  multiplyRatio(money(unitMinor, currency), qtyMilli, QTY_SCALE).amountMinor

/** The unit price behind a line amount typed by hand (2.400 for 40 → 60); rounded to the currency's minor unit. */
export const unitFromAmount = (amountMinor: number, qtyMilli: number, currency: string): number =>
  multiplyRatio(money(amountMinor, currency), QTY_SCALE, qtyMilli).amountMinor

/** The amount in `currency` of a per-currency list (normally only the hotel's own currency). */
export const totalIn = (
  list: readonly { amountMinor: number; currency: string }[],
  currency: string
): number => list.find((x) => x.currency === currency)?.amountMinor ?? 0

/** "1,5" → 1500 (thousandths of the unit); null when empty or not a positive number. */
export function parseQty(text: string, locale: 'tr' | 'en' | 'ru'): number | null {
  const trimmed = text.trim().replace(/\s/g, '')
  if (!trimmed) return null
  // The locale's own decimal mark wins; the other mark is a thousands separator, unless it stands alone and is not
  // followed by exactly three digits ("1.5" in Turkish is one and a half, as in parseMoney).
  const [decimal, group] = locale === 'en' ? ['.', ','] : [',', '.']
  const lone =
    !trimmed.includes(decimal) && trimmed.split(group).length === 2 && !/^\d+[.,]\d{3}$/.test(trimmed)
  const normalized = lone ? trimmed.replace(group, '.') : trimmed.split(group).join('').replace(decimal, '.')
  if (!/^\d+(\.\d{1,3})?$/.test(normalized)) return null
  const [whole = '0', fraction = ''] = normalized.split('.')
  const milli = Number(whole) * QTY_SCALE + Number(fraction.padEnd(3, '0'))
  return milli > 0 && Number.isSafeInteger(milli) ? milli : null
}

export interface YearMonth {
  year: number
  month: number
}

export const monthOfDay = (d: LocalDate): YearMonth => yearMonthOf(d)

export const shiftMonth = ({ year, month }: YearMonth, by: number): YearMonth => {
  const index = year * 12 + (month - 1) + by
  return { year: Math.floor(index / 12), month: (index % 12) + 1 }
}

/** First day of the month, for labels ("Eki 2026"). */
export const monthStart = ({ year, month }: YearMonth): LocalDate =>
  `${year}-${String(month).padStart(2, '0')}-01` as LocalDate
