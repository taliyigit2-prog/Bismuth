#!/usr/bin/env node
// npm run ui:shot -- [--routes calendar,settings] [--out dir] [--lang ru | --langs tr,en,ru] [--port 47374] [--wait 300]
//   [--full] [--size 1280x720,1366x768,…] [--scale 1,1.25,1.5] [--width 390] [--metrics .tmp/ui-shot/metrics.json]
// (builds first). --full also captures the whole desktop page, not only the window.
// Screenshots for the ui-reviewer and screen-auditor agents and for the owner: desktop (the real Electron app, default
// 1366×768) and phone 390×844 (same bundle over HTTP), each in light and dark theme. `node scripts/ui-shot.mjs` alone
// skips the build (use only right after `npm run build`).
// --size   desktop window content sizes, WxH, comma separated (default 1366x768). The phone ignores it.
// --scale  Electron device scale factor, comma separated (default 1; 1.25 = Windows 125 %). One Electron launch per value.
// --langs  languages, comma separated (default: --lang, which is tr). The phone runs every language too.
// --metrics writes layout measurements as JSON (horizontal overflow, clipped text, off-viewport interactive elements,
//          horizontally scrolling containers, phone targets under 44×44 px) with a summary. Off unless given.
// File names: <route>-<desktop|mobile>-<light|dark>.png. When --size, --scale or --langs is given the name also gets
// <WxH>, x<scale> and the language: <route>-desktop-1366x768-x1.25-light-tr.png (plain runs keep the short names).
// A fresh data folder starts in the setup wizard (Faz 4): `setup…` and `connect` are shot there; every other route
// after the hotel is set up through the API (tests/e2e/setup-draft.mjs) with the owner signed in. `login` and
// `recover` are shot signed out, `lock` locked, `change-password` as the receptionist whose password the owner set.
// `<route>@menu` opens the account menu before the shot (e.g. `calendar@menu`); `<route>@bottom` scrolls every
// inner scroll area to its end first (the wizard card's lower part, e.g. `setup?step=8@bottom`).
import { spawn } from 'node:child_process'
import { basename, dirname, join, resolve } from 'node:path'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { _electron, chromium, devices } from '@playwright/test'
import { draftFrom, OWNER, RECEPTION } from '../tests/e2e/setup-draft.mjs'

const root = resolve(import.meta.dirname, '..')
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback
}
const THEMES = ['light', 'dark']
const LANGS = ['tr', 'en', 'ru']

const routes = arg('routes', 'calendar,today,settings,theme-preview,about').split(',').filter(Boolean)
const out = resolve(arg('out', join(root, '.tmp', 'ui-shot')))
const langs = arg('langs', arg('lang', 'tr')).split(',').filter(Boolean)
for (const l of langs) if (!LANGS.includes(l)) throw new Error(`--langs: "${l}" (expected tr, en or ru)`)
const sizes = arg('size', '1366x768').split(',').filter(Boolean).map(parseSize)
const scales = arg('scale', '1').split(',').filter(Boolean).map(parseScale)
const metricsPath = arg('metrics', '') ? resolve(arg('metrics', '')) : null
const wait = Number(arg('wait', '300'))
const fullDesktop = process.argv.includes('--full')
// Plain runs keep the old file names; a run that asks for sizes, scales or languages names each file fully.
const multi = ['--size', '--scale', '--langs'].some((flag) => process.argv.includes(flag))
const records = []
mkdirSync(out, { recursive: true })

function parseSize(text) {
  const m = /^(\d{3,5})x(\d{3,5})$/.exec(text.trim())
  if (!m) throw new Error(`--size: "${text}" (expected WxH, e.g. 1366x768)`)
  return { w: Number(m[1]), h: Number(m[2]) }
}

function parseScale(text) {
  const n = Number(text)
  if (!(n >= 1 && n <= 3)) throw new Error(`--scale: "${text}" (expected 1 to 3, e.g. 1.25)`)
  return n
}

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

/**
 * Runs in the page (serialized by Playwright, so no closures): layout measurements of the current viewport.
 * Horizontal scrollers (calendar tape, wide tables) are listed, not counted as overflow: the reader decides.
 */
function measurePage(kind) {
  const vw = document.documentElement.clientWidth
  const interactive =
    'button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=link], [role=menuitem], [role=tab], [role=radio], [role=checkbox], [role=switch]'
  const label = (el) => {
    const id = el.getAttribute('data-testid')
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40)
    return `${el.tagName.toLowerCase()}${id ? `[data-testid=${id}]` : ''}${text ? ` "${text}"` : ''}`
  }
  const scrollsX = (el) =>
    el.clientWidth > 0 &&
    /auto|scroll/.test(getComputedStyle(el).overflowX) &&
    el.scrollWidth > el.clientWidth + 1
  const inScroller = (el) => {
    for (let p = el.parentElement; p; p = p.parentElement) if (scrollsX(p)) return true
    return false
  }
  const shown = (el) => {
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    return (
      cs.display !== 'none' &&
      cs.visibility !== 'hidden' &&
      cs.pointerEvents !== 'none' &&
      r.width > 0 &&
      r.height > 0 &&
      !el.closest('[aria-hidden="true"]')
    )
  }
  const offViewport = []
  const clipped = []
  const scrollers = []
  const smallTargets = []
  for (const el of document.querySelectorAll('body *')) {
    if (!shown(el)) continue
    if (scrollsX(el)) scrollers.push(`${label(el)} ${el.scrollWidth} > ${el.clientWidth}`)
    const r = el.getBoundingClientRect()
    if (el.matches(interactive) && (r.right > vw + 1 || r.left < -1) && !inScroller(el)) {
      offViewport.push(`${label(el)} x ${Math.round(r.left)}..${Math.round(r.right)}`)
    }
    const cs = getComputedStyle(el)
    const ownText = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim())
    if (
      ownText &&
      // Wider than 4 px: screen-reader-only text (1 px boxes with overflow hidden) is not a visible cut.
      el.clientWidth > 4 &&
      el.scrollWidth > el.clientWidth + 1 &&
      (/hidden|clip/.test(cs.overflowX) || cs.textOverflow === 'ellipsis')
    ) {
      clipped.push(`${label(el)} ${el.scrollWidth} > ${el.clientWidth}`)
    }
    if (kind === 'mobile' && el.matches(interactive)) {
      // A native checkbox/radio is measured by its label; a control wrapped in a label or with an absolutely
      // positioned ::after hit area (the project's max-md pattern) counts by that larger box.
      let box = r
      if (el.tagName === 'INPUT' && el.labels?.length && /checkbox|radio/.test(el.type)) {
        box = el.labels[0].getBoundingClientRect()
      }
      const lab = el.closest('label')
      if (lab && lab !== el) {
        const lr = lab.getBoundingClientRect()
        if (lr.width * lr.height > box.width * box.height) box = lr
      }
      const after = getComputedStyle(el, '::after')
      if (after.position === 'absolute' && after.content !== 'none') {
        const w = parseFloat(after.width)
        const h = parseFloat(after.height)
        if (w > box.width && h > box.height) box = { width: w, height: h }
      }
      if (box.width < 44 || box.height < 44) {
        smallTargets.push(`${label(el)} ${Math.round(box.width)}x${Math.round(box.height)}`)
      }
    }
  }
  const list = (items) => ({ count: items.length, sample: items.slice(0, 20) })
  return {
    horizontalOverflowPx: Math.max(0, document.documentElement.scrollWidth - vw),
    offViewport: list(offViewport),
    clipped: list(clipped),
    horizontalScrollers: list(scrollers),
    smallTargets: kind === 'mobile' ? list(smallTargets) : null
  }
}

function fileName(route, { kind, size, scale, theme, lang }) {
  const base = `${route.replace(/[?=&@]/g, '-')}-${kind}`
  if (!multi) return `${base}-${theme}.png`
  return (
    [base, size && `${size.w}x${size.h}`, scale !== 1 && `x${scale}`, theme, lang].filter(Boolean).join('-') +
    '.png'
  )
}

/** One screenshot (+ measurements) of a route in the given size, theme and language. */
async function shoot(page, ctx, route) {
  const { kind, size, theme } = ctx
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
  const file = join(out, fileName(route, ctx))
  if (ctx.fullGrow) {
    // The desktop shell scrolls inside its main area, not the document: grow the window to the content.
    const height = await page.evaluate(() =>
      Math.max(0, ...[...document.querySelectorAll('main, main *')].map((el) => el.scrollHeight + 80))
    )
    await ctx.setSize({ w: size.w, h: Math.min(Math.max(size.h, height), 6000) })
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
  const measured = await page.evaluate(measurePage, kind)
  records.push({
    route,
    kind,
    size: size ? `${size.w}x${size.h}` : null,
    scale: ctx.scale,
    theme,
    lang: ctx.lang,
    file: basename(file),
    ...measured
  })
  await page.screenshot({ path: file, fullPage: kind === 'mobile' })
  if (ctx.fullGrow) await ctx.setSize(size)
  console.log(file)
}

/**
 * Every (size × language × theme × route) of one surface. `sizes` is `[null]` for the phone (no window sizes).
 */
async function shootAll(page, kind, { sizes: sizeList, scale, setSize, fullGrow }) {
  const ctxOf = (size, lang, theme) => ({ kind, size, scale, lang, theme, setSize, fullGrow })
  // The wizard and the connection screen: before the hotel is set up.
  if (setupRoutes.length) {
    for (const size of sizeList) {
      if (size) await setSize(size)
      for (const lang of langs) {
        for (const theme of THEMES) {
          await must(page, 'settings.set', { 'ui.theme': theme, 'ui.language': lang })
          for (const route of setupRoutes) await shoot(page, ctxOf(size, lang, theme), route)
        }
      }
    }
  }
  if (!appRoutes.length) return
  await completeSetup(page)
  for (const size of sizeList) {
    if (size) await setSize(size)
    for (const lang of langs) {
      for (const theme of THEMES) {
        await must(page, 'settings.set', { 'ui.theme': theme, 'ui.language': lang })
        for (const route of appRoutes) {
          const restore = await prepare(page, route)
          await shoot(page, ctxOf(size, lang, theme), route)
          await restore()
        }
      }
    }
  }
}

/** Desktop: the real app with a throw-away data folder, one launch per device scale factor. */
async function runDesktop(scale) {
  const userData = mkdtempSync(join(tmpdir(), 'bismuth-shot-'))
  const app = await _electron.launch({
    args: [
      root,
      ...(process.platform === 'linux' ? ['--no-sandbox'] : []),
      ...(scale === 1 ? [] : [`--force-device-scale-factor=${scale}`])
    ],
    env: {
      ...process.env,
      BISMUTH_USER_DATA: userData,
      ELECTRON_RENDERER_URL: '',
      // Screenshots never reach the internet: online data goes to a closed port unless a fake server is given.
      BISMUTH_EXTERNAL_ORIGIN: process.env.BISMUTH_EXTERNAL_ORIGIN ?? 'http://127.0.0.1:9'
    }
  })
  try {
    const win = await app.firstWindow()
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].unmaximize())
    const setSize = (size) =>
      app.evaluate(
        ({ BrowserWindow }, { w, h }) => BrowserWindow.getAllWindows()[0].setContentSize(w, h),
        size
      )
    await win.getByTestId('app-ready').waitFor({ state: 'attached' })
    await shootAll(win, 'desktop', { sizes, scale, setSize, fullGrow: fullDesktop })
  } finally {
    await app.close()
    rmSync(userData, { recursive: true, force: true })
  }
}

/** Phone: same bundle over HTTP (e2e harness server, started in the wizard so both phases work the same way). */
async function runPhone() {
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
    await shootAll(page, 'mobile', { sizes: [null], scale: 1, setSize: null, fullGrow: false })
    await browser.close()
  } finally {
    stopServer()
  }
}

function writeMetrics() {
  const total = (key) => records.reduce((n, r) => n + (r[key]?.count ?? 0), 0)
  const summary = {
    shots: records.length,
    shotsWithHorizontalOverflow: records.filter((r) => r.horizontalOverflowPx > 0).length,
    offViewport: total('offViewport'),
    clipped: total('clipped'),
    horizontalScrollers: total('horizontalScrollers'),
    smallTargets: total('smallTargets')
  }
  mkdirSync(dirname(metricsPath), { recursive: true })
  writeFileSync(
    metricsPath,
    JSON.stringify({ generatedAt: new Date().toISOString(), summary, records }, null, 2) + '\n'
  )
  console.log(metricsPath, JSON.stringify(summary))
}

for (const scale of scales) await runDesktop(scale)
await runPhone()
if (metricsPath) writeMetrics()
