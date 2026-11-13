// Today strip above the calendar grid (P17c, G-195): "Bugün gelecekler N · Gidecekler N · Otelde N" from the same
// `today.summary` the Today screen reads. Arrivals and departures open a short list; a row opens the reservation.
// A user who may not see them (the summary answers null for that part) gets no strip.
import { useTranslation } from 'react-i18next'
import { BedDoubleIcon, LogInIcon, LogOutIcon } from 'lucide-react'
import type { DayStayDto } from '@shared/contract/procedures/today'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import { useApiQuery } from '@/lib/api/hooks'

function DayList({
  rows,
  done,
  empty,
  onOpen
}: {
  rows: readonly DayStayDto[]
  done: (row: DayStayDto) => boolean
  empty: string
  onOpen: (reservationId: string) => void
}) {
  const { t } = useTranslation()
  if (!rows.length) return <p className="text-muted-foreground p-2 text-sm">{empty}</p>
  return (
    <ul className="grid gap-1">
      {rows.map((row) => (
        <li key={row.stayId}>
          <button
            type="button"
            onClick={() => onOpen(row.reservationId)}
            className="hover:bg-accent focus-visible:ring-ring flex min-h-9 w-full items-center gap-2 rounded-md px-2 py-1 text-start text-sm outline-none focus-visible:ring-[3px] max-md:min-h-11"
            data-testid={`today-row-${row.stayId}`}
          >
            <span className="bg-muted min-w-10 rounded-md px-1.5 py-0.5 text-center text-xs font-semibold tabular-nums">
              {row.roomNumber}
            </span>
            <span className="min-w-0 flex-1 truncate">{row.guestName}</span>
            {done(row) ? (
              <span className="text-muted-foreground text-xs">{t('calendar.quick.today.done')}</span>
            ) : null}
          </button>
        </li>
      ))}
    </ul>
  )
}

export function TodayStrip({ onOpenReservation }: { onOpenReservation: (reservationId: string) => void }) {
  const { t } = useTranslation()
  const query = useApiQuery('today.summary', {}, { staleTime: 30_000 })
  if (query.isPending)
    return (
      <div role="status" aria-busy data-testid="today-strip-loading">
        <span className="sr-only">{t('common.loading')}</span>
        <Skeleton className="h-8 w-80 max-w-full" />
      </div>
    )
  if (query.isError)
    return (
      <p className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs" role="alert">
        {t('calendar.quick.today.failed')}
        <Button size="xs" variant="outline" onClick={() => void query.refetch()}>
          {t('errors.retry')}
        </Button>
      </p>
    )
  const { arrivals, departures, inHouse } = query.data
  if (!arrivals && !departures && !inHouse) return null
  return (
    <div
      className="flex flex-wrap items-center gap-2"
      data-testid="today-strip"
      role="group"
      aria-label={t('calendar.quick.today.label')}
    >
      {arrivals ? (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" data-testid="today-arrivals">
              <LogInIcon aria-hidden />
              {t('calendar.quick.today.arrivals', { count: arrivals.length })}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-1">
            <DayList
              rows={arrivals}
              done={(r) => r.checkedInAt !== null}
              empty={t('today.noArrivals')}
              onOpen={onOpenReservation}
            />
          </PopoverContent>
        </Popover>
      ) : null}
      {departures ? (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" data-testid="today-departures">
              <LogOutIcon aria-hidden />
              {t('calendar.quick.today.departures', { count: departures.length })}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-1">
            <DayList
              rows={departures}
              done={(r) => r.checkedOutAt !== null}
              empty={t('today.noDepartures')}
              onOpen={onOpenReservation}
            />
          </PopoverContent>
        </Popover>
      ) : null}
      {inHouse ? (
        <p className="text-muted-foreground flex items-center gap-1.5 text-sm" data-testid="today-inhouse">
          <BedDoubleIcon className="size-4" aria-hidden />
          {t('calendar.quick.today.inHouse', { count: inHouse.rooms })}
        </p>
      ) : null}
    </div>
  )
}
