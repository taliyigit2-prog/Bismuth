// Guest search and history on the phone (390×844, G-143 "misafir arama ve geçmişi"): the list is search first and
// turns into cards, the guest card opens as a bottom sheet with the price summary, nothing widens the page.
import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { overflowReport } from '../routes'
import { api } from '../bridge'
import { freeRoom } from '../shared-hotel'

const shots = process.env['GUESTS_SHOTS']

async function ready(page: Page, hash: string): Promise<void> {
  await page.goto(`/${hash}`)
  await page.getByTestId('app-ready').waitFor({ state: 'attached' })
}

const localDay = (offset: number): string => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

test.describe('telefonda misafirler', () => {
  test('arama kartlara döner, misafir kartı alttan açılır ve son fiyatı gösterir; yana taşma yok', async ({
    page
  }) => {
    await ready(page, '#/guests')
    const options = (await api<{ channels: { id: string }[] }>(page, 'booking.options')).body
    // The phone specs share one hotel (kept across retries): a room free on that past night, and Leyla once only.
    const known = await api<{ id: string; firstName: string; lastName: string }[]>(
      page,
      'booking.searchGuests',
      { q: 'Telefonova' }
    )
    const leyla = known.body.find((g) => g.firstName === 'Leyla' && g.lastName === 'Telefonova')
    const room = await freeRoom(page, localDay(-60), localDay(-59))
    const created = await api(page, 'booking.create', {
      guest: leyla
        ? { id: leyla.id }
        : { firstName: 'Leyla', lastName: 'Telefonova', phone: '0532 222 33 44' },
      channelId: options.channels[0]!.id,
      stays: [
        {
          roomId: room.id,
          checkIn: localDay(-60),
          checkOut: localDay(-59),
          nightlyPriceMinor: 290_000
        }
      ]
    })
    expect(created.status, JSON.stringify(created.body)).toBe(200)
    await ready(page, '#/guests')
    await page.getByTestId('guest-search').fill('leyla telefonowa')
    const cards = page.getByTestId('guest-cards')
    await expect(cards.getByRole('button', { name: /Leyla Telefonova/ })).toBeVisible()
    await expect.poll(() => page.evaluate(overflowReport)).toEqual([])
    const card = cards.getByRole('button', { name: /Leyla Telefonova/ })
    expect((await card.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
    if (shots) await page.screenshot({ path: `${shots}/guests-list-phone.png`, fullPage: true })
    await card.click()
    const sheet = page.getByTestId('guest-sheet')
    await expect(sheet.getByTestId('summary-last-price')).toHaveText('₺2.900')
    await expect.poll(() => page.evaluate(overflowReport)).toEqual([])
    if (shots) await page.screenshot({ path: `${shots}/guests-card-phone.png` })
  })

  test('70 harflik boşluksuz soyad listeyi yana taşırmaz; kart sekmeleri 44 px (QA3c1 #2, #16)', async ({
    page
  }) => {
    await ready(page, '#/guests')
    const made = await api(page, 'guests.create', {
      firstName: 'Taşan',
      lastName: 'U'.repeat(70),
      phone: '+90 533 700 00 07'
    })
    expect(made.status, JSON.stringify(made.body)).toBe(200)
    await ready(page, '#/guests')
    await page.getByTestId('guest-search').fill('Taşan')
    const card = page.getByTestId('guest-cards').getByRole('button', { name: /Taşan/ }).first()
    await expect(card).toBeVisible()
    await expect.poll(() => page.evaluate(overflowReport)).toEqual([])
    await card.click()
    const sheet = page.getByTestId('guest-sheet')
    await expect(sheet).toBeVisible()
    await expect.poll(() => page.evaluate(overflowReport)).toEqual([])
    for (const tab of await sheet.getByRole('tab').all())
      expect((await tab.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  })

  test('firmalar ve kara liste telefonda yana taşmaz', async ({ page }) => {
    await ready(page, '#/guests')
    await api(page, 'companies.create', {
      title: 'Uzun Adlı Örnek Turizm Seyahat ve Organizasyon Ticaret Limited Şirketi',
      iban: 'TR830006200000000012345678',
      favorite: true
    })
    await api(page, 'blacklist.add', {
      name: 'Telefon Kişi',
      phone: '0533 999 88 77',
      severity: 'warn',
      reasonCode: 'other',
      reasonText: 'Gece gürültü şikâyeti'
    })
    await ready(page, '#/companies')
    await expect(page.getByTestId('company-list')).toContainText('Uzun Adlı Örnek Turizm')
    await expect.poll(() => page.evaluate(overflowReport)).toEqual([])
    if (shots) await page.screenshot({ path: `${shots}/companies-phone.png`, fullPage: true })
    await ready(page, '#/blacklist')
    await expect(page.getByTestId('blacklist-cards')).toContainText('Telefon Kişi')
    await expect.poll(() => page.evaluate(overflowReport)).toEqual([])
  })
})

test('ekran görüntüleri: misafir kartı telefonda Rusça koyu (yalnız GUESTS_SHOTS ile)', async ({ page }) => {
  test.skip(!shots, 'screenshots only')
  await ready(page, '#/guests')
  await api(page, 'settings.set', { 'ui.language': 'ru', 'ui.theme': 'dark' })
  try {
    await page.reload()
    await page.getByTestId('app-ready').waitFor({ state: 'attached' })
    await page.getByTestId('guest-search').fill('leyla')
    await page.getByTestId('guest-cards').getByRole('button').first().click()
    await expect(page.getByTestId('summary-last-price')).toBeVisible()
    await page.waitForTimeout(800)
    await page.screenshot({ path: `${shots}/guests-card-phone-ru-dark.png` })
    await ready(page, '#/companies')
    await page.screenshot({ path: `${shots}/companies-phone-ru-dark.png`, fullPage: true })
  } finally {
    await api(page, 'settings.set', { 'ui.language': 'tr', 'ui.theme': 'light' })
  }
})
