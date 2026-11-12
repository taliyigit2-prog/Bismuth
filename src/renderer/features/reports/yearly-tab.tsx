// "Yıllık özet" (faz-10 madde 3; the Excel "Yıllık Özet"): month by month revenue, expenses and profit as grouped
// bars, the running total as a line, and a second year beside the first (its bars and line in the muted ink).
import { useTranslation } from 'react-i18next'
import { ChartColumnIcon, ChartLineIcon, ReceiptIcon, TrendingUpIcon, WalletIcon } from 'lucide-react'
import type { YearlyReport } from '@shared/contract/procedures/reports'
import type { LocalDate } from '@shared/date'
import { basisPoints } from '@shared/domain/reports'
import type { ChartConfig } from '@/components/ui/chart'
import { KpiCard } from '@/components/kpi-card'
import { useFormat } from '@/hooks/use-format'
import { useApiQuery } from '@/lib/api/hooks'
import { cn } from '@/lib/utils'
import { ChartCard } from './chart-card'
import { DataNotes, KpiRow, Money, ReportQuery } from './common'
import { useDeltas } from './deltas'
import { useCalendarNames } from './labels'
import { SERIES_COLORS } from './chart-format'
import { GroupedBars, LinesChart, type SeriesPoint } from './report-charts'

const total = (
  y: YearlyReport['years'][number] | undefined,
  k: 'revenueMinor' | 'expensesMinor',
  upTo: number | null = null
): number => y?.months.reduce((s, m) => s + (upTo === null || m.month <= upTo ? m[k] : 0), 0) ?? 0

function YearlyView({
  report,
  year,
  other,
  lastMonth,
  sameMonths
}: {
  report: YearlyReport
  year: number
  other: number | null
  /** Last month that has started in the chosen year (null = the whole year is past). */
  lastMonth: number | null
  /**
   * When one of the two years is this year: the change is taken over its started months only (January to this
   * month in both years), so a year still running is not compared with a whole one.
   */
  sameMonths: number | null
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const deltas = useDeltas()
  const names = useCalendarNames()
  const c = report.baseCurrency
  const a = report.years.find((y) => y.year === year)
  const b = other ? report.years.find((y) => y.year === other) : undefined
  const ra = total(a, 'revenueMinor')
  const ea = total(a, 'expensesMinor')
  // The change: the same months of both years.
  const ca = total(a, 'revenueMinor', sameMonths)
  const cea = total(a, 'expensesMinor', sameMonths)
  const rb = total(b, 'revenueMinor', sameMonths)
  const eb = total(b, 'expensesMinor', sameMonths)
  const months = a?.months ?? []
  const bars: SeriesPoint[] = months.map((m) => ({
    key: String(m.month),
    label: names.monthOfYear(m.month),
    revenue: m.revenueMinor,
    expenses: m.expensesMinor,
    profit: m.revenueMinor - m.expensesMinor
  }))
  const barConfig = {
    revenue: { label: t('reports.kpi.revenue'), color: SERIES_COLORS.revenue },
    expenses: { label: t('reports.kpi.expenses'), color: SERIES_COLORS.expenses },
    profit: { label: t('reports.kpi.profit'), color: SERIES_COLORS.profit }
  } satisfies ChartConfig
  const running = (list: readonly { revenueMinor: number }[] | undefined, upTo: number): number =>
    (list ?? []).slice(0, upTo + 1).reduce((s, m) => s + m.revenueMinor, 0)
  const cumulative: SeriesPoint[] = months.map((m, i) => ({
    key: String(m.month),
    label: names.monthOfYear(m.month),
    // The running total stops at this month: later months have not happened yet.
    current: lastMonth !== null && m.month > lastMonth ? null : running(months, i),
    ...(b ? { compare: running(b.months, i) } : {})
  }))
  const lineConfig: ChartConfig = {
    current: { label: t('reports.yearly.cumulativeOf', { year }), color: SERIES_COLORS.revenue },
    ...(b
      ? {
          compare: { label: t('reports.yearly.cumulativeOf', { year: other }), color: SERIES_COLORS.compare }
        }
      : {})
  }
  const sideBySide: SeriesPoint[] = months.map((m, i) => ({
    key: String(m.month),
    label: names.monthOfYear(m.month),
    current: m.revenueMinor,
    compare: b?.months[i]?.revenueMinor ?? 0
  }))
  const sideConfig = {
    current: { label: String(year), color: SERIES_COLORS.revenue },
    compare: { label: String(other), color: SERIES_COLORS.compare }
  } satisfies ChartConfig
  const hint = b
    ? sameMonths !== null
      ? t('reports.yearly.vsYearSameMonths', { year: other })
      : t('reports.yearly.vsYear', { year: other })
    : undefined

  return (
    <div className="grid gap-4">
      <DataNotes partial={report.partial} />
      <KpiRow testId="yearly-kpis">
        <KpiCard
          label={t('reports.kpi.revenue')}
          value={f.money(ra, c)}
          delta={b ? deltas.percent(ca, rb, true) : undefined}
          hint={hint}
          icon={<TrendingUpIcon className="size-3.5" aria-hidden />}
        />
        <KpiCard
          label={t('reports.kpi.profit')}
          value={f.money(ra - ea, c)}
          delta={b ? deltas.percent(ca - cea, rb - eb, true) : undefined}
          hint={t('reports.kpi.margin', {
            value: f.percent(basisPoints(Math.max(0, ra - ea), Math.max(1, ra)), 1)
          })}
          icon={<WalletIcon className="size-3.5" aria-hidden />}
        />
        <KpiCard
          label={t('reports.kpi.expenses')}
          value={f.money(ea, c)}
          delta={b ? deltas.percent(cea, eb, false) : undefined}
          hint={hint}
          icon={<ReceiptIcon className="size-3.5" aria-hidden />}
        />
      </KpiRow>
      <ChartCard
        title={t('reports.yearly.byMonth', { year })}
        icon={ChartColumnIcon}
        testId="chart-yearly"
        exportId="months"
        empty={ra || ea ? null : t('reports.chart.empty')}
        table={{
          columns: [
            { key: 'month', label: t('reports.col.month') },
            { key: 'revenue', label: t('reports.kpi.revenue'), numeric: true },
            { key: 'expenses', label: t('reports.kpi.expenses'), numeric: true },
            { key: 'profit', label: t('reports.kpi.profit'), numeric: true },
            ...(b
              ? [
                  {
                    key: 'other',
                    label: t('reports.yearly.revenueOf', { year: other }),
                    numeric: true,
                    minor: true
                  }
                ]
              : [])
          ],
          rows: months.map((m, i) => ({
            key: String(m.month),
            cells: {
              month: names.monthOfYear(m.month),
              revenue: <Money minor={m.revenueMinor} currency={c} />,
              expenses: <Money minor={m.expensesMinor} currency={c} />,
              profit: <Money minor={m.revenueMinor - m.expensesMinor} currency={c} strong />,
              other: <Money minor={b?.months[i]?.revenueMinor ?? 0} currency={c} />
            }
          })),
          footer: {
            month: t('common.total'),
            revenue: <Money minor={ra} currency={c} />,
            expenses: <Money minor={ea} currency={c} />,
            profit: <Money minor={ra - ea} currency={c} strong />,
            other: <Money minor={rb} currency={c} />
          }
        }}
      >
        <GroupedBars data={bars} config={barConfig} currency={c} height="h-72" />
      </ChartCard>
      <div className={cn('grid items-start gap-4 print:grid-cols-1', b && 'lg:grid-cols-2')}>
        <ChartCard
          title={t('reports.yearly.cumulative')}
          icon={ChartLineIcon}
          testId="chart-cumulative"
          empty={ra || rb ? null : t('reports.chart.empty')}
          table={{
            columns: [
              { key: 'month', label: t('reports.col.month') },
              { key: 'current', label: String(year), numeric: true },
              ...(b ? [{ key: 'compare', label: String(other), numeric: true }] : [])
            ],
            rows: cumulative.map((p) => ({
              key: p.key,
              cells: {
                month: p.label,
                current: p.current === null ? '–' : <Money minor={Number(p.current)} currency={c} />,
                compare: <Money minor={Number(p.compare ?? 0)} currency={c} />
              }
            }))
          }}
        >
          <LinesChart data={cumulative} config={lineConfig} currency={c} />
        </ChartCard>
        {b ? (
          <ChartCard
            title={t('reports.yearly.sideBySide', { a: year, b: other })}
            icon={ChartColumnIcon}
            testId="chart-two-years"
            empty={ra || rb ? null : t('reports.chart.empty')}
            table={{
              columns: [
                { key: 'month', label: t('reports.col.month') },
                { key: 'current', label: String(year), numeric: true },
                { key: 'compare', label: String(other), numeric: true }
              ],
              rows: sideBySide.map((p) => ({
                key: p.key,
                cells: {
                  month: p.label,
                  current: <Money minor={Number(p.current)} currency={c} />,
                  compare: <Money minor={Number(p.compare)} currency={c} />
                }
              }))
            }}
          >
            <GroupedBars data={sideBySide} config={sideConfig} currency={c} />
          </ChartCard>
        ) : null}
      </div>
    </div>
  )
}

export function YearlyTab({ year, other, today }: { year: number; other: number | null; today: LocalDate }) {
  const thisYear = Number(today.slice(0, 4))
  const lastMonth = thisYear === year ? Number(today.slice(5, 7)) : null
  const sameMonths = year === thisYear || other === thisYear ? Number(today.slice(5, 7)) : null
  const query = useApiQuery('reports.yearly', { years: other ? [year, other] : [year] })
  return (
    <ReportQuery query={query}>
      {(r) => (
        <YearlyView report={r} year={year} other={other} lastMonth={lastMonth} sameMonths={sameMonths} />
      )}
    </ReportQuery>
  )
}
