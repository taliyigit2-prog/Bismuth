// Calls the app's API from inside the page, the way the UI does: the Electron preload bridge (the window's own
// session, kept by the main process) or, in the phone harness, HTTP to the page's origin.
import { expect, type Page } from '@playwright/test'
import { draftFrom, OWNER } from './setup-draft.mjs'

export interface ApiResult<T> {
  status: number
  body: T
}

export async function api<T = unknown>(page: Page, name: string, body: unknown = {}): Promise<ApiResult<T>> {
  return page.evaluate(
    async ({ path, text }) => {
      const res = window.bismuth
        ? await window.bismuth.api({ path, body: text })
        : await fetch(path, { method: 'POST', body: text }).then(async (r) => ({
            status: r.status,
            body: await r.text()
          }))
      return { status: res.status, body: res.body ? (JSON.parse(res.body) as unknown) : null }
    },
    { path: `/api/${name}`, text: JSON.stringify(body) }
  ) as Promise<ApiResult<T>>
}

/** Sets the hotel up with the small e2e draft unless it is set up already; the window is then the owner's. */
export async function completeSetup(page: Page): Promise<string[]> {
  const state = await api<{ setup: string }>(page, 'auth.state')
  if (state.body.setup === 'done') return []
  const options = await api(page, 'setup.options')
  expect(options.status).toBe(200)
  const finish = await api<{ recoveryCodes: string[] }>(page, 'setup.finish', draftFrom(options.body))
  expect(finish.status, JSON.stringify(finish.body)).toBe(200)
  // The first-run tour (features/guide) stays off for new accounts in the tests; guide.spec turns it on.
  const tour = await api(page, 'settings.set', { 'guide.tourForNewUsers': false })
  expect(tour.status, JSON.stringify(tour.body)).toBe(200)
  return finish.body.recoveryCodes
}

export async function signIn(page: Page, username = OWNER.username, secret = OWNER.password): Promise<void> {
  const res = await api(page, 'auth.signIn', { username, secret })
  expect(res.status, JSON.stringify(res.body)).toBe(200)
}

/** Reloads the page and waits for the app (after a sign-in change made through the API). */
export async function reload(page: Page, hash?: string): Promise<void> {
  if (hash !== undefined) await page.goto(page.url().replace(/#.*$/, '') + hash)
  await page.reload()
  await page.getByTestId('app-ready').waitFor({ state: 'attached' })
}
