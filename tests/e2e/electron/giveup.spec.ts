// P17a (K-55) in the real app: the guest is checked in, gives up, the check-in is taken back and the reservation is
// cancelled with the money refunded in one step; the closed reservation keeps its three-dot menu.
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { reload } from '../bridge'

async function newReservation(page: Page, guest: string, room: string): Promise<void> {
  await reload(page, '#/calendar')
  await page.getByRole('button', { name: 'Yeni rezervasyon' }).first().click()
  await page.getByRole('combobox', { name: 'Misafir' }).click()
  await page.getByPlaceholder('Ad ya da telefon…').fill(guest)
  await page.getByText(`Yeni misafir: ${guest}`).click()
  await page.getByTestId('room-multi-picker').click()
  await page.getByTestId(`room-option-${room}`).getByRole('checkbox').click()
  await page.keyboard.press('Escape')
  await page.getByTestId('new-reservation-save').click()
}

test('girdi, vazgeçti, iade: girişi geri al, iptal et, para iade edilir; kapalı kayıtta menü durur', async ({
  launch
}) => {
  test.setTimeout(120_000)
  const { page } = await launch()
  await newReservation(page, 'Vazgeçen Misafir', '101')
  const panel = page.getByTestId('reservation-panel')
  await expect(panel.getByTestId('panel-guest')).toHaveText('Vazgeçen Misafir')
  await panel.getByTestId('panel-pay').click()
  await page.getByTestId('payment-save').click()
  await panel.getByTestId('panel-check-in').click()
  await expect(panel.getByTestId('panel-check-out')).toBeVisible()

  // In the house: the menu offers "Vazgeçme ve iade", not a cancel.
  await panel.getByTestId('panel-more').click()
  await expect(page.getByTestId('panel-cancel')).toHaveCount(0)
  await page.getByTestId('panel-giveup').click()
  await expect(page.getByTestId('giveup-sameDay')).toBeVisible()
  await expect(page.getByTestId('giveup-early')).toBeVisible()
  await page.getByTestId('giveup-undo').getByRole('radio').click()
  await page.getByLabel('İptal nedeni').fill('odayı beğenmedi')
  await expect(page.getByTestId('money-collected')).toContainText('tahsilat var')
  await page.getByTestId('giveup-confirm').click()

  await expect(panel.getByTestId('panel-status')).toHaveText('İptal edildi')
  await panel.getByRole('tab', { name: 'Para' }).click()
  await expect(panel.getByRole('list', { name: 'Ödemeler' }).getByRole('listitem')).toHaveCount(2)
  await expect(panel.getByTestId('folio-balance')).toContainText('0')

  // The cancelled reservation keeps its menu: history and note (nothing left to refund).
  await panel.getByTestId('panel-more').click()
  await expect(page.getByTestId('panel-history')).toBeVisible()
  await expect(page.getByTestId('panel-note')).toBeVisible()
})
