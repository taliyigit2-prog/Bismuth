// Parked reservations (faz-05 madde 4; G-39): below the grid, on no room — refund pending, postponed, no-show paid.
// Each shows what was paid; it opens in the panel, goes back onto the calendar ("Takvime al"), takes a refund, or is
// closed for good: "Gelmedi" or cancelled (G-42; nothing is deleted).
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MoreHorizontalIcon, ParkingSquareIcon, Undo2Icon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/states'
import { useFormat } from '@/hooks/use-format'
import { useApiQuery } from '@/lib/api/hooks'
import { useCan } from '@/lib/view-as'
import { requestPanel } from './booking-api'
import { PaymentDialog } from './payment-dialog'
import { CancelDialog, NoShowDialog, UnparkDialog } from './stay-dialogs'

type Parked = NonNullable<ReturnType<typeof useParked>['data']>[number]

const useParked = () => useApiQuery('booking.listParked', {})

export function ParkArea({
  onOpenReservation
}: {
  /** Opens a parked reservation; without it the reservation panel opens on it by itself (requestPanel). */
  onOpenReservation?: (reservationId: string) => void
  /** Earlier connection points of the calendar screen (Faz 3 mock-up): the list is read here, the panel opens itself. */
  hotel?: unknown
  parked?: unknown
  onOpen?: unknown
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const can = useCan()
  const query = useParked()
  const [restoring, setRestoring] = useState<Parked | null>(null)
  const [refunding, setRefunding] = useState<Parked | null>(null)
  const [closing, setClosing] = useState<{ parked: Parked; as: 'cancel' | 'noShow' } | null>(null)
  const items = query.data ?? []
  const open = (p: Parked): void => (onOpenReservation ? onOpenReservation(p.id) : requestPanel(p.id))
  return (
    <Card className="gap-3 py-4" data-testid="park-area">
      <CardHeader className="px-4">
        <CardTitle className="flex items-center gap-2 text-sm">
          <ParkingSquareIcon className="text-muted-foreground size-4" aria-hidden />
          {t('calendar.park.title', { count: items.length })}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4">
        {query.isPending ? (
          <div role="status" aria-busy className="grid gap-2 md:grid-cols-2">
            <span className="sr-only">{t('common.loading')}</span>
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : items.length ? (
          <ul className="grid gap-2 md:grid-cols-2">
            {items.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2"
                data-testid={`parked-${p.code}`}
              >
                <button
                  type="button"
                  onClick={() => open(p)}
                  className="focus-visible:ring-ring min-w-0 flex-1 rounded-sm text-start outline-none focus-visible:ring-[3px]"
                >
                  <span className="block truncate text-sm font-medium">{p.guestName}</span>
                  <span className="text-muted-foreground block truncate text-xs">
                    {p.stays.length
                      ? `${p.stays.map((s) => s.roomNumber).join(', ')} · ${f.dayMonth(p.stays[0]!.checkIn)}`
                      : p.code}
                    {p.parkedNote ? ` · ${p.parkedNote}` : ''}
                  </span>
                </button>
                {p.parkedReason ? (
                  <Badge variant="outline">{t(`calendar.park.reason.${p.parkedReason}`)}</Badge>
                ) : null}
                <span className="text-sm font-medium tabular-nums" title={t('booking.park.paid')}>
                  <bdi>{f.money(p.creditedMinor, p.currency)}</bdi>
                </span>
                {can('calendar', 'edit') ? (
                  <Button size="sm" variant="ghost" onClick={() => setRestoring(p)}>
                    <Undo2Icon aria-hidden />
                    {t('calendar.park.restore')}
                  </Button>
                ) : null}
                {can('payments.refund', 'edit') && p.creditedMinor > 0 ? (
                  <Button size="sm" variant="ghost" onClick={() => setRefunding(p)}>
                    {t('booking.park.refund')}
                  </Button>
                ) : null}
                {can('calendar', 'edit') ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={t('booking.park.more')}
                        data-testid={`parked-more-${p.code}`}
                      >
                        <MoreHorizontalIcon aria-hidden />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onSelect={() => setClosing({ parked: p, as: 'noShow' })}
                        data-testid="parked-no-show"
                      >
                        {t('booking.noShow.confirm')}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={() => setClosing({ parked: p, as: 'cancel' })}
                        data-testid="parked-cancel"
                      >
                        {t('booking.cancel.confirm')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">{t('calendar.park.empty')}</p>
        )}
      </CardContent>
      {restoring ? (
        <UnparkDialog parked={restoring} open onOpenChange={(o) => !o && setRestoring(null)} />
      ) : null}
      {closing?.as === 'noShow' ? (
        <NoShowDialog
          key={closing.parked.id}
          reservationId={closing.parked.id}
          open
          onOpenChange={(o) => !o && setClosing(null)}
        />
      ) : null}
      {closing?.as === 'cancel' ? (
        <CancelDialog
          key={closing.parked.id}
          reservationId={closing.parked.id}
          open
          onOpenChange={(o) => !o && setClosing(null)}
        />
      ) : null}
      {refunding ? (
        <PaymentDialog
          open
          onOpenChange={(o) => !o && setRefunding(null)}
          reservationId={refunding.id}
          defaultMinor={refunding.creditedMinor}
          folioCurrency={refunding.currency}
          channelId={null}
          defaultKind="refund"
        />
      ) : null}
    </Card>
  )
}
