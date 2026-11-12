// Settings and the audit log on the phone (390×844): long names wrap instead of widening the page, controls keep
// 44 px targets, the audit log is in "Daha fazla" (faz-04: desktop and phone).
import { expect, test } from '@playwright/test'
import { overflowReport } from '../routes'
import { api } from '../bridge'

test.describe('telefonda ayarlar ve denetim kaydı', () => {
  test('uzun rol adı seçilince sayfa yana taşmaz', async ({ page }) => {
    await page.goto('/#/settings?tab=users')
    await page.getByTestId('app-ready').waitFor({ state: 'attached' })
    const name = 'Gece resepsiyonu ve kat hizmetleri sorumlusu (yedek)'
    const roles = await api<{ name: string }[]>(page, 'roles.list')
    if (!roles.body.some((r) => r.name === name)) {
      const created = await api(page, 'roles.create', { name, description: null, permissions: {} })
      expect(created.status, JSON.stringify(created.body)).toBe(200)
    }
    await page.reload()
    await page.getByTestId('app-ready').waitFor({ state: 'attached' })
    await page.getByTestId('role-pick').click()
    await page.getByRole('option', { name }).click()
    await expect(page.getByTestId('role-pick')).toContainText('Gece resepsiyonu')
    await expect.poll(() => page.evaluate(overflowReport)).toEqual([])
  })

  test('takvim ayarında yedi gün tek satırda, her biri 44 px', async ({ page }) => {
    await page.goto('/#/settings?tab=calendar')
    await page.getByTestId('app-ready').waitFor({ state: 'attached' })
    const days = page.getByTestId('highlight-weekdays').locator('[data-slot="toggle-group-item"]')
    await expect(days).toHaveCount(7)
    const boxes = await days.evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect()
        return { top: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }
      })
    )
    expect(boxes).toHaveLength(7)
    expect(new Set(boxes.map((b) => b.top)).size).toBe(1)
    for (const b of boxes) {
      expect(b.h).toBeGreaterThanOrEqual(44)
      expect(b.w).toBeGreaterThanOrEqual(43)
    }
    await expect.poll(() => page.evaluate(overflowReport)).toEqual([])
  })

  test('kendi görevinde gün düğmeleri 390, 360 ve 320 px genişlikte iki satıra sığar, her biri 44 px', async ({
    page
  }) => {
    await page.goto('/#/settings?tab=tasks')
    await page.getByTestId('app-ready').waitFor({ state: 'attached' })
    await page.getByTestId('add-own-task').click()
    await page.getByTestId('own-task-repeat').click()
    await page.getByRole('option', { name: 'Her hafta' }).click()
    const group = page.locator('#own-task-weekdays')
    await expect(group).toBeVisible()
    try {
      for (const width of [390, 360, 320]) {
        await page.setViewportSize({ width, height: 844 })
        // Seven 44 px buttons need 308 px: wider than the form at 320 px, so they wrap (four and three).
        const m = await group.evaluate((el) => {
          const box = el.getBoundingClientRect()
          const body = el.closest('[data-testid="dialog-body"]')!
          const items = [...el.querySelectorAll('[data-slot="toggle-group-item"]')].map((item) => {
            const r = item.getBoundingClientRect()
            return { l: r.left, r: r.right, t: Math.round(r.top), w: r.width, h: r.height }
          })
          return {
            count: items.length,
            rows: new Set(items.map((i) => i.t)).size,
            minW: Math.min(...items.map((i) => i.w)),
            minH: Math.min(...items.map((i) => i.h)),
            outside: items.filter((i) => i.l < box.left - 0.5 || i.r > box.right + 0.5).length,
            groupScroll: el.scrollWidth - el.clientWidth,
            bodyScroll: body.scrollWidth - body.clientWidth,
            beyondScreen: items.filter((i) => i.r > window.innerWidth).length
          }
        })
        expect(m, `${width} px`).toMatchObject({
          count: 7,
          rows: 2,
          outside: 0,
          groupScroll: 0,
          bodyScroll: 0,
          beyondScreen: 0
        })
        expect(m.minW, `${width} px`).toBeGreaterThanOrEqual(44)
        expect(m.minH, `${width} px`).toBeGreaterThanOrEqual(44)
        await expect.poll(() => page.evaluate(overflowReport)).toEqual([])
      }
    } finally {
      await page.setViewportSize({ width: 390, height: 844 })
    }
  })

  test('alttan açılan formun kapat düğmesi 44 px; listeler seçim kutusuyla açılır', async ({ page }) => {
    await page.goto('/#/settings?tab=lists')
    await page.getByTestId('app-ready').waitFor({ state: 'attached' })
    await page.getByTestId('list-kind').click()
    await page.getByTestId('list-kind-salesChannels').click()
    await expect(page.getByTestId('list-salesChannels')).toBeVisible()
    await page.getByTestId('list-add').click()
    const sheet = page.locator('[data-slot="sheet-content"]')
    await expect(sheet).toBeVisible()
    const close = sheet.getByRole('button', { name: 'Kapat' })
    const box = await close.boundingBox()
    expect(box!.width).toBeGreaterThanOrEqual(44)
    expect(box!.height).toBeGreaterThanOrEqual(44)
    await close.click()
    await expect(sheet).toHaveCount(0)
  })

  test('denetim kaydı "Daha fazla" sayfasından açılır', async ({ page }) => {
    await page.goto('/#/today')
    await page.getByTestId('app-ready').waitFor({ state: 'attached' })
    await page.getByTestId('nav-more').click()
    await page.getByTestId('more-sheet').getByRole('link', { name: 'Denetim kaydı' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Denetim kaydı' })).toBeVisible()
    await expect.poll(() => page.evaluate(overflowReport)).toEqual([])
  })
})
