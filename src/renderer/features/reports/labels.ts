// Display names of report groups: list rows (channels, methods, sections, categories, room types), "En çok
// harcama" groups (topExpenses), months and weekdays in the screen's language.
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { ListName } from '@shared/contract/procedures/reports'
import type { TopGroup } from '@shared/domain/reports'
import { LOCALE_TAG } from '@shared/format'
import { useFormat } from '@/hooks/use-format'

type Named = ListName & { id: string }

export function useReportLabels(categories: readonly Named[] = []) {
  const { t } = useTranslation()
  const f = useFormat()
  const list = (n: ListName): string => n.nameI18n?.[f.locale] ?? n.nameI18n?.tr ?? n.name ?? ''
  return {
    list,
    channel: (n: ListName & { code: string }): string =>
      n.code === 'none' ? t('reports.channel.none') : list(n) || n.code,
    expense: (g: TopGroup, short = false): string => {
      if (g.kind === 'staff')
        return t(short ? 'reports.expenseGroup.staffShort' : 'reports.expenseGroup.staff')
      if (g.kind === 'laundry') return t('reports.expenseGroup.laundry')
      if (g.kind === 'category') {
        const c = categories.find((x) => x.id === g.categoryId)
        return c ? list(c) : g.categoryId
      }
      return g.label
    },
    /** Kind of an expense group, shown next to its name. */
    expenseKind: (g: TopGroup): string => t(`reports.expenseKind.${g.kind}`)
  }
}

export const groupKey = (g: TopGroup): string =>
  g.kind === 'category' ? `c:${g.categoryId}` : g.kind === 'description' ? `d:${g.key}` : g.kind

/**
 * "2026-09" → "Eylül 2026" (long month; the shared f.monthYear is the short form). `capital` = first letter
 * upper case for pickers; inside a sentence pass false (Russian months are lower case there).
 */
export function useMonthName() {
  const f = useFormat()
  return useMemo(() => {
    const fmt = new Intl.DateTimeFormat(LOCALE_TAG[f.locale], {
      month: 'long',
      year: 'numeric',
      numberingSystem: 'latn'
    })
    return (month: string, capital = true): string => {
      const text = fmt.format(new Date(`${month}-15T12:00:00`))
      return capital ? text.charAt(0).toLocaleUpperCase(LOCALE_TAG[f.locale]) + text.slice(1) : text
    }
  }, [f.locale])
}

/** "Eyl 26" for chart axes; weekday names (0 = Sunday) short and long. */
export function useCalendarNames() {
  const f = useFormat()
  return useMemo(() => {
    const tag = LOCALE_TAG[f.locale]
    const month = new Intl.DateTimeFormat(tag, { month: 'short', year: '2-digit', numberingSystem: 'latn' })
    const monthOnly = new Intl.DateTimeFormat(tag, { month: 'short' })
    const short = new Intl.DateTimeFormat(tag, { weekday: 'short', timeZone: 'UTC' })
    const long = new Intl.DateTimeFormat(tag, { weekday: 'long', timeZone: 'UTC' })
    const day = (wd: number) => new Date(Date.UTC(2023, 0, 1 + wd))
    return {
      shortMonth: (ym: string): string => month.format(new Date(`${ym}-15T12:00:00`)),
      /** "Oca" for month 1 (yearly charts: the year is in the legend). */
      monthOfYear: (m: number): string => monthOnly.format(new Date(2023, m - 1, 15, 12)),
      weekdayShort: (wd: number): string => short.format(day(wd)),
      weekdayLong: (wd: number): string => long.format(day(wd))
    }
  }, [f.locale])
}
