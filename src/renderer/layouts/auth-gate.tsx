// Start gate (faz-04 madde 2): asks `auth.state` and keeps the window on the screen it may show (lib/session/
// gate.ts). Before it sends the window from an app screen to a sign-in screen it asks once more, so a stale answer
// never throws anyone out; nothing of the app renders while the window is on its way.
import { useEffect, type ReactNode } from 'react'
import { useRouter, useRouterState } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ErrorState } from '@/components/states'
import { gateRedirect, isBarePath } from '@/lib/session/gate'
import { placeIsForgotten, rememberPlace, useAuthState } from '@/lib/session/session'
import { BareLayout } from './bare-layout'

/** An answer older than this is asked again before the window leaves the app for a sign-in screen. */
const FRESH_MS = 2_000

function GatePending() {
  const { t } = useTranslation()
  return (
    <div role="status" aria-busy data-testid="gate-pending" className="sr-only">
      {t('common.loading')}
    </div>
  )
}

export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter()
  const auth = useAuthState()
  // The location on screen: while a navigation loads, `location` is already the next one but the old screen is
  // still rendered (it must not act on the next screen's rules).
  const location = useRouterState({ select: (s) => s.resolvedLocation ?? s.location })
  // After a deliberate sign-out the screen left open is not kept for the next person.
  const href = placeIsForgotten() ? '/' : `${location.pathname}${location.searchStr}`
  const target = auth.data
    ? gateRedirect(auth.data, {
        pathname: location.pathname,
        search: location.search as Record<string, unknown>,
        href
      })
    : null
  const leavingApp = target !== null && !isBarePath(location.pathname)
  const { refetch, isFetching, dataUpdatedAt, errorUpdatedAt } = auth

  const signedIn = Boolean(auth.data?.session)
  useEffect(() => {
    if (signedIn) rememberPlace()
  }, [signedIn])

  useEffect(() => {
    if (!target || isFetching) return
    // A failed fresh look counts as a look: the window then follows the answer it has.
    if (leavingApp && Date.now() - Math.max(dataUpdatedAt, errorUpdatedAt) > FRESH_MS) {
      void refetch()
      return
    }
    router.history.replace(target)
  }, [target, leavingApp, isFetching, dataUpdatedAt, errorUpdatedAt, refetch, router])

  if (auth.isPending) return <GatePending />
  if (auth.isError && !auth.data)
    return (
      <BareLayout>
        <ErrorState error={auth.error} onRetry={() => void refetch()} />
      </BareLayout>
    )
  if (target) return <GatePending />
  return <>{children}</>
}
