import { beforeAll, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { localDate } from '@shared/date'
import { renderWithProviders } from '@/test/render'
import { bookingTransport } from './booking-fake'
import { NewReservationDialog } from './new-reservation-dialog'

beforeAll(() => {
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
})

async function open() {
  const transport = bookingTransport()
  const onCreated = vi.fn()
  await renderWithProviders(
    <NewReservationDialog
      seed={{ roomId: 'room-101', date: localDate('2026-10-02') }}
      onOpenChange={() => undefined}
      onCreated={onCreated}
    />,
    { transport }
  )
  await screen.findByTestId('room-multi-picker')
  return { transport, onCreated, user: userEvent.setup() }
}

async function newGuest(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole('combobox', { name: 'Misafir' }))
  await user.type(await screen.findByPlaceholderText('Ad ya da telefon…'), name)
  await user.click(await screen.findByText(`Yeni misafir: ${name}`))
}

async function addRoom(user: ReturnType<typeof userEvent.setup>, number: string) {
  await user.click(screen.getByTestId('room-multi-picker'))
  await user.click(within(await screen.findByTestId(`room-option-${number}`)).getByRole('checkbox'))
  await user.keyboard('{Escape}')
}

describe('yeni rezervasyon: grup rezervasyonu seçeneği', () => {
  it('tek odada grup seçeneği çıkmaz; ikinci oda seçilince çıkar ve oda başına ad alanı açılır', async () => {
    const { user } = await open()
    expect(screen.queryByTestId('group-fieldset')).not.toBeInTheDocument()
    await addRoom(user, '102')
    expect(await screen.findByTestId('group-fieldset')).toBeInTheDocument()
    expect(screen.queryByTestId('group-name-input')).not.toBeInTheDocument()
    await user.click(screen.getByTestId('group-toggle'))
    expect(screen.getByTestId('group-name-input')).toBeInTheDocument()
    expect(screen.getByTestId('group-room-guest-101')).toBeInTheDocument()
    expect(screen.getByTestId('group-room-guest-102')).toBeInTheDocument()
    // Chosen rooms are also badges that can be taken off again (21st.dev A5).
    expect(screen.getByTestId('room-chip-102')).toHaveAccessibleName('Oda 102 seçimini kaldır')
  })

  it('grup adı yazılmadan kaydedilmez; yazılınca grup tek istekle oda başına adlarla gider', async () => {
    const { user, transport, onCreated } = await open()
    await newGuest(user, 'Deniz Lider')
    await addRoom(user, '102')
    await user.click(screen.getByTestId('group-toggle'))
    await user.type(screen.getByTestId('group-room-guest-101'), 'Ayşe Örnek')
    await user.click(screen.getByTestId('new-reservation-save'))
    expect(await screen.findByText('Grubun adını yazın.')).toBeInTheDocument()
    expect(transport.callsTo('booking.createGroup')).toHaveLength(0)
    await user.type(screen.getByTestId('group-name-input'), 'Örnek tur grubu')
    await user.click(screen.getByTestId('new-reservation-save'))
    await waitFor(() => expect(transport.callsTo('booking.createGroup')).toHaveLength(1))
    expect(transport.callsTo('booking.create')).toHaveLength(0)
    const [input] = transport.callsTo('booking.createGroup') as {
      name: string
      leader: unknown
      rooms: { stay: { roomId: string }; guest?: unknown }[]
    }[]
    expect(input?.name).toBe('Örnek tur grubu')
    expect(input?.leader).toMatchObject({ firstName: 'Deniz', lastName: 'Lider' })
    expect(input?.rooms.map((r) => r.stay.roomId)).toEqual(['room-101', 'room-102'])
    expect(input?.rooms[0]?.guest).toEqual({ firstName: 'Ayşe', lastName: 'Örnek' })
    // A room left without a name takes the leader: no guest is sent.
    expect(input?.rooms[1]).not.toHaveProperty('guest')
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('res-2'))
  })

  it('grup işaretlenmezse çok odalı rezervasyon eskisi gibi tek rezervasyon olarak gider', async () => {
    const { user, transport } = await open()
    await newGuest(user, 'Elif Kaya')
    await addRoom(user, '102')
    await user.click(screen.getByTestId('new-reservation-save'))
    await waitFor(() => expect(transport.callsTo('booking.create')).toHaveLength(1))
    expect(transport.callsTo('booking.createGroup')).toHaveLength(0)
  })
})
