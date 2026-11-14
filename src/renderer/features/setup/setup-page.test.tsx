import { beforeAll, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setupDraftSchema } from '@shared/contract'
import { ApiError, BISMUTH_KEY, RECOVERY_CODES, renderSetup, setupTransport } from './test-kit'

type User = ReturnType<typeof userEvent.setup>
const next = (user: User) => user.click(screen.getByTestId('setup-next'))
const heading = (name: string) => screen.findByRole('heading', { level: 2, name })

// jsdom lacks what Radix Select calls when it opens.
beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})

/** The room generator at 5 floors × 4 rooms (it starts at one room). */
async function fiveByFour(user: User): Promise<void> {
  await user.clear(screen.getByTestId('setup-floors'))
  await user.type(screen.getByTestId('setup-floors'), '5')
  await user.clear(screen.getByTestId('setup-per-floor'))
  await user.type(screen.getByTestId('setup-per-floor'), '4')
}

async function fillOwner(user: User, pin = '2468'): Promise<void> {
  await user.type(screen.getByLabelText('Adınız'), 'Otel Sahibi')
  await user.type(screen.getByLabelText('Kullanıcı adı'), 'sahip')
  await user.type(screen.getByTestId('setup-owner-password'), 'cok-gizli-sifre')
  await user.type(screen.getByTestId('setup-owner-repeat'), 'cok-gizli-sifre')
  if (pin) await user.type(screen.getByTestId('setup-owner-pin'), pin)
}

describe('kurulum sihirbazı: düzen', () => {
  it('adım gövdesi masaüstünde sabit yükseklikte kayar; telefonda Geri ve İleri ekranın altına yapışır', async () => {
    await renderSetup()
    expect(await screen.findByTestId('setup-step-body')).toHaveClass('md:overflow-y-auto')
    expect(screen.getByTestId('setup-footer')).toHaveClass('max-md:sticky', 'max-md:bottom-0')
    expect(screen.getByTestId('setup-back')).toBeDisabled()
  })

  it('yüklenirken iskelet sihirbaz biçiminde: telefonda adım satırı ve çubuk yeri de var', async () => {
    const transport = setupTransport()
    const call = transport.call.bind(transport)
    // The wizard's choices never arrive: the skeleton stays.
    transport.call = ((name: string, input: unknown) =>
      name === 'setup.options'
        ? new Promise(() => undefined)
        : call(name as never, input as never)) as typeof call
    await renderSetup({ transport })
    expect(await screen.findByTestId('setup-loading')).toBeInTheDocument()
    expect(screen.getByTestId('setup-loading-progress')).toHaveClass('md:hidden')
  })

  it('on dört adım sırayla listelenir; zorunlu olmayan adımda "Atla" ve "İsteğe bağlı" görünür', async () => {
    const user = userEvent.setup()
    await renderSetup({ path: '/setup?step=8' })
    expect(await heading('Ödeme ve satış')).toBeInTheDocument()
    expect(screen.getByText('İsteğe bağlı')).toBeInTheDocument()
    expect(
      screen.getAllByRole('listitem').filter((li) => li.querySelector('[data-testid^="setup-goto-"]'))
    ).toHaveLength(14)
    await user.click(screen.getByTestId('setup-skip'))
    expect(await heading('Personel ve vardiyalar')).toBeInTheDocument()
  })

  it('saatlik satış adımı isteğe bağlıdır: seçili tipleri listeler, boş geçilebilir, "Atla" görünür', async () => {
    const user = userEvent.setup()
    await renderSetup({ path: '/setup?step=7' })
    expect(await heading('Saatlik satış')).toBeInTheDocument()
    expect(screen.getByText('İsteğe bağlı')).toBeInTheDocument()
    expect(within(screen.getByTestId('setup-hourly-types')).getAllByRole('listitem')).toHaveLength(1)
    // On the phone "Atla" is a 44 px target like the other footer buttons (the ghost button keeps its own height).
    expect(screen.getByTestId('setup-skip')).toHaveClass('max-md:h-11')
    await user.click(screen.getByTestId('setup-skip'))
    expect(await heading('Ödeme ve satış')).toBeInTheDocument()
  })

  it('kamera adımı isteğe bağlıdır: akış görünür, "Atla" ve boş "İleri" kamera eklemeden geçer (P20g)', async () => {
    const user = userEvent.setup()
    const { transport } = await renderSetup({ path: '/setup?step=12' })
    expect(await heading('Kamera')).toBeInTheDocument()
    expect(screen.getByText('İsteğe bağlı')).toBeInTheDocument()
    expect(await screen.findByTestId('setup-camera-flow')).toBeInTheDocument()
    expect(screen.getByTestId('setup-goto-camera')).toBeInTheDocument()
    await user.click(screen.getByTestId('setup-skip'))
    expect(await heading('Sahip hesabı')).toBeInTheDocument()
    // Nothing about the camera is part of the wizard's saved answers (the address is a secret).
    expect(JSON.stringify(transport.saves)).not.toMatch(/camera|rtsp/i)
  })

  it('telefonda odaklanan alan yapışkan Geri / İleri çubuğunun altında kalmaz', async () => {
    const media = window.matchMedia
    window.matchMedia = ((query: string) => ({ ...media(query), matches: true })) as typeof window.matchMedia
    try {
      await renderSetup({ path: '/setup?step=3' })
      expect(await screen.findByTestId('setup-step-of')).toHaveTextContent('Adım 3 / 14')
      const field = screen.getByLabelText('Çıkış saati')
      vi.spyOn(screen.getByTestId('setup-footer'), 'getBoundingClientRect').mockReturnValue({
        top: 775
      } as DOMRect)
      vi.spyOn(field, 'getBoundingClientRect').mockReturnValue({ bottom: 800 } as DOMRect)
      const scroll = vi.spyOn(window, 'scrollBy').mockImplementation(() => undefined)
      field.focus()
      await waitFor(() => expect(scroll).toHaveBeenCalledWith({ top: 41 }))
    } finally {
      window.matchMedia = media
      vi.restoreAllMocks()
    }
  })

  it('oda tipleri zorunludur: "İsteğe bağlı" ve "Atla" yok', async () => {
    await renderSetup({ path: '/setup?step=5' })
    expect(await heading('Oda tipleri')).toBeInTheDocument()
    expect(screen.queryByText('İsteğe bağlı')).not.toBeInTheDocument()
    expect(screen.queryByTestId('setup-skip')).not.toBeInTheDocument()
  })

  it('adım listesi yalnız açılmış ve doğru doldurulmuş adımı işaretler', async () => {
    const user = userEvent.setup()
    await renderSetup()
    expect(await heading('Dil ve tema')).toBeInTheDocument()
    const done = (step: string) =>
      screen.getByTestId(`setup-goto-${step}`).querySelector('[data-complete]') !== null
    expect(done('language')).toBe(false)
    await next(user)
    expect(await heading('Çalışma şekli')).toBeInTheDocument()
    expect(done('language')).toBe(true)
    expect(screen.getByTestId('setup-goto-language')).toHaveAccessibleName('Dil ve tema, tamamlandı')
    // Jumping ahead does not tick the steps in between; an opened step with an empty hotel name stays unticked.
    await user.click(screen.getByTestId('setup-goto-hotel'))
    await user.click(screen.getByTestId('setup-goto-owner'))
    expect(done('mode')).toBe(true)
    expect(done('hotel')).toBe(false)
    expect(done('currencies')).toBe(false)
    await user.click(screen.getByTestId('setup-goto-hotel'))
    await user.type(screen.getByLabelText('Otel adı'), 'Martı Otel')
    await user.click(screen.getByTestId('setup-goto-owner'))
    expect(done('hotel')).toBe(true)
  })

  it('İleri ve Geri yeni adımın başlığına odaklanır; "Adım içeriğine geç" başlığa götürür', async () => {
    const user = userEvent.setup()
    await renderSetup()
    expect(await heading('Dil ve tema')).toBeInTheDocument()
    expect(screen.getByTestId('setup-step-title')).toHaveAttribute('tabindex', '-1')
    await next(user)
    await waitFor(() => expect(screen.getByTestId('setup-step-title')).toHaveFocus())
    expect(screen.getByTestId('setup-step-title')).toHaveTextContent('Çalışma şekli')
    await user.click(screen.getByTestId('setup-back'))
    await waitFor(() => expect(screen.getByTestId('setup-step-title')).toHaveTextContent('Dil ve tema'))
    expect(screen.getByTestId('setup-step-title')).toHaveFocus()
    screen.getByTestId('setup-goto-hotel').focus()
    await user.click(screen.getByRole('button', { name: 'Adım içeriğine geç' }))
    expect(screen.getByTestId('setup-step-title')).toHaveFocus()
  })

  it('telefonda Geri okla birlikte yazıyla da görünür', async () => {
    await renderSetup({ path: '/setup?step=3' })
    const back = await screen.findByRole('button', { name: 'Geri' })
    expect(back).not.toHaveClass('max-md:w-11')
    expect(within(back).getByText('Geri')).not.toHaveClass('max-md:sr-only')
  })

  it('alan hataları gövde boyunda (text-sm)', async () => {
    const user = userEvent.setup()
    await renderSetup({ path: '/setup?step=3' })
    await screen.findByLabelText('Otel adı')
    await next(user)
    expect(screen.getByTestId('setup-hotel-name-error')).toHaveClass('text-sm')
  })
})

describe('kurulum sihirbazı: adımlar', () => {
  it('dil seçilince ayar hemen yazılır (arayüz canlı değişir)', async () => {
    const user = userEvent.setup()
    const { transport } = await renderSetup()
    await user.click(await screen.findByTestId('setup-lang-ru'))
    await user.click(screen.getByTestId('setup-theme-dark'))
    await waitFor(() => expect(transport.settings['ui.language']).toBe('ru'))
    expect(transport.settings['ui.theme']).toBe('dark')
  })

  it('otel adı boşken İleri ilerlemez: alan işaretlenir ve odaklanır; doldurunca ilerler ve kaydeder', async () => {
    const user = userEvent.setup()
    const { transport } = await renderSetup({ path: '/setup?step=3' })
    expect(await heading('Otel')).toBeInTheDocument()
    await next(user)
    const name = screen.getByLabelText('Otel adı')
    expect(name).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Bu alanı doldurun.')).toBeInTheDocument()
    await waitFor(() => expect(name).toHaveFocus())
    expect(transport.saves).toHaveLength(0)
    await user.type(name, 'Martı Otel')
    await next(user)
    expect(await heading('Para birimleri')).toBeInTheDocument()
    expect(transport.saves.at(-1)).toMatchObject({ step: 4, draft: { hotel: { name: 'Martı Otel' } } })
  })

  it('Enter İleri gibi çalışır', async () => {
    const user = userEvent.setup()
    await renderSetup({ path: '/setup?step=3' })
    await user.type(await screen.findByLabelText('Otel adı'), 'Martı Otel{Enter}')
    expect(await heading('Para birimleri')).toBeInTheDocument()
  })

  it('istemci seçilince mod kaydedilir ve bağlantı ekranına gidilir', async () => {
    const user = userEvent.setup()
    const { transport } = await renderSetup({ path: '/setup?step=2' })
    await user.click(await screen.findByTestId('setup-mode-client'))
    expect(screen.getByTestId('setup-mode-note')).toHaveTextContent('Bu bilgisayarda otel kurulmaz')
    await user.click(screen.getByRole('button', { name: /Bağlantı ekranına geç/ }))
    expect(await screen.findByTestId('connect-screen')).toBeInTheDocument()
    expect(transport.modes).toEqual(['client'])
  })

  it('özel oda tipi eklenir; seçilen tip kalkınca üretici özel tipe geçer ve odalar ona atanır', async () => {
    const user = userEvent.setup()
    await renderSetup({ path: '/setup?step=5' })
    expect(await heading('Oda tipleri')).toBeInTheDocument()
    await user.type(screen.getByTestId('setup-custom-type'), 'Bahçe odası{Enter}')
    expect(
      within(screen.getByTestId('setup-chosen-types')).getByDisplayValue('Bahçe odası')
    ).toBeInTheDocument()
    await user.click(screen.getByTestId('setup-type-double'))
    expect(screen.getByText('1 seçili')).toBeInTheDocument()
    await next(user)
    expect(await heading('Odalar')).toBeInTheDocument()
    expect(screen.getByTestId('setup-gen-type')).toHaveTextContent('Bahçe odası')
  })

  it('arama tip listesini daraltır; hiçbir tip kalmazsa İleri uyarır', async () => {
    const user = userEvent.setup()
    await renderSetup({ path: '/setup?step=5' })
    await user.type(await screen.findByTestId('setup-type-search'), 'deniz')
    expect(screen.getByTestId('setup-type-sea_view')).toBeInTheDocument()
    expect(screen.queryByTestId('setup-type-single')).not.toBeInTheDocument()
    await user.clear(screen.getByTestId('setup-type-search'))
    await user.click(screen.getByTestId('setup-type-double'))
    await next(user)
    expect(screen.getByText('En az bir oda tipi seçin ya da kendi tipinizi ekleyin.')).toBeInTheDocument()
  })

  it('oda yokken İleri uyarır; 5 kat × 4 oda oluşur, biri kaldırılınca 19 oda · 38 yatak', async () => {
    const user = userEvent.setup()
    await renderSetup({ path: '/setup?step=6' })
    expect(await heading('Odalar')).toBeInTheDocument()
    await next(user)
    expect(screen.getByText('En az bir oda ekleyin.')).toBeInTheDocument()
    expect(screen.getByTestId('setup-generate-count')).toHaveTextContent('1 oda oluşacak')
    await fiveByFour(user)
    expect(screen.getByTestId('setup-generate-count')).toHaveTextContent('20 oda oluşacak')
    await user.click(screen.getByTestId('setup-generate'))
    expect(screen.getByTestId('setup-room-totals')).toHaveTextContent('20 oda · 40 yatak')
    expect(screen.getByDisplayValue('504')).toBeInTheDocument()
    await user.click(screen.getByTestId('setup-remove-room-504'))
    expect(screen.getByTestId('setup-room-totals')).toHaveTextContent('19 oda · 38 yatak')
  })

  it('aynı oda numarası iki kez yazılırsa ikinci işaretlenir', async () => {
    const user = userEvent.setup()
    await renderSetup({ path: '/setup?step=6' })
    await user.clear(await screen.findByTestId('setup-per-floor'))
    await user.type(screen.getByTestId('setup-per-floor'), '2')
    await user.click(screen.getByTestId('setup-generate'))
    const second = screen.getByDisplayValue('102')
    await user.clear(second)
    await user.type(second, '101')
    await next(user)
    expect(second).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Bu oda numarası listede birden fazla var.')).toBeInTheDocument()
  })

  it('"Yeniden oluştur" penceresi kapanınca odak oluştur düğmesine döner; oda tipinin tam adı ipucunda', async () => {
    const user = userEvent.setup()
    await renderSetup({ path: '/setup?step=6' })
    await user.click(await screen.findByTestId('setup-generate'))
    const row = screen.getByTestId('setup-room-101')
    expect(within(row).getByRole('combobox', { name: 'Oda tipi' })).toHaveAttribute(
      'title',
      'Çift kişilik (Double)'
    )
    await user.click(screen.getByTestId('setup-generate'))
    await user.click(await screen.findByRole('button', { name: 'Vazgeç' }))
    await waitFor(() => expect(screen.getByTestId('setup-generate')).toHaveFocus())
  })

  it('kendi eklenen adın kaldır düğmesi telefonda 44 px', async () => {
    const user = userEvent.setup()
    await renderSetup({ path: '/setup?step=8' })
    await user.type(await screen.findByTestId('setup-add-salesChannels'), 'Kapıdan tavsiye{Enter}')
    expect(screen.getByRole('button', { name: 'Kaldır: Kapıdan tavsiye' })).toHaveClass('max-md:size-11')
  })

  it('nakit ödeme yöntemi kapatılırsa İleri uyarır; kendi kanal adınız eklenir', async () => {
    const user = userEvent.setup()
    const { transport } = await renderSetup({ path: '/setup?step=8' })
    await user.click(await screen.findByTestId('setup-list-paymentMethods-cash'))
    await next(user)
    expect(screen.getByTestId('setup-cash-method-error')).toBeInTheDocument()
    expect(screen.getByTestId('setup-list-paymentMethods-cash')).toHaveFocus()
    await user.click(screen.getByTestId('setup-list-paymentMethods-cash'))
    await user.type(screen.getByTestId('setup-add-salesChannels'), 'Kapıdan tavsiye{Enter}')
    await user.type(screen.getByTestId('setup-add-salesChannels'), 'kapıdan TAVSİYE{Enter}')
    expect(screen.getByText('Bu ad listede zaten var.')).toBeInTheDocument()
    await next(user)
    expect(await heading('Personel ve vardiyalar')).toBeInTheDocument()
    expect(transport.saves.at(-1)?.draft).toMatchObject({
      lists: { customSalesChannels: ['Kapıdan tavsiye'] }
    })
  })

  it('satış kanalları türüne göre başlıklar altında gelir; yalnızca otelin kanalları işaretli başlar', async () => {
    await renderSetup({ path: '/setup?step=8' })
    const channels = await screen.findByTestId('setup-list-salesChannels')
    const groups = within(channels).getAllByRole('group')
    expect(
      groups
        .map((g) => g.getAttribute('aria-labelledby'))
        .map((id) => document.getElementById(id!)?.textContent)
    ).toEqual(['Doğrudan satış', 'Satış siteleri', 'Acente ve toptancılar', 'Bavul emaneti'])
    const chips = (name: string) =>
      within(within(channels).getByRole('group', { name })).getAllByRole('checkbox')
    expect(
      chips('Doğrudan satış').map((c) => [c.getAttribute('data-testid'), c.getAttribute('aria-checked')])
    ).toEqual([
      ['setup-list-salesChannels-direct', 'true'],
      ['setup-list-salesChannels-email', 'true'],
      ['setup-list-salesChannels-whatsapp', 'false']
    ])
    expect(chips('Satış siteleri').map((c) => c.getAttribute('aria-checked'))).toEqual([
      'true',
      'true',
      'false',
      'false'
    ])
    expect(chips('Acente ve toptancılar').map((c) => c.getAttribute('aria-checked'))).toEqual(['false'])
    expect(chips('Bavul emaneti').map((c) => c.getAttribute('aria-checked'))).toEqual(['true', 'false'])
    // The hotel's own names get a heading of their own, only once there is one.
    expect(within(channels).queryByRole('group', { name: 'Eklediğiniz kanallar' })).not.toBeInTheDocument()
  })

  it('kanal işaretlenince seçim taslağa seçenek sırasıyla yazılır; kendi eklenen ad "Eklediğiniz kanallar" altında durur', async () => {
    const user = userEvent.setup()
    const { transport } = await renderSetup({ path: '/setup?step=8' })
    await user.click(await screen.findByTestId('setup-list-salesChannels-hotels_com'))
    await user.click(screen.getByTestId('setup-list-salesChannels-whatsapp'))
    await user.click(screen.getByTestId('setup-list-salesChannels-airbnb'))
    await user.type(screen.getByTestId('setup-add-salesChannels'), 'Kapıdan tavsiye{Enter}')
    const own = within(screen.getByTestId('setup-list-salesChannels')).getByRole('group', {
      name: 'Eklediğiniz kanallar'
    })
    expect(within(own).getByText('Kapıdan tavsiye')).toBeInTheDocument()
    await next(user)
    expect(await heading('Personel ve vardiyalar')).toBeInTheDocument()
    expect(transport.saves.at(-1)?.draft.lists).toMatchObject({
      salesChannels: ['ch-direct', 'ch-email', 'ch-whatsapp', 'ch-booking', 'ch-hotels', 'ch-bounce'],
      customSalesChannels: ['Kapıdan tavsiye']
    })
  })

  it('Otelz.com ve Hotels.com her dilde ayrı adla ve ayrı başlıkla ayırt edilir (Rusça dahil)', async () => {
    await renderSetup({ path: '/setup?step=8', settings: { 'ui.language': 'ru' } })
    const channels = await screen.findByTestId('setup-list-salesChannels')
    const sites = within(within(channels).getByRole('group', { name: 'Сайты бронирования' }))
    expect(sites.getByTestId('setup-list-salesChannels-otelz')).toHaveAccessibleName('Otelz.com (Турция)')
    expect(sites.getByTestId('setup-list-salesChannels-hotels_com')).toHaveAccessibleName(
      'Hotels.com (Expedia Group)'
    )
    expect(within(channels).getByRole('group', { name: 'Хранение багажа' })).toBeInTheDocument()
  })

  it('personel: ek mesai katı sayı olmalı; yeni vardiyanın adı boş kalamaz', async () => {
    const user = userEvent.setup()
    await renderSetup({ path: '/setup?step=9' })
    const holiday = await screen.findByLabelText('Bayramda çalışma katı')
    await user.clear(holiday)
    await user.click(screen.getByTestId('setup-add-shift'))
    await next(user)
    expect(holiday).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Bir sayı yazın (örn. 1,5).')).toBeInTheDocument()
    expect(screen.getAllByLabelText('Vardiya adı').at(-1)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getAllByLabelText('Vardiya adı')[0]).toHaveValue('Gündüz')
  })

  it('personel: vardiya saatleri 9rem genişliğinde; telefonda iki saat yan yana ayrı satırda', async () => {
    await renderSetup({ path: '/setup?step=9' })
    const times = (await screen.findAllByTestId('setup-shift-times'))[0]!
    expect(times).toHaveClass('grid-cols-2', 'sm:contents')
    expect(times.closest('li')).toHaveClass('sm:grid-cols-[minmax(0,1fr)_9rem_9rem_auto]', 'items-end')
  })

  it('personel: prim yüzdeyse oran istenir ve taslağa yazılır; sabit tutar seçilebilir', async () => {
    const user = userEvent.setup()
    const { transport } = await renderSetup({ path: '/setup?step=9' })
    expect(await screen.findByRole('combobox', { name: 'Prim' })).toHaveTextContent('Yok')
    await user.click(screen.getByRole('combobox', { name: 'Prim' }))
    await user.click(await screen.findByRole('option', { name: 'Yüzde' }))
    await next(user)
    const pct = screen.getByLabelText('Prim oranı (%)')
    expect(pct).toHaveAttribute('aria-invalid', 'true')
    await user.type(pct, '2,5')
    await next(user)
    expect(await heading('Çalışanlar')).toBeInTheDocument()
    expect(transport.saves.at(-1)?.draft).toMatchObject({
      staff: { commissionMode: 'pct', commissionPct: '2,5' }
    })
    await user.click(screen.getByTestId('setup-back'))
    await user.click(await screen.findByRole('combobox', { name: 'Prim' }))
    await user.click(await screen.findByRole('option', { name: 'Sabit tutar' }))
    expect(screen.getByLabelText('Prim tutarı')).toBeInTheDocument()
    expect(screen.queryByLabelText('Prim oranı (%)')).not.toBeInTheDocument()
  })

  it('personel: kendi göreviniz her sıklıkta doğru kuralla listeye eklenir, kaldırılır ve ara kayda girer', async () => {
    const user = userEvent.setup()
    const { transport } = await renderSetup({ path: '/setup?step=9' })
    const form = await screen.findByTestId('setup-own-task-form')
    const repeat = async (name: string): Promise<void> => {
      await user.click(within(form).getByRole('combobox', { name: 'Ne sıklıkla' }))
      await user.click(await screen.findByRole('option', { name }))
    }
    const title = within(form).getByLabelText('Görev')
    // Enter adds the task (it does not move the wizard on) and the title empties for the next one.
    await user.type(title, 'Lobideki çiçekleri sula{Enter}')
    expect(await heading('Personel ve vardiyalar')).toBeInTheDocument()
    expect(title).toHaveValue('')
    await repeat('Her hafta')
    await user.click(within(form).getByRole('button', { name: 'Pazartesi' }))
    await user.click(within(form).getByRole('button', { name: 'Cuma' }))
    await user.type(title, 'Çöpleri çıkar')
    fireEvent.change(within(form).getByLabelText('Saat'), { target: { value: '20:00' } })
    await user.click(screen.getByTestId('setup-own-task-add'))
    await repeat('Her ay')
    await user.click(within(form).getByRole('combobox', { name: 'Ayın kaçında' }))
    await user.click(await screen.findByRole('option', { name: 'Ayın son günü' }))
    await user.type(title, 'Kira ödemesini hatırla')
    await user.click(screen.getByTestId('setup-own-task-add'))
    await repeat('Birkaç ayda bir')
    await user.clear(within(form).getByLabelText('Kaç ayda bir'))
    await user.type(within(form).getByLabelText('Kaç ayda bir'), '6')
    await user.type(title, 'Perdeleri yıkat')
    await user.click(screen.getByTestId('setup-own-task-add'))
    await repeat('Her yıl')
    await user.type(title, 'Tabelayı boyat')
    await user.click(screen.getByTestId('setup-own-task-add'))

    const list = screen.getByTestId('setup-own-task-list')
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((li) => li.textContent)
    ).toEqual([
      'Lobideki çiçekleri sulaHer gün 09:00',
      'Çöpleri çıkarHer hafta: Pzt, Cum · 20:00',
      'Kira ödemesini hatırlaHer ayın son günü · 20:00',
      'Perdeleri yıkat6 ayda bir · 20:00',
      'Tabelayı boyatHer yıl · 20:00'
    ])
    await user.click(within(list).getByRole('button', { name: 'Kaldır: Kira ödemesini hatırla' }))
    expect(within(list).queryByText('Kira ödemesini hatırla')).not.toBeInTheDocument()
    await next(user)
    expect(await heading('Çalışanlar')).toBeInTheDocument()
    const saved = transport.saves.at(-1)?.draft as { tasks: { custom: unknown[] } }
    expect(saved.tasks.custom).toEqual([
      {
        key: expect.any(String),
        title: 'Lobideki çiçekleri sula',
        recurrence: { kind: 'daily', time: '09:00' }
      },
      {
        key: expect.any(String),
        title: 'Çöpleri çıkar',
        recurrence: { kind: 'weekly', weekdays: [1, 5], time: '20:00' }
      },
      {
        key: expect.any(String),
        title: 'Perdeleri yıkat',
        recurrence: { kind: 'interval', unit: 'months', every: 6, time: '20:00' }
      },
      {
        key: expect.any(String),
        title: 'Tabelayı boyat',
        recurrence: { kind: 'interval', unit: 'years', every: 1, time: '20:00' }
      }
    ])
  })

  it('personel: kendi görevleriniz başlığın hemen altında, hazır önerilerden önce gelir; yasal hatırlatıcılar sonda kalır', async () => {
    await renderSetup({ path: '/setup?step=9' })
    const own = await screen.findByRole('group', { name: 'Kendi görevleriniz' })
    expect(own).toHaveAttribute('data-testid', 'setup-own-tasks')
    const suggestions = screen.getByRole('group', { name: 'Günlük ve haftalık işler' })
    const legal = document.getElementById('setup-legal-reminders')!
    const before = (a: Element, b: Element) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    expect(before(screen.getByText('Görev önerileri'), own)).toBe(true)
    expect(before(own, suggestions)).toBe(true)
    expect(before(suggestions, legal)).toBe(true)
    // The block is a labelled group, not a heading that skips a level under the card's h2.
    expect(screen.queryAllByRole('heading', { level: 4 })).toEqual([])
    expect(within(own).getByTestId('setup-own-task-form')).toBeInTheDocument()
  })

  it('personel: Türkiye dışındaki otele TR yasal hatırlatıcıları önerilmez (K-46 (7))', async () => {
    await renderSetup({ path: '/setup?step=9', settings: { 'hotel.country': 'DE' } })
    await screen.findByRole('group', { name: 'Kendi görevleriniz' })
    expect(document.getElementById('setup-legal-reminders')).toBeNull()
    expect(screen.getByRole('group', { name: 'Günlük ve haftalık işler' })).toBeInTheDocument()
  })

  it('personel: kendi görevde eksik ad, seçilmemiş gün, aralık dışı ay sayısı ve bozuk saat söylenir', async () => {
    const user = userEvent.setup()
    await renderSetup({ path: '/setup?step=9' })
    const form = await screen.findByTestId('setup-own-task-form')
    const add = screen.getByTestId('setup-own-task-add')
    await user.click(add)
    expect(await within(form).findByText('Ne yapılacağını yazın.')).toBeInTheDocument()
    expect(within(form).getByLabelText('Görev')).toHaveFocus()
    expect(within(form).getByLabelText('Görev')).toHaveAttribute(
      'aria-describedby',
      'setup-own-task-title-error'
    )
    await user.type(within(form).getByLabelText('Görev'), 'Çöpleri çıkar')
    await user.click(within(form).getByRole('combobox', { name: 'Ne sıklıkla' }))
    await user.click(await screen.findByRole('option', { name: 'Her hafta' }))
    await user.click(add)
    expect(await within(form).findByText('En az bir gün seçin.')).toBeInTheDocument()
    await user.click(within(form).getByRole('combobox', { name: 'Ne sıklıkla' }))
    await user.click(await screen.findByRole('option', { name: 'Birkaç ayda bir' }))
    expect(within(form).queryByText('En az bir gün seçin.')).not.toBeInTheDocument()
    await user.clear(within(form).getByLabelText('Kaç ayda bir'))
    await user.type(within(form).getByLabelText('Kaç ayda bir'), '1')
    fireEvent.change(within(form).getByLabelText('Saat'), { target: { value: '' } })
    await user.click(add)
    expect(await within(form).findByText('2 ile 24 arasında bir sayı yazın.')).toBeInTheDocument()
    expect(within(form).getByText('Saati 14:00 gibi yazın.')).toBeInTheDocument()
    expect(within(form).getByLabelText('Kaç ayda bir')).toHaveFocus()
    expect(screen.queryByTestId('setup-own-task-list')).not.toBeInTheDocument()
  })

  it('takvim: Türkiye seçiliyse bu yıl ve gelecek yılın bayramları gösterilir; başka ülkede sonra eklenir', async () => {
    const user = userEvent.setup()
    await renderSetup({ path: '/setup?step=11' })
    expect(await heading('Takvim')).toBeInTheDocument()
    const days = within(screen.getByTestId('setup-holidays')).getAllByTestId('setup-holiday')
    expect(days.map((d) => d.textContent)).toEqual([
      expect.stringContaining('Cumhuriyet Bayramı arifesiYarım gün'),
      expect.stringContaining('Cumhuriyet Bayramı')
    ])
    expect(days[0]).toHaveTextContent('28 Eki 2026')
    expect(screen.getByTestId('setup-holidays-2026')).toHaveTextContent('2026 · 2 gün')
    // Selected weekdays carry a tick, not only a colour.
    const saturday = screen.getByTestId('setup-weekday-6')
    expect(saturday).toHaveAttribute('data-state', 'on')
    expect(saturday.querySelector('svg')).not.toBeNull()
    expect(screen.getByTestId('setup-weekdays')).toHaveClass('max-md:grid-cols-7')

    await user.click(screen.getByTestId('setup-goto-hotel'))
    await user.click(screen.getByTestId('setup-country'))
    await user.click(await screen.findByRole('option', { name: 'Almanya' }))
    await user.click(screen.getByTestId('setup-goto-calendar'))
    expect(screen.queryByTestId('setup-holidays')).not.toBeInTheDocument()
    expect(screen.getByTestId('setup-holidays-note')).toHaveTextContent(
      'Almanya için bayramlar kendiliğinden eklenmez. Resmî tatilleri sonra Ayarlar → Takvim bölümünden ekleyebilirsiniz.'
    )
  })

  it('çalışan kartı uzun adla genişlemez; ad kesilirse tamamı ipucunda', async () => {
    const user = userEvent.setup()
    await renderSetup({ path: '/setup?step=10' })
    await user.click(await screen.findByTestId('setup-add-employee'))
    const long = 'Muhammed Mustafa Abdurrahman'
    await user.type(screen.getByLabelText('Ad'), long)
    await user.type(screen.getByLabelText('Soyad'), 'Karamanoğlu-Yıldırımoğulları')
    const card = screen.getByTestId('setup-employee')
    expect(card).toHaveClass('grid-cols-[minmax(0,1fr)]')
    expect(within(card).getByTestId('setup-employee-name')).toHaveAttribute(
      'title',
      `${long} Karamanoğlu-Yıldırımoğulları`
    )
    expect(screen.getByLabelText('Görev')).toHaveAttribute('placeholder', 'Örn. Resepsiyon')
  })

  it('çalışan eklenir; hesap açılınca kullanıcı adı ve geçici şifre istenir', async () => {
    const user = userEvent.setup()
    await renderSetup({ path: '/setup?step=10' })
    await user.click(await screen.findByTestId('setup-add-employee'))
    await user.type(screen.getByLabelText('Ad'), 'Deniz')
    await user.type(screen.getByLabelText('Soyad'), 'Arslan')
    await user.click(screen.getByRole('switch', { name: 'Kullanıcı hesabı aç' }))
    expect(screen.getByRole('combobox', { name: 'Rol' })).toHaveTextContent('Resepsiyon')
    await user.type(screen.getByLabelText('Kullanıcı adı'), 'deniz ar')
    await next(user)
    expect(screen.getByText(/Kullanıcı adı 2–40 karakter olmalı/)).toBeInTheDocument()
    expect(screen.getByText('Şifre en az 8 karakter olmalı.')).toBeInTheDocument()
  })

  it('sahip: şifreler aynı olmalı, kolay PIN kabul edilmez; şifreler ilerleme kaydına girmez', async () => {
    const user = userEvent.setup()
    const { transport } = await renderSetup({ path: '/setup?step=13' })
    expect(await heading('Sahip hesabı')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Adınız'), 'Otel Sahibi')
    await user.type(screen.getByLabelText('Kullanıcı adı'), 'sahip')
    await user.type(screen.getByTestId('setup-owner-password'), 'cok-gizli-sifre')
    await user.type(screen.getByTestId('setup-owner-repeat'), 'cok-gizli-sifr')
    await user.type(screen.getByTestId('setup-owner-pin'), '1234')
    await next(user)
    expect(screen.getByText('Şifreler aynı değil.')).toBeInTheDocument()
    expect(
      screen.getByText('Bu PIN kolay tahmin edilir (örn. 1111, 1234). Başka bir PIN seçin.')
    ).toBeInTheDocument()
    await user.type(screen.getByTestId('setup-owner-repeat'), 'e')
    await user.clear(screen.getByTestId('setup-owner-pin'))
    await user.type(screen.getByTestId('setup-owner-pin'), '2468')
    await next(user)
    expect(await heading('Özet')).toBeInTheDocument()
    const saved = JSON.stringify(transport.saves.at(-1))
    expect(saved).toContain('"username":"sahip"')
    expect(saved).not.toMatch(/cok-gizli|2468|"password"|"repeat"|"pin"/)
  })

  it('şifre göster düğmesi alanı düz metne çevirir', async () => {
    const user = userEvent.setup()
    await renderSetup({ path: '/setup?step=13' })
    const password = await screen.findByTestId('setup-owner-password')
    expect(password).toHaveAttribute('type', 'password')
    await user.click(screen.getAllByRole('button', { name: 'Şifreyi göster' })[0]!)
    expect(password).toHaveAttribute('type', 'text')
    expect(screen.getByRole('button', { name: "PIN'i göster" })).toBeInTheDocument()
  })
})

describe('kurulum sihirbazı: devam, bitirme, kurtarma kodları', () => {
  it('yarıda kalan kurulum kaydedilen adımdan ve cevaplarla devam eder; şifre yeniden istenir', async () => {
    const user = userEvent.setup()
    const transport = setupTransport({
      progress: {
        step: 5,
        draft: {
          hotel: {
            name: 'Martı Otel',
            country: 'TR',
            city: 'İzmir',
            timezone: 'Europe/Istanbul',
            checkinTime: '14:00',
            checkoutTime: '11:00'
          },
          owner: { displayName: 'Otel Sahibi', username: 'sahip' },
          rooms: 'bozuk'
        }
      }
    })
    await renderSetup({ transport })
    expect(await heading('Oda tipleri')).toBeInTheDocument()
    await user.click(screen.getByTestId('setup-goto-hotel'))
    expect(screen.getByLabelText('Otel adı')).toHaveValue('Martı Otel')
    expect(screen.getByLabelText('Şehir')).toHaveValue('İzmir')
    await user.click(screen.getByTestId('setup-goto-owner'))
    expect(screen.getByLabelText('Kullanıcı adı')).toHaveValue('sahip')
    expect(screen.getByTestId('setup-owner-password')).toHaveValue('')
  })

  it('istemci moduna geçmiş pencere çalışma şekli adımında açılır', async () => {
    await renderSetup({ transport: setupTransport({ mode: 'client' }) })
    expect(await heading('Çalışma şekli')).toBeInTheDocument()
    expect(screen.getByTestId('setup-mode-client')).toBeChecked()
  })

  it('"Kurulumu bitir": eksik adım varsa oraya gider ve uyarır', async () => {
    const user = userEvent.setup()
    const { transport } = await renderSetup({ path: '/setup?step=14' })
    expect(await screen.findByTestId('setup-summary-hotel')).toHaveTextContent('Eksik')
    await user.click(screen.getByTestId('setup-finish'))
    expect(await heading('Otel')).toBeInTheDocument()
    expect(screen.getByTestId('setup-notice')).toHaveTextContent('Kurulum bitirilemedi')
    expect(transport.finished).toHaveLength(0)
  })

  it('baştan sona: Lale boyutunda kurulum doğru taslağı gönderir, kodlar bir kez gösterilir, programa geçilir', async () => {
    const user = userEvent.setup()
    const { transport } = await renderSetup()
    expect(await heading('Dil ve tema')).toBeInTheDocument()
    await next(user)
    expect(await heading('Çalışma şekli')).toBeInTheDocument()
    await next(user)
    expect(await heading('Otel')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Otel adı'), 'Martı Otel')
    await user.type(screen.getByLabelText('Şehir'), 'İstanbul')
    await next(user)
    expect(await heading('Para birimleri')).toBeInTheDocument()
    await user.click(screen.getByTestId('setup-currency-GBP'))
    await next(user)
    expect(await heading('Oda tipleri')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Gecelik fiyat'), '2.800')
    await user.type(screen.getByLabelText('Hafta sonu / özel gün'), '3.200')
    await next(user)
    expect(await heading('Odalar')).toBeInTheDocument()
    await fiveByFour(user)
    await user.click(screen.getByTestId('setup-generate'))
    await user.click(screen.getByTestId('setup-remove-room-504'))
    await next(user)
    // The optional hourly-price step (K-48): the chosen type's price of one hour.
    expect(await heading('Saatlik satış')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Saat ücreti'), '300')
    await next(user)
    expect(await heading('Ödeme ve satış')).toBeInTheDocument()
    await next(user)
    expect(await heading('Personel ve vardiyalar')).toBeInTheDocument()
    await user.click(screen.getByTestId('setup-task-call_late_checkouts'))
    await user.type(screen.getByTestId('setup-own-task-title'), 'Lobideki çiçekleri sula{Enter}')
    await next(user)
    expect(await heading('Çalışanlar')).toBeInTheDocument()
    await next(user)
    expect(await heading('Takvim')).toBeInTheDocument()
    await next(user)
    // The optional camera step (P20g, K-59): nothing is added when it is passed by.
    expect(await heading('Kamera')).toBeInTheDocument()
    await next(user)
    expect(await heading('Sahip hesabı')).toBeInTheDocument()
    await fillOwner(user)
    await next(user)
    expect(await heading('Özet')).toBeInTheDocument()
    expect(screen.getByTestId('setup-summary-totals')).toHaveTextContent('19 oda · 38 yatak')
    // The zone name comes from the platform's ICU data ("Türkiye Saati" or "Türkiye Standart Saati").
    expect(screen.getByTestId('setup-summary-timezone')).toHaveTextContent(
      /Türkiye( Standart)? Saati \(UTC\+03:00\)/
    )
    expect(screen.getByTestId('setup-summary-commission')).toHaveTextContent('Yok')
    expect(screen.getByTestId('setup-summary-own-tasks')).toHaveTextContent('Lobideki çiçekleri sula')
    await user.click(screen.getByTestId('setup-finish'))

    expect(await screen.findByTestId('recovery-codes')).toBeInTheDocument()
    expect(transport.modes).toEqual(['standalone'])
    const sent = transport.finished[0]!
    expect(setupDraftSchema.safeParse(sent).success).toBe(true)
    expect(sent).toMatchObject({
      language: 'tr',
      hotel: { name: 'Martı Otel', country: 'TR', city: 'İstanbul', timezone: 'Europe/Istanbul' },
      money: { baseCurrency: 'TRY', currencies: ['TRY', 'EUR', 'USD', 'RUB'] },
      roomTypes: {
        selected: [
          { id: 'rt-double', basePriceMinor: 280_000, weekendPriceMinor: 320_000, hourlyPriceMinor: 30_000 }
        ],
        custom: []
      },
      lists: { paymentMethods: ['pm-cash', 'pm-card', 'pm-bank'], customSalesChannels: [] },
      staff: {
        policy: {
          leaveDaysPerMonth: 4,
          dailyDivisor: 30,
          overtimeMode: 'none',
          holidayMultiplier: '2',
          commissionMode: 'none'
        },
        advanceFromDrawer: false
      },
      shifts: [
        { id: 'sh-day', name: 'Gündüz', startTime: '09:00', endTime: '21:00' },
        { id: 'sh-night', name: 'Gece', startTime: '21:00', endTime: '09:00' }
      ],
      tasks: {
        suggestions: ['tt-call'],
        legalReminders: true,
        custom: [{ title: 'Lobideki çiçekleri sula', recurrence: { kind: 'daily', time: '09:00' } }]
      },
      employees: [],
      calendar: { highlightWeekdays: [6, 0], dayClosing: false },
      owner: { username: 'sahip', displayName: 'Otel Sahibi', password: 'cok-gizli-sifre', pin: '2468' }
    })
    expect(sent.rooms).toHaveLength(19)
    expect(sent.rooms[0]).toEqual({
      number: '101',
      floor: '1',
      beds: 2,
      sellable: true,
      roomType: { id: 'rt-double' }
    })
    expect(sent.rooms.map((r) => r.number)).not.toContain('504')

    expect(screen.getAllByTestId('recovery-code').map((c) => c.textContent)).toEqual(RECOVERY_CODES)
    expect(screen.getByTestId('recovery-once')).toHaveTextContent('Bu bilgiler bir daha gösterilmez.')
    expect(await screen.findByTestId('recovery-key')).toHaveTextContent(BISMUTH_KEY)
    expect(screen.getByTestId('recovery-print')).toBeEnabled()
    expect(screen.getByTestId('recovery-codes')).not.toHaveClass('mx-auto')
    expect(screen.getByTestId('recovery-continue')).toBeDisabled()
    expect(screen.getByText('Kâğıda yazdım')).toBeInTheDocument()
    await user.click(screen.getByTestId('recovery-written'))
    await user.click(screen.getByTestId('recovery-continue'))
    expect(await screen.findByTestId('home')).toBeInTheDocument()
  })

  it('sunucu kullanıcı adını reddederse sahip adımına dönülür ve alan işaretlenir', async () => {
    const user = userEvent.setup()
    const transport = setupTransport({
      finishError: new ApiError('CONFLICT', 409, 'errors.usernameTaken', { username: 'sahip' }),
      progress: {
        step: 13,
        draft: {
          hotel: {
            name: 'Martı Otel',
            country: 'TR',
            city: '',
            timezone: 'Europe/Istanbul',
            checkinTime: '14:00',
            checkoutTime: '12:00'
          },
          rooms: [
            {
              key: 'r1',
              number: '101',
              floor: '1',
              beds: '2',
              sellable: true,
              roomType: { id: 'rt-double' }
            }
          ]
        }
      }
    })
    await renderSetup({ transport })
    expect(await heading('Sahip hesabı')).toBeInTheDocument()
    await fillOwner(user, '')
    await next(user)
    await user.click(await screen.findByTestId('setup-finish'))
    expect(await heading('Sahip hesabı')).toBeInTheDocument()
    expect(screen.getByTestId('setup-notice')).toHaveTextContent('Bu kullanıcı adı zaten kullanılıyor.')
    expect(screen.getByLabelText('Kullanıcı adı')).toHaveAttribute('aria-invalid', 'true')
    expect(transport.finished).toHaveLength(1)
  })

  it('kurulum tamamlanmışsa sihirbaz yerine programa geçiş önerilir', async () => {
    await renderSetup({ transport: setupTransport({ done: true }) })
    expect(await screen.findByText('Kurulum tamamlanmış')).toBeInTheDocument()
  })
})
