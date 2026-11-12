// Faz 15 (P15a2) on the real app: 24-hour clock fields and the window language (madde 11), the hotel's accent
// colour and larger text (madde 5–6), the day ledger on A4 (madde 8), and moving a stay by drag-and-drop with a
// confirmation (madde 12).
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { api, reload } from '../bridge'

const root = resolve(__dirname, '../../..')

function seed(dir: string): void {
  execFileSync('npx', ['tsx', '--tsconfig', 'tsconfig.node.json', 'tests/e2e/seed-calendar.ts', dir], {
    cwd: root,
    stdio: 'inherit'
  })
}

test('saat alanları 24 saat; İngilizce seçilince pencere bir sonraki açılışta en-GB olur', async ({
  launch,
  userData
}) => {
  const first = await launch()
  expect((await api(first.page, 'settings.set', { 'ui.language': 'en' })).status).toBe(200)
  await first.app.close()

  const second = await launch(userData)
  expect(await second.app.evaluate(({ app }) => app.commandLine.getSwitchValue('lang'))).toBe('en-GB')
  // Linux takes the window language from the environment (LANG), not from --lang: checked on Windows and macOS.
  if (process.platform !== 'linux') expect(await second.page.evaluate(() => navigator.language)).toBe('en-GB')
  await second.page.goto(second.page.url().replace(/#.*$/, '#/settings?tab=hotel'))
  const checkIn = second.page.locator('input[data-time-input]').first()
  await expect(checkIn).toHaveValue('14:00')
  await expect(checkIn).toHaveAttribute('type', 'text')
  // Typed with the keyboard: "1530" becomes 15:30, ↑ on the hours makes it 16:30.
  await checkIn.click()
  await second.page.keyboard.type('1530')
  await expect(checkIn).toHaveValue('15:30')
  await second.page.keyboard.press('Home')
  await second.page.keyboard.press('ArrowUp')
  await expect(checkIn).toHaveValue('16:30')
})

test('otelin vurgu rengi ve büyük yazı her ekrana uygulanır', async ({ launch }) => {
  const { page } = await launch()
  await page.goto(page.url().replace(/#.*$/, '#/theme-preview'))
  await page.getByTestId('accent-preset-light-green').click()
  await expect
    .poll(() =>
      page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--primary').trim())
    )
    .toBe('#15803d')
  const fontSize = () => page.evaluate(() => getComputedStyle(document.documentElement).fontSize)
  expect(await fontSize()).toBe('16px')
  await page.getByTestId('font-size-switch').getByRole('radio', { name: 'Daha büyük' }).click()
  await expect.poll(fontSize).toBe('20px')
  await page.goto(page.url().replace(/#.*$/, '#/calendar'))
  await expect(page.getByRole('heading', { level: 1, name: 'Takvim' })).toBeVisible()
  expect(await fontSize()).toBe('20px')
})

test('günlük defter A4 olarak basılır (koyu temada da açık renk)', async ({ launch }) => {
  const { app, page } = await launch()
  expect((await api(page, 'settings.set', { 'ui.theme': 'dark' })).status).toBe(200)
  // A setting written through the bridge reaches the window after a reload: the window really is dark first.
  await reload(page, '#/ledger')
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.evaluate(() => {
    // Keep the print layout on screen (the program's own dialog would answer "afterprint" and put the theme back).
    window.print = () => undefined
  })
  await page.getByTestId('day-print').click()
  const sheet = page.getByTestId('print-root')
  await expect(sheet).toBeAttached()
  await expect(page.locator('html')).not.toHaveClass(/dark/)
  await expect(sheet.getByTestId('print-income')).toBeAttached()
  const pdf = await app.evaluate(async ({ BrowserWindow }) => {
    const data = await BrowserWindow.getAllWindows()[0]!.webContents.printToPDF({ pageSize: 'A4' })
    return data.length
  })
  expect(pdf).toBeGreaterThan(1000)
})

test("sürükle-bırak: Mehmet Demir 102'den boş 203 numaralı odaya taşınır; önce onay sorulur", async ({
  launch,
  userData
}) => {
  seed(userData)
  const { page } = await launch(userData)
  const chart = page.getByTestId('tape-chart')
  const bar = chart.getByRole('button', { name: /^Mehmet Demir, oda 102/ })
  await expect(bar).toBeVisible()
  const from = (await page.getByTestId('tape-row-102').boundingBox())!
  const to = (await page.getByTestId('tape-row-203').boundingBox())!
  const box = (await bar.boundingBox())!
  const x = box.x + Math.min(20, box.width / 2)
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 2, y + 10, { steps: 3 })
  await page.mouse.move(x + 2, y + (to.y - from.y), { steps: 8 })
  await expect(chart.getByTestId('drag-ghost')).toBeVisible()
  await page.mouse.up()
  const dialog = page.getByTestId('move-stay-dialog')
  await expect(dialog).toContainText('Oda 102 → Oda 203')
  await dialog.getByRole('button', { name: 'Taşı' }).click()
  await expect(chart.getByRole('button', { name: /^Mehmet Demir, oda 203/ })).toBeVisible()
  await expect(chart.getByRole('button', { name: /^Mehmet Demir, oda 102/ })).toHaveCount(0)
})

// Son kontrol (QA2c #3): dragged to other dates, every night keeps its own price — the total does not change.
test('sürükle-bırak: yana sürüklenen rezervasyonun geceleri fiyatlarıyla kayar, toplam aynı kalır', async ({
  launch,
  userData
}) => {
  seed(userData)
  const { page } = await launch(userData)
  const chart = page.getByTestId('tape-chart')
  const bar = chart.getByRole('button', { name: /^Mehmet Demir, oda 102/ })
  await expect(bar).toBeVisible()
  const stayId = (await bar.getAttribute('data-testid'))!.replace(/^stay-/, '')
  const pad = (n: number) => String(n).padStart(2, '0')
  const day = (offset: number) => {
    const d = new Date()
    d.setDate(d.getDate() + offset)
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  }
  // The second night is dearer (a concert night): 2.800 + 3.500.
  type View = { reservation: { id: string }; folio: { chargesMinor: number }; stays: { checkIn: string }[] }
  const priced = await api<View>(page, 'booking.setNightPrices', {
    stayId,
    prices: [{ date: day(1), priceMinor: 350_000 }]
  })
  expect(priced.status, JSON.stringify(priced.body)).toBe(200)
  const total = priced.body.folio.chargesMinor
  expect(total).toBe(630_000)

  const box = (await bar.boundingBox())!
  const dayPx = box.width / 2
  const x = box.x + Math.min(20, box.width / 2)
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 10, y + 1, { steps: 3 })
  await page.mouse.move(x + 3 * dayPx, y + 1, { steps: 8 })
  await expect(chart.getByTestId('drag-ghost')).toBeVisible()
  await page.mouse.up()
  const dialog = page.getByTestId('move-stay-dialog')
  await expect(dialog).toContainText('toplam tutar değişmez')
  await dialog.getByRole('button', { name: 'Taşı' }).click()
  await expect(dialog).toBeHidden()
  await expect
    .poll(async () => {
      const view = await api<View>(page, 'booking.get', { id: priced.body.reservation.id })
      return { checkIn: view.body.stays[0]?.checkIn, total: view.body.folio.chargesMinor }
    })
    .toEqual({ checkIn: day(3), total })
})

/** Text colour of the first match as relative luminance (white paper = 1; 4.5:1 on white needs ≤ 0.183). */
async function inkOf(page: Page, selector: string): Promise<{ color: string; lum: number }> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel)
    if (!el) return { color: 'missing', lum: -1 }
    const color = getComputedStyle(el).color
    // The canvas turns any CSS colour (oklch, color-mix) into sRGB.
    const c = document.createElement('canvas').getContext('2d')!
    c.fillStyle = color
    c.fillRect(0, 0, 1, 1)
    const [r, g, b] = Array.from(c.getImageData(0, 0, 1, 1).data).map((v) => {
      const s = v / 255
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
    })
    return { color, lum: 0.2126 * r! + 0.7152 * g! + 0.0722 * b! }
  }, selector)
}

// Son kontrol (QA2c #6): the guide printed from the dark theme is dark ink on paper (key caps, captions, notes; links print as text).
test('kılavuz koyu temada basılınca tuş adları, metin ve resim altları kâğıtta okunur', async ({
  launch
}) => {
  const { page } = await launch()
  expect((await api(page, 'settings.set', { 'ui.theme': 'dark' })).status).toBe(200)
  const ink: Record<string, { color: string; lum: number }> = {}
  for (const [section, parts] of [
    ['getting-started', { kbd: '.guide-print kbd', text: '.guide-print p' }],
    ['payments', { caption: '.guide-print figcaption' }]
  ] as const) {
    await reload(page, `#/guide?s=${section}`)
    await expect(page.getByTestId('guide-print')).toBeAttached()
    await expect(page.locator('html')).toHaveClass(/dark/)
    await page.emulateMedia({ media: 'print' })
    for (const [name, sel] of Object.entries(parts)) ink[name] = await inkOf(page, sel)
    await page.emulateMedia({ media: 'screen' })
  }
  for (const [name, v] of Object.entries(ink)) {
    expect(v.lum, `${name} found`).toBeGreaterThanOrEqual(0)
    expect(v.lum, `${name} ${v.color}`).toBeLessThanOrEqual(0.183)
  }
  // "Bölümü yazdır" also takes the dark theme off while the print is made.
  await page.evaluate(() => {
    window.print = () => undefined
  })
  await page.getByTestId('guide-print-button').click()
  await expect(page.locator('html')).not.toHaveClass(/dark/)
})
