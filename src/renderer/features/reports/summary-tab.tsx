// "Özet" — the Excel "Eylül Özet" (faz-10 madde 2b): revenue, profit, expenses and occupancy against the comparison
// period (S-40 order), the income detail (method × currency + base currency), sales channels (part of the revenue,
// never added again), the daily revenue line (a day opens its detail and the ledger day), the official and the
// owner's expenses (by permission) and the biggest expenses.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import {
  ArrowRightIcon,
  BedDoubleIcon,
  ChartLineIcon,
  FlameIcon,
  LandmarkIcon,
  ReceiptIcon,
  StoreIcon,
  TrendingUpIcon,
  WalletIcon,
  XIcon
} from 'lucide-react'
import type { MonthlyReport, ReportSummary } from '@shared/contract/procedures/reports'
import { addDays, diffDays, type LocalDate } from '@shared/date'
import { methodGroupRank, type MethodGroup } from '@shared/domain/cash'
import { basisPoints } from '@shared/domain/reports'
import type { Period } from '@shared/domain/reports-period'
import { Button } from '@/components/ui/button'
import type { ChartConfig } from '@/components/ui/chart'
import { KpiCard } from '@/components/kpi-card'
import { SectionCard } from '@/components/section-card'
import { useFormat } from '@/hooks/use-format'
import { useApiQuery } from '@/lib/api/hooks'
import { useCan } from '@/lib/view-as'
import { cn } from '@/lib/utils'
import { ChartCard, DataTable, type ChartTable } from './chart-card'
import { DataNotes, KpiRow, Money, ReportQuery } from './common'
import { FxSourcesCard } from './fx-sources-card'
import { useDeltas } from './deltas'
import { groupKey, useCalendarNames, useReportLabels } from './labels'
import { SERIES_COLORS } from './chart-format'
import { LinesChart, SplitChart, type SeriesPoint } from './report-charts'
import { TableExportMenu } from './report-export'
import { usePrintMode } from './print-mode'
import { SupplyCard } from './supply-card'
import { useSummaryKpis } from './use-summary'

/** Up to this many days the revenue line shows days; a longer period shows months. */
const DAILY_MAX = 93

/** The four KPI cards in the owner's order (S-40): revenue, profit, expenses, occupancy. */
export function SummaryKpis({ data, prev }: { data: ReportSummary; prev?: ReportSummary }) {
  const { t } = useTranslation()
  const f = useFormat()
  const deltas = useDeltas()
  const c = data.baseCurrency
  const fin = data.finance
  const pf = prev?.finance
  const hint = prev ? t('reports.kpi.vsCompare') : undefined
  return (
    <KpiRow testId="report-kpis">
      {fin ? (
        <>
          <KpiCard
            label={t('reports.kpi.revenue')}
            value={f.money(fin.revenueMinor, c)}
            delta={pf ? deltas.percent(fin.revenueMinor, pf.revenueMinor, true) : undefined}
            hint={hint}
            icon={<TrendingUpIcon className="size-3.5" aria-hidden />}
          />
          <KpiCard
            label={t('reports.kpi.profit')}
            value={f.money(fin.profitMinor, c)}
            delta={pf ? deltas.percent(fin.profitMinor, pf.profitMinor, true) : undefined}
            hint={t('reports.kpi.margin', {
              value: f.percent(basisPoints(Math.max(0, fin.profitMinor), Math.max(1, fin.revenueMinor)), 1)
            })}
            icon={<WalletIcon className="size-3.5" aria-hidden />}
          />
          <KpiCard
            label={t('reports.kpi.expenses')}
            value={f.money(fin.expensesMinor, c)}
            delta={pf ? deltas.percent(fin.expensesMinor, pf.expensesMinor, false) : undefined}
            hint={hint}
            icon={<ReceiptIcon className="size-3.5" aria-hidden />}
          />
        </>
      ) : null}
      <KpiCard
        label={t('reports.kpi.occupancy')}
        value={f.percent(data.occupancy.occupancyBp)}
        delta={prev ? deltas.points(data.occupancy.occupancyBp, prev.occupancy.occupancyBp) : undefined}
        hint={t('reports.kpi.nights', {
          sold: data.occupancy.soldNights,
          sellable: data.occupancy.sellableNights
        })}
        icon={<BedDoubleIcon className="size-3.5" aria-hidden />}
      />
    </KpiRow>
  )
}

interface DayPoint extends SeriesPoint {
  revenue: number
  expenses: number
}

function DayDetail({
  day,
  report,
  onClose
}: {
  day: MonthlyReport['daily'][number]
  report: MonthlyReport
  onClose: () => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const can = useCan()
  const labels = useReportLabels()
  const c = report.baseCurrency
  const methods = (Object.entries(day.byMethod) as [MethodGroup, number][])
    .filter(([, v]) => v)
    .sort(([a], [b]) => methodGroupRank(a) - methodGroupRank(b))
  const channels = Object.entries(day.byChannel).filter(([code, v]) => v && code !== 'none')
  return (
    <div className="bg-muted/40 mt-3 grid gap-3 rounded-lg border p-3 text-sm" data-testid="day-detail">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">{f.date(day.date, 'full')}</p>
        <div className="flex items-center gap-1">
          {can('ledger') ? (
            <Button asChild variant="outline" size="sm">
              <Link to="/ledger" search={{ day: day.date } as never}>
                {t('reports.day.openLedger')}
                <ArrowRightIcon className="rtl:rotate-180" aria-hidden />
              </Link>
            </Button>
          ) : null}
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={t('reports.day.close')}>
            <XIcon aria-hidden />
          </Button>
        </div>
      </div>
      <dl className="grid grid-cols-3 gap-2">
        <div>
          <dt className="text-muted-foreground text-xs">{t('reports.kpi.revenue')}</dt>
          <dd className="font-medium">
            <Money minor={day.revenueMinor} currency={c} />
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">{t('reports.kpi.expenses')}</dt>
          <dd className="font-medium">
            <Money minor={day.expensesMinor} currency={c} />
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">{t('reports.day.net')}</dt>
          <dd className="font-medium">
            <Money minor={day.revenueMinor - day.expensesMinor} currency={c} strong />
          </dd>
        </div>
      </dl>
      {methods.length || channels.length ? (
        <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
          {methods.map(([g, v]) => (
            <li key={g} className="flex justify-between gap-3">
              <span>{t(`ledger.group.${g}`)}</span>
              <Money minor={v} currency={c} />
            </li>
          ))}
          {channels.map(([code, v]) => {
            const ch = report.channels.find((x) => x.code === code)
            return (
              <li key={code} className="text-muted-foreground flex justify-between gap-3">
                <span>{ch ? labels.channel(ch) : code}</span>
                <Money minor={v} currency={c} />
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}

function SummaryView({ report, period, today }: { report: MonthlyReport; period: Period; today: LocalDate }) {
  const { t } = useTranslation()
  const f = useFormat()
  const print = usePrintMode()
  const names = useCalendarNames()
  const labels = useReportLabels(report.categories)
  const [picked, setPicked] = useState<LocalDate | null>(null)
  const c = report.baseCurrency
  const share = (v: number, total: number): string =>
    f.percent(basisPoints(Math.max(0, v), Math.max(1, total)), 1)

  // Revenue line: every day of the period up to today (days without income are 0), or months when long.
  const end = period.to < addDays(today, 1) ? period.to : addDays(today, 1)
  const byDay = new Map(report.daily.map((d) => [d.date, d]))
  const daily = diffDays(period.from, period.to) <= DAILY_MAX
  const points: DayPoint[] = []
  if (daily) {
    for (let d = period.from; d < end; d = addDays(d, 1)) {
      const row = byDay.get(d)
      points.push({
        key: d,
        label: f.dayMonth(d),
        revenue: row?.revenueMinor ?? 0,
        expenses: row?.expensesMinor ?? 0
      })
    }
  } else {
    const months = new Map<string, DayPoint>()
    for (const d of report.daily) {
      const m = d.date.slice(0, 7)
      const p = months.get(m) ?? { key: m, label: names.shortMonth(m), revenue: 0, expenses: 0 }
      p.revenue += d.revenueMinor
      p.expenses += d.expensesMinor
      months.set(m, p)
    }
    points.push(...months.values())
  }
  const lineConfig = {
    revenue: { label: t('reports.kpi.revenue'), color: SERIES_COLORS.revenue }
  } satisfies ChartConfig
  const pickedDay = picked
    ? (byDay.get(picked) ?? { date: picked, revenueMinor: 0, expensesMinor: 0, byMethod: {}, byChannel: {} })
    : null

  // Income detail: a row per method, a column per currency, then the base-currency total.
  const currencies = [...new Set(report.income.map((r) => r.currency))].sort((a, b) =>
    a === c ? -1 : b === c ? 1 : a < b ? -1 : 1
  )
  const methodRows = [...new Set(report.income.map((r) => r.methodGroup))].sort(
    (a, b) => methodGroupRank(a) - methodGroupRank(b)
  )
  const cellOf = (g: MethodGroup, cur: string) =>
    report.income.find((r) => r.methodGroup === g && r.currency === cur)
  const incomeTable: ChartTable = {
    columns: [
      { key: 'method', label: t('reports.col.method') },
      ...currencies.map((cur) => ({ key: cur, label: cur, numeric: true })),
      { key: 'base', label: t('reports.col.baseOf', { currency: c }), numeric: true }
    ],
    rows: methodRows.map((g) => ({
      key: g,
      cells: {
        method: t(`ledger.group.${g}`),
        ...Object.fromEntries(
          currencies.map((cur) => {
            const cell = cellOf(g, cur)
            return [
              cur,
              cell ? (
                <Money minor={cell.amountMinor} currency={cur} />
              ) : (
                <span className="text-muted-foreground">–</span>
              )
            ]
          })
        ),
        base: (
          <Money
            minor={report.income.filter((r) => r.methodGroup === g).reduce((s, r) => s + r.baseMinor, 0)}
            currency={c}
            strong
          />
        )
      }
    })),
    footer: {
      method: t('common.total'),
      ...Object.fromEntries(
        currencies.map((cur) => [
          cur,
          <Money
            key={cur}
            minor={report.income.filter((r) => r.currency === cur).reduce((s, r) => s + r.amountMinor, 0)}
            currency={cur}
          />
        ])
      ),
      base: <Money minor={report.revenueMinor} currency={c} strong />
    }
  }

  const channels = report.channels.map((ch) => ({
    key: ch.code,
    label: labels.channel(ch),
    value: ch.baseMinor
  }))
  const top = report.topExpenses.slice(0, 10)
  const topMax = top[0]?.totalMinor ?? 0
  const official = report.sections.filter((s) => !s.ownerOnly)
  const ownerSections = report.sections.filter((s) => s.ownerOnly)

  return (
    <div className="grid gap-4">
      <DataNotes missing={report.missingRate} partial={report.partial} />
      <ChartCard
        title={daily ? t('reports.charts.daily') : t('reports.charts.monthlyRevenue')}
        icon={ChartLineIcon}
        testId="chart-daily"
        exportId="daily"
        empty={report.daily.length ? null : t('reports.chart.empty')}
        note={daily && !print ? t('reports.charts.dailyHint') : null}
        table={{
          columns: [
            { key: 'day', label: t('reports.col.date') },
            { key: 'revenue', label: t('reports.kpi.revenue'), numeric: true },
            { key: 'expenses', label: t('reports.kpi.expenses'), numeric: true },
            { key: 'net', label: t('reports.day.net'), numeric: true, minor: true }
          ],
          rows: points
            .filter((p) => p.revenue || p.expenses)
            .map((p) => ({
              key: p.key,
              cells: {
                day:
                  daily && !print ? (
                    <button
                      type="button"
                      className="text-primary underline-offset-4 hover:underline"
                      onClick={() => setPicked(p.key as LocalDate)}
                    >
                      {f.date(p.key as LocalDate, 'medium')}
                    </button>
                  ) : daily ? (
                    f.date(p.key as LocalDate, 'medium')
                  ) : (
                    p.label
                  ),
                revenue: <Money minor={p.revenue} currency={c} />,
                expenses: <Money minor={p.expenses} currency={c} />,
                net: <Money minor={p.revenue - p.expenses} currency={c} />
              }
            }))
        }}
      >
        <LinesChart
          data={points}
          config={lineConfig}
          currency={c}
          onPick={daily ? (key) => setPicked(key as LocalDate) : undefined}
        />
      </ChartCard>
      {pickedDay && !print ? (
        <DayDetail day={pickedDay} report={report} onClose={() => setPicked(null)} />
      ) : null}

      <div className="grid items-start gap-4 lg:grid-cols-2 print:grid-cols-1">
        <SectionCard
          title={t('reports.monthly.income')}
          icon={LandmarkIcon}
          testId="income-detail"
          action={<ExportOnly id="income" title={t('reports.monthly.income')} />}
        >
          {methodRows.length ? (
            <DataTable table={incomeTable} />
          ) : (
            <p className="text-muted-foreground text-sm">{t('reports.chart.empty')}</p>
          )}
        </SectionCard>
        <ChartCard
          title={t('reports.monthly.channels')}
          icon={StoreIcon}
          testId="chart-channels"
          exportId="channels"
          empty={channels.length ? null : t('reports.chart.empty')}
          note={t('reports.monthly.channelsNote')}
          table={{
            columns: [
              { key: 'label', label: t('reports.col.channel') },
              { key: 'amount', label: t('reports.col.amount'), numeric: true },
              { key: 'share', label: t('reports.col.share'), numeric: true }
            ],
            rows: channels.map((r) => ({
              key: r.key,
              cells: {
                label: r.label,
                amount: <Money minor={r.value} currency={c} />,
                share: share(r.value, report.revenueMinor)
              }
            }))
          }}
        >
          <SplitChart data={channels} color={SERIES_COLORS.revenue} currency={c} />
        </ChartCard>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2 print:grid-cols-1">
        {/* The sections card is short: the supply costs sit under it, beside the long "en çok harcama" list. */}
        <div className="grid min-w-0 gap-4">
          <SectionCard
            title={t('reports.monthly.sections')}
            icon={ReceiptIcon}
            testId="expense-sections"
            action={<ExportOnly id="sections" title={t('reports.monthly.sections')} />}
          >
            <ul className="grid gap-1.5 text-sm">
              {[...official, ...ownerSections].map((s) => (
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
              <li className="flex justify-between gap-3 border-t pt-1.5 font-semibold">
                <span>{t('common.total')}</span>
                <Money minor={report.expensesMinor} currency={c} strong />
              </li>
            </ul>
            {report.ownerExpenses?.length ? (
              <div className="mt-4 grid gap-1.5" data-testid="owner-expenses">
                <p className="text-muted-foreground text-xs font-medium">{t('reports.monthly.owner')}</p>
                <ul className="grid gap-1 text-sm">
                  {report.ownerExpenses.map((g) => (
                    <li key={groupKey(g)} className="flex justify-between gap-3">
                      <span className="min-w-0">{labels.expense(g)}</span>
                      <Money minor={g.totalMinor} currency={c} />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </SectionCard>
          {report.supply ? (
            <SupplyCard supply={report.supply} categories={report.categories} currency={c} />
          ) : null}
        </div>
        <SectionCard
          title={t('monthEnd.top.title')}
          icon={FlameIcon}
          testId="top-expenses"
          action={<ExportOnly id="top" title={t('monthEnd.top.title')} />}
        >
          <TopList
            groups={top}
            max={topMax}
            total={report.expensesMinor}
            currency={c}
            categories={report.categories}
          />
        </SectionCard>
      </div>

      <FxSourcesCard rows={report.fxSources} currency={c} />
    </div>
  )
}

export function ExportOnly({ id, title }: { id: string; title: string }) {
  const print = usePrintMode()
  return print ? null : <TableExportMenu table={id} label={title} />
}

/** "En çok harcama": rank, name (with its kind), share and amount, a bar for the size. */
export function TopList({
  groups,
  max,
  total,
  currency,
  categories
}: {
  groups: MonthlyReport['topExpenses']
  max: number
  total: number
  currency: string
  categories: MonthlyReport['categories']
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const labels = useReportLabels(categories)
  if (!groups.length) return <p className="text-muted-foreground text-sm">{t('monthEnd.top.empty')}</p>
  return (
    <ol className="grid gap-2.5">
      {groups.map((g, i) => (
        <li key={groupKey(g)} className="grid gap-1">
          <div className="flex items-baseline gap-2 text-sm">
            <span className="text-muted-foreground w-5 shrink-0 text-end text-xs tabular-nums">{i + 1}</span>
            <span className="min-w-0 flex-1 font-medium break-words">
              {labels.expense(g)}
              {g.kind !== 'description' ? (
                <span className="text-muted-foreground ms-1.5 text-xs font-normal">
                  {labels.expenseKind(g)}
                </span>
              ) : null}
            </span>
            <span className="text-muted-foreground text-xs tabular-nums">
              {f.percent(basisPoints(Math.max(0, g.totalMinor), Math.max(1, total)), 0)}
            </span>
            <Money minor={g.totalMinor} currency={currency} strong />
          </div>
          <div className="bg-muted ms-7 h-1.5 overflow-hidden rounded-full" aria-hidden>
            <div
              className={cn('bg-chart-4 h-full rounded-full', widthClass(basisPoints(g.totalMinor, max)))}
            />
          </div>
        </li>
      ))}
    </ol>
  )
}

/** Bar widths in 5 % steps as classes (no inline style). */
function widthClass(bp: number): string {
  const steps = [
    'w-0',
    'w-[5%]',
    'w-[10%]',
    'w-[15%]',
    'w-[20%]',
    'w-[25%]',
    'w-[30%]',
    'w-[35%]',
    'w-[40%]',
    'w-[45%]',
    'w-[50%]',
    'w-[55%]',
    'w-[60%]',
    'w-[65%]',
    'w-[70%]',
    'w-[75%]',
    'w-[80%]',
    'w-[85%]',
    'w-[90%]',
    'w-[95%]',
    'w-full'
  ]
  return steps[Math.max(0, Math.min(20, Math.round(bp / 500)))]!
}

export function SummaryTab({
  period,
  compare,
  today
}: {
  period: Period
  compare: Period | null
  today: LocalDate
}) {
  const kpis = useSummaryKpis(period, compare)
  const monthly = useApiQuery('reports.monthly', period)
  return (
    <div className="grid gap-4">
      <ReportQuery query={kpis.current}>{(s) => <SummaryKpis data={s} prev={kpis.previous} />}</ReportQuery>
      <ReportQuery query={monthly}>
        {(m) => <SummaryView report={m} period={period} today={today} />}
      </ReportQuery>
    </div>
  )
}
