// P9c on the phone (390×844, G-143): Today, "Otelde kalanlar" and calendar notes do not widen the page; Today's
// cards stack; the KBS mark is a 44 px target; the night list prints on one A4 page (Chromium's PDF of the print
// style); a bulk note is added from the bottom sheet.
import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { overflowReport } from '../routes'
import { api } from '../bridge'
import { seedHotelDay, type SeededDay } from '../p9c-seed'

const shots = process.env['P9C_SHOTS']

async function ready(page: Page, hash: string): Promise<void> {
  await page.goto(`/${hash}`)
  await page.getByTestId('app-ready').waitFor({ state: 'attached' })
}

test.describe.configure({ mode: 'serial' })

// The phone harness shares one hotel with the other phone spec files: the day goes into rooms free for its dates
// (seeded by the first test, read by the second; a retry runs the group again and seeds again).
let seeded: SeededDay | null = null

test.describe('telefonda Bugün, otelde kalanlar, takvim notları', () => {
  test('Bugün kartları alt alta; yana taşma yok', async ({ page }) => {
    await ready(page, '#/today')
    seeded = await seedHotelDay(page, { freeRooms: true })
    await page.reload()
    await page.getByTestId('app-ready').waitFor({ state: 'attached' })
    const departures = page.getByRole('region', { name: /Bugün çıkacaklar/ })
    await expect(departures).toContainText('Carlos Ruiz')
    await expect(page.getByRole('region', { name: /Açık arızalar/ })).toContainText('Tavandan su damlıyor')
    const kbs = page.getByRole('region', { name: /KBS eksikleri/ })
    const a = (await departures.boundingBox())!
    const b = (await kbs.boundingBox())!
    expect(Math.abs(a.x - b.x)).toBeLessThan(2) // one column
    await expect.poll(() => page.evaluate(overflowReport)).toEqual([])
  })

  test('Bugün görev kutusu telefonda 44 px dokunma alanı', async ({ page }) => {
    await ready(page, '#/today')
    const options = await api<{ today: string }>(page, 'booking.options')
    const made = await api<{ id: string }>(page, 'tasks.create', {
      title: `Kutu ölçümü ${Date.now()}`,
      dueAt: `${options.body.today}T23:00`
    })
    expect(made.status, JSON.stringify(made.body)).toBe(200)
    await page.reload()
    await page.getByTestId('app-ready').waitFor({ state: 'attached' })
    const tick = page.getByTestId(`today-task-${made.body.id}`).getByRole('checkbox')
    // The label around the box is the target: a real 44 px element, not only the invisible ::after.
    const hit = (await tick.locator('xpath=ancestor::label[1]').boundingBox())!
    expect(hit.width).toBeGreaterThanOrEqual(44)
    expect(hit.height).toBeGreaterThanOrEqual(44)
    await api(page, 'tasks.cancel', { id: made.body.id, reason: 'e2e' })
  })

  test('otelde kalanlar: KBS işareti 44 px; gece listesi tek A4 sayfası', async ({ page }) => {
    expect(seeded, 'seeded by the test before').not.toBeNull()
    await ready(page, '#/in-house')
    const room = page.getByTestId(`in-house-room-${seeded!.numbers.inHouse}`)
    const elif = room.locator('li[data-kbs]', { hasText: 'Elif Yılmaz' })
    const mark = elif.getByRole('button', { name: "KBS'ye bildirildi olarak işaretle" })
    expect((await mark.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    await mark.click()
    await expect(elif).toHaveAttribute('data-kbs', 'ok')
    await expect.poll(() => page.evaluate(overflowReport)).toEqual([])

    await page.emulateMedia({ media: 'print' })
    const sheet = page.getByTestId('night-list')
    await expect(sheet).toBeVisible()
    await expect(sheet).toContainText('Elif Yılmaz — Kızıl saçlı, gözlüklü')
    await expect(page.getByRole('main')).toBeHidden()
    const pdf = (await page.pdf({ format: 'A4', preferCSSPageSize: true })).toString('latin1')
    expect(pdf.match(/\/Type\s*\/Page[^s]/g)?.length).toBe(1)
    const box = /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(pdf)
    expect([Math.round(Number(box?.[1])), Math.round(Number(box?.[2]))]).toEqual([595, 842])
    // Nothing of the table sticks out of the A4 printable width (210 mm − 2 × 12 mm ≈ 703 px).
    await page.setViewportSize({ width: 703, height: 1000 })
    const overflow = await sheet.evaluate((el) => el.scrollWidth - el.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
    await page.emulateMedia({ media: 'screen' })
  })

  test('takvim notları: toplu not alttan açılan sayfadan eklenir; yana taşma yok', async ({ page }) => {
    await ready(page, '#/calendar-notes')
    await expect(page.locator('[data-testid^="day-"]').first()).toBeVisible()
    await expect.poll(() => page.evaluate(overflowReport)).toEqual([])
    await page.getByTestId('note-add').click()
    const sheet = page.getByRole('dialog')
    await sheet.getByLabel('Başlık').fill('Telefondan not')
    await sheet.getByRole('radio', { name: 'Tarih aralığı' }).click()
    await expect(sheet.getByTestId('note-count')).toContainText('28 gün seçildi')
    await expect.poll(() => page.evaluate(overflowReport)).toEqual([])
    await sheet.getByTestId('note-save').click()
    await expect(sheet).toBeHidden()
    await expect(page.locator('[data-testid^="day-"]', { hasText: 'Telefondan not' }).first()).toBeVisible()
  })

  test('ekran görüntüleri: telefon, açık/koyu, Türkçe/Rusça (yalnız P9C_SHOTS ile)', async ({ page }) => {
    test.skip(!shots, 'screenshots only')
    test.setTimeout(180_000)
    await ready(page, '#/today')
    try {
      for (const lang of ['tr', 'ru'])
        for (const theme of ['light', 'dark']) {
          await api(page, 'settings.set', { 'ui.language': lang, 'ui.theme': theme })
          for (const route of ['today', 'in-house', 'calendar-notes']) {
            await ready(page, `#/${route}`)
            await page.reload()
            await page.getByTestId('app-ready').waitFor({ state: 'attached' })
            await page.waitForTimeout(800)
            await expect.poll(() => page.evaluate(overflowReport)).toEqual([])
            await page.screenshot({ path: `${shots}/${route}-mobile-${theme}-${lang}.png`, fullPage: true })
          }
        }
      await ready(page, '#/calendar-notes')
      await page.getByTestId('note-add').click()
      await page.waitForTimeout(500)
      await page.screenshot({ path: `${shots}/calendar-notes-dialog-mobile-dark-ru.png` })
    } finally {
      await api(page, 'settings.set', { 'ui.language': 'tr', 'ui.theme': 'light' })
    }
  })
})
