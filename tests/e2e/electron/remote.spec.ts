// Faz 13 kabul ölçütleri (P13a), on this one machine: the hotel's computer runs server mode; a second Bismuth
// (its own data folder) is set to "connect to another Bismuth", finds the main computer (local-network list, or the
// address typed), signs in there with username and password, writes a reservation — the main computer shows it at
// once and lists the second computer as a device; when the main computer stops serving, the second one says so and
// comes back by itself. A phone-sized browser opens the main computer's address and shows the G-143 screens
// without horizontal scrolling. A computer started in client mode never creates a hotel database (yasak 13).
// Ports: E2E_HOST_PORT (default 47463).
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium, devices, type Page } from '@playwright/test'
import { expect, test, type AppFixtures } from './fixtures'
import { api, reload } from '../bridge'
import { overflowReport } from '../routes'
import { OWNER } from '../setup-draft.mjs'

const PORT = Number(process.env['E2E_HOST_PORT'] ?? 47463)
const HOST_URL = `http://127.0.0.1:${PORT}`
/** REMOTE_SHOTS=<dir>: screenshots for review. */
const shots = process.env['REMOTE_SHOTS']
const folders: string[] = []
const fresh = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'bismuth-remote-e2e-'))
  folders.push(dir)
  return dir
}
test.afterAll(() => {
  for (const dir of folders.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** The hotel's computer: set up, owner signed in, server mode on PORT. */
async function startHost(launch: AppFixtures['launch']) {
  // Screenshots show a hotel Wi-Fi and a NetBird address (this test machine has neither; development builds only).
  if (shots)
    process.env['BISMUTH_E2E_INTERFACES'] = JSON.stringify({ Ethernet: '192.168.1.20', wt0: '100.92.10.4' })
  const host = await launch({ dir: fresh() })
  delete process.env['BISMUTH_E2E_INTERFACES']
  expect((await api(host.page, 'settings.set', { 'host.port': PORT })).status).toBe(200)
  await reload(host.page, '#/settings?tab=remote')
  await host.page.getByTestId('remote-mode-server').click()
  await expect(host.page.getByTestId('server-on')).toBeVisible()
  if (shots) {
    await host.page.getByRole('button', { name: /^QR kodu: http:\/\/100\./ }).click()
    await expect(host.page.getByTestId('qr-code')).toBeVisible()
    await host.page.screenshot({ path: `${shots}/host-remote-desktop.png`, fullPage: true })
  }
  return host
}

async function signInAt(page: Page): Promise<void> {
  await expect(page).toHaveURL(/#\/login/)
  await page.getByTestId('username').fill(OWNER.username)
  await page.getByTestId('secret').fill(OWNER.password)
  await page.getByTestId('sign-in').click()
}

test('ikinci Bismuth istemci modunda bağlanır, oturum açar, rezervasyon yazar; ana bilgisayarda hemen görünür', async ({
  launch
}) => {
  test.setTimeout(300_000)
  const host = await startHost(launch)

  // The second computer: the wizard's "connect to another Bismuth" opens the connection screen.
  const client = await launch({ dir: fresh(), setup: false })
  await client.page.goto(client.page.url().replace(/#.*$/, '#/setup'))
  await client.page.getByTestId('setup-step-body').waitFor()
  await client.page.getByTestId('setup-next').click()
  await client.page.getByTestId('setup-mode-client').click()
  await client.page.getByTestId('setup-next').click()
  await expect(client.page).toHaveURL(/#\/connect/)
  await expect(client.page.getByTestId('connect')).toBeVisible()
  if (shots) {
    await expect(client.page.getByTestId('connect-search')).toBeEnabled({ timeout: 10_000 })
    await client.page.screenshot({ path: `${shots}/client-connect.png` })
  }

  // The main computer announces itself on the local network; where multicast works it is in the list.
  await expect(client.page.getByTestId('connect-search')).toBeEnabled({ timeout: 10_000 })
  const listed = await client.page.getByTestId('connect-found-host').count()
  test.info().annotations.push({ type: 'bonjour', description: `listed ${listed}` })
  await client.page.getByTestId('connect-address').fill(`127.0.0.1:${PORT}`)
  await client.page.getByTestId('connect-submit').click()

  // Signed in on the main computer with username and password (no names are listed over the network).
  await signInAt(client.page)
  await expect(client.page.getByTestId('connection-badge')).toHaveAttribute('data-status', 'online')

  // A reservation written from the second computer.
  await reload(client.page, '#/calendar')
  await client.page.getByRole('button', { name: 'Yeni rezervasyon' }).first().click()
  await client.page.getByRole('combobox', { name: 'Misafir' }).click()
  await client.page.getByPlaceholder('Ad ya da telefon…').fill('Deniz Yıldırım')
  await client.page.getByText('Yeni misafir: Deniz Yıldırım').click()
  await client.page.getByTestId('room-multi-picker').click()
  await client.page.getByTestId('room-option-101').getByRole('checkbox').click()
  await client.page.keyboard.press('Escape')
  await client.page.getByTestId('new-reservation-save').click()
  await expect(client.page.getByTestId('reservation-panel').getByTestId('panel-guest')).toHaveText(
    'Deniz Yıldırım'
  )

  // On the main computer at once: in its data and on its calendar.
  const day = (offset: number): string => {
    const d = new Date()
    d.setDate(d.getDate() + offset)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  const grid = await api<{ stays: { guestName: string }[] }>(host.page, 'reservations.grid', {
    from: day(-1),
    to: day(7)
  })
  expect(grid.body.stays.map((s) => s.guestName)).toContain('Deniz Yıldırım')
  await reload(host.page, '#/calendar')
  await expect(host.page.getByText('Deniz Yıldırım').first()).toBeVisible()

  // The main computer lists the second one as a device (its own window is the other desktop).
  await reload(host.page, '#/settings?tab=remote')
  await expect(host.page.getByTestId('device-list').locator('li[data-testid^="device-"]')).toHaveCount(2)

  // The main computer stops serving: the second one says so clearly; when it serves again the strip goes.
  await host.page.getByTestId('remote-mode-single').click()
  await expect(host.page.getByTestId('server-state')).toHaveCount(0)
  // Moving to another screen asks the main computer for its data: no answer.
  await client.page.evaluate(() => {
    window.location.hash = '#/today'
  })
  // Without a read-only copy yet: "no connection"; with the owner's copy (P13b, started at sign-in): the screens
  // read from it (replica.spec.ts covers that in full).
  await expect(client.page.getByTestId('connection-banner')).toHaveAttribute(
    'data-status',
    /^(offline|readonly)$/
  )
  if (process.env['REMOTE_SHOTS'])
    await client.page.screenshot({ path: `${process.env['REMOTE_SHOTS']}/client-offline-desktop.png` })
  await expect(client.page.getByTestId('connection-badge')).toContainText(/Bağlantı yok|Yedek kopya/)
  await host.page.getByTestId('remote-mode-server').click()
  await expect(host.page.getByTestId('server-on')).toBeVisible()
  await expect(client.page.getByTestId('connection-banner')).toHaveCount(0, { timeout: 20_000 })
})

test('telefon boyutunda tarayıcı ana bilgisayarı açar; G-143 ekranları yatay kaydırmasız', async ({
  launch
}) => {
  test.setTimeout(240_000)
  await startHost(launch)
  const browser = await chromium.launch(
    process.env['PW_CHROMIUM_PATH'] ? { executablePath: process.env['PW_CHROMIUM_PATH'] } : {}
  )
  try {
    const context = await browser.newContext({
      ...devices['iPhone 13'],
      viewport: { width: 390, height: 844 }
    })
    const page = await context.newPage()
    await page.goto(`${HOST_URL}/`)
    await signInAt(page)
    await expect(page.getByTestId('app-ready')).toHaveAttribute('data-layout', 'mobile')
    await expect(page.getByTestId('mobile-nav')).toBeVisible()
    // The session is an HttpOnly cookie: scripts cannot read it.
    expect(await page.evaluate(() => document.cookie)).toBe('')
    const cookies = await context.cookies()
    expect(cookies.find((c) => c.name === 'bismuth_session')).toMatchObject({
      httpOnly: true,
      sameSite: 'Strict'
    })
    for (const route of [
      'today',
      'calendar',
      'in-house',
      'tasks',
      'shift',
      'rooms',
      'guests',
      'ledger',
      'currency',
      'issues',
      'maintenance',
      'reports',
      'settings?tab=remote'
    ]) {
      await page.goto(`${HOST_URL}/#/${route}`)
      await page.getByTestId('app-ready').waitFor({ state: 'attached' })
      await page.getByRole('heading', { level: 1 }).first().waitFor()
      await page.waitForTimeout(300)
      expect(await page.evaluate(overflowReport), route).toEqual([])
    }
    // The calendar's seven-day view.
    await page.goto(`${HOST_URL}/#/calendar`)
    await page.getByTestId('calendar-view-week').click()
    await expect(page.getByTestId('week-day')).toHaveCount(7)
    expect(await page.evaluate(overflowReport)).toEqual([])
    if (shots) {
      await page.screenshot({ path: `${shots}/phone-week.png`, fullPage: true })
      await page.goto(`${HOST_URL}/#/settings?tab=remote`)
      await page.getByTestId('server-on').waitFor()
      await page.screenshot({ path: `${shots}/phone-remote.png`, fullPage: true })
    }
    // "Add to home screen": the manifest is served.
    const manifest = await page.request.get(`${HOST_URL}/manifest.webmanifest`)
    expect(manifest.status()).toBe(200)
    expect(await manifest.json()).toMatchObject({ name: 'Bismuth', display: 'standalone' })
    await context.close()
  } finally {
    await browser.close()
  }
})

test('istemci modunda açılan Bismuth otel veritabanı oluşturmaz (yasak 13)', async ({ launch }) => {
  const dir = fresh()
  writeFileSync(join(dir, 'connection.json'), JSON.stringify({ mode: 'client', hostUrl: null }))
  const client = await launch({ dir, setup: false })
  await expect(client.page).toHaveURL(/#\/connect/)
  await expect(client.page.getByTestId('connect')).toBeVisible()
  expect(existsSync(join(dir, 'bismuth.db')), readdirSync(dir).join(',')).toBe(false)
})
