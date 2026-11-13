// Early bug hunt fixes on the calendar screens (P5fix): the blacklist tick belongs to one person, "yine de" with a
// reason for a blocked room, the check-out dialog's freed nights (K-44), cancel one room, no-show from the park
// area, the balance hidden without the payments right, the guest card link, a person on the blacklist in a room.
import { beforeAll, describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { addDays, localDate, today as todayOf } from '@shared/date'
import { renderWithProviders } from '@/test/render'
import { guestCardRequest } from '@/features/guests/guest-card-request'
import { bookingTransport, type BookingTransport } from './booking-fake'
import { NewReservationDialog } from './new-reservation-dialog'
import { OccupantsEditor } from './occupants-editor'
import { ParkArea } from './park-area'
import { ReservationPanel } from './reservation-panel'
import { CheckoutDialog } from './stay-dialogs'

const FRIDAY = localDate('2026-10-02')

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})

async function openNew(transport: BookingTransport, roomId: string | null = 'room-101') {
  await renderWithProviders(
    <NewReservationDialog
      seed={{ roomId, date: FRIDAY }}
      onOpenChange={() => undefined}
      onCreated={() => undefined}
    />,
    { transport }
  )
  await screen.findByTestId('room-multi-picker')
  return userEvent.setup()
}

async function newGuest(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.click(screen.getByRole('combobox', { name: 'Misafir' }))
  const search = await screen.findByPlaceholderText('Ad ya da telefon…')
  await user.clear(search)
  await user.type(search, text)
  await user.click(await screen.findByText(`Yeni misafir: ${text}`))
}

async function created(
  transport: BookingTransport,
  stays: { roomId: string; checkIn: string; checkOut: string }[]
) {
  const view = (await transport.call('booking.create', {
    guest: { firstName: 'Ayşe', lastName: 'Örnek' },
    channelId: 'ch-direct',
    stays: stays.map((s) => ({ ...s, nightlyPriceMinor: 280_000 }))
  })) as { reservation: { id: string } }
  return view.reservation.id
}

describe('yeni rezervasyon formu (P5fix #10, #21, #22, #25)', () => {
  it('#10 kara liste onayı o kişiye aittir: misafir değişip geri gelince kutu boş gelir', async () => {
    const transport = bookingTransport({
      state: { blacklist: [{ id: 'bl-1', name: 'Sorunlu Kisi', severity: 'warn', reasonText: 'Borç' }] }
    })
    const user = await openNew(transport)
    await newGuest(user, 'sorunlu kisi')
    const confirm = within(await screen.findByTestId('blacklist-warning')).getByTestId('blacklist-confirm')
    await user.click(confirm)
    expect(confirm).toBeChecked()
    await newGuest(user, 'baska biri')
    await waitFor(() => expect(screen.queryByTestId('blacklist-warning')).not.toBeInTheDocument())
    await newGuest(user, 'sorunlu kisi')
    expect(
      within(await screen.findByTestId('blacklist-warning')).getByTestId('blacklist-confirm')
    ).not.toBeChecked()
  })

  it('#21 cuma gecesi hafta sonu fiyatı alır (ayar: pricing.weekendNights)', async () => {
    const transport = bookingTransport()
    await openNew(transport)
    expect(screen.getByTestId('suggested-price')).toHaveTextContent('₺3.200')
  })

  it('#22 blok yetkilisi satışa kapalı odayı seçer; gerekçe yazmadan kaydedemez, gerekçe kayda gider', async () => {
    const transport = bookingTransport({ state: { taken: { occupied: [], blocked: ['room-102'] } } })
    const user = await openNew(transport, null)
    await newGuest(user, 'Elif Kaya')
    await user.click(screen.getByTestId('room-multi-picker'))
    const option = await screen.findByTestId('room-option-102')
    expect(option).toHaveTextContent('Satışa kapalı')
    await user.click(within(option).getByRole('checkbox'))
    await user.keyboard('{Escape}')
    await user.click(screen.getByTestId('new-reservation-save'))
    expect(await screen.findByTestId('new-reservation-error')).toHaveTextContent(
      'Satışa kapalı oda için gerekçe yazın'
    )
    await user.type(within(screen.getByTestId('override-reason')).getByRole('textbox'), 'Sahibin misafiri')
    await user.click(screen.getByTestId('new-reservation-save'))
    await waitFor(() => expect(transport.callsTo('booking.create')).toHaveLength(1))
    expect(transport.callsTo('booking.create')[0]).toMatchObject({ overrideBlockReason: 'Sahibin misafiri' })
  })

  it('#25 satılmayan oda seçicide etiketiyle görünür; seçilince gerekçe ister', async () => {
    const transport = bookingTransport()
    transport.booking.options.rooms[1]!.sellable = false
    const user = await openNew(transport, null)
    await user.click(screen.getByTestId('room-multi-picker'))
    const option = await screen.findByTestId('room-option-102')
    expect(option).toHaveTextContent('Satılmaz')
    await user.click(within(option).getByRole('checkbox'))
    await user.keyboard('{Escape}')
    expect(await screen.findByTestId('override-reason')).toBeInTheDocument()
  })
})

describe('çıkış penceresi (P5fix #2, K-44)', () => {
  it('giriş günü ayrılan misafir için ilk gecenin gündüz kullanımı olacağını ve boşalan geceyi söyler; ücret değişir', async () => {
    const transport = bookingTransport()
    const today = todayOf()
    const id = await created(transport, [{ roomId: 'room-101', checkIn: today, checkOut: addDays(today, 2) }])
    // The view says the day slot is free (the service's `sameDay`), so the same-day price field is offered.
    const stay = {
      ...transport.booking.views[id]!.stays[0]!,
      status: 'in_house' as const,
      sameDay: { startTime: null, endTime: null, suggestedMinor: null }
    }
    const user = userEvent.setup()
    await renderWithProviders(
      <CheckoutDialog stay={stay} currency="TRY" open onOpenChange={() => undefined} />,
      { transport }
    )
    const release = await screen.findByTestId('checkout-release')
    expect(release).toHaveTextContent('ilk gece aynı gün giriş‑çıkış olarak kalır')
    expect(release).toHaveTextContent('1 gece boşalacak')
    const price = screen.getByLabelText('Aynı gün giriş‑çıkış ücreti')
    expect(price).toHaveValue('2.800')
    await user.clear(price)
    await user.type(price, '1.500')
    await user.click(screen.getByTestId('checkout-confirm'))
    await waitFor(() => expect(transport.callsTo('booking.checkOut')).toHaveLength(1))
    expect(transport.callsTo('booking.checkOut')[0]).toMatchObject({
      stayId: stay.id,
      dayUsePriceMinor: 150_000
    })
  })
})

describe('rezervasyon paneli (P5fix #8, #16, #23)', () => {
  it('#8 bir odası çıkış yapmış rezervasyonun ileri tarihli odası tek başına iptal edilir', async () => {
    const transport = bookingTransport()
    const id = await created(transport, [
      { roomId: 'room-101', checkIn: '2026-10-01', checkOut: '2026-10-02' },
      { roomId: 'room-102', checkIn: '2026-10-08', checkOut: '2026-10-10' }
    ])
    const view = transport.booking.views[id]!
    view.reservation.status = 'checked_in'
    view.stays[0]!.status = 'done'
    const user = userEvent.setup()
    await renderWithProviders(<ReservationPanel reservation={{ id }} onOpenChange={() => undefined} />, {
      transport
    })
    await user.click(await screen.findByTestId('panel-more'))
    expect(screen.queryByRole('menuitem', { name: 'Park et' })).not.toBeInTheDocument()
    await user.click(await screen.findByRole('menuitem', { name: 'Oda 102: iptal et' }))
    const dialog = await screen.findByRole('dialog', { name: 'Oda 102 iptal edilsin mi?' })
    await user.type(within(dialog).getByLabelText('İptal nedeni'), 'ikinci oda gerekmedi')
    await user.click(within(dialog).getByTestId('cancel-stay-confirm'))
    await waitFor(() => expect(transport.callsTo('booking.cancelStay')).toHaveLength(1))
    expect(transport.callsTo('booking.cancelStay')[0]).toEqual({
      stayId: view.stays[1]!.id,
      reason: 'ikinci oda gerekmedi'
    })
  })

  it('#16 ödemeleri göremeyen kullanıcı bakiye ve tahsilat görmez; #23 geçmiş kartı panelin kendi rezervasyonunu dışlar ve misafir kartını açar', async () => {
    const transport = bookingTransport()
    const id = await created(transport, [
      { roomId: 'room-101', checkIn: '2026-10-04', checkOut: '2026-10-06' }
    ])
    const view = transport.booking.views[id]!
    view.payments = null
    view.folio.creditedMinor = null
    view.folio.balanceMinor = null
    transport.booking.guests.push({ id: view.guest.id, firstName: 'Ayşe', lastName: 'Örnek', phone: null })
    const user = userEvent.setup()
    await renderWithProviders(<ReservationPanel reservation={{ id }} onOpenChange={() => undefined} />, {
      transport
    })
    expect(await screen.findByTestId('panel-balance')).toHaveTextContent('—')
    await user.click(screen.getByRole('tab', { name: 'Para' }))
    expect(screen.getByTestId('folio-charges')).toBeInTheDocument()
    expect(screen.queryByTestId('folio-balance')).not.toBeInTheDocument()
    expect(screen.queryByTestId('folio-credited')).not.toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: 'Özet' }))
    await user.click(await screen.findByTestId('open-guest-card'))
    expect(guestCardRequest()).toBe(view.guest.id)
    expect(transport.callsTo('booking.guestSummary')[0]).toEqual({
      guestId: view.guest.id,
      excludeReservationId: id
    })
  })
})

describe('park alanı (P5fix #7)', () => {
  it('park edilen rezervasyon park alanından "gelmedi" olarak kapatılır', async () => {
    const transport = bookingTransport()
    const id = await created(transport, [
      { roomId: 'room-101', checkIn: '2026-10-04', checkOut: '2026-10-06' }
    ])
    transport.booking.views[id]!.reservation.status = 'parked'
    transport.booking.parked = [
      {
        id,
        code: 'R-2026-000009',
        guestName: 'Ayşe Örnek',
        parkedReason: 'no_show_paid',
        parkedNote: null,
        currency: 'TRY',
        creditedMinor: 100_000,
        stays: [],
        lastNightlyMinor: 280_000,
        parkedAt: '2026-10-04T09:00:00.000Z'
      }
    ]
    const user = userEvent.setup()
    await renderWithProviders(<ParkArea />, { transport })
    await user.click(await screen.findByTestId('parked-more-R-2026-000009'))
    await user.click(await screen.findByRole('menuitem', { name: 'Gelmedi olarak işaretle' }))
    await user.click(await screen.findByTestId('no-show-confirm'))
    await waitFor(() => expect(transport.callsTo('booking.noShow')).toEqual([{ id }]))
    await waitFor(() => expect(screen.queryByTestId('parked-R-2026-000009')).not.toBeInTheDocument())
  })
})

describe('odaya kişi ekleme (P5fix #11)', () => {
  it('kara listedeki kişi kırmızı uyarı verir; kutu işaretlenmeden eklenmez, işaretlenince onayla eklenir', async () => {
    const transport = bookingTransport({
      state: { blacklist: [{ id: 'bl-1', name: 'Kara Kişi', severity: 'warn', reasonText: 'Borç' }] }
    })
    const id = await created(transport, [
      { roomId: 'room-101', checkIn: '2026-10-04', checkOut: '2026-10-06' }
    ])
    const stay = transport.booking.views[id]!.stays[0]!
    const user = userEvent.setup()
    await renderWithProviders(<OccupantsEditor stay={stay} editable />, { transport })
    await user.type(await screen.findByTestId('person-name'), 'Kara Kişi')
    await user.click(screen.getByRole('button', { name: 'Kişi ekle' }))
    const warning = await screen.findByTestId('blacklist-warning')
    expect(screen.getByRole('button', { name: 'Kişi ekle' })).toBeDisabled()
    await user.click(within(warning).getByTestId('blacklist-confirm'))
    await user.click(screen.getByRole('button', { name: 'Kişi ekle' }))
    await waitFor(() => expect(transport.callsTo('booking.addOccupant')).toHaveLength(2))
    expect(transport.callsTo('booking.addOccupant')[1]).toMatchObject({ blacklistConfirmed: true })
  })
})
