// P15b on the phone (390×844): the guide is one column — the section cards, then the open section with a way back;
// the "?" of a screen opens its section; nothing is wider than the screen; the tour sits above the bottom menu.
import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { overflowReport } from '../routes'

async function ready(page: Page, hash: string): Promise<void> {
  await page.goto(`/${hash}`)
  await page.getByTestId('app-ready').waitFor({ state: 'attached' })
}

test.describe.configure({ mode: 'serial' })

test.describe('telefonda kılavuz', () => {
  test('tek sütun: bölüm kartları, açılan bölüm ve geri dönüş; yana taşma yok', async ({ page }) => {
    await ready(page, '#/guide')
    await expect(page.getByTestId('guide-home')).toBeVisible()
    await expect(page.getByTestId('guide-sections')).toHaveCount(0)
    await expect.poll(() => page.evaluate(overflowReport)).toEqual([])
    await page.getByTestId('guide-card-in-house').click()
    await expect(page.getByRole('heading', { level: 2, name: 'Otelde kalanlar ve KBS' })).toBeVisible()
    await expect.poll(() => page.evaluate(overflowReport)).toEqual([])
    await page.getByTestId('guide-back').click()
    await expect(page.getByTestId('guide-home')).toBeVisible()
  })

  test('ekranın "?" düğmesi 44 px ve o ekranın bölümünü açar', async ({ page }) => {
    await ready(page, '#/rooms')
    const help = page.getByTestId('guide-help')
    const box = (await help.boundingBox())!
    expect(box.height).toBeGreaterThanOrEqual(44)
    expect(box.width).toBeGreaterThanOrEqual(44)
    await help.click()
    await expect(page.getByRole('heading', { level: 2, name: 'Oda durumu ve arıza' })).toBeVisible()
    await page.getByTestId('guide-search').fill('KBS')
    await expect(page.getByTestId('guide-result').first()).toBeVisible()
  })

  test('tanıtım turu alt menünün üstünde durur ve kapatılır', async ({ page }) => {
    await ready(page, '#/guide')
    await page.getByTestId('guide-start-tour').click()
    const tour = page.getByTestId('guide-tour')
    await expect(tour).toBeVisible()
    const card = (await tour.boundingBox())!
    const nav = (await page.getByTestId('mobile-nav').boundingBox())!
    expect(card.y + card.height).toBeLessThanOrEqual(nav.y + 1)
    await expect.poll(() => page.evaluate(overflowReport)).toEqual([])
    await page.getByTestId('guide-tour-close').click()
    await expect(tour).toBeHidden()
  })
})
