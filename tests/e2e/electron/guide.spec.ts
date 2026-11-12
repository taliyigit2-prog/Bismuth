// P15b in the real app (G-18, S-52): Ayarlar → Kılavuz opens the guide; every screen's "?" opens its own section;
// the search finds a heading and opens the section there; the first-run tour comes once for a new account, can be
// skipped, does not come back, and starts again from the guide.
import { expect, test } from './fixtures'
import { api, reload } from '../bridge'
import { RECEPTION } from '../setup-draft.mjs'

test('Ayarlar → Kılavuz, ekranın "?" düğmesi ve arama doğru bölümü açar', async ({ launch }) => {
  test.setTimeout(120_000)
  const { page } = await launch()
  await reload(page, '#/settings')
  await page.getByTestId('settings-tab-guide').click()
  await page.getByTestId('guide-settings-open').click()
  await expect(page.getByRole('heading', { level: 1, name: 'Kılavuz' })).toBeVisible()
  await expect(page.getByTestId('guide-home').getByRole('link')).toHaveCount(20)

  // "?" on the ledger opens "Defter ve giderler"; on the laundry screen, the laundry part of its section.
  await reload(page, '#/ledger')
  await page.getByTestId('guide-help').click()
  await expect(page.getByRole('heading', { level: 2, name: 'Defter ve giderler' })).toBeVisible()
  await reload(page, '#/laundry')
  await page.getByTestId('guide-help').click()
  await expect(page.locator('#guide-laundry')).toBeInViewport()
  await expect(page.getByTestId('guide-section-operations')).toHaveAttribute('aria-current', 'page')

  // Search: a word from the payments section; the hit under "Kapora" opens the section at that heading.
  await page.getByTestId('guide-search').fill('kapora')
  const hit = page.locator('[data-testid="guide-result"][href*="a=deposit"]')
  await hit.click()
  await expect(page.getByRole('heading', { level: 2, name: 'Ödeme alınca ne yapılır' })).toBeVisible()
  await expect(page.locator('#guide-deposit')).toBeInViewport()
  // A screenshot of the guide is bundled and shown (no network).
  const img = page.getByTestId('guide-article-payments').locator('[data-guide-image="payment-dialog"] img')
  await expect(img).toBeVisible()
  expect(await img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0)
})

test('ilk açılış turu yeni kullanıcıya bir kez gelir, atlanır, kılavuzdan yeniden başlar', async ({
  launch
}) => {
  test.setTimeout(120_000)
  const { page } = await launch()
  // The hotel shows the tour to new accounts; the receptionist signs in for the first time.
  expect((await api(page, 'settings.set', { 'guide.tourForNewUsers': true })).status).toBe(200)
  expect((await api(page, 'auth.signOut')).status).toBe(200)
  expect(
    (await api(page, 'auth.signIn', { username: RECEPTION.username, secret: RECEPTION.password })).status
  ).toBe(200)
  expect(
    (
      await api(page, 'auth.changePassword', {
        currentPassword: RECEPTION.password,
        newPassword: 'deniz-yeni-sifre'
      })
    ).status
  ).toBe(200)
  await reload(page, '#/today')
  const tour = page.getByTestId('guide-tour')
  await expect(tour).toBeVisible()
  await expect(tour).toHaveAttribute('data-step', 'today')
  await page.getByTestId('guide-tour-next').click()
  await expect(tour).toHaveAttribute('data-step', 'calendar')
  // The tour does not block the screen: the menu still works while it is open.
  await page.getByTestId('guide-tour-screen').click()
  await expect(page.getByRole('heading', { level: 1, name: 'Takvim' })).toBeVisible()
  await page.getByTestId('guide-tour-skip').click()
  await expect(tour).toBeHidden()

  // Once per person: kept in the person's preferences, so it does not come again.
  await reload(page, '#/today')
  await expect(page.getByRole('heading', { level: 1, name: 'Bugün' })).toBeVisible()
  await expect(tour).toBeHidden()
  const prefs = await api<Record<string, unknown>>(page, 'settings.get')
  expect(prefs.body['ui.tourDone']).toBe(true)

  // From the guide it starts again at the first step.
  await reload(page, '#/guide')
  await page.getByTestId('guide-start-tour').click()
  await expect(tour).toHaveAttribute('data-step', 'today')
  await page.keyboard.press('Escape')
  await expect(tour).toBeHidden()
})
