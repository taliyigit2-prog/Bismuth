// Son kontrol (QA2c #1) on the real app: the window's page dies twice within a minute (app/crash.ts). The first
// crash asks (the native box is answered by a stub: first button, "Pencereyi yeniden aç"); the second opens the
// window again by itself, so it never stays a dead page. Only the main process is asked after a crash (the Playwright
// page object does not survive a renderer crash).
import { expect, test } from './fixtures'

type G = {
  qaAsked: number
  qaGone: number
  qaReasons: string[]
  qaTitles: string[]
  qaErrors: string[]
  qaWc: Electron.WebContents
}

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
    g.qaReasons = []
    g.qaTitles = []
    g.qaErrors = []
    g.qaWc = BrowserWindow.getAllWindows()[0]!.webContents
    electronApp.on('render-process-gone', (_e, _wc, details) => {
      g.qaGone++
      g.qaReasons.push(details.reason)
    })
    process.on('uncaughtException', (error) => g.qaErrors.push(String(error)))
    ;(dialog as unknown as { showMessageBox: unknown }).showMessageBox = async (...args: unknown[]) => {
      g.qaAsked++
      const box = args.find((a) => typeof a === 'object' && a !== null && 'title' in a) as { title?: string }
      g.qaTitles.push(box?.title ?? '')
      return { response: 0, checkboxChecked: false }
    }
  })
  const crash = () =>
    app.evaluate(() => {
      const g = globalThis as unknown as G
      setTimeout(() => g.qaWc.forcefullyCrashRenderer(), 10)
    })
  const status = () =>
    app.evaluate(({ BrowserWindow }) => {
      const g = globalThis as unknown as G
      return {
        asked: g.qaAsked,
        gone: g.qaGone,
        crashed: g.qaWc.isCrashed(),
        // Shown in the failure message when a step does not come (CI is the only place it ever failed).
        reasons: g.qaReasons,
        titles: g.qaTitles,
        errors: g.qaErrors,
        windows: BrowserWindow.getAllWindows().length
      }
    })

  await crash()
  // First the page must really be gone, then the question must come: the failure says which step did not happen.
  await expect.poll(status, { timeout: 15_000 }).toMatchObject({ gone: 1 })
  await expect.poll(status, { timeout: 15_000 }).toMatchObject({ asked: 1 })
  await expect.poll(status, { timeout: 15_000 }).toMatchObject({ crashed: false })
  // Let the reloaded page settle, then the same page fails again (or the weak computer runs out of memory again).
  await new Promise((r) => setTimeout(r, 3_000))
  await crash()
  await expect.poll(status, { timeout: 15_000 }).toMatchObject({ gone: 2 })
  await expect.poll(status, { timeout: 15_000 }).toMatchObject({ crashed: false })
  expect(await status()).toMatchObject({ asked: 1 })
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
