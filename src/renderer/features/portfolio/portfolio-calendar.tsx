// Portföy takvimi (P21c, S-116): seçilen otelin takvimi, yalnız okunur. Masaüstünde takvim ekranının ızgarası
// (`CalendarGrid`; sürükleme, menü, seçim ve tıklama eylemleri verilmediği için hiçbiri çalışmaz); telefonda
// takvim ekranı gibi gün listesi (gelenler, çıkanlar, kalanlar, boş odalar). Veri `portfolio.grid`: kullanımdaki otel
// canlı, öteki otel bu bilgisayardaki kopyadan; kopyanın tarihi görünür.
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  BedDoubleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DoorOpenIcon,
  LogInIcon,
  LogOutIcon
} from 'lucide-react'
import { STATUS_KEYS } from '@shared/contract'
import { addDays, diffDays, type LocalDate } from '@shared/date'
import { Legend, type LegendItem } from '@/components/legend'
import { ErrorState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { CalendarGrid, type RoomIssueMark } from '@/features/calendar/calendar-grid'
import {
  dayActivity,
  monthStart,
  statusSetup,
  type GridPage,
  type GridStayView
} from '@/features/calendar/grid-model'
import { useFormat } from '@/hooks/use-format'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import { SourceBadge } from './source-badge'
import { usePortfolioGrid } from './use-portfolio'

/** Takvim bugünden bir ay önce başlar, on dört ay sonrasına kadar uzar (portföy bakışı; ayrıntı için otele geçilir). */
const MONTHS_BACK = 1
const DAYS_SHOWN = 14 * 31
const CONTEXT_DAYS = 3
const PREFETCH_DAYS = 31

const SECTIONS = [
  { key: 'arrivals', Icon: LogInIcon },
  { key: 'departures', Icon: LogOutIcon },
  { key: 'staying', Icon: BedDoubleIcon }
] as const

const NO_ISSUES: ReadonlyMap<string, RoomIssueMark> = new Map()
const NOTHING = (): void => undefined

function windowOf(today: LocalDate): { base: LocalDate; count: number } {
  let base = monthStart(today)
  for (let i = 0; i < MONTHS_BACK; i++) base = monthStart(addDays(base, -1))
  return { base, count: DAYS_SHOWN }
}

export function PortfolioCalendar({ hotel, today }: { hotel: string | null; today: LocalDate }) {
  const isMobile = useIsMobile()
  return isMobile ? (
    <PortfolioDayList hotel={hotel} today={today} />
  ) : (
    <PortfolioGridView key={hotel ?? '_own'} hotel={hotel} today={today} />
  )
}

function PortfolioGridView({ hotel, today }: { hotel: string | null; today: LocalDate }) {
  const { t } = useTranslation()
  const { base, count } = useMemo(() => windowOf(today), [today])
  const [initialCol] = useState(() => diffDays(base, today) - CONTEXT_DAYS)
  const [view, setView] = useState({ first: Math.max(0, initialCol), visible: 31 })
  const onView = useCallback(
    (first: number, visible: number) =>
      setView((prev) => (prev.first === first && prev.visible === visible ? prev : { first, visible })),
    []
  )
  const data = usePortfolioGrid(
    hotel,
    addDays(base, Math.max(0, view.first - PREFETCH_DAYS)),
    addDays(base, Math.min(count, view.first + view.visible + PREFETCH_DAYS))
  )
  const setup = useMemo(() => statusSetup(undefined), [])
  const legend = useLegend()

  if (data.error) return <ErrorState error={data.error} onRetry={data.refetch} />
  if (data.isPending)
    return (
      <div role="status" aria-busy className="grid gap-2" data-testid="portfolio-calendar-loading">
        <span className="sr-only">{t('common.loading')}</span>
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  if (data.model.rooms.length === 0)
    return (
      <p className="text-muted-foreground text-sm" data-testid="portfolio-calendar-empty">
        {t('portfolio.calendar.noRooms')}
      </p>
    )
  return (
    <div className="grid gap-3" data-testid="portfolio-calendar">
      <SourceBadge source={data.source} syncedAt={data.syncedAt} />
      <CalendarGrid
        model={data.model}
        base={base}
        count={count}
        today={data.model.today ?? today}
        initialCol={initialCol}
        setup={setup}
        legend={legend}
        highlight={[]}
        free={null}
        flashStayId={null}
        onOpenStay={NOTHING}
        onOpenCell={NOTHING}
        onOpenBlock={NOTHING}
        issues={NO_ISSUES}
        onOpenDay={NOTHING}
        onView={onView}
      />
      <Legend items={legend} />
      <p className="text-muted-foreground text-xs">{t('portfolio.calendar.readOnlyHint')}</p>
    </div>
  )
}

/** The automatic statuses with their words; a hotel's own colour tags are not carried here. */
function useLegend(): LegendItem[] {
  const { t } = useTranslation()
  return useMemo(
    () =>
      STATUS_KEYS.map((code) => ({
        id: code,
        subject: { kind: 'auto' as const, code },
        label: t(`status.${code}`),
        description: null
      })),
    [t]
  )
}

function PortfolioDayList({ hotel, today }: { hotel: string | null; today: LocalDate }) {
  const { t } = useTranslation()
  const f = useFormat()
  const [picked, setPicked] = useState<LocalDate | null>(null)
  const day = picked ?? today
  // The day before as well: a departure's last night is the day before it.
  const data = usePortfolioGrid(hotel, addDays(day, -1), addDays(day, 1))
  const activity = useMemo(() => {
    const page = { ...data.model, days: [] } as unknown as GridPage
    return data.model.rooms.length ? dayActivity(page, day) : null
  }, [data.model, day])
  const roomNumber = (s: GridStayView): string =>
    data.model.rooms.find((r) => r.id === s.roomId)?.number ?? ''

  const section = (
    key: 'arrivals' | 'departures' | 'staying',
    items: GridStayView[],
    Icon: typeof LogInIcon
  ) => (
    <section key={key} aria-labelledby={`pf-day-${key}`} className="grid gap-2">
      <h3 id={`pf-day-${key}`} className="flex items-center gap-2 text-sm font-semibold">
        <Icon className="text-muted-foreground size-4" aria-hidden />
        {t(`calendar.day.${key}`, { count: items.length })}
      </h3>
      {items.length ? (
        <ul className="grid gap-2">
          {items.map((s) => (
            <li key={s.id} className="bg-card flex min-h-14 items-center gap-3 rounded-xl border px-3 py-2">
              <span className="bg-muted grid size-10 shrink-0 place-items-center rounded-lg text-sm font-semibold tabular-nums">
                {roomNumber(s)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 text-sm font-medium break-words">{s.guestName}</span>
                <span className="text-muted-foreground block text-xs whitespace-nowrap">
                  {f.dayMonth(s.checkIn)} – {f.dayMonth(s.checkOut)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">{t('calendar.day.none')}</p>
      )}
    </section>
  )

  return (
    <div className="grid gap-4" data-testid="portfolio-day-list">
      <SourceBadge source={data.source} syncedAt={data.syncedAt} />
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="outline"
          size="icon"
          aria-label={t('calendar.previousDay')}
          onClick={() => setPicked(addDays(day, -1))}
        >
          <ChevronLeftIcon className="rtl:rotate-180" />
        </Button>
        <button
          type="button"
          onClick={() => setPicked(null)}
          className={cn(
            'focus-visible:ring-ring min-h-11 min-w-0 flex-1 rounded-md text-center outline-none focus-visible:ring-[3px]',
            day === today && 'text-primary'
          )}
        >
          <span className="block text-base font-semibold">{f.date(day, 'full')}</span>
          {day !== today ? (
            <span className="text-muted-foreground text-xs">{t('calendar.backToToday')}</span>
          ) : null}
        </button>
        <Button
          variant="outline"
          size="icon"
          aria-label={t('calendar.nextDay')}
          onClick={() => setPicked(addDays(day, 1))}
        >
          <ChevronRightIcon className="rtl:rotate-180" />
        </Button>
      </div>
      {data.error ? (
        <ErrorState error={data.error} onRetry={data.refetch} />
      ) : data.isPending ? (
        <div role="status" aria-busy className="grid gap-2">
          <span className="sr-only">{t('common.loading')}</span>
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : !activity ? (
        <p className="text-muted-foreground text-sm">{t('portfolio.calendar.noRooms')}</p>
      ) : (
        <>
          {SECTIONS.map(({ key, Icon }) => section(key, activity[key], Icon))}
          <section aria-labelledby="pf-day-free" className="grid gap-2">
            <h3 id="pf-day-free" className="flex items-center gap-2 text-sm font-semibold">
              <DoorOpenIcon className="text-muted-foreground size-4" aria-hidden />
              {t('calendar.day.free', { count: activity.free.length })}
            </h3>
            <p className="flex flex-wrap gap-1.5">
              {activity.free.map((r) => (
                <span key={r.id} className="bg-muted rounded-md px-2 py-1 text-sm font-medium tabular-nums">
                  {r.number}
                </span>
              ))}
            </p>
          </section>
        </>
      )}
      <p className="text-muted-foreground text-xs">{t('portfolio.calendar.readOnlyHint')}</p>
    </div>
  )
}
