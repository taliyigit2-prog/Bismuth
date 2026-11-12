// faz-05 kabul ölçütleri end to end (P5c): the grid and the reservation panel together in the real app. The Excel
// scenarios are typed through the screens (several rooms, night-by-night prices, a day-use and a night on the same
// day, a not-for-sale block, parking, a deposit, a note) and the grid shows each one; status colours and names
// apply at once and survive a restart, a "VIP" tag shows in the legend and on the bar; a person not reported to KBS
// marks the bar; the weekend nights get their own suggested price; a payment repaints the grid's cells.
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { api, reload } from '../bridge'

const root = resolve(__dirname, '../../..')
const shots = process.env['FLOW_SHOTS']

const pad = (n: number): string => String(n).padStart(2, '0')
const iso = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const today = (): string => iso(new Date())
const addDays = (day: string, n: number): string => {
  const d = new Date(`${day}T12:00:00`)
  d.setDate(d.getDate() + n)
  return iso(d)
}
/** "8 Ekim 2026": how the date picker names a day (its cell's name starts with it). */
const trDay = (day: string): string =>
  new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }).format(
    new Date(`${day}T12:00:00`)
  )

async function newReservation(page: Page, guest: string): Promise<Locator> {
  await page.getByRole('button', { name: 'Yeni rezervasyon' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Yeni rezervasyon' })
  await dialog.getByRole('combobox', { name: 'Misafir' }).click()
  await page.getByPlaceholder('Ad ya da telefon…').fill(guest)
  await page.getByText(`Yeni misafir: ${guest}`).click()
  return dialog
}

async function pickRoom(page: Page, number: string): Promise<void> {
  await page.getByTestId('room-multi-picker').click()
  await page.getByTestId(`room-option-${number}`).getByRole('checkbox').click()
  await page.keyboard.press('Escape')
}

/** Opens a date field by its label and picks a day (moving to the next month when needed). */
async function pickDate(page: Page, scope: Locator, label: string, day: string): Promise<void> {
  await scope.getByLabel(label, { exact: true }).click()
  const cell = page.getByRole('gridcell', { name: new RegExp(`^${trDay(day)}`) }).first()
  for (let i = 0; i < 3 && !(await cell.isVisible()); i++)
    await page.getByRole('button', { name: 'Sonraki ay' }).click()
  await cell.click()
}

async function save(page: Page): Promise<Locator> {
  await page.getByTestId('new-reservation-save').click()
  const panel = page.getByTestId('reservation-panel')
  await expect(panel.getByTestId('panel-guest')).toBeVisible()
  return panel
}

async function closePanel(page: Page): Promise<void> {
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('reservation-panel')).toHaveCount(0)
}

const bar = (page: Page, guest: string, room: string): Locator =>
  page.getByTestId('tape-chart').getByRole('button', { name: new RegExp(`^${guest}, oda ${room},`) })

const nightPaint = (b: Locator, day: string): Locator => b.locator(`[data-night="${day}"]`)

test('Excel senaryoları: çok oda, gece gece fiyat, not, kapora, aynı gün iki misafir, satılmaz blok, park ve açık arıza ızgarada', async ({
  launch
}) => {
  test.setTimeout(240_000)
  const { page } = await launch()
  const day0 = today()
  const grid = await api<{ rooms: { id: string; number: string }[] }>(page, 'reservations.grid', {
    from: day0,
    to: addDays(day0, 1)
  })
  const roomId = (n: string) => grid.body.rooms.find((r) => r.number === n)!.id
  const issue = await api(page, 'housekeeping.reportIssue', {
    roomId: roomId('203'),
    title: 'Klima su damlatıyor',
    severity: 'urgent'
  })
  expect(issue.status, JSON.stringify(issue.body)).toBe(200)
  await reload(page, '#/calendar')
  // Açık arıza (G-180): a wrench in the room column, the issue in its tooltip.
  const wrench = page.getByTestId('room-issue-203')
  await expect(wrench).toHaveAccessibleName('Açık arıza: 1')
  await expect(wrench).toHaveAttribute('title', /Klima su damlatıyor/)

  // Çok oda (G-35) + gece gece fiyat (G-36) + not (G-34): rooms 101 and 103, three nights, one night by hand.
  let dialog = await newReservation(page, 'Selin Kaya')
  await pickRoom(page, '101')
  await pickRoom(page, '103')
  await pickDate(page, dialog, 'Çıkış', addDays(day0, 3))
  const block101 = dialog.getByTestId('price-block-101')
  await block101.getByRole('button', { name: /Gece gece fiyat \(3 gece\)/ }).click()
  const second = block101.getByRole('textbox', { name: /gecesinin fiyatı/ }).nth(1)
  await second.fill('3.500')
  await second.press('Tab')
  await dialog.getByLabel('Not', { exact: true }).fill('Geç gelecek, bebek yatağı')
  let panel = await save(page)
  await panel.getByRole('tab', { name: 'Geceler' }).click()
  await expect(
    panel
      .getByTestId(`night-${addDays(day0, 1)}`)
      .first()
      .getByRole('textbox')
  ).toHaveValue('3.500')
  // Kapora (G-43): a deposit smaller than the first night (its own colour, "kısmen ödendi / kapora").
  await panel.getByTestId('panel-pay').click()
  await page.getByTestId('pay-kind-deposit').click()
  await page.getByLabel('Tutar').fill('1.000')
  await page.getByTestId('payment-save').click()
  await expect(page.getByTestId('payment-save')).toHaveCount(0)
  await closePanel(page)
  const selin101 = bar(page, 'Selin Kaya', '101')
  await expect(selin101).toBeVisible()
  await expect(bar(page, 'Selin Kaya', '103')).toBeVisible()
  await expect(selin101).toHaveAttribute('data-icons', /\bnote\b/)
  await expect(nightPaint(selin101, day0)).toHaveAttribute('data-paint', 'partial')
  await expect(nightPaint(bar(page, 'Selin Kaya', '103'), day0)).toHaveAttribute('data-paint', 'unpaid')

  // Aynı gün iki misafir + day-use (G-37): a day-use in 102 today and a night from today in the same room.
  dialog = await newReservation(page, 'Gündüz Konuk')
  await pickRoom(page, '102')
  await pickDate(page, dialog, 'Çıkış', day0)
  await expect(dialog.getByTestId('new-total')).toContainText('Aynı gün giriş‑çıkış')
  await save(page)
  await closePanel(page)
  await newReservation(page, 'Gece Konuk')
  await pickRoom(page, '102')
  await save(page)
  await closePanel(page)
  const dayUse = bar(page, 'Gündüz Konuk', '102')
  const night = bar(page, 'Gece Konuk', '102')
  await expect(nightPaint(dayUse, day0)).toHaveAttribute('data-paint', 'dayuse')
  const a = await dayUse.boundingBox()
  const b = await night.boundingBox()
  expect(a && b && a.x + a.width <= b.x + 1 && Math.abs(a.y - b.y) < 2).toBe(true)

  // Satılmaz blok (G-38): room 201 from today for three days.
  await page.getByTestId('block-new').click()
  const blockDialog = page.getByRole('dialog', { name: 'Odayı satışa kapat' })
  await blockDialog.getByRole('combobox', { name: 'Oda' }).click()
  await page.getByRole('option', { name: 'Oda 201' }).click()
  await pickDate(page, blockDialog, 'Son gün', addDays(day0, 2))
  await blockDialog.getByLabel('Neden').fill('Sahibin misafiri')
  await page.getByTestId('block-save').click()
  const closed = page.getByTestId('tape-row-201').getByRole('button', { name: 'Satılmaz: Sahibin misafiri' })
  await expect(closed).toBeVisible()
  // The same room is closed on those days: the room picker says so; the owner (rooms.block) may still tick it,
  // and then the form asks for the reason of "yine de" (§6.1).
  dialog = await newReservation(page, 'Deneme Misafir')
  await page.getByTestId('room-multi-picker').click()
  const option201 = page.getByTestId('room-option-201')
  await expect(option201).toContainText('Satışa kapalı')
  await option201.getByRole('checkbox').check()
  await page.keyboard.press('Escape')
  await expect(dialog.getByTestId('override-reason')).toBeVisible()
  await dialog.getByRole('button', { name: 'Vazgeç' }).click()
  await expect(dialog).toHaveCount(0)

  // Park (G-39): the bar leaves the grid and waits in the park area.
  await newReservation(page, 'Park Misafir')
  await pickRoom(page, '202')
  panel = await save(page)
  await panel.getByTestId('panel-more').click()
  await page.getByTestId('panel-park').click()
  await page.getByTestId('park-confirm').click()
  await expect(page.getByTestId('park-confirm')).toHaveCount(0)
  await closePanel(page)
  await expect(bar(page, 'Park Misafir', '202')).toHaveCount(0)
  await expect(page.getByTestId('park-area')).toContainText('Park Misafir')
  if (shots) await page.screenshot({ path: `${shots}/flow-excel-desktop.png` })
})

test('durum rengi ve adı anında değişir, yeniden açılışta korunur; "VIP" etiketi lejantta ve hücrede', async ({
  launch
}) => {
  test.setTimeout(240_000)
  const first = await launch()
  let page = first.page
  await reload(page, '#/settings?tab=tags')
  await page.getByTestId('name-paid').fill('Tamamı ödendi')
  await page.getByTestId('color-paid').fill('#0f766e')
  await page.getByTestId('add-tag').click()
  const add = page.getByRole('dialog').filter({ has: page.getByTestId('tag-name') })
  await add.getByTestId('tag-name').fill('VIP')
  await add.locator('input[type="color"]').fill('#7c3aed')
  await page.getByTestId('save-tag').click()
  await expect
    .poll(async () => {
      const tags = await api<{ code: string; name: string | null; kind: string }[]>(page, 'statusTags.list')
      return tags.body.filter((t) => t.code === 'paid' || t.kind === 'custom').map((t) => t.name)
    })
    .toEqual(['Tamamı ödendi', 'VIP'])
  await expect
    .poll(async () => {
      const s = await api<Record<string, Record<string, string>>>(page, 'settings.get')
      return s.body['ui.statusColors']?.['paid']
    })
    .toBe('#0f766e')

  // A paid reservation with the VIP tag.
  await page.goto(page.url().replace(/#.*$/, '#/calendar'))
  const dialog = await newReservation(page, 'Leyla Demir')
  await pickRoom(page, '101')
  await dialog.getByRole('group', { name: 'Etiketler' }).getByRole('button', { name: 'VIP' }).click()
  const panel = await save(page)
  await panel.getByTestId('panel-pay').click()
  await page.getByTestId('payment-save').click()
  await expect(page.getByTestId('payment-save')).toHaveCount(0)
  await closePanel(page)

  const check = async (p: Page): Promise<void> => {
    const legend = p.getByRole('region', { name: 'Lejant' })
    await expect(legend.getByText('Tamamı ödendi', { exact: true })).toBeVisible()
    await expect(legend.getByText('VIP', { exact: true })).toBeVisible()
    await expect(legend.getByText('Ödendi', { exact: true })).toHaveCount(0)
    const leyla = bar(p, 'Leyla Demir', '101')
    await expect(leyla).toHaveAccessibleName(/Tamamı ödendi, VIP/)
    await expect(nightPaint(leyla, today())).toHaveAttribute('data-paint', 'paid')
    await expect(nightPaint(leyla, today())).toHaveCSS('background-color', 'rgb(15, 118, 110)')
    await expect(leyla).toHaveCSS('border-top-color', 'rgb(124, 58, 237)')
  }
  await check(page)
  if (shots) await page.screenshot({ path: `${shots}/flow-vip-desktop.png` })

  // Closed and opened again: the same names and colours.
  await first.app.close()
  page = (await launch()).page
  await expect(page).toHaveURL(/#\/calendar/)
  await check(page)
})

test('ikinci kişi KBS işaretsizse ızgaradaki çubukta uyarı simgesi çıkar, işaretlenince kalkar; çıkışta KBS çıkışı istenir', async ({
  launch
}) => {
  test.setTimeout(180_000)
  const { page } = await launch()
  await newReservation(page, 'Kerem Aksoy')
  await pickRoom(page, '102')
  let panel = await save(page)
  await panel.getByTestId('panel-check-in').click()
  await expect(panel.getByTestId('panel-check-out')).toBeVisible()
  await panel.getByRole('tab', { name: /Kişiler/ }).click()
  await panel.getByRole('button', { name: "KBS'ye bildirdim" }).first().click()
  await expect(panel.getByTestId('panel-kbs-warning')).toHaveCount(0)
  await closePanel(page)
  const kerem = bar(page, 'Kerem Aksoy', '102')
  await expect(kerem).not.toHaveAttribute('data-icons', /\bkbs\b/)

  await kerem.click()
  panel = page.getByTestId('reservation-panel')
  await panel.getByRole('tab', { name: /Kişiler/ }).click()
  await panel.getByTestId('person-name').fill('Bora Aksoy')
  await panel.getByRole('button', { name: 'Kişi ekle' }).click()
  await expect(panel.getByTestId('panel-kbs-warning')).toHaveText('KBS eksik: 1')
  await closePanel(page)
  await expect(kerem).toHaveAttribute('data-icons', /\bkbs\b/)
  await expect(kerem).toHaveAccessibleName(/KBS'ye bildirilmemiş kişi var/)
  if (shots) await page.screenshot({ path: `${shots}/flow-kbs-desktop.png` })

  await kerem.click()
  await panel.getByRole('tab', { name: /Kişiler/ }).click()
  await panel.getByRole('button', { name: "KBS'ye bildirdim" }).click()
  await expect(panel.getByTestId('panel-kbs-warning')).toHaveCount(0)
  await closePanel(page)
  await expect(kerem).not.toHaveAttribute('data-icons', /\bkbs\b/)

  await kerem.click()
  await panel.getByTestId('panel-check-out').click()
  await expect(page.getByTestId('checkout-kbs-warning')).toContainText('Bora Aksoy')
})

test('program takvimle açılır; öneri fiyat hafta sonu gecelerinde farklı gelir ve elle değiştirilebilir', async ({
  launch
}) => {
  test.setTimeout(180_000)
  const { page } = await launch()
  await expect(page).toHaveURL(/#\/calendar/)
  await expect(page.getByTestId('tape-chart')).toBeVisible()
  // Next Monday to Monday: seven nights; Friday and Saturday nights take the weekend price (K-44:
  // pricing.weekendNights, apart from the calendar's highlighted days).
  const now = new Date(`${today()}T12:00:00`)
  const monday = addDays(today(), ((8 - now.getDay()) % 7) + 7)
  const friday = addDays(monday, 4)
  const saturday = addDays(monday, 5)
  const sunday = addDays(monday, 6)
  const dialog = await newReservation(page, 'Hafta Sonu')
  await pickRoom(page, '101')
  await pickDate(page, dialog, 'Giriş', monday)
  await pickDate(page, dialog, 'Çıkış', addDays(monday, 7))
  const block = dialog.getByTestId('price-block-101')
  await expect(block.getByTestId('suggested-price')).toContainText('₺2.800')
  await expect(block.getByTestId('suggested-price')).toContainText('₺3.200')
  await block.getByRole('button', { name: /Gece gece fiyat \(7 gece\)/ }).click()
  await expect(block.getByTestId(`night-${friday}`)).toContainText('Hafta sonu')
  await expect(block.getByTestId(`night-${saturday}`)).toContainText('Hafta sonu')
  await expect(block.getByTestId(`night-${monday}`)).not.toContainText('Hafta sonu')
  const sundayPrice = block.getByTestId(`night-${sunday}`).getByRole('textbox')
  await expect(sundayPrice).toHaveValue('2.800')
  await sundayPrice.fill('3.000')
  await sundayPrice.press('Tab')
  const panel = await save(page)
  await panel.getByRole('tab', { name: 'Geceler' }).click()
  await expect(panel.getByTestId(`night-${monday}`).getByRole('textbox')).toHaveValue('2.800')
  await expect(panel.getByTestId(`night-${saturday}`).getByRole('textbox')).toHaveValue('3.200')
  await expect(panel.getByTestId(`night-${sunday}`).getByRole('textbox')).toHaveValue('3.000')
})

test('rezervasyon oluştur → ödeme gir → ızgara hücresinin rengi "ödendi" olur', async ({ launch }) => {
  test.setTimeout(180_000)
  const { page } = await launch()
  const day0 = today()
  const dialog = await newReservation(page, 'Can Yücel')
  await pickRoom(page, '103')
  await pickDate(page, dialog, 'Çıkış', addDays(day0, 2))
  await save(page)
  await closePanel(page)
  const can = bar(page, 'Can Yücel', '103')
  for (const d of [day0, addDays(day0, 1)])
    await expect(nightPaint(can, d)).toHaveAttribute('data-paint', 'unpaid')
  const before = await nightPaint(can, day0).evaluate((el) => getComputedStyle(el).backgroundColor)
  await can.click()
  const panel = page.getByTestId('reservation-panel')
  await panel.getByTestId('panel-pay').click()
  await page.getByTestId('payment-save').click()
  await expect(page.getByTestId('payment-save')).toHaveCount(0)
  await closePanel(page)
  for (const d of [day0, addDays(day0, 1)])
    await expect(nightPaint(can, d)).toHaveAttribute('data-paint', 'paid')
  const after = await nightPaint(can, day0).evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(after).not.toBe(before)
})

test('başı ekran dışında kalan uzun konaklamanın adı ilk görünen sütunda durur', async ({
  launch,
  userData
}) => {
  execFileSync('npx', ['tsx', '--tsconfig', 'tsconfig.node.json', 'tests/e2e/seed-calendar.ts', userData], {
    cwd: root,
    stdio: 'inherit'
  })
  const { page } = await launch(userData)
  const chart = page.getByTestId('tape-chart')
  const ivan = bar(page, 'Ivan Petrov', '202')
  await expect(ivan).toBeVisible()
  const name = ivan.getByText('Ivan Petrov', { exact: true })
  const roomCell = page.getByTestId('tape-row-202').locator('> div').first()
  // A few columns to the right: the stay's first nights go under the room column, its name stays in sight.
  for (const columns of [2, 3, 4]) {
    await chart.evaluate((el, n) => {
      const day = el.querySelector<HTMLElement>('[data-testid^="tape-day-"], [data-testid="tape-today"]')
      el.scrollLeft += (day?.offsetWidth ?? 56) * n
    }, columns)
    await expect
      .poll(async () => {
        const [n, r] = await Promise.all([name.boundingBox(), roomCell.boundingBox()])
        return n && r ? Math.round(n.x - (r.x + r.width)) : -999
      })
      .toBeGreaterThanOrEqual(0)
  }
})

test('ekran görüntüleri: arıza simgesi, kapalı oda penceresi; Türkçe açık ve Rusça koyu (yalnız FLOW_SHOTS ile)', async ({
  launch,
  userData
}) => {
  test.skip(!shots, 'screenshots only')
  test.setTimeout(180_000)
  execFileSync('npx', ['tsx', '--tsconfig', 'tsconfig.node.json', 'tests/e2e/seed-calendar.ts', userData], {
    cwd: root,
    stdio: 'inherit'
  })
  const { page } = await launch(userData)
  const grid = await api<{ rooms: { id: string; number: string }[] }>(page, 'reservations.grid', {
    from: today(),
    to: addDays(today(), 1)
  })
  await api(page, 'housekeeping.reportIssue', {
    roomId: grid.body.rooms.find((r) => r.number === '203')!.id,
    title: 'Klima su damlatıyor',
    severity: 'urgent'
  })
  for (const [lang, theme] of [
    ['tr', 'light'],
    ['ru', 'dark']
  ] as const) {
    await api(page, 'settings.set', { 'ui.language': lang, 'ui.theme': theme })
    await reload(page, '#/calendar')
    await expect(page.getByTestId('room-issue-203')).toBeVisible()
    await page.screenshot({ path: `${shots}/flow-grid-${lang}-${theme}.png` })
    await page.getByTestId('tape-row-201').locator('[data-testid^="block-"]').click()
    await expect(page.getByTestId('block-view')).toBeVisible()
    await page.waitForTimeout(400) // the dialog's fade-in
    await page.screenshot({ path: `${shots}/flow-block-view-${lang}-${theme}.png` })
    await page.keyboard.press('Escape')
    await page.getByTestId('block-new').click()
    await expect(page.getByTestId('block-save')).toBeVisible()
    await page.waitForTimeout(400) // the dialog's fade-in
    await page.screenshot({ path: `${shots}/flow-block-new-${lang}-${theme}.png` })
    await page.keyboard.press('Escape')
  }
})
