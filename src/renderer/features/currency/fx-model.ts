// Rate helpers for the Döviz screen (G-110…G-112, K-06): integer rates (base units per unit × 1 000 000), conversion
// with the shared fx rule (exact rational, half away from zero), change against yesterday in basis points, the
// converter's rounding. Money is never a float here; plain numbers only for display.
import type { FxOverview, FxRateView } from '@shared/contract/external'
import { convert, RATE_SCALE } from '@shared/domain/fx'
import { basisPoints } from '@shared/domain/reports'
import { formatMoney, type AppLocale } from '@shared/format'
import { minorDigits, money, roundToUnit } from '@shared/money'

export const ROUNDINGS = ['minor', 'unit', 'ten'] as const
export type Rounding = (typeof ROUNDINGS)[number]

/** The rate the hotel tells a guest: its own rate when one is set and "misafire bu kurdan söyle" is on. */
export const effectiveMicro = (r: FxRateView, quoteHotel: boolean): number | null =>
  (quoteHotel ? r.hotelMicro : null) ?? r.marketMicro

/** Base units per one unit × RATE_SCALE for every currency the screen knows (the base itself is 1). */
export function rateTable(
  o: Pick<FxOverview, 'base' | 'rates'>,
  quoteHotel: boolean
): Record<string, number> {
  const table: Record<string, number> = { [o.base]: RATE_SCALE }
  for (const r of o.rates) {
    const micro = effectiveMicro(r, quoteHotel)
    if (micro) table[r.currency] = micro
  }
  return table
}

/** amount in `from` → `to` through the base currency, integer minor units; null when a rate is missing. */
export function convertMinor(
  amountMinor: number,
  from: string,
  to: string,
  table: Record<string, number>
): number | null {
  if (from === to) return amountMinor
  const a = table[from]
  const b = table[to]
  if (!a || !b) return null
  return convert(money(amountMinor, from), to, BigInt(a), BigInt(b)).amountMinor
}

/**
 * The converter's answer rounded for saying it out loud: whole units or tens (half away from zero). Records keep
 * minor units whatever this says.
 */
export function roundMinor(amountMinor: number, currency: string, rounding: Rounding): number {
  if (rounding === 'minor') return amountMinor
  const unit = 10 ** minorDigits(currency) * (rounding === 'ten' ? 10 : 1)
  return roundToUnit(money(amountMinor, currency), unit).amountMinor
}

/** A converted amount as said to a guest: kuruş shown only when nothing is rounded away. */
export const quoteText = (
  amountMinor: number,
  currency: string,
  rounding: Rounding,
  locale: AppLocale
): string =>
  formatMoney(money(roundMinor(amountMinor, currency, rounding), currency), locale, {
    showMinor: rounding === 'minor'
  })

/** Change of the market rate against yesterday's close, basis points (+12 = +0,12 %); null without both. */
export function dayChange(r: FxRateView): number | null {
  const now = r.marketMicro
  const before = r.previousMicro
  if (!now || !before) return null
  return Math.sign(now - before) * basisPoints(Math.abs(now - before), before)
}

/** A rate as a plain number for display only (never for money arithmetic). */
export const rateNumber = (micro: number): number => micro / RATE_SCALE

/** Whole hours between two instants (staleness badge). */
export const hoursBetween = (from: string, to: string): number =>
  Math.max(0, Math.floor((Date.parse(to) - Date.parse(from)) / 3_600_000))

/** "49,25" → 49 250 000 micro (decimal text, never a float); null when not a positive number. */
export function parseRateMicro(text: string, locale: 'tr' | 'en' | 'ru'): number | null {
  const sep = locale === 'en' ? '.' : ','
  const grouping = locale === 'en' ? ',' : '.'
  const cleaned = text.trim().replace(/\s/g, '').split(grouping).join('')
  const m = new RegExp(`^(\\d{1,6})(?:\\${sep}(\\d{1,6}))?$`).exec(cleaned)
  if (!m) return null
  const micro = Number(m[1]) * RATE_SCALE + Number((m[2] ?? '').padEnd(6, '0'))
  return micro > 0 ? micro : null
}
