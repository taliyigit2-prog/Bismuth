import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SETTINGS_DEFAULTS } from '@shared/contract'
import { setViewAs } from '@/lib/view-as'
import { FAKE_ACCOUNTS, fakeTransport } from '@/test/render'
import { currentHref, renderApp } from '@/test/render-app'

beforeAll(() => {
  // jsdom has no scrollIntoView (the quick search list scrolls the active item into view).
  Element.prototype.scrollIntoView ??= () => {}
})

afterEach(() => {
  act(() => setViewAs(null))
  vi.useRealTimers()
})

describe('uygulama kabuğu', () => {
  it('takvimle açılır (G-47); menü Türkçe', async () => {
    await renderApp()
    expect(await screen.findByRole('heading', { name: 'Takvim' })).toBeInTheDocument()
    expect(screen.getAllByText('Bugün').length).toBeGreaterThan(0)
    expect(screen.getByTestId('hotel-name')).toHaveTextContent('Bismuth')
  })

  it('dil ayarı değişince tüm kabuk metinleri Rusçaya döner', async () => {
    const { queryClient } = await renderApp()
    await screen.findByRole('heading', { name: 'Takvim' })
    await act(async () => {
      queryClient.setQueryData(['settings.get', {}], { ...SETTINGS_DEFAULTS, 'ui.language': 'ru' })
    })
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Календарь' })).toBeInTheDocument())
    expect(document.documentElement.lang).toBe('ru')
  })

  it('otel adı boş bırakılırsa neyin yanlış olduğunu söyler ve kaydetmez', async () => {
    const { transport } = await renderApp({ hash: '#/settings?tab=hotel' })
    const input = await screen.findByLabelText('Otel adı')
    const user = userEvent.setup()
    await user.clear(input)
    await user.type(input, '   ')
    await user.click(screen.getByRole('button', { name: 'Kaydet' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Otel adı boş olamaz')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(transport.settings['hotel.name']).toBe('Bismuth')
  })

  it('açılış ekranı ayarı "Bugün" ise Bugün açılır', async () => {
    await renderApp({ settings: { 'ui.startScreen': 'today' } })
    expect(await screen.findByRole('heading', { name: 'Bugün' })).toBeInTheDocument()
  })

  it('açılış ekranını göremeyen rol menüsündeki ilk ekranla açılır', async () => {
    const accounts = [{ ...FAKE_ACCOUNTS[0]!, id: 'u-hk', roleCode: 'housekeeping' as const }]
    await renderApp({ accounts, signedIn: 'u-hk' })
    expect(await screen.findByRole('heading', { level: 1, name: 'Bugün' })).toBeInTheDocument()
    expect(screen.queryByTestId('nav-calendar')).not.toBeInTheDocument()
  })

  it('rolün göremediği ekran adresle açılınca sayfa yerine "yetkiniz yok" gelir', async () => {
    act(() => setViewAs('housekeeping'))
    await renderApp({ hash: '#/ledger' })
    expect(await screen.findByRole('heading', { name: 'Bu ekrana yetkiniz yok' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Defter ve kasa' })).toBeInTheDocument()
    expect(screen.queryByTestId('demo-badge')).not.toBeInTheDocument()
  })

  it('oturumdaki rol Personel ekranını göremiyorsa menüde yoktur ve adresle açılmaz', async () => {
    await renderApp({ signedIn: 'u-deniz', hash: '#/staff' })
    expect(await screen.findByRole('heading', { name: 'Bu ekrana yetkiniz yok' })).toBeInTheDocument()
    expect(screen.queryByTestId('nav-staff')).not.toBeInTheDocument()
    expect(screen.getByTestId('nav-calendar')).toBeInTheDocument()
  })

  it('denetim kaydı menüde Sistem grubundadır; yalnız yetkisi olan görür', async () => {
    await renderApp({ hash: '#/audit' })
    expect(await screen.findByRole('heading', { level: 1, name: 'Denetim kaydı' })).toBeInTheDocument()
    expect(screen.getByTestId('nav-audit')).toBeInTheDocument()
  })
})

describe('açılış kapısı (faz-04 madde 2)', () => {
  it('otel kurulmamışsa kurulum sihirbazı açılır; ?step=3 adreste kalır', async () => {
    await renderApp({ setup: 'needed', signedIn: null, hash: '#/setup?step=3' })
    await waitFor(() => expect(screen.queryByTestId('gate-pending')).not.toBeInTheDocument())
    expect(currentHref()).toBe('/setup?step=3')
    expect(screen.queryByTestId('mobile-nav')).not.toBeInTheDocument()
    expect(screen.queryByTestId('hotel-name')).not.toBeInTheDocument()
  })

  it('kurulmamış otelde başka bir adres sihirbaza gider', async () => {
    await renderApp({ setup: 'needed', signedIn: null, hash: '#/ledger' })
    await waitFor(() => expect(currentHref()).toBe('/setup'))
  })

  it('istemci modunda bağlantı ekranı açılır; adres yazılınca "Bağlan" etkinleşir (Faz 13)', async () => {
    await renderApp({ setup: 'needed', mode: 'client', signedIn: null })
    expect(await screen.findByRole('heading', { name: 'Ana bilgisayara bağlan' })).toBeInTheDocument()
    expect(screen.getByTestId('connect-submit')).toBeDisabled()
    await userEvent.setup().type(screen.getByLabelText('Ana bilgisayarın adresi'), '192.168.1.20')
    expect(screen.getByTestId('connect-submit')).toBeEnabled()
    // Connecting and "set up here alone" go through the main process: features/auth/connect-page.test.tsx.
  })

  it('oturum yokken yazılan adres oturum açmaya gider ve girişten sonra açılır', async () => {
    await renderApp({ signedIn: null, hash: '#/ledger' })
    expect(await screen.findByTestId('login')).toBeInTheDocument()
    expect(currentHref()).toBe('/login?redirect=/ledger')
    const user = userEvent.setup()
    await user.click(await screen.findByTestId('user-u-owner'))
    await user.type(screen.getByTestId('secret'), '2468')
    await user.click(screen.getByTestId('sign-in'))
    expect(await screen.findByRole('heading', { level: 1, name: 'Defter ve kasa' })).toBeInTheDocument()
    expect(currentHref()).toBe('/ledger')
  })

  it('kilitli pencere kilit ekranını açar; kilit açılınca aynı ekrana döner', async () => {
    await renderApp({ locked: true, hash: '#/guests' })
    expect(await screen.findByTestId('lock')).toBeInTheDocument()
    expect(screen.getByTestId('lock-user')).toHaveTextContent('Otel Sahibi')
    const user = userEvent.setup()
    await user.type(screen.getByTestId('unlock-secret'), '2468')
    await user.click(screen.getByTestId('unlock'))
    expect(await screen.findByRole('heading', { level: 1, name: 'Misafirler' })).toBeInTheDocument()
  })

  it('şifresi başkasınca konan hesap önce yeni şifre belirler, sonra uygulama açılır', async () => {
    const accounts = [{ ...FAKE_ACCOUNTS[1]!, mustChange: true }]
    const { transport } = await renderApp({ accounts, signedIn: 'u-deniz', hash: '#/calendar' })
    expect(await screen.findByTestId('change-password')).toBeInTheDocument()
    expect(screen.queryByTestId('nav-calendar')).not.toBeInTheDocument()
    const user = userEvent.setup()
    await user.type(screen.getByTestId('current-password'), 'resepsiyon-sifre')
    await user.type(screen.getByTestId('new-password'), 'kisa')
    await user.type(screen.getByTestId('repeat-password'), 'kisa')
    await user.click(screen.getByTestId('change-password-submit'))
    expect(await screen.findByText('Şifre en az 8 karakter olmalı.')).toBeInTheDocument()
    expect(screen.getByTestId('new-password')).toHaveFocus()
    await user.clear(screen.getByTestId('new-password'))
    await user.type(screen.getByTestId('new-password'), 'yeni-sifre-99')
    await user.clear(screen.getByTestId('repeat-password'))
    await user.type(screen.getByTestId('repeat-password'), 'yeni-sifre-99')
    await user.click(screen.getByTestId('change-password-submit'))
    expect(await screen.findByRole('heading', { level: 1, name: 'Takvim' })).toBeInTheDocument()
    expect(transport.auth.accounts[0]).toMatchObject({ password: 'yeni-sifre-99', mustChange: false })
  })

  it('"Oturumu kapat" sonrası açık ekran saklanmaz: sonraki kişi kendi açılış ekranıyla başlar', async () => {
    const user = userEvent.setup()
    await renderApp({ hash: '#/guests' })
    await screen.findByRole('heading', { level: 1, name: 'Misafirler' })
    // A re-render (the shell re-reading the sign-in state) can close a menu opened at that moment: open it again.
    await waitFor(async () => {
      if (!screen.queryByTestId('menu-sign-out')) await user.click(screen.getByTestId('user-menu'))
      expect(screen.getByTestId('menu-sign-out')).toBeInTheDocument()
    })
    await user.click(screen.getByTestId('menu-sign-out'))
    expect(await screen.findByTestId('login')).toBeInTheDocument()
    expect(currentHref()).toBe('/login')
    await user.click(await screen.findByTestId('user-u-owner'))
    await user.type(screen.getByTestId('secret'), '2468{Enter}')
    expect(await screen.findByRole('heading', { level: 1, name: 'Takvim' })).toBeInTheDocument()
  })

  it('oturum açıkken giriş ekranı adresi uygulamaya döner', async () => {
    await renderApp({ hash: '#/login?redirect=%2Fguests' })
    expect(await screen.findByRole('heading', { level: 1, name: 'Misafirler' })).toBeInTheDocument()
  })

  it('bir çağrı "ekran kilitli" (401) derse pencere kilit ekranına geçer, hata gösterilmez', async () => {
    const transport = fakeTransport(SETTINGS_DEFAULTS)
    const { queryClient } = await renderApp({ transport })
    await screen.findByRole('heading', { level: 1, name: 'Takvim' })
    // The main process locked the window on its own (the computer went to sleep).
    transport.auth.locked = true
    await act(async () => {
      await queryClient
        .fetchQuery({
          queryKey: ['statusTags.list', {}],
          queryFn: () => transport.call('statusTags.list', {})
        })
        .catch(() => undefined)
    })
    expect(await screen.findByTestId('lock')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('oturum başka yerden kapatılınca (401) oturum açma ekranı gelir', async () => {
    const transport = fakeTransport(SETTINGS_DEFAULTS)
    const { queryClient } = await renderApp({ transport, hash: '#/guests' })
    await screen.findByRole('heading', { level: 1, name: 'Misafirler' })
    transport.auth.userId = null
    await act(async () => {
      await queryClient
        .fetchQuery({
          queryKey: ['statusTags.list', {}],
          queryFn: () => transport.call('statusTags.list', {})
        })
        .catch(() => undefined)
    })
    expect(await screen.findByTestId('login')).toBeInTheDocument()
    expect(currentHref()).toBe('/login?redirect=/guests')
  })
})

describe('kilit (G-22)', () => {
  it('boşta kalınca (ayardaki dakika) pencere kilitlenir', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { transport } = await renderApp({ settings: { 'security.idleLockMinutes': 2 } })
    await screen.findByRole('heading', { level: 1, name: 'Takvim' })
    act(() => vi.advanceTimersByTime(60_000))
    // Activity moves the deadline: one more minute is not enough.
    fireEvent.keyDown(window, { key: 'a' })
    act(() => vi.advanceTimersByTime(90_000))
    expect(transport.calls.some((c) => c.name === 'auth.lock')).toBe(false)
    act(() => vi.advanceTimersByTime(31_000))
    expect(await screen.findByTestId('lock')).toBeInTheDocument()
    expect(transport.auth.locked).toBe(true)
  })

  it('boşta kilit 0 dakikaysa hiç kilitlenmez', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { transport } = await renderApp({ settings: { 'security.idleLockMinutes': 0 } })
    await screen.findByRole('heading', { level: 1, name: 'Takvim' })
    act(() => vi.advanceTimersByTime(4 * 3_600_000))
    expect(transport.calls.some((c) => c.name === 'auth.lock')).toBe(false)
  })

  it('Ctrl+L pencereyi kilitler; "Başka kullanıcı" oturumu kapatıp girişe götürür', async () => {
    const { transport } = await renderApp()
    await screen.findByRole('heading', { level: 1, name: 'Takvim' })
    fireEvent.keyDown(window, { key: 'l', ctrlKey: true })
    expect(await screen.findByTestId('lock')).toBeInTheDocument()
    await userEvent.setup().click(screen.getByTestId('other-user'))
    expect(await screen.findByTestId('login')).toBeInTheDocument()
    expect(transport.auth.userId).toBeNull()
  })

  it('hızlı aramada "Ekranı kilitle" kısayoluyla görünür', async () => {
    await renderApp()
    await screen.findByRole('heading', { level: 1, name: 'Takvim' })
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    const item = await screen.findByTestId('command-lock')
    expect(item).toHaveTextContent('Ekranı kilitle')
    expect(item).toHaveTextContent('Ctrl L')
    await userEvent.setup().click(item)
    expect(await screen.findByTestId('lock')).toBeInTheDocument()
  })
})
