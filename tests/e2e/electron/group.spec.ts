// P17b (G-194) in the real app: a three-room group with a guest name per room, the group frame and legend on the
// calendar, and a bulk check-in from the group panel (every room in one step).
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { reload } from '../bridge'

async function pickRoom(page: Page, room: string): Promise<void> {
  await page.getByTestId('room-multi-picker').click()
  await page.getByTestId(`room-option-${room}`).getByRole('checkbox').click()
  await page.keyboard.press('Escape')
}

test('grup rezervasyonu: 3 oda, oda başına ad, takvimde çerçeve ve lejant, panelden toplu giriş', async ({
  launch
}) => {
  test.setTimeout(120_000)
  const { page } = await launch()
  await reload(page, '#/calendar')
  await page.getByRole('button', { name: 'Yeni rezervasyon' }).first().click()
  await page.getByRole('combobox', { name: 'Misafir' }).click()
  await page.getByPlaceholder('Ad ya da telefon…').fill('Grup Lideri')
  await page.getByText('Yeni misafir: Grup Lideri').click()
  for (const room of ['101', '102', '103']) await pickRoom(page, room)
  await page.getByTestId('group-toggle').click()
  await page.getByTestId('group-name-input').fill('E2E tur grubu')
  await page.getByTestId('group-room-guest-101').fill('Ayşe Örnek')
  await page.getByTestId('group-room-guest-102').fill('Can Örnek')
  await page.getByTestId('new-reservation-save').click()

  // The group panel opens on the new group: one row per room, the guest of each room by name.
  const panel = page.getByTestId('group-panel')
  await expect(panel.getByTestId('group-name')).toHaveText('E2E tur grubu')
  await expect(panel.getByTestId('group-guest-101')).toHaveText('Ayşe Örnek')
  await expect(panel.getByTestId('group-guest-102')).toHaveText('Can Örnek')
  await expect(panel.getByTestId('group-guest-103')).toHaveText('Grup Lideri')
  await expect(panel.getByTestId('group-folio-mode')).toHaveText('Tek hesap (grup lideri öder)')

  // Bulk check-in: all three rooms in one step.
  await expect(panel.getByTestId('group-check-in')).toContainText('(3)')
  await panel.getByTestId('group-check-in').click()
  await expect(panel.getByTestId('group-check-out')).toContainText('(3)')
  await expect(panel.getByTestId('group-check-in')).toBeDisabled()

  // The calendar frames the three stays of the group and explains the frame.
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
  await expect(page.locator('[data-group]')).toHaveCount(3)
  await expect(page.getByTestId('group-legend')).toBeVisible()

  // A bar opens its reservation; its group button leads back to the group panel.
  await page.locator('[data-group]').first().click()
  await page.getByTestId('panel-group').click()
  await expect(page.getByTestId('group-panel').getByTestId('group-name')).toHaveText('E2E tur grubu')
})
