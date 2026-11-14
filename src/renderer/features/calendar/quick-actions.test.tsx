// P17c (G-195): quick reservation bar, right-click menu, multi-select with bulk actions, today strip, "Son iptaller"
// and the long-press menu on the phone — on the real calendar page over the fake services.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ProcedureName } from '@shared/contract'
import { localDate } from '@shared/date'
import { ApiError } from '@/lib/transport/types'
import { demoHotel } from '@/mocks/demo-source'
import type { DemoHotel } from '@/mocks/types'
import { calendarTransport } from '@/test/grid-fixture'
import { renderWithProviders } from '@/test/render'
import type { DemoSource } from '@/mocks/demo-source'
import { bookingTransport } from './booking-fake'
import { CalendarPage } from './calendar-page'

const DAY = localDate('2026-10-04')
const source = (hotel: DemoHotel): DemoSource => ({ hotel: () => Promise.resolve(hotel) })

async function renderCalendar(opts: Parameters<typeof calendarTransport>[1] = {}) {
  const hotel = demoHotel(DAY)
  const booking = bookingTransport()
  const transport = calendarTransport(hotel, { base: booking, ...opts })
  await renderWithProviders(<CalendarPage />, { source: source(hotel), transport })
  const chart = await screen.findByTestId('tape-chart')
  await within(chart).findByTestId('tape-row-101')
  return { chart, transport, hotel, booking }
}

beforeAll(() => {
  Element.prototype.scrollIntoView ??= () => {}
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
})

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-04T09:00:00') })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('hızlı rezervasyon çubuğu', () => {
  it('boş hücreye tıklayınca çubuk açılır; ad yazıp Enter kaydeder, öneri fiyat ve gece sayısı gider', async () => {
    const { chart, booking } = await renderCalendar()
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    // Room 102 has nothing today in the demo hotel.
    const track = within(chart).getByTestId('tape-track-102')
    fireEvent.click(track, { clientX: 3 * 56 + 5 })
    const bar = await screen.findByTestId('quick-book')
    expect(bar).toHaveAccessibleName(/Hızlı rezervasyon · Oda 102/)
    await user.type(within(bar).getByTestId('quick-name'), 'Ece Kaya')
    await user.clear(within(bar).getByTestId('quick-nights'))
    await user.type(within(bar).getByTestId('quick-nights'), '2')
    await user.keyboard('{Enter}')
    await waitFor(() => expect(booking.callsTo('booking.create')).toHaveLength(1))
    const sent = booking.callsTo('booking.create')[0] as {
      guest: { firstName: string; lastName: string }
      stays: { roomId: string; checkIn: string; checkOut: string; prices?: unknown[] }[]
      adults: number
    }
    expect(sent.guest).toEqual({ firstName: 'Ece', lastName: 'Kaya' })
    expect(sent.adults).toBe(1)
    expect(sent.stays[0]).toMatchObject({ roomId: 'room-102' })
    expect(sent.stays[0]!.prices).toHaveLength(2)
    await waitFor(() => expect(screen.queryByTestId('quick-book')).not.toBeInTheDocument())
  })

  it('ad ve soyad sözleşme sınırını (80) aşarsa alan hatası çıkar ve kaydedilmez', async () => {
    const { chart, booking } = await renderCalendar()
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    fireEvent.click(within(chart).getByTestId('tape-track-102'), { clientX: 3 * 56 + 5 })
    const bar = await screen.findByTestId('quick-book')
    // One long word is a first name of 81 characters.
    fireEvent.change(within(bar).getByTestId('quick-name'), { target: { value: 'A'.repeat(81) } })
    await user.click(within(bar).getByTestId('quick-save'))
    expect(within(bar).getByText('Ad ve soyad en çok 80 karakter olabilir.')).toBeInTheDocument()
    expect(booking.callsTo('booking.create')).toHaveLength(0)
    // 80 + 80 characters in two words is within the limits of both fields.
    fireEvent.change(within(bar).getByTestId('quick-name'), {
      target: { value: `${'A'.repeat(80)} ${'B'.repeat(80)}` }
    })
    await user.click(within(bar).getByTestId('quick-save'))
    await waitFor(() => expect(booking.callsTo('booking.create')).toHaveLength(1))
  })

  it('gecelik fiyat 0 ise "Fiyat 0 olarak kaydedilsin mi?" sorulur; onaylanınca kaydedilir', async () => {
    const { chart, booking } = await renderCalendar()
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    fireEvent.click(within(chart).getByTestId('tape-track-102'), { clientX: 3 * 56 + 5 })
    const bar = await screen.findByTestId('quick-book')
    await user.type(within(bar).getByTestId('quick-name'), 'Ece Kaya')
    const price = within(bar).getByLabelText('Gecelik fiyat')
    await user.clear(price)
    await user.type(price, '0')
    await user.click(within(bar).getByTestId('quick-save'))
    const ask = await screen.findByTestId('over-amount-dialog')
    expect(within(ask).getByText('Fiyat 0 olarak kaydedilsin mi?')).toBeInTheDocument()
    expect(booking.callsTo('booking.create')).toHaveLength(0)
    await user.click(within(ask).getByTestId('over-amount-confirm'))
    await waitFor(() => expect(booking.callsTo('booking.create')).toHaveLength(1))
    expect(booking.callsTo('booking.create')[0]).toMatchObject({
      stays: [expect.objectContaining({ nightlyPriceMinor: 0 })]
    })
  })

  it('ad boşken kaydedilmez ve açıklama çıkar; Esc çubuğu kapatır', async () => {
    const { chart, booking } = await renderCalendar()
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    fireEvent.click(within(chart).getByTestId('tape-track-102'), { clientX: 3 * 56 + 5 })
    const bar = await screen.findByTestId('quick-book')
    await user.click(within(bar).getByTestId('quick-save'))
    expect(within(bar).getByText('Misafir adını yazın.')).toBeInTheDocument()
    expect(booking.callsTo('booking.create')).toHaveLength(0)
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByTestId('quick-book')).not.toBeInTheDocument())
  })
})

describe('sağ tık menüsü', () => {
  it('rezervasyon çubuğunda 10 işlem çıkar; bugün gelen için Giriş yap hizmeti çağırır', async () => {
    const { chart, booking, hotel } = await renderCalendar()
    const planned = hotel.reservations
      .filter((r) => r.status === 'confirmed')
      .flatMap((r) => r.stays)
      .find((s) => s.status === 'planned' && s.checkIn === DAY)
    const target = planned ?? hotel.reservations.flatMap((r) => r.stays).find((s) => s.status === 'planned')!
    const bar = await within(chart).findByTestId(`stay-${target.id}`)
    fireEvent.contextMenu(bar)
    const menu = await screen.findByTestId('grid-menu')
    expect(within(menu).getAllByRole('menuitem')).toHaveLength(10)
    expect(within(menu).getByTestId('ctx-guest')).not.toHaveAttribute('data-disabled')
    // The stay is not in the house: check-out is dimmed, not hidden.
    expect(within(menu).getByTestId('ctx-checkOut')).toHaveAttribute('data-disabled')
    if (target.checkIn <= DAY) {
      await userEvent.setup({ pointerEventsCheck: 0 }).click(within(menu).getByTestId('ctx-checkIn'))
      await waitFor(() => expect(booking.callsTo('booking.checkIn')).toHaveLength(1))
    }
  })

  it('boş hücrede hızlı rezervasyon, ayrıntılı rezervasyon ve saatlik satış çıkar', async () => {
    const { chart } = await renderCalendar()
    fireEvent.contextMenu(within(chart).getByTestId('tape-track-102'), { clientX: 3 * 56 + 5 })
    const menu = await screen.findByTestId('grid-menu')
    expect(within(menu).getByTestId('ctx-quick')).toBeInTheDocument()
    expect(within(menu).getByTestId('ctx-detail')).toBeInTheDocument()
    expect(within(menu).getByTestId('ctx-hourly')).toBeInTheDocument()
    await userEvent.setup({ pointerEventsCheck: 0 }).click(within(menu).getByTestId('ctx-quick'))
    expect(await screen.findByTestId('quick-book')).toBeInTheDocument()
  })

  it('menü tuşu (Shift+F10) imlecin olduğu hücrenin menüsünü açar', async () => {
    const { chart } = await renderCalendar()
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    act(() => chart.focus())
    await user.keyboard('{ArrowDown}')
    await user.keyboard('{Shift>}{F10}{/Shift}')
    const menu = await screen.findByTestId('grid-menu')
    expect(within(menu).getByTestId('ctx-title')).toHaveTextContent(/Oda 102/)
  })
})

describe('çoklu seçim ve toplu işlemler', () => {
  it('Ctrl ile iki çubuk seçilir; Toplu not seçilen rezervasyonların hepsine yazılır; Esc seçimi temizler', async () => {
    const { chart, booking, hotel } = await renderCalendar()
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    await within(chart).findByTestId('tape-row-102')
    const bars = await waitFor(() => {
      const found = within(chart).getAllByTestId(/^stay-/)
      expect(found.length).toBeGreaterThan(1)
      return found
    })
    // Two stays of different reservations.
    const first = bars[0]!
    const second = bars.find(
      (b) => b.dataset['stayId']!.split('-stay')[0] !== first.dataset['stayId']!.split('-stay')[0]
    )!
    // The panel's fake knows only reservations it created: give both demo reservations a booking view.
    for (const bar of [first, second]) {
      const reservationId = hotel.reservations.find((r) =>
        r.stays.some((st) => st.id === bar.dataset['stayId'])
      )!.id
      const made = (await booking.call('booking.create', {
        guest: { firstName: 'Örnek', lastName: reservationId },
        channelId: 'ch-direct',
        stays: [{ roomId: 'room-101', checkIn: DAY, checkOut: '2026-10-06', nightlyPriceMinor: 200_000 }]
      })) as { reservation: { id: string } }
      booking.booking.views[reservationId] = booking.booking.views[made.reservation.id]!
    }
    fireEvent.click(first, { ctrlKey: true })
    fireEvent.click(second, { ctrlKey: true })
    const barSel = await screen.findByTestId('selection-bar')
    expect(within(barSel).getByTestId('selection-count')).toHaveTextContent('Seçilen: 2')
    expect(first).toHaveAttribute('data-selected')
    // Ctrl-click did not open the panel.
    expect(screen.queryByTestId('reservation-panel')).not.toBeInTheDocument()
    await user.click(within(barSel).getByTestId('bulk-note'))
    await user.type(await screen.findByTestId('bulk-note-text'), 'Toplu not metni')
    await user.click(screen.getByTestId('bulk-note-save'))
    await waitFor(() => expect(booking.callsTo('booking.addNote')).toHaveLength(2))
    await waitFor(() => expect(screen.queryByTestId('selection-bar')).not.toBeInTheDocument())
  })

  it('Toplu ödeme kapalı güne denk gelirse gerekçe sorar ve gerekçeyle her rezervasyona yazar', async () => {
    const { chart, booking, hotel } = await renderCalendar()
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const bars = await waitFor(() => {
      const found = within(chart).getAllByTestId(/^stay-/)
      expect(found.length).toBeGreaterThan(1)
      return found
    })
    const first = bars[0]!
    const second = bars.find(
      (b) => b.dataset['stayId']!.split('-stay')[0] !== first.dataset['stayId']!.split('-stay')[0]
    )!
    for (const bar of [first, second]) {
      const reservationId = hotel.reservations.find((r) =>
        r.stays.some((st) => st.id === bar.dataset['stayId'])
      )!.id
      const made = (await booking.call('booking.create', {
        guest: { firstName: 'Örnek', lastName: reservationId },
        channelId: 'ch-direct',
        stays: [{ roomId: 'room-101', checkIn: DAY, checkOut: '2026-10-06', nightlyPriceMinor: 200_000 }]
      })) as { reservation: { id: string } }
      booking.booking.views[reservationId] = booking.booking.views[made.reservation.id]!
    }
    // The service says today's business day is closed until a reason comes with the payment (G-72).
    const inner = booking.call.bind(booking)
    booking.call = (async (name: ProcedureName, input: unknown) => {
      if (name === 'booking.addPayment' && !(input as { dayClosedReason?: string }).dayClosedReason) {
        booking.calls.push({ name, input })
        throw new ApiError('CONFLICT', 409, 'errors.dayClosed')
      }
      return inner(name, input as never)
    }) as typeof booking.call
    fireEvent.click(first, { ctrlKey: true })
    fireEvent.click(second, { ctrlKey: true })
    await user.click(await screen.findByTestId('bulk-pay'))
    await waitFor(() => expect(screen.getByTestId('bulk-pay-save')).toBeEnabled())
    await user.click(screen.getByTestId('bulk-pay-save'))
    const reason = await screen.findByTestId('closed-day-reason')
    expect(screen.queryByText(/işlem yapılamadı/)).not.toBeInTheDocument()
    await user.type(within(reason).getByRole('textbox'), 'geç gelen ödeme')
    await user.click(screen.getByTestId('bulk-pay-save'))
    await waitFor(() => expect(booking.callsTo('booking.addPayment')).toHaveLength(4))
    for (const call of booking.callsTo('booking.addPayment').slice(2))
      expect(call).toMatchObject({ dayClosedReason: 'geç gelen ödeme' })
  })

  it('Esc seçimi temizler', async () => {
    const { chart } = await renderCalendar()
    const bars = await waitFor(() => {
      const found = within(chart).getAllByTestId(/^stay-/)
      expect(found.length).toBeGreaterThan(0)
      return found
    })
    fireEvent.click(bars[0]!, { ctrlKey: true })
    await screen.findByTestId('selection-bar')
    act(() => chart.focus())
    await userEvent.setup({ pointerEventsCheck: 0 }).keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByTestId('selection-bar')).not.toBeInTheDocument())
  })
})

describe('bugün şeridi ve son iptaller', () => {
  it('bugün şeridi gelecek, gidecek ve otelde sayılarını today.summary ile gösterir', async () => {
    const { transport } = await renderCalendar()
    const strip = await screen.findByTestId('today-strip')
    expect(within(strip).getByTestId('today-arrivals')).toHaveTextContent(/Bugün gelecekler: \d+/)
    expect(within(strip).getByTestId('today-departures')).toHaveTextContent(/Bugün gidecekler: \d+/)
    expect(within(strip).getByTestId('today-inhouse')).toHaveTextContent(/Otelde: \d+ oda/)
    expect(transport.calls.some((c) => c.name === 'today.summary')).toBe(true)
  })

  it('Son iptaller son 7 günün iptal ve gelmedi kayıtlarını listeler; lejant notu iptal kayıtlarının yerini söyler', async () => {
    await renderCalendar({
      recentEnded: [
        {
          reservationId: 'res-x',
          code: 'R-2026-000900',
          guestName: 'Ada Örnek',
          status: 'cancelled',
          endedAt: '2026-10-03T10:00:00.000Z',
          reason: 'Misafir vazgeçti',
          rooms: ['101'],
          checkIn: localDate('2026-10-10'),
          checkOut: localDate('2026-10-12')
        },
        {
          reservationId: 'res-y',
          code: 'R-2026-000901',
          guestName: 'Can Örnek',
          status: 'no_show',
          endedAt: '2026-10-02T10:00:00.000Z',
          reason: null,
          rooms: [],
          checkIn: null,
          checkOut: null
        }
      ]
    })
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    expect(await screen.findByTestId('ended-legend-note')).toHaveTextContent('Misafir kartı → Geçmiş')
    await user.click(await screen.findByTestId('recent-ended-open'))
    const list = await screen.findByTestId('recent-ended')
    expect(within(list).getByText('Son 7 günün iptalleri')).toBeInTheDocument()
    expect(within(list).getByText('Ada Örnek')).toBeInTheDocument()
    expect(within(list).getByText('Misafir vazgeçti')).toBeInTheDocument()
    expect(within(list).getByText('Gelmedi')).toBeInTheDocument()
  })
})

describe('telefon: uzun basma menüsü', () => {
  it('gün listesindeki satırın menüsü masaüstü menüsüyle aynı 10 işlemi sunar', async () => {
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
    const hotel = demoHotel(DAY)
    const transport = calendarTransport(hotel, { base: bookingTransport() })
    await renderWithProviders(<CalendarPage />, { source: source(hotel), transport })
    const list = await screen.findByTestId('day-list')
    await within(list).findByRole('heading', { name: /^Gelenler/ })
    const rows = within(list)
      .getAllByRole('button')
      .filter((b) => b.className.includes('min-h-14'))
    expect(rows.length).toBeGreaterThan(0)
    fireEvent.contextMenu(rows[0]!)
    const items = await screen.findAllByRole('menuitem')
    expect(items).toHaveLength(10)
  })
})
