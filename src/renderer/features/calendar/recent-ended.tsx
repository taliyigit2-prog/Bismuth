// "Son iptaller" (P17c, 04 §3): cancelled and "gelmedi" reservations leave the grid, so the last seven days are
// listed here, newest first; a row opens the reservation. Nothing is deleted: the full record stays on the guest card
// (Misafir kartı → Geçmiş).
import { useTranslation } from 'react-i18next'
import { HistoryIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import { useFormat } from '@/hooks/use-format'
import { useApiQuery } from '@/lib/api/hooks'
import { localDateOf } from '@shared/date'

export const RECENT_DAYS = 7

export function RecentEnded({ onOpenReservation }: { onOpenReservation: (reservationId: string) => void }) {
  const { t } = useTranslation()
  const f = useFormat()
  const query = useApiQuery('reservations.recentEnded', { days: RECENT_DAYS }, { staleTime: 30_000 })
  const rows = query.data ?? []
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" data-testid="recent-ended-open">
          <HistoryIcon aria-hidden />
          {t('calendar.quick.recent.button')}
          {rows.length ? (
            <Badge variant="secondary" className="ms-1" data-testid="recent-ended-count">
              {rows.length}
            </Badge>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)] p-3" data-testid="recent-ended">
        <h2 className="text-sm font-semibold">{t('calendar.quick.recent.title', { days: RECENT_DAYS })}</h2>
        {query.isPending ? (
          <div role="status" aria-busy className="mt-2 grid gap-2">
            <span className="sr-only">{t('common.loading')}</span>
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : query.isError ? (
          <p className="text-destructive mt-2 text-sm" role="alert">
            {t('calendar.quick.recent.failed')}{' '}
            <Button size="xs" variant="outline" onClick={() => void query.refetch()}>
              {t('errors.retry')}
            </Button>
          </p>
        ) : rows.length ? (
          <ul className="mt-2 grid max-h-80 gap-1 overflow-y-auto">
            {rows.map((r) => (
              <li key={r.reservationId}>
                <button
                  type="button"
                  onClick={() => onOpenReservation(r.reservationId)}
                  className="hover:bg-accent focus-visible:ring-ring grid w-full gap-0.5 rounded-md px-2 py-1.5 text-start text-sm outline-none focus-visible:ring-[3px] max-md:min-h-11"
                  data-testid={`recent-${r.code}`}
                >
                  <span className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate font-medium">{r.guestName}</span>
                    <Badge variant="outline">{t(`calendar.quick.recent.status.${r.status}`)}</Badge>
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {t(
                      r.checkIn && r.checkOut
                        ? 'calendar.quick.recent.metaDates'
                        : 'calendar.quick.recent.meta',
                      {
                        place: r.rooms.length
                          ? t('calendar.quick.recent.rooms', { rooms: r.rooms.join(', ') })
                          : r.code,
                        from: r.checkIn ? f.dayMonth(r.checkIn) : '',
                        to: r.checkOut ? f.dayMonth(r.checkOut) : '',
                        ended: f.dayMonth(localDateOf(new Date(r.endedAt)))
                      }
                    )}
                  </span>
                  {r.reason ? <span className="text-xs break-words">{r.reason}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground mt-2 text-sm">{t('calendar.quick.recent.empty')}</p>
        )}
        <p className="text-muted-foreground mt-3 text-xs">{t('calendar.quick.recent.note')}</p>
      </PopoverContent>
    </Popover>
  )
}
