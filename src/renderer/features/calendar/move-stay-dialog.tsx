// "Rezervasyon taşınsın mı?" (faz-15 madde 12): a bar dropped on another room or other dates is moved only after
// this question — another room with the panel's own `booking.changeRoom`, other dates with `booking.moveDates`
// (every night with its own price: the total stays the same). The service checks conflicts, blocks and rights; a
// refusal says why (which room, which nights), and a block or a room not for sale can be overruled with a reason by
// whoever may close rooms.
import { useTranslation } from 'react-i18next'
import type { ProcedureInput } from '@shared/contract'
import type { LocalDate } from '@shared/date'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { useFormat } from '@/hooks/use-format'
import { useBookingMutation } from './booking-api'
import type { StayMove } from './drag'
import { OverrideDialog } from './override-dialog'
import { useBlockOverride } from './override'

export function MoveStayDialog({
  move,
  rooms,
  today,
  onDone
}: {
  move: StayMove | null
  rooms: readonly { id: string; number: string }[]
  today: LocalDate
  onDone: () => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const roomOverride = useBlockOverride<ProcedureInput<'booking.changeRoom'>>()
  const datesOverride = useBlockOverride<ProcedureInput<'booking.moveDates'>>()
  const room = useBookingMutation('booking.changeRoom', {
    success: t('booking.toast.roomChanged'),
    onError: roomOverride.onError
  })
  // The nights move with their own prices (one call, one transaction): the total does not change.
  const dates = useBookingMutation('booking.moveDates', {
    success: t('booking.toast.datesSaved'),
    onError: datesOverride.onError
  })
  const number = (id: string): string => rooms.find((r) => r.id === id)?.number ?? '—'
  const range = (from: LocalDate, to: LocalDate): string => `${f.dayMonth(from)} – ${f.date(to, 'medium')}`
  const s = move?.stay
  // A guest already in the house moves from today on (the nights before stay where they were).
  const fromToday = !!s && s.stayStatus === 'in_house' && today > s.checkIn
  const body = !move
    ? ''
    : move.kind === 'room'
      ? t(fromToday ? 'calendar.move.roomBodyFromToday' : 'calendar.move.roomBody', {
          guest: move.stay.guestName,
          from: number(move.fromRoomId),
          to: number(move.toRoomId),
          dates: range(fromToday ? today : move.stay.checkIn, move.stay.checkOut)
        })
      : t('calendar.move.datesBody', {
          guest: move.stay.guestName,
          room: number(move.stay.roomId),
          from: range(move.stay.checkIn, move.stay.checkOut),
          to: range(move.checkIn, move.checkOut)
        })
  const confirm = (): void => {
    if (!move) return
    if (move.kind === 'room')
      room.mutate({
        stayId: move.stay.id,
        change: { newRoomId: move.toRoomId, ...(fromToday ? { fromDate: today } : {}) }
      })
    else dates.mutate({ stayId: move.stay.id, move: { checkIn: move.checkIn } })
    onDone()
  }
  return (
    <>
      <AlertDialog open={move !== null} onOpenChange={(o) => !o && onDone()}>
        <AlertDialogContent data-testid="move-stay-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('calendar.move.title')}</AlertDialogTitle>
            <AlertDialogDescription>{body}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirm} data-testid="move-stay-confirm">
              {t('calendar.move.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <OverrideDialog
        override={roomOverride}
        onConfirm={(input, reason) =>
          room.mutate({ ...input, change: { ...input.change, overrideBlockReason: reason } })
        }
      />
      <OverrideDialog
        override={datesOverride}
        onConfirm={(input, reason) =>
          dates.mutate({ ...input, move: { ...input.move, overrideBlockReason: reason } })
        }
      />
    </>
  )
}
