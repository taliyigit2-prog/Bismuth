// A room's capacity history inside its dialog (Ayarlar → Odalar; K-27): every change of beds, "for sale" and "in
// use" with the day it counts from, newest first. A planned change (a later day) can be withdrawn; a change that
// has started stays (enter a new one instead), and so does the one that opened the room. Withdrawn and replaced
// changes stay in the list, struck through.
import { useTranslation } from 'react-i18next'
import { HistoryIcon, Undo2Icon } from 'lucide-react'
import type { RoomView } from '@shared/contract'
import { today as todayOf, type LocalDate } from '@shared/date'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/states'
import { useFormat } from '@/hooks/use-format'
import { useApiQuery } from '@/lib/api/hooks'
import { cn } from '@/lib/utils'
import { useAdminMutation } from './use-admin'
import { useCapacitySummary } from './use-capacity-summary'

export function CapacityHistory({ room, canEdit }: { room: RoomView; canEdit: boolean }) {
  const { t } = useTranslation()
  const f = useFormat()
  const summary = useCapacitySummary()
  const history = useApiQuery('rooms.capacityHistory', { roomId: room.id })
  const withdraw = useAdminMutation('rooms.cancelCapacityChange', {
    invalidate: ['rooms.capacityHistory', 'rooms.list'],
    success: t('settings.rooms.capacity.withdrawn')
  })
  const today = todayOf()
  const rows = history.data ?? []
  const firstLive = [...rows].reverse().find((c) => !c.cancelledAt)

  return (
    <section className="grid gap-2" aria-labelledby="capacity-history-title" data-testid="capacity-history">
      <h3 id="capacity-history-title" className="flex items-center gap-2 text-sm font-medium">
        <HistoryIcon className="text-muted-foreground size-4" aria-hidden />
        {t('settings.rooms.capacity.title')}
      </h3>
      {history.isPending ? (
        <Skeleton className="h-16 w-full" />
      ) : history.isError ? (
        <ErrorState error={history.error} onRetry={() => void history.refetch()} />
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('settings.rooms.capacity.empty')}</p>
      ) : (
        <ul className="grid gap-1.5">
          {rows.map((c) => {
            const planned = !c.cancelledAt && c.validFrom > today
            const canWithdraw = canEdit && planned && c.id !== firstLive?.id
            return (
              <li
                key={c.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-2 text-sm"
                data-testid={`capacity-${c.validFrom}`}
              >
                <span className={cn('grid min-w-0 flex-1 basis-48 gap-0.5', c.cancelledAt && 'opacity-60')}>
                  <span className={cn('font-medium', c.cancelledAt && 'line-through')}>
                    {t('settings.rooms.capacity.from', { date: f.date(c.validFrom as LocalDate) })}
                    {' · '}
                    {summary(c)}
                  </span>
                  {c.note ? (
                    <span className="text-muted-foreground text-xs break-words">{c.note}</span>
                  ) : null}
                </span>
                {c.cancelledAt ? (
                  <Badge variant="outline">{t('settings.rooms.capacity.cancelled')}</Badge>
                ) : planned ? (
                  <Badge variant="secondary">{t('settings.rooms.capacity.planned')}</Badge>
                ) : null}
                {canWithdraw ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={withdraw.isPending}
                    onClick={() => withdraw.mutate({ id: c.id })}
                    data-testid={`withdraw-${c.validFrom}`}
                  >
                    <Undo2Icon aria-hidden />
                    {t('settings.rooms.capacity.withdraw')}
                  </Button>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
      {!history.isPending && rows.length > 0 && room.nextChange == null && room.opensOn == null ? (
        <p className="text-muted-foreground text-xs">{t('settings.rooms.capacity.help')}</p>
      ) : null}
    </section>
  )
}
