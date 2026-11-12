// Hash history so the same bundle works from file:// (Electron) and from the server (G-135).
// Code-based routes (no generated route tree): each feature exports its page, this file wires paths.
import {
  createHashHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  redirect
} from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'
import { RootLayout } from './layouts/root-layout'
import { RouteCrash } from './components/crash-screen'
import { StartScreen } from './layouts/start-screen'
import { CalendarPage } from './features/calendar/calendar-page'
import { TodayPage } from './features/today/today-page'
import { CalendarNotesPage } from './features/calendar-notes/calendar-notes-page'
import { SettingsPage } from './features/settings/settings-page'
import { isSettingsTab, type SettingsTab } from './features/settings/tabs'
import { ThemePreviewPage } from './features/theme-preview/theme-preview-page'
import { AboutPage } from './features/about/about-page'
import { InHousePage } from './features/in-house/in-house-page'
import { TasksPage } from './features/tasks/tasks-page'
import { ShiftPage } from './features/shift/shift-page'
import { RoomsPage } from './features/rooms/rooms-page'
import { GuestsPage } from './features/guests/guests-page'
import { BlacklistPage } from './features/blacklist/blacklist-page'
import { CompaniesPage } from './features/companies/companies-page'
import { LostItemsPage } from './features/lost-items/lost-items-page'
import { LedgerPage } from './features/ledger/ledger-page'
import { MonthEndPage } from './features/month-end/month-end-page'
import { CurrencyPage } from './features/currency/currency-page'
import { IssuesPage } from './features/issues/issues-page'
import { MaintenancePage } from './features/maintenance/maintenance-page'
import { SupplyPage } from './features/supply/supply-page'
import { LaundryPage } from './features/laundry/laundry-page'
import { ContactsPage } from './features/contacts/contacts-page'
import { StaffPage } from './features/staff/staff-page'
import { ReportsPage } from './features/reports/reports-page'
import { TourismPage } from './features/tourism/tourism-page'
import { SetupPage } from './features/setup/setup-page'
import { SETUP_STEP_COUNT } from './features/setup/steps'
import { LoginPage } from './features/auth/login-page'
import { LockPage } from './features/auth/lock-page'
import { RecoverPage } from './features/auth/recover-page'
import { ChangePasswordPage } from './features/auth/change-password-page'
import { ConnectPage } from './features/auth/connect-page'
import { AuditPage } from './features/audit/audit-page'
import { GuidePage } from './features/guide/guide-page'
import { validateGuideSearch } from './features/guide/guide-search'

interface RouterContext {
  queryClient: QueryClient
}

const rootRoute = createRootRouteWithContext<RouterContext>()({ component: RootLayout })

// The gate (layouts/auth-gate.tsx) runs first: `/` opens the start screen only for a signed-in user.
const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: StartScreen })

/** `?redirect=/ledger`: the app screen to open once the window is signed in or unlocked (lib/session/gate.ts). */
const redirectSearch = (search: Record<string, unknown>): { redirect?: string } =>
  typeof search['redirect'] === 'string' ? { redirect: search['redirect'] } : {}

const routeTree = rootRoute.addChildren([
  indexRoute,
  createRoute({ getParentRoute: () => rootRoute, path: '/calendar', component: CalendarPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/today', component: TodayPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/calendar-notes', component: CalendarNotesPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/in-house', component: InHousePage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/tasks', component: TasksPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/shift', component: ShiftPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/rooms', component: RoomsPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/guests', component: GuestsPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/blacklist', component: BlacklistPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/companies', component: CompaniesPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/lost-items', component: LostItemsPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/ledger', component: LedgerPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/month-end', component: MonthEndPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/currency', component: CurrencyPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/issues', component: IssuesPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/maintenance', component: MaintenancePage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/supply', component: SupplyPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/laundry', component: LaundryPage }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/contacts',
    component: ContactsPage,
    // `?q=sucu`: opened from Hızlı arama with the search filled in.
    validateSearch: (search: Record<string, unknown>): { q?: string } =>
      typeof search['q'] === 'string' && search['q'] ? { q: search['q'].slice(0, 100) } : {}
  }),
  createRoute({ getParentRoute: () => rootRoute, path: '/staff', component: StaffPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/reports', component: ReportsPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/tourism', component: TourismPage }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/settings',
    component: SettingsPage,
    validateSearch: (search: Record<string, unknown>): { tab?: SettingsTab } =>
      isSettingsTab(search['tab']) ? { tab: search['tab'] } : {}
  }),
  createRoute({ getParentRoute: () => rootRoute, path: '/theme-preview', component: ThemePreviewPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/about', component: AboutPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/audit', component: AuditPage }),
  // `?s=payments&a=cash-drawer`: the section and heading the "?" of a screen opens (guide/route-map.ts).
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/guide',
    component: GuidePage,
    validateSearch: validateGuideSearch
  }),
  // Without the shell (lib/session/gate.ts BARE_PATHS).
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/setup',
    component: SetupPage,
    // `?step=3` opens a later step (owner review screenshots; Faz 4 resumes an unfinished setup there).
    validateSearch: (search: Record<string, unknown>): { step?: number } => {
      const step = Number(search['step'])
      return Number.isInteger(step) && step >= 1 && step <= SETUP_STEP_COUNT ? { step } : {}
    }
  }),
  createRoute({ getParentRoute: () => rootRoute, path: '/connect', component: ConnectPage }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/login',
    component: LoginPage,
    validateSearch: redirectSearch
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/recover',
    component: RecoverPage,
    validateSearch: redirectSearch
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/lock',
    component: LockPage,
    validateSearch: redirectSearch
  }),
  createRoute({
    getParentRoute: () => rootRoute,
    path: '/change-password',
    component: ChangePasswordPage,
    validateSearch: redirectSearch
  })
])

export function createAppRouter(queryClient: QueryClient) {
  return createRouter({
    routeTree,
    history: createHashHistory(),
    context: { queryClient },
    // A screen that throws shows what to do instead of a blank or an English stack trace (Faz 16).
    defaultErrorComponent: RouteCrash,
    defaultNotFoundComponent: () => {
      throw redirect({ to: '/' })
    }
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>
  }
}
