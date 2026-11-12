// Faz 16 v2 "Üç dil" on the phone (390×844): Today and the calendar's day list in Turkish, English and Russian —
// no raw key or unfilled placeholder, nothing widens the page, no bottom bar or button label is cut off. The phone
// specs share one hotel (tests/e2e/shared-hotel.ts): the arrival goes into a room free tonight, and the language is
// set back to Turkish after each test for the files that follow.
import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { api } from '../bridge'
import { overflowReport } from '../routes'
import { freeRoom, hotelToday, runTag, shiftDay } from '../shared-hotel'
import { LANGS, clippedControls, rawTextReport, text } from '../i18n-guard'

async function open(page: Page, hash: string): Promise<void> {
  await page.goto(`/${hash}`)
  // A new hash on the same page is not a new start: reload so the language and the data are read again.
  await page.reload()
  await page.getByTestId('app-ready').waitFor({ state: 'attached' })
}

async function clean(page: Page, where: string): Promise<void> {
  await expect.poll(() => rawTextReport(page), { message: `${where}: raw keys` }).toEqual([])
  await expect.poll(() => page.evaluate(overflowReport), { message: `${where}: overflow` }).toEqual([])
  await expect.poll(() => clippedControls(page), { message: `${where}: cut-off labels` }).toEqual([])
}

test.afterEach(async ({ page }) => {
  await api(page, 'settings.set', { 'ui.language': 'tr' })
})

for (const lang of LANGS) {
  test(`${lang}: telefonda Bugün ve takvim dilin metinleriyle; taşma yok`, async ({ page }) => {
    await open(page, '#/today')
    const today = await hotelToday(page)
    const room = await freeRoom(page, today, shiftDay(today, 1))
    const options = (await api<{ channels: { id: string }[] }>(page, 'booking.options')).body
    const guest = `${runTag()} Dil`
    const created = await api(page, 'booking.create', {
      guest: { firstName: guest.split(' ')[0], lastName: 'Dil' },
      channelId: options.channels[0]!.id,
      stays: [{ roomId: room.id, checkIn: today, checkOut: shiftDay(today, 1), nightlyPriceMinor: 250_000 }]
    })
    expect(created.status, JSON.stringify(created.body)).toBe(200)
    expect((await api(page, 'settings.set', { 'ui.language': lang })).status).toBe(200)

    await open(page, '#/today')
    await expect(page.getByRole('heading', { level: 1, name: text(lang, 'today.title') })).toBeVisible()
    await expect(page.locator('main')).toContainText(guest)
    await clean(page, 'today')

    await open(page, '#/calendar')
    await expect(page.locator('main')).toContainText(guest)
    await clean(page, 'calendar')
  })
}
