import { beforeAll, describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FAKE_ACCOUNTS, renderWithProviders } from '@/test/render'
import { bookingTransport, type BookingTransport } from './booking-fake'
import { ReservationPanel } from './reservation-panel'

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})

/** A three-night reservation in room 101 (2.800 a night) written through the fake. */
async function seeded(transport: BookingTransport): Promise<string> {
  const view = (await transport.call('booking.create', {
    guest: { firstName: 'Ayşe', lastName: 'Örnek' },
    channelId: 'ch-direct',
    stays: [{ roomId: 'room-101', checkIn: '2026-10-04', checkOut: '2026-10-07', nightlyPriceMinor: 280_000 }]
  })) as { reservation: { id: string } }
  return view.reservation.id
}

describe('rezervasyon paneli', () => {
  it('ödeme girilince geceler anında ödendi rengine döner ve bakiye düşer', async () => {
    const transport = bookingTransport()
    const id = await seeded(transport)
    const user = userEvent.setup()
    await renderWithProviders(<ReservationPanel reservation={{ id }} onOpenChange={() => undefined} />, {
      transport
    })
    const panel = await screen.findByTestId('reservation-panel')
    expect(await within(panel).findByTestId('panel-guest')).toHaveTextContent('Ayşe Örnek')
    await user.click(within(panel).getByRole('tab', { name: 'Geceler' }))
    expect(within(panel).getByTestId('paint-2026-10-04')).toHaveAttribute('data-paint', 'unpaid')
    await user.click(within(panel).getByTestId('panel-pay'))
    // The amount starts as the balance (3 × 2.800).
    expect(await screen.findByLabelText('Tutar')).toHaveValue('8.400')
    await user.clear(screen.getByLabelText('Tutar'))
    await user.type(screen.getByLabelText('Tutar'), '3.000')
    await user.click(screen.getByTestId('pay-kind-deposit'))
    await user.click(screen.getByTestId('payment-save'))
    await waitFor(() =>
      expect(within(panel).getByTestId('paint-2026-10-04')).toHaveAttribute('data-paint', 'paid')
    )
    expect(within(panel).getByTestId('paint-2026-10-05')).toHaveAttribute('data-paint', 'partial')
    expect(within(panel).getByTestId('paint-2026-10-06')).toHaveAttribute('data-paint', 'unpaid')
    expect(transport.callsTo('booking.addPayment')[0]).toMatchObject({
      reservationId: id,
      kind: 'deposit',
      amountMinor: 300_000,
      currency: 'TRY',
      methodId: 'm-cash',
      channelId: 'ch-direct'
    })
    await user.click(within(panel).getByRole('tab', { name: 'Para' }))
    expect(within(panel).getByTestId('folio-balance')).toHaveTextContent('₺5.400')
  })

  it('internetsiz yazılmış döviz ödemesinde "Eski kur" rozeti ve kurun saati görünür (S-32)', async () => {
    const transport = bookingTransport()
    const id = await seeded(transport)
    const view = transport.booking.views[id]!
    const line = {
      date: view.stays[0]!.checkIn,
      kind: 'payment' as const,
      methodId: 'm-cash',
      channelId: null,
      currency: 'EUR',
      amountFolioMinor: 350_000,
      voided: false,
      collected: false,
      reference: null,
      note: null,
      createdAt: '2026-10-04T10:00:00.000Z'
    }
    view.payments = [
      {
        ...line,
        id: 'p-old',
        amountMinor: 10_000,
        rateStale: true,
        rateObservedAt: '2026-10-03T06:30:00.000Z'
      },
      {
        ...line,
        id: 'p-new',
        amountMinor: 5_000,
        rateStale: false,
        rateObservedAt: '2026-10-04T09:58:00.000Z'
      }
    ]
    const user = userEvent.setup()
    await renderWithProviders(<ReservationPanel reservation={{ id }} onOpenChange={() => undefined} />, {
      transport
    })
    const panel = await screen.findByTestId('reservation-panel')
    await user.click(await within(panel).findByRole('tab', { name: 'Para' }))
    const badges = within(panel).getAllByTestId('payment-old-rate')
    expect(badges).toHaveLength(1)
    expect(badges[0]).toHaveTextContent('Eski kur')
    expect(badges[0]).toHaveAttribute('title', expect.stringMatching(/^Kur 0?3\.10\.2026 \d\d:30 tarihli/))
  })

  it('KBS bildirilmemiş kişi başlıkta uyarı simgesi ve uyarı kutusu verir; işaretlenince kalkar', async () => {
    const transport = bookingTransport()
    const id = await seeded(transport)
    const stay = transport.booking.views[id]!.stays[0]!
    stay.status = 'in_house'
    stay.checkedInAt = '2026-10-04T12:00:00.000Z'
    stay.occupants = [
      {
        id: 'o-1',
        guestId: null,
        fullName: 'Ayşe Örnek',
        isPrimary: true,
        descriptorNote: null,
        arrivedAt: '2026-10-04T12:00:00.000Z',
        leftAt: null,
        kbsReportedAt: '2026-10-04T12:05:00.000Z',
        kbsCheckoutAt: null
      },
      {
        id: 'o-2',
        guestId: null,
        fullName: 'Bora Örnek',
        isPrimary: false,
        descriptorNote: 'kızıl saçlı',
        arrivedAt: '2026-10-04T13:00:00.000Z',
        leftAt: null,
        kbsReportedAt: null,
        kbsCheckoutAt: null
      }
    ]
    stay.kbsIssues = [{ occupantId: 'o-2', fullName: 'Bora Örnek', kind: 'checkin' }]
    const user = userEvent.setup()
    await renderWithProviders(<ReservationPanel reservation={{ id }} onOpenChange={() => undefined} />, {
      transport
    })
    const panel = await screen.findByTestId('reservation-panel')
    expect(await within(panel).findByTestId('panel-kbs-warning')).toHaveTextContent('KBS eksik: 1')
    expect(within(panel).getByTestId('panel-kbs-alert')).toHaveTextContent(
      "Bora Örnek (oda 101): KBS'ye bildirilmedi."
    )
    expect(within(panel).getByTestId('panel-check-out')).toBeInTheDocument()
    await user.click(within(panel).getByRole('tab', { name: /Kişiler/ }))
    await user.click(within(panel).getByRole('button', { name: "KBS'ye bildirdim" }))
    await waitFor(() => expect(within(panel).queryByTestId('panel-kbs-warning')).not.toBeInTheDocument())
    expect(transport.callsTo('booking.markKbs')).toEqual([{ occupantId: 'o-2', mark: 'reported' }])
  })

  it('çıkışta KBS çıkışı işaretlenmeyen kişi uyarı olarak adıyla çıkar', async () => {
    const transport = bookingTransport()
    const id = await seeded(transport)
    const stay = transport.booking.views[id]!.stays[0]!
    stay.status = 'in_house'
    stay.occupants = [
      {
        id: 'o-1',
        guestId: null,
        fullName: 'Ayşe Örnek',
        isPrimary: true,
        descriptorNote: null,
        arrivedAt: null,
        leftAt: null,
        kbsReportedAt: '2026-10-04T12:05:00.000Z',
        kbsCheckoutAt: null
      }
    ]
    const user = userEvent.setup()
    await renderWithProviders(<ReservationPanel reservation={{ id }} onOpenChange={() => undefined} />, {
      transport
    })
    await user.click(await screen.findByTestId('panel-check-out'))
    expect(await screen.findByTestId('checkout-kbs-warning')).toHaveTextContent(
      'Ayşe Örnek: KBS çıkışı yapılmadı.'
    )
    await user.click(within(screen.getByTestId('checkout-person-o-1')).getByRole('checkbox'))
    expect(screen.queryByTestId('checkout-kbs-warning')).not.toBeInTheDocument()
  })

  it('Resepsiyon iade türünü görmez (iade yetkisi yok); sahip görür', async () => {
    const transport = bookingTransport({ fake: { signedIn: 'u-deniz', accounts: FAKE_ACCOUNTS } })
    const id = await seeded(transport)
    const user = userEvent.setup()
    await renderWithProviders(<ReservationPanel reservation={{ id }} onOpenChange={() => undefined} />, {
      transport
    })
    await user.click(await screen.findByTestId('panel-pay'))
    expect(await screen.findByTestId('pay-kind-deposit')).toBeInTheDocument()
    expect(screen.queryByTestId('pay-kind-refund')).not.toBeInTheDocument()
  })

  it('varışı daha gelmemiş rezervasyonda "Gelmedi olarak işaretle" seçeneği kapalıdır (QA3c1 #3)', async () => {
    const transport = bookingTransport()
    const view = (await transport.call('booking.create', {
      guest: { firstName: 'Ayşe', lastName: 'Örnek' },
      channelId: 'ch-direct',
      stays: [
        { roomId: 'room-101', checkIn: '2099-10-04', checkOut: '2099-10-07', nightlyPriceMinor: 280_000 }
      ]
    })) as { reservation: { id: string } }
    const user = userEvent.setup()
    await renderWithProviders(
      <ReservationPanel reservation={{ id: view.reservation.id }} onOpenChange={() => undefined} />,
      { transport }
    )
    await user.click(await screen.findByTestId('panel-more'))
    expect(await screen.findByTestId('panel-no-show')).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByTestId('panel-park')).not.toHaveAttribute('aria-disabled')
  })

  it('başka odaya taşı listesinde o geceler dolu olan oda "dolu" diye işaretlenir ve seçilemez (QA3c1 #13)', async () => {
    const transport = bookingTransport({ state: { taken: { occupied: ['room-102'], blocked: [] } } })
    const id = await seeded(transport)
    const user = userEvent.setup()
    await renderWithProviders(<ReservationPanel reservation={{ id }} onOpenChange={() => undefined} />, {
      transport
    })
    const panel = await screen.findByTestId('reservation-panel')
    await user.click(await within(panel).findByRole('tab', { name: 'Geceler' }))
    await user.click(await within(panel).findByRole('combobox', { name: 'Başka odaya taşı' }))
    const taken = await screen.findByRole('option', { name: /102.*dolu/ })
    expect(taken).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('option', { name: /^101/ })).not.toHaveAttribute('aria-disabled', 'true')
  })

  it('çıkışı girişe eşitlemek sorusuz gündüz kullanımına çevirmez; onay sorulur (QA3c1 #14)', async () => {
    const transport = bookingTransport()
    const id = await seeded(transport)
    const user = userEvent.setup()
    await renderWithProviders(<ReservationPanel reservation={{ id }} onOpenChange={() => undefined} />, {
      transport
    })
    const panel = await screen.findByTestId('reservation-panel')
    await user.click(await within(panel).findByRole('tab', { name: 'Geceler' }))
    await user.click(within(panel).getByRole('button', { name: /^Çıkış/ }))
    await user.click(await screen.findByRole('gridcell', { name: /^4 Ekim 2026/ }))
    await user.click(within(panel).getByTestId('stay-save-dates'))
    const ask = await screen.findByTestId('day-use-ask')
    expect(ask).toHaveTextContent('Aynı gün giriş‑çıkışa çevrilsin mi?')
    expect(transport.callsTo('booking.changeDates')).toEqual([])
    await user.click(within(ask).getByRole('button', { name: 'Vazgeç' }))
    expect(transport.callsTo('booking.changeDates')).toEqual([])
  })

  it('rezervasyon okunamazsa panel hata ve yeniden dene gösterir', async () => {
    const transport = bookingTransport()
    await renderWithProviders(
      <ReservationPanel reservation={{ id: 'yok' }} onOpenChange={() => undefined} />,
      {
        transport
      }
    )
    const panel = await screen.findByTestId('reservation-panel')
    expect(await within(panel).findByRole('alert')).toHaveTextContent('Kayıt bulunamadı')
  })
})
