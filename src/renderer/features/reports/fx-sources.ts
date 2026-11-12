// Labels and totals of the "Kur kaynakları" card (fx-sources-card.tsx): a rate source with its market provider's
// name, and the rows per source over every kind and currency.
import { useTranslation } from 'react-i18next'
import type { FxSourceRow } from '@shared/contract/procedures/reports'
import { FX_PROVIDER_NAMES } from '@shared/domain/external'

export const providerName = (provider: string | null): string | null =>
  provider ? (FX_PROVIDER_NAMES[provider as keyof typeof FX_PROVIDER_NAMES] ?? provider) : null

export function useFxSourceLabel() {
  const { t } = useTranslation()
  return (r: Pick<FxSourceRow, 'source' | 'provider'>): string => {
    const source = t(`reports.fx.source.${r.source}`)
    const provider = providerName(r.provider)
    return provider ? t('reports.fx.withProvider', { source, provider }) : source
  }
}

/** Rows per source (and provider) over every kind and currency, most rows first. */
export function sourceTotals(
  rows: readonly FxSourceRow[]
): { key: string; row: FxSourceRow; rows: number }[] {
  const map = new Map<string, { key: string; row: FxSourceRow; rows: number }>()
  for (const r of rows) {
    const key = `${r.source}|${r.provider ?? ''}`
    const m = map.get(key)
    if (m) m.rows += r.rows
    else map.set(key, { key, row: r, rows: r.rows })
  }
  return [...map.values()].sort((a, b) => b.rows - a.rows)
}
