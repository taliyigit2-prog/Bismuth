import { beforeAll, describe, expect, it } from 'vitest'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders, type FakeAccount } from '@/test/render'
import { bookingTransport, type BookingTransport } from './booking-fake'
import { requestGroupPanel } from './booking-api'
import { GroupPanel } from './group-panel'

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})

const ACCOUNTANT: FakeAccount = {
  id: 'u-muh',
  username: 'muhasebe',
  displayName: 'Muhasebe Örnek',
  roleCode: 'accountant',
  password: 'muhasebe-sifre'
}

/** A three-room group (rooms 101, 102, 103) with a guest name per room, written through the fake. */
async function seededGroup(transport: BookingTransport, checkIn = '2026-10-04', checkOut = '2026-10-06') {
  const rooms = transport.booking.options.rooms
  rooms.push({ ...rooms[1]!, id: 'room-103', number: '103' })
  const view = (await transport.call('booking.createGroup', {
    name: 'Örnek tur grubu',
    leader: { firstName: 'Deniz', lastName: 'Lider' },
    channelId: 'ch-direct',
    rooms: ['room-101', 'room-102', 'room-103'].map((roomId, i) => ({
      stay: { roomId, checkIn, checkOut, nightlyPriceMinor: 200_000 },
      ...(i < 2 ? { guest: { firstName: ['Ayşe', 'Can'][i]!, lastName: 'Örnek' } } : {})
    }))
  })) as { id: string }
  return view.id
}

async function openPanel(
  transport: BookingTransport,
  id: string,
  onOpenReservation?: (reservationId: string) => void
) {
  await renderWithProviders(<GroupPanel onOpenReservation={onOpenReservation} />, { transport })
  act(() => requestGroupPanel(id))
  return screen.findByTestId('group-panel')
}

describe('grup paneli', () => {
  it('odaları oda başına misafir adıyla, grup adı ve hesap kipiyle gösterir', async () => {
    const transport = bookingTransport()
    const panel = await openPanel(transport, await seededGroup(transport))
    expect(await within(panel).findByTestId('group-name')).toHaveTextContent('Örnek tur grubu')
    expect(within(panel).getByTestId('group-folio-mode')).toHaveTextContent('Tek hesap')
    expect(within(panel).getByTestId('group-guest-101')).toHaveTextContent('Ayşe Örnek')
    expect(within(panel).getByTestId('group-guest-102')).toHaveTextContent('Can Örnek')
    expect(within(panel).getByTestId('group-guest-103')).toHaveTextContent('Deniz Lider')
  })

  it('toplu giriş seçili tüm odaları tek istekte giriş yaptırır', async () => {
    const transport = bookingTransport()
    const id = await seededGroup(transport)
    const user = userEvent.setup()
    const panel = await openPanel(transport, id)
    const button = await within(panel).findByTestId('group-check-in')
    expect(button).toHaveTextContent('Toplu giriş (3)')
    await user.click(button)
    await waitFor(() => expect(transport.callsTo('booking.checkInMany')).toHaveLength(1))
    expect(transport.callsTo('booking.checkInMany')[0]).toMatchObject({ groupId: id })
    expect((transport.callsTo('booking.checkInMany')[0] as { stayIds: string[] }).stayIds).toHaveLength(3)
    await waitFor(() => expect(within(panel).getByTestId('group-check-out')).toHaveTextContent('(3)'))
    expect(within(panel).getByTestId('group-check-in')).toBeDisabled()
  })

  it('bir oda işaretini kaldırınca toplu giriş yalnız kalan odalar için gider', async () => {
    const transport = bookingTransport()
    const id = await seededGroup(transport)
    const user = userEvent.setup()
    const panel = await openPanel(transport, id)
    await user.click(await within(panel).findByTestId('group-pick-102'))
    expect(within(panel).getByTestId('group-check-in')).toHaveTextContent('(2)')
    await user.click(within(panel).getByTestId('group-check-in'))
    await waitFor(() => expect(transport.callsTo('booking.checkInMany')).toHaveLength(1))
    expect((transport.callsTo('booking.checkInMany')[0] as { stayIds: string[] }).stayIds).toHaveLength(2)
  })

  it('biri başarısız olunca hiçbir oda değişmez ve panel eski durumda kalır', async () => {
    const transport = bookingTransport()
    const id = await seededGroup(transport)
    // The service refuses the whole request when one room cannot be checked in: the fake does the same.
    const stay = transport.booking.views[Object.keys(transport.booking.views)[2]!]!.stays[0]!
    stay.status = 'in_house'
    const panel = await openPanel(transport, id)
    const button = await within(panel).findByTestId('group-check-in')
    expect(button).toHaveTextContent('(2)')
    // Tick the in-house room's partner state back to a mixed request through the transport: nothing is written.
    await expect(
      transport.call('booking.checkInMany', {
        groupId: id,
        stayIds: Object.values(transport.booking.views).flatMap((v) => v.stays.map((s) => s.id))
      })
    ).rejects.toMatchObject({ messageKey: 'errors.invalidStayState' })
    expect(
      Object.values(transport.booking.views).filter((v) => v.stays[0]!.status === 'in_house')
    ).toHaveLength(1)
  })

  it('giriş günü gelmemiş odalar seçilemez ve nedeni yazılır', async () => {
    const transport = bookingTransport()
    const panel = await openPanel(transport, await seededGroup(transport, '2099-01-01', '2099-01-03'))
    expect(await within(panel).findByTestId('group-pick-101')).toBeDisabled()
    expect(within(panel).getAllByText(/Giriş günü henüz değil/)).toHaveLength(3)
    expect(within(panel).getByTestId('group-check-in')).toBeDisabled()
  })

  it('toplu not tüm odalara eklenir ve panelde listelenir', async () => {
    const transport = bookingTransport()
    const id = await seededGroup(transport)
    const user = userEvent.setup()
    const panel = await openPanel(transport, id)
    await user.click(await within(panel).findByTestId('group-note-open'))
    await user.type(await screen.findByTestId('group-note-text'), 'Bitişik oda istiyorlar')
    await user.click(screen.getByTestId('group-note-save'))
    await waitFor(() => expect(transport.callsTo('booking.addGroupNote')).toHaveLength(1))
    expect(transport.callsTo('booking.addGroupNote')[0]).toEqual({
      groupId: id,
      text: 'Bitişik oda istiyorlar'
    })
    expect(await within(panel).findByText('Bitişik oda istiyorlar')).toBeInTheDocument()
  })

  it('grup iptali neden ister, sonra grubu kapalı gösterir', async () => {
    const transport = bookingTransport()
    const id = await seededGroup(transport)
    const user = userEvent.setup()
    const panel = await openPanel(transport, id)
    await user.click(await within(panel).findByTestId('group-cancel-open'))
    await user.click(await screen.findByTestId('group-cancel-confirm'))
    expect(transport.callsTo('booking.cancelGroup')).toHaveLength(0)
    await user.type(screen.getByTestId('group-cancel-reason'), 'Grup vazgeçti')
    await user.click(screen.getByTestId('group-cancel-confirm'))
    await waitFor(() => expect(transport.callsTo('booking.cancelGroup')).toHaveLength(1))
    expect(transport.callsTo('booking.cancelGroup')[0]).toEqual({ groupId: id, reason: 'Grup vazgeçti' })
    expect(await within(panel).findByText('Grup iptal edildi', { selector: 'span' })).toBeInTheDocument()
    expect(within(panel).queryByTestId('group-check-in')).not.toBeInTheDocument()
  })

  it('yalnız görme yetkisi olan rolde toplu işlem düğmeleri görünmez (muhasebeci)', async () => {
    const transport = bookingTransport()
    transport.auth.accounts.push(ACCOUNTANT)
    transport.auth.userId = ACCOUNTANT.id
    const panel = await openPanel(transport, await seededGroup(transport))
    expect(await within(panel).findByTestId('group-name')).toBeInTheDocument()
    // The rights arrive with the signed-in user: until then nothing is hidden.
    await waitFor(() => expect(within(panel).queryByTestId('group-check-in')).not.toBeInTheDocument())
    for (const testId of ['group-check-out', 'group-note-open', 'group-cancel-open'])
      expect(within(panel).queryByTestId(testId)).not.toBeInTheDocument()
    expect(within(panel).queryByTestId('group-pick-101')).toBeDisabled()
  })

  it('oda satırındaki "Rezervasyonu aç" grup panelini kapatır ve o rezervasyonu açtırır', async () => {
    const transport = bookingTransport()
    const id = await seededGroup(transport)
    const opened: string[] = []
    const user = userEvent.setup()
    const panel = await openPanel(transport, id, (reservationId) => opened.push(reservationId))
    const first = Object.keys(transport.booking.views)[0]!
    await user.click(await within(panel).findByTestId(`group-open-${first}`))
    expect(opened).toEqual([first])
    await waitFor(() => expect(screen.queryByTestId('group-panel')).not.toBeInTheDocument())
  })

  it('tek hesap kipinde "Grup ödemesi al" tutarı gruba bir adımda öder; bakiye sıfırlanır (S-106)', async () => {
    const transport = bookingTransport()
    const id = await seededGroup(transport)
    const user = userEvent.setup()
    const panel = await openPanel(transport, id)
    expect(await within(panel).findByTestId('group-balance')).toHaveTextContent('12.000')
    await user.click(await within(panel).findByTestId('group-pay-open'))
    const dialog = await screen.findByRole('dialog', { name: 'Grup ödemesi' })
    await user.click(within(dialog).getByTestId('group-pay-save'))
    await waitFor(() => expect(transport.callsTo('booking.payGroup')).toHaveLength(1))
    const sent = transport.callsTo('booking.payGroup')[0] as { groupId: string; amountMinor: number }
    expect(sent.groupId).toBe(id)
    // Three rooms, two nights at 2.000 each.
    expect(sent.amountMinor).toBe(1_200_000)
    await waitFor(() => expect(within(panel).getByTestId('group-balance')).toHaveTextContent('₺0'))
    await waitFor(() => expect(within(panel).queryByTestId('group-pay-open')).not.toBeInTheDocument())
  })

  it('grup ödemesi açık bakiyeden fazla tutarı istek göndermeden reddeder', async () => {
    const transport = bookingTransport()
    const panel = await openPanel(transport, await seededGroup(transport))
    const user = userEvent.setup()
    await user.click(await within(panel).findByTestId('group-pay-open'))
    const dialog = await screen.findByRole('dialog', { name: 'Grup ödemesi' })
    const amount = within(dialog).getByRole('textbox', { name: 'Tutar' })
    await user.clear(amount)
    await user.type(amount, '99999')
    await user.click(within(dialog).getByTestId('group-pay-save'))
    expect(await within(dialog).findByText(/açık bakiyeyi/)).toBeInTheDocument()
    expect(transport.callsTo('booking.payGroup')).toHaveLength(0)
  })

  it('oda başına hesap kipinde her odanın bakiyesi satırında görünür, grup ödemesi düğmesi çıkmaz', async () => {
    const transport = bookingTransport()
    const id = await seededGroup(transport)
    transport.booking.groups![id]!.folioMode = 'per_room'
    const panel = await openPanel(transport, id)
    const first = Object.keys(transport.booking.views)[0]!
    expect(await within(panel).findByTestId(`group-room-balance-${first}`)).toHaveTextContent(
      /^Bakiye: .*4\.000/
    )
    expect(within(panel).queryByTestId('group-pay-open')).not.toBeInTheDocument()
    expect(within(panel).getByTestId(`group-room-pay-${first}`)).toBeInTheDocument()
  })
})
