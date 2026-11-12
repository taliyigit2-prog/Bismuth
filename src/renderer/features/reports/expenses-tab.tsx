// "Giderler" (faz-10 madde 6): the biggest expenses (staff / product groups / descriptions), the monthly trend, the
// staff cost ratio (salary, advance, leave pay, overtime, bonus paid ÷ revenue) and the sections the role may see.
import { useTranslation } from 'react-i18next'
import { ChartColumnIcon, FlameIcon, PercentIcon, ReceiptIcon, UsersIcon } from 'lucide-react'
import type { ExpensesReport } from '@shared/contract/procedures/reports'
import { basisPoints } from '@shared/domain/reports'
import type { Period } from '@shared/domain/reports-period'
import type { ChartConfig } from '@/components/ui/chart'
import { KpiCard } from '@/components/kpi-card'
import { SectionCard } from '@/components/section-card'
import { useFormat } from '@/hooks/use-format'
import { useApiQuery } from '@/lib/api/hooks'
import { ChartCard } from './chart-card'
import { DataNotes, KpiRow, Money, ReportQuery } from './common'
import { useDeltas } from './deltas'
import { groupKey, useCalendarNames, useMonthName, useReportLabels } from './labels'
import { SERIES_COLORS } from './chart-format'
import { GroupedBars, SplitChart, type SeriesPoint } from './report-charts'
import { FxSourcesCard } from './fx-sources-card'
import { ExportOnly, TopList } from './summary-tab'

function ExpensesView({ report, prev }: { report: ExpensesReport; prev?: ExpensesReport }) {
  const { t } = useTranslation()
  const f = useFormat()
  const deltas = useDeltas()
  const names = useCalendarNames()
  const monthName = useMonthName()
  const labels = useReportLabels(report.categories)
  const c = report.baseCurrency
  const hint = prev ? t('reports.kpi.vsCompare') : undefined
  const bars: SeriesPoint[] = report.months.map((m) => ({
    key: m.month,
    label: names.shortMonth(m.month),
    expenses: m.totalMinor,
    staff: m.staffMinor
  }))
  const config = {
    expenses: { label: t('reports.kpi.expenses'), color: SERIES_COLORS.expenses },
    staff: { label: t('reports.staff.cost'), color: SERIES_COLORS.staff }
  } satisfies ChartConfig
  const top = report.topExpenses.slice(0, 8)
  const rest = report.topExpenses.slice(8).reduce((s, g) => s + g.totalMinor, 0)
  const split = [
    ...top.map((g) => ({ key: groupKey(g), label: labels.expense(g, true), value: g.totalMinor })),
    ...(rest ? [{ key: 'rest', label: t('reports.expenses.rest'), value: rest }] : [])
  ]
  return (
    <div className="grid gap-4">
      <DataNotes missing={report.missingRate} partial={report.partial} />
      <KpiRow testId="expenses-kpis">
        <KpiCard
          label={t('reports.kpi.expenses')}
          value={f.money(report.totalMinor, c)}
          delta={prev ? deltas.percent(report.totalMinor, prev.totalMinor, false) : undefined}
          hint={hint}
          icon={<ReceiptIcon className="size-3.5" aria-hidden />}
        />
        <KpiCard
          label={t('reports.staff.cost')}
          value={f.money(report.staffMinor, c)}
          delta={prev ? deltas.percent(report.staffMinor, prev.staffMinor, false) : undefined}
          hint={hint}
          icon={<UsersIcon className="size-3.5" aria-hidden />}
        />
        <KpiCard
          label={t('reports.staff.ratio')}
          value={f.percent(report.laborRatioBp)}
          delta={
            prev
              ? {
                  ...deltas.points(report.laborRatioBp, prev.laborRatioBp),
                  good: report.laborRatioBp <= prev.laborRatioBp
                }
              : undefined
          }
          hint={t('reports.expenses.ratioHint')}
          icon={<PercentIcon className="size-3.5" aria-hidden />}
        />
        <KpiCard
          label={t('reports.kpi.revenue')}
          value={f.money(report.revenueMinor, c)}
          hint={t('reports.expenses.ofRevenue', {
            value: f.percent(basisPoints(Math.max(0, report.totalMinor), Math.max(1, report.revenueMinor)), 1)
          })}
          icon={<ChartColumnIcon className="size-3.5" aria-hidden />}
        />
      </KpiRow>
      <ChartCard
        title={t('reports.expenses.months')}
        icon={ChartColumnIcon}
        testId="chart-expense-months"
        exportId="months"
        empty={report.months.length ? null : t('reports.chart.empty')}
        table={{
          columns: [
            { key: 'month', label: t('reports.col.month') },
            { key: 'expenses', label: t('reports.kpi.expenses'), numeric: true },
            { key: 'staff', label: t('reports.staff.cost'), numeric: true }
          ],
          rows: report.months.map((m) => ({
            key: m.month,
            cells: {
              month: monthName(m.month),
              expenses: <Money minor={m.totalMinor} currency={c} />,
              staff: <Money minor={m.staffMinor} currency={c} />
            }
          }))
        }}
      >
        <GroupedBars data={bars} config={config} currency={c} />
      </ChartCard>
      <div className="grid items-start gap-4 lg:grid-cols-2 print:grid-cols-1">
        <ChartCard
          title={t('reports.charts.expenses')}
          icon={FlameIcon}
          testId="chart-expense-groups"
          exportId="top"
          empty={split.length ? null : t('reports.chart.empty')}
          table={{
            columns: [
              { key: 'label', label: t('reports.col.item') },
              { key: 'amount', label: t('reports.col.amount'), numeric: true },
              { key: 'share', label: t('reports.col.share'), numeric: true }
            ],
            rows: report.topExpenses.map((g) => ({
              key: groupKey(g),
              cells: {
                label: labels.expense(g),
                amount: <Money minor={g.totalMinor} currency={c} />,
                share: f.percent(basisPoints(Math.max(0, g.totalMinor), Math.max(1, report.totalMinor)), 1)
              }
            }))
          }}
        >
          <SplitChart data={split} color={SERIES_COLORS.expenses} currency={c} />
        </ChartCard>
        <SectionCard
          title={t('reports.monthly.sections')}
          icon={ReceiptIcon}
          testId="expense-sections"
          action={<ExportOnly id="sections" title={t('reports.monthly.sections')} />}
        >
          <ul className="grid gap-1.5 text-sm">
            {report.sections.map((s) => (
              <li key={s.code} className="flex justify-between gap-3">
                <span>
                  {labels.list(s) || s.code}
                  {s.ownerOnly ? (
                    <span className="text-muted-foreground ms-1.5 text-xs">
                      {t('reports.monthly.ownerOnly')}
                    </span>
                  ) : null}
                </span>
                <Money minor={s.totalMinor} currency={c} />
              </li>
            ))}
          </ul>
          <div className="mt-4">
            <TopList
              groups={report.topExpenses.slice(0, 5)}
              max={report.topExpenses[0]?.totalMinor ?? 0}
              total={report.totalMinor}
              currency={c}
              categories={report.categories}
            />
          </div>
        </SectionCard>
      </div>
      <FxSourcesCard rows={report.fxSources} currency={c} />
    </div>
  )
}

export function ExpensesTab({ period, compare }: { period: Period; compare: Period | null }) {
  const query = useApiQuery('reports.expenses', period)
  const prev = useApiQuery('reports.expenses', compare ?? period, { enabled: compare !== null })
  return (
    <ReportQuery query={query}>
      {(r) => <ExpensesView report={r} prev={compare ? prev.data : undefined} />}
    </ReportQuery>
  )
}
