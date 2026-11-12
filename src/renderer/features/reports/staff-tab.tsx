// "Personel" (faz-10 madde 7): each employee's cost over the year (money paid out: salary, advance, leave pay,
// overtime, other), leave days used, hours worked and overtime hours; the monthly staff cost and its ratio to revenue.
// Money only for salary viewers (`staff.salary`), the ratio only with `reports.finance` too (the service sends null).
import { useTranslation } from 'react-i18next'
import { ChartColumnIcon, PercentIcon, UsersIcon, WalletIcon } from 'lucide-react'
import type { StaffReport } from '@shared/contract/procedures/reports'
import { staffLeaveDays } from '@shared/domain/reports'
import type { ChartConfig } from '@/components/ui/chart'
import { KpiCard } from '@/components/kpi-card'
import { useFormat } from '@/hooks/use-format'
import { useApiQuery } from '@/lib/api/hooks'
import { ChartCard } from './chart-card'
import { DataNotes, KpiRow, Money, ReportQuery } from './common'
import { useCalendarNames } from './labels'
import { SERIES_COLORS } from './chart-format'
import { GroupedBars, type SeriesPoint } from './report-charts'

function StaffView({ report }: { report: StaffReport }) {
  const { t } = useTranslation()
  const f = useFormat()
  const names = useCalendarNames()
  const c = report.baseCurrency
  const money = report.salaryVisible
  const total = report.employees.reduce((s, e) => s + (e.costMinor ?? 0), 0)
  const hours = (minutes: number): string => f.number(minutes / 60, 1)
  const bars: SeriesPoint[] = report.months.map((m) => ({
    key: String(m.month),
    label: names.monthOfYear(m.month),
    staff: m.costMinor ?? 0
  }))
  const config = {
    staff: { label: t('reports.staff.cost'), color: SERIES_COLORS.staff }
  } satisfies ChartConfig
  const leaveDays = (e: StaffReport['employees'][number]): number => staffLeaveDays(e.leave)
  const moneyColumns = money
    ? [
        { key: 'salary', label: t('reports.staff.kind.salary_payment'), numeric: true, minor: true },
        { key: 'advance', label: t('reports.staff.kind.advance'), numeric: true, minor: true },
        { key: 'extra', label: t('reports.staff.extraPay'), numeric: true, minor: true },
        { key: 'cost', label: t('reports.staff.yearCost'), numeric: true }
      ]
    : []
  return (
    <div className="grid gap-4">
      <DataNotes partial={report.partial} />
      <KpiRow testId="staff-kpis">
        {money ? (
          <KpiCard
            label={t('reports.staff.yearCost')}
            value={f.money(total, c)}
            icon={<WalletIcon className="size-3.5" aria-hidden />}
          />
        ) : null}
        {report.laborRatioBp !== null ? (
          <KpiCard
            label={t('reports.staff.ratio')}
            value={f.percent(report.laborRatioBp)}
            hint={t('reports.expenses.ratioHint')}
            icon={<PercentIcon className="size-3.5" aria-hidden />}
          />
        ) : null}
        <KpiCard
          label={t('reports.staff.headcount')}
          value={String(report.employees.filter((e) => e.active).length)}
          icon={<UsersIcon className="size-3.5" aria-hidden />}
        />
      </KpiRow>
      {money ? (
        <ChartCard
          title={t('reports.staff.byMonth')}
          icon={ChartColumnIcon}
          testId="chart-staff"
          exportId="months"
          empty={total ? null : t('reports.chart.empty')}
          table={{
            columns: [
              { key: 'month', label: t('reports.col.month') },
              { key: 'cost', label: t('reports.staff.cost'), numeric: true }
            ],
            rows: report.months.map((m) => ({
              key: String(m.month),
              cells: {
                month: names.monthOfYear(m.month),
                cost: <Money minor={m.costMinor ?? 0} currency={c} />
              }
            }))
          }}
        >
          <GroupedBars data={bars} config={config} currency={c} height="h-56" />
        </ChartCard>
      ) : null}
      <ChartCard
        title={t('reports.staff.employees')}
        icon={UsersIcon}
        testId="staff-employees"
        exportId="employees"
        empty={report.employees.length ? null : t('reports.staff.none')}
        table={{
          columns: [
            { key: 'name', label: t('reports.col.employee') },
            ...moneyColumns,
            { key: 'leave', label: t('reports.staff.leaveDays'), numeric: true },
            { key: 'worked', label: t('reports.staff.workedHours'), numeric: true, minor: true },
            { key: 'overtime', label: t('reports.staff.overtimeHours'), numeric: true }
          ],
          rows: report.employees.map((e) => ({
            key: e.id,
            cells: {
              name: (
                <span className="grid">
                  <span className="font-medium">{e.name}</span>
                  {e.position ? <span className="text-muted-foreground text-xs">{e.position}</span> : null}
                </span>
              ),
              salary: <Money minor={e.byKind.salary_payment ?? 0} currency={c} />,
              advance: <Money minor={e.byKind.advance ?? 0} currency={c} />,
              extra: (
                <Money
                  minor={
                    (e.byKind.leave_payout ?? 0) +
                    (e.byKind.overtime_payment ?? 0) +
                    (e.byKind.commission_payment ?? 0) +
                    (e.byKind.other ?? 0)
                  }
                  currency={c}
                />
              ),
              cost: <Money minor={e.costMinor ?? 0} currency={c} strong />,
              leave: leaveDays(e),
              worked: hours(e.workedMinutes),
              overtime: hours(e.overtimeMinutes)
            }
          })),
          footer: money
            ? { name: t('common.total'), cost: <Money minor={total} currency={c} strong /> }
            : undefined
        }}
      />
    </div>
  )
}

export function StaffTab({ year }: { year: number }) {
  const query = useApiQuery('reports.staff', { year })
  return <ReportQuery query={query}>{(r) => <StaffView report={r} />}</ReportQuery>
}
