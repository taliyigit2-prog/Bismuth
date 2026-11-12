// The first-run tour's steps (G-18): the day's start screen, the calendar, writing a reservation, payments and the
// cash drawer, the shift handover, and where the guide lives. A step whose screen the role cannot open is left out;
// the last one (the guide) is for everyone.
import type { PermissionKey } from '@shared/permissions'
import type { GuideTarget } from '@/guide/route-map'

export interface TourStep {
  id: 'today' | 'calendar' | 'reservation' | 'payment' | 'shift' | 'guide'
  /** Screenshot of the guide shown in the card. */
  image: string
  /** The screen "Ekrana git" opens. */
  path: '/today' | '/calendar' | '/ledger' | '/shift' | '/guide'
  /** Needed to see the step (null: everyone). */
  permission: PermissionKey | null
  guide: GuideTarget | null
}

export const TOUR_STEPS: readonly TourStep[] = [
  { id: 'today', image: 'today', path: '/today', permission: 'today', guide: { section: 'today' } },
  {
    id: 'calendar',
    image: 'calendar',
    path: '/calendar',
    permission: 'calendar',
    guide: { section: 'reservations' }
  },
  {
    id: 'reservation',
    image: 'new-reservation',
    path: '/calendar',
    permission: 'calendar',
    guide: { section: 'reservations', anchor: 'new-reservation' }
  },
  {
    id: 'payment',
    image: 'payment-dialog',
    path: '/ledger',
    permission: 'payments',
    guide: { section: 'payments' }
  },
  {
    id: 'shift',
    image: 'shift',
    path: '/shift',
    permission: 'shift_notes',
    guide: { section: 'shift' }
  },
  { id: 'guide', image: 'guide', path: '/guide', permission: null, guide: null }
]

/** The steps a role sees. */
export function tourStepsFor(can: (key: PermissionKey) => boolean): TourStep[] {
  return TOUR_STEPS.filter((s) => s.permission === null || can(s.permission))
}
