// Faz 12 on the phone (390×844, faz-12 madde 6): the phone book leads "Daha fazla" and calls by a tap; supplies and
// laundry are there read-only (no purchase or slip forms); no screen sticks out sideways.
import { expect, test, type Page } from '@playwright/test'
import { overflowReport } from '../routes'
import { api } from '../bridge'

async function ready(page: Page, hash: string): Promise<void> {
  await page.goto(`/${hash}`)
  await page.getByTestId('app-ready').waitFor({ state: 'attached' })
}

async function once(page: Page): Promise<void> {
  const list = await api<{ name: string }[]>(page, 'contacts.list', { includeInactive: true })
  if (list.body.some((c) => c.name === 'Telefon Çamaşırhanesi')) return
  const created = await api(page, 'contacts.create', {
    name: 'Telefon Çamaşırhanesi',
    category: 'laundry',
    phones: [{ label: 'iş', number: '0216 000 00 00' }],
    favorite: true
  })
  expect(created.status, JSON.stringify(created.body)).toBe(200)
}

test.describe('telefonda rehber, tedarik, çamaşırhane, kayıp eşya', () => {
  test('"Daha fazla" Rehber ile başlar; numaraya dokununca aranır', async ({ page }) => {
    await ready(page, '#/today')
    await once(page)
    await page.getByTestId('nav-more').click()
    const sheet = page.getByTestId('more-sheet')
    await expect(sheet.getByRole('link').first()).toHaveText(/Rehber/)
    await sheet.getByRole('link', { name: /Rehber/ }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Rehber' })).toBeVisible()
    const call = page.getByRole('link', { name: /Telefon Çamaşırhanesi ara/ })
    await expect(call).toHaveAttribute('href', 'tel:02160000000')
    const box = await call.boundingBox()
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
    await expect.poll(() => page.evaluate(overflowReport)).toEqual([])
  })

  test('tedarik ve çamaşırhane telefonda salt okunur', async ({ page }) => {
    await ready(page, '#/supply')
    await once(page)
    await expect(page.getByRole('heading', { level: 1, name: 'Tedarik' })).toBeVisible()
    await expect(page.getByTestId('purchase-open')).toHaveCount(0)
    await expect(page.getByTestId('product-add')).toHaveCount(0)
    // Ürünler / Alımlar / Aylık özet: 44 px tabs on the phone.
    for (const tab of await page.getByRole('tab').all()) {
      const box = (await tab.boundingBox())!
      expect(box.height).toBeGreaterThanOrEqual(44)
    }
    await expect.poll(() => page.evaluate(overflowReport)).toEqual([])

    await ready(page, '#/laundry')
    await expect(page.getByTestId('laundry-contact')).toContainText('Telefon Çamaşırhanesi')
    await expect(page.getByTestId('laundry-in')).toHaveCount(0)
    await expect(page.getByTestId('laundry-out')).toHaveCount(0)
    await expect(page.getByTestId('price-open')).toHaveCount(0)
    await expect.poll(() => page.evaluate(overflowReport)).toEqual([])
  })

  test('kayıp eşya telefonda kart olarak listelenir ve kaydedilebilir', async ({ page }) => {
    await ready(page, '#/lost-items')
    const created = await api(page, 'lostItems.create', {
      description: 'Kırmızı atkı',
      locationText: 'Lobi',
      storageLocation: 'Resepsiyon'
    })
    expect(created.status).toBe(200)
    await page.reload()
    await page.getByTestId('app-ready').waitFor({ state: 'attached' })
    await expect(page.getByText('Kırmızı atkı').first()).toBeVisible()
    await expect(page.getByTestId('lost-add')).toBeVisible()
    await expect.poll(() => page.evaluate(overflowReport)).toEqual([])
  })
})
