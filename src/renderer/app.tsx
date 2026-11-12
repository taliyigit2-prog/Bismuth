import { useEffect } from 'react'
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import { ApiProvider } from '@/lib/api/api-context'
import { useSettings } from '@/lib/api/hooks'
import { ThemeSync } from '@/lib/theme/theme-sync'
import { setHotelTimeZone } from '@shared/date'
import { changeLanguage } from '@/i18n'
import { useIsMobile } from '@/hooks/use-mobile'
import { CrashBoundary } from '@/components/crash-screen'
import type { Transport } from '@/lib/transport'
import type { createAppRouter } from './router'

/** Toasts sit at the top on phones so they never cover the bottom navigation. */
function AppToaster() {
  const isMobile = useIsMobile()
  return <Toaster position={isMobile ? 'top-center' : 'bottom-right'} />
}

/** Language and theme follow the settings, whoever changed them (this window, command menu, Faz 13 client). */
function SettingsSync() {
  const settings = useSettings()
  const language = settings.data?.['ui.language']
  // The window's "today" is the hotel's day (src/shared/date.ts); set before children render.
  if (settings.data) setHotelTimeZone(settings.data['hotel.timezone'])
  useEffect(() => {
    if (language) void changeLanguage(language)
  }, [language])
  return settings.data ? <ThemeSync settings={settings.data} /> : null
}

export function App({
  transport,
  queryClient,
  router
}: {
  transport: Transport
  queryClient: QueryClient
  router: ReturnType<typeof createAppRouter>
}) {
  return (
    <ApiProvider transport={transport}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={300}>
          <CrashBoundary>
            <SettingsSync />
            <RouterProvider router={router} />
          </CrashBoundary>
          <AppToaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ApiProvider>
  )
}
