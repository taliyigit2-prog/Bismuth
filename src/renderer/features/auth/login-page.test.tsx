import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FAKE_RECOVERY_CODE } from '@/test/render'
import { currentHref, renderApp } from '@/test/render-app'

const signedOut = { signedIn: null } as const

describe('oturum açma (G-22)', () => {
  it('kişi listeden seçilir; PIN varsa PIN ile oturum açılır', async () => {
    const user = userEvent.setup()
    const { transport } = await renderApp(signedOut)
    expect(await screen.findByTestId('user-u-deniz')).toHaveTextContent('Resepsiyon')
    await user.click(screen.getByTestId('user-u-owner'))
    expect(screen.getByRole('radio', { name: 'PIN' })).toBeChecked()
    // An empty submit names the field instead of doing nothing.
    await user.click(screen.getByTestId('sign-in'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Bu alanı doldurun.')
    expect(screen.getByTestId('secret')).toHaveAttribute('aria-invalid', 'true')
    expect(transport.calls.some((c) => c.name === 'auth.signInWithPin')).toBe(false)
    await user.type(screen.getByTestId('secret'), '24ab68')
    expect(screen.getByTestId('secret')).toHaveValue('2468')
    await user.click(screen.getByTestId('sign-in'))
    expect(await screen.findByRole('heading', { level: 1, name: 'Takvim' })).toBeInTheDocument()
    expect(transport.calls.find((c) => c.name === 'auth.signInWithPin')?.input).toEqual({
      userId: 'u-owner',
      pin: '2468'
    })
  })

  it("PIN'i olmayan kişi şifreyle girer; şifre hesabın kimliğiyle gönderilir", async () => {
    const user = userEvent.setup()
    const { transport } = await renderApp(signedOut)
    await user.click(await screen.findByTestId('user-u-deniz'))
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('Şifre'), 'resepsiyon-sifre{Enter}')
    expect(await screen.findByRole('heading', { level: 1, name: 'Takvim' })).toBeInTheDocument()
    expect(transport.calls.find((c) => c.name === 'auth.signIn')?.input).toEqual({
      userId: 'u-deniz',
      secret: 'resepsiyon-sifre'
    })
  })

  it('yanlış PIN: hata ve PIN sınırı; altıncı denemede PIN duraklar, şifre çalışır (hesap kilitlenmez)', async () => {
    const user = userEvent.setup()
    await renderApp(signedOut)
    await user.click(await screen.findByTestId('user-u-owner'))
    await user.type(screen.getByTestId('secret'), '1111{Enter}')
    const error = await screen.findByTestId('sign-in-error')
    expect(error).toHaveTextContent('PIN yanlış.')
    expect(error).toHaveTextContent("5 yanlış PIN'den sonra PIN ile oturum açma 15 dakika durur")
    expect(screen.getByTestId('secret')).toHaveAttribute('aria-invalid', 'true')
    // The wrong PIN is cleared and the field is ready for the next try.
    expect(screen.getByTestId('secret')).toHaveValue('')
    expect(screen.getByTestId('secret')).toHaveFocus()
    for (let i = 0; i < 4; i++) {
      await user.clear(screen.getByTestId('secret'))
      await user.type(screen.getByTestId('secret'), '1111{Enter}')
    }
    // The sixth try (even the right PIN) gets the service's own answer: PIN sign-in paused.
    await user.clear(screen.getByTestId('secret'))
    await user.type(screen.getByTestId('secret'), '2468{Enter}')
    await waitFor(() =>
      expect(screen.getByTestId('sign-in-error')).toHaveTextContent('PIN ile oturum açma bir süre kapalı')
    )
    expect(screen.getByTestId('sign-in-error')).not.toHaveTextContent('kilitli')
    expect(currentHref()).toBe('/login')
    // The password still works: the account was never locked.
    await user.click(screen.getByRole('radio', { name: 'Şifre' }))
    await user.type(screen.getByLabelText('Şifre'), 'cok-gizli-sifre{Enter}')
    expect(await screen.findByRole('heading', { level: 1, name: 'Takvim' })).toBeInTheDocument()
  })

  it('yanlış şifre: şifre sınırı; beşinci yanlışta hesabın bitiş saatiyle kilitlendiği söylenir', async () => {
    const user = userEvent.setup()
    await renderApp(signedOut)
    await user.click(await screen.findByTestId('user-u-owner'))
    await user.click(screen.getByRole('radio', { name: 'Şifre' }))
    await user.type(screen.getByLabelText('Şifre'), 'yanlis-1{Enter}')
    const error = await screen.findByTestId('sign-in-error')
    expect(error).toHaveTextContent('Şifre yanlış.')
    expect(error).toHaveTextContent('5 yanlış denemeden sonra hesap 15 dakika kilitlenir.')
    for (let i = 2; i <= 5; i++) await user.type(screen.getByLabelText('Şifre'), `yanlis-${i}{Enter}`)
    await waitFor(() =>
      expect(screen.getByTestId('sign-in-error')).toHaveTextContent('hesap kilitli (bitiş: 09:15)')
    )
    expect(screen.getByTestId('sign-in-error')).toHaveTextContent(
      '“Şifremi unuttum” ile kurtarma kodunuzu girip'
    )
    expect(screen.getByTestId('sign-in-error')).not.toHaveTextContent('yanlış denemeden sonra')
    // The right password does not open a locked account either.
    await user.type(screen.getByLabelText('Şifre'), 'cok-gizli-sifre{Enter}')
    await waitFor(() => expect(screen.getByTestId('sign-in-error')).toHaveTextContent('bitiş: 09:15'))
    expect(currentHref()).toBe('/login')
  })

  it('listede olmayan hesap kullanıcı adıyla oturum açar', async () => {
    const user = userEvent.setup()
    await renderApp({ ...signedOut, hash: '#/guests' })
    await user.click(await screen.findByTestId('use-username'))
    await user.type(screen.getByTestId('username'), 'DENIZ')
    await user.type(screen.getByLabelText('Şifre'), 'yanlis-sifre{Enter}')
    expect(await screen.findByTestId('sign-in-error')).toHaveTextContent('Kullanıcı adı ya da şifre yanlış.')
    expect(screen.getByLabelText('Şifre')).toHaveValue('')
    expect(screen.getByLabelText('Şifre')).toHaveFocus()
    expect(screen.getByTestId('username')).toHaveValue('DENIZ')
    await user.clear(screen.getByTestId('username'))
    await user.type(screen.getByTestId('username'), 'deniz')
    await user.clear(screen.getByLabelText('Şifre'))
    await user.type(screen.getByLabelText('Şifre'), 'resepsiyon-sifre{Enter}')
    expect(await screen.findByRole('heading', { level: 1, name: 'Misafirler' })).toBeInTheDocument()
  })

  it('kesilen ad ve rol ipucunda tam görünür; seçilen yöntemde işaret var; PIN göz düğmesi PIN der', async () => {
    const user = userEvent.setup()
    await renderApp(signedOut)
    const card = await screen.findByTestId('user-u-owner')
    expect(within(card).getByText('Otel Sahibi')).toHaveAttribute('title', 'Otel Sahibi')
    expect(within(card).getByText('Sahip')).toHaveAttribute('title', 'Sahip')
    expect(screen.getByTestId('auth-hotel-name')).toHaveAttribute('title')
    await user.click(card)
    expect(screen.getByTestId('picked-user')).toHaveAttribute('title', 'Otel Sahibi')
    const pin = screen.getByRole('radio', { name: 'PIN' })
    expect(pin.querySelector('svg')).not.toBeNull()
    expect(screen.getByRole('button', { name: "PIN'i göster" })).toBeInTheDocument()
  })

  it('şifre gizli yazılır; göz düğmesi gösterir', async () => {
    const user = userEvent.setup()
    await renderApp(signedOut)
    await user.click(await screen.findByTestId('user-u-deniz'))
    const input = screen.getByLabelText('Şifre')
    expect(input).toHaveAttribute('type', 'password')
    expect(input).toHaveAttribute('autocomplete', 'current-password')
    await user.click(screen.getByRole('button', { name: 'Şifreyi göster' }))
    expect(input).toHaveAttribute('type', 'text')
  })
})

describe('şifremi unuttum', () => {
  it('kurtarma kodu yanlışsa söyler; doğruysa yeni şifreyle girilir ve PIN silinir', async () => {
    const user = userEvent.setup()
    const { transport } = await renderApp(signedOut)
    await user.click(await screen.findByTestId('forgot'))
    expect(await screen.findByTestId('recover')).toBeInTheDocument()
    expect(screen.getByTestId('owner-reset-hint')).toHaveTextContent('Ayarlar → Kullanıcılar ve roller')

    await user.click(screen.getByTestId('recover-submit'))
    expect(screen.getByLabelText('Kullanıcı adı')).toHaveFocus()
    expect(screen.getAllByText('Bu alanı doldurun.').length).toBeGreaterThan(0)

    await user.type(screen.getByLabelText('Kullanıcı adı'), 'sahip')
    await user.type(screen.getByLabelText('Kurtarma kodu'), 'AAAA-BBBB-CCCC-DDDD')
    await user.type(screen.getByLabelText('Yeni şifre'), 'yepyeni-sifre')
    await user.type(screen.getByLabelText('Yeni şifre (tekrar)'), 'yepyeni-sifr')
    await user.click(screen.getByTestId('recover-submit'))
    expect(await screen.findByText('İki şifre aynı değil.')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Yeni şifre (tekrar)'), 'e')
    await user.click(screen.getByTestId('recover-submit'))
    expect(await screen.findByTestId('recover-error')).toHaveTextContent(
      'Kullanıcı adı ya da kurtarma kodu yanlış.'
    )

    // H-46: the next attempt fails its own checks; the old "wrong code" message goes away.
    await user.clear(screen.getByLabelText('Yeni şifre (tekrar)'))
    await user.click(screen.getByTestId('recover-submit'))
    expect(await screen.findByText('İki şifre aynı değil.')).toBeInTheDocument()
    expect(screen.queryByTestId('recover-error')).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('Yeni şifre (tekrar)'), 'yepyeni-sifre')

    await user.clear(screen.getByLabelText('Kurtarma kodu'))
    await user.type(screen.getByLabelText('Kurtarma kodu'), FAKE_RECOVERY_CODE.toLowerCase())
    await user.click(screen.getByTestId('recover-submit'))
    expect(await screen.findByTestId('recover-done')).toHaveTextContent('PIN')
    expect(transport.auth.accounts[0]).toMatchObject({ password: 'yepyeni-sifre', pin: null })
    await user.click(screen.getByTestId('recover-sign-in'))
    expect(await screen.findByTestId('login')).toBeInTheDocument()
  })
})
