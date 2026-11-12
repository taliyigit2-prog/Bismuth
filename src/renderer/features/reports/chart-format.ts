// Chart colours by entity and the axis money format (report-charts.tsx): revenue --chart-1, expenses --chart-4,
// profit --chart-2, a comparison period the muted ink (never a second hue).
import { useMemo } from 'react'
import { LOCALE_TAG } from '@shared/format'
import { money, toDecimalString } from '@shared/money'
import { useFormat } from '@/hooks/use-format'

export const SERIES_COLORS = {
  revenue: 'var(--chart-1)',
  expenses: 'var(--chart-4)',
  profit: 'var(--chart-2)',
  staff: 'var(--chart-2)',
  occupancy: 'var(--chart-1)',
  compare: 'var(--muted-foreground)'
} as const

/** Axis amounts in words ("500 bin", "2 milyon"): "500 B" / "2 Mn" read as anything. */
export function useAxisMoney(currency: string) {
  const f = useFormat()
  return useMemo(() => {
    const compact = new Intl.NumberFormat(LOCALE_TAG[f.locale], {
      notation: 'compact',
      compactDisplay: 'long',
      maximumFractionDigits: 1,
      numberingSystem: 'latn'
    })
    return (minor: number): string =>
      compact.format(Number(toDecimalString(money(Math.round(minor), currency))))
  }, [f.locale, currency])
}
