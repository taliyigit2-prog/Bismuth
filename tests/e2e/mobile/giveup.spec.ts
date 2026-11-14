// P17a (K-55) on the phone (390×844): check in, give up, take the check-in back and cancel with the refund; the
// give-up window is a bottom sheet that does not widen the page and its choices are at least 44 px high.
import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { overflowReport } from '../routes'
import { freeRoom, hotelToday, shiftDay } from '../shared-hotel'

async function bookForTonight(page: Page, guest: string): Promise<void> {
  await page.goto('/#/calendar')
  await page.getByTestId('app-ready').waitFor({ state: 'attached' })
  const today = await hotelToday(page)
  const room = (await freeRoom(page, today, shiftDay(today, 1))).number
  await page.reload()
  await page.getByTestId('app-ready').waitFor({ state: 'attached' })
  await page.getByRole('button', { name: 'Yeni rezervasyon' }).first().click()
  await page.getByRole('combobox', { name: 'Misafir' }).click()
  await page.getByPlaceholder('Ad ya da telefon…').fill(guest)
  await page.getByText(`Yeni misafir: ${guest}`).click()
  await page.getByTestId('room-multi-picker').click()
  await page.getByTestId(`room-option-${room}`).getByRole('checkbox').click()
  await page.keyboard.press('Escape')
  await page.getByTestId('new-reservation-save').click()
}

test.describe('telefonda vazgeçme ve iade', () => {
  test('girdi, vazgeçti, iade: girişi geri al ve iade ile iptal et', async ({ page }) => {
    await bookForTonight(page, 'Vazgeçen Telefon')
    const panel = page.getByTestId('reservation-panel')
    await expect(panel.getByTestId('panel-guest')).toHaveText('Vazgeçen Telefon')
    await panel.getByTestId('panel-pay').click()
    await page.getByTestId('payment-save').click()
    await panel.getByTestId('panel-check-in').click()
    await expect(panel.getByTestId('panel-check-out')).toBeVisible()

    await panel.getByTestId('panel-more').click()
    await page.getByTestId('panel-giveup').click()
    for (const way of ['sameDay', 'undo', 'early'])
      expect((await page.getByTestId(`giveup-${way}`).boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
    await expect.poll(() => page.evaluate(overflowReport)).toEqual([])
    await page.getByTestId('giveup-undo').getByRole('radio').click()
    await page.getByLabel('İptal nedeni').fill('odayı beğenmedi')
    await expect(page.getByTestId('money-collected')).toContainText('tahsilat var')
    await page.getByTestId('giveup-confirm').click()

    await expect(panel.getByTestId('panel-status')).toHaveText('İptal edildi')
    await panel.getByRole('tab', { name: 'Para' }).click()
    await expect(panel.getByRole('list', { name: 'Ödemeler' }).getByRole('listitem')).toHaveCount(2)
    await panel.getByTestId('panel-more').click()
    await expect(page.getByTestId('panel-history')).toBeVisible()
  })
})
