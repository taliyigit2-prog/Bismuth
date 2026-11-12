// Tedarik giderleri (Faz 12 teslimat 2, G-170): the period's purchases with product lines by product category in
// the base currency, as bars and as a table (Kategori · Alım · Tutar · Pay). Shown with the `supplies` permission
// only (the service sends null otherwise); the caller's hidden expense sections are not counted (K-42).
import { useTranslation } from 'react-i18next'
import { PackageIcon } from 'lucide-react'
import type { MonthlyReport, SupplySpend } from '@shared/contract/procedures/reports'
import { basisPoints } from '@shared/domain/reports'
import { useFormat } from '@/hooks/use-format'
import { ChartCard } from './chart-card'
import { SERIES_COLORS } from './chart-format'
import { Money } from './common'
import { useReportLabels } from './labels'
import { SplitChart } from './report-charts'

export function SupplyCard({
  supply,
  categories,
  currency
}: {
  supply: SupplySpend
  categories: MonthlyReport['categories']
  currency: string
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const labels = useReportLabels(categories)
  const rows = supply.categories.map((c) => ({
    key: c.categoryId,
    label: labels.expense({ kind: 'category', categoryId: c.categoryId, totalMinor: c.totalMinor }),
    value: c.totalMinor,
    purchases: c.purchases
  }))
  const share = (v: number): string =>
    f.percent(basisPoints(Math.max(0, v), Math.max(1, supply.totalMinor)), 1)
  return (
    <ChartCard
      title={t('reports.supply.title')}
      icon={PackageIcon}
      testId="supply-costs"
      exportId="supply"
      empty={rows.length ? null : t('reports.supply.empty')}
      note={
        <div className="grid gap-0.5">
          <p>{t('reports.supply.note', { count: supply.purchases })}</p>
          {supply.missingRate ? (
            <p className="text-warning">{t('reports.supply.missing', { count: supply.missingRate })}</p>
          ) : null}
        </div>
      }
      table={{
        columns: [
          { key: 'label', label: t('reports.col.category') },
          { key: 'purchases', label: t('reports.col.purchases'), numeric: true, minor: true },
          { key: 'amount', label: t('reports.col.amount'), numeric: true },
          { key: 'share', label: t('reports.col.share'), numeric: true }
        ],
        rows: rows.map((r) => ({
          key: r.key,
          cells: {
            label: r.label,
            purchases: f.number(r.purchases),
            amount: <Money minor={r.value} currency={currency} />,
            share: share(r.value)
          }
        })),
        footer: {
          label: t('common.total'),
          purchases: f.number(supply.purchases),
          amount: <Money minor={supply.totalMinor} currency={currency} strong />,
          share: ''
        }
      }}
    >
      <SplitChart data={rows} color={SERIES_COLORS.expenses} currency={currency} />
    </ChartCard>
  )
}
