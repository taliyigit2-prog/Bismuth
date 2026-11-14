// The reservation form and panel on the phone (390×844, faz-05 + G-143): the form is a bottom sheet that does not
// widen the page, a reservation is saved and its panel opens as a bottom sheet; a payment is entered there.
import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { overflowReport } from '../routes'
import { api } from '../bridge'
import { freeRoom, hotelToday, shiftDay } from '../shared-hotel'

const shots = process.env['BOOKING_SHOTS']

async function ready(page: Page, hash: string): Promise<void> {
  await page.goto(`/${hash}`)
  await page.getByTestId('app-ready').waitFor({ state: 'attached' })
}

/**
 * A room free tonight: the form opens on today for one night, and the phone specs share one hotel. The page is
 * loaded again afterwards, so a room added for the test is in the form's list.
 */
async function roomForTonight(page: Page): Promise<string> {
  const today = await hotelToday(page)
  const room = (await freeRoom(page, today, shiftDay(today, 1))).number
  await page.reload()
  await page.getByTestId('app-ready').waitFor({ state: 'attached' })
  return room
}

async function book(page: Page, guest: string): Promise<void> {
  await ready(page, '#/calendar')
  const room = await roomForTonight(page)
  await page.getByRole('button', { name: 'Yeni rezervasyon' }).first().click()
  await page.getByRole('combobox', { name: 'Misafir' }).click()
  await page.getByPlaceholder('Ad ya da telefon…').fill(guest)
  await page.getByText(`Yeni misafir: ${guest}`).click()
  await page.getByTestId('room-multi-picker').click()
  // However many rooms the hotel has, the list stays on the screen and scrolls (the room may be the last one).
  const list = (await page.getByTestId('room-multi-picker-list').boundingBox())!
  expect(list.y + list.height).toBeLessThanOrEqual(844)
  await page.getByTestId(`room-option-${room}`).getByRole('checkbox').click()
  await page.keyboard.press('Escape')
}

test.describe('telefonda rezervasyon', () => {
  test('form alttan açılır ve yana taşmaz; kaydedilince panel açılır, ödeme girilir', async ({ page }) => {
    await book(page, 'Ece Telefon')
    await expect.poll(() => page.evaluate(overflowReport)).toEqual([])
    if (shots) await page.screenshot({ path: `${shots}/booking-new-phone.png`, fullPage: true })
    await page.getByTestId('new-reservation-save').click()
    const panel = page.getByTestId('reservation-panel')
    await expect(panel.getByTestId('panel-guest')).toHaveText('Ece Telefon')
    await expect.poll(() => page.evaluate(overflowReport)).toEqual([])
    const pay = panel.getByTestId('panel-pay')
    expect((await pay.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
    // QA3c1 #16: the "more" button and every tab of the panel are at least 44 px both ways.
    const more = (await panel.getByTestId('panel-more').boundingBox())!
    expect(more.width).toBeGreaterThanOrEqual(44)
    expect(more.height).toBeGreaterThanOrEqual(44)
    for (const tab of await panel.getByRole('tab').all())
      expect((await tab.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
    await pay.click()
    await page.getByTestId('payment-save').click()
    await panel.getByRole('tab', { name: 'Geceler' }).click()
    await expect(panel.locator('[data-testid^="paint-"]').first()).toHaveAttribute('data-paint', 'paid')
    if (shots) await page.screenshot({ path: `${shots}/booking-panel-phone.png` })
  })

  test('tarih seçici ekrana sığar: yedi gün sütununun hepsi görünür ve tıklanabilir (H-04)', async ({
    page
  }) => {
    await ready(page, '#/calendar')
    await page.getByRole('button', { name: 'Yeni rezervasyon' }).first().click()
    await page.getByRole('dialog').getByRole('button', { name: /Giriş/ }).first().click()
    const calendar = page.getByTestId('month-calendar')
    await expect(calendar).toBeVisible()
    const box = (await page.locator('[data-slot="popover-content"]').boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(390)
    for (const col of await calendar.getByRole('columnheader').all()) {
      const b = (await col.boundingBox())!
      expect(b.x + b.width).toBeLessThanOrEqual(390)
      expect(b.width).toBeGreaterThan(20)
    }
  })

  test('ekran görüntüleri: Rusça, koyu tema (yalnız BOOKING_SHOTS ile)', async ({ page }) => {
    test.skip(!shots, 'screenshots only')
    await ready(page, '#/calendar')
    await api(page, 'settings.set', { 'ui.language': 'ru', 'ui.theme': 'dark' })
    try {
      const room = await roomForTonight(page)
      await page.getByRole('button', { name: 'Новая бронь' }).first().click()
      await page.getByRole('combobox', { name: 'Гость' }).click()
      await page.getByPlaceholder(/Имя или телефон/).fill('Ирина Смирнова')
      await page
        .getByText(/Ирина Смирнова/)
        .last()
        .click()
      await page.getByTestId('room-multi-picker').click()
      await page.getByTestId(`room-option-${room}`).getByRole('checkbox').click()
      await page.keyboard.press('Escape')
      await expect.poll(() => page.evaluate(overflowReport)).toEqual([])
      await page.screenshot({ path: `${shots}/booking-new-phone-ru-dark.png`, fullPage: true })
      await page.getByTestId('new-reservation-save').click()
      const panel = page.getByTestId('reservation-panel')
      await expect(panel.getByTestId('panel-guest')).toBeVisible()
      await page.screenshot({ path: `${shots}/booking-panel-phone-ru-dark.png` })
    } finally {
      await api(page, 'settings.set', { 'ui.language': 'tr', 'ui.theme': 'light' })
    }
  })
})
