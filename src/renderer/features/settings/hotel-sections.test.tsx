// Vardiyalar, Görev önerileri, Personel kuralları, Takvim, Otel and Bağlı cihazlar on the fake admin transport.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { MAX_ACCEPTED_CURRENCIES, SETTINGS_DEFAULTS, type SettingsPatch } from '@shared/contract'
import { COMMON_CURRENCIES } from '@/lib/currencies'
import { ApiError } from '@/lib/transport/types'
import { renderWithProviders } from '@/test/render'
import { adminTransport, defaultAdminState } from './admin-fake'
import { CalendarSection } from './calendar-section'
import { DevicesCard } from './devices-card'
import { HotelSection } from './hotel-section'
import { SettingsPage } from './settings-page'
import { ShiftsSection } from './shifts-section'
import { StaffPolicySection } from './staff-policy-section'
import { TaskSuggestionsSection } from './task-suggestions-section'

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})

afterEach(async () => {
  vi.restoreAllMocks()
  const { setViewAs } = await import('@/lib/view-as')
  setViewAs('owner')
})

describe('Vardiyalar', () => {
  it('hazır vardiyalar çevrilmiş adıyla; gece vardiyası ertesi gün biter; yeni vardiya eklenir', async () => {
    const transport = adminTransport()
    await renderWithProviders(<ShiftsSection />, { transport })
    const user = userEvent.setup()
    const night = (await screen.findByText('Gece')).closest('tr')!
    expect(within(night).getByText('ertesi gün biter')).toBeInTheDocument()
    await user.click(screen.getByTestId('add-shift'))
    await user.type(await screen.findByTestId('shift-name'), 'Ara vardiya')
    await user.click(screen.getByTestId('dialog-save'))
    await waitFor(() =>
      expect(transport.callsTo('shifts.create')).toEqual([
        { name: 'Ara vardiya', startTime: '09:00', endTime: '21:00' }
      ])
    )
  })
})

describe('Görev önerileri', () => {
  it('yasal hatırlatıcılar, otelin kendi görevleri ve öneriler ayrı; açılan öneri planlanır', async () => {
    const transport = adminTransport()
    const success = vi.spyOn(toast, 'success')
    await renderWithProviders(<TaskSuggestionsSection />, { transport })
    const user = userEvent.setup()
    const legal = await screen.findByTestId('legal-templates')
    expect(within(legal).getByText('Her ayın 1. günü · 09:00')).toBeInTheDocument()
    const own = screen.getByTestId('own-templates')
    expect(within(own).getByRole('heading', { name: 'Kendi görevleriniz' })).toBeInTheDocument()
    expect(within(own).getByText('Otelin kendi görevi')).toBeInTheDocument()
    expect(within(screen.getByTestId('suggested-templates')).queryByText('Otelin kendi görevi')).toBeNull()
    await user.click(screen.getByTestId('template-call_late_checkouts'))
    await waitFor(() => expect(transport.callsTo('tasks.activateTemplate')).toEqual([{ id: 'tpl-call' }]))
    await user.click(screen.getByTestId('template-legal_tourism_stats'))
    await waitFor(() => expect(transport.callsTo('tasks.deactivateTemplate')).toEqual([{ id: 'tpl-legal' }]))
    // The hotel's own task is switched off like a suggestion (nothing is deleted).
    await user.click(screen.getByTestId('template-tpl-own'))
    await waitFor(() =>
      expect(transport.callsTo('tasks.deactivateTemplate')).toEqual([{ id: 'tpl-legal' }, { id: 'tpl-own' }])
    )
    await waitFor(() => expect(success).toHaveBeenLastCalledWith('Görev kapatıldı'))
  })

  it('"Görev ekle": her sıklık doğru kuralla kaydedilir ve kendi görevleriniz altında görünür', async () => {
    const transport = adminTransport()
    const success = vi.spyOn(toast, 'success')
    await renderWithProviders(<TaskSuggestionsSection />, { transport })
    const user = userEvent.setup()
    await screen.findByTestId('own-templates')
    const add = async (title: string, pick: () => Promise<void>, time?: string): Promise<void> => {
      await user.click(screen.getByTestId('add-own-task'))
      await user.type(await screen.findByLabelText('Görev'), title)
      await pick()
      if (time) fireEvent.change(screen.getByLabelText('Saat'), { target: { value: time } })
      await user.click(screen.getByTestId('own-task-save'))
      await waitFor(() => expect(screen.queryByTestId('own-task-form')).not.toBeInTheDocument())
    }
    const repeat = async (name: string): Promise<void> => {
      await user.click(screen.getByRole('combobox', { name: 'Ne sıklıkla' }))
      await user.click(await screen.findByRole('option', { name }))
    }
    await add('Lobideki çiçekleri sula', async () => undefined, '08:30')
    await add('Çöpleri çıkar', async () => {
      await repeat('Her hafta')
      await user.click(screen.getByRole('button', { name: 'Pazartesi' }))
      await user.click(screen.getByRole('button', { name: 'Perşembe' }))
    })
    await add('Kira ödemesini hatırla', async () => {
      await repeat('Her ay')
      await user.click(screen.getByRole('combobox', { name: 'Ayın kaçında' }))
      await user.click(await screen.findByRole('option', { name: 'Ayın son günü' }))
    })
    await add('Yatak örtülerini yıkat', async () => {
      await repeat('Birkaç ayda bir')
      await user.clear(screen.getByLabelText('Kaç ayda bir'))
      await user.type(screen.getByLabelText('Kaç ayda bir'), '4')
    })
    await add('Tabelayı boyat', async () => repeat('Her yıl'), '10:00')
    expect(transport.callsTo('tasks.createTemplate')).toEqual([
      { title: 'Lobideki çiçekleri sula', recurrence: { kind: 'daily', time: '08:30' } },
      { title: 'Çöpleri çıkar', recurrence: { kind: 'weekly', weekdays: [1, 4], time: '09:00' } },
      { title: 'Kira ödemesini hatırla', recurrence: { kind: 'monthly', day: 31, time: '09:00' } },
      {
        title: 'Yatak örtülerini yıkat',
        recurrence: { kind: 'interval', unit: 'months', every: 4, time: '09:00' }
      },
      { title: 'Tabelayı boyat', recurrence: { kind: 'interval', unit: 'years', every: 1, time: '10:00' } }
    ])
    const own = screen.getByTestId('own-templates')
    expect(within(own).getByText('Her gün 08:30')).toBeInTheDocument()
    expect(within(own).getByText('Her hafta: Pzt, Per · 09:00')).toBeInTheDocument()
    expect(within(own).getByText('Her ayın son günü · 09:00')).toBeInTheDocument()
    expect(within(own).getByText('4 ayda bir · 09:00')).toBeInTheDocument()
    expect(within(own).getByText('Her yıl · 10:00')).toBeInTheDocument()
    expect(success).toHaveBeenCalledWith('Görev eklendi')
  })

  it('"Görev ekle": eksik ad, seçilmemiş gün ve aralık dışı ay sayısı söylenir; kaydedilmez', async () => {
    const transport = adminTransport()
    await renderWithProviders(<TaskSuggestionsSection />, { transport })
    const user = userEvent.setup()
    await user.click(await screen.findByTestId('add-own-task'))
    await user.click(await screen.findByTestId('own-task-save'))
    expect(await screen.findByText('Ne yapılacağını yazın.')).toBeInTheDocument()
    expect(screen.getByLabelText('Görev')).toHaveFocus()
    expect(screen.getByLabelText('Görev')).toHaveAttribute('aria-invalid', 'true')
    await user.type(screen.getByLabelText('Görev'), 'Çöpleri çıkar')
    expect(screen.queryByText('Ne yapılacağını yazın.')).not.toBeInTheDocument()
    await user.click(screen.getByRole('combobox', { name: 'Ne sıklıkla' }))
    await user.click(await screen.findByRole('option', { name: 'Her hafta' }))
    await user.click(screen.getByTestId('own-task-save'))
    expect(await screen.findByText('En az bir gün seçin.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pazartesi' })).toHaveFocus()
    await user.click(screen.getByRole('combobox', { name: 'Ne sıklıkla' }))
    await user.click(await screen.findByRole('option', { name: 'Birkaç ayda bir' }))
    await user.clear(screen.getByLabelText('Kaç ayda bir'))
    await user.type(screen.getByLabelText('Kaç ayda bir'), '30')
    await user.click(screen.getByTestId('own-task-save'))
    expect(await screen.findByText('2 ile 24 arasında bir sayı yazın.')).toBeInTheDocument()
    expect(screen.getByLabelText('Kaç ayda bir')).toHaveFocus()
    expect(transport.callsTo('tasks.createTemplate')).toEqual([])
  })

  it('görev düzenleme yetkisi olmayan rol görev ekleyemez ve anahtarları değiştiremez', async () => {
    const { setViewAs } = await import('@/lib/view-as')
    setViewAs('employee')
    await renderWithProviders(<TaskSuggestionsSection />, { transport: adminTransport() })
    expect(await screen.findByTestId('template-tpl-own')).toBeDisabled()
    expect(screen.getByTestId('add-own-task')).toBeDisabled()
  })

  it('görev düzenleme yetkisi olmayan rolün ekranında devre dışı "Görev ekle" nedenini yanında söyler', async () => {
    const { setViewAs } = await import('@/lib/view-as')
    setViewAs('employee')
    await renderWithProviders(<SettingsPage />, { transport: adminTransport() })
    await userEvent.setup().click(await screen.findByRole('link', { name: 'Görev önerileri' }))
    const section = await screen.findByTestId('settings-section-tasks')
    expect(await within(section).findByTestId('view-only')).toHaveTextContent('Yalnız görüntüleme')
    expect(within(section).getByTestId('add-own-task')).toBeDisabled()
  })

  it('öneriler türüne göre gruplanır; boş grubun başlığı çıkmaz', async () => {
    const only = adminTransport()
    await renderWithProviders(<TaskSuggestionsSection />, { transport: only })
    const general = await screen.findByTestId('suggested-templates-general')
    expect(within(general).getByRole('heading', { name: 'Günlük ve haftalık işler' })).toBeInTheDocument()
    expect(within(general).getByText('Çıkış yapmayan odaları ara')).toBeInTheDocument()
    // Nothing of that kind yet: no empty "Bakım ve kontrol" group.
    expect(screen.queryByTestId('suggested-templates-maintenance')).not.toBeInTheDocument()
    cleanup()

    const templates = [
      ...defaultAdminState().templates,
      {
        id: 'tpl-lift',
        code: 'lift_service',
        title: null,
        titleI18n: { tr: 'Asansör bakımı', en: 'Lift service', ru: 'Обслуживание лифта' },
        description: null,
        kind: 'maintenance' as const,
        recurrence: { kind: 'interval' as const, unit: 'months' as const, every: 1, time: '10:00' },
        suggested: true,
        active: false
      }
    ]
    await renderWithProviders(<TaskSuggestionsSection />, {
      transport: adminTransport({ state: { templates } })
    })
    const suggested = await screen.findByTestId('suggested-templates')
    const groups = within(suggested).getAllByRole('heading', { level: 4 })
    expect(groups.map((h) => h.textContent)).toEqual(['Günlük ve haftalık işler', 'Bakım ve kontrol'])
    const maintenance = within(suggested).getByTestId('suggested-templates-maintenance')
    expect(within(maintenance).getByText('Asansör bakımı')).toBeInTheDocument()
    expect(within(maintenance).queryByText('Çıkış yapmayan odaları ara')).not.toBeInTheDocument()
    expect(within(maintenance).getByRole('list', { name: 'Bakım ve kontrol' })).toBeInTheDocument()
    // The legal reminders and the hotel's own tasks stay out of the groups.
    expect(within(suggested).queryByText('Turizm istatistiği')).not.toBeInTheDocument()
    expect(within(suggested).queryByText('Otelin kendi görevi')).not.toBeInTheDocument()
  })
})

describe('Personel kuralları', () => {
  it('yalnız değişen kurallar gönderilir; oran "1,5" gibi yazılır', async () => {
    const transport = adminTransport()
    const onSave = vi.fn()
    await renderWithProviders(<StaffPolicySection values={SETTINGS_DEFAULTS} onSave={onSave} />, {
      transport
    })
    const user = userEvent.setup()
    const days = await screen.findByTestId('policy-leaveDaysPerMonth')
    expect(days).toHaveValue('4')
    await user.clear(days)
    await user.type(days, '5')
    const holiday = screen.getByTestId('policy-holidayMultiplier')
    await user.clear(holiday)
    await user.type(holiday, 'iki')
    await user.click(screen.getByTestId('policy-save'))
    expect(await screen.findByText('Oranı 1,5 gibi yazın.')).toBeInTheDocument()
    expect(holiday).toHaveFocus()
    await user.clear(holiday)
    await user.type(holiday, '2,5')
    await user.click(screen.getByTestId('policy-save'))
    await waitFor(() =>
      expect(transport.callsTo('staff.setPolicy')).toEqual([
        { employeeId: null, values: { leaveDaysPerMonth: 5, holidayMultiplier: '2.5' } }
      ])
    )
  })

  it('geçersiz sayı yazılınca ileti hemen çıkar, Kaydet açık kalır; sınır dışı değer gönderilmez', async () => {
    const transport = adminTransport()
    await renderWithProviders(<StaffPolicySection values={SETTINGS_DEFAULTS} onSave={vi.fn()} />, {
      transport
    })
    const user = userEvent.setup()
    const days = await screen.findByTestId('policy-leaveDaysPerMonth')
    expect(screen.getByTestId('policy-save')).toBeDisabled()
    await user.clear(days)
    await user.type(days, '99')
    expect(days).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByTestId('policy-save')).toBeEnabled()
    await user.click(screen.getByTestId('policy-save'))
    expect(days).toHaveFocus()
    expect(transport.callsTo('staff.setPolicy')).toEqual([])
    await user.clear(days)
    await user.type(days, '4')
    expect(days).not.toHaveAttribute('aria-invalid')
    expect(screen.getByTestId('policy-save')).toBeDisabled()
  })

  it('kasadan avans anahtarı otel ayarını yazar; yetkisi olmayan rol değiştiremez', async () => {
    const onSave = vi.fn<(patch: SettingsPatch) => void>()
    await renderWithProviders(<StaffPolicySection values={SETTINGS_DEFAULTS} onSave={onSave} />, {
      transport: adminTransport()
    })
    const user = userEvent.setup()
    await user.click(await screen.findByRole('switch', { name: 'Resepsiyon kasasından avans verilebilir' }))
    expect(onSave).toHaveBeenCalledWith({ 'staff.advanceFromDrawer': true }, true)
  })

  it('çalışanın kendi saatini kaç gün geriye yazacağı seçilir; varsayılan 7 gün (QA2a, K-46)', async () => {
    const onSave = vi.fn<(patch: SettingsPatch) => void>()
    await renderWithProviders(<StaffPolicySection values={SETTINGS_DEFAULTS} onSave={onSave} />, {
      transport: adminTransport()
    })
    const user = userEvent.setup()
    const pick = await screen.findByRole('combobox', { name: 'Kaç gün geriye yazılabilir' })
    expect(pick).toHaveTextContent('7 gün geriye')
    await user.click(pick)
    await user.click(await screen.findByRole('option', { name: 'Yalnız bugün' }))
    expect(onSave).toHaveBeenCalledWith({ 'staff.ownHoursBackDays': 0 }, true)
  })
})

describe('Takvim', () => {
  it('vurgulu günler seçilir; bu yılın bayramları listelenir (not olanlar değil)', async () => {
    const onSave = vi.fn()
    await renderWithProviders(<CalendarSection values={SETTINGS_DEFAULTS} onSave={onSave} />, {
      transport: adminTransport()
    })
    const user = userEvent.setup()
    const holidays = await screen.findByTestId('holiday-list')
    expect(within(holidays).getByText('Ulusal Egemenlik ve Çocuk Bayramı')).toBeInTheDocument()
    expect(within(holidays).getByText('Tahmini')).toBeInTheDocument()
    expect(within(holidays).queryByText('Boya')).not.toBeInTheDocument()
    await user.click(within(screen.getByTestId('highlight-weekdays')).getByRole('button', { name: 'Cuma' }))
    expect(onSave).toHaveBeenCalledWith({ 'calendar.highlightWeekdays': [0, 5, 6] })
  })

  it('hafta sonu fiyatı geceleri vurgulu günlerden ayrı seçilir (K-44)', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    await renderWithProviders(<CalendarSection values={SETTINGS_DEFAULTS} onSave={onSave} />, {
      transport: adminTransport()
    })
    const nights = await screen.findByTestId('weekend-nights')
    expect(within(nights).getByRole('button', { name: 'Cuma' })).toHaveAttribute('data-state', 'on')
    expect(within(nights).getByRole('button', { name: 'Pazar' })).toHaveAttribute('data-state', 'off')
    await user.click(within(nights).getByRole('button', { name: 'Cuma' }))
    expect(onSave).toHaveBeenCalledWith({ 'pricing.weekendNights': [6] })
  })
})

describe('Takvim: grup hesabı (S-106)', () => {
  it('varsayılan tek hesap; oda başına hesaba geçilince ayar kaydedilir', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    await renderWithProviders(<CalendarSection values={SETTINGS_DEFAULTS} onSave={onSave} />, {
      transport: adminTransport()
    })
    const mode = await screen.findByTestId('settings-group-folio')
    expect(within(mode).getByRole('radio', { name: 'Tek hesap' })).toHaveAttribute('data-state', 'on')
    await user.click(within(mode).getByRole('radio', { name: 'Oda başına hesap' }))
    expect(onSave).toHaveBeenCalledWith({ 'booking.groupFolioMode': 'per_room' }, true)
  })
})

describe('Otel', () => {
  it('yalnız değişen ayarlar kaydedilir; ana para birimi her zaman kabul edilir', async () => {
    const onSave = vi.fn()
    await renderWithProviders(<HotelSection values={SETTINGS_DEFAULTS} onSave={onSave} pending={false} />)
    const user = userEvent.setup()
    expect(await screen.findByTestId('hotel-save')).toBeDisabled()
    await user.type(screen.getByLabelText('Şehir'), 'İstanbul')
    await user.click(screen.getByTestId('currency-RUB'))
    expect(screen.getByTestId('currency-TRY')).toBeDisabled()
    await user.click(screen.getByTestId('hotel-save'))
    expect(onSave).toHaveBeenCalledWith(
      { 'hotel.city': 'İstanbul', 'hotel.currencies': ['TRY', 'EUR', 'USD', 'GBP'] },
      true
    )
  })

  it('otelin e-postası: geçersizse alanın altında söylenir ve kaydedilmez; düzelince boşluksuz kaydedilir (K-13)', async () => {
    const onSave = vi.fn()
    await renderWithProviders(<HotelSection values={SETTINGS_DEFAULTS} onSave={onSave} pending={false} />)
    const user = userEvent.setup()
    const email = await screen.findByLabelText('Otelin e-posta adresi')
    expect(email).toHaveAttribute('dir', 'ltr')
    await user.type(email, 'resepsiyon@')
    await user.click(screen.getByTestId('hotel-save'))
    expect(screen.getByTestId('hotel-email-error')).toHaveTextContent(
      'E-posta adresi info@oteladiniz.com gibi olmalı ya da boş kalmalı.'
    )
    expect(email).toHaveFocus()
    expect(email).toHaveAttribute('aria-invalid', 'true')
    expect(onSave).not.toHaveBeenCalled()
    await user.type(email, 'ornek-otel.com ')
    expect(screen.queryByTestId('hotel-email-error')).not.toBeInTheDocument()
    await user.click(screen.getByTestId('hotel-save'))
    expect(onSave).toHaveBeenCalledWith({ 'hotel.email': 'resepsiyon@ornek-otel.com' }, true)
  })

  it('"yen" yazınca Japon yeni bulunur; seçilince işaretli satır olur, ana birim listesinde çıkar ve ayara yazılır', async () => {
    const onSave = vi.fn()
    await renderWithProviders(<HotelSection values={SETTINGS_DEFAULTS} onSave={onSave} pending={false} />)
    const user = userEvent.setup()
    expect(screen.queryByTestId('currency-JPY')).not.toBeInTheDocument()
    await user.click(await screen.findByTestId('currency-add'))
    await user.type(await screen.findByTestId('currency-add-search'), 'yen')
    expect(screen.getByTestId('currency-add-JPY')).toHaveTextContent('Japon yeni')
    expect(screen.queryByTestId('currency-add-TRY')).not.toBeInTheDocument()
    await user.click(screen.getByTestId('currency-add-JPY'))

    expect(screen.queryByTestId('currency-add-search')).not.toBeInTheDocument()
    expect(screen.getByTestId('currency-JPY')).toBeChecked()
    await user.click(screen.getByTestId('base-currency'))
    expect(await screen.findByRole('option', { name: /JPY/ })).toBeInTheDocument()
    await user.keyboard('{Escape}')

    await user.click(screen.getByTestId('hotel-save'))
    expect(onSave).toHaveBeenCalledWith(
      { 'hotel.currencies': [...SETTINGS_DEFAULTS['hotel.currencies'], 'JPY'] },
      true
    )
  })

  it('masaüstünde seçilince odak yeni satıra geçer, satır kaydırılır ve "eklendi" duyurulur', async () => {
    const scroll = vi.spyOn(Element.prototype, 'scrollIntoView')
    await renderWithProviders(<HotelSection values={SETTINGS_DEFAULTS} onSave={vi.fn()} pending={false} />)
    const user = userEvent.setup()
    await user.click(await screen.findByTestId('currency-add'))
    await user.type(await screen.findByTestId('currency-add-search'), 'yen')
    await user.click(screen.getByTestId('currency-add-JPY'))

    const row = screen.getByTestId('currency-JPY')
    await waitFor(() => expect(row).toHaveFocus())
    expect(scroll.mock.contexts).toContain(row.closest('label'))
    expect(screen.getByTestId('currency-add-announce')).toHaveTextContent('Japon yeni eklendi.')
  })

  it('telefonda alttan açılan sayfadan seçilince de odak yeni satıra geçer; Esc ile kapanınca düğmeye döner', async () => {
    const media = window.matchMedia
    window.matchMedia = ((query: string) => ({ ...media(query), matches: true })) as typeof window.matchMedia
    try {
      const scroll = vi.spyOn(Element.prototype, 'scrollIntoView')
      await renderWithProviders(<HotelSection values={SETTINGS_DEFAULTS} onSave={vi.fn()} pending={false} />)
      const user = userEvent.setup()
      const button = await screen.findByTestId('currency-add')

      await user.click(button)
      await user.type(await screen.findByTestId('currency-add-search'), 'yen')
      await user.keyboard('{Escape}')
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      await waitFor(() => expect(button).toHaveFocus())
      expect(screen.queryByTestId('currency-JPY')).not.toBeInTheDocument()

      await user.click(button)
      await user.type(await screen.findByTestId('currency-add-search'), 'yen')
      await user.click(screen.getByTestId('currency-add-JPY'))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      const row = screen.getByTestId('currency-JPY')
      await waitFor(() => expect(row).toHaveFocus())
      expect(scroll.mock.contexts).toContain(row.closest('label'))
      expect(screen.getByTestId('currency-add-announce')).toHaveTextContent('Japon yeni eklendi.')
    } finally {
      window.matchMedia = media
    }
  })

  it('eklenen birim işareti kaldırılınca listede kalır; değişiklik kalmadığı için kaydet kapalıdır', async () => {
    await renderWithProviders(<HotelSection values={SETTINGS_DEFAULTS} onSave={vi.fn()} pending={false} />)
    const user = userEvent.setup()
    await user.click(await screen.findByTestId('currency-add'))
    await user.type(await screen.findByTestId('currency-add-search'), 'jpy')
    await user.click(screen.getByTestId('currency-add-JPY'))
    expect(screen.getByTestId('hotel-save')).toBeEnabled()
    await user.click(screen.getByTestId('currency-JPY'))
    expect(screen.getByTestId('currency-JPY')).not.toBeChecked()
    expect(screen.getByTestId('hotel-save')).toBeDisabled()
  })

  it('en çok kabul edilen sayıya gelince ekleme ve işaretsiz satırlar kapanır, nedeni yazar; bir işaret kalkınca açılır', async () => {
    const full = [...COMMON_CURRENCIES, 'JPY', 'PLN', 'CNY', 'CZK', 'SEK', 'NOK']
    expect(full).toHaveLength(MAX_ACCEPTED_CURRENCIES)
    const values = { ...SETTINGS_DEFAULTS, 'hotel.currencies': full }
    await renderWithProviders(<HotelSection values={values} onSave={vi.fn()} pending={false} />)
    const user = userEvent.setup()
    expect(await screen.findByTestId('currency-add')).toBeDisabled()
    expect(screen.getByTestId('currency-add-limit')).toHaveTextContent(
      'En çok 20 para birimi kabul edilebilir.'
    )
    await user.click(screen.getByTestId('currency-NOK'))
    expect(screen.getByTestId('currency-add')).toBeEnabled()
    expect(screen.queryByTestId('currency-add-limit')).not.toBeInTheDocument()
    // At the limit again: a ticked-off row cannot be ticked while twenty are on.
    await user.click(screen.getByTestId('currency-add'))
    await user.type(await screen.findByTestId('currency-add-search'), 'dkk')
    await user.click(screen.getByTestId('currency-add-DKK'))
    expect(screen.getByTestId('currency-add')).toBeDisabled()
    expect(screen.getByTestId('currency-NOK')).toBeDisabled()
    expect(screen.getByTestId('currency-NOK')).not.toBeChecked()
  })

  it('otel adı boş bırakılamaz: hata gösterilir, alan odaklanır', async () => {
    const onSave = vi.fn()
    await renderWithProviders(<HotelSection values={SETTINGS_DEFAULTS} onSave={onSave} pending={false} />)
    const user = userEvent.setup()
    await user.clear(await screen.findByLabelText('Otel adı'))
    await user.click(screen.getByTestId('hotel-save'))
    expect(screen.getByTestId('hotel-name-error')).toBeInTheDocument()
    expect(screen.getByLabelText('Otel adı')).toHaveFocus()
    expect(onSave).not.toHaveBeenCalled()
  })
})

describe('Bağlı cihazlar', () => {
  it('oturum ve cihaz sorularak kapatılır; yetkisiz yanıt bildirilir', async () => {
    const error = vi.spyOn(toast, 'error')
    const transport = adminTransport({
      refuse: { 'auth.revokeDevice': new ApiError('PERMISSION_DENIED', 403, 'errors.permissionDenied') }
    })
    await renderWithProviders(<DevicesCard />, { transport })
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Oturumu kapat: Otel Sahibi' }))
    await user.click(await screen.findByTestId('confirm-revoke'))
    await waitFor(() => expect(transport.callsTo('auth.revokeSession')).toEqual([{ id: 'session-1' }]))
    await user.click(screen.getByRole('button', { name: 'Cihazı çıkar: Kayıp telefon' }))
    expect(await screen.findByText('Kayıp telefon cihazı çıkarılsın mı?')).toBeInTheDocument()
    await user.click(screen.getByTestId('confirm-revoke'))
    await waitFor(() => expect(error).toHaveBeenCalled())
  })

  it('pencerenin kendi oturumu "Bu oturum" diye işaretli; işletim sistemi adıyla yazılır', async () => {
    const transport = adminTransport()
    // The signed-in owner of the fake window (test/render.tsx) is u-owner.
    transport.state.devices[0]!.sessions[0]!.userId = 'u-owner'
    await renderWithProviders(<DevicesCard />, { transport })
    const session = await screen.findByTestId('session-session-1')
    expect(within(session).getByTestId('this-session')).toHaveTextContent('Bu oturum')
    expect(within(session).getByRole('button', { name: 'Oturumu kapat: Otel Sahibi' })).toHaveAttribute(
      'data-variant',
      'outline'
    )
    const device = screen.getByTestId('device-device-1')
    expect(device).toHaveTextContent('Windows')
    expect(device).not.toHaveTextContent('win32')
    // Another device's sign-in is not this window's.
    expect(screen.getByTestId('device-device-2')).not.toHaveTextContent('Bu oturum')
  })
})
