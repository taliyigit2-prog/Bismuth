// Faz 11 on the phone (390×844, HTTP transport): with the internet switched off and only the hotel's own rate, the
// converter comes first and answers; the tabs and every control fit without sideways scrolling.
import { expect, test } from '@playwright/test'
import { api } from '../bridge'

test.describe('Döviz telefonda', () => {
  test.afterEach(async ({ page }) => {
    // Shared in-memory server: leave the network setting and the rate as they were.
    await api(page, 'settings.set', { 'network.enabled': true })
    await api(page, 'fx.setHotelRate', { currency: 'EUR', rateMicro: null })
  })

  test('internet kapalıyken otel kuruyla çevirir; çevirici en üstte, yatay kaydırma yok', async ({
    page
  }) => {
    await page.goto('/')
    await page.getByTestId('app-ready').waitFor({ state: 'attached' })
    expect((await api(page, 'settings.set', { 'network.enabled': false })).status).toBe(200)
    expect((await api(page, 'fx.setHotelRate', { currency: 'EUR', rateMicro: 50_000_000 })).status).toBe(200)
    await page.goto('/#/currency')
    await page.getByTestId('app-ready').waitFor({ state: 'attached' })
    const converter = page.getByTestId('converter')
    await expect(converter).toBeVisible()
    await expect(page.getByTestId('fx-offline')).toBeVisible()
    // 2.500 TL at the hotel rate 1 € = 50 TL → 50 €.
    await page.getByRole('combobox', { name: 'Hangi birime' }).click()
    await page.getByRole('option', { name: 'EUR' }).click()
    await expect(page.getByTestId('fx-result')).toContainText('€50')
    const converterTop = await converter.evaluate((el) => el.getBoundingClientRect().top)
    const statusTop = await page.getByTestId('fx-status').evaluate((el) => el.getBoundingClientRect().top)
    expect(converterTop).toBeLessThan(statusTop)
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      )
      .toBeLessThanOrEqual(0)

    await page.getByRole('tab', { name: 'Hava durumu' }).click()
    await expect(page.getByText('Henüz hava bilgisi yok')).toBeVisible()
    const small = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('main button, main [role="tab"]')]
        .filter((el) => el.offsetParent !== null && el.getAttribute('role') !== 'switch')
        .filter((el) => el.getBoundingClientRect().height < 44)
        .map((el) => el.textContent)
    )
    expect(small).toEqual([])
  })
})
