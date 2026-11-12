#!/usr/bin/env node
// npm run ui:shot -- [--routes calendar,settings] [--out dir] [--lang ru] [--port 47374] [--wait 300] [--full]
// (builds first). --full also captures the whole desktop page, not only the 1366×768 window.
// Screenshots for the ui-reviewer agent and for the owner: desktop 1366×768 (the real Electron app)
// and phone 390×844 (same bundle over HTTP), each in light and dark theme. `node scripts/ui-shot.mjs` alone
// skips the build (use only right after `npm run build`).
// File names: <route>-<desktop|mobile>-<light|dark>.png
// A fresh data folder starts in the setup wizard (Faz 4): `setup…` and `connect` are shot there; every other route
// after the hotel is set up through the API (tests/e2e/setup-draft.mjs) with the owner signed in. `login` and
// `recover` are shot signed out, `lock` locked, `change-password` as the receptionist whose password the owner set.
// `<route>@menu` opens the account menu before the shot (e.g. `calendar@menu`); `<route>@bottom` scrolls every
// inner scroll area to its end first (the wizard card's lower part, e.g. `setup?step=8@bottom`).
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron, chromium, devices } from '@playwright/test'
import { draftFrom, OWNER, RECEPTION } from '../tests/e2e/setup-draft.mjs'

const root = resolve(import.meta.dirname, '..')
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 ? process.argv[i + 1] : fallback
}
const routes = arg('routes', 'calendar,today,settings,theme-preview,about').split(',').filter(Boolean)
const out = resolve(arg('out', join(root, '.tmp', 'ui-shot')))
const lang = arg('lang', 'tr')
const wait = Number(arg('wait', '300'))
const fullDesktop = process.argv.includes('--full')
mkdirSync(out, { recursive: true })

const isSetupRoute = (route) => /^(setup|connect)(\?|$)/.test(route)
const setupRoutes = routes.filter(isSetupRoute)
const appRoutes = routes.filter((r) => !isSetupRoute(r))

/** A contract call from inside the page: the Electron bridge (the window's session) or HTTP (phone harness). */
async function api(page, name, body = {}) {
  return page.evaluate(
    async ({ path, text }) => {
      const res = window.bismuth
        ? await window.bismuth.api({ path, body: text })
        : await fetch(path, { method: 'POST', body: text }).then(async (r) => ({
            status: r.status,
            body: await r.text()
          }))
      return { status: res.status, body: res.body ? JSON.parse(res.body) : null }
    },
    { path: `/api/${name}`, text: JSON.stringify(body) }
  )
}

async function must(page, name, body) {
  const res = await api(page, name, body)
  if (res.status !== 200) throw new Error(`${name}: ${res.status} ${JSON.stringify(res.body)}`)
  return res.body
}

async function completeSetup(page) {
  const state = await must(page, 'auth.state')
  if (state.setup === 'done') return
  await must(page, 'setup.finish', draftFrom(await must(page, 'setup.options')))
  // The first-run tour (Ayarlar → Kılavuz) would cover the screens being shot; `guide` routes show it on purpose.
  await must(page, 'settings.set', { 'guide.tourForNewUsers': false })
}

const signInOwner = (page) => must(page, 'auth.signIn', { username: OWNER.username, secret: OWNER.password })

/** Puts the window in the sign-in state the route needs; returns how to restore the owner afterwards. */
async function prepare(page, route) {
  const path = route.split(/[?@]/)[0]
  if (path === 'login' || path === 'recover') {
    await must(page, 'auth.signOut')
    return () => signInOwner(page)
  }
  if (path === 'lock') {
    await must(page, 'auth.lock')
    return () => must(page, 'auth.unlock', { secret: OWNER.pin })
  }
  if (path === 'change-password') {
    // The receptionist from the draft has a password the owner set: the forced change screen.
    await must(page, 'auth.signIn', { username: RECEPTION.username, secret: RECEPTION.password })
    return () => signInOwner(page)
  }
  return async () => {}
}

async function shoot(page, kind, theme, route, resize) {
  const [address, extra] = route.split('@')
  await page.goto(page.url().replace(/#.*$/, '') + `#/${address}`)
  await page.reload()
  await page.getByTestId('app-ready').waitFor({ state: 'attached' })
  await page.waitForTimeout(wait)
  if (extra === 'menu') {
    await page.getByTestId('user-menu').click()
    await page.getByTestId('user-menu-content').waitFor()
    await page.waitForTimeout(250)
  }
  // `settings?tab=roles` → `settings-tab-roles` (portable file names).
  const file = join(out, `${route.replace(/[?=&@]/g, '-')}-${kind}-${theme}.png`)
  if (resize) {
    // The desktop shell scrolls inside its main area, not the document: grow the window to the content.
    const height = await page.evaluate(() =>
      Math.max(768, ...[...document.querySelectorAll('main, main *')].map((el) => el.scrollHeight + 80))
    )
    await resize(Math.min(height, 6000))
    await page.waitForTimeout(250)
  }
  if (extra === 'bottom') {
    await page.evaluate(() => {
      for (const el of document.querySelectorAll('*')) {
        if (el.scrollHeight > el.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(el).overflowY))
          el.scrollTop = el.scrollHeight
      }
    })
    await page.waitForTimeout(250)
  }
  await page.screenshot({ path: file, fullPage: kind === 'mobile' })
  if (resize) await resize(768)
  console.log(file)
}

async function shootAll(page, kind, resize) {
  // The wizard and the connection screen: before the hotel is set up.
  for (const theme of ['light', 'dark']) {
    if (!setupRoutes.length) break
    await must(page, 'settings.set', { 'ui.theme': theme, 'ui.language': lang })
    for (const route of setupRoutes) await shoot(page, kind, theme, route, resize)
  }
  if (!appRoutes.length) return
  await completeSetup(page)
  for (const theme of ['light', 'dark']) {
    await must(page, 'settings.set', { 'ui.theme': theme, 'ui.language': lang })
    for (const route of appRoutes) {
      const restore = await prepare(page, route)
      await shoot(page, kind, theme, route, resize)
      await restore()
    }
  }
}

// Desktop: the real app with a throw-away data folder.
const userData = mkdtempSync(join(tmpdir(), 'bismuth-shot-'))
const app = await _electron.launch({
  args: [root, ...(process.platform === 'linux' ? ['--no-sandbox'] : [])],
  env: {
    ...process.env,
    BISMUTH_USER_DATA: userData,
    ELECTRON_RENDERER_URL: '',
    // Screenshots never reach the internet: online data goes to a closed port unless a fake server is given.
    BISMUTH_EXTERNAL_ORIGIN: process.env.BISMUTH_EXTERNAL_ORIGIN ?? 'http://127.0.0.1:9'
  }
})
const win = await app.firstWindow()
await app.evaluate(({ BrowserWindow }) => {
  const w = BrowserWindow.getAllWindows()[0]
  w.unmaximize()
  w.setContentSize(1366, 768)
})
await win.getByTestId('app-ready').waitFor({ state: 'attached' })
await shootAll(
  win,
  'desktop',
  fullDesktop
    ? (height) =>
        app.evaluate(
          ({ BrowserWindow }, h) => BrowserWindow.getAllWindows()[0].setContentSize(1366, h),
          height
        )
    : null
)
await app.close()
rmSync(userData, { recursive: true, force: true })

// Phone: same bundle over HTTP (e2e harness server, started in the wizard so both phases work the same way).
const port = Number(arg('port', '47374'))
const server = spawn('npx', ['tsx', '--tsconfig', 'tsconfig.node.json', 'tests/e2e/mobile/server.ts'], {
  cwd: root,
  env: { ...process.env, E2E_PORT: String(port), E2E_SETUP: '0' },
  stdio: 'ignore',
  shell: process.platform === 'win32',
  // Its own process group: npx starts tsx, which starts node; all of them stop with it (no stale server on the port).
  detached: process.platform !== 'win32'
})
const stopServer = () => {
  try {
    if (process.platform === 'win32') server.kill()
    else process.kill(-server.pid)
  } catch {
    // already gone
  }
}
try {
  await new Promise((r) => setTimeout(r, Number(arg('boot', '4000'))))
  const browser = await chromium.launch(
    process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}
  )
  const context = await browser.newContext({
    ...devices['iPhone 13'],
    viewport: { width: Number(arg('width', '390')), height: 844 }
  })
  const page = await context.newPage()
  await page.goto(`http://127.0.0.1:${port}/`)
  await page.getByTestId('app-ready').waitFor({ state: 'attached' })
  await shootAll(page, 'mobile')
  await browser.close()
} finally {
  stopServer()
}
