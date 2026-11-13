import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SETTINGS_DEFAULTS } from '@shared/contract'
import { fakeTransport, renderWithProviders } from '@/test/render'
import { adminTransport } from './admin-fake'
import { SettingsPage } from './settings-page'

// jsdom lacks the pointer-capture and scroll APIs the Radix Select calls when it opens.
beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})

afterEach(() => vi.restoreAllMocks())

async function openTab(name: string) {
  const user = userEvent.setup()
  await user.click(await screen.findByRole('link', { name }))
  return user
}

describe('Ayarlar', () => {
  it('bölümler yan listede; her bölüm kendi içeriğini açar', async () => {
    const transport = adminTransport()
    await renderWithProviders(<SettingsPage />, { transport })
    // Genel holds both the language and the former "Görünüm".
    expect(await screen.findByTestId('language-select')).toBeInTheDocument()
    expect(screen.getByTestId('money-preview')).toBeInTheDocument()
    const list = screen.getByRole('navigation', { name: 'Ayar bölümü' })
    expect(within(list).getByRole('link', { current: 'page' })).toHaveTextContent('Genel')
    expect(
      within(list)
        .getAllByRole('link')
        .map((link) => link.textContent)
    ).toEqual([
      'Genel',
      'Otel',
      'Odalar ve tipler',
      'Listeler',
      'Vardiyalar',
      'Görev önerileri',
      'Personel kuralları',
      'Takvim',
      'Durum etiketleri',
      'Döviz',
      'Uzaktan erişim',
      'Yedek',
      'Kullanıcılar ve roller',
      'Kılavuz',
      'Hakkında'
    ])
    await openTab('Otel')
    expect(await screen.findByLabelText('Otel adı')).toBeInTheDocument()
    await openTab('Odalar ve tipler')
    expect(await screen.findByTestId('room-table')).toBeInTheDocument()
    await openTab('Listeler')
    expect(await screen.findByTestId('list-paymentMethods')).toBeInTheDocument()
    await openTab('Vardiyalar')
    expect(await screen.findByText('Gündüz')).toBeInTheDocument()
    await openTab('Görev önerileri')
    expect(await screen.findByTestId('legal-templates')).toBeInTheDocument()
    await openTab('Personel kuralları')
    expect(await screen.findByTestId('policy-leaveDaysPerMonth')).toBeInTheDocument()
    await openTab('Takvim')
    expect(await screen.findByTestId('holiday-list')).toBeInTheDocument()
    await openTab('Döviz')
    expect(await screen.findByRole('link', { name: 'Döviz ekranını aç' })).toBeInTheDocument()
    await openTab('Uzaktan erişim')
    expect(await screen.findByTestId('device-list')).toBeInTheDocument()
    await openTab('Yedek')
    expect(await screen.findByTestId('open-export')).toBeInTheDocument()
    await openTab('Kullanıcılar ve roller')
    expect(await screen.findByTestId('user-table')).toBeInTheDocument()
    expect(await screen.findByTestId('role-matrix')).toBeInTheDocument()
    await openTab('Hakkında')
    expect(await screen.findByRole('link', { name: 'Hakkında ekranını aç' })).toBeInTheDocument()
  })
})

describe('Durum etiketleri (gerçek servis sözleşmesi)', () => {
  it('kapatılan otomatik durum önizleme lejantından hemen düşer ve servise yazılır', async () => {
    const transport = fakeTransport(SETTINGS_DEFAULTS)
    await renderWithProviders(<SettingsPage />, { transport })
    const user = await openTab('Durum etiketleri')
    const legend = within(await screen.findByTestId('tag-preview')).getByTestId('legend')
    expect(within(legend).getByText('Ödendi')).toBeInTheDocument()
    await user.click(screen.getByTestId('enabled-paid'))
    await waitFor(() => expect(within(legend).queryByText('Ödendi')).not.toBeInTheDocument())
    await waitFor(() => expect(transport.tags.find((t) => t.code === 'paid')?.enabled).toBe(false))
  })

  it('"Varsayılan renklere dön" seçili temanın kendi renklerini siler, diğer temaya dokunmaz', async () => {
    const settings = {
      ...SETTINGS_DEFAULTS,
      'ui.statusColors': { paid: '#123456' },
      'ui.statusColorsDark': { paid: '#abcdef' }
    }
    const transport = fakeTransport(settings)
    await renderWithProviders(<SettingsPage />, { settings, transport })
    const user = await openTab('Durum etiketleri')
    await user.click(await screen.findByRole('button', { name: 'Varsayılan renklere dön' }))
    await waitFor(() => expect(transport.settings['ui.statusColors']).toEqual({}))
    expect(transport.settings['ui.statusColorsDark']).toEqual({ paid: '#abcdef' })
  })

  it('yeni özel etiket adıyla eklenir, lejantta görünür; öncelik yoksa kenarlık olarak gösterilir', async () => {
    const transport = fakeTransport(SETTINGS_DEFAULTS)
    await renderWithProviders(<SettingsPage />, { transport })
    const user = await openTab('Durum etiketleri')
    expect(await screen.findByText('Henüz kendi etiketiniz yok')).toBeInTheDocument()
    await user.click(screen.getByTestId('add-tag'))
    await user.type(await screen.findByTestId('tag-name'), 'Grup')
    await user.click(screen.getByTestId('save-tag'))
    const legend = within(screen.getByTestId('tag-preview')).getByTestId('legend')
    expect(await within(legend).findByText('Grup')).toBeInTheDocument()
    expect(transport.tags.filter((t) => t.kind === 'custom').map((t) => t.name)).toEqual(['Grup'])
  })

  it('yalnızca görme yetkisi olan rol etiketleri değiştiremez', async () => {
    const { setViewAs } = await import('@/lib/view-as')
    setViewAs('manager')
    try {
      await renderWithProviders(<SettingsPage />)
      await openTab('Durum etiketleri')
      expect(await screen.findByTestId('enabled-paid')).toBeDisabled()
      expect(screen.getByTestId('add-tag')).toBeDisabled()
    } finally {
      setViewAs('owner')
    }
  })
})

describe('Durum etiketlerinin adları', () => {
  it('otomatik durumun adı alanda değer olarak görünür; kendi adı kaydedilir, boşaltılınca varsayılana döner', async () => {
    const transport = fakeTransport(SETTINGS_DEFAULTS)
    await renderWithProviders(<SettingsPage />, { transport })
    const user = await openTab('Durum etiketleri')
    const name = await screen.findByTestId('name-paid')
    expect(name).toHaveValue('Ödendi')
    await user.clear(name)
    await user.type(name, 'Tam ödendi')
    await waitFor(() => expect(transport.tags.find((t) => t.code === 'paid')?.name).toBe('Tam ödendi'))
    const legend = within(screen.getByTestId('tag-preview')).getByTestId('legend')
    expect(within(legend).getByText('Tam ödendi')).toBeInTheDocument()
    expect(screen.getByText('Varsayılan ad: Ödendi')).toBeInTheDocument()

    await user.clear(name)
    expect(screen.getByText('Boş bırakırsanız varsayılan ad kullanılır: Ödendi')).toBeInTheDocument()
    await waitFor(() => expect(within(legend).getByText('Ödendi')).toBeInTheDocument())
    await user.tab()
    expect(name).toHaveValue('Ödendi')
  })

  it('varsayılan adı yeniden yazmak kayıt yapmaz (ad arayüz diliyle değişmeye devam eder)', async () => {
    const transport = fakeTransport(SETTINGS_DEFAULTS)
    const call = vi.spyOn(transport, 'call')
    await renderWithProviders(<SettingsPage />, { transport })
    const user = await openTab('Durum etiketleri')
    const name = await screen.findByTestId('name-paid')
    await user.clear(name)
    await user.type(name, 'Ödendi')
    await new Promise((resolve) => setTimeout(resolve, 450))
    expect(call.mock.calls.filter(([procedure]) => procedure === 'statusTags.update')).toEqual([])
    expect(transport.tags.find((t) => t.code === 'paid')?.name).toBeNull()
  })

  it('aç/kapat anahtarının görünür bir adı var ve hangi duruma ait olduğunu söyler', async () => {
    await renderWithProviders(<SettingsPage />)
    await openTab('Durum etiketleri')
    const row = await screen.findByTestId('auto-tag-paid')
    expect(within(row).getByText('Takvimde göster')).toBeInTheDocument()
    expect(within(row).getByRole('switch', { name: 'Ödendi: takvimde göster' })).toBeChecked()
  })
})

describe('Ayarlar yetkileri', () => {
  it('bölümü göremeyen rol bölümü listede görmez; açık yetkisiz bölüm yerine ilk izinli bölüm açılır (H-09)', async () => {
    const { setViewAs } = await import('@/lib/view-as')
    try {
      await renderWithProviders(<SettingsPage />, { transport: adminTransport() })
      await openTab('Uzaktan erişim')
      expect(await screen.findByTestId('device-list')).toBeInTheDocument()
      act(() => setViewAs('manager'))
      expect(await screen.findByTestId('language-select')).toBeInTheDocument()
      expect(screen.queryByTestId('device-list')).not.toBeInTheDocument()
      expect(screen.queryByRole('link', { name: 'Uzaktan erişim' })).not.toBeInTheDocument()
      expect(screen.queryByRole('link', { name: 'Kullanıcılar ve roller' })).not.toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Listeler' })).toBeInTheDocument()
    } finally {
      act(() => setViewAs('owner'))
    }
  })

  it('yalnız görebilen rol otel bilgilerini ve listeleri değiştiremez', async () => {
    const { setViewAs } = await import('@/lib/view-as')
    setViewAs('manager')
    try {
      await renderWithProviders(<SettingsPage />, { transport: adminTransport() })
      await openTab('Otel')
      expect(await screen.findByLabelText('Otel adı')).toBeDisabled()
      expect(screen.getByTestId('base-currency')).toBeDisabled()
      await openTab('Listeler')
      expect(await screen.findByRole('switch', { name: 'Nakit kullanılıyor' })).toBeDisabled()
      expect(screen.getByTestId('list-add')).toBeDisabled()
      await openTab('Odalar ve tipler')
      expect(await screen.findByTestId('add-room')).toBeDisabled()
    } finally {
      setViewAs('owner')
    }
  })

  it('resepsiyon kendi dilini seçer; otel ayarlarını, rolleri ve etiketleri görmez', async () => {
    const { setViewAs } = await import('@/lib/view-as')
    setViewAs('reception')
    try {
      await renderWithProviders(<SettingsPage />, { transport: adminTransport() })
      expect(await screen.findByTestId('language-select')).toBeInTheDocument()
      const list = screen.getByRole('navigation', { name: 'Ayar bölümü' })
      expect(
        within(list)
          .getAllByRole('link')
          .map((link) => link.textContent)
      ).toEqual(['Genel', 'Görev önerileri', 'Döviz', 'Kılavuz', 'Hakkında'])
    } finally {
      setViewAs('owner')
    }
  })

  it('yalnız görebilen rolün bölümünde "Yalnız görüntüleme" yazar; değiştirebilen rol bunu görmez', async () => {
    const { setViewAs } = await import('@/lib/view-as')
    setViewAs('manager')
    try {
      await renderWithProviders(<SettingsPage />, { transport: adminTransport() })
      await openTab('Otel')
      expect(await screen.findByTestId('view-only')).toHaveTextContent('Yalnız görüntüleme')
      // The disabled values stay readable (not the controls' 50 % fade).
      expect(screen.getByTestId('settings-section-hotel').querySelector('[data-view-only]')).toHaveClass(
        '[&_input:disabled]:opacity-80'
      )
      await openTab('Durum etiketleri')
      expect(await screen.findByTestId('view-only')).toBeInTheDocument()
    } finally {
      setViewAs('owner')
    }
    await renderWithProviders(<SettingsPage />, { transport: adminTransport() })
    await openTab('Otel')
    await screen.findByLabelText('Otel adı')
    expect(screen.queryByTestId('view-only')).not.toBeInTheDocument()
  })

  it('Genel: kişisel seçimlerin yalnız kişiye ait olduğu yazar; ekran kilidi süresi otel ayarıdır', async () => {
    const transport = adminTransport()
    await renderWithProviders(<SettingsPage />, { transport })
    expect(await screen.findByTestId('personal-note')).toHaveTextContent('yalnız sizin için geçerlidir')
    const user = userEvent.setup()
    expect(screen.getByTestId('idle-lock')).toHaveTextContent('15 dakika')
    await user.click(screen.getByTestId('idle-lock'))
    expect((await screen.findAllByRole('option')).map((option) => option.textContent)).toEqual([
      'Kilitlenmesin',
      '5 dakika',
      '10 dakika',
      '15 dakika',
      '30 dakika',
      '60 dakika'
    ])
    await user.click(screen.getByRole('option', { name: 'Kilitlenmesin' }))
    await waitFor(() => expect(transport.settings['security.idleLockMinutes']).toBe(0))
  })

  it('ekran kilidi süresini ayar yetkisi olmayan değiştiremez', async () => {
    const { setViewAs } = await import('@/lib/view-as')
    setViewAs('reception')
    try {
      await renderWithProviders(<SettingsPage />, { transport: adminTransport() })
      expect(await screen.findByTestId('idle-lock')).toBeDisabled()
      expect(screen.getByTestId('language-select')).toBeEnabled()
    } finally {
      setViewAs('owner')
    }
  })

  it('yakınlaştırma tuşla değişince açık Görünüm seçimi yeni değeri gösterir', async () => {
    const transport = adminTransport()
    await renderWithProviders(<SettingsPage />, { transport })
    const radio = await screen.findByTestId('zoom-100')
    expect(radio).toBeChecked()
    // The main process saves the key's step; the page only notices its window resizing.
    await transport.call('settings.set', { 'ui.zoom': 125 })
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })
    await waitFor(() => expect(screen.getByTestId('zoom-125')).toBeChecked(), { timeout: 2000 })
  })
})
