// The calendar on the phone (G-143, faz-05 "mobilde gün/oda listesi"): no ten-year grid, a day list — arrivals,
// departures, staying, free rooms — read from the same `reservations.grid` service as the desktop grid, with the
// night's payment status on each card. Arrows move a day; the date goes back to today. Faz 13 completes it.
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  BedDoubleIcon,
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DoorOpenIcon,
  LogInIcon,
  LogOutIcon
} from 'lucide-react'
import { addDays, today as todayOf, type LocalDate } from '@shared/date'
import { useShortcutAction } from '@/lib/shortcuts/actions'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState, ErrorState } from '@/components/states'
import { StatusTagBadge } from '@/components/status-tag-badge'
import { useFormat } from '@/hooks/use-format'
import { useApiQuery } from '@/lib/api/hooks'
import { cn } from '@/lib/utils'
import { dayActivity, nightStatusOn, type GridStayView } from './grid-model'

type Section = 'arrivals' | 'departures' | 'staying'

const SECTIONS = [
  { key: 'arrivals', Icon: LogInIcon },
  { key: 'departures', Icon: LogOutIcon },
  { key: 'staying', Icon: BedDoubleIcon }
] as const

export function DayList({ onOpen }: { onOpen: (reservationId: string) => void }) {
  const { t } = useTranslation()
  const f = useFormat()
  const [picked, setPicked] = useState<LocalDate | null>(null)
  const [clientToday] = useState(todayOf)
  // Until the first answer the phone's own date stands in for the hotel's.
  const [hotelToday, setHotelToday] = useState<LocalDate | null>(null)
  const today = hotelToday ?? clientToday
  const day = picked ?? today
  // T (lib/shortcuts): a phone with a keyboard goes back to today as well.
  useShortcutAction('goToday', () => setPicked(null))
  // The day before as well: a departure's last night is the day before it.
  const query = useApiQuery('reservations.grid', { from: addDays(day, -1), to: addDays(day, 1) })
  const page = query.data
  if (page && !hotelToday && page.today !== clientToday) setHotelToday(page.today)
  const activity = useMemo(() => (page ? dayActivity(page, day) : null), [page, day])

  const header = (
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
  )

  const section = (key: Section, items: GridStayView[], Icon: typeof LogInIcon) => (
    <section key={key} aria-labelledby={`day-${key}`} className="grid gap-2">
      <h2 id={`day-${key}`} className="flex items-center gap-2 text-sm font-semibold">
        <Icon className="text-muted-foreground size-4" aria-hidden />
        {t(`calendar.day.${key}`, { count: items.length })}
      </h2>
      {items.length ? (
        <ul className="grid gap-2">
          {items.map((s) => {
            const room = page?.rooms.find((r) => r.id === s.roomId)
            const status = nightStatusOn(s, day, today)
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => onOpen(s.reservationId)}
                  className="bg-card focus-visible:ring-ring flex min-h-14 w-full items-center gap-3 rounded-xl border px-3 py-2 text-start outline-none focus-visible:ring-[3px]"
                >
                  <span className="bg-muted grid size-10 shrink-0 place-items-center rounded-lg text-sm font-semibold tabular-nums">
                    {room?.number}
                  </span>
                  {/* The name wraps (two lines at most) instead of being cut; the guest's request sits under it. */}
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-sm font-medium break-words">{s.guestName}</span>
                    <span className="text-muted-foreground block text-xs whitespace-nowrap">
                      {s.startTime && s.endTime ? (
                        <bdi className="tabular-nums" data-testid={`day-hours-${s.id}`}>
                          {f.dayMonth(s.checkIn)} · {s.startTime}–{s.endTime}
                        </bdi>
                      ) : (
                        <>
                          {f.dayMonth(s.checkIn)} – {f.dayMonth(s.checkOut)}
                        </>
                      )}
                    </span>
                    {key === 'arrivals' && s.standingNote ? (
                      <span
                        className={cn(
                          'block text-xs break-words',
                          s.standingNote.level === 'warn' ? 'text-destructive' : 'text-info'
                        )}
                      >
                        {s.standingNote.text}
                      </span>
                    ) : null}
                  </span>
                  {status ? (
                    <StatusTagBadge subject={{ kind: 'auto', code: status }} label={t(`status.${status}`)} />
                  ) : null}
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">{t('calendar.day.none')}</p>
      )}
    </section>
  )

  return (
    <div className="grid gap-5" data-testid="day-list">
      {header}
      {query.isPending ? (
        <div role="status" aria-busy className="grid gap-2">
          <span className="sr-only">{t('common.loading')}</span>
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : !page || !activity ? null : page.rooms.length === 0 ? (
        <EmptyState
          icon={CalendarDaysIcon}
          title={t('calendar.noRoomsTitle')}
          body={t('calendar.noRoomsBody')}
        />
      ) : (
        <>
          {SECTIONS.map(({ key, Icon }) => section(key, activity[key], Icon))}
          <section aria-labelledby="day-free" className="grid gap-2">
            <h2 id="day-free" className="flex items-center gap-2 text-sm font-semibold">
              <DoorOpenIcon className="text-muted-foreground size-4" aria-hidden />
              {t('calendar.day.free', { count: activity.free.length })}
            </h2>
            <p className="flex flex-wrap gap-1.5" data-testid="day-free-rooms">
              {activity.free.map((r) => (
                <span key={r.id} className="bg-muted rounded-md px-2 py-1 text-sm font-medium tabular-nums">
                  {r.number}
                </span>
              ))}
            </p>
          </section>
        </>
      )}
    </div>
  )
}
