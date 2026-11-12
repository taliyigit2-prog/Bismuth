// Display helpers bound to the UI language and the amount setting (ui.showMinor, G-17): every screen formats
// money, dates and seeded names the same way (src/shared/format.ts, Latin digits).
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { LocalDate } from '@shared/date'
import {
  LOCALE_TAG,
  collator,
  formatDate,
  formatMoney,
  formatNumber,
  isAppLocale,
  weekdayName,
  type AppLocale,
  type DateStyle
} from '@shared/format'
import { money } from '@shared/money'
import { useSettings } from '@/lib/api/hooks'

interface LocalizedText {
  tr: string
  en: string
  ru: string
}

export function useFormat() {
  const { i18n } = useTranslation()
  const settings = useSettings()
  const locale: AppLocale = isAppLocale(i18n.language) ? i18n.language : 'tr'
  const showMinor = settings.data?.['ui.showMinor'] ?? false
  return useMemo(() => {
    const time = new Intl.DateTimeFormat(LOCALE_TAG[locale], {
      hour: '2-digit',
      minute: '2-digit',
      numberingSystem: 'latn'
    })
    const dayMonth = new Intl.DateTimeFormat(LOCALE_TAG[locale], {
      day: 'numeric',
      month: 'short',
      numberingSystem: 'latn'
    })
    const monthYear = new Intl.DateTimeFormat(LOCALE_TAG[locale], {
      month: 'short',
      year: 'numeric',
      numberingSystem: 'latn'
    })
    const sorter = collator(locale)
    return {
      locale,
      /** Integer minor units → "₺2.800" (kuruş only when the hotel turned them on). */
      money: (amountMinor: number, currency = 'TRY'): string =>
        formatMoney(money(amountMinor, currency), locale, { showMinor }),
      number: (value: number, digits = 0): string => formatNumber(value, locale, digits),
      date: (d: LocalDate, style: DateStyle = 'medium'): string => formatDate(d, locale, style),
      /** "4 Eki" */
      dayMonth: (d: LocalDate): string => dayMonth.format(new Date(`${d}T12:00:00`)),
      weekday: (d: LocalDate, width: 'long' | 'short' = 'short'): string => weekdayName(d, locale, width),
      /** "Eki 2026" */
      monthYear: (d: LocalDate): string => monthYear.format(new Date(`${d}T12:00:00`)),
      /** ISO instant → local "14:05". */
      time: (iso: string): string => time.format(new Date(iso)),
      /** Seeded names carry the three languages; the hotel's own names are plain strings. */
      name: (text: LocalizedText | string): string => (typeof text === 'string' ? text : text[locale]),
      /** Basis points → "73,7 %". */
      percent: (basisPoints: number, digits = 1): string =>
        new Intl.NumberFormat(LOCALE_TAG[locale], {
          style: 'percent',
          minimumFractionDigits: digits,
          maximumFractionDigits: digits,
          numberingSystem: 'latn'
        }).format(basisPoints / 10_000),
      compare: (a: string, b: string): number => sorter.compare(a, b)
    }
  }, [locale, showMinor])
}

export type Format = ReturnType<typeof useFormat>
