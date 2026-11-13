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
  await expect(page.getByTestId('camera-alerts').locator('li')).toHaveCount(3)
  await expect(page.getByTestId('camera-live')).toHaveCount(0)
  await expect(page.getByTestId('camera-restart')).toHaveCount(0)
  await expect(page.getByRole('switch', { name: 'Alarmları duraklat' })).toHaveCount(0)
  expect(await page.evaluate(overflowReport)).toEqual([])
  if (shots) await page.screenshot({ path: `${shots}/camera-phone.png`, fullPage: true })

  // Marking is the front desk's work: it goes over HTTP too and the 44 px buttons are real targets.
  const seen = page.getByTestId('camera-alert-seen-3')
  expect((await seen.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await seen.click()
  await expect(page.getByTestId('camera-alert-3')).toHaveAttribute('data-state', 'seen')

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
