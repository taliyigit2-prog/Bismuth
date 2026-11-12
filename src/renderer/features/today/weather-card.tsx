// Weather (G-113, K-13, S-19, S-90): the Today card — now (big Yr symbol, temperature, today's low/high, "yağmur
// bekleniyor · 2 mm", wind) and the week (7 days × symbol, high/low, mm). It reads `weather.get` itself, so the
// Today screen only places it. No forecast yet (network off since install, weather switched off) → the card is not
// shown at all; offline it keeps the last forecast with "X saat önce". No probability of rain: MET gives mm.
import { useTranslation } from 'react-i18next'
import { CloudSunIcon, WindIcon } from 'lucide-react'
import type { WeatherView } from '@shared/contract/external'
import { localDate } from '@shared/date'
import { symbolBase, weatherAgeHours } from '@shared/domain/weather'
import { Badge } from '@/components/ui/badge'
import { SectionCard } from '@/components/section-card'
import { WeatherIcon } from '@/components/weather-icon'
import { useFormat } from '@/hooks/use-format'
import { useIsMobile } from '@/hooks/use-mobile'
import { useApiQuery } from '@/lib/api/hooks'
import { cn } from '@/lib/utils'
import { kmh, useRainLine, type Day } from './weather-model'

type Forecast = NonNullable<WeatherView['forecast']>

/** "Veri: MET Norway · Simgeler: Yr/NRK" (CC BY 4.0; canli-dogrulama.md §2). */
export function WeatherAttribution({ forecast, className }: { forecast: Forecast; className?: string }) {
  const { t } = useTranslation()
  return (
    <p className={cn('text-muted-foreground text-xs', className)} data-testid="weather-attribution">
      {forecast.provider === 'openmeteo' ? t('weather.attributionOpenMeteo') : t('weather.attribution')}
    </p>
  )
}

/** "3 saat önce" once the forecast is older than three hours (offline). */
export function WeatherAge({ view }: { view: WeatherView }) {
  const { t } = useTranslation()
  const hours = weatherAgeHours(view.fetchedAt, view.now)
  if (hours === null) return null
  return (
    <Badge variant="outline" className={hours >= 12 ? 'border-warning/60 text-warning' : undefined}>
      {t('weather.age', { count: hours })}
    </Badge>
  )
}

export function WeatherNow({ forecast }: { forecast: Forecast }) {
  const { t } = useTranslation()
  const rainLine = useRainLine()
  const today = forecast.days[0]
  const now = forecast.now
  const symbol = now?.symbol ?? today?.symbol ?? 'cloudy'
  return (
    <div className="flex min-w-0 items-center gap-4" data-testid="weather-now">
      <WeatherIcon symbol={symbol} className="size-16 shrink-0" />
      <div className="grid min-w-0 gap-0.5">
        {now ? (
          <p className="text-3xl leading-none font-semibold tabular-nums">
            {t('weather.temp', { value: Math.round(now.tempC) })}
          </p>
        ) : null}
        <p className="text-sm font-medium">
          {t(`weather.condition.${symbolBase(symbol)}` as 'weather.condition.cloudy')}
        </p>
        {today ? (
          <p className="text-muted-foreground text-xs tabular-nums">
            {t('weather.lowHigh', { low: today.minC, high: today.maxC })}
          </p>
        ) : null}
        <p className="text-muted-foreground flex flex-wrap items-center gap-x-3 text-xs">
          {today ? (
            <span className={cn(today.precipMm > 0 && 'text-info font-medium')}>{rainLine(today)}</span>
          ) : null}
          {now?.windMs != null ? (
            <span className="inline-flex items-center gap-1">
              <WindIcon className="size-3.5" aria-hidden />
              {t('weather.wind', { value: kmh(now.windMs) })}
            </span>
          ) : null}
        </p>
      </div>
    </div>
  )
}

export function WeatherWeek({ days }: { days: readonly Day[] }) {
  const { t } = useTranslation()
  const f = useFormat()
  const isMobile = useIsMobile()
  return (
    // Phone: one row that scrolls sideways (seven days do not fit); it takes the focus then so the keyboard can
    // scroll it too. Wider: seven equal columns.
    <ol
      className="focus-visible:ring-ring -mx-4 flex gap-2 overflow-x-auto rounded-lg px-4 pb-1 outline-none focus-visible:ring-[3px] md:mx-0 md:grid md:grid-cols-7 md:overflow-visible md:px-0 md:pb-0"
      tabIndex={isMobile ? 0 : undefined}
      aria-label={t('weather.week')}
      data-testid="weather-days"
    >
      {days.map((d, i) => (
        <li
          key={d.date}
          className={cn(
            'grid w-16 shrink-0 content-start justify-items-center gap-0.5 rounded-lg px-1 py-2 text-center md:w-auto',
            i === 0 && 'bg-accent'
          )}
        >
          <span className="text-muted-foreground text-xs font-medium">
            {i === 0 ? t('common.today') : f.weekday(localDate(d.date))}
          </span>
          <WeatherIcon symbol={d.symbol} className="size-9" />
          <span className="text-sm font-semibold whitespace-nowrap tabular-nums">
            {t('weather.temp', { value: d.maxC })}
            <span className="text-muted-foreground font-normal"> {t('weather.temp', { value: d.minC })}</span>
          </span>
          {d.precipMm > 0 ? (
            <span className="text-info text-xs whitespace-nowrap tabular-nums">
              {t('weather.rain', { mm: f.number(d.precipMm, d.precipMm < 10 ? 1 : 0) })}
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  )
}

/** The Today card: renders nothing while there is no forecast (G-01: no error window, no empty box). */
export function WeatherCard({ className }: { className?: string }) {
  const { t } = useTranslation()
  const query = useApiQuery('weather.get', {}, { refetchInterval: 5 * 60_000 })
  const view = query.data
  if (!view?.enabled || !view.forecast) return null
  const forecast = view.forecast
  return (
    <SectionCard
      title={view.location.name ? t('weather.titleAt', { place: view.location.name }) : t('today.weather')}
      icon={CloudSunIcon}
      className={className}
      testId="weather-card"
      action={<WeatherAge view={view} />}
    >
      <div className="grid gap-4">
        <WeatherNow forecast={forecast} />
        <WeatherWeek days={forecast.days} />
        <WeatherAttribution forecast={forecast} />
      </div>
    </SectionCard>
  )
}
