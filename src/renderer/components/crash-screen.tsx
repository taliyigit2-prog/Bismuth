// What the user sees when a screen breaks (Faz 16 madde 2): what happened, that saved data is safe, and what to do —
// try again, reload the screen, tell the owner. Never an English stack trace. The router shows it in place of a
// broken screen (the menu stays usable); `CrashBoundary` catches anything outside the screens. Both report the error
// to the error log once (lib/crash-report.ts).
import { Component, useEffect, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useRouter, type ErrorComponentProps } from '@tanstack/react-router'
import { RefreshCwIcon, TriangleAlertIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { reportCrash } from '@/lib/crash-report'

export function CrashScreen({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation()
  return (
    <div
      role="alert"
      data-testid="crash-screen"
      className="mx-auto flex max-w-lg flex-col items-center gap-3 px-4 py-16 text-center"
    >
      <span className="bg-destructive/10 text-destructive grid size-12 place-items-center rounded-full">
        <TriangleAlertIcon className="size-6" aria-hidden />
      </span>
      <h1 className="text-lg font-semibold">{t('crash.title')}</h1>
      <p className="text-muted-foreground text-sm">{t('crash.body')}</p>
      <p className="text-muted-foreground text-xs">{t('crash.logNote')}</p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <Button onClick={onRetry}>{t('errors.retry')}</Button>
        <Button variant="outline" onClick={() => window.location.reload()}>
          <RefreshCwIcon aria-hidden />
          {t('crash.reload')}
        </Button>
      </div>
    </div>
  )
}

/**
 * "Yeniden dene" must not draw the same broken data again: the queries of the broken screen (no longer on display,
 * so inactive) are dropped and load afresh; what the shell still shows (settings, the signed-in user) stays.
 */
const dropBrokenData = (queryClient: QueryClient): void => queryClient.removeQueries({ type: 'inactive' })

/** Router `defaultErrorComponent`: one report per error, then the screen; "Yeniden dene" renders the route again. */
export function RouteCrash({ error, reset }: ErrorComponentProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const reported = useRef<unknown>(null)
  useEffect(() => {
    if (reported.current === error) return
    reported.current = error
    reportCrash('render', error)
  }, [error])
  return (
    <CrashScreen
      onRetry={() => {
        dropBrokenData(queryClient)
        reset()
        void router.invalidate()
      }}
    />
  )
}

interface BoundaryState {
  error: unknown
}

/** The last net around the whole window (the router, the shell itself); inside the query provider. */
export function CrashBoundary({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  return <Boundary onReset={() => dropBrokenData(queryClient)}>{children}</Boundary>
}

class Boundary extends Component<{ children: ReactNode; onReset: () => void }, BoundaryState> {
  override state: BoundaryState = { error: null }

  static getDerivedStateFromError(error: unknown): BoundaryState {
    return { error: error ?? new Error('unknown') }
  }

  override componentDidCatch(error: unknown): void {
    reportCrash('render', error)
  }

  override render() {
    if (this.state.error)
      return (
        <CrashScreen
          onRetry={() => {
            this.props.onReset()
            this.setState({ error: null })
          }}
        />
      )
    return this.props.children
  }
}
