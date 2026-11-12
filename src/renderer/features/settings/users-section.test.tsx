import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { renderWithProviders } from '@/test/render'
import { adminTransport } from './admin-fake'
import { UsersSection } from './users-section'

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})

afterEach(() => vi.restoreAllMocks())

/** Phone layout (< 768 px) for the next render. */
function phone(): void {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: true,
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

describe('Kullanıcılar', () => {
  it('tablo kapalı hesapları da gösterir: rol, PIN, şifre değişecek', async () => {
    const transport = adminTransport()
    await renderWithProviders(<UsersSection />, { transport })
    const owner = await screen.findByTestId('user-sahip')
    expect(within(owner).getByText('Sahip')).toBeInTheDocument()
    expect(within(owner).getByText('Var')).toBeInTheDocument()
    const mert = screen.getByTestId('user-mert')
    expect(within(mert).getByText('Kapalı')).toBeInTheDocument()
    expect(within(mert).getByRole('switch')).not.toBeChecked()
  })

  it('yeni kullanıcı geçici şifre, rol ve personel kartıyla eklenir; alanlar doğrulanır', async () => {
    const transport = adminTransport()
    await renderWithProviders(<UsersSection />, { transport })
    const user = userEvent.setup()
    await user.click(await screen.findByTestId('add-user'))
    await user.type(await screen.findByTestId('user-username'), 'e')
    await user.type(screen.getByTestId('user-display-name'), 'Ece Tan')
    await user.type(screen.getByTestId('user-password'), 'kisa')
    await user.click(screen.getByTestId('dialog-save'))
    expect(await screen.findByText(/Kullanıcı adı 2–40 karakter olmalı/)).toBeInTheDocument()
    expect(screen.getByText('Şifre en az 8 karakter olmalı.')).toBeInTheDocument()
    expect(screen.getByTestId('user-username')).toHaveFocus()
    expect(transport.callsTo('users.create')).toEqual([])

    await user.type(screen.getByTestId('user-username'), 'ce')
    await user.type(screen.getByTestId('user-password'), '-gecici-1')
    // The password can be read before it is handed over.
    await user.click(screen.getByRole('button', { name: 'Şifreyi göster' }))
    expect(screen.getByTestId('user-password')).toHaveAttribute('type', 'text')
    await user.click(screen.getByTestId('user-role'))
    await user.click(await screen.findByRole('option', { name: 'Temizlik' }))
    await user.click(screen.getByTestId('user-employee'))
    // Deniz's card belongs to another account: only the free card is offered.
    expect(screen.queryByRole('option', { name: /Deniz Arslan/ })).not.toBeInTheDocument()
    await user.click(await screen.findByRole('option', { name: 'Ece Tan · Temizlik' }))
    await user.click(screen.getByTestId('dialog-save'))
    await waitFor(() =>
      expect(transport.callsTo('users.create')).toEqual([
        {
          username: 'ece',
          displayName: 'Ece Tan',
          roleId: 'role-housekeeping',
          password: 'kisa-gecici-1',
          employeeId: 'emp-ece'
        }
      ])
    )
    const row = await screen.findByTestId('user-ece')
    expect(within(row).getByText('Şifresini değiştirecek')).toBeInTheDocument()
  })

  it('"Şifre sıfırla" yeni geçici şifreyi gönderir; kullanıcı ilk girişte değiştirir', async () => {
    const success = vi.spyOn(toast, 'success')
    const transport = adminTransport()
    await renderWithProviders(<UsersSection />, { transport })
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Şifre sıfırla: Deniz Arslan' }))
    const field = await screen.findByTestId('reset-password')
    await user.type(field, 'yeni-gecici-2{Enter}')
    await waitFor(() =>
      expect(transport.callsTo('users.resetPassword')).toEqual([
        { id: 'user-deniz', password: 'yeni-gecici-2' }
      ])
    )
    expect(success).toHaveBeenCalledWith('Şifre sıfırlandı')
    expect(
      within(await screen.findByTestId('user-deniz')).getByText('Şifresini değiştirecek')
    ).toBeInTheDocument()
  })

  it('hesap kapatılırken sorulur; tek etkin sahibin anahtarı ve rol seçicisi baştan kapalıdır, nedeni yazar', async () => {
    const transport = adminTransport()
    await renderWithProviders(<UsersSection />, { transport })
    const user = userEvent.setup()
    const ownerSwitch = within(await screen.findByTestId('user-sahip')).getByRole('switch')
    expect(ownerSwitch).toBeDisabled()
    expect(ownerSwitch).toHaveAttribute(
      'title',
      'Tek etkin sahip bu hesap. Önce başka bir sahip hesabı açın.'
    )
    await user.click(screen.getByRole('button', { name: 'Otel Sahibi düzenle' }))
    expect(await screen.findByTestId('user-role')).toBeDisabled()
    expect(
      screen.getByText('Tek etkin sahip bu hesap. Önce başka bir sahip hesabı açın.')
    ).toBeInTheDocument()
    expect(transport.callsTo('users.setActive')).toEqual([])
    // Another account is switched off after asking.
    await user.keyboard('{Escape}')
    await user.click(within(screen.getByTestId('user-deniz')).getByRole('switch'))
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('Deniz Arslan hesabı kapatılsın mı?')).toBeInTheDocument()
  })

  it('kapalı hesap tek dokunuşla yeniden açılır; düzenleme rolü ve adı değiştirir', async () => {
    const transport = adminTransport()
    await renderWithProviders(<UsersSection />, { transport })
    const user = userEvent.setup()
    await user.click(within(await screen.findByTestId('user-mert')).getByRole('switch'))
    await waitFor(() =>
      expect(transport.callsTo('users.setActive')).toEqual([{ id: 'user-mert', active: true }])
    )

    await user.click(screen.getByRole('button', { name: 'Deniz Arslan düzenle' }))
    const name = await screen.findByTestId('user-display-name')
    await user.clear(name)
    await user.type(name, 'Deniz A.')
    await user.click(screen.getByTestId('user-role'))
    await user.click(await screen.findByRole('option', { name: 'Müdür' }))
    await user.click(screen.getByTestId('dialog-save'))
    await waitFor(() =>
      expect(transport.callsTo('users.update')).toEqual([
        { id: 'user-deniz', patch: { displayName: 'Deniz A.', roleId: 'role-manager' } }
      ])
    )
  })

  it('yazmaya başlayınca alanın hatası kalkar; "Kullanıcı ekle" ikincil düğmedir', async () => {
    await renderWithProviders(<UsersSection />, { transport: adminTransport() })
    const user = userEvent.setup()
    const add = await screen.findByTestId('add-user')
    expect(add).toHaveAttribute('data-variant', 'outline')
    await user.click(add)
    await user.click(await screen.findByTestId('dialog-save'))
    const username = screen.getByTestId('user-username')
    const displayName = screen.getByTestId('user-display-name')
    const password = screen.getByTestId('user-password')
    expect(username).toHaveAttribute('aria-invalid', 'true')
    expect(displayName).toHaveAttribute('aria-invalid', 'true')
    expect(password).toHaveAttribute('aria-invalid', 'true')
    await user.type(username, 'e')
    expect(username).not.toHaveAttribute('aria-invalid')
    expect(screen.queryByText(/Kullanıcı adı 2–40 karakter olmalı/)).not.toBeInTheDocument()
    await user.type(displayName, 'E')
    expect(displayName).not.toHaveAttribute('aria-invalid')
    await user.type(password, 'k')
    expect(password).not.toHaveAttribute('aria-invalid')
    expect(screen.queryByText('Şifre en az 8 karakter olmalı.')).not.toBeInTheDocument()
  })

  it('anahtar sütunu "Kullanılıyor" der; telefonda hiç oturum açmamış kullanıcı "son oturum: hiç" yazar', async () => {
    const view = await renderWithProviders(<UsersSection />, { transport: adminTransport() })
    expect(await screen.findByRole('columnheader', { name: 'Kullanılıyor' })).toBeInTheDocument()
    view.unmount()
    phone()
    await renderWithProviders(<UsersSection />, { transport: adminTransport() })
    expect(await screen.findByTestId('user-deniz')).toHaveTextContent('Resepsiyon · son oturum: hiç')
  })
})
