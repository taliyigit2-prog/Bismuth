// Performance profile of the grid (faz-05 kabul ölçütü: 19 rooms, 2026–2036, scrolling does not stutter). Opt-in:
//   BISMUTH_PERF=1 npx playwright test tests/e2e/electron/calendar-perf.spec.ts
// (BISMUTH_PERF_DATA=<seeded folder> reuses a folder made by `seed-calendar.ts <folder> --dense`.) The numbers are
// printed and attached to the report; the assertions are loose so a slow CI machine does not fail it.
import { execFileSync } from 'node:child_process'
import { cpSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from './fixtures'

const root = resolve(__dirname, '../../..')

test.skip(!process.env['BISMUTH_PERF'], 'performance profile runs only with BISMUTH_PERF=1')
test.setTimeout(15 * 60_000)

test('19 oda × 2026–2036: ilk çizim, yıl atlama ve kaydırma ölçümü', async ({ launch, userData }) => {
  const data = process.env['BISMUTH_PERF_DATA']
  if (data) cpSync(data, userData, { recursive: true })
  else
    execFileSync(
      'npx',
      ['tsx', '--tsconfig', 'tsconfig.node.json', 'tests/e2e/seed-calendar.ts', userData, '--dense'],
      { cwd: root, stdio: 'inherit' }
    )
  const { app, page } = await launch(userData)
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]!
    w.unmaximize()
    w.setContentSize(1366, 768)
  })
  const chart = page.getByTestId('tape-chart')
  await expect(chart.locator('[data-testid^="stay-"]').first()).toBeVisible()

  // First drawing: reload the screen and wait for the first bar.
  const firstDraw = await page.evaluate(async () => {
    const t0 = performance.now()
    location.hash = '#/today'
    await new Promise((r) => setTimeout(r, 300))
    const t1 = performance.now()
    location.hash = '#/calendar'
    await new Promise<void>((done) => {
      const tick = () =>
        document.querySelector('[data-testid="tape-chart"] [data-testid^="stay-"]')
          ? done()
          : requestAnimationFrame(tick)
      tick()
    })
    return { ms: Math.round(performance.now() - t1), wait: Math.round(t1 - t0) }
  })

  // Year jump: 2036 from the select, until a bar of that year is on screen.
  await page.getByRole('combobox', { name: 'Yıl' }).click()
  const jumpStart = Date.now()
  await page.getByRole('option', { name: '2036' }).click()
  // The year select keeps the month on screen: the 2nd of this month in 2036 comes into view.
  const month = String(new Date().getMonth() + 1).padStart(2, '0')
  await expect(chart.getByTestId(`tape-day-2036-${month}-02`)).toBeInViewport()
  await expect
    .poll(() =>
      chart.evaluate((el) => {
        const box = el.getBoundingClientRect()
        return [...el.querySelectorAll('[data-testid^="stay-"]')].some((b) => {
          const r = b.getBoundingClientRect()
          return r.right > box.left + 160 && r.left < box.right
        })
      })
    )
    .toBe(true)
  const jumpMs = Date.now() - jumpStart

  // Smooth scroll: 30 px per frame for 300 frames (≈ 160 days), frame times measured in the page.
  const scroll = await chart.evaluate(async (el) => {
    el.scrollLeft = (el.scrollWidth * 1) / 12
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
      max: Math.round(sorted.at(-1)!),
      long: times.filter((t) => t > 50).length
    }
  })

  // Fast jumps across the ten years: 20 random positions, time until the next frame is painted.
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

  const result = { firstDraw, jumpMs, scroll, jumps }
  console.log(`calendar perf: ${JSON.stringify(result)}`)
  test.info().annotations.push({ type: 'perf', description: JSON.stringify(result) })
  expect(firstDraw.ms).toBeLessThan(3000)
  expect(scroll.fps).toBeGreaterThan(20)
})
