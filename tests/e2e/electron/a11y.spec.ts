// Faz 15 madde 5 on the real app: axe-core over the main screens in the light and the dark theme, with a seeded
// calendar (bars, a block, a note). Kabul ölçütü: no critical finding; serious ones are printed for the review.
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { expect, test } from './fixtures'
import { api } from '../bridge'
import { A11Y_ROUTES, critical, scan, type AxeFinding } from '../a11y'

const root = resolve(__dirname, '../../..')

test('erişilebilirlik taraması: ana ekranlar açık ve koyu temada kritik hata vermez', async ({
  launch,
  userData
}) => {
  test.setTimeout(300_000)
  execFileSync('npx', ['tsx', '--tsconfig', 'tsconfig.node.json', 'tests/e2e/seed-calendar.ts', userData], {
    cwd: root,
    stdio: 'inherit'
  })
  const { app, page } = await launch(userData)
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]!
    w.unmaximize()
    w.setContentSize(1366, 768)
  })
  const serious: Record<string, AxeFinding[]> = {}
  const failures: Record<string, AxeFinding[]> = {}
  for (const theme of ['light', 'dark'] as const) {
    expect((await api(page, 'settings.set', { 'ui.theme': theme })).status).toBe(200)
    for (const route of A11Y_ROUTES) {
      await page.goto(page.url().replace(/#.*$/, `#/${route}`))
      await page.getByTestId('app-ready').waitFor({ state: 'attached' })
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
      // Skeletons gone: the screen shows its data (or its empty state).
      await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 })
      const findings = await scan(page)
      const key = `${theme} ${route}`
      if (critical(findings).length) failures[key] = critical(findings)
      const rest = findings.filter((f) => f.impact === 'serious')
      if (rest.length) serious[key] = rest
    }
  }
  const report = JSON.stringify({ critical: failures, serious }, null, 2)
  console.log(`a11y: ${report}`)
  test.info().annotations.push({ type: 'a11y', description: report })
  expect(failures).toEqual({})
})
