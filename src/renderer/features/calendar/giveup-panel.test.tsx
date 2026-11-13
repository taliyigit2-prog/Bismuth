// P17a (K-55): the panel's three-dot menu by reservation state, "Vazgeçme ve iade", the cancel window that shows
// what was collected, and the refund after a same-day check-out. The fake transport stands for the service.
import { beforeAll, describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { addDays, localDateOf } from '@shared/date'
import { FAKE_ACCOUNTS, renderWithProviders } from '@/test/render'
import { bookingTransport, type BookingTransport } from './booking-fake'
import { ReservationPanel } from './reservation-panel'

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})

const today = localDateOf(new Date())

type Status = 'tentative' | 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled' | 'no_show' | 'parked'

/** A two-night reservation in room 101 (2.800 a night), with `paid` taken as a deposit when given. */
async function seeded(transport: BookingTransport, paid = 0): Promise<string> {
  const view = (await transport.call('booking.create', {
    guest: { firstName: 'Ayşe', lastName: 'Örnek' },
    channelId: 'ch-direct',
    stays: [{ roomId: 'room-101', checkIn: today, checkOut: addDays(today, 2), nightlyPriceMinor: 280_000 }]
  })) as { reservation: { id: string } }
  const id = view.reservation.id
  if (paid)
    await transport.call('booking.addPayment', {
      reservationId: id,
      date: today,
      kind: 'deposit',
      methodId: 'm-cash',
      amountMinor: paid,
      currency: 'TRY'
    })
  return id
}

/** Puts the reservation into `status`; "in house" = the stay is in the room since now. */
function put(transport: BookingTransport, id: string, status: Status, stay: 'planned' | 'in_house' | 'done') {
  const view = transport.booking.views[id]!
  view.reservation.status = status
  const s = view.stays[0]!
  s.status = stay
  s.checkedInAt = stay === 'planned' ? null : new Date().toISOString()
}

const open = async (transport: BookingTransport, id: string) => {
  const user = userEvent.setup()
  await renderWithProviders(<ReservationPanel reservation={{ id }} onOpenChange={() => undefined} />, {
    transport
  })
  await screen.findByTestId('panel-guest')
  return user
}

const menuState = () => ({
  park: !!screen.queryByTestId('panel-park'),
  noShow: !!screen.queryByTestId('panel-no-show'),
  giveUp: !!screen.queryByTestId('panel-giveup'),
  cancel: !!screen.queryByTestId('panel-cancel'),
  refund: !!screen.queryByTestId('panel-refund'),
  history: !!screen.queryByTestId('panel-history'),
  note: !!screen.queryByTestId('panel-note')
})

const OPEN = { giveUp: false, refund: false, history: false, note: false }
const CLOSED = {
  park: false,
  noShow: false,
  giveUp: false,
  cancel: false,
  refund: true,
  history: true,
  note: true
}

describe('üç nokta menüsü: durum × menü (K-55)', () => {
  it.each<[string, Status, 'planned' | 'in_house' | 'done', Record<string, boolean>]>([
    ['ön kayıt', 'tentative', 'planned', { ...OPEN, park: true, noShow: true, cancel: true }],
    ['kesin', 'confirmed', 'planned', { ...OPEN, park: true, noShow: true, cancel: true }],
    [
      'giriş yaptı, oda dolu',
      'checked_in',
      'in_house',
      { ...OPEN, park: false, noShow: false, cancel: false, giveUp: true }
    ],
    ['çıkış yaptı', 'checked_out', 'done', CLOSED],
    ['iptal edildi', 'cancelled', 'planned', CLOSED],
    ['gelmedi', 'no_show', 'planned', CLOSED],
    ['park edilmiş', 'parked', 'planned', { ...OPEN, park: false, noShow: true, cancel: true, giveUp: false }]
  ])('%s: menü beklenen satırları gösterir', async (_name, status, stay, expected) => {
    const transport = bookingTransport()
    const id = await seeded(transport, 100_000)
    put(transport, id, status, stay)
    const user = await open(transport, id)
    await user.click(await screen.findByTestId('panel-more'))
    await screen.findByRole('menu')
    expect(menuState()).toEqual({
      park: false,
      noShow: false,
      cancel: false,
      ...expected
    })
  })

  it('tahsilatı olmayan kapalı rezervasyonda "İade gir" çıkmaz ama menü Geçmiş ve Not ile durur', async () => {
    const transport = bookingTransport()
    const id = await seeded(transport)
    put(transport, id, 'checked_out', 'done')
    const user = await open(transport, id)
    await user.click(await screen.findByTestId('panel-more'))
    await screen.findByRole('menu')
    expect(menuState()).toMatchObject({ refund: false, history: true, note: true })
  })

  it('"İade gir" iade türüyle ve tahsilat tutarıyla ödeme penceresini açar', async () => {
    const transport = bookingTransport()
    const id = await seeded(transport, 100_000)
    put(transport, id, 'checked_out', 'done')
    const user = await open(transport, id)
    await user.click(await screen.findByTestId('panel-more'))
    await user.click(await screen.findByTestId('panel-refund'))
    expect(await screen.findByLabelText('Tutar')).toHaveValue('1.000')
    expect(screen.getByTestId('pay-kind-refund')).toHaveAttribute('data-state', 'on')
    await user.click(screen.getByTestId('payment-save'))
    await waitFor(() =>
      expect(transport.callsTo('booking.addPayment').at(-1)).toMatchObject({
        kind: 'refund',
        amountMinor: 100_000
      })
    )
  })
})

describe('Vazgeçme ve iade', () => {
  it('üç seçenek sunulur; girişi geri al + iptal: önce geri alır, sonra iadeli iptal eder', async () => {
    const transport = bookingTransport()
    const id = await seeded(transport, 100_000)
    put(transport, id, 'checked_in', 'in_house')
    const stayId = transport.booking.views[id]!.stays[0]!.id
    const user = await open(transport, id)
    await user.click(await screen.findByTestId('panel-more'))
    await user.click(await screen.findByTestId('panel-giveup'))
    expect(await screen.findByTestId('giveup-sameDay')).toBeInTheDocument()
    expect(screen.getByTestId('giveup-undo')).toBeInTheDocument()
    expect(screen.getByTestId('giveup-early')).toBeInTheDocument()
    await user.click(within(screen.getByTestId('giveup-undo')).getByRole('radio'))
    await user.type(screen.getByLabelText('İptal nedeni'), 'odayı beğenmedi')
    expect(screen.getByTestId('money-collected')).toHaveTextContent('₺1.000')
    await user.click(screen.getByTestId('giveup-confirm'))
    await waitFor(() => expect(transport.callsTo('booking.cancel')).toHaveLength(1))
    expect(transport.callsTo('booking.undoCheckIn')).toEqual([{ stayId, reason: 'odayı beğenmedi' }])
    expect(transport.callsTo('booking.cancel')[0]).toMatchObject({
      id,
      reason: 'odayı beğenmedi',
      refund: { mode: 'refund', amountMinor: 100_000, currency: 'TRY' }
    })
    expect(transport.booking.views[id]!.reservation.status).toBe('cancelled')
    expect(transport.booking.views[id]!.folio.creditedMinor).toBe(0)
  })

  it('Resepsiyon (girişi geri alma yetkisi yok): o seçenek kapalı, aynı gün çıkış açık; çıkıştan sonra iade penceresi açılır', async () => {
    const transport = bookingTransport({ fake: { signedIn: 'u-deniz', accounts: FAKE_ACCOUNTS } })
    const id = await seeded(transport, 100_000)
    put(transport, id, 'checked_in', 'in_house')
    const user = await open(transport, id)
    await user.click(await screen.findByTestId('panel-more'))
    await user.click(await screen.findByTestId('panel-giveup'))
    expect(within(await screen.findByTestId('giveup-undo')).getByRole('radio')).toBeDisabled()
    expect(within(screen.getByTestId('giveup-sameDay')).getByRole('radio')).toBeEnabled()
    await user.click(screen.getByTestId('giveup-confirm'))
    await user.click(await screen.findByTestId('checkout-confirm'))
    await waitFor(() => expect(transport.callsTo('booking.checkOut')).toHaveLength(1))
    // The refund window opens next, on "İade", with what was collected.
    expect(await screen.findByLabelText('Tutar')).toHaveValue('1.000')
    expect(screen.getByTestId('pay-kind-refund')).toHaveAttribute('data-state', 'on')
  })

  it('geri alma günü geçmişse (dünkü giriş) "girişi geri al" kapalıdır', async () => {
    const transport = bookingTransport()
    const id = await seeded(transport)
    put(transport, id, 'checked_in', 'in_house')
    transport.booking.views[id]!.stays[0]!.checkedInAt = new Date(Date.now() - 36 * 3_600_000).toISOString()
    const user = await open(transport, id)
    await user.click(await screen.findByTestId('panel-more'))
    await user.click(await screen.findByTestId('panel-giveup'))
    const undo = await screen.findByTestId('giveup-undo')
    expect(within(undo).getByRole('radio')).toBeDisabled()
    expect(undo).toHaveTextContent('Giriş yapılan günden sonra geri alınamaz.')
  })
})

describe('iptal penceresi: tahsilat varsa tutar ve üç seçenek', () => {
  const openCancel = async (transport: BookingTransport, id: string) => {
    const user = await open(transport, id)
    await user.click(await screen.findByTestId('panel-more'))
    await user.click(await screen.findByTestId('panel-cancel'))
    await screen.findByTestId('money-choice')
    return user
  }

  it('tutarı gösterir; "İade gir" seçiliyken iptal iade satırıyla gider', async () => {
    const transport = bookingTransport()
    const id = await seeded(transport, 150_000)
    transport.booking.views[id]!.reservation.status = 'confirmed'
    const user = await openCancel(transport, id)
    expect(screen.getByTestId('money-collected')).toHaveTextContent('₺1.500')
    // The owner may refund: "İade bekliyor" is not offered to him (S-100).
    expect(screen.getByTestId('money-refund')).toBeInTheDocument()
    expect(screen.getByTestId('money-keep')).toBeInTheDocument()
    expect(screen.queryByTestId('money-park')).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('İptal nedeni'), 'plan değişti')
    await user.click(screen.getByTestId('cancel-confirm'))
    await waitFor(() => expect(transport.callsTo('booking.cancel')).toHaveLength(1))
    expect(transport.callsTo('booking.cancel')[0]).toMatchObject({
      id,
      refund: { mode: 'refund', amountMinor: 150_000, methodId: 'm-cash' }
    })
  })

  it('tahsilattan fazla iade yazılırsa gönderilmez', async () => {
    const transport = bookingTransport()
    const id = await seeded(transport, 150_000)
    const user = await openCancel(transport, id)
    await user.type(screen.getByLabelText('İptal nedeni'), 'plan değişti')
    await user.clear(screen.getByLabelText('İade tutarı'))
    await user.type(screen.getByLabelText('İade tutarı'), '2.000')
    await user.click(screen.getByTestId('cancel-confirm'))
    expect(await screen.findByText('İade, alınan tutarı geçemez.')).toBeInTheDocument()
    expect(transport.callsTo('booking.cancel')).toEqual([])
  })

  it('iade yetkisi kapalı Resepsiyon üç seçeneği görür: "İade gir" kapalı; "İade bekliyor olarak park et" iptal yerine park eder', async () => {
    const noRefund = { ...FAKE_ACCOUNTS[1]!, permissionOverrides: { 'payments.refund': 'none' as const } }
    const transport = bookingTransport({ fake: { signedIn: 'u-deniz', accounts: [noRefund] } })
    const id = await seeded(transport, 150_000)
    const user = await openCancel(transport, id)
    expect(within(screen.getByTestId('money-refund')).getByRole('radio')).toBeDisabled()
    expect(screen.getByTestId('money-refund')).toHaveTextContent('İade yetkiniz yok.')
    await user.click(within(screen.getByTestId('money-park')).getByRole('radio'))
    await user.type(screen.getByLabelText('İptal nedeni'), 'iade için müdür')
    await user.click(screen.getByTestId('cancel-confirm'))
    await waitFor(() => expect(transport.callsTo('booking.park')).toHaveLength(1))
    expect(transport.callsTo('booking.park')[0]).toMatchObject({
      id,
      park: { reason: 'refund_pending', note: 'iade için müdür' }
    })
    expect(transport.callsTo('booking.cancel')).toEqual([])
  })

  it('"Tahsilat kalsın" nedensiz gönderilmez; nedenle iptal eder', async () => {
    const transport = bookingTransport()
    const id = await seeded(transport, 150_000)
    const user = await openCancel(transport, id)
    await user.click(within(screen.getByTestId('money-keep')).getByRole('radio'))
    await user.type(screen.getByLabelText('İptal nedeni'), 'plan değişti')
    await user.click(screen.getByTestId('cancel-confirm'))
    expect(await screen.findByText('Nedeni yazın.')).toBeInTheDocument()
    expect(transport.callsTo('booking.cancel')).toEqual([])
    await user.type(screen.getByLabelText('Neden (örn. iptal bedeli)'), 'iptal bedeli')
    await user.click(screen.getByTestId('cancel-confirm'))
    await waitFor(() => expect(transport.callsTo('booking.cancel')).toHaveLength(1))
    expect(transport.callsTo('booking.cancel')[0]).toMatchObject({
      refund: { mode: 'keep', note: 'iptal bedeli' }
    })
  })

  it('tahsilat yoksa para seçimi çıkmaz', async () => {
    const transport = bookingTransport()
    const id = await seeded(transport)
    const user = await open(transport, id)
    await user.click(await screen.findByTestId('panel-more'))
    await user.click(await screen.findByTestId('panel-cancel'))
    await screen.findByLabelText('İptal nedeni')
    expect(screen.queryByTestId('money-choice')).not.toBeInTheDocument()
  })
})
