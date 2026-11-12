import './styles/globals.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import i18next from 'i18next'
import type { SettingsValues } from '@shared/contract'
import { setHotelTimeZone } from '@shared/date'
import { initI18n } from '@/i18n'
import { ApiError, createTransport } from '@/lib/transport'
import { applyAppearance } from '@/lib/theme/theme-sync'
import { createAppQueryClient } from '@/lib/session/query-client'
import { installCrashReporting } from '@/lib/crash-report'
import { App } from './app'
import { createAppRouter } from './router'

/** One retry for a hiccup, none for a refusal: a signed-out or locked window will not change by asking again. */
const retryOnce = (failures: number, error: unknown): boolean =>
  failures < 1 && !(error instanceof ApiError && error.status >= 400 && error.status < 500)

async function boot(): Promise<void> {
  const container = document.getElementById('root')
  if (!container) return
  const transport = createTransport()
  installCrashReporting(transport)
  // A 401 that says the session ended or the window locked sends the window to the lock or sign-in screen.
  const queryClient = createAppQueryClient({
    defaultOptions: { queries: { retry: retryOnce, refetchOnWindowFocus: false } }
  })

  let settings: SettingsValues
  try {
    settings = await transport.call('settings.get', {})
  } catch {
    // Without settings we cannot pick a language: show a plain Turkish-first message from the locale file.
    await initI18n('tr')
    container.innerHTML = ''
    const title = document.createElement('h1')
    title.textContent = i18next.t('app.startFailedTitle')
    const body = document.createElement('p')
    body.textContent = i18next.t('app.startFailedBody')
    container.append(title, body)
    container.className = 'grid place-content-center gap-2 p-8 text-center'
    return
  }

  queryClient.setQueryData(['settings.get', {}], settings)
  setHotelTimeZone(settings['hotel.timezone'])
  applyAppearance(settings)
  await initI18n(settings['ui.language'])
  const router = createAppRouter(queryClient)

  createRoot(container).render(
    <StrictMode>
      <App transport={transport} queryClient={queryClient} router={router} />
    </StrictMode>
  )
}

void boot()
