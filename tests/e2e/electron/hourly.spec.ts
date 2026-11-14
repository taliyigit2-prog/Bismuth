// P17d (K-48) in the real app: a morning hourly sale through the dialog (the typed amount), the same room sold for
// the night in the evening, and an hourly sale on the next morning (the night's check-out day) — all in one room; a
// second sale on overlapping hours is refused with the hours in the way. The tape chart shows the hours on the bar.
import { expect, test } from './fixtures'
import { api, reload } from '../bridge'
import { freeRoom, hotelToday, shiftDay } from '../shared-hotel'

interface Options {
  channels: { id: string }[]
}

test('sabah saatlik, akşam gece, ertesi sabah saatlik: aynı oda üç satış; çakışan saat reddedilir', async ({
  launch
}) => {
  test.setTimeout(180_000)
  const { page } = await launch()
  const today = await hotelToday(page)
  const tomorrow = shiftDay(today, 1)
  const room = await freeRoom(page, today, shiftDay(today, 2))
  const options = await api<Options>(page, 'booking.options')
  const channelId = options.body.channels[0]!.id

  // Morning: an hourly sale through the dialog; the amount is typed (room types carry no hour price here).
  await reload(page, '#/calendar')
  await page.getByTestId('hourly-new').click()
  await page.getByTestId('hourly-first').fill('Saatlik')
  await page.getByTestId('hourly-last').fill('Misafir')
  await page.getByTestId('hourly-room').click()
  await page.getByRole('option', { name: new RegExp(`^${room.number}`) }).click()
  await page.getByTestId('hourly-start').fill('10:00')
  await page.getByTestId('hourly-end').fill('13:00')
  await page.getByRole('textbox', { name: /Tutar/ }).fill('900')
  await page.getByTestId('hourly-save').click()
  const panel = page.getByTestId('reservation-panel')
  await expect(panel.getByTestId('panel-hours')).toContainText('10:00–13:00')
  await page.keyboard.press('Escape')

  // The same hours again: refused in the dialog with the hours in the way.
  await page.getByTestId('hourly-new').click()
  await page.getByTestId('hourly-first').fill('Çakışan')
  await page.getByTestId('hourly-room').click()
  await page.getByRole('option', { name: new RegExp(`^${room.number}`) }).click()
  await page.getByTestId('hourly-start').fill('12:00')
  await page.getByTestId('hourly-end').fill('14:00')
  await expect(page.getByTestId('hourly-taken')).toContainText('10:00–13:00')
  await page.keyboard.press('Escape')

  // Evening: the night of the same room is free (an hourly sale does not lock it); next morning an hourly sale on
  // the night's check-out day.
  const night = await api(page, 'booking.create', {
    guest: { firstName: 'Gece', lastName: 'Misafir' },
    channelId,
    stays: [{ roomId: room.id, checkIn: today, checkOut: tomorrow, nightlyPriceMinor: 200_000 }]
  })
  expect(night.status, JSON.stringify(night.body)).toBe(200)
  const next = await api(page, 'booking.createHourlyStay', {
    guest: { firstName: 'Ertesi', lastName: 'Sabah' },
    channelId,
    roomId: room.id,
    date: tomorrow,
    startTime: '09:00',
    endTime: '11:00',
    priceMinor: 60_000
  })
  expect(next.status, JSON.stringify(next.body)).toBe(200)
  const clash = await api<{ error: { messageKey: string; details: { hours: string[] } } }>(
    page,
    'booking.createHourlyStay',
    {
      guest: { firstName: 'Çakışan', lastName: 'Sabah' },
      channelId,
      roomId: room.id,
      date: tomorrow,
      startTime: '10:00',
      endTime: '12:00',
      priceMinor: 60_000
    }
  )
  expect(clash.status).toBe(409)
  expect(clash.body.error.messageKey).toBe('errors.roomOccupied')
  expect(clash.body.error.details.hours).toEqual(['09:00–11:00'])

  // The chart shows the hours on the bar of the next morning (its day column holds the sale alone).
  await reload(page, '#/calendar')
  await expect(page.locator('[data-bar][aria-label*="09:00–11:00"]')).toBeVisible()
  await expect(page.locator('[data-testid^="stay-hours-"]').filter({ hasText: '09:00' })).toBeVisible()
})
