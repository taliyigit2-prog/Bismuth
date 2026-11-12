// Kur kaynakları (Faz 11 teslimat 5): where the frozen rates of the period's foreign-currency rows came from — a
// short summary (how many rows with the market rate of which provider, the hotel rate, a typed rate, no rate) and
// the detail per record kind × currency × source. Rows of expense sections the caller may not see are not counted
// (the service filters them, K-42). Nothing in another currency → no card.
import { useTranslation } from 'react-i18next'
import { ArrowLeftRightIcon } from 'lucide-react'
import type { FxSourceRow } from '@shared/contract/procedures/reports'
import { SectionCard } from '@/components/section-card'
import { useFormat } from '@/hooks/use-format'
import { DataTable, type ChartTable } from './chart-card'
import { Money } from './common'
import { sourceTotals, useFxSourceLabel } from './fx-sources'
import { usePrintMode } from './print-mode'
import { TableExportMenu } from './report-export'

export function FxSourcesCard({ rows, currency }: { rows: readonly FxSourceRow[]; currency: string }) {
  const { t } = useTranslation()
  const f = useFormat()
  const label = useFxSourceLabel()
  const print = usePrintMode()
  if (!rows.length) return null
  const total = rows.reduce((s, r) => s + r.rows, 0)
  const bothKinds = new Set(rows.map((r) => r.kind)).size > 1
  const table: ChartTable = {
    columns: [
      // On the phone three columns: the record kind goes under the source, the amount shows its currency.
      ...(bothKinds ? [{ key: 'kind', label: t('reports.col.record'), minor: true }] : []),
      { key: 'currency', label: t('reports.col.currency'), minor: true },
      { key: 'source', label: t('reports.col.fxSource') },
      { key: 'rows', label: t('reports.col.records'), numeric: true },
      { key: 'amount', label: t('reports.col.original'), numeric: true, minor: true },
      { key: 'base', label: t('reports.col.baseOf', { currency }), numeric: true }
    ],
    rows: rows.map((r) => ({
      key: `${r.kind}|${r.currency}|${r.source}|${r.provider ?? ''}`,
      cells: {
        kind: t(`reports.fx.kind.${r.kind}`),
        currency: r.currency,
        source: (
          <span className="grid">
            <span className={r.source === 'none' ? 'text-destructive' : undefined}>{label(r)}</span>
            <span className="text-muted-foreground text-xs md:hidden print:hidden">
              {bothKinds
                ? t('reports.fx.kindCurrency', { kind: t(`reports.fx.kind.${r.kind}`), currency: r.currency })
                : r.currency}
            </span>
          </span>
        ),
        rows: f.number(r.rows),
        amount: <Money minor={r.amountMinor} currency={r.currency} />,
        base:
          r.source === 'none' ? (
            <span className="text-muted-foreground">–</span>
          ) : (
            <Money minor={r.baseMinor} currency={currency} />
          )
      }
    }))
  }
  return (
    <SectionCard
      title={t('reports.fx.title')}
      icon={ArrowLeftRightIcon}
      testId="fx-sources"
      className="break-inside-avoid"
      action={print ? null : <TableExportMenu table="fxSources" label={t('reports.fx.title')} />}
    >
      <div className="grid gap-3">
        <p className="text-muted-foreground text-xs" data-testid="fx-sources-note">
          {t('reports.fx.summary', { count: total })}
        </p>
        <ul className="flex flex-wrap gap-2 text-sm" data-testid="fx-sources-summary">
          {sourceTotals(rows).map((s) => (
            <li
              key={s.key}
              className={
                s.row.source === 'none'
                  ? 'border-destructive/40 text-destructive rounded-md border px-2 py-1'
                  : 'bg-muted rounded-md px-2 py-1'
              }
            >
              <span className="font-medium">{label(s.row)}</span>
              <span className="text-muted-foreground ms-1.5 tabular-nums">
                {t('reports.fx.rows', { count: s.rows })}
              </span>
            </li>
          ))}
        </ul>
        <DataTable table={table} />
      </div>
    </SectionCard>
  )
}
