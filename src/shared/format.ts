// Display formatting for the three UI languages. Latin digits everywhere (numberingSystem: 'latn'),
// amounts as integers unless the user turned on kuruş display (ui.showMinor, G-17). With it off only ",00" is
// hidden: an amount with kuruş (1.000,50, a unit price of 12,75) is always shown with them, never rounded (K-46).
import { minorDigits, toDecimalString, type Money } from './money'
import { toDisplayDate, type LocalDate } from './date'

export const APP_LOCALES = ['tr', 'en', 'ru'] as const
export type AppLocale = (typeof APP_LOCALES)[number]

export const LOCALE_TAG: Readonly<Record<AppLocale, string>> = { tr: 'tr-TR', en: 'en-GB', ru: 'ru-RU' }

export function formatMoney(m: Money, locale: AppLocale, opts: { showMinor?: boolean } = {}): string {
  const hasMinor = /\.\d*[1-9]/.test(toDecimalString(m))
  const digits = opts.showMinor || hasMinor ? minorDigits(m.currency) : 0
  const formatter = new Intl.NumberFormat(LOCALE_TAG[locale], {
    style: 'currency',
    currency: m.currency,
    currencyDisplay: 'narrowSymbol',
    numberingSystem: 'latn',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  })
  // Intl accepts decimal strings exactly, so no float conversion of the amount happens here.
  return formatter.format(toDecimalString(m) as Intl.StringNumericLiteral)
}

export function formatNumber(value: number, locale: AppLocale, fractionDigits = 0): string {
  return new Intl.NumberFormat(LOCALE_TAG[locale], {
    numberingSystem: 'latn',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits
  }).format(value)
}

export type DateStyle = 'short' | 'medium' | 'long' | 'full'

export function formatDate(d: LocalDate, locale: AppLocale, style: DateStyle = 'long'): string {
  return new Intl.DateTimeFormat(LOCALE_TAG[locale], { dateStyle: style, numberingSystem: 'latn' }).format(
    toDisplayDate(d)
  )
}

export function weekdayName(d: LocalDate, locale: AppLocale, width: 'long' | 'short' = 'long'): string {
  return new Intl.DateTimeFormat(LOCALE_TAG[locale], { weekday: width }).format(toDisplayDate(d))
}

export function collator(locale: AppLocale): Intl.Collator {
  return new Intl.Collator(LOCALE_TAG[locale], { sensitivity: 'base', numeric: true })
}

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === 'string' && (APP_LOCALES as readonly string[]).includes(value)
}
