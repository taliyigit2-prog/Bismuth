// Faz 20 P20b in the real app: the Kamera screen against the Node stand-in for the Python sidecar
// (tests/fixtures/fake-sidecar.mjs, picked through BISMUTH_CAMERA_PYTHON / BISMUTH_CAMERA_SCRIPT). The state card, the live
// picture (an <img> straight from 127.0.0.1 behind a signed address), the strip and face boxes drawn by the screen, the
// alarm list with "görüldü / halledildi" that survives a reload, pause and restart, Ayarlar → Kamera, and the request filter:
// only the sidecar's exact port and /api/stream load into the window.
import { resolve } from 'node:path'
import type { Page } from '@playwright/test'
import { api, reload } from '../bridge'
import { overflowReport } from '../routes'
import { expect, test } from './fixtures'

const root = resolve(__dirname, '../../..')
const shots = process.env['CAMERA_SHOTS']
const env = {
  BISMUTH_CAMERA_PYTHON: process.execPath,
  BISMUTH_CAMERA_SCRIPT: resolve(root, 'tests/fixtures/fake-sidecar.mjs')
}

test.setTimeout(120_000)

/** Whether an <img> pointed at `url` loads inside the window (the request filter decides). */
const loads = (page: Page, url: string): Promise<boolean> =>
  page.evaluate(
    (src) =>
      new Promise<boolean>((done) => {
        const img = new Image()
        img.onload = () => done(true)
        img.onerror = () => done(false)
        img.src = src
      }),
    url
  )

test('Kamera ekranı: durum, canlı görüntü, şerit, kutular, alarm işaretleri, duraklat, yeniden başlat', async ({
  launch
}) => {
  const { page } = await launch({ env })
  expect(
    (await api(page, 'camera.setSecrets', { source: 'rtsp:' + '//kamera:gizli@192.168.1.64:554/s' })).status
  ).toBe(200)

  // Off: the screen says so and where to switch it on.
  await reload(page, '#/camera')
  await expect(page.getByTestId('camera-state-badge')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Kapalı' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Kamera ayarları' })).toBeVisible()

  // On: the program starts the sidecar by itself.
  expect(
    (await api(page, 'settings.set', { 'camera.enabled': true, 'camera.location': 'Merdiven' })).status
  ).toBe(200)
  await expect(page.getByTestId('camera-state-badge')).toHaveText('Çalışıyor', { timeout: 30_000 })

  const img = page.getByTestId('camera-live-img')
  await expect(img).toHaveAttribute('data-state', 'live', { timeout: 15_000 })
  const src = (await img.getAttribute('src'))!
  expect(src).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/api\/stream\?st=\d+\.[0-9a-f]{64}$/)
  expect(await img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0)

  const strip = page.getByTestId('camera-strip')
  await expect(strip).toContainText('Merdiven')
  await expect(strip).toContainText('4 kayıtlı misafir')
  const boxes = page.getByTestId('camera-box')
  await expect(boxes).toHaveCount(2)
  await expect(boxes.first()).toContainText('Иван Петров')

  // The request filter: only this port's /api/stream loads; its other paths and other ports do not.
  const origin = new URL(src).origin
  expect(await loads(page, src)).toBe(true)
  expect(await loads(page, `${origin}/api/health`)).toBe(false)
  expect(await loads(page, 'http://127.0.0.1:9/api/stream?st=1.abc')).toBe(false)
  expect(await loads(page, 'http://localhost:9/x.png')).toBe(false)

  // 1366: nothing sticks out; a picture for the owner's review.
  expect(await page.evaluate(overflowReport)).toEqual([])
  if (shots) await page.screenshot({ path: `${shots}/camera-desktop.png`, fullPage: true })

  // Alarms: new → seen → handled; the marks survive a reload.
  const alerts = page.getByTestId('camera-alerts').locator('li')
  await expect(alerts).toHaveCount(3)
  await expect(page.getByTestId('camera-alert-3')).toHaveAttribute('data-state', 'new')
  await page.getByTestId('camera-alert-seen-3').click()
  await expect(page.getByTestId('camera-alert-3')).toHaveAttribute('data-state', 'seen')
  await page.getByTestId('camera-alert-handled-2').click()
  await expect(page.getByTestId('camera-alert-2')).toHaveAttribute('data-state', 'handled')
  await reload(page, '#/camera')
  await expect(page.getByTestId('camera-alert-3')).toHaveAttribute('data-state', 'seen')
  await expect(page.getByTestId('camera-alert-2')).toHaveAttribute('data-state', 'handled')
  await expect(page.getByTestId('camera-alert-1')).toHaveAttribute('data-state', 'new')
  await page.getByTestId('camera-filter-handled').click()
  await expect(page.getByTestId('camera-alert-2')).toBeVisible()
  await expect(page.getByTestId('camera-alert-1')).toHaveCount(0)

  // Pause: the strip says so.
  await page.getByRole('switch', { name: 'Alarmları duraklat' }).click()
  await expect(page.getByTestId('camera-strip')).toContainText('Alarmlar duraklatıldı')

  // Restart: the state card goes through its states and the picture comes back on a new address.
  await page.getByTestId('camera-restart').click()
  await expect(page.getByTestId('camera-state-badge')).toHaveText('Çalışıyor', { timeout: 30_000 })
  await expect(page.getByTestId('camera-live-img')).toHaveAttribute('data-state', 'live', { timeout: 20_000 })
  expect((await page.getByTestId('camera-live-img').getAttribute('src'))!).not.toBe(src)

  // Ayarlar → Kamera: the saved address is "Kayıtlı", never its text.
  await reload(page, '#/settings?tab=camera')
  await expect(page.getByTestId('camera-settings')).toBeVisible()
  await expect(page.getByTestId('camera-source-state')).toHaveText('Kayıtlı')
  await expect(page.getByTestId('camera-source')).toHaveValue('')
  expect(await page.locator('body').innerText()).not.toContain('gizli@')
  expect(await page.evaluate(overflowReport)).toEqual([])
  if (shots) await page.screenshot({ path: `${shots}/camera-settings-desktop.png`, fullPage: true })
})
