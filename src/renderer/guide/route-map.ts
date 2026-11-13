// Which part of the guide each screen's "?" opens (G-18): one line per route of the router (a test checks that
// every route has one). A route the map does not know opens the guide's home page.
import type { GuideSectionId } from './sections'

export interface GuideTarget {
  section: GuideSectionId
  anchor?: string
}

export const GUIDE_ROUTE_MAP: Readonly<Record<string, GuideTarget | null>> = {
  '/': { section: 'getting-started' },
  '/calendar': { section: 'reservations' },
  '/today': { section: 'today' },
  '/calendar-notes': { section: 'currency', anchor: 'special-days' },
  '/in-house': { section: 'in-house' },
  '/tasks': { section: 'tasks' },
  '/shift': { section: 'shift' },
  '/rooms': { section: 'rooms' },
  '/guests': { section: 'guests' },
  '/blacklist': { section: 'guests', anchor: 'blacklist' },
  '/companies': { section: 'guests', anchor: 'companies' },
  '/lost-items': { section: 'operations', anchor: 'lost-items' },
  '/ledger': { section: 'ledger' },
  '/month-end': { section: 'month-end' },
  '/currency': { section: 'currency' },
  '/issues': { section: 'rooms', anchor: 'issues' },
  '/maintenance': { section: 'tasks', anchor: 'maintenance' },
  '/supply': { section: 'operations', anchor: 'supply' },
  '/laundry': { section: 'operations', anchor: 'laundry' },
  // The guide has no camera page yet (Faz 20 documentation): the operations chapter is the nearest.
  '/camera': { section: 'operations' },
  '/contacts': { section: 'operations', anchor: 'contacts' },
  '/staff': { section: 'staff' },
  '/reports': { section: 'month-end', anchor: 'reports' },
  '/tourism': { section: 'tourism' },
  '/settings': { section: 'settings' },
  '/theme-preview': { section: 'settings', anchor: 'status-colors' },
  '/about': { section: 'faq', anchor: 'about' },
  '/audit': { section: 'settings', anchor: 'audit' },
  // The guide itself: its "?" goes to the guide's home page.
  '/guide': null,
  // Screens without the top bar; listed so a link from them (or a test) still lands well.
  '/setup': { section: 'getting-started', anchor: 'setup' },
  '/connect': { section: 'remote', anchor: 'connect-mac' },
  '/login': { section: 'getting-started', anchor: 'sign-in' },
  '/recover': { section: 'getting-started', anchor: 'forgot-password' },
  '/lock': { section: 'getting-started', anchor: 'lock' },
  '/change-password': { section: 'getting-started', anchor: 'sign-in' }
}

/** Settings sections with their own part of the guide (`#/settings?tab=backup`). */
const SETTINGS_TABS: Readonly<Record<string, GuideTarget>> = {
  general: { section: 'settings', anchor: 'general' },
  appearance: { section: 'settings', anchor: 'general' },
  hotel: { section: 'settings', anchor: 'hotel' },
  rooms: { section: 'settings', anchor: 'rooms-and-types' },
  lists: { section: 'settings', anchor: 'lists' },
  shifts: { section: 'settings', anchor: 'shifts' },
  tasks: { section: 'tasks', anchor: 'suggestions' },
  staff: { section: 'staff', anchor: 'pay-rules' },
  calendar: { section: 'settings', anchor: 'calendar-settings' },
  tags: { section: 'settings', anchor: 'status-colors' },
  camera: { section: 'settings' },
  currency: { section: 'currency' },
  remote: { section: 'remote' },
  backup: { section: 'backup' },
  users: { section: 'settings', anchor: 'users' },
  roles: { section: 'settings', anchor: 'roles' },
  guide: { section: 'getting-started', anchor: 'guide' },
  about: { section: 'faq', anchor: 'about' }
}

/** The guide target of a screen, or null for the guide's home page. */
export function guideTargetFor(pathname: string, search: Record<string, unknown> = {}): GuideTarget | null {
  if (pathname === '/settings' && typeof search['tab'] === 'string') {
    const tab = SETTINGS_TABS[search['tab']]
    if (tab) return tab
  }
  return GUIDE_ROUTE_MAP[pathname] ?? null
}

/** Every target the map names (tests: each must exist in the guide's text). */
export function allGuideTargets(): GuideTarget[] {
  return [
    ...Object.values(GUIDE_ROUTE_MAP).filter((t): t is GuideTarget => t !== null),
    ...Object.values(SETTINGS_TABS)
  ]
}
