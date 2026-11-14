// Hourly stays on the calendar screens (K-48, P17d): the sale dialog (room, day, hours, the typed amount with the room
// type's hour price only suggested, a clash and the cleaning-gap warning), the check-out dialog's same-day price (H-06),
// the panel showing the hours and the people who stayed, and the cancel dialog not stealing the phone's keyboard.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { localDate, today as todayOf } from '@shared/date'
import { renderWithProviders } from '@/test/render'
import { bookingTransport, type BookingTransport } from './booking-fake'
import { HourlyStayDialog } from './hourly-stay-dialog'
import { ReservationPanel } from './reservation-panel'
import { CancelDialog, CheckoutDialog } from './stay-dialogs'

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})
afterEach(() => vi.restoreAllMocks())

const DAY = localDate('2026-10-05')

async function openDialog(transport: BookingTransport, roomId: string | null = null) {
  await renderWithProviders(
    <HourlyStayDialog seed={{ roomId, date: DAY }} onOpenChange={() => undefined} />,
    { transport }
  )
  await screen.findByTestId('hourly-room')
  return userEvent.setup()
}

async function pickRoom(user: ReturnType<typeof userEvent.setup>, number: string) {
  await user.click(screen.getByTestId('hourly-room'))
  await user.click(await screen.findByRole('option', { name: new RegExp(`^${number}`) }))
}

async function fill(user: ReturnType<typeof userEvent.setup>, start: string, end: string) {
  await user.type(screen.getByTestId('hourly-first'), 'Selin')
  await user.type(screen.getByTestId('hourly-last'), 'Aksoy')
  await user.type(screen.getByTestId('hourly-start'), start)
  await user.type(screen.getByTestId('hourly-end'), end)
}

describe('saatlik satış penceresi', () => {
  it('oda tipinin saat ücreti × süre tutar olarak önerilir ve kaydedilen tutar olur', async () => {
    const transport = bookingTransport()
    const user = await openDialog(transport, 'room-101')
    await fill(user, '1000', '1230')
    // 30.000 per hour × 2,5 hours.
    await waitFor(() => expect(screen.getByTestId('hourly-suggestion')).toHaveTextContent('₺750'))
    await user.click(screen.getByTestId('hourly-save'))
    await waitFor(() => expect(transport.callsTo('booking.createHourlyStay')).toHaveLength(1))
    expect(transport.callsTo('booking.createHourlyStay')[0]).toMatchObject({
      roomId: 'room-101',
      date: DAY,
      startTime: '10:00',
      endTime: '12:30',
      priceMinor: 75_000,
      guest: { firstName: 'Selin', lastName: 'Aksoy' }
    })
  })

  it('saat ücreti olmayan oda tipinde tutar zorunludur: boş bırakılınca kayıt gitmez', async () => {
    const transport = bookingTransport()
    const user = await openDialog(transport)
    await pickRoom(user, '102')
    await fill(user, '0900', '1100')
    await waitFor(() => expect(screen.getByTestId('hourly-suggestion')).toHaveTextContent('saat ücreti yok'))
    await user.click(screen.getByTestId('hourly-save'))
    expect(await screen.findByTestId('hourly-error')).toHaveTextContent('Tutarı yazın.')
    expect(transport.callsTo('booking.createHourlyStay')).toHaveLength(0)
    await user.type(screen.getByRole('textbox', { name: /Tutar/ }), '900')
    await user.click(screen.getByTestId('hourly-save'))
    await waitFor(() => expect(transport.callsTo('booking.createHourlyStay')).toHaveLength(1))
    expect(transport.callsTo('booking.createHourlyStay')[0]).toMatchObject({
      roomId: 'room-102',
      priceMinor: 90_000
    })
  })

  it('bitiş başlangıçtan önceyse uyarı çıkar ve hizmet sorgulanmaz', async () => {
    const transport = bookingTransport()
    const user = await openDialog(transport, 'room-101')
    await fill(user, '1500', '1000')
    expect(await screen.findByTestId('hourly-bad-range')).toHaveTextContent('Bitiş saati başlangıçtan sonra')
    expect(transport.callsTo('booking.hourlyCheck')).toHaveLength(0)
  })

  it('çakışan saatler çakışan aralığı söyler', async () => {
    const transport = bookingTransport({
      state: { hourly: { taken: true, hours: ['09:00–12:00'] } }
    })
    const user = await openDialog(transport, 'room-101')
    await fill(user, '1100', '1300')
    const taken = await screen.findByTestId('hourly-taken')
    expect(taken).toHaveTextContent('Oda 101 bu saatlerde dolu: 09:00–12:00')
  })

  it('temizlik arası uyarısı kaydı engellemez', async () => {
    const transport = bookingTransport({
      state: {
        hourly: { warnings: [{ startTime: '09:00', endTime: '12:00', gapMinutes: 30 }], turnoverMinutes: 60 }
      }
    })
    const user = await openDialog(transport, 'room-101')
    await fill(user, '1230', '1400')
    expect(await screen.findByTestId('hourly-turnover')).toHaveTextContent(
      'arada 30 dk var; temizlik için 60 dk'
    )
    await user.click(screen.getByTestId('hourly-save'))
    await waitFor(() => expect(transport.callsTo('booking.createHourlyStay')).toHaveLength(1))
  })
})

async function hourlyView(transport: BookingTransport) {
  const view = (await transport.call('booking.createHourlyStay', {
    guest: { firstName: 'Selin', lastName: 'Aksoy' },
    channelId: 'ch-direct',
    roomId: 'room-101',
    date: todayOf(),
    startTime: '10:00',
    endTime: '13:00',
    priceMinor: 90_000
  })) as { reservation: { id: string }; stays: { id: string }[] }
  return view
}

describe('rezervasyon paneli: saatler ve kişi sayısı', () => {
  it('saatlik kayıt panelin özetinde saatleriyle görünür', async () => {
    const transport = bookingTransport()
    const view = await hourlyView(transport)
    await renderWithProviders(
      <ReservationPanel reservation={{ id: view.reservation.id }} onOpenChange={() => undefined} />,
      { transport }
    )
    expect(await screen.findByTestId('panel-hours')).toHaveTextContent('10:00–13:00')
  })

  it('çıkıştan sonra özet "0 kişi" değil, kalan kişilerin sayısını söyler', async () => {
    const transport = bookingTransport()
    const view = await hourlyView(transport)
    const stored = transport.booking.views[view.reservation.id]!
    stored.stays[0]!.status = 'done'
    stored.stays[0]!.occupants = [
      {
        id: 'o1',
        guestId: null,
        fullName: 'Selin Aksoy',
        isPrimary: true,
        descriptorNote: null,
        arrivedAt: '2026-10-05T07:00:00.000Z',
        leftAt: '2026-10-05T10:00:00.000Z',
        kbsReportedAt: null,
        kbsCheckoutAt: null
      }
    ]
    await renderWithProviders(
      <ReservationPanel reservation={{ id: view.reservation.id }} onOpenChange={() => undefined} />,
      { transport }
    )
    await screen.findByTestId('panel-hours')
    expect(screen.queryByText('0 kişi')).not.toBeInTheDocument()
    expect(screen.getByText('1 kişi')).toBeInTheDocument()
  })
})

describe('çıkış penceresi: aynı gün ücreti (H-06)', () => {
  async function inHouse(sameDay: unknown) {
    const transport = bookingTransport()
    const created = (await transport.call('booking.create', {
      guest: { firstName: 'Ayşe', lastName: 'Örnek' },
      channelId: 'ch-direct',
      stays: [
        {
          roomId: 'room-101',
          checkIn: todayOf(),
          checkOut: localDate('2099-01-01'),
          nightlyPriceMinor: 280_000
        }
      ]
    })) as { reservation: { id: string } }
    const stored = transport.booking.views[created.reservation.id]!
    const stay = stored.stays[0]!
    stay.status = 'in_house'
    stay.sameDay = sameDay as typeof stay.sameDay
    await renderWithProviders(
      <CheckoutDialog stay={stay} open onOpenChange={() => undefined} currency="TRY" />,
      { transport }
    )
    return { transport, user: userEvent.setup(), stay }
  }

  it('varsayılan tutar saat ücretinden gelir ve kullanılan saatler gösterilir', async () => {
    const { transport, user } = await inHouse({
      startTime: '10:00',
      endTime: '12:00',
      suggestedMinor: 60_000
    })
    const field = await screen.findByRole('textbox', { name: /Aynı gün/ })
    expect(field).toHaveValue('600')
    expect(screen.getByTestId('checkout-dayuse-suggested')).toHaveTextContent('₺600')
    expect(screen.getByTestId('checkout-dayuse')).toHaveTextContent('10:00–12:00')
    await user.click(screen.getByTestId('checkout-confirm'))
    await waitFor(() => expect(transport.callsTo('booking.checkOut')).toHaveLength(1))
    expect(transport.callsTo('booking.checkOut')[0]).toMatchObject({ dayUsePriceMinor: 60_000 })
    expect(transport.callsTo('booking.checkOut')[0]).not.toHaveProperty('dayUseFreeConfirmed')
  })

  it('0 yazılırsa onay kutusu çıkar; onaysız çıkış gitmez, onayla gider', async () => {
    const { transport, user } = await inHouse({
      startTime: '10:00',
      endTime: '12:00',
      suggestedMinor: 60_000
    })
    const field = await screen.findByRole('textbox', { name: /Aynı gün/ })
    await user.clear(field)
    await user.type(field, '0')
    await user.click(screen.getByTestId('checkout-confirm'))
    expect(await screen.findByTestId('checkout-free-error')).toBeInTheDocument()
    expect(transport.callsTo('booking.checkOut')).toHaveLength(0)
    await user.click(screen.getByTestId('checkout-free-confirm'))
    await user.click(screen.getByTestId('checkout-confirm'))
    await waitFor(() => expect(transport.callsTo('booking.checkOut')).toHaveLength(1))
    expect(transport.callsTo('booking.checkOut')[0]).toMatchObject({
      dayUsePriceMinor: 0,
      dayUseFreeConfirmed: true
    })
  })

  it('gündüz yuvası doluysa (sameDay yok) ücret alanı gizlenir ve tutar gönderilmez', async () => {
    const { transport, user } = await inHouse(null)
    await screen.findByTestId('checkout-confirm')
    expect(screen.queryByTestId('checkout-dayuse')).not.toBeInTheDocument()
    await user.click(screen.getByTestId('checkout-confirm'))
    await waitFor(() => expect(transport.callsTo('booking.checkOut')).toHaveLength(1))
    expect(transport.callsTo('booking.checkOut')[0]).not.toHaveProperty('dayUsePriceMinor')
  })
})

describe('iptal penceresi telefonda', () => {
  const phone = (): void => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches: query === 'screen' || query.includes('max-width'),
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

  it('açılınca odak neden alanına gitmez, klavye iade seçeneklerini kapatmaz', async () => {
    phone()
    const transport = bookingTransport()
    await renderWithProviders(
      <CancelDialog
        reservationId="res-x"
        open
        onOpenChange={() => undefined}
        collectedMinor={200_000}
        currency="TRY"
      />,
      { transport }
    )
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('textbox', { name: /İptal nedeni/ })).toBeInTheDocument()
    expect(document.activeElement?.tagName).not.toBe('TEXTAREA')
    expect(document.activeElement?.tagName).not.toBe('INPUT')
  })
})
