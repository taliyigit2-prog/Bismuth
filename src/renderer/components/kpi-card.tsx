// KPI card (Bugün, raporlar): label, value, change against the previous period and an optional sparkline.
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowDownRightIcon, ArrowUpRightIcon, MinusIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export interface KpiDelta {
  label: string
  direction: 'up' | 'down' | 'flat'
  /** Whether this direction is good news (revenue up = good, expenses up = bad). */
  good: boolean
}

/** Points of a polyline in a 100 × 32 box. */
export function sparkPoints(series: readonly number[]): string {
  if (series.length < 2) return ''
  const min = Math.min(...series)
  const max = Math.max(...series)
  const range = max - min || 1
  return series
    .map(
      (v, i) =>
        `${((i / (series.length - 1)) * 100).toFixed(1)},${(30 - ((v - min) / range) * 28).toFixed(1)}`
    )
    .join(' ')
}

export function KpiCard({
  label,
  value,
  hint,
  delta,
  series,
  icon,
  className
}: {
  label: string
  value: string
  hint?: string
  delta?: KpiDelta
  series?: readonly number[]
  icon?: ReactNode
  className?: string
}) {
  const { t } = useTranslation()
  const Arrow =
    delta?.direction === 'up'
      ? ArrowUpRightIcon
      : delta?.direction === 'down'
        ? ArrowDownRightIcon
        : MinusIcon
  return (
    <Card className={cn('min-w-0 gap-2 py-4', className)} data-testid="kpi-card">
      <CardContent className="grid grid-cols-[minmax(0,1fr)] gap-1 px-4">
        <div className="text-muted-foreground flex items-center gap-2 text-xs font-medium">
          {icon}
          <span className="line-clamp-2 break-words" title={label}>
            {label}
          </span>
        </div>
        {/* On a narrow card the sparkline drops under the value instead of pushing the card wider. */}
        <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
          <p className="text-lg font-semibold tracking-tight whitespace-nowrap tabular-nums sm:text-2xl">
            <bdi>{value}</bdi>
          </p>
          {series && series.length > 1 ? (
            <svg
              viewBox="0 0 100 32"
              className="h-8 w-24 max-w-full shrink"
              aria-hidden
              preserveAspectRatio="none"
            >
              <polyline
                points={sparkPoints(series)}
                className="stroke-chart-1 fill-none"
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
                strokeLinejoin="round"
              />
            </svg>
          ) : null}
        </div>
        {delta || hint ? (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {delta ? (
              <span
                className={cn(
                  'inline-flex items-center gap-0.5 font-medium tabular-nums',
                  delta.direction === 'flat'
                    ? 'text-muted-foreground'
                    : delta.good
                      ? 'text-success'
                      : 'text-destructive'
                )}
              >
                <Arrow className="size-3.5" aria-hidden />
                {delta.label}
                {/* Good or bad news is the colour; screen readers get it in words. */}
                {delta.direction === 'flat' ? null : (
                  <span className="sr-only">({t(delta.good ? 'kpiCard.better' : 'kpiCard.worse')})</span>
                )}
              </span>
            ) : null}
            {hint ? <span className="text-muted-foreground">{hint}</span> : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
