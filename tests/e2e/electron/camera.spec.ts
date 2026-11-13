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
  // A headless machine has no system key store: the face key lives in memory for the run (ignored in a packaged build).
  BISMUTH_FACE_KEY: 'memory',
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

  // Alarms: the program takes them from the sidecar into its own table within a few seconds (P20c), then they are listed
  // from there: new → seen → handled; the marks survive a reload (they are rows now, not a file).
  const alerts = page.getByTestId('camera-alerts').locator('li')
  await expect(alerts).toHaveCount(3, { timeout: 30_000 })
  const newest = alerts.nth(0)
  const middle = alerts.nth(1)
  await expect(newest).toHaveAttribute('data-state', 'new')
  await newest.getByRole('button', { name: 'Gördüm' }).click()
  await expect(newest).toHaveAttribute('data-state', 'seen')
  await middle.getByRole('button', { name: 'Hallettim' }).click()
  await expect(middle).toHaveAttribute('data-state', 'handled')
  await reload(page, '#/camera')
  await expect(alerts).toHaveCount(3, { timeout: 30_000 })
  await expect(alerts.nth(0)).toHaveAttribute('data-state', 'seen')
  await expect(alerts.nth(1)).toHaveAttribute('data-state', 'handled')
  await expect(alerts.nth(2)).toHaveAttribute('data-state', 'new')
  await page.getByTestId('camera-filter-handled').click()
  await expect(alerts).toHaveCount(1)
  await page.getByTestId('camera-filter-all').click()
  await expect(alerts).toHaveCount(3)

  // The same alarm is not written twice when the screen asks again (one row per alarm of the sidecar's run).
  await page.waitForTimeout(4_000)
  await expect(alerts).toHaveCount(3)
  const listed = await api<{ alerts: { id: string }[] }>(page, 'camera.alerts')
  expect(new Set(listed.body.alerts.map((a) => a.id)).size).toBe(3)

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

interface BookingView {
  guest: { id: string }
  stays: { id: string }[]
}
interface FaceStatus {
  inHouse: boolean
  count: number
  keyStore: boolean
}

const localDay = (offset: number): string => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

test('Kişiler kartı: "Kameradan yüz al" kaydeder, "Yüz kaydını sil" siler, çıkışta yüz kalmaz; alarm misafire bağlanır (P20c)', async ({
  launch
}) => {
  const { page } = await launch({ env })
  expect(
    (await api(page, 'camera.setSecrets', { source: 'rtsp:' + '//kamera:gizli@192.168.1.64:554/s' })).status
  ).toBe(200)
  expect((await api(page, 'settings.set', { 'camera.enabled': true })).status).toBe(200)
  await expect
    .poll(async () => (await api<{ state: string }>(page, 'camera.status')).body.state, { timeout: 30_000 })
    .toBe('running')

  // A guest who is in the house (checked in today).
  const options = (
    await api<{ rooms: { id: string; number: string }[]; channels: { id: string }[] }>(
      page,
      'booking.options'
    )
  ).body
  const created = await api<BookingView>(page, 'booking.create', {
    guest: { firstName: 'Örnek', lastName: 'Kameralı', phone: '0532 111 22 44' },
    channelId: options.channels[0]!.id,
    stays: [
      {
        roomId: options.rooms.find((r) => r.number === '101')!.id,
        checkIn: localDay(0),
        checkOut: localDay(2),
        nightlyPriceMinor: 200_000
      }
    ]
  })
  expect(created.status, JSON.stringify(created.body)).toBe(200)
  const guestId = created.body.guest.id
  const stayId = created.body.stays[0]!.id
  expect((await api(page, 'booking.checkIn', { stayId })).status).toBe(200)

  await reload(page, '#/guests')
  await page.getByTestId('guest-search').fill('kameralı')
  await page.getByTestId('guest-table').getByRole('button', { name: 'Örnek Kameralı' }).click()
  const sheet = page.getByTestId('guest-sheet')
  await sheet.getByRole('tab', { name: 'Bilgiler' }).click()
  const face = sheet.getByTestId('guest-face')
  await expect(face).toBeVisible()
  await expect(face.getByTestId('guest-face-state')).toHaveText('Yüz kaydı yok')

  const status = (await api<FaceStatus>(page, 'camera.faceStatus', { guestId })).body
  expect(status).toMatchObject({ inHouse: true, count: 0 })
  if (!status.keyStore) {
    // No operating-system key store on this machine (a headless Linux): a face is never kept unsealed, so taking is off.
    await expect(face.getByTestId('guest-face-enroll')).toBeDisabled()
    await expect(face).toContainText('yüz bilgisini güvenle saklayamıyor')
    return
  }

  // Take the face: sealed in Bismuth's database, shown as a count; the sidecar is given the list of faces in the house.
  await face.getByTestId('guest-face-enroll').click()
  await expect(face.getByTestId('guest-face-state')).toHaveText('1 yüz kaydı var')
  await expect(face.getByTestId('guest-face-crop')).toBeVisible()
  expect((await api<FaceStatus>(page, 'camera.faceStatus', { guestId })).body.count).toBe(1)

  // Delete it (asks first), then take another one.
  await face.getByTestId('guest-face-delete').click()
  await page.getByRole('button', { name: 'Vazgeç' }).click()
  await expect(face.getByTestId('guest-face-state')).toHaveText('1 yüz kaydı var')
  await face.getByTestId('guest-face-delete').click()
  await page.getByTestId('guest-face-delete-confirm').click()
  await expect(face.getByTestId('guest-face-state')).toHaveText('Yüz kaydı yok')
  await face.getByTestId('guest-face-enroll').click()
  await expect(face.getByTestId('guest-face-state')).toHaveText('1 yüz kaydı var')

  // An alarm's face is saved as this guest's: the picker lists the guests who are in the house.
  await reload(page, '#/camera')
  const alerts = page.getByTestId('camera-alerts').locator('li')
  await expect(alerts).toHaveCount(3, { timeout: 30_000 })
  await alerts.first().getByRole('button', { name: 'Misafir olarak kaydet' }).click()
  await expect(page.getByTestId('camera-save-guest-crop')).toBeVisible()
  await page.getByTestId('camera-save-guest').click()
  await page.getByRole('option', { name: /Örnek Kameralı · 101/ }).click()
  await page.getByTestId('camera-save-guest-confirm').click()
  await expect(alerts.first()).toContainText('Misafire bağlandı')
  await expect(alerts.first()).toHaveAttribute('data-state', 'handled')
  expect((await api<FaceStatus>(page, 'camera.faceStatus', { guestId })).body.count).toBe(2)

  // Check-out: the faces are deleted for real, in the same step.
  expect((await api(page, 'booking.checkOut', { stayId })).status).toBe(200)
  const after = (await api<FaceStatus>(page, 'camera.faceStatus', { guestId })).body
  expect(after).toMatchObject({ count: 0, inHouse: false })
})
