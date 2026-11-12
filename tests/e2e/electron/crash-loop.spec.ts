// Son kontrol (QA2c #1) on the real app: the window's page dies twice within a minute (app/crash.ts). The first
// crash asks (the native box is answered by a stub: first button, "Pencereyi yeniden aç"); the second opens the
// window again by itself, so it never stays a dead page. Only the main process is asked after a crash (the Playwright
// page object does not survive a renderer crash).
import { expect, test } from './fixtures'

type G = { qaAsked: number; qaGone: number; qaWc: Electron.WebContents }

test('pencere bir dakikada iki kez çökerse ikincisinde soru sorulmadan yeniden açılır', async ({
  launch
}) => {
  const { app, page } = await launch()
  // The start page is still moving to the calendar and a first request round trip is under way; a page killed in the
  // middle of that leaves Playwright's own pending calls failing ("Cannot find context") and the test with them.
  await expect(page).toHaveURL(/#\/calendar/)
  await page.evaluate(() => new Promise<void>((done) => setTimeout(done, 1_000)))
  await app.evaluate(({ app: electronApp, dialog, BrowserWindow }) => {
    const g = globalThis as unknown as G
    g.qaAsked = 0
    g.qaGone = 0
    g.qaWc = BrowserWindow.getAllWindows()[0]!.webContents
    electronApp.on('render-process-gone', () => g.qaGone++)
    ;(dialog as unknown as { showMessageBox: unknown }).showMessageBox = async () => {
      g.qaAsked++
      return { response: 0, checkboxChecked: false }
    }
  })
  const crash = () =>
    app.evaluate(() => {
      const g = globalThis as unknown as G
      setTimeout(() => g.qaWc.forcefullyCrashRenderer(), 10)
    })
  const status = () =>
    app.evaluate(() => {
      const g = globalThis as unknown as G
      return { asked: g.qaAsked, gone: g.qaGone, crashed: g.qaWc.isCrashed() }
    })

  await crash()
  await expect.poll(async () => (await status()).asked, { timeout: 15_000 }).toBe(1)
  await expect.poll(async () => (await status()).crashed, { timeout: 15_000 }).toBe(false)
  // Let the reloaded page settle, then the same page fails again (or the weak computer runs out of memory again).
  await new Promise((r) => setTimeout(r, 3_000))
  await crash()
  await expect.poll(async () => (await status()).gone, { timeout: 15_000 }).toBe(2)
  await expect.poll(async () => (await status()).crashed, { timeout: 15_000 }).toBe(false)
  expect((await status()).asked).toBe(1)
  // The page is the program again (the app's own markup is back).
  await expect
    .poll(
      () =>
        app.evaluate(async ({ BrowserWindow }) => {
          const wc = BrowserWindow.getAllWindows()[0]!.webContents
          if (wc.isCrashed() || wc.isLoading()) return false
          // The page may still be swapping documents: a failed look is "not yet".
          return wc
            .executeJavaScript('document.querySelector(\'[data-testid="app-ready"]\') !== null')
            .catch(() => false) as Promise<boolean>
        }),
      { timeout: 20_000 }
    )
    .toBe(true)
})
