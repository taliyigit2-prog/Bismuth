// P21c on the phone (390×844, G-143): the owner's portfolio is a stack of hotel cards with a day list instead of
// the tape chart; nothing widens the page; the screen is in the "Daha fazla" sheet.
import { expect, test } from '@playwright/test'
import { overflowReport } from '../routes'

test('telefonda portföy: otel kartı, gün listesi, yana taşma yok', async ({ page }) => {
  await page.goto('/#/portfolio')
  await page.getByTestId('app-ready').waitFor({ state: 'attached' })
  await expect(page.getByRole('heading', { level: 1, name: 'Portföy' })).toBeVisible()
  const card = page.getByTestId('portfolio-hotel-own')
  await expect(card).toBeVisible()
  await expect(card.getByTestId('kpi-card')).toHaveCount(6)
  await expect(page.getByTestId('portfolio-day-list')).toBeVisible()
  await expect(page.getByTestId('portfolio-calendar')).toHaveCount(0)
  await expect.poll(() => page.evaluate(overflowReport)).toEqual([])
})

test('telefonda "Daha fazla" sayfasında Portföy girişi var', async ({ page }) => {
  await page.goto('/#/today')
  await page.getByTestId('app-ready').waitFor({ state: 'attached' })
  await page.getByRole('button', { name: /Daha fazla/ }).click()
  await page.getByRole('link', { name: 'Portföy' }).click()
  await expect(page).toHaveURL(/#\/portfolio/)
})
