// Faz 20 P20g in the real app: the camera setup (K-59) against stand-ins — the fake discovery answer (a JSON file instead of
// UDP packets, BISMUTH_CAMERA_FAKE_DISCOVERY), the Node stand-in for probe_camera.py (tests/fixtures/fake-probe.mjs) and the
// Node stand-in for the sidecar. The wizard's optional "Kamera" step: the computer is read, the search lists a camera,
// a wrong password and a right one are tried (preview picture), the address is sealed (never a setting), the camera starts
// by itself once setup is finished. And Ayarlar → Kamera → "Yeniden tara" (the same flow in a dialog).
import { writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { api, completeSetup, reload, signIn } from '../bridge'
import { overflowReport } from '../routes'
import { expect, test } from './fixtures'

const root = resolve(__dirname, '../../..')
const shots = process.env['CAMERA_SHOTS']
const env = {
  BISMUTH_FACE_KEY: 'memory',
  BISMUTH_CAMERA_PYTHON: process.execPath,
  BISMUTH_CAMERA_SCRIPT: resolve(root, 'tests/fixtures/fake-sidecar.mjs'),
  BISMUTH_CAMERA_PROBE_SCRIPT: resolve(root, 'tests/fixtures/fake-probe.mjs')
}
const found = {
  devices: [
    {
      ip: '192.168.1.64',
      protocols: ['onvif', 'sadp'],
      model: 'DS-2CD0000X-I',
      serial: '',
      mac: '',
      activated: true
    }
  ],
  problem: null
}

test.setTimeout(150_000)

test('Kurulum sihirbazı: kamera adımı — bilgisayar, tarama, deneme, kayıt; kurulum bitince kamera kendiliğinden açılır', async ({
  launch,
  userData
}) => {
  const discovery = join(userData, 'found.json')
  writeFileSync(discovery, JSON.stringify(found))
  const { page } = await launch({ setup: false, env: { ...env, BISMUTH_CAMERA_FAKE_DISCOVERY: discovery } })
  await reload(page, '#/setup?step=12')
  await expect(page.getByTestId('setup-step-title')).toHaveText('Kamera')
  await expect(page.getByText('İsteğe bağlı')).toBeVisible()

  // The computer is read by the main process and a profile is suggested.
  await expect(page.getByTestId('setup-camera-computer')).toContainText('çekirdek')
  await expect(page.locator('[data-testid^="setup-camera-recommended-"]')).toHaveCount(1)

  // The search: the stand-in answer, one row; "Bunu kullan" fills the IP address.
  await page.getByTestId('setup-camera-scan').click()
  const row = page.getByTestId('setup-camera-device-192.168.1.64')
  await expect(row).toContainText('DS-2CD0000X-I')
  await expect(row).toContainText('ONVIF')
  await row.getByTestId('setup-camera-use-192.168.1.64').click()
  await expect(page.getByTestId('setup-camera-ip')).toHaveValue('192.168.1.64')

  // A wrong password: the message says what to check; no picture.
  await page.getByTestId('setup-camera-user').fill('kamera')
  await page.getByTestId('setup-camera-password').fill('yanlis')
  await page.getByTestId('setup-camera-test').click()
  await expect(page.getByTestId('setup-camera-test-error')).toContainText('Kullanıcı adı ya da şifre yanlış')
  await expect(page.getByTestId('setup-camera-preview')).toHaveCount(0)

  // The right one: connected, a preview picture that really loads.
  await page.getByTestId('setup-camera-password').fill('gizli')
  await page.getByTestId('setup-camera-test').click()
  await expect(page.getByTestId('setup-camera-test-ok')).toContainText('128×72')
  const preview = page.getByTestId('setup-camera-preview')
  await expect(preview).toBeVisible()
  expect(await preview.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(128)
  expect(await page.evaluate(overflowReport)).toEqual([])
  if (shots) {
    await page.screenshot({ path: `${shots}/camera-wizard-desktop.png`, fullPage: true })
    // Owner review pictures: dark theme and the phone-sized window (the wizard is also used on a narrow screen).
    await api(page, 'settings.set', { 'ui.theme': 'dark' })
    await page.screenshot({ path: `${shots}/camera-wizard-desktop-dark.png`, fullPage: true })
    await api(page, 'settings.set', { 'ui.theme': 'light' })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.screenshot({ path: `${shots}/camera-wizard-phone.png`, fullPage: true })
    await page.setViewportSize({ width: 1366, height: 768 })
  }

  // Save: sealed address (the status only says "set"), the camera switched on, the profile written — nothing about the
  // address in a setting. The sidecar does not start while the hotel is being set up.
  await page.getByTestId('setup-camera-save').click()
  await expect(page.getByTestId('setup-camera-saved')).toBeVisible()
  const status = await api<{ secrets: { source: boolean }; state: string }>(page, 'camera.status')
  expect(status.body.secrets.source).toBe(true)
  expect(JSON.stringify(status.body)).not.toContain('gizli')
  expect(status.body.state).toBe('stopped')
  const values = await api<Record<string, unknown>>(page, 'settings.get')
  expect(values.body['camera.enabled']).toBe(true)
  expect(values.body['camera.profile']).toMatch(/^(light|standard|high)$/)
  expect(JSON.stringify(values.body)).not.toContain('gizli')
  expect(JSON.stringify(values.body)).not.toContain('192.168.1.64')

  // Setup finishes: within a few seconds the program starts the camera by itself.
  await completeSetup(page)
  await signIn(page)
  await reload(page, '#/camera')
  await expect(page.getByTestId('camera-state-badge')).toHaveText('Çalışıyor', { timeout: 45_000 })
})

test('Kurulum sihirbazı: kamera adımı atlanır — kamera eklenmez, ayar değişmez', async ({ launch }) => {
  const { page } = await launch({ setup: false, env })
  await reload(page, '#/setup?step=12')
  await expect(page.getByTestId('setup-step-title')).toHaveText('Kamera')
  await page.getByTestId('setup-skip').click()
  await expect(page.getByTestId('setup-step-title')).toHaveText('Sahip hesabı')
  const status = await api<{ secrets: { source: boolean } }>(page, 'camera.status')
  expect(status.body.secrets.source).toBe(false)
  const values = await api<Record<string, unknown>>(page, 'settings.get')
  expect(values.body['camera.enabled']).toBe(false)
})

test('Ayarlar → Kamera → Yeniden tara: aynı akış diyalogta; kimlik hatası, sonra doğru bilgi; kayıtlı şifre geri okunmaz', async ({
  launch,
  userData
}) => {
  const discovery = join(userData, 'found.json')
  writeFileSync(discovery, JSON.stringify(found))
  const { page } = await launch({ env: { ...env, BISMUTH_CAMERA_FAKE_DISCOVERY: discovery } })
  await reload(page, '#/settings?tab=camera')
  await page.getByTestId('camera-rescan').click()
  const dialog = page.getByRole('dialog', { name: 'Kamera kurulumu' })
  await expect(dialog.getByTestId('setup-camera-flow')).toBeVisible()
  await dialog.getByTestId('setup-camera-scan').click()
  await dialog.getByTestId('setup-camera-use-192.168.1.64').click()
  await dialog.getByTestId('setup-camera-user').fill('kamera')
  await dialog.getByTestId('setup-camera-password').fill('gizli')
  // Enter in a field tries the connection (the dialog does not close, nothing else is submitted).
  await dialog.getByTestId('setup-camera-user').press('Enter')
  await expect(dialog.getByTestId('setup-camera-test-ok')).toBeVisible()
  if (shots) await page.screenshot({ path: `${shots}/camera-rescan-desktop.png`, fullPage: true })
  await dialog.getByTestId('setup-camera-save').click()
  await expect(dialog.getByTestId('setup-camera-saved')).toBeVisible()
  await dialog.getByTestId('camera-rescan-close').click()
  await expect(dialog).toHaveCount(0)
  // Back on the screen: the address is "Kayıtlı", the password is nowhere.
  await expect(page.getByTestId('camera-source-state')).toHaveText('Kayıtlı')
  expect(await page.content()).not.toContain('gizli')
  // Setup is done, so the saved camera starts at once.
  await reload(page, '#/camera')
  await expect(page.getByTestId('camera-state-badge')).toHaveText('Çalışıyor', { timeout: 45_000 })
})
