// The calendar's right-click menu (P17c, G-195): ten actions on a stay's bar and four on an empty cell, the same
// list on a phone by long press (day list rows). Every action is the panel's own: "Giriş yap" is the service call,
// the others open the reservation panel with the matching dialog (requestPanel + intent), so the rules, texts and
// refusals are written once. An action that does not apply to the stay's state is shown dimmed, not hidden, so the
// menu keeps its shape. The service decides rights again; the dimming only follows the user's rights.
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ArrowRightLeftIcon,
  BanknoteIcon,
  CalendarRangeIcon,
  ClockIcon,
  LockIcon,
  LogInIcon,
  LogOutIcon,
  MessageSquarePlusIcon,
  ParkingSquareIcon,
  PlusIcon,
  UndoIcon,
  UserRoundIcon,
  UserXIcon,
  ZapIcon
} from 'lucide-react'
import type { LocalDate } from '@shared/date'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { useFormat } from '@/hooks/use-format'
import { useCan } from '@/lib/view-as'
import { requestPanel, useBookingMutation } from './booking-api'
import type { GridStayView } from './grid-model'
import { intentOf, stayActions, type StayActionId } from './stay-actions'

const ICONS = {
  checkIn: LogInIcon,
  checkOut: LogOutIcon,
  pay: BanknoteIcon,
  move: ArrowRightLeftIcon,
  extend: CalendarRangeIcon,
  note: MessageSquarePlusIcon,
  park: ParkingSquareIcon,
  noShow: UserXIcon,
  giveUp: UndoIcon,
  guest: UserRoundIcon
} as const

const ORDER: readonly StayActionId[] = [
  'checkIn',
  'checkOut',
  'pay',
  'move',
  'extend',
  'note',
  'park',
  'noShow',
  'giveUp',
  'guest'
]

/** The items of a stay's menu, to be placed inside a `ContextMenuContent`. */
export function StayMenuItems({ stay, today }: { stay: GridStayView; today: LocalDate }) {
  const { t } = useTranslation()
  const can = useCan()
  const allowed = stayActions(stay, today, { edit: can('calendar', 'edit'), pay: can('payments', 'edit') })
  const checkIn = useBookingMutation('booking.checkIn', { success: t('booking.toast.checkedIn') })
  const run = (action: StayActionId): void => {
    if (action === 'checkIn') checkIn.mutate({ stayId: stay.id })
    else requestPanel(stay.reservationId, intentOf(action, stay))
  }
  return (
    <>
      <ContextMenuLabel className="max-w-64 truncate" data-testid="ctx-title">
        {stay.guestName}
      </ContextMenuLabel>
      <ContextMenuSeparator />
      {ORDER.map((action) => {
        const Icon = ICONS[action]
        return (
          <ContextMenuItem
            key={action}
            disabled={!allowed[action]}
            onSelect={() => run(action)}
            variant={action === 'giveUp' ? 'destructive' : 'default'}
            data-testid={`ctx-${action}`}
          >
            <Icon aria-hidden />
            {t(`calendar.quick.menu.${action}`)}
          </ContextMenuItem>
        )
      })}
    </>
  )
}

export interface CellMenuHandlers {
  onQuick: (roomId: string, date: LocalDate) => void
  onDetail: (roomId: string, date: LocalDate) => void
  onHourly: (roomId: string, date: LocalDate) => void
  onBlock: (roomId: string, date: LocalDate) => void
}

/** The items of an empty cell's menu. */
export function CellMenuItems({
  roomId,
  roomNumber,
  date,
  handlers,
  canBlock
}: {
  roomId: string
  roomNumber: string
  date: LocalDate
  handlers: CellMenuHandlers
  canBlock: boolean
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const can = useCan()
  const book = can('calendar', 'edit')
  return (
    <>
      <ContextMenuLabel className="max-w-64 truncate" data-testid="ctx-title">
        {t('calendar.quick.menu.cellTitle', { room: roomNumber, date: f.dayMonth(date) })}
      </ContextMenuLabel>
      <ContextMenuSeparator />
      <ContextMenuItem
        disabled={!book}
        onSelect={() => handlers.onQuick(roomId, date)}
        data-testid="ctx-quick"
      >
        <ZapIcon aria-hidden />
        {t('calendar.quick.menu.quick')}
      </ContextMenuItem>
      <ContextMenuItem
        disabled={!book}
        onSelect={() => handlers.onDetail(roomId, date)}
        data-testid="ctx-detail"
      >
        <PlusIcon aria-hidden />
        {t('calendar.quick.menu.detail')}
      </ContextMenuItem>
      <ContextMenuItem
        disabled={!book}
        onSelect={() => handlers.onHourly(roomId, date)}
        data-testid="ctx-hourly"
      >
        <ClockIcon aria-hidden />
        {t('calendar.quick.menu.hourly')}
      </ContextMenuItem>
      {canBlock ? (
        <ContextMenuItem onSelect={() => handlers.onBlock(roomId, date)} data-testid="ctx-block">
          <LockIcon aria-hidden />
          {t('calendar.quick.menu.block')}
        </ContextMenuItem>
      ) : null}
    </>
  )
}

/** A phone row (day list) with the same menu on a long press. */
export function StayContextMenu({
  stay,
  today,
  children
}: {
  stay: GridStayView
  today: LocalDate
  children: ReactNode
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-60">
        <StayMenuItems stay={stay} today={today} />
      </ContextMenuContent>
    </ContextMenu>
  )
}
