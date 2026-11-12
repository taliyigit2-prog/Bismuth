// E2E helper (P9c): a small hotel day through the API, the way the screens would write it — invented names only.
// 101: in the house since yesterday, the holder reported to KBS, "kızıl saçlı" Elif not yet; 102: arriving today
// (late arrival note); 103: should leave today (checked in); an urgent issue in 201; a special day today.
// `{ freeRooms: true }` (the phone harness, one hotel for every spec file): the three stays go into rooms free for
// their dates instead (added when too few are), and `numbers` says which; the desktop app starts from an empty hotel.
import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { api } from './bridge'
import { freeRoom } from './shared-hotel'

const dayOf = (offset: number): string => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

async function must<T>(page: Page, name: string, body: unknown = {}): Promise<T> {
  const res = await api<T>(page, name, body)
  expect(res.status, `${name}: ${JSON.stringify(res.body)}`).toBe(200)
  return res.body
}

export interface SeededDay {
  today: string
  /** Room id by number. */
  rooms: Record<string, string>
  /** Stay id by the room number it is in. */
  stays: Record<string, string>
  /** Room numbers by part: in the house (with Elif), arriving today, leaving today, the urgent issue. */
  numbers: { inHouse: string; arriving: string; leaving: string; issue: string }
}

export async function seedHotelDay(page: Page, opts: { freeRooms?: boolean } = {}): Promise<SeededDay> {
  const today = dayOf(0)
  const options = await must<{ rooms: { id: string; number: string }[] }>(page, 'booking.options')
  const rooms = Object.fromEntries(options.rooms.map((r) => [r.number, r.id]))
  const channels = await must<{ id: string }[]>(page, 'lists.list', { kind: 'salesChannels' })
  const channelId = channels[0]!.id
  const book = async (
    room: string,
    from: number,
    to: number,
    firstName: string,
    lastName: string,
    notes?: string
  ) =>
    must<{ reservation: { id: string }; stays: { id: string }[] }>(page, 'booking.create', {
      guest: { firstName, lastName },
      channelId,
      notes,
      stays: [{ roomId: rooms[room], checkIn: dayOf(from), checkOut: dayOf(to), nightlyPriceMinor: 280_000 }]
    })
  const numbers = { inHouse: '101', arriving: '102', leaving: '103', issue: '201' }
  if (opts.freeRooms) {
    const inHouse = await freeRoom(page, dayOf(-1), dayOf(2))
    const arriving = await freeRoom(page, dayOf(0), dayOf(2), [inHouse.id])
    const leaving = await freeRoom(page, dayOf(-1), dayOf(0), [inHouse.id, arriving.id])
    for (const r of [inHouse, arriving, leaving]) rooms[r.number] = r.id
    Object.assign(numbers, { inHouse: inHouse.number, arriving: arriving.number, leaving: leaving.number })
  }
  const a = await book(numbers.inHouse, -1, 2, 'Ahmet', 'Yılmaz')
  const stay101 = a.stays[0]!.id
  await must(page, 'booking.checkIn', { stayId: stay101 })
  const view = await must<{ stays: { id: string; occupants: { id: string }[] }[] }>(page, 'booking.get', {
    id: a.reservation.id
  })
  const holder = view.stays.find((s) => s.id === stay101)?.occupants[0]
  if (holder) await must(page, 'inHouse.markKbs', { occupantId: holder.id, mark: 'reported' })
  await must(page, 'inHouse.addPerson', {
    stayId: stay101,
    fullName: 'Elif Yılmaz',
    descriptorNote: 'Kızıl saçlı, gözlüklü'
  })
  const b = await book(numbers.arriving, 0, 2, 'Maryam', 'Hosseini', 'Geç gelecek, 23:30 civarı')
  const c = await book(numbers.leaving, -1, 0, 'Carlos', 'Ruiz')
  await must(page, 'booking.checkIn', { stayId: c.stays[0]!.id })
  await must(page, 'housekeeping.reportIssue', {
    roomId: rooms[numbers.issue],
    title: 'Tavandan su damlıyor',
    severity: 'urgent'
  })
  await must(page, 'calendarNotes.add', {
    kind: 'special',
    title: 'Kongre haftası',
    note: 'Kahvaltı 06:30',
    target: { mode: 'single', date: today }
  })
  return {
    today,
    rooms,
    stays: {
      [numbers.inHouse]: stay101,
      [numbers.arriving]: b.stays[0]!.id,
      [numbers.leaving]: c.stays[0]!.id
    },
    numbers
  }
}
