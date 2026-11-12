// G-19 in the real app (faz-15 madde 3): a reservation and its payment written with the keyboard — N opens the
// form from another screen, Enter saves it, P adds a payment to the reservation in the open panel, Enter saves
// that too; "?" shows the shortcut list and Esc closes it; T brings the calendar back to today.
import { expect, test } from './fixtures'
import { reload } from '../bridge'

test('klavyeyle rezervasyon ve ödeme: N, Enter, P, Enter', async ({ launch }) => {
  test.setTimeout(120_000)
  const { page } = await launch()
  await reload(page, '#/today')
  await expect(page.getByRole('heading', { level: 1, name: 'Bugün' })).toBeVisible()

  // "?" lists the shortcuts; Esc closes the list.
  await page.keyboard.press('Shift+Slash')
  const list = page.getByRole('dialog', { name: 'Klavye kısayolları' })
  await expect(list).toBeVisible()
  await expect(list.locator('[data-shortcut="new-reservation"]')).toContainText('N')
  await page.keyboard.press('Escape')
  await expect(list).toBeHidden()

  // N on another screen: the calendar opens with the new-reservation form.
  await page.keyboard.press('n')
  const form = page.getByRole('dialog', { name: 'Yeni rezervasyon' })
  await expect(form).toBeVisible()
  await expect(page).toHaveURL(/#\/calendar$/)

  const guest = form.getByRole('combobox', { name: 'Misafir' })
  await guest.focus()
  await page.keyboard.press('Enter')
  await page.keyboard.type('Ece Kaya')
  await page.getByText('Yeni misafir: Ece Kaya').click()
  await form.getByTestId('room-multi-picker').click()
  await page.getByTestId('room-option-101').getByRole('checkbox').click()
  await page.keyboard.press('Escape')
  await expect(form.getByTestId('suggested-price')).toContainText('₺')

  // Enter in a field saves (the save button is in the footer, outside the form's scrolling body).
  await form.getByTestId('new-guest-form').locator('input').first().focus()
  await page.keyboard.press('Enter')
  const panel = page.getByTestId('reservation-panel')
  await expect(panel.getByTestId('panel-guest')).toHaveText('Ece Kaya')
  await expect(form).toBeHidden()

  // P inside the panel: a payment on this reservation, the balance already in the amount; Enter saves it.
  await panel.getByRole('tab', { name: 'Geceler' }).click()
  const paint = panel.locator('[data-testid^="paint-"]').first()
  await expect(paint).toHaveAttribute('data-paint', 'unpaid')
  await page.keyboard.press('p')
  const pay = page.getByRole('dialog', { name: 'Ödeme ekle' })
  await expect(pay).toBeVisible()
  await pay.locator('input[inputmode="decimal"]').first().focus()
  await page.keyboard.press('Enter')
  await expect(pay).toBeHidden()
  await expect(paint).toHaveAttribute('data-paint', 'paid')

  // Esc closes the panel; T goes back to today with today's cell selected.
  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()
  await page.keyboard.press('t')
  await expect(page.getByTestId('tape-chart')).toBeFocused()
})

test('yazı alanındayken N, P ve T harf olarak yazılır', async ({ launch }) => {
  const { page } = await launch()
  await reload(page, '#/guests')
  const search = page
    .getByRole('searchbox')
    .or(page.getByPlaceholder(/Ad, telefon/))
    .first()
  await search.click()
  await page.keyboard.type('npt')
  await expect(search).toHaveValue('npt')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('heading', { level: 1, name: 'Misafirler' })).toBeVisible()
})
