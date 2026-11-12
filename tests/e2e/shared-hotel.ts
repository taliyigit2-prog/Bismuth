// E2E helpers for a hotel shared between tests. The phone harness serves one hotel to every phone spec file and
// keeps it across retries, so a file must not count on "101 is free today" or "the only guest of that name": it asks
// the service which rooms are free for its own dates and, when too few are, adds rooms of its own (through the same
// `rooms.create` the settings screen uses); names it must find again carry a tag of the attempt. Nothing here
// exists in the app itself.
import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { api } from './bridge'

export interface RoomRef {
  id: string
  number: string
}

interface Options {
  today: string
  rooms: (RoomRef & { roomTypeId: string })[]
}

/** `YYYY-MM-DD` of the day `offset` days from `day` (calendar arithmetic, no time zone in play). */
export function shiftDay(day: string, offset: number): string {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + offset)
  return d.toISOString().slice(0, 10)
}

/** The hotel's today (`booking.options`), the day the screens call "today". */
export async function hotelToday(page: Page): Promise<string> {
  const res = await api<Options>(page, 'booking.options')
  expect(res.status, JSON.stringify(res.body)).toBe(200)
  return res.body.today
}

/**
 * `count` rooms with no stay and no block in the nights `[from, to)` (a same-day `from === to` means that day),
 * other than `exclude`. Rooms are added (numbers 9xx, from 2020 on, the type of the first room) when too few are
 * free, so the answer never depends on what other spec files or earlier attempts have written.
 */
export async function freeRooms(
  page: Page,
  from: string,
  to: string,
  count = 1,
  exclude: readonly string[] = []
): Promise<RoomRef[]> {
  const options = await api<Options>(page, 'booking.options')
  expect(options.status, JSON.stringify(options.body)).toBe(200)
  const busy = await api<{ occupied: string[]; blocked: string[]; notForSale: string[] }>(
    page,
    'booking.availability',
    { from, to }
  )
  expect(busy.status, JSON.stringify(busy.body)).toBe(200)
  const taken = new Set([...busy.body.occupied, ...busy.body.blocked, ...busy.body.notForSale, ...exclude])
  const picked: RoomRef[] = options.body.rooms
    .filter((r) => !taken.has(r.id))
    .slice(0, count)
    .map(({ id, number }) => ({ id, number }))
  const used = new Set(options.body.rooms.map((r) => r.number))
  const roomTypeId = options.body.rooms[0]!.roomTypeId
  for (let n = 901; picked.length < count; n++) {
    const number = String(n)
    if (used.has(number)) continue
    const created = await api<RoomRef>(page, 'rooms.create', {
      number,
      floor: '9',
      roomTypeId,
      beds: 2,
      sellable: true,
      validFrom: '2020-01-01'
    })
    expect(created.status, JSON.stringify(created.body)).toBe(200)
    used.add(number)
    picked.push({ id: created.body.id, number: created.body.number })
  }
  return picked
}

/** One free room for the nights `[from, to)`; see `freeRooms`. */
export async function freeRoom(page: Page, from: string, to: string, exclude: readonly string[] = []) {
  return (await freeRooms(page, from, to, 1, exclude))[0]!
}

/** A short word of letters only, new for each call (a name part that tells this attempt's records apart). */
export function runTag(): string {
  const n = Date.now() * 1000 + Math.floor(Math.random() * 1000)
  const word = n.toString(26).slice(-5)
  const letters = [...word].map((c) => 'abcdefghijklmnopqrstuvwxyz'[parseInt(c, 26)]!).join('')
  return letters.charAt(0).toUpperCase() + letters.slice(1)
}
