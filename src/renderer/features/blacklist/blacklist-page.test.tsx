import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, configure, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { BlacklistEntryDto } from '@shared/contract/procedures/guests'
import { renderWithProviders } from '@/test/render'
import { setViewAs } from '@/lib/view-as'
import { emptyGuests, guestsTransport, type GuestsState } from '@/features/guests/guests-fake'
import { BlacklistPage } from './blacklist-page'

configure({ asyncUtilTimeout: 4000 })
vi.setConfig({ testTimeout: 30_000 })

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})

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

const entry = (
  partial: Partial<BlacklistEntryDto> & Pick<BlacklistEntryDto, 'id' | 'name'>
): BlacklistEntryDto => ({
  guestId: null,
  idDocNumber: null,
  identityMasked: false,
  phoneNormalized: null,
  severity: 'warn',
  reasonCode: 'other',
  reasonText: 'Gürültü',
  incidentDate: null,
  addedBy: 'u-owner',
  addedByName: 'Otel Sahibi',
  approvedByName: null,
  status: 'active',
  removedAt: null,
  removedByName: null,
  removedReason: null,
  createdAt: '2026-09-01T09:00:00.000Z',
  ...partial
})

function hotel(): GuestsState {
  const state = emptyGuests()
  state.blacklist.push(
    entry({
      id: 'bl-block',
      name: 'Viktor Kaminski',
      phoneNormalized: '48600000000',
      severity: 'block',
      reasonCode: 'damage',
      reasonText: 'Odaya zarar verdi'
    }),
    entry({ id: 'bl-warn', name: 'Tarık Ekinci', phoneNormalized: '905300000099', reasonCode: 'unpaid' }),
    entry({
      id: 'bl-gone',
      name: 'Rıza Tunç',
      status: 'removed',
      removedAt: '2026-09-20T09:00:00.000Z',
      removedByName: 'Aylin Şahin',
      removedReason: 'Sahip ile görüştü'
    })
  )
  return state
}

describe('Kara liste', () => {
  it('veri gelene kadar yükleniyor durumunu gösterir', async () => {
    const transport = guestsTransport()
    transport.call = () => new Promise(() => {})
    await renderWithProviders(<BlacklistPage />, { transport })
    expect(await screen.findByRole('status')).toHaveAttribute('aria-busy')
  })

  it('liste boşsa boş durumu anlatır; ekleme ve kontrol yine kullanılabilir', async () => {
    await renderWithProviders(<BlacklistPage />, { transport: guestsTransport() })
    expect(await screen.findByText('Kara liste boş')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Kara listeye ekle' })).toBeInTheDocument()
    expect(screen.getByTestId('blacklist-check')).toBeInTheDocument()
  })

  it('listede kişi, telefon, neden ve ciddiyet görünür; kaldırılanlar kimin kaldırdığıyla durur', async () => {
    const user = userEvent.setup()
    await renderWithProviders(<BlacklistPage />, { transport: guestsTransport(hotel()) })
    const table = await screen.findByTestId('blacklist-table')
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('Viktor Kaminski')
    expect(rows[0]).toHaveTextContent('+48600000000')
    expect(rows[0]).toHaveTextContent('Hasar verdi')
    expect(rows[0]).toHaveTextContent('Engelle')
    expect(rows[1]).toHaveTextContent('+90 530 000 00 99')
    await user.click(screen.getByRole('radio', { name: /Kaldırılanlar/ }))
    expect(screen.getByTestId('blacklist-table')).toHaveTextContent('Rıza Tunç')
    expect(screen.getByTestId('blacklist-table')).toHaveTextContent('Aylin Şahin')
  })

  it('kontrol alanı adı Türkçe harf farkı olmadan, telefonu yerel yazımla eşleştirir', async () => {
    const user = userEvent.setup()
    await renderWithProviders(<BlacklistPage />, { transport: guestsTransport(hotel()) })
    const result = await screen.findByTestId('blacklist-result')
    await fill(user, screen.getByLabelText('Ad soyad'), 'tarik ekinci')
    await waitFor(() => expect(result).toHaveTextContent('Tarık Ekinci'))
    expect(result).toHaveTextContent('Eşleşen:ad')
    await user.clear(screen.getByLabelText('Ad soyad'))
    await fill(user, screen.getByLabelText('Telefon'), '0530 000 00 99')
    await waitFor(() => expect(result).toHaveTextContent('telefon'))
    await user.clear(screen.getByLabelText('Telefon'))
    await fill(user, screen.getByLabelText('Ad soyad'), 'Ayşe Yılmaz')
    await waitFor(() => expect(result).toHaveTextContent('Kara listede eşleşme yok.'))
  })

  it('ekleme: ad ve neden ister; kayıt servise ciddiyet ve neden türüyle gider', async () => {
    const user = userEvent.setup()
    const transport = guestsTransport(hotel())
    await renderWithProviders(<BlacklistPage />, { transport })
    await screen.findByTestId('blacklist-table')
    await user.click(screen.getByRole('button', { name: 'Kara listeye ekle' }))
    const dialog = await screen.findByRole('dialog', { name: 'Kara listeye ekle' })
    await user.click(within(dialog).getByTestId('blacklist-save'))
    expect(within(dialog).getAllByText('Bu alan zorunlu.')).toHaveLength(2)
    await fill(user, within(dialog).getByLabelText('Ad soyad'), 'Yeni Kişi')
    await user.click(within(dialog).getByRole('radio', { name: /Engelle/ }))
    await fill(user, within(dialog).getByLabelText('Neden'), 'Hasarı ödemedi')
    await user.click(within(dialog).getByTestId('blacklist-save'))
    await waitFor(() => expect(transport.callsTo('blacklist.add')).toHaveLength(1))
    expect(transport.callsTo('blacklist.add')[0]).toMatchObject({
      name: 'Yeni Kişi',
      severity: 'block',
      reasonCode: 'other',
      reasonText: 'Hasarı ödemedi',
      guestId: null
    })
    await waitFor(() =>
      expect(within(screen.getByTestId('blacklist-table')).getAllByRole('row')).toHaveLength(4)
    )
  })

  it('kaldırma silmez: neden ister ve kayıt "Kaldırılanlar"a geçer', async () => {
    const user = userEvent.setup()
    const transport = guestsTransport(hotel())
    await renderWithProviders(<BlacklistPage />, { transport })
    const table = await screen.findByTestId('blacklist-table')
    await user.click(within(table).getAllByRole('button', { name: 'Kaldır' })[1]!)
    const dialog = await screen.findByRole('dialog', { name: 'Kişi listeden kaldırılsın mı?' })
    await user.click(within(dialog).getByRole('button', { name: 'Listeden kaldır' }))
    expect(within(dialog).getByText('Bu alan zorunlu.')).toBeInTheDocument()
    await fill(user, within(dialog).getByLabelText('Kaldırma nedeni'), 'Borcunu ödedi')
    await user.click(within(dialog).getByRole('button', { name: 'Listeden kaldır' }))
    await waitFor(() =>
      expect(transport.callsTo('blacklist.remove')).toEqual([{ id: 'bl-warn', reason: 'Borcunu ödedi' }])
    )
    await waitFor(() =>
      expect(
        within(screen.getByTestId('blacklist-view')).getByRole('radio', { name: /Kaldırılanlar/ })
      ).toHaveTextContent('2')
    )
  })

  it('resepsiyon ekler ama kaldıramaz; kat görevlisi ekranı göremez', async () => {
    await renderWithProviders(<BlacklistPage />, { transport: guestsTransport(hotel()) })
    expect((await screen.findAllByRole('button', { name: 'Kaldır' })).length).toBe(2)
    act(() => setViewAs('reception'))
    expect(screen.getByRole('button', { name: 'Kara listeye ekle' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Kaldır' })).not.toBeInTheDocument()
    act(() => setViewAs('housekeeping'))
    expect(screen.getByText('Bu ekrana yetkiniz yok')).toBeInTheDocument()
  })

  it('telefonda liste kartlara döner', async () => {
    phone()
    await renderWithProviders(<BlacklistPage />, { transport: guestsTransport(hotel()) })
    const cards = await screen.findByTestId('blacklist-cards')
    expect(screen.queryByTestId('blacklist-table')).not.toBeInTheDocument()
    expect(within(cards).getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Kara listeye ekle' })).toHaveLength(1)
  })
})
