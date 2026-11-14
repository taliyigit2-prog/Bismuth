// Faz 22 P22a kabul: hafif mod. Main computer in server mode with `app.lightMode` on: closing the window leaves the
// program running (no window, server answers); a browser on the same computer signs in at the server's own address
// and sees the calendar. With the setting off, closing the last window quits the program.
// Port: E2E_LIGHT_PORT (default 47511).
import { chromium } from '@playwright/test'
import { expect, test } from './fixtures'
import { api } from '../bridge'
import { OWNER } from '../setup-draft.mjs'

const PORT = Number(process.env['E2E_LIGHT_PORT'] ?? 47511)

test('hafif modda pencere kapanınca program çalışır, tarayıcıdan giriş yapılıp takvim görülür', async ({
  launch
}) => {
  test.setTimeout(180_000)
  const { app, page } = await launch()
  expect((await api(page, 'settings.set', { 'host.port': PORT })).status).toBe(200)
  const mode = await api<{ running: boolean }>(page, 'remote.setMode', { mode: 'host' })
  expect(mode.body.running).toBe(true)
  expect((await api(page, 'settings.set', { 'app.lightMode': true })).status).toBe(200)

  // The last window closes: the program stays (the server too), nothing is left on screen.
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((w) => w.close()))
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(0)

  const browser = await chromium.launch(
    process.env['PW_CHROMIUM_PATH'] ? { executablePath: process.env['PW_CHROMIUM_PATH'] } : {}
  )
  try {
    const web = await (await browser.newContext()).newPage()
    await web.goto(`http://127.0.0.1:${PORT}/`)
    await expect(web).toHaveURL(/#\/login/)
    await web.getByTestId('username').fill(OWNER.username)
    await web.getByTestId('secret').fill(OWNER.password)
    await web.getByTestId('sign-in').click()
    await web.goto(`http://127.0.0.1:${PORT}/#/calendar`)
    await expect(web.getByTestId('tape-chart')).toBeVisible()
  } finally {
    await browser.close()
  }
})

test('hafif mod kapalıyken son pencere kapanınca program kapanır', async ({ launch }) => {
  test.skip(
    process.platform === 'darwin',
    'macOS keeps the app running after the last window closes (platform rule, window-all-closed is not quit)'
  )
  test.setTimeout(120_000)
  const { app } = await launch()
  const closed = new Promise<void>((resolve) => app.process().once('exit', () => resolve()))
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((w) => w.close()))
  await closed
})
