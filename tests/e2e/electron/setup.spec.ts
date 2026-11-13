// Faz 4 kabul ölçütleri (kurulum sihirbazı, G-10): sıfır veritabanıyla açılış → sihirbaz → 19 oda, 5 kat, 38 yatak
// (Türkçe ve Rusça) → kurtarma kodları → program açılır; yarıda kapanınca kaldığı yerden devam; "istemci" seçilince
// bağlantı ekranı. Each test starts from its own empty data folder.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'

const root = resolve(__dirname, '../../..')
const folders: string[] = []
const apps: ElectronApplication[] = []

function freshUserData(): string {
  const dir = mkdtempSync(join(tmpdir(), 'bismuth-setup-e2e-'))
  folders.push(dir)
  return dir
}

/** The built app on `userData`, showing the wizard. */
async function launch(userData: string): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await _electron.launch({
    args: [root, ...(process.platform === 'linux' ? ['--no-sandbox'] : [])],
    env: { ...process.env, BISMUTH_USER_DATA: userData, ELECTRON_RENDERER_URL: '' },
    cwd: root
  })
  apps.push(app)
  const page = await app.firstWindow()
  await page.getByTestId('app-ready').waitFor({ state: 'attached' })
  await page.goto(page.url().replace(/#.*$/, '#/setup'))
  await page.getByTestId('setup-step-body').waitFor()
  return { app, page }
}

/** A procedure over the window's own bridge (the same session the wizard uses). */
async function call<T>(page: Page, name: string, body: unknown = {}): Promise<T> {
  const res = await page.evaluate(([path, json]) => window.bismuth!.api({ path, body: json }), [
    `/api/${name}`,
    JSON.stringify(body)
  ] as const)
  return JSON.parse(res.body) as T
}

test.afterEach(async () => {
  for (const app of apps.splice(0)) await app.close().catch(() => undefined)
  for (const dir of folders.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const heading = (page: Page, name: string) => page.getByRole('heading', { level: 2, name, exact: true })
const next = (page: Page) => page.getByTestId('setup-next').click()

const TEXT = {
  tr: {
    steps: ['Dil ve tema', 'Çalışma şekli', 'Otel', 'Para birimleri', 'Oda tipleri', 'Odalar'],
    rest: ['Ödeme ve satış', 'Personel ve vardiyalar', 'Çalışanlar', 'Takvim', 'Sahip hesabı', 'Özet'],
    hourly: 'Saatlik satış',
    price: '2.800',
    totals: '19 oda · 38 yatak',
    calendar: 'Takvim',
    percent: 'Yüzde',
    republicDay: 'Cumhuriyet Bayramı',
    channelGroups: ['Doğrudan satış', 'Satış siteleri', 'Acente ve toptancılar', 'Bavul emaneti'],
    otelz: 'Otelz.com (Türkiye)',
    hotels: 'Hotels.com (Expedia Group)',
    ownTask: 'Lobideki çiçekleri sula',
    ownRule: 'Her gün 08:30'
  },
  ru: {
    steps: ['Язык и тема', 'Режим работы', 'Отель', 'Валюты', 'Типы номеров', 'Номера'],
    rest: [
      'Оплата и продажи',
      'Персонал и смены',
      'Сотрудники',
      'Календарь',
      'Учётная запись владельца',
      'Сводка'
    ],
    hourly: 'Почасовые продажи',
    price: '2.800',
    totals: '19 номеров · 38 кроватей',
    calendar: 'Календарь',
    percent: 'Процент',
    republicDay: 'День Республики',
    channelGroups: [
      'Прямые продажи',
      'Сайты бронирования',
      'Агентства и оптовые операторы',
      'Хранение багажа'
    ],
    otelz: 'Otelz.com (Турция)',
    hotels: 'Hotels.com (Expedia Group)',
    ownTask: 'Полить цветы в лобби',
    ownRule: 'Каждый день в 08:30'
  }
} as const

for (const lang of ['tr', 'ru'] as const) {
  test(`sıfır veritabanı → sihirbaz (${lang}) → 19 oda, 5 kat, 38 yatak → kurtarma kodları → program açılır`, async () => {
    const started = Date.now()
    const text = TEXT[lang]
    const { page } = await launch(freshUserData())

    // 1. Dil ve tema: the interface follows the choice at once.
    await page.getByTestId(`setup-lang-${lang}`).click()
    await expect(heading(page, text.steps[0])).toBeVisible()
    await next(page)
    // 2. Çalışma şekli: tek bilgisayar.
    await expect(heading(page, text.steps[1])).toBeVisible()
    await next(page)
    // 3. Otel.
    await expect(heading(page, text.steps[2])).toBeVisible()
    await page.getByTestId('setup-hotel-name').fill('Martı Otel')
    await page.getByTestId('setup-hotel-city').fill('İstanbul')
    await next(page)
    // 4. Para birimleri: defaults.
    await expect(heading(page, text.steps[3])).toBeVisible()
    await next(page)
    // 5. Oda tipleri: the suggested type with a nightly rate.
    await expect(heading(page, text.steps[4])).toBeVisible()
    await page.locator('[id^="setup-price-"][id$="-base"]').first().fill(text.price)
    await next(page)
    // 6. Odalar: 5 floors × 4 rooms, one removed (Pandora, S-78).
    await expect(heading(page, text.steps[5])).toBeVisible()
    await page.getByTestId('setup-floors').fill('5')
    await page.getByTestId('setup-per-floor').fill('4')
    await page.getByTestId('setup-beds').fill('2')
    await page.getByTestId('setup-generate').click()
    await page.getByTestId('setup-remove-room-504').click()
    await expect(page.getByTestId('setup-room-totals')).toHaveText(text.totals)
    await next(page)
    // Saatlik satış (hourly stays): nothing to change here.
    await expect(heading(page, text.hourly)).toBeVisible()
    await next(page)
    // 7. Ödeme ve satış: the channels sit under one heading per kind; only the Excel channels and e-mail start ticked.
    await expect(heading(page, text.rest[0])).toBeVisible()
    const channels = page.getByTestId('setup-list-salesChannels')
    for (const group of text.channelGroups)
      await expect(channels.getByRole('group', { name: group })).toBeVisible()
    const chip = (code: string) => page.getByTestId(`setup-list-salesChannels-${code}`)
    for (const code of [
      'direct',
      'phone',
      'walk_in',
      'email',
      'airbnb',
      'booking',
      'expedia',
      'ostrovok',
      'bounce'
    ])
      await expect(chip(code)).toBeChecked()
    for (const code of ['whatsapp', 'hotels_com', 'otelz', 'agoda', 'agency', 'hotelbeds', 'radical_storage'])
      await expect(chip(code)).not.toBeChecked()
    // Two different sites, two different names (Turkish Otelz.com, Expedia Group's Hotels.com).
    await expect(channels.getByText(text.otelz, { exact: true })).toBeVisible()
    await expect(channels.getByText(text.hotels, { exact: true })).toBeVisible()
    await next(page)
    // 8. Personel: the default rules and shifts, with a 2,5 % bonus (prim).
    await expect(heading(page, text.rest[1])).toBeVisible()
    await page.getByTestId('setup-commission-mode').click()
    await page.getByRole('option', { name: text.percent }).click()
    await page.getByTestId('setup-commission-pct').fill('2,5')
    // One task of the hotel's own, every day at 08:30 (Enter adds it; it does not move the wizard on).
    await page.getByTestId('setup-own-task-time').fill('08:30')
    await page.getByTestId('setup-own-task-title').fill(text.ownTask)
    await page.getByTestId('setup-own-task-title').press('Enter')
    await expect(page.getByTestId('setup-own-task-list')).toContainText(text.ownRule)
    await next(page)
    // 9. Çalışanlar: none.
    await expect(heading(page, text.rest[2])).toBeVisible()
    // The new step's title has the focus (screen readers say where they are).
    await expect(page.getByTestId('setup-step-title')).toBeFocused()
    await next(page)
    // 10. Takvim: Türkiye's holidays are previewed.
    await expect(heading(page, text.rest[3])).toBeVisible()
    await expect(
      page.getByTestId('setup-holidays').getByText(text.republicDay, { exact: true }).first()
    ).toBeVisible()
    await next(page)
    // 11. Sahip hesabı.
    await expect(heading(page, text.rest[4])).toBeVisible()
    await page.getByTestId('setup-owner-name').fill('Otel Sahibi')
    await page.getByTestId('setup-owner-username').fill('sahip')
    await page.getByTestId('setup-owner-password').fill('cok-gizli-sifre')
    await page.getByTestId('setup-owner-repeat').fill('cok-gizli-sifre')
    await page.getByTestId('setup-owner-pin').fill('2468')
    await next(page)
    // 12. Özet → Kurulumu bitir.
    await expect(heading(page, text.rest[5])).toBeVisible()
    await expect(page.getByTestId('setup-summary-totals')).toHaveText(text.totals)
    await page.getByTestId('setup-finish').click()

    // Recovery codes once, then into the program.
    await expect(page.getByTestId('recovery-codes')).toBeVisible()
    expect(await page.getByTestId('recovery-code').count()).toBeGreaterThan(0)
    // One paper step (K-41): the Bismuth key (or, where this computer cannot keep one, the note) beside the codes,
    // and the print button.
    await expect(page.getByTestId('recovery-key').or(page.getByTestId('recovery-key-failed'))).toBeVisible()
    await expect(page.getByTestId('recovery-print')).toBeEnabled()
    await expect(page.getByTestId('recovery-continue')).toBeDisabled()
    await page.getByTestId('recovery-written').click()
    await page.getByTestId('recovery-continue').click()
    await expect(page.getByRole('heading', { level: 1, name: text.calendar })).toBeVisible()

    const state = await call<{ setup: string; session: { user: { username: string } } | null }>(
      page,
      'auth.state'
    )
    expect(state).toMatchObject({ setup: 'done', session: { user: { username: 'sahip' } } })
    const rooms = await call<{ number: string; beds: number }[]>(page, 'rooms.list')
    expect(rooms).toHaveLength(19)
    expect(rooms.reduce((sum, r) => sum + r.beds, 0)).toBe(38)
    const policy = await call<{ values: Record<string, unknown> }>(page, 'staff.getPolicy', {})
    expect(policy.values).toMatchObject({ commissionMode: 'pct', commissionPct: '2.5', leaveDaysPerMonth: 4 })
    const templates = await call<{ code: string | null; title: string | null; active: boolean }[]>(
      page,
      'tasks.listTemplates',
      {}
    )
    expect(templates.filter((t) => t.code === null)).toEqual([
      expect.objectContaining({ title: text.ownTask, active: true })
    ])
    expect(Date.now() - started).toBeLessThan(10 * 60_000)
  })
}

test('yarıda kapanan kurulum aynı veri klasörüyle açılınca 5. adımdan, cevaplarla devam eder', async () => {
  const userData = freshUserData()
  const first = await launch(userData)
  const page = first.page
  await next(page)
  await expect(heading(page, 'Çalışma şekli')).toBeVisible()
  await page.getByTestId('setup-mode-host').click()
  await next(page)
  await expect(heading(page, 'Otel')).toBeVisible()
  await page.getByTestId('setup-hotel-name').fill('Martı Otel')
  await page.getByTestId('setup-hotel-city').fill('İzmir')
  await next(page)
  await expect(heading(page, 'Para birimleri')).toBeVisible()
  await page.getByTestId('setup-currency-GBP').click()
  // A currency outside the chips: found by name in the UI language, added as a ticked chip.
  await page.getByTestId('setup-currency-add').click()
  await page.getByTestId('setup-currency-add-search').fill('yen')
  await expect(page.getByTestId('setup-currency-add-JPY')).toContainText('Japon yeni')
  await page.getByTestId('setup-currency-add-JPY').click()
  await expect(page.getByTestId('setup-currency-JPY')).toBeChecked()
  await next(page)
  await expect(heading(page, 'Oda tipleri')).toBeVisible()
  await first.app.close()

  const second = await launch(userData)
  await expect(heading(second.page, 'Oda tipleri')).toBeVisible()
  await second.page.getByTestId('setup-goto-hotel').click()
  await expect(second.page.getByTestId('setup-hotel-name')).toHaveValue('Martı Otel')
  await expect(second.page.getByTestId('setup-hotel-city')).toHaveValue('İzmir')
  await second.page.getByTestId('setup-goto-currencies').click()
  await expect(second.page.getByTestId('setup-currency-GBP')).not.toBeChecked()
  await expect(second.page.getByTestId('setup-currency-EUR')).toBeChecked()
  await expect(second.page.getByTestId('setup-currency-JPY')).toBeChecked()
  await second.page.getByTestId('setup-goto-mode').click()
  await expect(second.page.getByTestId('setup-mode-host')).toBeChecked()
})

test('"Başka bir Bismuth\'a bağlan" seçilince mod kaydedilir ve bağlantı ekranına gidilir', async () => {
  const { page } = await launch(freshUserData())
  await next(page)
  await page.getByTestId('setup-mode-client').click()
  await page.getByTestId('setup-next').click()
  await expect(page).toHaveURL(/#\/connect/)
  const state = await call<{ setup: string; mode: string }>(page, 'auth.state')
  expect(state).toMatchObject({ setup: 'needed', mode: 'client' })
})
