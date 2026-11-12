// Performance profile (faz-15 madde 9; faz-16 "10 yıl × 20 oda kabul edilebilir sürede"): the calendar with 20 rooms
// booked 2026–2036, the ledger month with 1,300 rows, the reports — timings and render counts. Opt-in:
//   BISMUTH_PERF=1 npx playwright test tests/e2e/electron/perf.spec.ts
// (BISMUTH_PERF_DATA=<folder> reuses a folder made by `seed-calendar.ts <folder> --dense` + `seed-perf.ts <folder>`.)
// Numbers are printed and attached; results are written up in docs/plan/04-arastirma/performans.md. The assertions
// are loose so a slow machine does not fail it.
import { execFileSync } from 'node:child_process'
import { cpSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { api } from '../bridge'

const root = resolve(__dirname, '../../..')
const tsx = (script: string, dir: string, ...args: string[]) =>
  execFileSync('npx', ['tsx', '--tsconfig', 'tsconfig.node.json', script, dir, ...args], {
    cwd: root,
    stdio: 'inherit'
  })

test.skip(!process.env['BISMUTH_PERF'], 'performance profile runs only with BISMUTH_PERF=1')
test.setTimeout(30 * 60_000)

/** Render counts (src/renderer/lib/render-count.ts), reset. */
const resetCounts = (page: Page) =>
  page.evaluate(() => {
    ;(globalThis as { __bismuthRenders?: Record<string, number> }).__bismuthRenders = {}
  })
const counts = (page: Page) =>
  page.evaluate(() => ({ ...(globalThis as { __bismuthRenders?: Record<string, number> }).__bismuthRenders }))

/** Time until `selector` is in the page, measured in the page after `action`. */
async function timeUntil(page: Page, action: () => Promise<unknown>, selector: string): Promise<number> {
  const t0 = await page.evaluate(() => performance.now())
  await action()
  await page.waitForSelector(selector, { state: 'attached', timeout: 60_000 })
  return Math.round((await page.evaluate(() => performance.now())) - t0)
}

test('20 oda × 2026–2036, 1.300 satırlık defter ayı ve raporlar: süreler ve yeniden çizimler', async ({
  launch,
  userData
}) => {
  const data = process.env['BISMUTH_PERF_DATA']
  if (data) cpSync(data, userData, { recursive: true })
  else {
    tsx('tests/e2e/seed-calendar.ts', userData, '--dense')
    tsx('tests/e2e/seed-perf.ts', userData)
  }
  const { app, page } = await launch(userData)
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]!
    w.unmaximize()
    w.setContentSize(1366, 768)
  })
  const chart = page.getByTestId('tape-chart')
  await expect(chart.locator('[data-testid^="stay-"]').first()).toBeVisible()

  // ── Service: one screen of the grid (two months, 20 rooms) through the window's API ──
  const service = await page.evaluate(async () => {
    const out: number[] = []
    for (let i = 0; i < 10; i++) {
      const t0 = performance.now()
      await window.bismuth!.api({
        path: '/api/reservations.grid',
        body: JSON.stringify({ from: '2031-03-01', to: '2031-05-01' })
      })
      out.push(performance.now() - t0)
    }
    out.sort((a, b) => a - b)
    return { median: Math.round(out[5]!), max: Math.round(out.at(-1)!) }
  })

  // ── Calendar: first drawing (from Bugün back to the calendar) ──
  await page.goto(page.url().replace(/#.*$/, '#/today'))
  await expect(page.getByRole('heading', { level: 1, name: 'Bugün' })).toBeVisible()
  const firstDraw = await timeUntil(
    page,
    () => page.goto(page.url().replace(/#.*$/, '#/calendar')),
    '[data-testid="tape-chart"] [data-testid^="stay-"]'
  )

  // ── Calendar: smooth scroll, 300 frames of 30 px ──
  const scroll = await chart.evaluate(async (el) => {
    el.scrollLeft = el.scrollWidth / 2
    await new Promise((r) => setTimeout(r, 500))
    const times: number[] = []
    let last = performance.now()
    await new Promise<void>((done) => {
      let n = 0
      const step = (now: number) => {
        times.push(now - last)
        last = now
        el.scrollLeft += 30
        if (++n < 300) requestAnimationFrame(step)
        else done()
      }
      requestAnimationFrame(step)
    })
    times.shift()
    const sorted = [...times].sort((a, b) => a - b)
    const avg = times.reduce((s, t) => s + t, 0) / times.length
    return {
      fps: Math.round(1000 / avg),
      p95: Math.round(sorted[Math.floor(sorted.length * 0.95)]!),
      long: times.filter((t) => t > 50).length
    }
  })

  // ── Calendar: random jumps across the ten years, time to the next painted frame ──
  const jumps = await chart.evaluate(async (el) => {
    const out: number[] = []
    let x = 42
    for (let i = 0; i < 20; i++) {
      x = (x * 16807) % 2147483647
      const t0 = performance.now()
      el.scrollLeft = (x % 1000) * (el.scrollWidth / 1000)
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      out.push(performance.now() - t0)
    }
    out.sort((a, b) => a - b)
    return { median: Math.round(out[10]!), max: Math.round(out.at(-1)!) }
  })

  // ── Calendar: the keyboard cursor, 40 arrow presses; rows drawn again per press ──
  await chart.focus()
  await resetCounts(page)
  const keysStart = await page.evaluate(() => performance.now())
  for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowRight')
  for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowDown')
  const keys = {
    msPerPress: Math.round(((await page.evaluate(() => performance.now())) - keysStart) / 40),
    renders: await counts(page)
  }

  // ── Ledger: this month with 1,300 rows ──
  const ledgerService = await page.evaluate(async () => {
    const now = new Date()
    const t0 = performance.now()
    const res = await window.bismuth!.api({
      path: '/api/ledger.month',
      body: JSON.stringify({ year: now.getFullYear(), month: now.getMonth() + 1 })
    })
    return { ms: Math.round(performance.now() - t0), kb: Math.round(res.body.length / 1024) }
  })
  await page.goto(page.url().replace(/#.*$/, '#/ledger'))
  await expect(page.getByTestId('day-bar')).toBeVisible()
  const ledgerMonth = await timeUntil(
    page,
    () => page.getByTestId('view-month').click(),
    '[data-testid="month-band"]'
  )
  const bands = page.getByTestId('month-band')
  const bandCount = await bands.count()
  await resetCounts(page)
  const openStart = await page.evaluate(() => performance.now())
  for (let i = 0; i < Math.min(bandCount, 10); i++) await bands.nth(i).click()
  const openOne = Math.round(
    ((await page.evaluate(() => performance.now())) - openStart) / Math.min(bandCount, 10)
  )
  const bandRenders = await counts(page)
  const filterStart = await page.evaluate(() => performance.now())
  await page.getByTestId('filter-currency').click()
  await page.getByRole('option', { name: 'TRY' }).click()
  await expect(page.getByTestId('month-net')).toBeVisible()
  const filter = Math.round((await page.evaluate(() => performance.now())) - filterStart)

  // ── Reports: the summary of this year, then the yearly tab ──
  await page.goto(page.url().replace(/#.*$/, '#/today'))
  const reports = await timeUntil(
    page,
    () => page.goto(page.url().replace(/#.*$/, '#/reports')),
    '[data-slot="card"] table, [data-testid="kpi-card"]'
  )
  const reportService = await page.evaluate(async () => {
    const call = async (path: string, body: unknown) => {
      const t0 = performance.now()
      const res = await window.bismuth!.api({ path, body: JSON.stringify(body) })
      return { ms: Math.round(performance.now() - t0), status: res.status }
    }
    const year = new Date().getFullYear()
    return {
      summaryYear: await call('/api/reports.summary', { from: `${year}-01-01`, to: `${year + 1}-01-01` }),
      yearly: await call('/api/reports.yearly', { years: [year, year - 1] })
    }
  })

  const result = {
    rooms: (
      await api<{ rooms: unknown[] }>(page, 'reservations.grid', { from: '2031-03-01', to: '2031-03-02' })
    ).body.rooms.length,
    service,
    calendar: { firstDraw, scroll, jumps, keys },
    ledger: {
      service: ledgerService,
      bands: bandCount,
      monthOpen: ledgerMonth,
      openBand: openOne,
      bandRenders,
      filter
    },
    reports: { firstDraw: reports, service: reportService }
  }
  console.log(`perf: ${JSON.stringify(result)}`)
  test.info().annotations.push({ type: 'perf', description: JSON.stringify(result) })
  expect(result.rooms).toBe(20)
  expect(firstDraw).toBeLessThan(5000)
  // Frame rate depends on the machine and its load: reported, not asserted (calendar-perf.spec.ts asserts it).
  expect(ledgerMonth).toBeLessThan(5000)
})
