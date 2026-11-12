import { beforeAll, describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp } from '@/test/render-app'

beforeAll(() => {
  Element.prototype.scrollIntoView ??= () => {}
})

async function openMenu() {
  const user = userEvent.setup()
  const result = await renderApp()
  await screen.findByRole('heading', { level: 1, name: 'Takvim' })
  const trigger = screen.getByTestId('user-menu')
  expect(trigger).toHaveTextContent('Otel Sahibi')
  await user.click(trigger)
  return { user, ...result }
}

describe('hesap menüsü', () => {
  it('ad ve rol, şifre, PIN, kurtarma kodları, kilitle ve oturumu kapat', async () => {
    await openMenu()
    const menu = await screen.findByTestId('user-menu-content')
    expect(menu).toHaveTextContent('Sahip')
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((i) => i.textContent)
    ).toEqual([
      'Şifremi değiştir',
      "PIN'i değiştir",
      'Kurtarma kodlarını yenile',
      'KilitleCtrl L',
      'Oturumu kapat'
    ])
  })

  it('"Oturumu kapat" oturum açma ekranına götürür', async () => {
    const { user, transport } = await openMenu()
    await user.click(await screen.findByTestId('menu-sign-out'))
    expect(await screen.findByTestId('login')).toBeInTheDocument()
    expect(transport.auth.userId).toBeNull()
  })

  it('"Kilitle" kilit ekranını açar', async () => {
    const { user } = await openMenu()
    await user.click(await screen.findByTestId('menu-lock'))
    expect(await screen.findByTestId('lock')).toBeInTheDocument()
  })

  it('şifre değiştirme: mevcut şifre yanlışsa o alan işaretlenir; doğruysa kaydedilir', async () => {
    const { user, transport } = await openMenu()
    await user.click(await screen.findByTestId('menu-change-password'))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('Şu anki şifre'), 'yanlis-sifre')
    await user.type(within(dialog).getByLabelText('Yeni şifre'), 'baska-sifre-1')
    await user.type(within(dialog).getByLabelText('Yeni şifre (tekrar)'), 'baska-sifre-1')
    await user.click(screen.getByTestId('password-form-submit'))
    expect(await within(dialog).findByText('Şu anki şifre yanlış.')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Şu anki şifre')).toHaveFocus()
    await user.clear(within(dialog).getByLabelText('Şu anki şifre'))
    await user.type(within(dialog).getByLabelText('Şu anki şifre'), 'cok-gizli-sifre')
    await user.click(screen.getByTestId('password-form-submit'))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(transport.auth.accounts[0]!.password).toBe('baska-sifre-1')
  })

  it('PIN: biçim, tekrar ve kolay tahmin edilen PIN söylenir; uygun PIN kaydedilir', async () => {
    const { user, transport } = await openMenu()
    await user.click(await screen.findByTestId('menu-pin'))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByTestId('pin-current'), 'cok-gizli-sifre')
    await user.type(within(dialog).getByTestId('pin-new'), '12')
    await user.click(screen.getByTestId('pin-form-submit'))
    expect(await within(dialog).findByText('PIN 4–8 rakamdan oluşmalı.')).toBeInTheDocument()
    await user.clear(within(dialog).getByTestId('pin-new'))
    await user.type(within(dialog).getByTestId('pin-new'), '1234')
    await user.type(within(dialog).getByTestId('pin-repeat'), '1234')
    await user.click(screen.getByTestId('pin-form-submit'))
    expect(await within(dialog).findByText(/kolay tahmin edilir/)).toBeInTheDocument()
    await user.clear(within(dialog).getByTestId('pin-new'))
    await user.type(within(dialog).getByTestId('pin-new'), '5820')
    await user.clear(within(dialog).getByTestId('pin-repeat'))
    await user.type(within(dialog).getByTestId('pin-repeat'), '5820')
    await user.click(screen.getByTestId('pin-form-submit'))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(transport.auth.accounts[0]!.pin).toBe('5820')
  })

  it('kurtarma kodları şifreyle alınır ve bir kez gösterilir', async () => {
    const { user } = await openMenu()
    await user.click(await screen.findByTestId('menu-recovery-codes'))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByTestId('codes-current'), 'cok-gizli-sifre{Enter}')
    const codes = await within(dialog).findByTestId('recovery-codes')
    expect(within(codes).getAllByRole('listitem')).toHaveLength(10)
    expect(dialog).toHaveTextContent('yalnız şimdi gösterilir')
    expect(within(dialog).getByRole('button', { name: 'Kodları kopyala' })).toBeInTheDocument()
    await user.click(screen.getByTestId('codes-done'))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await user.click(screen.getByTestId('user-menu'))
    await user.click(await screen.findByTestId('menu-recovery-codes'))
    expect(await screen.findByTestId('codes-current')).toBeInTheDocument()
    expect(screen.queryByTestId('recovery-codes')).not.toBeInTheDocument()
  })
})
