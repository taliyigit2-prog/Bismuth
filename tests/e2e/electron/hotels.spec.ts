// P21b (K-54): one client computer, two hotels, each with its own main computer. The connection screen keeps both in
// a list; switching signs the window out of the earlier hotel and shows the other one's data; a main computer that
// is switched off says why it cannot be reached; the screen fits a phone-sized window.
// Ports: E2E_HOST_PORT (default 47530) and the next one.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Page } from '@playwright/test'
import { expect, test, type AppFixtures } from './fixtures'
import { api, reload } from '../bridge'
import { OWNER } from '../setup-draft.mjs'

const PORT_A = Number(process.env['E2E_HOST_PORT'] ?? 47530)
const PORT_B = PORT_A + 1
const folders: string[] = []
const fresh = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'bismuth-hotels-e2e-'))
  folders.push(dir)
  return dir
}
test.afterAll(() => {
  for (const dir of folders.splice(0)) rmSync(dir, { recursive: true, force: true })
})

async function startHost(launch: AppFixtures['launch'], port: number, name: string) {
  const host = await launch({ dir: fresh() })
  expect((await api(host.page, 'settings.set', { 'host.port': port, 'hotel.name': name })).status).toBe(200)
  await reload(host.page, '#/settings?tab=remote')
  await host.page.getByTestId('remote-mode-server').click()
  await expect(host.page.getByTestId('server-on')).toBeVisible()
  return host
}

async function signInAt(page: Page): Promise<void> {
  await expect(page).toHaveURL(/#\/login/)
  await page.getByTestId('username').fill(OWNER.username)
  await page.getByTestId('secret').fill(OWNER.password)
  await page.getByTestId('sign-in').click()
  await expect(page.getByTestId('connection-badge')).toHaveAttribute('data-status', 'online')
}

const hotelName = async (page: Page): Promise<string> =>
  (await api<Record<string, string>>(page, 'settings.get')).body['hotel.name'] ?? ''

test('iki otel: bağlan ekranında liste, otel değiştirince oturum ve veri karışmaz, kapalı otelin nedeni yazılır', async ({
  launch
}) => {
  test.setTimeout(300_000)
  const hostA = await startHost(launch, PORT_A, 'Lale Beyoğlu')
  const hostB = await startHost(launch, PORT_B, 'Bosphorus Inn')

  const client = await launch({ dir: fresh(), setup: false })
  const page = client.page
  await page.goto(page.url().replace(/#.*$/, '#/setup'))
  await page.getByTestId('setup-step-body').waitFor()
  await page.getByTestId('setup-next').click()
  await page.getByTestId('setup-mode-client').click()
  await page.getByTestId('setup-next').click()
  await expect(page.getByTestId('connect')).toBeVisible()
  await expect(page.getByTestId('hotel-list-empty')).toBeVisible()

  // A wrong address says why before anything is sent.
  await page.getByTestId('connect-address').fill('https://127.0.0.1')
  await page.getByTestId('connect-submit').click()
  await expect(page.getByText(/https desteklenmez/)).toBeVisible()

  // The first hotel.
  await page.getByTestId('connect-address').fill(`127.0.0.1:${PORT_A}`)
  await page.getByTestId('connect-submit').click()
  await signInAt(page)
  expect(await hotelName(page)).toBe('Lale Beyoğlu')

  // To the connection screen from the settings; the hotel in use is in the list.
  const leaveHotel = async (): Promise<void> => {
    await reload(page, '#/settings?tab=remote')
    await page.getByRole('button', { name: 'Başka ana bilgisayar seç' }).click()
    await expect(page.getByTestId('connect')).toBeVisible()
  }
  await leaveHotel()
  await expect(page.getByTestId('hotel-row')).toHaveCount(1)
  await expect(page.getByTestId('hotel-row').first()).toContainText('Lale Beyoğlu')
  await expect(page.getByTestId('hotel-fingerprint').first()).toHaveText(/^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/)

  // The second hotel: its own sign-in and its own data.
  await page.getByTestId('connect-address').fill(`127.0.0.1:${PORT_B}`)
  await page.getByTestId('connect-submit').click()
  await signInAt(page)
  expect(await hotelName(page)).toBe('Bosphorus Inn')

  // Back to the first from the list: signed out there (a new window session), then its data.
  await leaveHotel()
  await expect(page.getByTestId('hotel-row')).toHaveCount(2)
  if (process.env['HOTELS_SHOTS'])
    await page.screenshot({ path: `${process.env['HOTELS_SHOTS']}/connect-list.png` })
  await page.getByTestId('hotel-row').filter({ hasText: 'Lale Beyoğlu' }).getByTestId('hotel-connect').click()
  await signInAt(page)
  expect(await hotelName(page)).toBe('Lale Beyoğlu')

  // Renaming a hotel from the list.
  await leaveHotel()
  const row = page.getByTestId('hotel-row').filter({ hasText: 'Bosphorus Inn' })
  await row.getByTestId('hotel-edit').click()
  await page.getByTestId('hotel-name').fill('Boğaz Oteli')
  await page.getByTestId('hotel-save').click()
  await expect(page.getByTestId('hotel-row').filter({ hasText: 'Boğaz Oteli' })).toHaveCount(1)

  // The second main computer is switched off: the screen says it cannot be reached, and which address.
  await hostB.app.close()
  await page.getByTestId('hotel-row').filter({ hasText: 'Boğaz Oteli' }).getByTestId('hotel-connect').click()
  const error = page.getByTestId('connect-error')
  await expect(error).toContainText(`127.0.0.1:${PORT_B}`)
  await expect(error).toContainText(/ulaşılamadı|zamanında yanıt vermedi/)

  // Phone-sized window: no sideways scrolling, 44 px rows.
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByTestId('hotel-row')).toHaveCount(2)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
  for (const button of await page.getByTestId('hotel-connect').all())
    expect((await button.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  for (const button of await page.getByTestId('hotel-edit').all())
    expect((await button.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  if (process.env['HOTELS_SHOTS'])
    await page.screenshot({ path: `${process.env['HOTELS_SHOTS']}/connect-phone.png` })

  // Removing a hotel asks first and keeps the other.
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.getByTestId('hotel-row').filter({ hasText: 'Boğaz Oteli' }).getByTestId('hotel-remove').click()
  await page.getByTestId('hotel-remove-confirm').click()
  await expect(page.getByTestId('hotel-row')).toHaveCount(1)
  await expect(page.getByTestId('hotel-row')).toContainText('Lale Beyoğlu')
  await hostA.app.close()
})
