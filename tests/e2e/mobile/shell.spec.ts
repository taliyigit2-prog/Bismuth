import { expect, test, type Page } from '@playwright/test'
import { overflowReport, SCREEN_ROUTES, SIGNED_OUT_ROUTES } from '../routes'
import { api, signIn } from '../bridge'
import { OWNER } from '../setup-draft.mjs'

/** The harness shares one sign-in state: every test leaves the owner signed in and unlocked. */
async function restoreOwner(page: Page): Promise<void> {
  const state = await api<{ session: { locked: boolean } | null }>(page, 'auth.state')
  if (state.body.session?.locked) await api(page, 'auth.unlock', { secret: OWNER.pin })
  else if (!state.body.session) await signIn(page)
}

test.describe('telefon görünümü (390×844)', () => {
  test('alt gezinme çıkar, yan menü yok, yatay kaydırma yok', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('app-ready').waitFor({ state: 'attached' })
    await expect(page.getByTestId('app-ready')).toHaveAttribute('data-layout', 'mobile')
    await expect(page.getByTestId('mobile-nav')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: 'Takvim' })).toBeVisible()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })

  test('HTTP taşıma ile ayar değişir (aynı arayüz paketi, G-135)', async ({ page }) => {
    await page.goto('/#/settings')
    await page.getByTestId('app-ready').waitFor({ state: 'attached' })
    await page.getByTestId('language-select').click()
    await page.getByTestId('language-en').click()
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()
    const navTargets = await page
      .getByTestId('mobile-nav')
      .getByRole('link')
      .evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)))
    for (const h of navTargets) expect(h).toBeGreaterThanOrEqual(44)
    for (const link of await page.getByTestId('mobile-nav').getByRole('link').all())
      await expect(link).toBeVisible()
    // Radix adds a scroll-lock gap while the select is open; measure once it has closed.
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      )
      .toBeLessThanOrEqual(0)
    // restore for other tests (shared in-memory server)
    await page.getByTestId('language-select').click()
    await page.getByTestId('language-tr').click()
    await expect(page.getByRole('heading', { level: 1, name: 'Ayarlar' })).toBeVisible()
  })

  test('ayarlarda her dokunma hedefi en az 44 px; bildirim alt gezinmeyi örtmez', async ({ page }) => {
    const tooSmall = () =>
      page.evaluate(() => {
        const targets = document.querySelectorAll<HTMLElement>(
          'main button, main input, main [role="combobox"], main label:has([role="radio"]), header button'
        )
        return (
          [...targets]
            .filter((el) => el.getAttribute('role') !== 'radio' && el.getAttribute('role') !== 'switch')
            .filter((el) => el.getAttribute('type') !== 'hidden' && el.offsetParent !== null)
            // Radix's hidden native input mirrors a checkbox for forms; it is not something to tap.
            .filter((el) => el.getAttribute('aria-hidden') !== 'true')
            .map((el) => {
              // A checkbox is tapped through its whole label row.
              const target = el.getAttribute('role') === 'checkbox' ? (el.closest('label') ?? el) : el
              const r = target.getBoundingClientRect()
              return { what: el.outerHTML.slice(0, 60), h: Math.round(r.height), w: Math.round(r.width) }
            })
            .filter((t) => t.h < 44 || t.w < 44)
        )
      })
    for (const tab of ['general', 'hotel', 'tags']) {
      await page.goto(`/#/settings?tab=${tab}`)
      await page.getByTestId('app-ready').waitFor({ state: 'attached' })
      await expect(page.getByRole('heading', { level: 1, name: 'Ayarlar' })).toBeVisible()
      await page.waitForTimeout(200)
      expect(await tooSmall(), tab).toEqual([])
    }
    await page.goto('/#/settings?tab=general')
    await page.getByTestId('app-ready').waitFor({ state: 'attached' })
    // The switch keeps its look; an invisible ::after makes the tap area 44 px tall.
    const switchHit = await page
      .locator('#show-minor')
      .evaluate((el) => parseFloat(getComputedStyle(el, '::after').height))
    expect(switchHit).toBeGreaterThanOrEqual(44)

    await page.goto('/#/settings?tab=hotel')
    await page.getByLabel('Otel adı').fill('Deneme Otel')
    await page.getByRole('button', { name: 'Kaydet' }).click()
    const toast = page.locator('[data-sonner-toast]').first()
    await expect(toast).toBeVisible()
    const toastBox = await toast.boundingBox()
    const navBox = await page.getByTestId('mobile-nav').boundingBox()
    expect(toastBox!.y + toastBox!.height).toBeLessThanOrEqual(navBox!.y)
    await page.getByLabel('Otel adı').fill('Örnek Otel')
    await page.getByRole('button', { name: 'Kaydet' }).click()
  })

  test('hızlı arama telefonda alttan açılır, yazı 16 px', async ({ page }) => {
    await page.goto('/#/calendar')
    await page.getByTestId('app-ready').waitFor({ state: 'attached' })
    await page.getByRole('button', { name: 'Ara ya da git' }).click()
    const sheet = page.locator('[data-slot="sheet-content"]')
    await expect(sheet).toBeVisible()
    const input = sheet.getByRole('combobox')
    expect(await input.evaluate((el) => getComputedStyle(el).fontSize)).toBe('16px')
    // Slides in from the bottom edge; measure once the animation has finished.
    await expect
      .poll(async () => {
        const box = await sheet.boundingBox()
        return box ? Math.round(box.y + box.height) : 0
      })
      .toBe(844)
    await sheet.getByRole('option', { name: 'Ayarlar' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Ayarlar' })).toBeVisible()
  })

  test('hesap menüsü telefonda: kilitle, PIN ile aç, oturumu kapat ve PIN ile yeniden aç', async ({
    page
  }) => {
    await page.goto('/#/today')
    await page.getByTestId('app-ready').waitFor({ state: 'attached' })
    try {
      const trigger = page.getByTestId('user-menu')
      const box = await trigger.boundingBox()
      expect(box!.height).toBeGreaterThanOrEqual(44)
      expect(box!.width).toBeGreaterThanOrEqual(44)
      await trigger.click()
      await page.getByTestId('menu-lock').click()
      await expect(page.getByTestId('lock')).toBeVisible()
      await expect(page.getByTestId('mobile-nav')).toHaveCount(0)
      await page.getByTestId('unlock-secret').fill(OWNER.pin)
      await page.getByTestId('unlock').click()
      await expect(page.getByRole('heading', { level: 1, name: 'Bugün' })).toBeVisible()

      await page.getByTestId('user-menu').click()
      await page.getByTestId('menu-sign-out').click()
      await expect(page.getByTestId('login')).toBeVisible()
      await page.getByRole('button', { name: /Otel Sahibi/ }).click()
      await page.getByTestId('secret').fill(OWNER.pin)
      await page.getByTestId('sign-in').click()
      await expect(page.getByRole('heading', { level: 1, name: 'Takvim' })).toBeVisible()
    } finally {
      await restoreOwner(page)
    }
  })

  for (const lang of ['tr', 'ru'] as const)
    test(`${lang === 'ru' ? 'Rusça uzun metinlerle' : 'Türkçe'} hiçbir ekran yatay taşmaz`, async ({
      page,
      request
    }) => {
      test.setTimeout(150_000)
      await request.post('/api/settings.set', { data: { 'ui.language': lang } })
      const check = async (route: string): Promise<void> => {
        await page.goto(`/#/${route}`)
        await page.getByTestId('app-ready').waitFor({ state: 'attached' })
        await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
        await expect.poll(() => page.evaluate(overflowReport), { message: route }).toEqual([])
      }
      try {
        for (const route of SCREEN_ROUTES) await check(route)
        await api(page, 'auth.lock')
        await check('lock')
        await api(page, 'auth.unlock', { secret: OWNER.pin })
        await api(page, 'auth.signOut')
        for (const route of SIGNED_OUT_ROUTES) await check(route)
      } finally {
        await restoreOwner(page)
        await request.post('/api/settings.set', { data: { 'ui.language': 'tr' } })
      }
    })
})
