// "Doluluk ve KPI" (faz-10 madde 4): occupancy (sold ÷ sellable room-nights; blocks out of the denominator; same-day
// stays by setting), ADR, RevPAR, average stay, the weekday heat map (Saturday effect), occupancy by month, revenue
// by room type and room, repeat guests and — with the finance and guest permissions — the guests who brought most.
import { useTranslation } from 'react-i18next'
import {
  BedDoubleIcon,
  BuildingIcon,
  CalendarDaysIcon,
  ChartLineIcon,
  CoinsIcon,
  DoorOpenIcon,
  Grid3x3Icon,
  RepeatIcon,
  StoreIcon,
  UsersIcon
} from 'lucide-react'
import type { OccupancyReport, ReportSummary } from '@shared/contract/procedures/reports'
import { basisPoints } from '@shared/domain/reports'
import type { Period } from '@shared/domain/reports-period'
import type { ChartConfig } from '@/components/ui/chart'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { KpiCard } from '@/components/kpi-card'
import { SectionCard } from '@/components/section-card'
import { useFormat } from '@/hooks/use-format'
import { useApiQuery, useUpdateSettings } from '@/lib/api/hooks'
import { useQueryClient } from '@tanstack/react-query'
import { useCan } from '@/lib/view-as'
import { ChartCard } from './chart-card'
import { usePrintMode } from './print-mode'
import { DataNotes, KpiRow, Money, ReportQuery } from './common'
import { useDeltas } from './deltas'
import { useCalendarNames, useMonthName, useReportLabels } from './labels'
import { SERIES_COLORS } from './chart-format'
import { Heatmap, LinesChart, type SeriesPoint } from './report-charts'
import { useSummaryKpis } from './use-summary'

function OccupancyKpis({
  data,
  prev,
  report
}: {
  data: ReportSummary
  prev?: ReportSummary
  report: OccupancyReport
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const deltas = useDeltas()
  const o = data.occupancy
  const fin = data.finance
  const c = data.baseCurrency
  return (
    <KpiRow testId="occupancy-kpis">
      <KpiCard
        label={t('reports.kpi.occupancy')}
        value={f.percent(o.occupancyBp)}
        delta={prev ? deltas.points(o.occupancyBp, prev.occupancy.occupancyBp) : undefined}
        hint={t('reports.kpi.nights', { sold: o.soldNights, sellable: o.sellableNights })}
        icon={<BedDoubleIcon className="size-3.5" aria-hidden />}
      />
      {fin ? (
        <>
          <KpiCard
            label={t('reports.kpi.adr')}
            value={f.money(fin.adrMinor, c)}
            delta={prev?.finance ? deltas.percent(fin.adrMinor, prev.finance.adrMinor, true) : undefined}
            hint={t('reports.kpi.adrHint')}
            icon={<CoinsIcon className="size-3.5" aria-hidden />}
          />
          <KpiCard
            label={t('reports.kpi.revpar')}
            value={f.money(fin.revparMinor, c)}
            delta={
              prev?.finance ? deltas.percent(fin.revparMinor, prev.finance.revparMinor, true) : undefined
            }
            hint={t('reports.kpi.revparHint')}
            icon={<StoreIcon className="size-3.5" aria-hidden />}
          />
        </>
      ) : null}
      <KpiCard
        label={t('reports.kpi.alos')}
        value={t('reports.kpi.alosValue', { value: f.number(o.alosHundredths / 100, 1) })}
        hint={t('reports.kpi.stays', { count: o.stays })}
        icon={<CalendarDaysIcon className="size-3.5" aria-hidden />}
      />
      <KpiCard
        label={t('reports.kpi.repeat')}
        value={f.percent(report.guests.repeatBp)}
        hint={t('reports.kpi.repeatHint', { repeat: report.guests.repeat, total: report.guests.total })}
        icon={<RepeatIcon className="size-3.5" aria-hidden />}
      />
    </KpiRow>
  )
}

/** "Aynı gün giriş‑çıkışları dolulukta say" — a hotel setting (G-09), changed here by whoever edits settings. */
function DayUseSwitch({ report }: { report: OccupancyReport }) {
  const { t } = useTranslation()
  const can = useCan()
  const print = usePrintMode()
  const update = useUpdateSettings()
  const client = useQueryClient()
  const total = report.months.reduce((s, m) => s + m.dayUseNights, 0)
  const editable = can('settings', 'edit') && !print
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm" data-testid="day-use">
      <p className="text-muted-foreground">
        {report.dayUseIncluded
          ? t('reports.occupancy.dayUseIn', { count: total })
          : t('reports.occupancy.dayUseOut', { count: total })}
      </p>
      {editable ? (
        <div className="flex items-center gap-2">
          <Switch
            id="day-use-switch"
            className="relative max-md:after:absolute max-md:after:-inset-x-2 max-md:after:-inset-y-[14px]"
            checked={report.dayUseIncluded}
            disabled={update.isPending}
            onCheckedChange={(checked) =>
              update.mutate(
                { 'reports.dayUseInOccupancy': checked },
                {
                  onSuccess: () =>
                    void Promise.all(
                      ['reports.summary', 'reports.occupancy', 'reports.context', 'reports.monthEnd'].map(
                        (k) => client.invalidateQueries({ queryKey: [k] })
                      )
                    )
                }
              )
            }
          />
          <Label htmlFor="day-use-switch">{t('reports.occupancy.dayUseSwitch')}</Label>
        </div>
      ) : null}
    </div>
  )
}

function OccupancyView({
  report,
  summary,
  prev
}: {
  report: OccupancyReport
  summary: ReportSummary
  prev?: ReportSummary
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const names = useCalendarNames()
  const monthName = useMonthName()
  const labels = useReportLabels()
  const c = report.baseCurrency
  const occ = (r: { soldNights: number; sellableNights: number }) =>
    basisPoints(r.soldNights, r.sellableNights)
  const months: SeriesPoint[] = report.months.map((m) => ({
    key: m.month,
    label: names.shortMonth(m.month),
    occupancy: occ(m)
  }))
  const occConfig = {
    occupancy: { label: t('reports.kpi.occupancy'), color: SERIES_COLORS.occupancy }
  } satisfies ChartConfig
  const nightCols = [
    { key: 'sold', label: t('reports.col.soldNights'), numeric: true },
    { key: 'sellable', label: t('reports.col.sellableNights'), numeric: true, minor: true },
    { key: 'occ', label: t('reports.kpi.occupancy'), numeric: true }
  ]
  const finance = report.rooms.some((r) => r.revenueMinor !== null)
  const revenueCol = finance ? [{ key: 'revenue', label: t('reports.col.roomRevenue'), numeric: true }] : []
  const nights = (r: OccupancyReport['rooms'][number] | OccupancyReport['roomTypes'][number]) => ({
    sold: r.soldNights,
    sellable: r.sellableNights,
    occ: f.percent(occ(r)),
    revenue: r.revenueMinor === null ? null : <Money minor={r.revenueMinor} currency={c} />
  })
  const heatMonths = [...new Set(report.heatmap.map((h) => h.month))]
  return (
    <div className="grid gap-4">
      <DataNotes missingNights={report.missingNightRates} />
      <OccupancyKpis data={summary} prev={prev} report={report} />
      <DayUseSwitch report={report} />
      <div className="grid items-start gap-4 lg:grid-cols-2 print:grid-cols-1">
        <ChartCard
          title={t('reports.occupancy.months')}
          icon={ChartLineIcon}
          testId="chart-occupancy"
          exportId="months"
          empty={report.months.some((m) => m.sellableNights) ? null : t('reports.chart.empty')}
          table={{
            columns: [{ key: 'month', label: t('reports.col.month') }, ...nightCols],
            rows: report.months.map((m) => ({
              key: m.month,
              cells: {
                month: monthName(m.month),
                sold: m.soldNights,
                sellable: m.sellableNights,
                occ: f.percent(occ(m))
              }
            }))
          }}
        >
          <LinesChart data={months} config={occConfig} currency={c} percent height="h-56" />
        </ChartCard>
        <ChartCard
          title={t('reports.occupancy.heatmap')}
          icon={Grid3x3Icon}
          testId="chart-heatmap"
          exportId="weekdays"
          empty={report.heatmap.length ? null : t('reports.chart.empty')}
          note={t('reports.occupancy.heatmapNote')}
          table={{
            columns: [
              { key: 'month', label: t('reports.col.month') },
              { key: 'weekday', label: t('reports.col.weekday') },
              ...nightCols
            ],
            rows: report.heatmap.map((h) => ({
              key: `${h.month}-${h.weekday}`,
              cells: {
                month: monthName(h.month),
                weekday: names.weekdayLong(h.weekday),
                sold: h.soldNights,
                sellable: h.sellableNights,
                occ: f.percent(occ(h))
              }
            }))
          }}
        >
          <Heatmap
            months={heatMonths}
            cells={report.heatmap.map((h) => ({
              month: h.month,
              weekday: h.weekday,
              bp: h.sellableNights ? occ(h) : null
            }))}
            monthLabel={names.shortMonth}
            weekdayLabel={names.weekdayShort}
          />
        </ChartCard>
      </div>
      <div className="grid items-start gap-4 2xl:grid-cols-2 print:grid-cols-1">
        <ChartCard
          title={t('reports.occupancy.roomTypes')}
          icon={BuildingIcon}
          testId="room-types"
          exportId="roomTypes"
          empty={report.roomTypes.length ? null : t('reports.chart.empty')}
          table={{
            columns: [{ key: 'name', label: t('reports.col.roomType') }, ...nightCols, ...revenueCol],
            rows: report.roomTypes.map((r) => ({ key: r.id, cells: { name: labels.list(r), ...nights(r) } }))
          }}
        />
        <ChartCard
          title={t('reports.occupancy.rooms')}
          icon={DoorOpenIcon}
          testId="rooms-table"
          exportId="rooms"
          empty={report.rooms.length ? null : t('reports.chart.empty')}
          table={{
            columns: [{ key: 'room', label: t('reports.col.room') }, ...nightCols, ...revenueCol],
            rows: report.rooms.map((r) => ({ key: r.id, cells: { room: r.number, ...nights(r) } }))
          }}
        />
      </div>
      {report.topGuests ? (
        <SectionCard title={t('reports.occupancy.topGuests')} icon={UsersIcon} testId="top-guests">
          {report.topGuests.length ? (
            <ol className="grid gap-1.5 text-sm">
              {report.topGuests.map((g, i) => (
                <li key={g.guestId} className="flex items-baseline gap-2">
                  <span className="text-muted-foreground w-5 shrink-0 text-end text-xs tabular-nums">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 font-medium">{g.name}</span>
                  <span className="text-muted-foreground text-xs">
                    {t('reports.kpi.stays', { count: g.stays })}
                  </span>
                  <Money minor={g.revenueMinor} currency={c} strong />
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-muted-foreground text-sm">{t('reports.chart.empty')}</p>
          )}
        </SectionCard>
      ) : null}
    </div>
  )
}

export function OccupancyTab({ period, compare }: { period: Period; compare: Period | null }) {
  const kpis = useSummaryKpis(period, compare)
  const report = useApiQuery('reports.occupancy', period)
  return (
    <ReportQuery query={report}>
      {(r) => (
        <ReportQuery query={kpis.current}>
          {(s) => <OccupancyView report={r} summary={s} prev={kpis.previous} />}
        </ReportQuery>
      )}
    </ReportQuery>
  )
}
