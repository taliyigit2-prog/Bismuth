// Faz 16 madde 2 in the browser: when a screen breaks (here: the Today summary arrives in a shape the screen cannot
// read), the window shows what to do instead of a blank page — on the phone with 44 px buttons and no sideways
// scroll — the error goes to the main computer's log, and "Yeniden dene" brings the screen back once it answers.
// `P16A_SHOTS=<folder>` also saves the screen (phone and desktop width, light and dark, Turkish and Russian).
import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { api } from '../bridge'
import { overflowReport } from '../routes'

const shots = process.env['P16A_SHOTS']

async function breakToday(page: Page): Promise<string[]> {
  const reports: string[] = []
  await page.route('**/api/today.summary', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  )
  page.on('request', (r) => {
    if (r.url().endsWith('/api/system.reportError')) reports.push(r.postData() ?? '')
  })
  await page.goto('/#/today')
  // A window already on Today keeps its data: load the page again so the broken answer is read.
  await page.reload()
  await page.getByTestId('app-ready').waitFor({ state: 'attached' })
  return reports
}

test.describe.configure({ mode: 'serial' })

test.describe('beklenmeyen hata ekranı', () => {
  test('bozulan ekran ne yapılacağını söyler, hata bildirilir, "Yeniden dene" ekranı geri getirir', async ({
    page
  }) => {
    const reports = await breakToday(page)
    const crash = page.getByTestId('crash-screen')
    await expect(crash).toContainText('Bu ekranda beklenmeyen bir sorun oluştu')
    await expect(crash).toContainText('Kaydettiğiniz bilgiler saklandı')
    for (const name of ['Yeniden dene', 'Ekranı yeniden yükle'])
      expect((await crash.getByRole('button', { name }).boundingBox())!.height).toBeGreaterThanOrEqual(44)
    await expect.poll(() => page.evaluate(overflowReport)).toEqual([])
    await expect.poll(() => reports.length).toBeGreaterThan(0)
    expect(JSON.parse(reports[0]!)).toMatchObject({ kind: 'render', route: '/today' })
    if (shots) await page.screenshot({ path: `${shots}/crash-phone-tr-light.png`, fullPage: true })

    await page.unroute('**/api/today.summary')
    await crash.getByRole('button', { name: 'Yeniden dene' }).click()
    await expect(page.getByTestId('crash-screen')).toHaveCount(0)
  })

  test('koyu tema ve Rusça; masaüstü genişliğinde de okunur', async ({ page }) => {
    test.skip(!shots, 'screenshots only with P16A_SHOTS')
    await page.goto('/#/today')
    await page.getByTestId('app-ready').waitFor({ state: 'attached' })
    expect((await api(page, 'settings.set', { 'ui.theme': 'dark', 'ui.language': 'ru' })).status).toBe(200)
    try {
      await breakToday(page)
      await expect(page.getByTestId('crash-screen')).toContainText('На этом экране произошла')
      await page.screenshot({ path: `${shots}/crash-phone-ru-dark.png`, fullPage: true })
      await page.setViewportSize({ width: 1366, height: 768 })
      await page.reload()
      await expect(page.getByTestId('crash-screen')).toBeVisible()
      await page.screenshot({ path: `${shots}/crash-desktop-ru-dark.png` })
      expect((await api(page, 'settings.set', { 'ui.theme': 'light', 'ui.language': 'tr' })).status).toBe(200)
      await page.reload()
      await expect(page.getByTestId('crash-screen')).toBeVisible()
      await page.screenshot({ path: `${shots}/crash-desktop-tr-light.png` })
    } finally {
      await api(page, 'settings.set', { 'ui.theme': 'light', 'ui.language': 'tr' })
    }
  })
})
