import { useEffect } from 'react'
import { Outlet, useRouterState } from '@tanstack/react-router'
import { useIsMobile } from '@/hooks/use-mobile'
import { shell } from '@/lib/shell'
import { isBarePath } from '@/lib/session/gate'
import { DesktopLayout } from './desktop/desktop-layout'
import { MobileLayout } from './mobile/mobile-layout'
import { BareLayout } from './bare-layout'
import { RouteGuard } from './route-guard'
import { AuthGate } from './auth-gate'
import { SessionWatch } from './session-watch'

export function RootLayout() {
  const isMobile = useIsMobile()
  // The screen on display (see auth-gate.tsx): the shell changes together with the screen, not before it.
  const pathname = useRouterState({
    select: (state) => (state.resolvedLocation ?? state.location).pathname
  })
  useEffect(() => {
    // Tells the main process the UI is up (smoke test, packaged-app e2e).
    shell.ready()
  }, [])
  // Setup, connection, sign-in, recovery, lock and the forced password change have no menu and no top bar.
  const bare = isBarePath(pathname)
  const Shell = isMobile ? MobileLayout : DesktopLayout
  return (
    <div data-testid="app-ready" data-layout={isMobile ? 'mobile' : 'desktop'} className="contents">
      <AuthGate>
        {bare ? (
          <BareLayout>
            <Outlet />
          </BareLayout>
        ) : (
          <Shell>
            <SessionWatch />
            <RouteGuard>
              <Outlet />
            </RouteGuard>
          </Shell>
        )}
      </AuthGate>
    </div>
  )
}
