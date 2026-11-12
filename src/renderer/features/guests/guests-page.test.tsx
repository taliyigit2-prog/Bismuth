import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, configure, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { formatMoney } from '@shared/format'
import { money } from '@shared/money'
import { renderWithProviders } from '@/test/render'
import { setViewAs } from '@/lib/view-as'
import { GuestsPage } from './guests-page'
import { company, emptyGuests, guest, guestsTransport, stay, type GuestsState } from './guests-fake'

// The whole suite runs in parallel; give slow machines time before a findBy gives up.
configure({ asyncUtilTimeout: 4000 })
vi.setConfig({ testTimeout: 30_000 })

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})

const tl = (minor: number): string => formatMoney(money(minor, 'TRY'), 'tr')

/** Click into a field and paste the text: one change event instead of one per key (fast under load). */
async function fill(user: ReturnType<typeof userEvent.setup>, el: HTMLElement, text: string): Promise<void> {
  await user.click(el)
  await user.paste(text)
}

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

afterEach(() => {
  vi.restoreAllMocks()
  act(() => setViewAs('owner'))
})

/** Three stays of Gadir (2.000 → 2.500/3.000 → 3.200 a night), a slip-spelled twin card, a firm, a blacklist entry. */
function hotel(): GuestsState {
  const state = emptyGuests()
  state.companies.push(
    company({ id: 'co-1', title: 'Deniz Lojistik A.Ş.', taxOffice: 'Kadıköy', taxNumber: '1234567890' })
  )
  state.guests.push(
    guest({
      id: 'g-gadir',
      firstName: 'GADİR',
      lastName: 'GADİROV',
      phone: '+90 532 111 22 33',
      companyId: 'co-1'
    }),
    guest({ id: 'g-twin', firstName: 'Gadir', lastName: 'Garibov' }),
    guest({ id: 'g-ayse', firstName: 'Ayşe', lastName: 'Kaya', vip: true }),
    guest({ id: 'g-bad', firstName: 'Kötü', lastName: 'Niyet', phone: '+90 533 000 00 01' })
  )
  state.stays['g-gadir'] = [
    stay({ reservationId: 'r1', checkIn: '2026-03-10', checkOut: '2026-03-12', prices: [200_000, 200_000] }),
    stay({
      reservationId: 'r2',
      checkIn: '2026-06-01',
      checkOut: '2026-06-04',
      prices: [250_000, 250_000, 300_000],
      paidMinor: 500_000,
      balanceMinor: 300_000,
      methodIds: ['m-card'],
      roomNumber: '102'
    }),
    stay({ reservationId: 'r3', checkIn: '2026-08-20', checkOut: '2026-08-21', prices: [320_000] })
  ]
  state.blacklist.push({
    id: 'bl-1',
    guestId: null,
    name: 'Başka Ad',
    idDocNumber: null,
    identityMasked: false,
    phoneNormalized: '905330000001',
    severity: 'warn',
    reasonCode: 'unpaid',
    reasonText: 'Ödemeden ayrıldı',
    incidentDate: null,
    addedBy: 'u-owner',
    addedByName: 'Otel Sahibi',
    approvedByName: 'Otel Sahibi',
    status: 'active',
    removedAt: null,
    removedByName: null,
    removedReason: null,
    createdAt: '2026-09-01T09:00:00.000Z'
  })
  return state
}

async function openCard(user: ReturnType<typeof userEvent.setup>, name: string) {
  const table = await screen.findByTestId('guest-table')
  await user.click(within(table).getByRole('button', { name }))
  return screen.findByTestId('guest-sheet')
}

describe('Misafirler', () => {
  it('veri gelene kadar yükleniyor durumunu gösterir', async () => {
    const transport = guestsTransport()
    const call = transport.call.bind(transport)
    transport.call = (name, input) => (name === 'guests.list' ? new Promise(() => {}) : call(name, input))
    await renderWithProviders(<GuestsPage />, { transport })
    expect(await screen.findByRole('status')).toHaveAttribute('aria-busy')
  })

  it('liste okunamazsa yeniden dene düğmesi çıkar; yetkisiz yanıtta "yetkiniz yok" gelir', async () => {
    await renderWithProviders(<GuestsPage />, {
      transport: guestsTransport(hotel(), { refuse: ['guests.list'] })
    })
    expect(await screen.findByText('Bu ekrana yetkiniz yok')).toBeInTheDocument()
  })

  it('misafir yoksa boş durumu anlatır ve yeni misafir eklenebilir', async () => {
    await renderWithProviders(<GuestsPage />, { transport: guestsTransport() })
    expect(await screen.findByText('Henüz misafir yok')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Yeni misafir' }).length).toBeGreaterThan(0)
  })

  it('"gadir garibov" araması "GADİR GADİROV" kartını da bulur; kara listedeki misafir işaretli', async () => {
    const user = userEvent.setup()
    const transport = guestsTransport(hotel())
    await renderWithProviders(<GuestsPage />, { transport })
    const table = await screen.findByTestId('guest-table')
    expect(within(table).getAllByRole('row')).toHaveLength(5)
    expect(within(table).getByTestId('mark-blacklist')).toBeInTheDocument()
    await fill(user, screen.getByTestId('guest-search'), 'gadir garibov')
    await waitFor(() => expect(within(screen.getByTestId('guest-table')).getAllByRole('row')).toHaveLength(3))
    const rows = within(screen.getByTestId('guest-table')).getAllByRole('row').slice(1)
    expect(rows.map((r) => within(r).getAllByRole('button')[0]?.textContent)).toEqual(
      expect.arrayContaining(['GADİR GADİROV', 'Gadir Garibov'])
    )
    expect(transport.callsTo('guests.list').at(-1)).toMatchObject({ q: 'gadir garibov' })
  })

  it('kart: 3 konaklamanın gecelik fiyatları, ödenenler, kalan bakiye ve son fiyat; bu fiyatla yeni rezervasyon açılır', async () => {
    const user = userEvent.setup()
    await renderWithProviders(<GuestsPage />, { transport: guestsTransport(hotel()) })
    const sheet = await openCard(user, 'GADİR GADİROV')
    const summary = await within(sheet).findByTestId('history-summary')
    expect(within(summary).getByTestId('summary-last-price')).toHaveTextContent(tl(320_000))
    // (2 × 2.000 + 2 × 2.500 + 3.000 + 3.200) / 6 = 2.533,33 → ₺2.533
    expect(within(summary).getByTestId('summary-average')).toHaveTextContent(tl(253_333))
    expect(within(summary).getByTestId('summary-paid')).toHaveTextContent(tl(1_220_000))
    const list = within(sheet).getByTestId('history-list')
    const r2 = within(list).getByTestId('history-r2')
    expect(r2).toHaveTextContent(`2 × ${tl(250_000)}`)
    expect(r2).toHaveTextContent(tl(300_000))
    expect(r2).toHaveTextContent('Kredi kartı')
    expect(r2).toHaveTextContent(`Bakiye ${tl(300_000)}`)
    expect(within(list).getAllByRole('listitem')[0]).toHaveAttribute('data-testid', 'history-r3')
    await user.click(within(sheet).getByTestId('apply-last-price'))
    expect(await screen.findByRole('dialog', { name: 'Yeni rezervasyon' })).toBeInTheDocument()
  })

  it('sürekli istek "önemli" seviyesinde kaydedilir; kartta onay isteyeceği yazılır', async () => {
    const user = userEvent.setup()
    const transport = guestsTransport(hotel())
    await renderWithProviders(<GuestsPage />, { transport })
    const sheet = await openCard(user, 'Ayşe Kaya')
    await user.click(await within(sheet).findByRole('button', { name: 'Sürekli not ekle' }))
    await fill(user, within(sheet).getByLabelText('Her gelişinde hatırlanacak not'), 'Yüksek kat ister')
    await user.click(within(sheet).getByTestId('standing-level-warn'))
    await user.click(within(sheet).getByRole('button', { name: 'Kaydet' }))
    await waitFor(() =>
      expect(transport.callsTo('guests.setStandingNote')).toEqual([
        { id: 'g-ayse', note: { standingNote: 'Yüksek kat ister', standingNoteLevel: 'warn' } }
      ])
    )
    const note = await within(sheet).findByTestId('standing-note')
    expect(note).toHaveTextContent('Rezervasyon kaydedilmeden önce onay ister.')
  })

  it('olası çift kart birleştirilir: geri alınamaz uyarısı, bakılan kart kalır, geçmiş tek kartta', async () => {
    const user = userEvent.setup()
    const transport = guestsTransport(hotel())
    await renderWithProviders(<GuestsPage />, { transport })
    const sheet = await openCard(user, 'GADİR GADİROV')
    const hint = await within(sheet).findByTestId('duplicate-hint')
    expect(hint).toHaveTextContent('Gadir Garibov')
    await user.click(within(hint).getByTestId('merge-open'))
    const dialog = await screen.findByRole('dialog', { name: 'Kartları birleştir' })
    expect(dialog).toHaveTextContent('Birleştirme geri alınamaz.')
    await user.click(within(dialog).getByTestId('merge-confirm'))
    await waitFor(() =>
      expect(transport.callsTo('guests.merge')).toEqual([{ keepId: 'g-gadir', mergeId: 'g-twin' }])
    )
    await waitFor(() =>
      expect(
        within(screen.getByTestId('guest-table')).queryByRole('button', { name: 'Gadir Garibov' })
      ).toBeNull()
    )
  })

  it('yeni misafir: kara listedeki telefon yazılınca uyarı verir; kaydedince kart açılır', async () => {
    const user = userEvent.setup()
    const transport = guestsTransport(hotel())
    await renderWithProviders(<GuestsPage />, { transport })
    await screen.findByTestId('guest-table')
    await user.click(screen.getByTestId('guest-new'))
    const dialog = await screen.findByRole('dialog', { name: 'Yeni misafir' })
    await fill(user, within(dialog).getByLabelText('Ad'), 'Yeni')
    await fill(user, within(dialog).getByLabelText('Soyad'), 'Kişi')
    await fill(user, within(dialog).getByRole('textbox', { name: 'Telefon' }), '533 000 00 01')
    const warning = await within(dialog).findByTestId('guest-form-blacklist')
    expect(warning).toHaveTextContent('Başka Ad')
    expect(warning).toHaveTextContent('telefon eşleşti')
    await user.click(within(dialog).getByTestId('guest-save'))
    await waitFor(() => expect(transport.callsTo('guests.create')).toHaveLength(1))
    expect(transport.callsTo('guests.create')[0]).toMatchObject({
      firstName: 'Yeni',
      lastName: 'Kişi',
      phone: '+90 533 000 00 01'
    })
    expect(await screen.findByTestId('guest-card-name')).toHaveTextContent('Yeni Kişi')
  })

  it('firma sekmesi fatura bilgisini gösterir ve tek tıkla kopyalar', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const transport = guestsTransport(hotel())
    await renderWithProviders(<GuestsPage />, { transport })
    const sheet = await openCard(user, 'GADİR GADİROV')
    await user.click(await within(sheet).findByRole('tab', { name: 'Firma' }))
    const card = await within(sheet).findByTestId('company-co-1')
    await user.click(within(card).getByRole('button', { name: 'Kopyala' }))
    expect(writeText).toHaveBeenCalledWith(
      'Unvan: Deniz Lojistik A.Ş.\nVergi dairesi / No: Kadıköy / 1234567890'
    )
    await waitFor(() => expect(transport.callsTo('companies.markUsed')).toEqual([{ id: 'co-1' }]))
  })

  it('resepsiyon birleştiremez; temizlik ekranı göremez', async () => {
    const user = userEvent.setup()
    await renderWithProviders(<GuestsPage />, { transport: guestsTransport(hotel()) })
    act(() => setViewAs('reception'))
    const sheet = await openCard(user, 'GADİR GADİROV')
    const hint = await within(sheet).findByTestId('duplicate-hint')
    expect(within(hint).queryByTestId('merge-open')).toBeNull()
    act(() => setViewAs('housekeeping'))
    expect(screen.getByText('Bu ekrana yetkiniz yok')).toBeInTheDocument()
  })

  it('telefonda liste kartlara döner ve kart alttan açılır', async () => {
    phone()
    const user = userEvent.setup()
    await renderWithProviders(<GuestsPage />, { transport: guestsTransport(hotel()) })
    const cards = await screen.findByTestId('guest-cards')
    expect(screen.queryByTestId('guest-table')).toBeNull()
    expect(within(cards).getAllByRole('listitem')).toHaveLength(4)
    await user.click(within(cards).getByTestId('guest-card-g-gadir'))
    expect(await screen.findByTestId('guest-card-name')).toHaveTextContent('GADİR GADİROV')
  })
})

/** The hotel's guest tags (G-50): two in use, one switched off that Ayşe still carries. */
function tagged(): GuestsState {
  const state = hotel()
  const tag = (id: string, name: string, sort: number, active = true) => ({
    id,
    code: `custom_${id}`,
    name,
    nameI18n: null,
    active,
    sort,
    seeded: false
  })
  state.tags = [
    tag('t-regular', 'Düzenli', 1),
    tag('t-firm', 'Firma misafiri', 2),
    tag('t-old', 'Eski kampanya', 3, false)
  ]
  state.tagLinks = { 'g-ayse': ['t-regular', 't-old'] }
  return state
}

describe('misafir etiketleri (G-50)', () => {
  it('kartta etiket çoklu seçimle verilir; kapalı etiket soluk görünür ve seçimde çıkmaz', async () => {
    const user = userEvent.setup()
    const transport = guestsTransport(tagged())
    await renderWithProviders(<GuestsPage />, { transport })
    const sheet = await openCard(user, 'Ayşe Kaya')
    const badges = await within(sheet).findByTestId('guest-tag-badges')
    expect(
      within(badges)
        .getAllByRole('listitem')
        .map((li) => li.textContent)
    ).toEqual(['Düzenli', 'Eski kampanya (kapalı)'])
    expect(within(badges).getByText('Eski kampanya (kapalı)').closest('[data-closed]')).not.toBeNull()
    await user.click(within(sheet).getByTestId('guest-tags-edit'))
    const picker = await screen.findByTestId('guest-tags-picker')
    expect(
      within(picker)
        .getAllByRole('checkbox')
        .map((c) => c.closest('label')?.textContent)
    ).toEqual(['Düzenli', 'Firma misafiri'])
    expect(picker).toHaveTextContent('Kapatılmış etiketler kartta kalır ama yeniden verilemez.')
    await user.click(within(picker).getByRole('checkbox', { name: 'Firma misafiri' }))
    await waitFor(() =>
      expect(transport.callsTo('guests.setTags')).toEqual([
        { id: 'g-ayse', tagIds: ['t-regular', 't-old', 't-firm'] }
      ])
    )
    await waitFor(() =>
      expect(within(within(sheet).getByTestId('guest-tag-badges')).getAllByRole('listitem')).toHaveLength(3)
    )
    await user.click(
      within(screen.getByTestId('guest-tags-picker')).getByRole('checkbox', { name: 'Düzenli' })
    )
    await waitFor(() =>
      expect(transport.callsTo('guests.setTags').at(-1)).toEqual({
        id: 'g-ayse',
        tagIds: ['t-firm', 't-old']
      })
    )
  })

  it('etiket listesi boşsa kart nereden ekleneceğini söyler; düzenleme yetkisi olmayan düğmeyi görmez', async () => {
    const user = userEvent.setup()
    await renderWithProviders(<GuestsPage />, { transport: guestsTransport(hotel()) })
    const sheet = await openCard(user, 'Ayşe Kaya')
    await user.click(await within(sheet).findByTestId('guest-tags-edit'))
    expect(await screen.findByTestId('guest-tags-picker')).toHaveTextContent(
      'Henüz misafir etiketi yok. Ayarlar → Listeler → Misafir etiketleri'
    )
    await user.keyboard('{Escape}')
    act(() => setViewAs('accountant'))
    await waitFor(() => expect(within(sheet).queryByTestId('guest-tags-edit')).toBeNull())
  })

  it('listede etiket rozeti görünür; etiket süzgeci yalnız o etiketi taşıyanları getirir', async () => {
    const user = userEvent.setup()
    const transport = guestsTransport(tagged())
    await renderWithProviders(<GuestsPage />, { transport })
    const row = await screen.findByTestId('guest-row-g-ayse')
    expect(await within(row).findByText('Düzenli')).toBeInTheDocument()
    await user.click(screen.getByTestId('guest-tag-filter'))
    const options = await screen.findAllByRole('option')
    expect(options.map((o) => o.textContent)).toEqual([
      'Tüm etiketler',
      'Düzenli',
      'Firma misafiri',
      'Eski kampanya (kapalı)'
    ])
    await user.click(screen.getByRole('option', { name: 'Düzenli' }))
    await waitFor(() => expect(transport.callsTo('guests.list').at(-1)).toMatchObject({ tagId: 't-regular' }))
    await waitFor(() => expect(within(screen.getByTestId('guest-table')).getAllByRole('row')).toHaveLength(2))
    expect(screen.getByTestId('guest-row-g-ayse')).toBeInTheDocument()
  })

  it('telefonda kartta etiket seçilir; seçim satırları tam genişlikte', async () => {
    phone()
    const user = userEvent.setup()
    const transport = guestsTransport(tagged())
    await renderWithProviders(<GuestsPage />, { transport })
    const cards = await screen.findByTestId('guest-cards')
    expect(within(within(cards).getByTestId('guest-card-g-ayse')).getByText('Düzenli')).toBeInTheDocument()
    await user.click(within(cards).getByTestId('guest-card-g-gadir'))
    await user.click(await screen.findByTestId('guest-tags-edit'))
    const picker = await screen.findByTestId('guest-tags-picker')
    const label = within(picker).getByRole('checkbox', { name: 'Düzenli' }).closest('label')
    expect(label).toHaveClass('min-h-11')
    await user.click(within(picker).getByRole('checkbox', { name: 'Düzenli' }))
    await waitFor(() =>
      expect(transport.callsTo('guests.setTags')).toEqual([{ id: 'g-gadir', tagIds: ['t-regular'] }])
    )
  })
})
