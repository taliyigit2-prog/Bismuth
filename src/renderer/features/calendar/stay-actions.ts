// Which of the ten right-click actions apply to a stay, and what each asks of the reservation panel (P17c). Pure.
import type { LocalDate } from '@shared/date'
import type { PanelIntent } from './booking-api'
import type { GridStayView } from './grid-model'

export type StayActionId =
  'checkIn' | 'checkOut' | 'pay' | 'move' | 'extend' | 'note' | 'park' | 'noShow' | 'giveUp' | 'guest'

const OPEN = new Set(['tentative', 'confirmed', 'checked_in'])

/** Which of the ten actions apply to a stay today (pure; the panel and the service check again). */
export function stayActions(
  stay: Pick<GridStayView, 'reservationStatus' | 'stayStatus' | 'checkIn'>,
  today: LocalDate,
  can: { edit: boolean; pay: boolean }
): Record<StayActionId, boolean> {
  const open = OPEN.has(stay.reservationStatus)
  const planned = stay.stayStatus === 'planned'
  const editOpen = can.edit && open
  const notStayed = editOpen && planned && stay.reservationStatus !== 'checked_in'
  return {
    checkIn: editOpen && planned && stay.checkIn <= today,
    checkOut: editOpen && stay.stayStatus === 'in_house',
    pay: can.pay && open,
    move: editOpen && stay.stayStatus !== 'done',
    extend: editOpen && stay.stayStatus !== 'done',
    note: can.edit,
    park: notStayed,
    noShow: notStayed && stay.checkIn <= today,
    giveUp: editOpen && stay.stayStatus !== 'done',
    guest: true
  }
}

/** The panel's intent for each action that opens it. */
export function intentOf(action: StayActionId, stay: Pick<GridStayView, 'id' | 'stayStatus'>): PanelIntent {
  switch (action) {
    case 'checkOut':
      return { kind: 'checkOut', stayId: stay.id }
    case 'pay':
      return { kind: 'pay' }
    case 'move':
    case 'extend':
      return { kind: 'stays' }
    case 'note':
      return { kind: 'note' }
    case 'park':
      return { kind: 'park' }
    case 'noShow':
      return { kind: 'noShow' }
    case 'giveUp':
      return stay.stayStatus === 'in_house' ? { kind: 'giveUp', stayId: stay.id } : { kind: 'cancel' }
    default:
      return { kind: 'history' }
  }
}
