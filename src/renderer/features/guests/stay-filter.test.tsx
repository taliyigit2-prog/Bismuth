// G-190 (K-46 (3)): the guest list's "Oda ve tarih" filter on the desktop and the phone — "302'de Mart'ta kim kaldı".
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, configure, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/render'
import { setViewAs } from '@/lib/view-as'
import { GuestsPage } from './guests-page'
import { emptyGuests, guest, guestsTransport, stay, type GuestsState } from './guests-fake'

configure({ asyncUtilTimeout: 4000 })
vi.setConfig({ testTimeout: 30_000 })

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})

afterEach(() => {
  vi.restoreAllMocks()
  act(() => setViewAs('owner'))
})

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

/** Ayla in 302 in March, Burak's March booking in 302 cancelled, Cem in 101. */
function hotel(): GuestsState {
  const state = emptyGuests()
  state.guests.push(
    guest({ id: 'g-ayla', firstName: 'Ayla', lastName: 'Deneme' }),
    guest({ id: 'g-burak', firstName: 'Burak', lastName: 'Örnek' }),
    guest({ id: 'g-cem', firstName: 'Cem', lastName: 'Deneme' })
  )
  state.stays['g-ayla'] = [
    stay({
      reservationId: 'r1',
      checkIn: '2026-03-10',
      checkOut: '2026-03-14',
      prices: [1, 1, 1, 1],
      roomNumber: '302'
    })
  ]
  state.stays['g-burak'] = [
    stay({
      reservationId: 'r2',
      checkIn: '2026-03-20',
      checkOut: '2026-03-22',
      prices: [1, 1],
      roomNumber: '302',
      status: 'cancelled'
    })
  ]
  state.stays['g-cem'] = [
    stay({ reservationId: 'r3', checkIn: '2026-03-10', checkOut: '2026-03-12', prices: [1, 1] })
  ]
  return state
}

describe('misafir listesi: oda ve tarih süzgeci (G-190)', () => {
  it('oda numarası yazılınca o odada kalanlar ve konaklamaları görünür; iptal edilen işaretlidir', async () => {
    const transport = guestsTransport(hotel())
    await renderWithProviders(<GuestsPage />, { transport })
    const user = userEvent.setup()
    await screen.findByTestId('guest-table')
    expect(screen.queryByTestId('stay-filter')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Oda ve tarih' }))
    const fields = screen.getByTestId('stay-filter')
    await user.type(within(fields).getByLabelText('Oda'), '302')
    await waitFor(() => expect(transport.callsTo('guests.list').at(-1)).toMatchObject({ room: '302' }))
    const table = screen.getByTestId('guest-table')
    await waitFor(() => expect(within(table).queryByText('Cem Deneme')).not.toBeInTheDocument())
    expect(within(table).getByText('Ayla Deneme')).toBeInTheDocument()
    const ayla = screen.getByTestId('matched-stays-g-ayla')
    expect(ayla).toHaveTextContent('Oda 302 · 10 Mar 2026 – 14 Mar 2026')
    expect(within(screen.getByTestId('matched-stays-g-burak')).getByText('İptal edildi')).toBeInTheDocument()
    // The toggle says the filter is on; clearing brings everyone back.
    expect(screen.getByTestId('stay-filter-toggle')).toHaveTextContent('filtre açık')
    await user.click(within(fields).getByRole('button', { name: 'Temizle' }))
    expect(await within(table).findByText('Cem Deneme')).toBeInTheDocument()
    // The cleared query may land after the old rows are shown again; wait for the last call.
    await waitFor(() => expect(transport.callsTo('guests.list').at(-1)).not.toHaveProperty('room'))
  })

  it('aramaya uyan yoksa boş durum "Filtreyi temizle" ile süzgeci de kaldırır', async () => {
    const transport = guestsTransport(hotel())
    await renderWithProviders(<GuestsPage />, { transport })
    const user = userEvent.setup()
    await screen.findByTestId('guest-table')
    await user.click(screen.getByRole('button', { name: 'Oda ve tarih' }))
    await user.type(screen.getByLabelText('Oda'), '999')
    expect(await screen.findByText('Aramaya uyan misafir yok.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Filtreyi temizle' }))
    expect(await screen.findByText('Cem Deneme')).toBeInTheDocument()
  })

  it('telefonda da süzgeç açılır ve kartlarda konaklama görünür', async () => {
    phone()
    const transport = guestsTransport(hotel())
    await renderWithProviders(<GuestsPage />, { transport })
    const user = userEvent.setup()
    await screen.findByTestId('guest-cards')
    await user.click(screen.getByRole('button', { name: 'Oda ve tarih' }))
    await user.type(screen.getByLabelText('Oda'), '302')
    const cards = screen.getByTestId('guest-cards')
    await waitFor(() => expect(within(cards).queryByText('Cem Deneme')).not.toBeInTheDocument())
    expect(within(cards).getByTestId('matched-stays-g-ayla')).toHaveTextContent('Oda 302')
  })
})
