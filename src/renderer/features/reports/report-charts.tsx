// Report charts (recharts through components/ui/chart): colours are theme variables and follow the entity on every
// screen — revenue --chart-1, expenses --chart-4, profit --chart-2, a comparison period the muted ink (never a second
// hue). Money stays in minor units and is only formatted for axes and tooltips. Each chart sits in a ChartCard with
// its table; the weekday heat map is a plain grid with the value written in every cell.
import { useTranslation } from 'react-i18next'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig
} from '@/components/ui/chart'
import { useFormat } from '@/hooks/use-format'
import { useAxisMoney } from './chart-format'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'

function MoneyTooltip({ config, currency }: { config: ChartConfig; currency: string }) {
  const f = useFormat()
  return (
    <ChartTooltipContent
      formatter={(value, name) => (
        <div className="flex w-full items-center justify-between gap-4">
          <span className="text-muted-foreground">{config[String(name)]?.label ?? String(name)}</span>
          <bdi className="text-foreground font-medium tabular-nums">
            {f.money(Math.round(Number(value)), currency)}
          </bdi>
        </div>
      )}
    />
  )
}

const AXIS = { tickLine: false, axisLine: false, tickMargin: 8 } as const

export interface SeriesPoint {
  key: string
  label: string
  [series: string]: number | string | null
}

/** Grouped bars (revenue / expenses / profit per month, or two years of one measure). */
export function GroupedBars({
  data,
  config,
  currency,
  height = 'h-64'
}: {
  data: SeriesPoint[]
  config: ChartConfig
  currency: string
  height?: string
}) {
  const tick = useAxisMoney(currency)
  const series = Object.keys(config)
  return (
    <ChartContainer config={config} className={cn('aspect-auto w-full', height)}>
      <BarChart data={data} accessibilityLayer barGap={2}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" {...AXIS} />
        <YAxis {...AXIS} width="auto" tickFormatter={tick} />
        <ReferenceLine y={0} stroke="var(--border)" />
        <ChartTooltip content={<MoneyTooltip config={config} currency={currency} />} />
        {series.length > 1 ? <ChartLegend content={<ChartLegendContent />} itemSorter={null} /> : null}
        {series.map((s) => (
          <Bar
            key={s}
            isAnimationActive={false}
            dataKey={s}
            fill={`var(--color-${s})`}
            radius={[4, 4, 0, 0]}
            maxBarSize={28}
          />
        ))}
      </BarChart>
    </ChartContainer>
  )
}

/** Lines over days or months; `onPick` makes a point clickable (the daily revenue → day detail). */
export function LinesChart({
  data,
  config,
  currency,
  percent = false,
  onPick,
  height = 'h-64'
}: {
  data: SeriesPoint[]
  config: ChartConfig
  currency: string
  /** Values are basis points (occupancy). */
  percent?: boolean
  onPick?: (key: string) => void
  height?: string
}) {
  const f = useFormat()
  const tick = useAxisMoney(currency)
  const series = Object.keys(config)
  return (
    <ChartContainer config={config} className={cn('aspect-auto w-full', height, onPick && 'cursor-pointer')}>
      <LineChart
        data={data}
        accessibilityLayer
        margin={{ top: 8, left: 4, right: 12 }}
        onClick={(state) => {
          const i = state?.activeIndex
          if (onPick && i !== undefined && i !== null) {
            const point = data[Number(i)]
            if (point) onPick(point.key)
          }
        }}
      >
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" {...AXIS} minTickGap={16} />
        <YAxis
          {...AXIS}
          width={percent ? 48 : 'auto'}
          domain={percent ? [0, 10_000] : undefined}
          tickFormatter={(v: number) => (percent ? f.percent(v, 0) : tick(v))}
        />
        <ChartTooltip
          content={
            percent ? (
              <ChartTooltipContent
                formatter={(value, name) => (
                  <div className="flex w-full items-center justify-between gap-4">
                    <span className="text-muted-foreground">{config[String(name)]?.label}</span>
                    <span className="text-foreground font-medium tabular-nums">
                      {f.percent(Number(value))}
                    </span>
                  </div>
                )}
              />
            ) : (
              <MoneyTooltip config={config} currency={currency} />
            )
          }
        />
        {series.length > 1 ? <ChartLegend content={<ChartLegendContent />} itemSorter={null} /> : null}
        {series.map((s) => (
          <Line
            key={s}
            isAnimationActive={false}
            dataKey={s}
            stroke={`var(--color-${s})`}
            strokeWidth={2}
            strokeDasharray={s === 'compare' ? '5 4' : undefined}
            dot={data.length <= 40 ? { r: 3, fill: `var(--color-${s})` } : false}
            activeDot={{ r: 5 }}
            type="monotone"
            connectNulls
          />
        ))}
      </LineChart>
    </ChartContainer>
  )
}

export interface SplitPoint {
  key: string
  label: string
  value: number
}

/** Horizontal bars of a split (payment methods, channels, expense groups). */
export function SplitChart({
  data,
  color,
  currency
}: {
  data: SplitPoint[]
  color: string
  currency: string
}) {
  const { t } = useTranslation()
  const mobile = useIsMobile()
  const tick = useAxisMoney(currency)
  const config = { value: { label: t('reports.col.amount'), color } } satisfies ChartConfig
  const height = data.length <= 3 ? 'h-36' : data.length <= 5 ? 'h-48' : data.length <= 7 ? 'h-60' : 'h-72'
  return (
    <ChartContainer config={config} className={cn('aspect-auto w-full', height)}>
      <BarChart data={data} layout="vertical" accessibilityLayer margin={{ left: 4, right: 12 }}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" {...AXIS} tickFormatter={tick} />
        <YAxis type="category" dataKey="label" {...AXIS} width={mobile ? 108 : 170} interval={0} />
        <ChartTooltip content={<MoneyTooltip config={config} currency={currency} />} />
        <Bar
          isAnimationActive={false}
          dataKey="value"
          fill="var(--color-value)"
          radius={[0, 4, 4, 0]}
          barSize={18}
        />
      </BarChart>
    </ChartContainer>
  )
}

export interface HeatCell {
  month: string
  weekday: number
  /** Basis points; null = no sellable night that day of the week. */
  bp: number | null
}

/** Opacity steps of the one-hue scale (light → dark); text switches to the light ink on the two darkest. */
const HEAT_STEPS = [
  'bg-chart-1/10',
  'bg-chart-1/25',
  'bg-chart-1/45',
  'bg-chart-1/70 text-primary-foreground',
  'bg-chart-1 text-primary-foreground'
] as const

const stepOf = (bp: number): string => HEAT_STEPS[Math.min(HEAT_STEPS.length - 1, Math.floor(bp / 2000))]!

/** Month × weekday occupancy (the Saturday effect): rows months, columns Monday → Sunday. */
export function Heatmap({
  cells,
  months,
  monthLabel,
  weekdayLabel
}: {
  cells: HeatCell[]
  months: string[]
  monthLabel: (m: string) => string
  weekdayLabel: (wd: number) => string
}) {
  const f = useFormat()
  const order = [1, 2, 3, 4, 5, 6, 0]
  const at = new Map(cells.map((c) => [`${c.month}|${c.weekday}`, c.bp]))
  return (
    <div className="grid gap-2">
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0.5 text-xs" role="grid">
          <thead>
            <tr>
              <th className="w-20" />
              {order.map((wd) => (
                <th key={wd} scope="col" className="text-muted-foreground px-1 py-1 text-center font-medium">
                  {weekdayLabel(wd)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m}>
                <th
                  scope="row"
                  className="text-muted-foreground pe-2 text-start font-medium whitespace-nowrap"
                >
                  {monthLabel(m)}
                </th>
                {order.map((wd) => {
                  const bp = at.get(`${m}|${wd}`)
                  return (
                    <td
                      key={wd}
                      className={cn(
                        'h-8 min-w-11 rounded-sm text-center tabular-nums',
                        bp === null || bp === undefined ? 'bg-muted text-muted-foreground' : stepOf(bp)
                      )}
                    >
                      {bp === null || bp === undefined ? '–' : f.percent(bp, 0)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs" aria-hidden>
        {HEAT_STEPS.map((s, i) => (
          <span key={s} className="flex items-center gap-1">
            <span className={cn('size-3 rounded-sm border', s.split(' ')[0])} />
            {f.percent(i * 2000, 0)}–{f.percent(i === HEAT_STEPS.length - 1 ? 10_000 : (i + 1) * 2000, 0)}
          </span>
        ))}
      </div>
    </div>
  )
}
