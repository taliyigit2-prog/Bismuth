// QA2b: user text at the service's limit, without a single space (a pasted link, a number run, a long name), must
// wrap inside its box on every screen — on the phone (390×844) and on the hotel computer (1366×768). Runs last in
// the phone project (file name) because the long records stay in the shared hotel.
import { expect, test } from '@playwright/test'
import { overflowReport, SCREEN_ROUTES } from '../routes'
import { seedLongText } from '../long-text'

const SIZES = [
  { width: 390, height: 844 },
  { width: 1366, height: 768 }
] as const

test('servis sınırındaki boşluksuz metinle hiçbir ekran yatay taşmaz (telefon ve masaüstü)', async ({
  page
}) => {
  test.setTimeout(240_000)
  await page.goto('/#/today')
  await page.getByTestId('app-ready').waitFor({ state: 'attached' })
  await seedLongText(page)
  // Every screen is checked before the test fails, so one run names all of them.
  const soft = expect.configure({ soft: true, timeout: 4000 })
  for (const size of SIZES) {
    await page.setViewportSize(size)
    for (const route of SCREEN_ROUTES) {
      await page.goto(`/#/${route}`)
      await page.getByTestId('app-ready').waitFor({ state: 'attached' })
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
      await soft.poll(() => page.evaluate(overflowReport), { message: `${size.width} ${route}` }).toEqual([])
    }
  }
})

/** In the page: [] when nothing in the open dialog or sheet sticks out of it sideways, else what does. */
const dialogOverflow = (): string[] => {
  const box = document.querySelector('[role="dialog"]')
  if (!box) return ['no dialog']
  const edge = box.getBoundingClientRect()
  const clipped = (el: Element): boolean => {
    for (let p = el.parentElement; p && p !== box; p = p.parentElement)
      if (getComputedStyle(p).overflowX !== 'visible') return true
    return false
  }
  return [...box.querySelectorAll('*')]
    .filter((el) => {
      const r = el.getBoundingClientRect()
      return r.width > 0 && (r.right > edge.right + 1 || r.left < edge.left - 1) && !clipped(el)
    })
    .slice(0, 5)
    .map((el) => `${el.tagName.toLowerCase()}.${String(el.getAttribute('class') ?? '').slice(0, 60)}`)
}

// Detail panels that show the long records whole (names, notes, addresses).
const PANELS: readonly { route: string; rows: string; open?: string }[] = [
  { route: 'guests', rows: '[data-testid^="guest-card-"], [data-testid^="guest-row-"]' },
  { route: 'companies', rows: '[data-slot="card"]', open: '[data-testid^="company-open-"]' },
  { route: 'issues', rows: '[data-testid^="issue-card-"], [data-testid^="issue-row-"]' },
  { route: 'supply', rows: '[data-testid^="product-card-"], [data-testid^="product-"]' },
  { route: 'staff', rows: '[data-testid^="employee-"]' }
]

test('uzun metinli kayıtların ayrıntı panelleri taşmaz (telefon ve masaüstü)', async ({ page }) => {
  test.setTimeout(180_000)
  await page.goto('/#/today')
  await page.getByTestId('app-ready').waitFor({ state: 'attached' })
  await seedLongText(page)
  const soft = expect.configure({ soft: true, timeout: 4000 })
  for (const size of SIZES) {
    await page.setViewportSize(size)
    for (const { route, rows, open } of PANELS) {
      await page.goto(`/#/${route}`)
      await page.getByTestId('app-ready').waitFor({ state: 'attached' })
      const row = page.locator(rows).filter({ hasText: 'WWWWWWWWWW' }).first()
      const isButton = (await row.evaluate((el) => el.tagName)) === 'BUTTON'
      await (open ? row.locator(open) : isButton ? row : row.getByRole('button').first()).click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await soft.poll(() => page.evaluate(dialogOverflow), { message: `${size.width} ${route}` }).toEqual([])
      await soft
        .poll(() => page.evaluate(overflowReport), { message: `${size.width} ${route} page` })
        .toEqual([])
      await page.keyboard.press('Escape')
      await expect(page.getByRole('dialog')).toHaveCount(0)
    }
  }
})
