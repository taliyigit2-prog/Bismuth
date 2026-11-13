import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { addDays, localDate } from '@shared/date'
import { demoHotel, emptyHotel, type DemoSource } from '@/mocks/demo-source'
import type { DemoHotel } from '@/mocks/types'
import { calendarTransport, gridFromDemo } from '@/test/grid-fixture'
import { renderWithProviders } from '@/test/render'
import { startRenderCount, stopRenderCount } from '@/lib/render-count'
import { bookingTransport, type BookingTransport } from './booking-fake'
import { CalendarPage } from './calendar-page'

const DAY = localDate('2026-10-04')
const source = (hotel: DemoHotel): DemoSource => ({ hotel: () => Promise.resolve(hotel) })

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

async function renderCalendar(
  hotel: DemoHotel = demoHotel(DAY),
  opts: Parameters<typeof calendarTransport>[1] = {}
) {
  // The grid's answers sit on the panel's fake (booking.*), so clicking a bar opens the real panel.
  const booking = bookingTransport()
  const transport = calendarTransport(hotel, { base: booking, ...opts })
  const result = await renderWithProviders(<CalendarPage />, { source: source(hotel), transport })
  return { ...result, transport, hotel, booking }
}

/** Makes the panel's fake answer `booking.get` for a demo reservation id with a booking of that guest. */
async function aliasView(booking: BookingTransport, id: string, firstName: string, lastName: string) {
  const view = (await booking.call('booking.create', {
    guest: { firstName, lastName },
    channelId: 'ch-direct',
    stays: [{ roomId: 'room-101', checkIn: DAY, checkOut: '2026-10-06', nightlyPriceMinor: 200_000 }]
  })) as { reservation: { id: string } }
  booking.booking.views[id] = booking.booking.views[view.reservation.id]!
}

const gridCalls = (transport: { calls: { name: string; input: unknown }[] }) =>
  transport.calls
    .filter((c) => c.name === 'reservations.grid')
    .map((c) => c.input as { from: string; to: string })

beforeAll(() => {
  // jsdom has no scrollIntoView (the search list scrolls its active item into view) and no pointer capture (the
  // room picker of "Oda kapat").
  Element.prototype.scrollIntoView ??= () => {}
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
})

beforeEach(() => {
  // Only the clock is fake (the hotel's "today"); timers stay real for user events and queries.
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-04T09:00:00') })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('takvim (açılış ekranı, gerçek servis)', () => {
  it('veri gelene kadar yükleniyor durumunu gösterir', async () => {
    await renderCalendar(demoHotel(DAY), { grid: () => new Promise(() => {}) })
    expect(await screen.findByRole('status')).toHaveAttribute('aria-busy')
  })

  it('takvim okunamazsa hata ve yeniden dene düğmesi çıkar', async () => {
    await renderCalendar(demoHotel(DAY), { grid: () => Promise.reject(new Error('boom')) })
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Yeniden dene' })).toBeInTheDocument()
  })

  it('oda tanımlı değilse boş durumu anlatır', async () => {
    await renderCalendar({ ...emptyHotel(DAY), rooms: [] })
    expect(await screen.findByText('Henüz oda yok')).toBeInTheDocument()
  })

  it('oda×gün ızgarası, bugün, lejant ve park alanı görünür; ay ay okunur', async () => {
    const { transport, hotel } = await renderCalendar()
    const chart = await screen.findByTestId('tape-chart')
    for (const room of hotel.rooms)
      expect(await within(chart).findByTestId(`tape-row-${room.number}`)).toBeInTheDocument()
    expect(within(chart).getByTestId('tape-today')).toHaveAccessibleName(/4 Ekim 2026 Pazar/)
    const legend = await screen.findByRole('region', { name: 'Lejant' })
    expect(within(legend).getByText('Ödendi')).toBeInTheDocument()
    expect(await within(legend).findByText('Grup')).toBeInTheDocument()
    expect(within(legend).queryByText('Erken giriş')).not.toBeInTheDocument()
    expect(screen.getByTestId('park-area')).toBeInTheDocument()
    // Whole months around the screen, never ten years at once.
    const calls = gridCalls(transport)
    expect(calls.length).toBeGreaterThan(0)
    for (const c of calls) {
      expect(c.from.endsWith('-01')).toBe(true)
      expect(c.to.endsWith('-01')).toBe(true)
    }
    expect(calls.map((c) => c.from)).toContain('2026-10-01')
  })

  it('yalnız görünen günler çizilir (sanallaştırma): on yıllık ızgarada birkaç hafta', async () => {
    await renderCalendar()
    const chart = await screen.findByTestId('tape-chart')
    await within(chart).findByTestId('tape-row-101')
    const days = within(chart).getAllByTestId(/^tape-(day-|today)/)
    expect(days.length).toBeGreaterThan(20)
    expect(days.length).toBeLessThan(120)
  })

  it('konaklama çubuğu adını ve durumunu söyler; satılmaz blok kilit/anahtar ile yazılır; tatil başlıkta', async () => {
    const { hotel } = await renderCalendar()
    const chart = await screen.findByTestId('tape-chart')
    const stay = hotel.reservations.find((r) => r.id === 'res-0011')!.stays[0]!
    expect(await within(chart).findByTestId(`stay-${stay.id}`)).toHaveAccessibleName(
      /Kaan Şahin, oda 101, 1 Eki – 6 Eki; .*Ödendi|Kaan Şahin, oda 101, 1 Eki – 6 Eki; .*/
    )
    expect(
      within(chart).getByRole('button', { name: 'Kullanım dışı: Boya ve nem tamiri' })
    ).toBeInTheDocument()
    expect(within(chart).getByTestId('tape-day-2026-10-10')).toHaveAccessibleName(
      '10 Ekim 2026 Cumartesi: İstanbul Maratonu'
    )
  })

  it('konaklamaya tıklayınca rezervasyon paneli misafir ve gece listesiyle açılır', async () => {
    const { hotel, booking } = await renderCalendar()
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const inHouse = hotel.reservations.find((r) => r.status === 'checked_in')!
    const guest = hotel.guests.find((g) => g.id === inHouse.guestId)!
    // The panel reads the reservation by its id (booking.get): the fake answers for the demo bar's id.
    await aliasView(booking, inHouse.id, `${guest.firstName}`, `${guest.lastName}`)
    const chart = await screen.findByTestId('tape-chart')
    await user.click(await within(chart).findByTestId(`stay-${inHouse.stays[0]!.id}`))
    const panel = await screen.findByTestId('reservation-panel')
    expect(await within(panel).findByText(`${guest.firstName} ${guest.lastName}`)).toBeInTheDocument()
    await user.click(within(panel).getByRole('tab', { name: 'Geceler' }))
    expect(within(panel).getByRole('list', { name: 'Gece gece fiyat ve ödeme' })).toBeInTheDocument()
  })

  it('sürükle-bırak: çubuk alttaki odaya bırakılınca onay sorulur, "Taşı" var olan oda değiştirme yordamını çağırır (faz-15 madde 12)', async () => {
    const { hotel, booking } = await renderCalendar()
    const planned = hotel.reservations.find(
      (r) => r.status === 'confirmed' && r.stays[0]!.checkIn > DAY && r.stays.length === 1
    )!
    const stay = planned.stays[0]!
    const chart = await screen.findByTestId('tape-chart')
    expect(screen.getByTestId('drag-hint')).toBeInTheDocument()
    const bar = await within(chart).findByTestId(`stay-${stay.id}`)
    // jsdom has no layout: a row is 40 px, a day 56 px (the grid's fallbacks).
    fireEvent.pointerDown(bar, { button: 0, clientX: 100, clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(bar, { clientX: 102, clientY: 140, pointerId: 1 })
    expect(within(chart).getByTestId('drag-ghost')).toBeInTheDocument()
    fireEvent.pointerUp(bar, { clientX: 102, clientY: 140, pointerId: 1 })
    fireEvent.click(bar)
    const dialog = await screen.findByTestId('move-stay-dialog')
    expect(dialog).toHaveTextContent('Rezervasyon taşınsın mı?')
    expect(screen.queryByTestId('reservation-panel')).not.toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Taşı' }))
    await waitFor(() => expect(booking.callsTo('booking.changeRoom')).toHaveLength(1))
    const call = booking.callsTo('booking.changeRoom')[0] as { stayId: string; change: { newRoomId: string } }
    expect(call.stayId).toBe(stay.id)
    expect(call.change.newRoomId).not.toBe(stay.roomId)
  })

  it('sürükle-bırak: yana sürükleyince tarih taşınması sorulur; "Vazgeç" hiçbir şey yazmaz', async () => {
    const { hotel, booking } = await renderCalendar()
    const planned = hotel.reservations.find((r) => r.status === 'confirmed' && r.stays[0]!.checkIn > DAY)!
    const chart = await screen.findByTestId('tape-chart')
    const bar = await within(chart).findByTestId(`stay-${planned.stays[0]!.id}`)
    fireEvent.pointerDown(bar, { button: 0, clientX: 100, clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(bar, { clientX: 212, clientY: 102, pointerId: 1 })
    fireEvent.pointerUp(bar, { clientX: 212, clientY: 102, pointerId: 1 })
    const dialog = await screen.findByTestId('move-stay-dialog')
    expect(dialog).toHaveTextContent('Gece sayısı aynı kalır')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Vazgeç' }))
    await waitFor(() => expect(screen.queryByTestId('move-stay-dialog')).not.toBeInTheDocument())
    expect(booking.callsTo('booking.changeDates')).toHaveLength(0)
  })

  it('sürükle-bırak: içerideki misafir başka odaya taşınırken "bugünden itibaren" aralığı bugünden başlar (QA2c #15)', async () => {
    const { hotel } = await renderCalendar()
    const inHouse = hotel.reservations.find(
      (r) => r.status === 'checked_in' && r.stays[0]!.checkIn < DAY && r.stays[0]!.checkOut > DAY
    )!
    const stay = inHouse.stays[0]!
    const chart = await screen.findByTestId('tape-chart')
    const bar = await within(chart).findByTestId(`stay-${stay.id}`)
    fireEvent.pointerDown(bar, { button: 0, clientX: 100, clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(bar, { clientX: 102, clientY: 140, pointerId: 1 })
    fireEvent.pointerUp(bar, { clientX: 102, clientY: 140, pointerId: 1 })
    const dialog = await screen.findByTestId('move-stay-dialog')
    expect(dialog).toHaveTextContent('bugünden itibaren (4 Eki –')
  })

  it('sürükle-bırak: yana bırakılan rezervasyon "Taşı" ile gecelerini fiyatlarıyla kaydıran yordamı çağırır (QA2c #3)', async () => {
    const { hotel, booking } = await renderCalendar()
    const planned = hotel.reservations.find((r) => r.status === 'confirmed' && r.stays[0]!.checkIn > DAY)!
    const stay = planned.stays[0]!
    const chart = await screen.findByTestId('tape-chart')
    const bar = await within(chart).findByTestId(`stay-${stay.id}`)
    fireEvent.pointerDown(bar, { button: 0, clientX: 100, clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(bar, { clientX: 212, clientY: 102, pointerId: 1 })
    fireEvent.pointerUp(bar, { clientX: 212, clientY: 102, pointerId: 1 })
    const dialog = await screen.findByTestId('move-stay-dialog')
    expect(dialog).toHaveTextContent('toplam tutar değişmez')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Taşı' }))
    await waitFor(() => expect(booking.callsTo('booking.moveDates')).toHaveLength(1))
    expect(booking.callsTo('booking.moveDates')[0]).toEqual({
      stayId: stay.id,
      move: { checkIn: addDays(localDate(stay.checkIn), 2) }
    })
    expect(booking.callsTo('booking.changeDates')).toHaveLength(0)
  })

  it('imleç hareketinde oda satırları yeniden çizilmez (faz-15 madde 9, yeniden çizim sayacı)', async () => {
    await renderCalendar()
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const chart = await screen.findByTestId('tape-chart')
    await within(chart).findByTestId('stay-res-0011-stay-1')
    act(() => chart.focus())
    const renders = startRenderCount()
    try {
      await user.keyboard('{ArrowDown}{ArrowRight}{ArrowRight}{ArrowUp}')
      expect(screen.getByTestId('grid-announce')).toHaveTextContent(/^Oda 101, 6 Ekim 2026/)
      expect(renders['tape-row'] ?? 0).toBe(0)
    } finally {
      stopRenderCount()
    }
  })

  it('klavye: oklar hücre gezer ve söyler, Enter konaklamayı açar, N yeni rezervasyon açar', async () => {
    const { booking } = await renderCalendar()
    await aliasView(booking, 'res-0011', 'Kaan', 'Şahin')
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const chart = await screen.findByTestId('tape-chart')
    await within(chart).findByTestId('tape-row-101')
    await within(chart).findByTestId('stay-res-0011-stay-1')
    act(() => chart.focus())
    await user.keyboard('{ArrowDown}')
    expect(screen.getByTestId('grid-announce')).toHaveTextContent(/^Oda 102, 4 Ekim 2026 Pazar: /)
    await user.keyboard('{ArrowUp}')
    expect(screen.getByTestId('grid-announce')).toHaveTextContent(/^Oda 101, 4 Ekim 2026 Pazar: Kaan Şahin/)
    await user.keyboard('{Enter}')
    expect(
      await within(await screen.findByTestId('reservation-panel')).findByText('Kaan Şahin')
    ).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByTestId('reservation-panel')).not.toBeInTheDocument())
    act(() => chart.focus())
    await user.keyboard('n')
    expect(await screen.findByRole('dialog', { name: 'Yeni rezervasyon' })).toBeInTheDocument()
  })

  it('misafir ara: sonuç seçilince ızgara o konaklamaya gider', async () => {
    await renderCalendar()
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    await screen.findByTestId('tape-row-101')
    await user.click(screen.getByRole('button', { name: 'Misafir ara' }))
    await user.type(screen.getByPlaceholderText('Ad, telefon ya da rezervasyon kodu'), 'sanne')
    const [nearest] = await screen.findAllByRole('option', { name: /Sanne Bakker/ })
    await user.click(nearest!)
    expect(screen.getByTestId('grid-announce')).toHaveTextContent(
      /^Oda 202, 3 Ekim 2026 Cumartesi: Sanne Bakker/
    )
  })

  it('G-31: üç yıl önceki konaklamaya arama ile kıstırmasız atlanır (ızgara en eski kaydın yılından başlar)', async () => {
    const old = {
      stayId: 'stay-old',
      reservationId: 'res-old',
      code: 'R-2023-0001',
      guestName: 'Eski Misafir',
      roomId: 'room-101',
      roomNumber: '101',
      checkIn: localDate('2023-03-10'),
      checkOut: localDate('2023-03-13'),
      reservationStatus: 'checked_out' as const
    }
    const { transport } = await renderCalendar(demoHotel(DAY), {
      bounds: () => Promise.resolve({ firstYear: 2023, lastYear: 2036 }),
      findStays: () => [old]
    })
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    await screen.findByTestId('tape-row-101')
    await user.click(screen.getByRole('button', { name: 'Misafir ara' }))
    await user.type(screen.getByPlaceholderText('Ad, telefon ya da rezervasyon kodu'), 'eski')
    await user.click(await screen.findByRole('option', { name: /Eski Misafir/ }))
    // Not clamped to the first column (2025-01-01 before G-31): the cursor is on the stay's own day.
    expect(screen.getByTestId('grid-announce')).toHaveTextContent(/^Oda 101, 10 Mart 2023 Cuma/)
    await waitFor(() => expect(gridCalls(transport).map((c) => c.from)).toContain('2023-03-01'))
  })

  it('G-190: takvim aramasında oda numarası o odanın konaklamalarını getirir', async () => {
    const { hotel } = await renderCalendar()
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    await screen.findByTestId('tape-row-101')
    await user.click(screen.getByRole('button', { name: 'Misafir ara' }))
    expect(
      screen.getByText(/Oda numarası, misafir adı, telefon ya da rezervasyon kodu yazın/)
    ).toBeInTheDocument()
    await user.type(screen.getByPlaceholderText('Ad, telefon ya da rezervasyon kodu'), '202')
    const options = await screen.findAllByRole('option')
    const room = hotel.rooms.find((r) => r.number === '202')!
    expect(options.length).toBeGreaterThan(0)
    for (const option of options) expect(option).toHaveTextContent(new RegExp(`^${room.number}`))
  })

  it('takvim aralığı gelene kadar yükleniyor; okunamazsa geçen yıldan on yıl sonrasına çizilir', async () => {
    let fail: (e: Error) => void = () => {}
    await renderCalendar(demoHotel(DAY), {
      bounds: () => new Promise((_, reject) => (fail = reject))
    })
    expect(await screen.findByRole('status')).toHaveAttribute('aria-busy')
    expect(screen.queryByTestId('tape-chart')).not.toBeInTheDocument()
    act(() => fail(new Error('boom')))
    expect(await screen.findByTestId('tape-row-101')).toBeInTheDocument()
  })

  it('boş oda bul: uygun odalar işaretlenir, işaret kaldırılabilir', async () => {
    const { transport } = await renderCalendar()
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    await screen.findByTestId('tape-row-101')
    await user.click(screen.getByRole('button', { name: 'Boş oda bul' }))
    const dialog = await screen.findByRole('dialog', { name: 'Boş oda bul' })
    await user.click(within(dialog).getByRole('button', { name: 'Odaları bul' }))
    const banner = await screen.findByTestId('free-banner')
    expect(banner).toHaveTextContent(/boş oda işaretlendi \(4 Eki – 5 Eki\)/)
    const call = transport.calls.find((c) => c.name === 'reservations.freeRooms')
    expect(call?.input).toMatchObject({ checkIn: '2026-10-04', checkOut: '2026-10-05', roomTypeId: null })
    expect(screen.getAllByLabelText('Uygun').length).toBeGreaterThan(0)
    await user.click(within(banner).getByRole('button', { name: 'İşareti kaldır' }))
    expect(screen.queryByTestId('free-banner')).not.toBeInTheDocument()
  })

  it('gün başlığına tıklayınca günün notları açılır; tek not eklenir ve görünür', async () => {
    const { transport } = await renderCalendar()
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const chart = await screen.findByTestId('tape-chart')
    await user.click(await within(chart).findByTestId('tape-day-2026-10-10'))
    const dialog = await screen.findByRole('dialog', { name: '10 Ekim 2026 Cumartesi' })
    expect(within(dialog).getByText('İstanbul Maratonu')).toBeInTheDocument()
    await user.type(within(dialog).getByLabelText('Başlık'), 'Fuar')
    await user.click(within(dialog).getByRole('button', { name: 'Not ekle' }))
    expect(await within(dialog).findByText('Fuar')).toBeInTheDocument()
    expect(transport.calls.find((c) => c.name === 'calendar.addNote')?.input).toEqual({
      title: 'Fuar',
      note: null,
      target: { mode: 'single', date: '2026-10-10' }
    })
  })

  it('toplu not: seçilen hafta günlerine tek seferde eklenir', async () => {
    const { transport } = await renderCalendar()
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    await screen.findByTestId('tape-row-101')
    await user.click(screen.getByRole('button', { name: 'Toplu not ekle' }))
    const dialog = await screen.findByRole('dialog', { name: 'Toplu not ekle' })
    // Starts on the screen's day (a Sunday) for four weeks: four Sundays.
    expect(within(dialog).getByTestId('bulk-count')).toHaveTextContent('4 gün seçildi')
    await user.type(within(dialog).getByLabelText('Başlık'), 'Kahvaltı salonu kapalı')
    await user.click(within(dialog).getByRole('button', { name: '4 güne ekle' }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Toplu not ekle' })).not.toBeInTheDocument()
    )
    expect(transport.calls.find((c) => c.name === 'calendar.addNote')?.input).toMatchObject({
      kind: 'note',
      title: 'Kahvaltı salonu kapalı',
      target: { mode: 'weekdays', from: '2026-10-04', to: '2026-10-31', weekdays: [0] }
    })
  })

  it('ileri düğmesi ızgarayı kaydırır ve yeni ayları okur', { timeout: 60_000 }, async () => {
    const { transport } = await renderCalendar()
    await screen.findByTestId('tape-row-101')
    const next = screen.getByRole('button', { name: 'Sonraki hafta' })
    for (let i = 0; i < 9; i++) fireEvent.click(next)
    await waitFor(() => expect(gridCalls(transport).map((c) => c.from)).toContain('2027-01-01'))
    expect(screen.getByTestId('tape-day-2026-12-06')).toBeInTheDocument()
  })

  it('açık arızası olan odanın satırında anahtar simgesi çıkar; ipucu arızaları sayar', async () => {
    await renderCalendar(demoHotel(DAY), {
      openIssues: [
        {
          roomId: 'room-102',
          roomNumber: '102',
          count: 2,
          severity: 'urgent',
          oldestReportedAt: '2026-10-01T08:00:00.000Z',
          blocksRoom: false,
          issues: [
            {
              id: 'iss-1',
              title: 'Klima su damlatıyor',
              severity: 'urgent',
              status: 'open',
              reportedAt: '2026-10-01T08:00:00.000Z',
              blocksRoom: false
            },
            {
              id: 'iss-2',
              title: 'Perde rayı gevşek',
              severity: 'low',
              status: 'planned',
              reportedAt: '2026-10-02T08:00:00.000Z',
              blocksRoom: false
            }
          ]
        }
      ]
    })
    const row = await screen.findByTestId('tape-row-102')
    const mark = await within(row).findByRole('img', { name: 'Açık arıza: 2' })
    expect(mark).toHaveAttribute('title', expect.stringContaining('Klima su damlatıyor'))
    expect(within(screen.getByTestId('tape-row-101')).queryByRole('img', { name: /Açık arıza/ })).toBeNull()
  })

  it('Odayı kapat: oda, günler, tür ve neden yazılır; satılmaz blok ızgarada çıkar', async () => {
    const { transport } = await renderCalendar()
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    await screen.findByTestId('tape-row-101')
    await user.click(screen.getByRole('button', { name: 'Odayı kapat' }))
    const dialog = await screen.findByRole('dialog', { name: 'Odayı satışa kapat' })
    await user.click(within(dialog).getByRole('button', { name: 'Odayı kapat' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Bir oda seçin.')
    act(() => within(dialog).getByRole('combobox', { name: 'Oda' }).focus())
    await user.keyboard('{ArrowDown}')
    await user.click(await screen.findByRole('option', { name: 'Oda 102' }))
    await user.type(within(dialog).getByLabelText('Neden'), 'Sahibin misafiri')
    await user.click(within(dialog).getByRole('button', { name: 'Odayı kapat' }))
    await waitFor(() =>
      expect(transport.calls.find((c) => c.name === 'reservations.createBlock')?.input).toEqual({
        roomId: 'room-102',
        dateFrom: '2026-10-04',
        dateTo: '2026-10-05',
        kind: 'oos',
        reason: 'Sahibin misafiri',
        note: null
      })
    )
    const chart = screen.getByTestId('tape-chart')
    expect(
      await within(chart).findByRole('button', { name: 'Satılmaz: Sahibin misafiri' })
    ).toBeInTheDocument()
  })

  it('kapalı odanın bloğuna tıklayınca bilgisi açılır; "Satışa aç" bloğu kaldırır', async () => {
    const { transport } = await renderCalendar()
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const chart = await screen.findByTestId('tape-chart')
    await user.click(await within(chart).findByRole('button', { name: 'Kullanım dışı: Boya ve nem tamiri' }))
    const dialog = await screen.findByRole('dialog', { name: 'Kapalı oda' })
    expect(within(dialog).getByText('Boya ve nem tamiri')).toBeInTheDocument()
    expect(within(dialog).getByText(/geçmiş günler kayıtta kalır/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Satışa aç' }))
    await waitFor(() =>
      expect(transport.calls.find((c) => c.name === 'reservations.cancelBlock')?.input).toEqual({
        id: 'block-1'
      })
    )
    await waitFor(() =>
      expect(
        within(chart).queryByRole('button', { name: 'Kullanım dışı: Boya ve nem tamiri' })
      ).not.toBeInTheDocument()
    )
  })

  it('muhasebe rolü takvimi görür ama toplu not düğmesini görmez', async () => {
    const hotel = demoHotel(DAY)
    const transport = calendarTransport(hotel)
    transport.auth.accounts.push({
      id: 'u-acc',
      username: 'muhasebe',
      displayName: 'Muhasebe',
      roleCode: 'accountant',
      password: 'x-sifre-123'
    })
    transport.auth.userId = 'u-acc'
    await renderWithProviders(<CalendarPage />, { source: source(hotel), transport })
    await screen.findByTestId('tape-row-101')
    expect(screen.queryByRole('button', { name: 'Toplu not ekle' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Odayı kapat' })).not.toBeInTheDocument()
  })

  it('yalnız görme yetkili rol "Yeni rezervasyon" düğmesini görmez; boş hücre, Enter ve N formu açmaz', async () => {
    const hotel = demoHotel(DAY)
    const transport = calendarTransport(hotel)
    transport.auth.accounts.push({
      id: 'u-acc',
      username: 'muhasebe',
      displayName: 'Muhasebe',
      roleCode: 'accountant',
      password: 'x-sifre-123'
    })
    transport.auth.userId = 'u-acc'
    await renderWithProviders(<CalendarPage />, { source: source(hotel), transport })
    const chart = await screen.findByTestId('tape-chart')
    await within(chart).findByTestId('tape-row-101')
    expect(screen.queryByRole('button', { name: 'Yeni rezervasyon' })).not.toBeInTheDocument()
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    act(() => chart.focus())
    // Room 102 today has no booking in the demo hotel: Enter and N would open the form.
    await user.keyboard('{ArrowDown}')
    await user.keyboard('{Enter}')
    await user.keyboard('n')
    expect(screen.queryByRole('dialog', { name: 'Yeni rezervasyon' })).not.toBeInTheDocument()
    // Drag-and-drop is off too (faz-15 madde 12): no hint, a dragged bar draws no target.
    expect(screen.queryByTestId('drag-hint')).not.toBeInTheDocument()
    const planned = hotel.reservations.find((r) => r.status === 'confirmed' && r.stays[0]!.checkIn > DAY)!
    const bar = within(chart).getByTestId(`stay-${planned.stays[0]!.id}`)
    fireEvent.pointerDown(bar, { button: 0, clientX: 100, clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(bar, { clientX: 100, clientY: 140, pointerId: 1 })
    expect(within(chart).queryByTestId('drag-ghost')).not.toBeInTheDocument()
  })
})

describe('takvim: aynı günde birden çok saatlik çubuk', () => {
  it('üç saatlik çubuk üst üste dizilir; metin sığmasa da her çubuk saat aralığını ve adı title ile aria-label olarak taşır', async () => {
    const hotel = demoHotel(DAY)
    const names = ['Ayşe Demir', 'Burak Kaya', 'Cem Aksoy']
    const ranges = [
      ['09:00', '10:00'],
      ['11:00', '12:00'],
      ['14:00', '15:30']
    ] as const
    await renderCalendar(hotel, {
      grid: async ({ from, to }) => {
        const grid = gridFromDemo(hotel, from, to)
        const base = grid.stays[0]!
        const hourly = names.map((guestName, i) => ({
          ...base,
          id: `hourly-${i}`,
          reservationId: `hourly-res-${i}`,
          roomId: 'room-102',
          checkIn: DAY,
          checkOut: DAY,
          dayUse: true,
          reservationStatus: 'confirmed' as const,
          stayStatus: 'planned' as const,
          guestName,
          startTime: ranges[i]![0],
          endTime: ranges[i]![1],
          nights: [{ date: DAY, pay: 'unpaid' as const, priceMinor: 90_000 }]
        }))
        return { ...grid, stays: [...grid.stays.filter((s) => s.roomId !== 'room-102'), ...hourly] }
      }
    })
    const chart = await screen.findByTestId('tape-chart')
    for (const [i, name] of names.entries()) {
      const bar = await within(chart).findByTestId('stay-hourly-' + i)
      const hours = `${ranges[i]![0]}–${ranges[i]![1]}`
      expect(bar.getAttribute('aria-label')).toContain(name)
      expect(bar.getAttribute('aria-label')).toContain(hours)
      expect(bar).toHaveAttribute('title', bar.getAttribute('aria-label')!)
    }
  })
})

describe('takvim telefonda (gün listesi)', () => {
  it('telefonda ızgara yerine gün listesi açılır; gelen, giden, kalan ve boş odalar gerçek veriden gelir', async () => {
    phone()
    const hotel = demoHotel(DAY)
    const guest = hotel.guests.find(
      (g) => g.id === hotel.reservations.find((r) => r.id === 'res-0432')!.guestId
    )!
    const withNote: DemoHotel = {
      ...hotel,
      guests: hotel.guests.map((g) =>
        g.id === guest.id ? { ...g, standingNote: 'Geç gelecek, 23:30 civarı', standingNoteLevel: 'info' } : g
      )
    }
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    await renderCalendar(withNote)
    const list = await screen.findByTestId('day-list')
    expect(screen.queryByTestId('tape-chart')).not.toBeInTheDocument()
    expect(await within(list).findByRole('heading', { name: /^Gelenler/ })).toBeInTheDocument()
    expect(within(list).getByText('Geç gelecek, 23:30 civarı')).toBeInTheDocument()
    expect(within(list).getByRole('heading', { name: /^Gidenler/ })).toBeInTheDocument()
    const grid = gridFromDemo(withNote, localDate('2026-10-03'), localDate('2026-10-05'))
    const busy = new Set(grid.stays.filter((s) => s.checkIn <= DAY && DAY < s.checkOut).map((s) => s.roomId))
    const free = withNote.rooms.filter((r) => !busy.has(r.id) && r.number !== '303')
    expect(within(list).getByRole('heading', { name: `${free.length} boş oda` })).toBeInTheDocument()
    // The main action is worded on the phone too.
    expect(screen.getByRole('button', { name: 'Yeni rezervasyon' })).toHaveTextContent('Yeni rezervasyon')
    await user.click(screen.getByRole('button', { name: 'Sonraki gün' }))
    expect(await within(list).findByText('Bugüne dön')).toBeInTheDocument()
  })

  it('kartına dokununca rezervasyon paneli açılır', async () => {
    phone()
    const { hotel, booking } = await renderCalendar()
    await aliasView(booking, 'res-0432', 'Maryam', 'Hosseini')
    const list = await screen.findByTestId('day-list')
    const card = await within(list).findByRole('button', { name: /Maryam Hosseini/ })
    fireEvent.click(card)
    expect(
      await within(await screen.findByTestId('reservation-panel')).findByText('Maryam Hosseini')
    ).toBeInTheDocument()
    expect(hotel.reservations.some((r) => r.id === 'res-0432')).toBe(true)
  })
})
