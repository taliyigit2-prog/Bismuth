// Test helper (not part of the app bundle): the whole app — gate, shell, router on the window's hash — over the
// fake main process of test/render.tsx. Kept apart from render.tsx so screen tests do not load every page.
import { render } from '@testing-library/react'
import { SETTINGS_DEFAULTS, type SettingsValues } from '@shared/contract'
import { initI18n } from '@/i18n'
import { createAppQueryClient } from '@/lib/session/query-client'
import { App } from '../app'
import { createAppRouter } from '../router'
import { fakeTransport, type FakeTransport, type FakeTransportOptions } from './render'

export async function renderApp(
  opts: FakeTransportOptions & {
    settings?: Partial<SettingsValues>
    /** Address to start at, e.g. `#/ledger`. */
    hash?: string
    transport?: FakeTransport
  } = {}
) {
  // The first-run tour (features/guide) stays out of the shell tests unless a test asks for it.
  const settings = { ...SETTINGS_DEFAULTS, 'guide.tourForNewUsers': false, ...opts.settings }
  window.location.hash = opts.hash ?? ''
  const transport = opts.transport ?? fakeTransport(settings, opts)
  const queryClient = createAppQueryClient({ defaultOptions: { queries: { retry: false } } })
  queryClient.setQueryData(['settings.get', {}], settings)
  await initI18n(settings['ui.language'])
  const router = createAppRouter(queryClient)
  const result = render(<App transport={transport} queryClient={queryClient} router={router} />)
  return { ...result, transport, queryClient, router }
}

/** The address the window shows now, e.g. `/login?redirect=%2Fledger`. */
export const currentHref = (): string => decodeURIComponent(window.location.hash.replace(/^#/, ''))
