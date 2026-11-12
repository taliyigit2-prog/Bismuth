import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SETTINGS_DEFAULTS, STATUS_KEYS } from '@shared/contract'
import { FAKE_ACCOUNTS, fakeTransport, renderWithProviders } from '@/test/render'
import { ThemePreviewPage } from './theme-preview-page'

afterEach(() => vi.restoreAllMocks())

/** Phone width for useIsMobile (< 768 px). */
function asPhone() {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: query.includes('max-width'),
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false
      }) as MediaQueryList
  )
}

describe('Tema önizleme', () => {
  it('sayfadaki açık/koyu seçimi tema ayarına yazılır', async () => {
    const transport = fakeTransport({ ...SETTINGS_DEFAULTS, 'ui.theme': 'light' })
    await renderWithProviders(<ThemePreviewPage />, { transport, settings: { 'ui.theme': 'light' } })
    const user = userEvent.setup()
    const group = await screen.findByRole('radiogroup', { name: 'Tema' })
    expect(within(group).getByRole('radio', { name: 'Açık' })).toBeChecked()
    await user.click(within(group).getByRole('radio', { name: 'Koyu' }))
    await waitFor(() => expect(transport.settings['ui.theme']).toBe('dark'))
  })

  it('yedi durumun her biri takvim çubuğu örneğinde adıyla görünür', async () => {
    await renderWithProviders(<ThemePreviewPage />)
    expect(STATUS_KEYS).toHaveLength(7)
    expect(await screen.findByTestId('status-bar-paid')).toHaveTextContent('Ödendi · 101')
    expect(screen.getByTestId('status-bar-partial')).toHaveTextContent('Kısmen ödendi / kapora · 103')
    for (const key of STATUS_KEYS) expect(screen.getByTestId(`status-bar-${key}`)).toBeInTheDocument()
  })

  it('telefonda örnek tablo liste kartlarına döner, uzun durum adı tam görünür', async () => {
    asPhone()
    await renderWithProviders(<ThemePreviewPage />)
    const list = await screen.findByTestId('gallery-list')
    expect(within(list).getByText('Kısmen ödendi / kapora')).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Durum' })).not.toBeInTheDocument()
  })

  it('vurgu rengi: hazır renk açık temanın ayarına yazılır, "Bismuth rengine dön" sıfırlar (G-33, faz-15 madde 6)', async () => {
    const transport = fakeTransport(SETTINGS_DEFAULTS)
    await renderWithProviders(<ThemePreviewPage />, { transport })
    const user = userEvent.setup()
    const light = await screen.findByTestId('accent-light')
    await user.click(within(light).getByRole('button', { name: 'Yeşil' }))
    await waitFor(() => expect(transport.settings['ui.accentColor']).toBe('#15803d'))
    expect(transport.settings['ui.accentColorDark']).toBeNull()
    await waitFor(() =>
      expect(within(light).getByRole('button', { name: 'Yeşil' })).toHaveAttribute('aria-pressed', 'true')
    )
    await user.click(within(light).getByRole('button', { name: 'Bismuth rengine dön' }))
    await waitFor(() => expect(transport.settings['ui.accentColor']).toBeNull())
  })

  it('zeminde zor seçilen vurgu rengi uyarı verir', async () => {
    await renderWithProviders(<ThemePreviewPage />, {
      settings: { 'ui.accentColor': '#fde68a', 'ui.accentColorDark': '#1e1b4b' }
    })
    expect(await screen.findByTestId('accent-hard-light')).toHaveTextContent('zor seçilir')
    expect(screen.getByTestId('accent-hard-dark')).toBeInTheDocument()
  })

  it('yazı boyutu kişinin kendi ayarına yazılır', async () => {
    const transport = fakeTransport(SETTINGS_DEFAULTS)
    await renderWithProviders(<ThemePreviewPage />, { transport })
    const user = userEvent.setup()
    const group = await screen.findByRole('radiogroup', { name: 'Yazı boyutu' })
    await user.click(within(group).getByRole('radio', { name: 'Büyük' }))
    await waitFor(() => expect(transport.settings['ui.fontSize']).toBe('large'))
  })

  it('renk yetkisi yalnız görüntüleme olan Müdür renkleri görür ama değiştiremez', async () => {
    const accounts = [
      ...FAKE_ACCOUNTS,
      {
        id: 'u-mgr',
        username: 'mudur',
        displayName: 'Müdür Bey',
        roleCode: 'manager' as const,
        password: 'x'
      }
    ]
    const transport = fakeTransport(SETTINGS_DEFAULTS, { accounts, signedIn: 'u-mgr' })
    await renderWithProviders(<ThemePreviewPage />, { transport })
    const card = await screen.findByTestId('accent-card')
    await waitFor(() => expect(within(card).getByTestId('view-only')).toBeInTheDocument())
    expect(within(card).getByTestId('accent-preset-light-blue')).toBeDisabled()
    expect(within(card).getByTestId('accent-picker-dark')).toBeDisabled()
  })
})
