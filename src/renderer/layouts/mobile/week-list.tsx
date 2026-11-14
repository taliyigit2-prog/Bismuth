// The calendar's seven-day view on the phone (faz-13 madde 6; tasarim §8: no ten-year grid on a phone): one card per
// day with who arrives and who leaves (room and name, tap to open the reservation) and how many rooms stay free,
// read from the same `reservations.grid` service as the desktop grid. Arrows move a week; the title goes back to
// today.
import { useCan } from '@/lib/view-as'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarDaysIcon, ChevronLeftIcon, ChevronRightIcon, LogInIcon, LogOutIcon } from 'lucide-react'
import { addDays, today as todayOf, type LocalDate } from '@shared/date'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState, ErrorState } from '@/components/states'
import { useFormat } from '@/hooks/use-format'
import { useApiQuery } from '@/lib/api/hooks'
import { cn } from '@/lib/utils'
import { StayContextMenu } from '@/features/calendar/context-menu'
import type { GridStayView } from '@/features/calendar/grid-model'
import { WEEK_DAYS, weekOf } from './week'

export function WeekList({ onOpen }: { onOpen: (reservationId: string) => void }) {
  const { t } = useTranslation()
  const can = useCan()
  const f = useFormat()
  const [clientToday] = useState(todayOf)
  const [picked, setPicked] = useState<LocalDate | null>(null)
  const start = picked ?? clientToday
  // The day before too: a departure's last night belongs to it.
  const query = useApiQuery(
    'reservations.grid',
    { from: addDays(start, -1), to: addDays(start, WEEK_DAYS) },
    { enabled: can('calendar') }
  )
  const page = query.data
  const days = useMemo(() => (page ? weekOf(page, start) : null), [page, start])
  const roomNumber = (s: GridStayView): string => page?.rooms.find((r) => r.id === s.roomId)?.number ?? ''

  const line = (s: GridStayView, arrival: boolean) => {
    const Icon = arrival ? LogInIcon : LogOutIcon
    return (
      <li key={`${arrival ? 'a' : 'd'}-${s.id}`}>
        <StayContextMenu stay={s} today={page?.today ?? s.checkIn}>
          <button
            type="button"
            onClick={() => onOpen(s.reservationId)}
            className="hover:bg-accent focus-visible:ring-ring flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-start text-sm outline-none focus-visible:ring-[3px]"
          >
            <Icon
              className={cn('size-4 shrink-0', arrival ? 'text-success' : 'text-muted-foreground')}
              aria-label={arrival ? t('calendar.week.arrival') : t('calendar.week.departure')}
            />
            <span className="bg-muted grid min-w-9 shrink-0 place-items-center rounded px-1 font-semibold tabular-nums">
              {roomNumber(s)}
            </span>
            <span className="min-w-0 flex-1 truncate" title={s.guestName}>
              {s.guestName}
            </span>
          </button>
        </StayContextMenu>
      </li>
    )
  }

  return (
    <div className="grid gap-4" data-testid="week-list">
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="outline"
          size="icon"
          aria-label={t('calendar.week.previous')}
          onClick={() => setPicked(addDays(start, -WEEK_DAYS))}
        >
          <ChevronLeftIcon className="rtl:rotate-180" />
        </Button>
        <button
          type="button"
          onClick={() => setPicked(null)}
          className="focus-visible:ring-ring min-h-11 min-w-0 flex-1 rounded-md text-center outline-none focus-visible:ring-[3px]"
        >
          <span className="block text-base font-semibold">
            {f.dayMonth(start)} – {f.dayMonth(addDays(start, WEEK_DAYS - 1))}
          </span>
          {picked ? <span className="text-muted-foreground text-xs">{t('calendar.backToToday')}</span> : null}
        </button>
        <Button
          variant="outline"
          size="icon"
          aria-label={t('calendar.week.next')}
          onClick={() => setPicked(addDays(start, WEEK_DAYS))}
        >
          <ChevronRightIcon className="rtl:rotate-180" />
        </Button>
      </div>
      {query.isPending ? (
        <div role="status" aria-busy className="grid gap-2">
          <span className="sr-only">{t('common.loading')}</span>
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : !page || !days ? null : page.rooms.length === 0 ? (
        <EmptyState
          icon={CalendarDaysIcon}
          title={t('calendar.noRoomsTitle')}
          body={t('calendar.noRoomsBody')}
        />
      ) : (
        <ol className="grid gap-3">
          {days.map(({ day, arrivals, departures, free }) => (
            <li
              key={day}
              className={cn(
                'bg-card grid gap-1 rounded-xl border p-3',
                day === page.today && 'border-primary'
              )}
              data-testid="week-day"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <h2 className={cn('text-sm font-semibold', day === page.today && 'text-primary')}>
                  {f.date(day, 'full')}
                </h2>
                <span className="text-muted-foreground text-xs">
                  {t('calendar.day.free', { count: free.length })}
                </span>
              </div>
              {arrivals.length + departures.length ? (
                <ul className="grid">
                  {arrivals.map((s) => line(s, true))}
                  {departures.map((s) => line(s, false))}
                </ul>
              ) : (
                <p className="text-muted-foreground text-sm">{t('calendar.week.quiet')}</p>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
