// Faz 20 P20b on the phone (390×844, S-108): the Kamera screen is the state and the alarm list — no live picture, no
// restart or pause. The sidecar here is the Node stand-in behind the harness (E2E_CAMERA=1); the phone reaches it only
// through the service (HTTP), which also refuses the live picture to it.
import { expect, test } from '@playwright/test'
import { api } from '../bridge'
import { overflowReport } from '../routes'

const shots = process.env['CAMERA_SHOTS']

test('telefonda Kamera: durum ve alarm listesi; canlı görüntü ve yönetim düğmeleri yok; işaret çalışır', async ({
  page
}) => {
  await page.goto('/#/camera')
  await page.getByTestId('app-ready').waitFor({ state: 'attached' })
  await expect(page.getByTestId('camera-state-badge')).toHaveText('Çalışıyor', { timeout: 30_000 })
  // P20c: the alarms are pulled from the sidecar into Bismuth's own table within a few seconds, then listed from there.
  const alerts = page.getByTestId('camera-alerts').locator('li')
  await expect(alerts).toHaveCount(3, { timeout: 30_000 })
  await expect(page.getByTestId('camera-live')).toHaveCount(0)
  await expect(page.getByTestId('camera-restart')).toHaveCount(0)
  await expect(page.getByRole('switch', { name: 'Alarmları duraklat' })).toHaveCount(0)
  expect(await page.evaluate(overflowReport)).toEqual([])
  if (shots) await page.screenshot({ path: `${shots}/camera-phone.png`, fullPage: true })

  // Marking is the front desk's work: it goes over HTTP too and the 44 px buttons are real targets.
  const newest = alerts.first()
  const seen = newest.getByRole('button', { name: 'Gördüm' })
  expect((await seen.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await seen.click()
  await expect(newest).toHaveAttribute('data-state', 'seen')
  // S-108: a phone gets id, time and state only: no crop and no "save as guest"; the service refuses the picture too.
  await expect(page.getByRole('button', { name: 'Misafir olarak kaydet' })).toHaveCount(0)
  const listed = await api<{ alerts: Record<string, unknown>[] }>(page, 'camera.alerts')
  expect(listed.body.alerts.every((a) => a['hasCrop'] === false)).toBe(true)
  const crop = await api(page, 'camera.alertCrop', { id: String(listed.body.alerts[0]!['id']) })
  expect(crop.status).toBe(403)
  const candidates = await api(page, 'camera.candidates')
  expect(candidates.status).toBe(200) // allowed for the role, but names only: no picture, no face

  // The service refuses the live picture and the strip to a phone, whatever the screen does.
  const stream = await api(page, 'camera.streamUrl')
  expect(stream.status).toBe(403)
  const live = await api(page, 'camera.live')
  expect(live.status).toBe(403)
  const restart = await api(page, 'camera.restart')
  expect(restart.status).toBe(403)
  const pause = await api(page, 'camera.setAlarmsPaused', { paused: true })
  expect(pause.status).toBe(403)
})

test('telefonda Ayarlar → Kamera: sırlar kapalı, "Kayıtlı" der, taşma yok', async ({ page }) => {
  await page.goto('/#/settings?tab=camera')
  await page.getByTestId('app-ready').waitFor({ state: 'attached' })
  await expect(page.getByTestId('camera-settings')).toBeVisible()
  await expect(page.getByTestId('camera-source')).toBeDisabled()
  await expect(page.getByTestId('camera-telegram-token')).toBeDisabled()
  await expect(page.getByTestId('camera-telegram-test')).toHaveCount(0)
  expect(await page.evaluate(overflowReport)).toEqual([])
  if (shots) await page.screenshot({ path: `${shots}/camera-settings-phone.png`, fullPage: true })
})
