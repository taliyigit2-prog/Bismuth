// The calendar on the phone (faz-05: "mobilde takvim yerine gün/oda listesi"): the day list over HTTP, read from
// the same `reservations.grid` service as the desktop grid. The phone specs share one hotel, so this file books its
// own arrival into a room free tonight and checks the counts against what the service answers for today.
import { expect, test } from '@playwright/test'
import { api } from '../bridge'
import { freeRoom, hotelToday, shiftDay } from '../shared-hotel'

interface GridPage {
  rooms: { id: string; number: string; sellable: boolean }[]
  stays: { roomId: string; checkIn: string; checkOut: string; dayUse: boolean }[]
  blocks: { roomId: string; dateFrom: string; dateTo: string }[]
}

test.describe('takvim telefonda (390×844)', () => {
  test('ızgara yerine gün listesi açılır; gün okları günü değiştirir; yatay kaydırma yok', async ({
    page
  }) => {
    await page.goto('/#/calendar')
    await page.getByTestId('app-ready').waitFor({ state: 'attached' })
    const today = await hotelToday(page)
    const room = await freeRoom(page, today, shiftDay(today, 1))
    const options = (await api<{ channels: { id: string }[] }>(page, 'booking.options')).body
    const created = await api(page, 'booking.create', {
      guest: { firstName: 'Takvim', lastName: 'Gelen' },
      channelId: options.channels[0]!.id,
      stays: [{ roomId: room.id, checkIn: today, checkOut: shiftDay(today, 1), nightlyPriceMinor: 250_000 }]
    })
    expect(created.status, JSON.stringify(created.body)).toBe(200)

    // What the day list should say about today, from the same service it reads.
    const grid = await api<GridPage>(page, 'reservations.grid', {
      from: shiftDay(today, -1),
      to: shiftDay(today, 1)
    })
    expect(grid.status, JSON.stringify(grid.body)).toBe(200)
    const { rooms, stays, blocks } = grid.body
    const arrivals = stays.filter((s) => s.checkIn === today).length
    const departures = stays.filter((s) => !s.dayUse && s.checkOut === today).length
    const busy = new Set(
      stays
        .filter((s) => (s.dayUse ? s.checkIn === today : s.checkIn <= today && today < s.checkOut))
        .map((s) => s.roomId)
    )
    const blocked = new Set(
      blocks.filter((b) => b.dateFrom <= today && today < b.dateTo).map((b) => b.roomId)
    )
    const free = rooms.filter((r) => r.sellable && !busy.has(r.id) && !blocked.has(r.id))
    expect(free.map((r) => r.id)).not.toContain(room.id)

    await page.reload()
    await page.getByTestId('app-ready').waitFor({ state: 'attached' })
    const list = page.getByTestId('day-list')
    await expect(list).toBeVisible()
    await expect(page.getByTestId('tape-chart')).toHaveCount(0)
    await expect(list.getByRole('heading', { name: `Gelenler (${arrivals})` })).toBeVisible()
    await expect(list.getByRole('region', { name: /Gelenler/ })).toContainText('Takvim Gelen')
    await expect(list.getByRole('heading', { name: `Gidenler (${departures})` })).toBeVisible()
    await expect(list.getByRole('heading', { name: `${free.length} boş oda` })).toBeVisible()
    const freeList = page.getByTestId('day-free-rooms')
    for (const r of free) await expect(freeList).toContainText(r.number)
    await expect(freeList).not.toContainText(room.number)
    const next = page.getByRole('button', { name: 'Sonraki gün' })
    expect((await next.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    await next.click()
    await expect(list.getByText('Bugüne dön')).toBeVisible()
    await list.getByText('Bugüne dön').click()
    await expect(list.getByText('Bugüne dön')).toHaveCount(0)
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })
})
