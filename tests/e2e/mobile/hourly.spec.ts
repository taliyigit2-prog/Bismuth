// P17d (K-48) on the phone (390×844): an hourly sale through the bottom sheet (the typed amount), the same room sold
// for the night and an hourly sale on the next morning; the sheet does not widen the page; the day list names the hours.
import { expect, test } from '@playwright/test'
import { api } from '../bridge'
import { overflowReport } from '../routes'
import { freeRoom, hotelToday, runTag, shiftDay } from '../shared-hotel'

interface Options {
  channels: { id: string }[]
}

test.describe('telefonda saatlik satış', () => {
  test('sabah saatlik, akşam gece, ertesi sabah saatlik', async ({ page }) => {
    test.setTimeout(120_000)
    await page.goto('/#/calendar')
    await page.getByTestId('app-ready').waitFor({ state: 'attached' })
    const today = await hotelToday(page)
    const tomorrow = shiftDay(today, 1)
    const room = await freeRoom(page, today, shiftDay(today, 2))
    const channelId = (await api<Options>(page, 'booking.options')).body.channels[0]!.id
    const tag = runTag()
    await page.reload()
    await page.getByTestId('app-ready').waitFor({ state: 'attached' })

    await page.getByTestId('hourly-new').click()
    await page.getByTestId('hourly-first').fill(`Saatlik${tag}`)
    await page.getByTestId('hourly-room').click()
    await page.getByRole('option', { name: new RegExp(`^${room.number}`) }).click()
    await page.getByTestId('hourly-start').fill('10:00')
    await page.getByTestId('hourly-end').fill('13:00')
    await page.getByRole('textbox', { name: /Tutar/ }).fill('900')
    await expect.poll(() => page.evaluate(overflowReport)).toEqual([])
    await page.getByTestId('hourly-save').click()
    const panel = page.getByTestId('reservation-panel')
    await expect(panel.getByTestId('panel-hours')).toContainText('10:00–13:00')
    await page.keyboard.press('Escape')

    const night = await api(page, 'booking.create', {
      guest: { firstName: `Gece${tag}`, lastName: 'Misafir' },
      channelId,
      stays: [{ roomId: room.id, checkIn: today, checkOut: tomorrow, nightlyPriceMinor: 200_000 }]
    })
    expect(night.status, JSON.stringify(night.body)).toBe(200)
    const next = await api(page, 'booking.createHourlyStay', {
      guest: { firstName: `Sabah${tag}`, lastName: 'Misafir' },
      channelId,
      roomId: room.id,
      date: tomorrow,
      startTime: '09:00',
      endTime: '11:00',
      priceMinor: 60_000
    })
    expect(next.status, JSON.stringify(next.body)).toBe(200)

    // The phone's day list names the hours of each hourly sale.
    await page.reload()
    await page.getByTestId('app-ready').waitFor({ state: 'attached' })
    await expect(page.locator('[data-testid^="day-hours-"]').filter({ hasText: '10:00–13:00' })).toBeVisible()
  })
})
