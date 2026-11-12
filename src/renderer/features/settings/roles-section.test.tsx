import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { renderWithProviders, type FakeTransport } from '@/test/render'
import { currentHref, renderApp } from '@/test/render-app'
import { adminTransport, permissionDenied } from './admin-fake'
import { RolesSection } from './roles-section'

// jsdom lacks the pointer-capture and scroll APIs Radix Select and DropdownMenu call when they open.
beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})

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

afterEach(async () => {
  vi.restoreAllMocks()
  const { setViewAs } = await import('@/lib/view-as')
  setViewAs('owner')
})

async function pickLevel(user: ReturnType<typeof userEvent.setup>, permission: string, level: string) {
  await user.click(screen.getByRole('combobox', { name: `${permission} yetkisi` }))
  await user.click(await screen.findByRole('option', { name: level }))
}

async function roleAction(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByTestId('role-actions'))
  await user.click(await screen.findByRole('menuitem', { name }))
}

describe('Rol düzenleyici', () => {
  it('rol listesi servisten gelir; sahip rolü kilitli, diğer rolde ekran ekran seçim yapılır', async () => {
    const transport = adminTransport()
    await renderWithProviders(<RolesSection />, { transport })
    const user = userEvent.setup()
    // Opens on Resepsiyon (the role most often adjusted).
    expect(await screen.findByRole('combobox', { name: 'Kasa paneli yetkisi' })).toHaveTextContent('Görür')
    await user.click(screen.getByRole('button', { name: /^Sahip/ }))
    expect(screen.getByText(/Sahip rolü her şeyi görür/)).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Kasa paneli yetkisi' })).toBeDisabled()
    expect(screen.getByTestId('role-save')).toBeDisabled()
    await user.click(screen.getByRole('button', { name: /^Temizlik/ }))
    expect(screen.getByRole('combobox', { name: 'Kasa paneli yetkisi' })).toHaveTextContent('Yok')
    expect(screen.getByRole('combobox', { name: 'Oda durumu yetkisi' })).toHaveTextContent('Düzenler')
    expect(screen.getByRole('switch', { name: 'Yalnız kendi görevleri' })).toBeChecked()
  })

  it('kaydet yalnız değişen yetkileri ve anahtarları gönderir; sonra "Değişiklik yok" olur', async () => {
    const transport = adminTransport()
    await renderWithProviders(<RolesSection />, { transport })
    const user = userEvent.setup()
    const status = await screen.findByTestId('role-unsaved')
    expect(status).toHaveTextContent('Değişiklik yok')
    await pickLevel(user, 'Kasa paneli', 'Düzenler')
    await pickLevel(user, 'Maaş ve avans', 'Görür')
    await user.click(screen.getByRole('combobox', { name: 'Uzaktan oturum açma' }))
    await user.click(await screen.findByRole('option', { name: /^Kapalı/ }))
    expect(status).toHaveTextContent('3 değişiklik kaydedilmedi')
    await user.click(screen.getByTestId('role-save'))
    await waitFor(() =>
      expect(transport.callsTo('roles.update')).toEqual([
        {
          id: 'role-reception',
          patch: { permissions: { cash: 'edit', 'staff.salary': 'view' }, remoteAccess: 'off' }
        }
      ])
    )
    await waitFor(() => expect(status).toHaveTextContent('Değişiklik yok'))
    expect(transport.state.roles.find((r) => r.id === 'role-reception')?.permissions.cash).toBe('edit')
  })

  it('rolleri göremeyen rol (Müdür) düzenleyiciyi hiç görmez', async () => {
    const { setViewAs } = await import('@/lib/view-as')
    setViewAs('manager')
    const transport = adminTransport()
    await renderWithProviders(<RolesSection />, { transport })
    expect(screen.queryByTestId('role-matrix')).not.toBeInTheDocument()
    expect(transport.callsTo('roles.list')).toEqual([])
  })

  it('servis yetkiyi reddedince bildirim "Bu işlem için yetkiniz yok" der', async () => {
    const error = vi.spyOn(toast, 'error')
    const transport = adminTransport({ refuse: { 'roles.update': permissionDenied() } })
    await renderWithProviders(<RolesSection />, { transport })
    const user = userEvent.setup()
    await screen.findByTestId('role-matrix')
    await pickLevel(user, 'Kasa paneli', 'Düzenler')
    await user.click(screen.getByTestId('role-save'))
    await waitFor(() =>
      expect(error).toHaveBeenCalledWith(
        'Bu işlem için yetkiniz yok. Gerekirse otel sahibine başvurun.',
        undefined
      )
    )
    expect(screen.getByTestId('role-unsaved')).toHaveTextContent('1 değişiklik kaydedilmedi')
  })

  it('"Kopyala" aynı yetkilerle "… (kopya)" adlı yeni rol açar ve onu seçer', async () => {
    const transport = adminTransport()
    await renderWithProviders(<RolesSection />, { transport })
    const user = userEvent.setup()
    await screen.findByTestId('role-matrix')
    await roleAction(user, 'Kopyala')
    await waitFor(() => expect(transport.callsTo('roles.create')).toHaveLength(1))
    const [input] = transport.callsTo('roles.create') as {
      name: string
      permissions: Record<string, string>
    }[]
    expect(input?.name).toBe('Resepsiyon (kopya)')
    expect(input?.permissions).toEqual(
      transport.state.roles.find((r) => r.id === 'role-reception')?.permissions
    )
    expect(await screen.findByRole('button', { name: /^Resepsiyon \(kopya\)/ })).toHaveAttribute(
      'aria-current',
      'true'
    )
  })

  it('kullanılan rol silinmez: servis "hâlâ kullanılıyor" der, açık görevleri de söyler', async () => {
    const error = vi.spyOn(toast, 'error')
    const transport = adminTransport({ roleTasks: { 'role-reception': 2 } })
    await renderWithProviders(<RolesSection />, { transport })
    const user = userEvent.setup()
    await screen.findByTestId('role-matrix')
    await roleAction(user, 'Rolü sil')
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText(/Bu rolde 1 kullanıcı var/)).toBeInTheDocument()
    await user.click(within(dialog).getByTestId('confirm-delete-role'))
    await waitFor(() =>
      expect(error).toHaveBeenCalledWith(
        'Bu rol hâlâ kullanılıyor. Silmeden önce bu roldeki kullanıcıları ve görevleri başka bir role geçirin.',
        {
          description:
            'Bu role verilmiş 2 açık görev ya da görev önerisi var; önce onları başka birine verin.'
        }
      )
    )
    expect(transport.state.roles.some((r) => r.id === 'role-reception')).toBe(true)
  })

  it('kimsenin kullanmadığı rol silinir ve listeden kalkar', async () => {
    const transport = adminTransport()
    await renderWithProviders(<RolesSection />, { transport })
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /^Muhasebe/ }))
    await roleAction(user, 'Rolü sil')
    await user.click(await screen.findByTestId('confirm-delete-role'))
    await waitFor(() => expect(screen.queryByRole('button', { name: /^Muhasebe/ })).not.toBeInTheDocument())
    expect(transport.callsTo('roles.delete')).toEqual([{ id: 'role-accountant' }])
  })

  it('yeni rol adıyla eklenir, hiçbir ekranı görmeden başlar ve seçilir', async () => {
    const transport = adminTransport()
    await renderWithProviders(<RolesSection />, { transport })
    const user = userEvent.setup()
    await user.click(await screen.findByTestId('role-add'))
    await user.type(await screen.findByTestId('role-name'), 'Gece resepsiyonu{Enter}')
    await waitFor(() =>
      expect(transport.callsTo('roles.create')).toEqual([
        { name: 'Gece resepsiyonu', description: null, permissions: {} }
      ])
    )
    expect(await screen.findByRole('button', { name: /^Gece resepsiyonu/ })).toHaveAttribute(
      'aria-current',
      'true'
    )
    expect(screen.getByRole('combobox', { name: 'Kasa paneli yetkisi' })).toHaveTextContent('Yok')
  })

  it('rolün adı değişir (çevirisi düşer)', async () => {
    const transport = adminTransport()
    await renderWithProviders(<RolesSection />, { transport })
    const user = userEvent.setup()
    await screen.findByTestId('role-matrix')
    await roleAction(user, 'Adını değiştir')
    const name = await screen.findByTestId('role-name')
    expect(name).toHaveValue('Resepsiyon')
    await user.clear(name)
    await user.type(name, 'Ön büro{Enter}')
    await waitFor(() =>
      expect(transport.callsTo('roles.update')).toEqual([
        { id: 'role-reception', patch: { name: 'Ön büro' } }
      ])
    )
    expect(await screen.findByRole('button', { name: /^Ön büro/ })).toBeInTheDocument()
  })

  it('kaydedilmemiş rolün yanındaki nokta ekran okuyucuya da söylenir; önizleme önce sorar', async () => {
    await renderWithProviders(<RolesSection />, { transport: adminTransport() })
    const user = userEvent.setup()
    await screen.findByTestId('role-matrix')
    expect(screen.queryByTestId('role-unsaved-mark-role-reception')).not.toBeInTheDocument()
    await pickLevel(user, 'Kasa paneli', 'Düzenler')
    expect(screen.getByTestId('role-unsaved-mark-role-reception')).toHaveTextContent(
      'Kaydedilmemiş değişiklik var'
    )
    // "Bu rolün gözüyle bak" would leave the editor: asked first; "Vazgeç" keeps the change.
    await user.click(screen.getByTestId('view-as'))
    let dialog = await screen.findByRole('alertdialog', { name: 'Değişiklikler kaydedilmedi' })
    expect(dialog).toHaveTextContent('1 değişiklik kaydedilmedi')
    await user.click(within(dialog).getByRole('button', { name: 'Vazgeç' }))
    expect(screen.getByTestId('role-unsaved')).toHaveTextContent('1 değişiklik kaydedilmedi')
    await user.click(screen.getByTestId('view-as'))
    dialog = await screen.findByRole('alertdialog', { name: 'Değişiklikler kaydedilmedi' })
    await user.click(within(dialog).getByRole('button', { name: 'Kaydetmeden devam et' }))
    // The preview is on (Resepsiyon may not see the role editor).
    await waitFor(() => expect(screen.queryByTestId('role-matrix')).not.toBeInTheDocument())
  })

  it('başka bölüme geçerken kaydedilmemiş değişiklik sorulur; "Vazgeç" bölümde bırakır', async () => {
    const transport = adminTransport() as unknown as FakeTransport
    await renderApp({ hash: '#/settings?tab=users', transport })
    const user = userEvent.setup()
    await screen.findByTestId('role-matrix', {}, { timeout: 5000 })
    await pickLevel(user, 'Kasa paneli', 'Düzenler')
    await user.click(screen.getByTestId('settings-tab-general'))
    const dialog = await screen.findByRole('alertdialog', { name: 'Değişiklikler kaydedilmedi' })
    await user.click(within(dialog).getByRole('button', { name: 'Vazgeç' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(currentHref()).toContain('tab=users')
    expect(screen.getByTestId('role-unsaved')).toHaveTextContent('1 değişiklik kaydedilmedi')
    await user.click(screen.getByTestId('settings-tab-general'))
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Kaydetmeden devam et' })
    )
    await waitFor(() => expect(currentHref()).toContain('tab=general'))
    expect(await screen.findByTestId('language-select')).toBeInTheDocument()
  })

  it('"Vazgeç"in hemen ardından yeniden denenince tek soru açılır; "Kaydetmeden devam et" bölümü değiştirir', async () => {
    const transport = adminTransport() as unknown as FakeTransport
    await renderApp({ hash: '#/settings?tab=users', transport })
    const user = userEvent.setup()
    await screen.findByTestId('role-matrix', {}, { timeout: 5000 })
    await pickLevel(user, 'Kasa paneli', 'Düzenler')
    for (let round = 0; round < 3; round++) {
      fireEvent.click(screen.getByTestId('settings-tab-general'))
      const dialog = await screen.findByRole('alertdialog', { name: 'Değişiklikler kaydedilmedi' })
      // Answered at once and asked again before the closing animation ends: still one question on screen.
      fireEvent.click(within(dialog).getByRole('button', { name: 'Vazgeç' }))
      fireEvent.click(screen.getByTestId('settings-tab-general'))
      await screen.findByRole('alertdialog', { name: 'Değişiklikler kaydedilmedi' })
      expect(screen.getAllByRole('alertdialog')).toHaveLength(1)
      expect(document.querySelectorAll('[data-slot=alert-dialog-overlay][data-state=open]')).toHaveLength(1)
      expect(currentHref()).toContain('tab=users')
      if (round < 2) {
        await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Vazgeç' }))
        await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
      }
    }
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Kaydetmeden devam et' })
    )
    await waitFor(() => expect(currentHref()).toContain('tab=general'))
    expect(await screen.findByTestId('language-select')).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('kaydedilmemiş değişiklik kilidi bekletmez: Ctrl+L pencereyi hemen kilitler', async () => {
    const transport = adminTransport() as unknown as FakeTransport
    await renderApp({ hash: '#/settings?tab=users', transport })
    const user = userEvent.setup()
    await screen.findByTestId('role-matrix', {}, { timeout: 5000 })
    await pickLevel(user, 'Kasa paneli', 'Düzenler')
    fireEvent.keyDown(window, { key: 'l', ctrlKey: true })
    expect(await screen.findByTestId('lock')).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.queryByTestId('role-matrix')).not.toBeInTheDocument()
  })

  it('telefonda: kaydet çubuğu yalnız değişiklik varken çıkar; başka rol seçilirken sorulur', async () => {
    phone()
    const transport = adminTransport()
    await renderWithProviders(<RolesSection />, { transport })
    const user = userEvent.setup()
    await screen.findByTestId('role-matrix')
    // A long name wraps inside the one column instead of widening the page.
    expect(screen.getByTestId('role-pick').closest('[data-slot="card-content"]')).toHaveClass(
      'grid-cols-[minmax(0,1fr)]'
    )
    expect(screen.queryByTestId('role-save-bar')).not.toBeInTheDocument()
    await pickLevel(user, 'Kasa paneli', 'Düzenler')
    expect(screen.getByTestId('role-save-bar')).toHaveTextContent('1 değişiklik kaydedilmedi')
    await user.click(screen.getByTestId('role-pick'))
    await user.click(await screen.findByRole('option', { name: 'Muhasebe' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Değişiklikler kaydedilmedi' })
    expect(dialog).toHaveTextContent('Resepsiyon rolünde 1 değişiklik kaydedilmedi')
    await user.click(within(dialog).getByTestId('role-leave-discard'))
    await waitFor(() => expect(screen.getByTestId('role-pick')).toHaveTextContent('Muhasebe'))
    expect(screen.queryByTestId('role-save-bar')).not.toBeInTheDocument()
    expect(transport.callsTo('roles.update')).toEqual([])
  })

  it('rol adı 60 karakterle sınırlı; sayaç sınırı önceden gösterir', async () => {
    await renderWithProviders(<RolesSection />, { transport: adminTransport() })
    const user = userEvent.setup()
    await user.click(await screen.findByTestId('role-add'))
    const name = await screen.findByTestId('role-name')
    expect(screen.getByTestId('role-name-count')).toHaveTextContent('0/60')
    await user.type(name, 'Gece')
    expect(screen.getByTestId('role-name-count')).toHaveTextContent('4/60')
    expect(name).toHaveAttribute('maxLength', '60')
  })
})
