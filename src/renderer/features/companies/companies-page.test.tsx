import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, configure, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { formatMoney } from '@shared/format'
import { money } from '@shared/money'
import { renderWithProviders } from '@/test/render'
import { setViewAs } from '@/lib/view-as'
import {
  company,
  emptyGuests,
  guest,
  guestsTransport,
  stay,
  type GuestsState
} from '@/features/guests/guests-fake'
import { CompaniesPage } from './companies-page'

configure({ asyncUtilTimeout: 4000 })
vi.setConfig({ testTimeout: 30_000 })

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})

const tl = (minor: number): string => formatMoney(money(minor, 'TRY'), 'tr')

async function fill(user: ReturnType<typeof userEvent.setup>, el: HTMLElement, text: string): Promise<void> {
  await user.click(el)
  await user.paste(text)
}

afterEach(() => {
  vi.restoreAllMocks()
  act(() => setViewAs('owner'))
})

function hotel(): GuestsState {
  const state = emptyGuests()
  state.companies.push(
    company({ id: 'co-a', title: 'Alfa Ltd.' }),
    company({
      id: 'co-z',
      title: 'Zeta Turizm A.Ş.',
      favorite: true,
      address: 'Atatürk Cd. No: 1',
      city: 'İstanbul',
      taxOffice: 'Kadıköy',
      taxNumber: '1234567890',
      iban: 'TR830006200000000012345678',
      contactPerson: 'Ayşe Yılmaz'
    })
  )
  state.guests.push(
    guest({ id: 'g-1', firstName: 'Can', lastName: 'Öz', companyId: 'co-z' }),
    guest({ id: 'g-2', firstName: 'Ece', lastName: 'Ak', companyId: 'co-z' })
  )
  state.stays['g-1'] = [
    stay({ reservationId: 'r1', checkIn: '2026-05-01', checkOut: '2026-05-03', prices: [150_000, 150_000] })
  ]
  state.stays['g-2'] = [
    stay({ reservationId: 'r2', checkIn: '2026-07-01', checkOut: '2026-07-02', prices: [180_000] })
  ]
  return state
}

describe('Firmalar', () => {
  it('veri gelene kadar yükleniyor; firma yoksa boş durum ve "Yeni firma"', async () => {
    const pending = guestsTransport()
    pending.call = () => new Promise(() => {})
    const { unmount } = await renderWithProviders(<CompaniesPage />, { transport: pending })
    expect(await screen.findByRole('status')).toHaveAttribute('aria-busy')
    unmount()
    await renderWithProviders(<CompaniesPage />, { transport: guestsTransport() })
    expect(await screen.findByText('Henüz firma yok')).toBeInTheDocument()
  })

  it('favori firma üstte; çok satırlı ve tek satır kopya fatura programına uygun', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const transport = guestsTransport(hotel())
    await renderWithProviders(<CompaniesPage />, { transport })
    const list = await screen.findByTestId('company-list')
    const cards = within(list).getAllByTestId(/^company-co-/)
    expect(cards.map((c) => c.getAttribute('data-testid'))).toEqual(['company-co-z', 'company-co-a'])
    const zeta = cards[0]!
    await user.click(within(zeta).getByRole('button', { name: 'Kopyala' }))
    expect(writeText).toHaveBeenLastCalledWith(
      [
        'Unvan: Zeta Turizm A.Ş.',
        'Adres: Atatürk Cd. No: 1, İstanbul',
        'Vergi dairesi / No: Kadıköy / 1234567890',
        'IBAN: TR83 0006 2000 0000 0012 3456 78',
        'Yetkili: Ayşe Yılmaz'
      ].join('\n')
    )
    await user.click(within(zeta).getByRole('radio', { name: 'Tek satır' }))
    await user.click(within(zeta).getByRole('button', { name: /Kopyala|Kopyalandı/ }))
    expect(writeText).toHaveBeenLastCalledWith(
      'Unvan: Zeta Turizm A.Ş. · Adres: Atatürk Cd. No: 1, İstanbul · Vergi dairesi / No: Kadıköy / 1234567890 · IBAN: TR83 0006 2000 0000 0012 3456 78 · Yetkili: Ayşe Yılmaz'
    )
    await waitFor(() => expect(transport.callsTo('companies.markUsed').length).toBeGreaterThan(0))
  })

  it('yıldız favoriyi değiştirir; yeni firma geçersiz IBAN ile kaydedilmez', async () => {
    const user = userEvent.setup()
    const transport = guestsTransport(hotel())
    await renderWithProviders(<CompaniesPage />, { transport })
    const alfa = await screen.findByTestId('company-co-a')
    await user.click(within(alfa).getByTestId('company-favorite'))
    await waitFor(() =>
      expect(transport.callsTo('companies.update')).toEqual([{ id: 'co-a', patch: { favorite: true } }])
    )
    await user.click(screen.getByTestId('company-new'))
    const dialog = await screen.findByRole('dialog', { name: 'Yeni firma' })
    await fill(user, within(dialog).getByLabelText('Unvan'), 'Yeni Firma Ltd.')
    await fill(user, within(dialog).getByLabelText('IBAN'), 'TR12')
    await user.click(within(dialog).getByTestId('company-save'))
    expect(within(dialog).getByText(/IBAN geçersiz görünüyor/)).toBeInTheDocument()
    await user.clear(within(dialog).getByLabelText('IBAN'))
    await user.click(within(dialog).getByTestId('company-save'))
    await waitFor(() => expect(transport.callsTo('companies.create')).toHaveLength(1))
    expect(transport.callsTo('companies.create')[0]).toMatchObject({ title: 'Yeni Firma Ltd.', iban: '' })
  })

  it('IBAN kontrol hanesi ve vergi numarası hane sayısı denetlenir; aynı ünvan uyarır ama kaydı durdurmaz (QA3c1 #15)', async () => {
    const user = userEvent.setup()
    const transport = guestsTransport(hotel())
    await renderWithProviders(<CompaniesPage />, { transport })
    await user.click(await screen.findByTestId('company-new'))
    const dialog = await screen.findByRole('dialog', { name: 'Yeni firma' })
    await fill(user, within(dialog).getByLabelText('Unvan'), 'Alfa Ltd.')
    expect(await within(dialog).findByTestId('company-same-title')).toHaveTextContent('Alfa Ltd.')
    await fill(user, within(dialog).getByLabelText('IBAN'), 'TR12 0006 2000 0000 0012 3456 78')
    await fill(user, within(dialog).getByLabelText('Vergi no'), '12')
    await user.click(within(dialog).getByTestId('company-save'))
    expect(within(dialog).getByText(/IBAN geçersiz görünüyor/)).toBeInTheDocument()
    expect(within(dialog).getByText(/Vergi numarası 10 haneli/)).toBeInTheDocument()
    expect(transport.callsTo('companies.create')).toHaveLength(0)
    await user.clear(within(dialog).getByLabelText('IBAN'))
    await fill(user, within(dialog).getByLabelText('IBAN'), 'TR33 0006 1005 1978 6457 8413 26')
    await user.clear(within(dialog).getByLabelText('Vergi no'))
    await fill(user, within(dialog).getByLabelText('Vergi no'), '1234567890')
    await user.click(within(dialog).getByTestId('company-save'))
    await waitFor(() => expect(transport.callsTo('companies.create')).toHaveLength(1))
  })

  it('telefon yerine "telefon" yazılınca alan işaretlenir, kayıt gitmez; aynı vergi numarası uyarır; unvan sınırda sayaç gösterir (H-21)', async () => {
    const user = userEvent.setup()
    const transport = guestsTransport(hotel())
    await renderWithProviders(<CompaniesPage />, { transport })
    await user.click(await screen.findByTestId('company-new'))
    const dialog = await screen.findByRole('dialog', { name: 'Yeni firma' })
    const title = within(dialog).getByLabelText('Unvan')
    await user.click(title)
    await user.paste('B'.repeat(500))
    expect((title as HTMLInputElement).value).toHaveLength(200)
    expect(within(dialog).getByText('En çok 200 karakter yazabilirsiniz.')).toBeInTheDocument()
    await user.clear(title)
    await fill(user, title, 'Beta Turizm')
    await fill(user, within(dialog).getByLabelText('Telefon'), 'telefon')
    await fill(user, within(dialog).getByLabelText('Vergi no'), '1234567890')
    expect(await within(dialog).findByTestId('company-same-tax')).toHaveTextContent('Zeta Turizm A.Ş.')
    await user.click(within(dialog).getByTestId('company-save'))
    expect(within(dialog).getByText(/Telefonu rakamlarla yazın/)).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Telefon')).toHaveAttribute('aria-invalid', 'true')
    expect(transport.callsTo('companies.create')).toHaveLength(0)
  })

  it('firma ayrıntısı bağlı misafirleri ve kurumsal geçmişi (konaklama ve ödeme) gösterir', async () => {
    const user = userEvent.setup()
    await renderWithProviders(<CompaniesPage />, { transport: guestsTransport(hotel()) })
    await user.click(await screen.findByTestId('company-open-co-z'))
    const sheet = await screen.findByTestId('company-sheet')
    expect(await within(sheet).findByTestId('company-guests')).toHaveTextContent('Can Öz')
    expect(within(sheet).getByTestId('company-totals')).toHaveTextContent('2 konaklama · 3 gece')
    expect(within(sheet).getByTestId('company-totals')).toHaveTextContent(tl(480_000))
    expect(within(sheet).getByTestId('history-r1')).toHaveTextContent('Can Öz')
  })

  it('arama unvanla süzer; yetkisi olmayan ekranı göremez, muhasebe yalnız görür', async () => {
    const user = userEvent.setup()
    const transport = guestsTransport(hotel())
    await renderWithProviders(<CompaniesPage />, { transport })
    await screen.findByTestId('company-list')
    await fill(user, screen.getByTestId('company-search'), 'zeta')
    await waitFor(() => expect(transport.callsTo('companies.list').at(-1)).toEqual({ q: 'zeta' }))
    act(() => setViewAs('accountant'))
    expect(screen.queryByTestId('company-new')).toBeNull()
    expect(screen.queryByTestId('company-favorite')).toBeNull()
    act(() => setViewAs('housekeeping'))
    expect(screen.getByText('Bu ekrana yetkiniz yok')).toBeInTheDocument()
  })
})
