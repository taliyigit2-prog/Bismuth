// Faz 16 madde 1, the one long scenario in the real app: an empty data folder → the setup wizard → two reservations →
// check-in with a second person and the KBS marks → a payment in lira and one in euro (typed rate, no internet) →
// the day in the ledger → an expense from the drawer → the drawer handed over → an employee with an advance and
// part of the salary → month end and the summary report (revenue = ledger = the stays on the calendar) → the KBS
// list for the ministry table → a backup → a later change → restore (restart) → everything of the backup is back,
// the expense's receipt (attachment) too, and no identity column of the KBS file is anywhere in the database.
// Each step compares the figures one screen shows with the ones the next screen shows.
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { api, reload } from '../bridge'
import { OWNER } from '../setup-draft.mjs'
import { E2E_IDENTITY, KBS_FILE_NAME, kbsFile } from '../kbs-file'

const heading = (page: Page, name: string) => page.getByRole('heading', { level: 2, name, exact: true })
const next = (page: Page) => page.getByTestId('setup-next').click()

/** A tiny one-page PDF: the receipt of the market expense (an attachment, K-25). */
const RECEIPT = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n'
)

async function wizard(page: Page): Promise<void> {
  await page.goto(page.url().replace(/#.*$/, '#/setup'))
  await page.getByTestId('setup-step-body').waitFor()
  await page.getByTestId('setup-lang-tr').click()
  await expect(heading(page, 'Dil ve tema')).toBeVisible()
  await next(page)
  await expect(heading(page, 'Çalışma şekli')).toBeVisible()
  await next(page)
  await expect(heading(page, 'Otel')).toBeVisible()
  await page.getByTestId('setup-hotel-name').fill('Martı Otel')
  await page.getByTestId('setup-hotel-city').fill('İstanbul')
  await next(page)
  await expect(heading(page, 'Para birimleri')).toBeVisible()
  // Euro is accepted by default (the second payment comes in euro).
  await expect(page.getByTestId('setup-currency-EUR')).toBeChecked()
  await next(page)
  await expect(heading(page, 'Oda tipleri')).toBeVisible()
  // One price every night of the week (and on special days): the figures below do not depend on today's weekday.
  await page.locator('[id^="setup-price-"][id$="-base"]').first().fill('2.500')
  await page.locator('[id^="setup-price-"][id$="-weekend"]').first().fill('2.500')
  await next(page)
  await expect(heading(page, 'Odalar')).toBeVisible()
  await page.getByTestId('setup-floors').fill('2')
  await page.getByTestId('setup-per-floor').fill('3')
  await page.getByTestId('setup-beds').fill('2')
  await page.getByTestId('setup-generate').click()
  await expect(page.getByTestId('setup-room-totals')).toHaveText('6 oda · 12 yatak')
  await next(page)
  for (const title of [
    'Saatlik satış',
    'Ödeme ve satış',
    'Personel ve vardiyalar',
    'Çalışanlar',
    'Takvim',
    'Kamera'
  ]) {
    await expect(heading(page, title)).toBeVisible()
    await next(page)
  }
  await expect(heading(page, 'Sahip hesabı')).toBeVisible()
  await page.getByTestId('setup-owner-name').fill(OWNER.displayName)
  await page.getByTestId('setup-owner-username').fill(OWNER.username)
  await page.getByTestId('setup-owner-password').fill(OWNER.password)
  await page.getByTestId('setup-owner-repeat').fill(OWNER.password)
  await page.getByTestId('setup-owner-pin').fill(OWNER.pin)
  await next(page)
  await expect(heading(page, 'Özet')).toBeVisible()
  await expect(page.getByTestId('setup-summary-totals')).toHaveText('6 oda · 12 yatak')
  await page.getByTestId('setup-finish').click()
  await expect(page.getByTestId('recovery-codes')).toBeVisible()
  await page.getByTestId('recovery-written').click()
  await page.getByTestId('recovery-continue').click()
  await expect(page.getByRole('heading', { level: 1, name: 'Takvim' })).toBeVisible()
}

async function newReservation(page: Page, guest: string, room: string): Promise<void> {
  await reload(page, '#/calendar')
  await page.getByRole('button', { name: 'Yeni rezervasyon' }).first().click()
  await page.getByRole('combobox', { name: 'Misafir' }).click()
  await page.getByPlaceholder('Ad ya da telefon…').fill(guest)
  await page.getByText(`Yeni misafir: ${guest}`).click()
  await page.getByTestId('room-multi-picker').click()
  await page.getByTestId(`room-option-${room}`).getByRole('checkbox').click()
  await page.keyboard.press('Escape')
  // Today → tomorrow (the form's dates), one night at the room type's price.
  await expect(page.getByTestId('suggested-price')).toContainText('₺2.500')
  await page.getByTestId('new-reservation-save').click()
  await expect(page.getByTestId('reservation-panel').getByTestId('panel-guest')).toHaveText(guest)
}

/** Every row of every table as text (the "DB dump" of the KBS check). */
function dumpDatabase(file: string): string {
  const db = new Database(file, { readonly: true, fileMustExist: true })
  try {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[]
    return tables.map(({ name }) => JSON.stringify(db.prepare(`SELECT * FROM "${name}"`).all())).join('\n')
  } finally {
    db.close()
  }
}

interface Options {
  today: string
}

test('tam gün: kurulum → rezervasyon → giriş/KBS → ödeme (TL, döviz) → defter → gider → teslim → maaş → ay sonu ve rapor → yedek → geri yükle', async ({
  launch,
  userData
}) => {
  test.setTimeout(600_000)
  const first = await launch({ setup: false })
  const { page } = first

  // 1. Kurulum sihirbazı (UI), then the first-run tour stays away from the buttons below.
  await wizard(page)
  expect(
    (await api(page, 'settings.set', { 'guide.tourForNewUsers': false, 'ui.tourDone': true })).status
  ).toBe(200)
  const today = (await api<Options>(page, 'booking.options')).body.today

  // 2. Rezervasyon: two guests, one night each, from the calendar's form.
  await newReservation(page, 'Deniz Yıldırım', '101')
  let panel = page.getByTestId('reservation-panel')
  await panel.getByRole('tab', { name: 'Para' }).click()
  await expect(panel.getByTestId('folio-charges')).toHaveText('₺2.500')
  await expect(panel.getByTestId('folio-balance')).toHaveText('₺2.500')

  // 3. Giriş + kişiler + KBS: a second person without the mark raises the sign; marking clears it.
  await panel.getByTestId('panel-check-in').click()
  await expect(panel.getByTestId('panel-check-out')).toBeVisible()
  await panel.getByRole('tab', { name: /Kişiler/ }).click()
  await panel.getByRole('button', { name: "KBS'ye bildirdim" }).first().click()
  await panel.getByTestId('person-name').fill('Bora Yıldırım')
  await panel.getByRole('button', { name: 'Kişi ekle' }).click()
  await expect(panel.getByTestId('panel-kbs-warning')).toHaveText('KBS eksik: 1')
  await panel.getByRole('button', { name: "KBS'ye bildirdim" }).click()
  await expect(panel.getByTestId('panel-kbs-warning')).toHaveCount(0)

  // 4a. Ödeme (TL): the dialog suggests the balance; the night turns "ödendi", the balance is zero.
  await panel.getByTestId('panel-pay').click()
  await page.getByTestId('payment-save').click()
  await expect(page.getByTestId('payment-save')).toHaveCount(0)
  await panel.getByRole('tab', { name: 'Geceler' }).click()
  await expect(panel.locator('[data-testid^="paint-"]')).toHaveCount(1)
  await expect(panel.locator('[data-testid^="paint-"]').first()).toHaveAttribute('data-paint', 'paid')
  await panel.getByRole('tab', { name: 'Para' }).click()
  await expect(panel.getByTestId('folio-credited')).toHaveText('₺2.500')
  await expect(panel.getByTestId('folio-balance')).toHaveText('₺0')
  await page.keyboard.press('Escape')

  // 4b. Ödeme (döviz): €50 in cash at a typed rate of 50,00 (no internet, K-43) pays the ₺2.500 night.
  await newReservation(page, 'Olga Petrova', '102')
  panel = page.getByTestId('reservation-panel')
  await panel.getByTestId('panel-pay').click()
  const pay = page.getByRole('dialog', { name: 'Ödeme ekle' })
  await pay.getByRole('combobox', { name: 'Para birimi' }).click()
  await page.getByRole('option', { name: /EUR/ }).click()
  await pay.getByLabel('Tutar').fill('50')
  await pay.getByTestId('manual-rate-pay').fill('50,00')
  await page.getByTestId('payment-save').click()
  await expect(page.getByTestId('payment-save')).toHaveCount(0)
  await panel.getByRole('tab', { name: 'Para' }).click()
  await expect(panel.getByTestId('folio-credited')).toHaveText('₺2.500')
  await expect(panel.getByTestId('folio-balance')).toHaveText('₺0')
  await page.keyboard.press('Escape')

  // 5. Defter: both payments on today's page; per currency ₺2.500 and €50; ₺5.000 in lira terms.
  await reload(page, '#/ledger')
  const payments = page.getByTestId('day-payments')
  await expect(payments.getByTestId('income-row')).toHaveCount(2)
  await expect(payments.getByTestId('income-row').filter({ hasText: 'Deniz Yıldırım' })).toContainText(
    '₺2.500'
  )
  await expect(payments.getByTestId('income-row').filter({ hasText: 'Olga Petrova' })).toContainText('€50')
  const totals = page.getByTestId('currency-totals')
  await expect(totals.getByRole('row', { name: /TRY/ })).toContainText('₺2.500')
  await expect(totals.getByRole('row', { name: /EUR/ })).toContainText('€50')
  await expect(page.getByTestId('day-summary')).toContainText('₺5.000')
  await expect(page.getByTestId('day-net')).toHaveText('₺5.000')
  const drawerPanel = page.getByTestId('cash-panel')
  await expect(drawerPanel.getByTestId('drawer-TRY')).toContainText('₺2.500')
  await expect(drawerPanel.getByTestId('drawer-EUR')).toContainText('€50')

  // 6. Gider: ₺400 from the drawer; the drawer and the day's net follow.
  await page.getByTestId('add-expense').click()
  const spend = page.getByRole('dialog', { name: 'Gider ekle' })
  await spend.getByLabel('Tutar').fill('400')
  await spend.getByTestId('expense-description').fill('Market (su, çay)')
  await spend.getByTestId('ledger-expense-save').click()
  await expect(spend).toHaveCount(0)
  await expect(page.getByTestId('day-expenses')).toContainText('Market (su, çay)')
  await expect(drawerPanel.getByTestId('drawer-TRY')).toContainText('₺2.100')
  await expect(page.getByTestId('day-net')).toHaveText('₺4.600')
  await expect(page.getByTestId('cash-drawer-button')).toHaveAccessibleName(/₺2\.100/)
  // The receipt of the expense (an attachment: userData/attachments + sha256, K-25).
  const day = await api<{ expenses: { id: string; description: string }[] }>(page, 'ledger.day', {
    date: today
  })
  const market = day.body.expenses.find((e) => e.description === 'Market (su, çay)')!
  const attached = await api<{ id: string }>(page, 'attachments.add', {
    entity: 'expense',
    entityId: market.id,
    fileName: 'market-fisi.pdf',
    mime: 'application/pdf',
    dataBase64: RECEIPT.toString('base64')
  })
  expect(attached.status, JSON.stringify(attached.body)).toBe(200)

  // 7. Kasa teslimi: the owner takes both payments; the drawer is empty, the rows carry the "x".
  await drawerPanel.getByTestId('drawer-collect').click()
  const handover = page.getByTestId('handover-total')
  await expect(handover).toContainText('₺2.500')
  await expect(handover).toContainText('€50')
  await page.getByTestId('handover-confirm').click()
  await expect(drawerPanel.getByTestId('drawer-empty')).toBeVisible()
  await expect(payments.getByTestId('collected-mark')).toHaveCount(2)
  await expect(page.getByTestId('cash-drawer-button')).toHaveAccessibleName(/₺0/)

  // 8. Maaş ve avans: salary 40.000 from the 1st (net 45.333 with the unused leave, §6), advance 1.000, 2.000 paid.
  await reload(page, '#/staff')
  await page.getByTestId('new-employee').click()
  const form = page.getByRole('dialog', { name: 'Yeni çalışan' })
  await form.getByLabel('Ad', { exact: true }).fill('Ayşe')
  await form.getByLabel('Soyad').fill('Deneme')
  await form.getByLabel('Aylık maaş').fill('40000')
  await form.getByRole('button', { name: /^İşe giriş/ }).click()
  await page.getByTestId('month-calendar').getByRole('gridcell', { name: /^1 / }).first().click()
  await form.getByRole('button', { name: 'Kaydet' }).click()
  await expect(page.getByTestId('employee-sheet')).toContainText('Ayşe Deneme')
  await page.keyboard.press('Escape')
  await page.getByRole('tab', { name: 'Maaş tablosu' }).click()
  const ayse = (await api<{ id: string; fullName: string }[]>(page, 'staff.employees', {})).body.find(
    (e) => e.fullName === 'Ayşe Deneme'
  )!
  const salaryRow = page.getByTestId(`salary-row-${ayse.id}`)
  await expect(salaryRow).toContainText('₺45.333')
  await page.getByRole('button', { name: 'Ayşe Deneme: avans ver' }).click()
  const advance = page.getByRole('dialog', { name: 'Avans ver' })
  await advance.getByLabel('Avans tutarı').fill('1000')
  await advance.getByRole('button', { name: 'Kaydet' }).click()
  await expect(advance).toHaveCount(0)
  await expect(page.getByTestId(`salary-debt-${ayse.id}`)).toHaveText('₺44.333,33')
  await page.getByRole('button', { name: 'Ayşe Deneme: maaş öde' }).click()
  const salary = page.getByRole('dialog', { name: 'Maaş öde' })
  const amount = salary.getByLabel('Ödenen tutar')
  await amount.fill('2000')
  await amount.blur()
  await expect(salary.getByTestId('pay-after')).toContainText('₺42.333')
  await salary.getByRole('button', { name: 'Ödemeyi kaydet' }).click()
  await expect(salary).toHaveCount(0)
  await expect(page.getByTestId(`salary-debt-${ayse.id}`)).toHaveText('₺42.333,33')
  // Both are ledger expenses of today (G-69): the day's lira expenses are 400 + 1.000 + 2.000.
  await reload(page, '#/ledger')
  await expect(page.getByTestId('day-expenses').getByTestId('expense-row')).toHaveCount(3)
  await expect(totals.getByRole('row', { name: /TRY/ })).toContainText('₺3.400')
  await expect(page.getByTestId('day-net')).toHaveText('₺1.600')

  // 9. Ay sonu ve rapor: revenue ₺5.000 and expenses ₺3.400 everywhere; the salary left is the staff screen's.
  await reload(page, '#/month-end')
  const kpis = page.getByTestId('month-kpis')
  await expect(kpis).toContainText('₺5.000')
  await expect(kpis).toContainText('₺3.400')
  await expect(page.getByTestId('salary-total-TRY')).toContainText('₺42.333')
  await reload(page, '#/reports')
  const report = page.getByTestId('report-kpis')
  await expect(report).toContainText('₺5.000')
  await expect(report).toContainText('₺3.400')
  await expect(report).toContainText('₺1.600')
  // Takvim: the calendar's own data for the month — its nights are the report's sold nights, their prices (all
  // paid) the report's revenue.
  const monthStart = `${today.slice(0, 7)}-01`
  const nextMonth = new Date(`${monthStart}T12:00:00Z`)
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1)
  const grid = await api<{ stays: { guestName: string; nights: { pay: string; priceMinor: number }[] }[] }>(
    page,
    'reservations.grid',
    { from: monthStart, to: nextMonth.toISOString().slice(0, 10) }
  )
  expect(grid.status, JSON.stringify(grid.body)).toBe(200)
  const nights = grid.body.stays.flatMap((s) => s.nights)
  expect(nights.map((n) => n.pay)).toEqual(['paid', 'paid'])
  expect(nights.reduce((sum, n) => sum + n.priceMinor, 0)).toBe(500_000)
  await expect(report).toContainText(new RegExp(`(^|\\D)${nights.length}/\\d+ oda-gece`))
  await reload(page, '#/calendar')
  const chart = page.getByTestId('tape-chart')
  for (const s of grid.body.stays) await expect(chart).toContainText(s.guestName)
  // Ledger month view: the same revenue in lira terms.
  await reload(page, '#/ledger')
  await page.getByTestId('view-month').click()
  await expect(page.getByTestId('month-view')).toContainText('₺5.000')
  await expect(page.getByTestId('month-net')).toHaveText('₺1.600')

  // 10. KBS listesi → bakanlık tablosu; the identity columns never reach the screen.
  await reload(page, '#/tourism')
  await page.getByTestId('kbs-file').setInputFiles({
    name: KBS_FILE_NAME,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: await kbsFile()
  })
  await page.getByTestId('review-TÜRKYİE').getByRole('button', { name: 'Kabul et' }).click()
  await page.getByTestId('review-KIBRIS').getByRole('button', { name: 'KIBRIS için ülke' }).click()
  await page.getByRole('option', { name: 'Kuzey Kıbrıs Türk Cumhuriyeti' }).click()
  await expect(page.getByTestId('tourism-step-review')).toContainText('Bütün uyruklar tanındı.')
  await page.getByTestId('mark-reported').click()
  await expect(page.getByTestId('tourism-reported')).toContainText('Bildirildi')
  for (const v of Object.values(E2E_IDENTITY)) await expect(page.locator('body')).not.toContainText(v)

  // 11. Yedek al (Ayarlar → Yedek).
  await reload(page, '#/settings?tab=backup')
  await page.getByTestId('backup-run').click()
  await expect(page.getByTestId('backup-item')).toHaveCount(1)

  // A change after the backup: one more expense, and the receipt's file removed.
  const late = await api(page, 'ledger.addExpense', {
    date: today,
    sectionId: (
      await api<{ sections: { id: string; code: string }[] }>(page, 'ledger.options')
    ).body.sections.find((s) => s.code === 'general')!.id,
    amountMinor: 99_900,
    currency: 'TRY',
    description: 'Yedekten sonraki gider',
    paidFromDrawer: true
  })
  expect(late.status, JSON.stringify(late.body)).toBe(200)
  // The receipt's file is lost from the data folder (a receipt is kept for good, so the program has no delete).
  const files = readdirSync(join(userData, 'attachments'), { recursive: true, withFileTypes: true }).filter(
    (f) => f.isFile()
  )
  expect(files).toHaveLength(1)
  rmSync(join(files[0]!.parentPath, files[0]!.name))
  expect((await api(page, 'attachments.read', { id: attached.body.id })).status).not.toBe(200)

  // 12. Geri yükle: scheduled now, applied at the next start.
  await reload(page, '#/settings?tab=backup')
  await page.getByTestId('backup-item').filter({ hasText: 'Elle' }).getByTestId('backup-restore').click()
  await page.getByTestId('restore-confirm').click()
  await expect(page.getByTestId('restore-pending')).toBeVisible()
  await first.app.close()

  // 13. Veriler yerinde: the same figures on the same screens after the restart.
  const second = await launch(userData)
  const again = second.page
  await reload(again, '#/ledger')
  await expect(again.getByTestId('day-payments').getByTestId('income-row')).toHaveCount(2)
  await expect(again.getByTestId('day-expenses')).not.toContainText('Yedekten sonraki gider')
  await expect(again.getByTestId('day-net')).toHaveText('₺1.600')
  await expect(again.getByTestId('day-payments').getByTestId('collected-mark')).toHaveCount(2)
  await reload(again, '#/reports')
  await expect(again.getByTestId('report-kpis')).toContainText('₺5.000')
  await reload(again, '#/staff')
  await again.getByRole('tab', { name: 'Maaş tablosu' }).click()
  await expect(again.getByTestId(`salary-debt-${ayse.id}`)).toHaveText('₺42.333,33')
  await reload(again, '#/tourism')
  await expect(again.getByTestId('tourism-history').getByTestId('history-row')).toHaveCount(1)
  // The receipt came back with the backup (ekler yedekte): same bytes.
  const receipt = await api<{ dataBase64: string }>(again, 'attachments.read', { id: attached.body.id })
  expect(receipt.status, JSON.stringify(receipt.body)).toBe(200)
  expect(Buffer.from(receipt.body.dataBase64, 'base64').equals(RECEIPT)).toBe(true)
  await second.app.close()

  // 14. Veri koruması: no name, surname or ID number of the KBS file in any table (DB dump) nor in the file's bytes.
  const dbFile = join(userData, 'bismuth.db')
  const dump = dumpDatabase(dbFile)
  expect(dump).toContain('GERMANY (Deutschland)')
  const raw = [dbFile, `${dbFile}-wal`]
    .filter((f) => existsSync(f))
    .map((f) => readFileSync(f).toString('utf8'))
    .join('\n')
  for (const marker of [...Object.values(E2E_IDENTITY), 'GİZLİAD', 'GİZLİSOYAD']) {
    expect(dump, marker).not.toContain(marker)
    expect(raw, marker).not.toContain(marker)
  }
})
