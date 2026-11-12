// Faz 15 madde 5 on the phone layout (390×844, HTTP): axe-core over the phone screens (S-66), no critical finding.
import { expect, test } from '@playwright/test'
import { critical, scan, type AxeFinding } from '../a11y'

const PHONE_ROUTES = [
  'today',
  'calendar',
  'guests',
  'in-house',
  'ledger',
  'issues',
  'tasks',
  'shift',
  'currency',
  'reports',
  'settings?tab=general'
] as const

test('telefon: erişilebilirlik taraması kritik hata vermez', async ({ page }) => {
  test.setTimeout(180_000)
  const failures: Record<string, AxeFinding[]> = {}
  const serious: Record<string, AxeFinding[]> = {}
  for (const route of PHONE_ROUTES) {
    await page.goto(`/#/${route}`)
    await page.getByTestId('app-ready').waitFor({ state: 'attached' })
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 })
    const findings = await scan(page)
    if (critical(findings).length) failures[route] = critical(findings)
    const rest = findings.filter((f) => f.impact === 'serious')
    if (rest.length) serious[route] = rest
  }
  const report = JSON.stringify({ critical: failures, serious }, null, 2)
  console.log(`a11y (phone): ${report}`)
  test.info().annotations.push({ type: 'a11y', description: report })
  expect(failures).toEqual({})
})
