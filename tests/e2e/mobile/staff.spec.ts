// The Personel screen on the phone (390×844, G-143): cards instead of tables, the salary card's actions keep 44 px
// targets, the advance form opens as a bottom sheet and nothing widens the page.
import { expect, test } from '@playwright/test'
import { overflowReport } from '../routes'
import { api } from '../bridge'

test('telefonda personel: çalışan kartları, maaş kartı, avans alttan açılır', async ({ page }) => {
  await page.goto('/#/staff')
  await page.getByTestId('app-ready').waitFor({ state: 'attached' })
  const list = await api<{ fullName: string }[]>(page, 'staff.employees', {})
  if (!list.body.some((e) => e.fullName === 'Telefon Deneme')) {
    const now = new Date()
    const first = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const created = await api(page, 'staff.createEmployee', {
      firstName: 'Telefon',
      lastName: 'Deneme',
      position: 'Gece resepsiyonu ve kat hizmetleri sorumlusu',
      startDate: first,
      salary: { monthlyMinor: 3_600_000, currency: 'TRY' }
    })
    expect(created.status, JSON.stringify(created.body)).toBe(200)
    await page.reload()
    await page.getByTestId('app-ready').waitFor({ state: 'attached' })
  }
  await expect(page.getByTestId('employee-cards')).toContainText('Telefon Deneme')
  await expect.poll(() => page.evaluate(overflowReport)).toEqual([])

  await page.getByRole('tab', { name: 'Maaş tablosu' }).click()
  const cards = page.getByTestId('salary-cards')
  await expect(cards).toContainText('Telefon Deneme')
  const card = cards.locator('li', { hasText: 'Telefon Deneme' })
  const advance = card.getByRole('button', { name: 'Avans ver' })
  const box = await advance.boundingBox()
  expect(box?.height).toBeGreaterThanOrEqual(44)
  await expect.poll(() => page.evaluate(overflowReport)).toEqual([])

  await advance.click()
  const sheet = page.getByRole('dialog', { name: 'Avans ver' })
  await expect(sheet).toBeVisible()
  const rect = await sheet.boundingBox()
  // A bottom sheet: it reaches the bottom edge of the screen.
  expect(Math.round((rect?.y ?? 0) + (rect?.height ?? 0))).toBeGreaterThanOrEqual(840)
  await sheet.getByRole('button', { name: 'Vazgeç' }).click()

  await page.getByRole('tab', { name: 'İzin ve çizelge' }).click()
  await expect(page.getByTestId('schedule-grid')).toBeVisible()
  await expect.poll(() => page.evaluate(overflowReport)).toEqual([])
  // QA2a: every schedule cell is a 44 × 44 px target (seven to a row where they fit).
  const cells = await page
    .getByTestId('schedule-grid')
    .locator('[data-testid^="schedule-row-"]')
    .first()
    .getByRole('button')
    .evaluateAll((els) => els.map((el) => el.getBoundingClientRect()).map((r) => [r.width, r.height]))
  expect(cells.length).toBeGreaterThan(0)
  for (const [w, h] of cells) {
    expect(w).toBeGreaterThanOrEqual(44)
    expect(h).toBeGreaterThanOrEqual(44)
  }
})
