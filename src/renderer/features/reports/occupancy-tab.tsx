// "Doluluk ve KPI" (faz-10 madde 4): occupancy (sold ÷ sellable room-nights; blocks out of the denominator; same-day
// and hourly stays always count; a stay-type filter), ADR, RevPAR, average stay, the weekday heat map (Saturday effect), occupancy by month, revenue
// by room type and room, repeat guests and — with the finance and guest permissions — the guests who brought most.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  BanIcon,
  BedDoubleIcon,
  BuildingIcon,
  CalendarDaysIcon,
  ChartLineIcon,
  CoinsIcon,
  DoorOpenIcon,
  Grid3x3Icon,
  RepeatIcon,
  StoreIcon,
  Undo2Icon,
  UserXIcon,
  UsersIcon
} from 'lucide-react'
import type { OccupancyReport, ReportSummary, StayKind } from '@shared/contract/procedures/reports'
import { basisPoints } from '@shared/domain/reports'
import type { Period } from '@shared/domain/reports-period'
import type { ChartConfig } from '@/components/ui/chart'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { KpiCard } from '@/components/kpi-card'
import { SectionCard } from '@/components/section-card'
import { useFormat } from '@/hooks/use-format'
import { useApiQuery } from '@/lib/api/hooks'
import { ChartCard } from './chart-card'
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

/** Cancelled, no-show and refunded each on its own line (K-55): none of them hides inside a net total. */
function OutcomeKpis({ report }: { report: OccupancyReport }) {
  const { t } = useTranslation()
  const f = useFormat()
  const o = report.outcomes
  return (
    <KpiRow testId="outcome-kpis">
      <KpiCard
        label={t('reports.outcomes.cancelled')}
        value={f.number(o.cancelled)}
        hint={t('reports.outcomes.cancelledHint')}
        icon={<BanIcon className="size-3.5" aria-hidden />}
      />
      <KpiCard
        label={t('reports.outcomes.noShow')}
        value={f.number(o.noShow)}
        hint={t('reports.outcomes.noShowHint')}
        icon={<UserXIcon className="size-3.5" aria-hidden />}
      />
      {o.refundRows !== null && o.refundMinor !== null ? (
        <KpiCard
          label={t('reports.outcomes.refund')}
          value={f.money(o.refundMinor, report.baseCurrency)}
          hint={t('reports.outcomes.refundHint', { count: o.refundRows })}
          icon={<Undo2Icon className="size-3.5" aria-hidden />}
        />
      ) : null}
    </KpiRow>
  )
}

/** Hourly and same-day sales of the period (S-105: they always count); the stay-type filter is above the tab. */
function HourlyCount({ report }: { report: OccupancyReport }) {
  const { t } = useTranslation()
  const total = report.months.reduce((s, m) => s + m.dayUseNights, 0)
  return (
    <p className="text-muted-foreground text-sm" data-testid="day-use">
      {t('reports.occupancy.hourlyCount', { count: total })}
    </p>
  )
}

const STAY_KIND_OPTIONS = ['all', 'overnight', 'hourly'] as const

/** "Konaklama türü" (K-48): all stays, nights only, or hourly (same-day) sales only. */
function StayKindFilter({ value, onChange }: { value: StayKind; onChange: (kind: StayKind) => void }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="stay-kind">
      <span className="text-sm font-medium" id="stay-kind-label">
        {t('reports.stayKind.label')}
      </span>
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={value}
        aria-labelledby="stay-kind-label"
        onValueChange={(v) => v && onChange(v as StayKind)}
      >
        {STAY_KIND_OPTIONS.map((kind) => (
          <ToggleGroupItem key={kind} value={kind} data-testid={`stay-kind-${kind}`}>
            {t(`reports.stayKind.${kind}`)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
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
      <OutcomeKpis report={report} />
      <HourlyCount report={report} />
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
  const [stayKind, setStayKind] = useState<StayKind>('all')
  const kpis = useSummaryKpis(period, compare, stayKind)
  const report = useApiQuery('reports.occupancy', stayKind === 'all' ? period : { ...period, stayKind })
  return (
    <div className="grid gap-4">
      <StayKindFilter value={stayKind} onChange={setStayKind} />
      <ReportQuery query={report}>
        {(r) => (
          <ReportQuery query={kpis.current}>
            {(s) => <OccupancyView report={r} summary={s} prev={kpis.previous} />}
          </ReportQuery>
        )}
      </ReportQuery>
    </div>
  )
}
