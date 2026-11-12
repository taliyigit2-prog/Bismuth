// The room list of the reservation form with a whole hotel in it (19 rooms, the first customer's size): every room
// is in one scrolling list whose height is limited on the scrolling element itself. The limit used to sit on the
// ScrollArea root, which does not clip: past about six rooms the list ran off the popover and off a phone's screen.
import { describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/render'
import { defaultBookingState } from './booking-fake'
import { RoomMultiPicker } from './room-multi-picker'

const template = defaultBookingState().options.rooms[0]!
const numbers = [
  ...['101', '102', '103', '104', '105'],
  ...['201', '202', '203', '204', '205'],
  ...['301', '302', '303', '304', '305'],
  ...['401', '402', '403', '404']
]
const rooms = numbers.map((number) => ({
  ...template,
  id: `room-${number}`,
  number,
  floor: number.charAt(0)
}))

describe('oda seçici', () => {
  it('19 oda tek kaydırılan listede; yükseklik sınırı kaydırılan öğede, son oda seçilebilir', async () => {
    const picked: string[][] = []
    await renderWithProviders(
      <RoomMultiPicker
        rooms={rooms}
        value={[]}
        onChange={(ids) => picked.push(ids)}
        occupied={new Set()}
        blocked={new Set()}
        label="Odalar"
      />
    )
    const user = userEvent.setup()
    await user.click(await screen.findByTestId('room-multi-picker'))
    const list = await screen.findByTestId('room-multi-picker-list')
    const viewport = list.querySelector<HTMLElement>(':scope > [data-slot="scroll-area-viewport"]')
    expect(viewport).not.toBeNull()
    expect(within(viewport!).getAllByRole('checkbox')).toHaveLength(19)
    // The limit is set for the viewport (Radix makes it the scrolling element), not on the root, which only grows.
    const classes = list.className.split(/\s+/)
    expect(classes.some((c) => c.startsWith('[&>[data-slot=scroll-area-viewport]]:max-h-'))).toBe(true)
    expect(classes.some((c) => c.startsWith('max-h-'))).toBe(false)
    await user.click(within(screen.getByTestId('room-option-404')).getByRole('checkbox'))
    expect(picked.at(-1)).toEqual(['room-404'])
  })
})
