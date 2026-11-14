#!/usr/bin/env node
// npm run guide:shots -- [--lang tr,en,ru] [--only calendar,ledger] [--wait 900]
// (builds first; `node scripts/guide-shots.mjs` alone skips the build). The pictures of the program's guide (G-18,
// K-40): the real Electron app on the invented demo hotel (scripts/guide-shots-seed.ts → src/main/db/seed/demo; no
// real person or amount), light theme, one set per language, saved as src/renderer/guide/img/<lang>/<name>.jpg.
// Desktop pictures are taken at 1366×768 and stored 1100 px wide; phone pictures at 390×844. JPEG, quality 78: the
// whole set stays under 8 MB (the script prints the total). Run it again after screens change (final polish round).
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron } from '@playwright/test'

const root = resolve(import.meta.dirname, '..')
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 ? process.argv[i + 1] : fallback
}
const langs = arg('lang', 'tr,en,ru').split(',').filter(Boolean)
const only = arg('only', '').split(',').filter(Boolean)
const wait = Number(arg('wait', '900'))
const QUALITY = 78
const DESKTOP_WIDTH = 1100
const PASSWORD = 'demo-sifre-1'
const NEW_PASSWORD = 'kilavuz-sifre-1'

const label = (lang, key) =>
  key
    .split('.')
    .reduce(
      (node, part) => node?.[part],
      JSON.parse(readFileSync(join(root, `src/renderer/i18n/${lang}.json`), 'utf8'))
    )

/** A contract call from inside the window (the Electron bridge keeps the window's session). */
async function must(page, name, body = {}) {
  const res = await page.evaluate(
    async ({ path, text }) => {
      const r = await window.bismuth.api({ path, body: text })
      return { status: r.status, body: r.body ? JSON.parse(r.body) : null }
    },
    { path: `/api/${name}`, text: JSON.stringify(body) }
  )
  if (res.status !== 200) throw new Error(`${name}: ${res.status} ${JSON.stringify(res.body)}`)
  return res.body
}

/** Every picture: name, address, and what to open before the shot. */
const DESKTOP = [
  { name: 'today', hash: 'today' },
  { name: 'calendar', hash: 'calendar' },
  {
    name: 'new-reservation',
    hash: 'calendar',
    prepare: async (page, lang) => {
      await page.getByRole('button', { name: label(lang, 'calendar.newReservation'), exact: true }).click()
      await page.getByRole('dialog').waitFor()
    }
  },
  { name: 'reservation-panel', hash: 'calendar', prepare: (page) => openStay(page) },
  {
    name: 'payment-dialog',
    hash: 'calendar',
    prepare: async (page) => {
      await openStay(page)
      await page.getByTestId('panel-pay').click()
      await page.getByTestId('payment-save').waitFor()
    }
  },
  { name: 'ledger', hash: 'ledger' },
  {
    name: 'cash-drawer',
    hash: 'ledger',
    prepare: async (page) => {
      await page.getByTestId('cash-drawer-button').click()
      await page.getByTestId('cash-drawer-sheet').waitFor()
    }
  },
  {
    name: 'expense-dialog',
    hash: 'ledger',
    prepare: async (page) => {
      await page.getByTestId('add-expense').click()
      await page.getByTestId('ledger-expense-save').waitFor()
    }
  },
  { name: 'guests', hash: 'guests' },
  {
    name: 'guest-card',
    hash: 'guests',
    prepare: async (page) => {
      await page.locator('[data-testid^="guest-row-"]').first().click()
      await page.getByTestId('guest-sheet').waitFor()
    }
  },
  { name: 'blacklist', hash: 'blacklist' },
  { name: 'in-house', hash: 'in-house' },
  { name: 'rooms', hash: 'rooms' },
  {
    name: 'issue-dialog',
    hash: 'issues',
    prepare: async (page) => {
      await page.getByTestId('issue-report').first().click()
      await page.getByTestId('issue-form').waitFor()
    }
  },
  { name: 'tasks', hash: 'tasks' },
  { name: 'maintenance', hash: 'maintenance' },
  { name: 'shift', hash: 'shift' },
  { name: 'staff', hash: 'staff' },
  { name: 'contacts', hash: 'contacts' },
  { name: 'supply', hash: 'supply' },
  { name: 'laundry', hash: 'laundry' },
  { name: 'lost-items', hash: 'lost-items' },
  { name: 'currency', hash: 'currency' },
  { name: 'month-end', hash: 'month-end' },
  { name: 'reports', hash: 'reports' },
  { name: 'calendar-notes', hash: 'calendar-notes' },
  { name: 'tourism', hash: 'tourism' },
  { name: 'backup', hash: 'settings?tab=backup' },
  { name: 'settings-users', hash: 'settings?tab=users' },
  { name: 'settings-remote', hash: 'settings?tab=remote' },
  { name: 'settings-general', hash: 'settings' },
  { name: 'guide', hash: 'guide?s=reservations' }
]

const PHONE = [
  { name: 'phone-today', hash: 'today' },
  { name: 'phone-calendar', hash: 'calendar' },
  {
    name: 'phone-more',
    hash: 'today',
    prepare: async (page) => {
      await page.getByTestId('nav-more').click()
      await page.getByTestId('more-sheet').waitFor()
    }
  }
]

/** Opens a reservation that is in the house today (or else the first bar on screen). */
async function openStay(page) {
  const bars = page.locator('[data-testid^="stay-"]')
  await bars.first().waitFor()
  const inHouse = await must(page, 'inHouse.list', {})
  const ids = inHouse.rooms.map((r) => r.stayId)
  let bar = bars.nth(Math.min(3, (await bars.count()) - 1))
  for (const id of ids.slice(1)) {
    const candidate = page.getByTestId(`stay-${id}`)
    if (await candidate.isVisible()) {
      bar = candidate
      break
    }
  }
  await bar.click()
  await page.getByTestId('reservation-panel').waitFor()
}

const want = (shot) => only.length === 0 || only.includes(shot.name)

async function launch(dir) {
  const app = await _electron.launch({
    args: [root, ...(process.platform === 'linux' ? ['--no-sandbox'] : [])],
    env: {
      ...process.env,
      BISMUTH_USER_DATA: dir,
      BISMUTH_DRIVE_HOME: dir,
      ELECTRON_RENDERER_URL: '',
      // The pictures never reach the internet: online data goes to a closed port.
      BISMUTH_EXTERNAL_ORIGIN: 'http://127.0.0.1:9'
    },
    cwd: root
  })
  const page = await app.firstWindow()
  await page.getByTestId('app-ready').waitFor({ state: 'attached' })
  return { app, page }
}

const resize = (app, width, height) =>
  app.evaluate(
    ({ BrowserWindow }, size) => {
      const w = BrowserWindow.getAllWindows()[0]
      w.unmaximize()
      // The window's own minimum is wider than a phone; the phone pictures need the narrow layout.
      w.setMinimumSize(320, 480)
      w.setContentSize(size.width, size.height)
    },
    { width, height }
  )

/** JPEG of the window; desktop pictures scaled down in the main process (no image library needed). */
async function shoot(app, page, lang, name, phone) {
  await page.mouse.move(0, 0)
  const png = await page.screenshot({ type: 'png' })
  const b64 = await app.evaluate(
    ({ nativeImage }, input) => {
      let img = nativeImage.createFromBuffer(Buffer.from(input.png, 'base64'))
      if (input.width) img = img.resize({ width: input.width, quality: 'best' })
      return img.toJPEG(input.quality).toString('base64')
    },
    { png: png.toString('base64'), width: phone ? 0 : DESKTOP_WIDTH, quality: QUALITY }
  )
  const out = join(root, 'src/renderer/guide/img', lang, `${name}.jpg`)
  writeFileSync(out, Buffer.from(b64, 'base64'))
  console.log(out)
}

async function open(page, hash) {
  await page.goto(page.url().replace(/#.*$/, '') + `#/${hash}`)
  await page.reload()
  await page.getByTestId('app-ready').waitFor({ state: 'attached' })
  await page.waitForTimeout(wait)
}

async function shotsFor(lang) {
  mkdirSync(join(root, 'src/renderer/guide/img', lang), { recursive: true })

  // The setup wizard: a fresh data folder.
  if (want({ name: 'setup' })) {
    const fresh = mkdtempSync(join(tmpdir(), 'bismuth-guide-setup-'))
    const { app, page } = await launch(fresh)
    await resize(app, 1366, 768)
    await must(page, 'settings.set', { 'ui.language': lang, 'ui.theme': 'light' })
    await open(page, 'setup?step=6')
    await shoot(app, page, lang, 'setup', false)
    await app.close()
    rmSync(fresh, { recursive: true, force: true })
  }

  // Everything else: the invented demo hotel.
  const dir = mkdtempSync(join(tmpdir(), 'bismuth-guide-'))
  const seeded = spawnSync(
    'npx',
    ['tsx', '--tsconfig', 'tsconfig.node.json', 'scripts/guide-shots-seed.ts', dir, lang],
    { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' }
  )
  if (seeded.status !== 0) throw new Error('demo data could not be prepared')
  const { app, page } = await launch(dir)
  await resize(app, 1366, 768)
  if (want({ name: 'login' })) {
    await open(page, 'login')
    await shoot(app, page, lang, 'login', false)
  }
  await must(page, 'auth.signIn', { username: 'sahip', secret: PASSWORD })
  await must(page, 'auth.changePassword', { currentPassword: PASSWORD, newPassword: NEW_PASSWORD })
  await must(page, 'settings.set', { 'ui.language': lang, 'ui.theme': 'light', 'ui.tourDone': true })
  for (const shot of DESKTOP.filter(want)) {
    await open(page, shot.hash)
    if (shot.prepare) {
      await shot.prepare(page, lang)
      await page.waitForTimeout(400)
    }
    await shoot(app, page, lang, shot.name, false)
  }
  await resize(app, 390, 844)
  for (const shot of PHONE.filter(want)) {
    await open(page, shot.hash)
    if (shot.prepare) {
      await shot.prepare(page, lang)
      await page.waitForTimeout(400)
    }
    await shoot(app, page, lang, shot.name, true)
  }
  await app.close()
  rmSync(dir, { recursive: true, force: true })
}

for (const lang of langs) await shotsFor(lang)

let total = 0
for (const lang of readdirSync(join(root, 'src/renderer/guide/img')))
  for (const file of readdirSync(join(root, 'src/renderer/guide/img', lang)))
    total += statSync(join(root, 'src/renderer/guide/img', lang, file)).size
console.log(`guide pictures: ${(total / 1024 / 1024).toFixed(1)} MB`)
if (total > 8 * 1024 * 1024) {
  console.error('The guide pictures are over 8 MB: lower QUALITY or DESKTOP_WIDTH.')
  process.exit(1)
}
