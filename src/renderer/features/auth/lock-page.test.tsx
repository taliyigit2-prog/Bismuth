import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SETTINGS_DEFAULTS } from '@shared/contract'
import { FAKE_ACCOUNTS, fakeTransport, type FakeTransport } from '@/test/render'
import { currentHref, renderApp } from '@/test/render-app'

describe('kilit ekranı (G-22)', () => {
  it('kilitleyen kişiyi gösterir; yanlış PIN söylenir, doğru PIN kilidi açar', async () => {
    const user = userEvent.setup()
    await renderApp({ locked: true, hash: '#/today' })
    expect(await screen.findByTestId('lock-user')).toHaveTextContent('Otel Sahibi')
    expect(screen.getByTestId('lock-user')).toHaveAttribute('title', 'Otel Sahibi')
    expect(screen.getByRole('radio', { name: 'PIN' })).toBeChecked()
    expect(screen.getByRole('button', { name: 'Başka kullanıcıyla oturum aç' })).toBeInTheDocument()
    await user.type(screen.getByTestId('unlock-secret'), '1357{Enter}')
    const error = await screen.findByTestId('unlock-error')
    expect(error).toHaveTextContent('PIN yanlış.')
    // The limit of this screen: the window is signed out, the account is not locked (P4fix #4).
    expect(error).toHaveTextContent('5 yanlış denemeden sonra oturum kapanır')
    expect(error).not.toHaveTextContent('kilitlen')
    expect(screen.getByTestId('unlock-secret')).toHaveValue('')
    expect(screen.getByTestId('unlock-secret')).toHaveFocus()
    await user.click(screen.getByRole('radio', { name: 'Şifre' }))
    await user.type(screen.getByLabelText('Şifre'), 'cok-gizli-sifre{Enter}')
    expect(await screen.findByRole('heading', { level: 1, name: 'Bugün' })).toBeInTheDocument()
  })

  it("PIN'i olmayan hesap yalnız şifre sorulur", async () => {
    await renderApp({ locked: true, signedIn: 'u-deniz' })
    expect(await screen.findByTestId('lock-user')).toHaveTextContent('Deniz Arslan')
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    expect(screen.getByText('Devam etmek için şifrenizi girin.')).toBeInTheDocument()
  })

  it("PIN'i olmayan hesaba yanlış şifrede PIN anılmaz", async () => {
    const user = userEvent.setup()
    await renderApp({ locked: true, signedIn: 'u-deniz' })
    await screen.findByTestId('lock-user')
    await user.type(screen.getByTestId('unlock-secret'), 'yanlis-sifre-1{Enter}')
    const error = await screen.findByTestId('unlock-error')
    expect(error).toHaveTextContent('Şifre yanlış.')
    expect(error).not.toHaveTextContent('PIN')
  })

  it('beşinci yanlış denemede pencere oturumu kapanır; oturum açma ekranı hesabın kilitlenmediğini söyler', async () => {
    const user = userEvent.setup()
    const accounts = [{ ...FAKE_ACCOUNTS[0]! }]
    const { transport } = await renderApp({ locked: true, accounts })
    await screen.findByTestId('lock-user')
    for (let i = 0; i < 5; i++) await user.type(screen.getByTestId('unlock-secret'), '9753{Enter}')
    const notice = await screen.findByTestId('locked-out-notice')
    expect(notice).toHaveTextContent('5 kez yanlış girildiği için oturum kapatıldı')
    expect(notice).toHaveTextContent('Hesap kilitli değil')
    expect(currentHref()).toBe('/login')
    expect(transport.auth.userId).toBeNull()
  })
})

describe('ağdan kilit (K-45)', () => {
  it('telefonda ya da tarayıcıda PIN sorulmaz; kilit şifreyle açılır', async () => {
    const base = fakeTransport({ ...SETTINGS_DEFAULTS, 'guide.tourForNewUsers': false }, { locked: true })
    const transport = Object.assign(Object.create(base) as FakeTransport, { kind: 'http' as const })
    await renderApp({ locked: true, hash: '#/today', transport })
    expect(await screen.findByTestId('lock-user')).toHaveTextContent('Otel Sahibi')
    expect(screen.queryByRole('radio', { name: 'PIN' })).not.toBeInTheDocument()
    expect(screen.getByText('Devam etmek için şifrenizi girin.')).toBeInTheDocument()
  })
})

describe('zorunlu şifre değişikliği (G-22)', () => {
  it('nedenini söyler; uzun ad kesilirse tamamı ipucunda', async () => {
    const accounts = FAKE_ACCOUNTS.map((a) => (a.id === 'u-deniz' ? { ...a, mustChange: true } : a))
    await renderApp({ signedIn: 'u-deniz', accounts })
    expect(await screen.findByTestId('change-password')).toHaveTextContent(
      'Şifrenizi sizin yerinize başka biri belirledi. Devam etmeden önce kendi şifrenizi belirleyin.'
    )
    expect(screen.getByText('Deniz Arslan')).toHaveAttribute('title', 'Deniz Arslan')
  })
})
