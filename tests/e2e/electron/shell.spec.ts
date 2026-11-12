import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Launched } from './fixtures'
import { overflowReport, SCREEN_ROUTES, SETUP_ROUTES, SIGNED_OUT_ROUTES } from '../routes'
import { api, signIn } from '../bridge'
import { OWNER } from '../setup-draft.mjs'

test('program takvimle açılır, veri klasörü oluşur, hiçbir ağ isteği yapılmaz', async ({
  launch,
  userData
}) => {
  const { page, requests } = await launch()
  await expect(page).toHaveTitle('Bismuth')
  await expect(page.getByRole('heading', { level: 1, name: 'Takvim' })).toBeVisible()
  await page.getByTestId('nav-about').click()
  await expect(page.getByTestId('about-integrity')).toHaveText('Sağlam')
  await expect(page.getByTestId('license-list')).toContainText('react')
  // Faz 16 madde 3: the build stamp (commit short id + its day) and the full licence texts.
  await expect(page.getByTestId('about-commit')).toHaveText(/^[0-9a-f]{7,}(-dirty)?$/)
  await expect(page.getByTestId('about-build-date')).toHaveText(/\d{4}/)
  await page.getByTestId('show-licenses').click()
  await expect(page.getByTestId('license-texts')).toContainText('MIT License')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('license-texts')).toBeHidden()
  expect(existsSync(join(userData, 'bismuth.db'))).toBe(true)
  expect(existsSync(join(userData, 'logs', 'main.log'))).toBe(true)
  const external = requests.filter((u) => !u.startsWith('file://') && !u.startsWith('data:'))
  expect(external).toEqual([])
})

test('dil Rusça seçilince kabuk metinleri değişir ve yeniden açılışta kalır', async ({
  launch,
  userData
}) => {
  const first = await launch()
  await first.page.getByTestId('nav-settings').click()
  await first.page.getByTestId('language-select').click()
  await first.page.getByTestId('language-ru').click()
  await expect(first.page.getByRole('heading', { level: 1, name: 'Настройки' })).toBeVisible()
  await expect(first.page.getByTestId('nav-calendar')).toHaveText('Календарь')
  await first.page.getByTestId('settings-tab-general').click()
  await expect(first.page.getByTestId('money-preview')).toHaveText(/2\s500\s₺/)
  await first.app.close()

  const second = await launch(userData)
  await expect(second.page.getByRole('heading', { level: 1, name: 'Календарь' })).toBeVisible()
})

test('koyu tema ve "ödendi" rengi ayardan değişir', async ({ launch }) => {
  const { page } = await launch()
  await page.getByTestId('nav-settings').click()
  await page.getByTestId('settings-tab-general').click()
  await page.getByTestId('theme-dark').click()
  await expect(page.locator('html')).toHaveClass(/dark/)

  await page.getByTestId('settings-tab-tags').click()
  await page.getByTestId('color-paid').fill('#16a34a')
  await expect
    .poll(() => page.getByTestId('swatch-paid').evaluate((el) => getComputedStyle(el).backgroundColor))
    .toBe('rgb(22, 163, 74)')
  await page.getByTestId('settings-tab-general').click()
  await page.getByTestId('theme-light').click()
  await expect(page.locator('html')).not.toHaveClass(/dark/)
  await page.getByTestId('settings-tab-tags').click()
  // Each theme keeps its own colours: the light theme still shows the Excel red.
  await expect
    .poll(() => page.getByTestId('swatch-paid').evaluate((el) => getComputedStyle(el).backgroundColor))
    .toBe('rgb(239, 68, 68)')
  await expect(page.getByTestId('color-paid')).toHaveValue('#ef4444')
  await expect(page.getByTestId('status-colors-theme')).toContainText('açık tema')
})

test('durum etiketleri: yeni etiket ve kapatılan durum takvim önizlemesine hemen yansır', async ({
  launch
}) => {
  const { page } = await launch()
  await page.goto(page.url().replace(/#.*$/, '#/settings?tab=tags'))
  const preview = page.getByTestId('tag-preview')
  await expect(preview.getByTestId('legend')).toContainText('Ödendi')
  await page.getByTestId('enabled-paid').click()
  await expect(preview.getByTestId('legend')).not.toContainText('Ödendi')
  await page.getByTestId('add-tag').click()
  await page.getByTestId('tag-name').fill('Grup')
  await page.getByTestId('save-tag').click()
  await expect(preview.getByTestId('legend')).toContainText('Grup')
  // Survives a reload: the tags live in the database, not in the screen.
  await page.reload()
  await expect(page.getByTestId('tag-preview').getByTestId('legend')).toContainText('Grup')
  await expect(page.getByTestId('tag-preview').getByTestId('legend')).not.toContainText('Ödendi')
})

test('pencere güvenliği: arayüzde Node yok, preload yalnız "bismuth" köprüsünü açar', async ({ launch }) => {
  const { page } = await launch()
  const globals = await page.evaluate(() => ({
    require: typeof (window as unknown as { require?: unknown }).require,
    process: typeof (window as unknown as { process?: unknown }).process,
    electron: typeof (window as unknown as { electron?: unknown }).electron,
    bridge: Object.keys(window.bismuth ?? {}).sort()
  }))
  expect(globals).toEqual({
    require: 'undefined',
    process: 'undefined',
    electron: 'undefined',
    bridge: ['api', 'platform', 'ready']
  })
  // Navigating away from the app is blocked (will-navigate policy).
  await page.evaluate(() => {
    window.location.href = 'https://example.com/'
  })
  await page.waitForTimeout(500)
  expect(page.url().startsWith('file://')).toBe(true)
})

/** Every screen of the shell, signed in, then the lock and sign-in screens, in Turkish and Russian. */
async function noScreenOverflows(
  { app, page }: Pick<Launched, 'app' | 'page'>,
  width: number,
  height: number
): Promise<void> {
  await app.evaluate(
    ({ BrowserWindow }, size) => {
      const w = BrowserWindow.getAllWindows()[0]!
      w.unmaximize()
      w.setContentSize(size.width, size.height)
    },
    { width, height }
  )
  const check = async (route: string, what: string): Promise<void> => {
    await page.goto(page.url().replace(/#.*$/, `#/${route}`))
    await page.getByTestId('app-ready').waitFor({ state: 'attached' })
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
    await expect.poll(() => page.evaluate(overflowReport), { message: what }).toEqual([])
  }
  for (const lang of ['tr', 'ru'] as const) {
    expect((await api(page, 'settings.set', { 'ui.language': lang })).status).toBe(200)
    for (const route of SCREEN_ROUTES) await check(route, `${width}×${height} ${lang} ${route}`)
    // The screens outside the shell, each in the sign-in state that shows it.
    await api(page, 'auth.lock')
    await check('lock', `${lang} lock`)
    await api(page, 'auth.unlock', { secret: OWNER.pin })
    await api(page, 'auth.signOut')
    for (const route of SIGNED_OUT_ROUTES) await check(route, `${lang} ${route}`)
    await signIn(page)
  }
}

test('1366×768: hiçbir ekran yatay taşmaz (Türkçe ve Rusça)', async ({ launch }) => {
  test.setTimeout(300_000)
  await noScreenOverflows(await launch(), 1366, 768)
})

test('1280×720: hiçbir ekran yatay taşmaz (Türkçe ve Rusça)', async ({ launch }) => {
  test.setTimeout(300_000)
  await noScreenOverflows(await launch(), 1280, 720)
})

test('yan menü daraltılır; tercih kişinin ayarıdır, yeniden açılışta korunur', async ({
  launch,
  userData
}) => {
  const first = await launch()
  const sidebar = first.page.locator('[data-slot="sidebar"]').first()
  await expect(sidebar).toHaveAttribute('data-state', 'expanded')
  await first.page.getByRole('button', { name: 'Menüyü aç/kapat' }).first().click()
  await expect(sidebar).toHaveAttribute('data-state', 'collapsed')
  await expect
    .poll(
      async () => (await api<Record<string, unknown>>(first.page, 'settings.get')).body['ui.sidebarCollapsed']
    )
    .toBe(true)
  await first.app.close()

  const second = await launch(userData)
  await expect(second.page.locator('[data-slot="sidebar"]').first()).toHaveAttribute(
    'data-state',
    'collapsed'
  )
  // Ctrl+B opens it again (the shortcut list names it).
  await second.page.getByRole('heading', { level: 1 }).first().click()
  await second.page.keyboard.press('Control+b')
  await expect(second.page.locator('[data-slot="sidebar"]').first()).toHaveAttribute('data-state', 'expanded')
})

test('1366×768: kurulum ve bağlantı ekranları yatay taşmaz (Türkçe ve Rusça)', async ({ launch }) => {
  test.setTimeout(120_000)
  const { app, page } = await launch({ setup: false })
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]!
    w.unmaximize()
    w.setContentSize(1366, 768)
  })
  for (const lang of ['tr', 'ru'] as const) {
    expect((await api(page, 'settings.set', { 'ui.language': lang })).status).toBe(200)
    for (const route of SETUP_ROUTES) {
      await page.goto(page.url().replace(/#.*$/, `#/${route}`))
      await page.getByTestId('app-ready').waitFor({ state: 'attached' })
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
      await expect.poll(() => page.evaluate(overflowReport), { message: `${lang} ${route}` }).toEqual([])
    }
  }
})
