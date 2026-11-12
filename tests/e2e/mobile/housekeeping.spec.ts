// Room status and issues on the phone (390×844, S-66): "Arıza bildir" is the first thing under the title, the form
// opens from the bottom and saves; a dirty room is made clean with one tap on its tile; nothing sticks out sideways.
import { expect, test } from '@playwright/test'
import { overflowReport } from '../routes'
import { api } from '../bridge'

test.describe('telefonda oda durumu ve arıza', () => {
  test('arıza bildir en üstte; alttan açılan formla kaydedilir, kart listede görünür', async ({ page }) => {
    await page.goto('/#/issues')
    await page.getByTestId('app-ready').waitFor({ state: 'attached' })
    const report = page.getByTestId('issue-report')
    await expect(report).toBeVisible()
    const box = (await report.boundingBox())!
    expect(box.height).toBeGreaterThanOrEqual(44)
    expect(box.width).toBeGreaterThan(300)
    // Nothing of the screen's content comes before it (the header's title and description only).
    const firstContent = page
      .locator('main [role="radiogroup"], main [data-testid^="issue-card-"], main h2')
      .first()
    if (await firstContent.count()) expect((await firstContent.boundingBox())!.y).toBeGreaterThan(box.y)

    await report.click()
    const sheet = page.getByRole('dialog')
    await sheet.getByRole('radio', { name: 'Genel alan' }).click()
    await sheet.getByLabel('Alan').fill('Lobi')
    const title = `Lobi lambası yanmıyor ${Date.now()}`
    await sheet.getByLabel('Kısa başlık').fill(title)
    await sheet.getByRole('button', { name: 'Kaydet' }).click()
    await expect(sheet).toBeHidden()
    await expect(page.getByText(title)).toBeVisible()
    await expect.poll(() => page.evaluate(overflowReport)).toEqual([])
  })

  test('kirli oda kutusunda tek dokunuşla "Temizlendi"', async ({ page }) => {
    await page.goto('/#/rooms')
    await page.getByTestId('app-ready').waitFor({ state: 'attached' })
    const rooms = await api<{ rooms: { id: string; number: string }[] }>(page, 'housekeeping.board')
    const room = rooms.body.rooms.find((r) => r.number === '103')!
    expect((await api(page, 'housekeeping.setStatus', { roomId: room.id, status: 'dirty' })).status).toBe(200)
    await page.reload()
    await page.getByTestId('app-ready').waitFor({ state: 'attached' })
    const tile = page.getByTestId('room-tile-103')
    await expect(tile).toContainText('Kirli')
    const clean = tile.getByRole('button', { name: 'Oda 103 temizlendi' })
    expect((await clean.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    await clean.click()
    await expect(tile).toContainText('Temiz')
    await expect(tile.getByRole('button', { name: /temizlendi/ })).toHaveCount(0)
    await expect.poll(() => page.evaluate(overflowReport)).toEqual([])
  })
})
