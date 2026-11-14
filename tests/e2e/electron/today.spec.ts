// Faz 9 (P9c) in the real app: the Today screen of the owner and of the receptionist (cards follow the role), the
// open issue on Today; "Otelde kalanlar" — "kızıl" search, KBS marked with who and when, a person added, the A4
// night list printed by Electron itself; calendar notes — "her cumartesi" in one go and 2036's holidays.
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { api, reload } from '../bridge'
import { RECEPTION } from '../setup-draft.mjs'
import { seedHotelDay } from '../p9c-seed'

const shots = process.env['P9C_SHOTS']

async function asReception(page: Page): Promise<void> {
  expect((await api(page, 'auth.signOut')).status).toBe(200)
  expect(
    (await api(page, 'auth.signIn', { username: RECEPTION.username, secret: RECEPTION.password })).status
  ).toBe(200)
  const changed = await api(page, 'auth.changePassword', {
    currentPassword: RECEPTION.password,
    newPassword: 'deniz-yeni-sifre'
  })
  expect(changed.status).toBe(200)
}

test('Bugün: sahip bütün kartları görür; resepsiyon kasayı görür, personel paneli ve yedek uyarısını görmez', async ({
  launch
}) => {
  test.setTimeout(120_000)
  const { page } = await launch()
  await seedHotelDay(page)
  await reload(page, '#/today')

  const departures = page.getByRole('region', { name: /Bugün çıkacaklar/ })
  await expect(departures).toContainText('Carlos Ruiz')
  await expect(page.getByRole('region', { name: /Bugün gelecekler/ })).toContainText(
    'Geç gelecek, 23:30 civarı'
  )
  await expect(page.getByRole('region', { name: /KBS eksikleri/ })).toContainText('Elif Yılmaz')
  // The issue reported in 201 shows on Today (G-180).
  await expect(page.getByRole('region', { name: /Açık arızalar/ })).toContainText('Tavandan su damlıyor')
  await expect(page.getByRole('region', { name: /Bugünün özel günleri/ })).toContainText('Kongre haftası')
  await expect(page.getByText('Kasadaki nakit')).toBeVisible()
  await expect(page.getByTestId('today-staff')).toBeVisible()
  // A fresh hotel has no backup yet: the owner is told.
  await expect(page.getByTestId('today-backup')).toBeVisible()

  await asReception(page)
  await reload(page, '#/today')
  await expect(page.getByRole('region', { name: /Bugün çıkacaklar/ })).toContainText('Carlos Ruiz')
  await expect(page.getByRole('region', { name: /KBS eksikleri/ })).toBeVisible()
  await expect(page.getByText('Kasadaki nakit')).toBeVisible()
  await expect(page.getByTestId('today-staff')).toHaveCount(0)
  await expect(page.getByTestId('today-backup')).toHaveCount(0)
  // The service gives the receptionist no tourism reminder either way.
  const summary = await api<{ reminders: unknown[]; drawer: unknown }>(page, 'today.summary')
  expect(summary.body.reminders).toEqual([])
})

test('otelde kalanlar: "kızıl" araması, KBS işareti kim/ne zaman, kişi ekleme ve A4 gece listesi', async ({
  launch
}) => {
  test.setTimeout(120_000)
  const { page, app: electron } = await launch()
  await seedHotelDay(page)
  await reload(page, '#/in-house')

  const search = page.getByRole('searchbox', { name: 'Otelde kalanlarda ara' })
  await search.fill('kızıl')
  await expect(page.getByTestId('in-house-room-101')).toBeVisible()
  await expect(page.getByTestId('in-house-room-103')).toHaveCount(0)
  await search.fill('')

  const room = page.getByTestId('in-house-room-101')
  const elif = room.locator('li[data-kbs]', { hasText: 'Elif Yılmaz' })
  await expect(elif).toHaveAttribute('data-kbs', 'missing')
  await elif.getByRole('button', { name: "KBS'ye bildirildi olarak işaretle" }).click()
  await expect(elif).toHaveAttribute('data-kbs', 'ok')
  await expect(elif).toContainText('Otel Sahibi')

  await room.getByRole('button', { name: 'Oda 101: kişi ekle' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Ad soyad').fill('Zeynep Yılmaz')
  await dialog.getByLabel('Tanıtıcı not (isteğe bağlı)').fill('Mavi montlu')
  await dialog.getByRole('button', { name: 'Kaydet' }).click()
  await expect(dialog).toBeHidden()
  await expect(room).toContainText('Mavi montlu')
  await expect(room.getByText('1 KBS eksik')).toBeVisible()

  // The night list: Electron's own print to PDF on A4 — one page for this hotel.
  const pdf = await electron.evaluate(async ({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]!
    const data = await win.webContents.printToPDF({ pageSize: 'A4', printBackground: false })
    return Buffer.from(data).toString('latin1')
  })
  expect(pdf.match(/\/Type\s*\/Page[^s]/g)?.length).toBe(1)
  const mediaBox = /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(pdf)
  // A4 = 595.3 × 841.9 pt (Electron rounds the page size to whole microns).
  expect(Math.abs(Number(mediaBox?.[1]) - 595.3)).toBeLessThan(1.5)
  expect(Math.abs(Number(mediaBox?.[2]) - 841.9)).toBeLessThan(1.5)
  await page.emulateMedia({ media: 'print' })
  const sheet = page.getByTestId('night-list')
  await expect(sheet).toBeVisible()
  await expect(sheet).toContainText('Zeynep Yılmaz — Mavi montlu')
  await expect(page.getByRole('main')).toBeHidden()
  await page.emulateMedia({ media: 'screen' })
})

test('takvim notları: "her cumartesi" toplu notu tek seferde eklenir; 2036 bayramları kendiliğinden gelir', async ({
  launch
}) => {
  test.setTimeout(120_000)
  const { page } = await launch()
  await reload(page, '#/calendar-notes')
  await page.getByTestId('note-add').click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Başlık').fill('Kahvaltı salonu kapalı')
  await dialog.getByRole('radio', { name: 'Haftanın günleri' }).click()
  const weekdays = dialog.getByTestId('note-weekdays')
  for (const pressed of await weekdays.locator('[aria-pressed="true"]').all()) await pressed.click()
  await weekdays.getByRole('button', { name: 'Cumartesi' }).click()
  const count = dialog.getByTestId('note-count')
  await expect(count).toContainText(/[1-9]\d* gün seçildi/)
  const started = Date.now()
  await dialog.getByTestId('note-save').click()
  await expect(dialog).toBeHidden()
  expect(Date.now() - started).toBeLessThan(5_000)
  const saturdays = page.locator('[data-testid^="day-"]', { hasText: 'Kahvaltı salonu kapalı' })
  await expect(saturdays.first()).toBeVisible()

  for (let i = 0; i < 2036 - new Date().getFullYear(); i++)
    await page.getByRole('button', { name: 'Sonraki yıl' }).click()
  await expect(page.getByTestId('notes-year-label')).toHaveText('2036')
  await expect(page.getByTestId('day-2036-10-29')).toContainText('Cumhuriyet Bayramı')
  await expect(page.getByTestId('day-2036-04-23')).toBeVisible()
})

test('ekran görüntüleri: masaüstü, açık/koyu, Türkçe/Rusça (yalnız P9C_SHOTS ile)', async ({ launch }) => {
  test.skip(!shots, 'screenshots only')
  test.setTimeout(300_000)
  const { page, app } = await launch()
  await seedHotelDay(page)
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1366, 768))
  for (const lang of ['tr', 'ru'])
    for (const theme of ['light', 'dark']) {
      expect((await api(page, 'settings.set', { 'ui.language': lang, 'ui.theme': theme })).status).toBe(200)
      for (const route of ['today', 'in-house', 'calendar-notes']) {
        await reload(page, `#/${route}`)
        await page.waitForTimeout(800)
        await page.screenshot({ path: `${shots}/${route}-desktop-${theme}-${lang}.png` })
        const height = await page.evaluate(() => {
          const main = document.querySelector('main')
          return Math.max(768, (main?.scrollHeight ?? 0) + 80)
        })
        await app.evaluate(
          ({ BrowserWindow }, h) => BrowserWindow.getAllWindows()[0]!.setContentSize(1366, h),
          Math.min(height, 4000)
        )
        await page.waitForTimeout(400)
        await page.screenshot({ path: `${shots}/${route}-desktop-${theme}-${lang}-full.png` })
        await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1366, 768))
      }
    }
  await reload(page, '#/calendar-notes')
  await page.getByTestId('note-add').click()
  await page
    .getByRole('dialog')
    .getByRole('radio', { name: /Haftanın|Дни недели/ })
    .click()
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${shots}/calendar-notes-dialog-desktop-dark-ru.png` })
  await page.keyboard.press('Escape')
  await page.emulateMedia({ media: 'print' })
  await api(page, 'settings.set', { 'ui.language': 'tr', 'ui.theme': 'dark' })
  await reload(page, '#/in-house')
  await page.emulateMedia({ media: 'print' })
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${shots}/in-house-print-dark-tr.png` })
  await page.emulateMedia({ media: 'screen' })
})
