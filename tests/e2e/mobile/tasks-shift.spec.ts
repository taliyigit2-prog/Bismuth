// Tasks, handover and maintenance on the phone (390×844, S-66 "görev tamamlama", "vardiya notları", "bakım"):
// "Yeni görev" is the first thing under the title, a task is ticked with a 44 px target, the handover screen is
// three tabs; nothing sticks out sideways.
import { expect, test, type Page } from '@playwright/test'
import { overflowReport } from '../routes'
import { api } from '../bridge'

const ready = async (page: Page, hash: string) => {
  await page.goto(`/${hash}`)
  await page.getByTestId('app-ready').waitFor({ state: 'attached' })
}

test.describe('telefonda görevler, vardiya ve bakım', () => {
  test('görev tek dokunuşla yapıldı; "Yeni görev" en üstte, tam genişlikte', async ({ page }) => {
    await ready(page, '#/tasks')
    const title = `Lobi lambasını değiştir ${Date.now()}`
    const made = await api<{ id: string }>(page, 'tasks.create', { title, dueAt: '2099-01-01T10:00' })
    expect(made.status).toBe(200)
    // Due far ahead: it sits in "Yaklaşan"; today's tab must still work on the phone.
    await page.reload()
    await page.getByTestId('app-ready').waitFor({ state: 'attached' })
    const add = page.getByTestId('task-new')
    const box = (await add.boundingBox())!
    expect(box.height).toBeGreaterThanOrEqual(44)
    expect(box.width).toBeGreaterThan(300)
    await page.getByTestId('task-tab-upcoming').click()
    const row = page.getByTestId(`task-${made.body.id}`)
    await expect(row).toContainText(title)
    const tick = row.getByRole('checkbox')
    // The label around the box is the target: a real 44 px element, not only the invisible ::after.
    const hit = (await tick.locator('xpath=ancestor::label[1]').boundingBox())!
    expect(hit.width).toBeGreaterThanOrEqual(44)
    expect(hit.height).toBeGreaterThanOrEqual(44)
    await tick.click()
    await page.getByTestId('task-tab-done').click()
    await expect(page.getByTestId(`task-${made.body.id}`)).toHaveAttribute('data-status', 'done')
    await expect.poll(() => page.evaluate(overflowReport)).toEqual([])
  })

  test('vardiya devri üç sekme; devir yazılır; yatay taşma yok', async ({ page }) => {
    await ready(page, '#/shift')
    await expect(page.getByRole('tab', { name: 'Devir' })).toBeVisible()
    const write = page.getByTestId('handover-write')
    const note = `Telefondan devir ${Date.now()}`
    await write.getByLabel('Devir notu').fill(note)
    await write.getByTestId('handover-save').click()
    await expect(page.getByTestId('handover-history')).toContainText(note)
    await page.getByRole('tab', { name: 'Notlarım' }).click()
    await expect(page.getByTestId('notes-personal')).toBeVisible()
    await page.getByRole('tab', { name: 'Pano' }).click()
    await expect(page.getByTestId('notes-board')).toBeVisible()
    await expect.poll(() => page.evaluate(overflowReport)).toEqual([])
  })

  test('bakım ekranı kart düzeninde, taşmadan', async ({ page }) => {
    await ready(page, '#/maintenance')
    await expect(page.getByTestId('maintenance-deep-clean')).toBeVisible()
    await expect(page.getByTestId('reminder-add')).toBeVisible()
    await expect.poll(() => page.evaluate(overflowReport)).toEqual([])
  })
})
