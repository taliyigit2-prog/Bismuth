// faz-07 kabul ölçütleri in the real app (P7, defter ve kasa): a day's entry — a payment on a reservation and an
// expense from the drawer — through the ledger forms; the drawer panel shows what should be in the drawer; "Teslim
// al" brings it to zero and lists the handover. The payment written in the ledger is the reservation's payment (its
// nights turn "ödendi"); a payment written in the reservation panel shows in the ledger (tek giriş, G-60).
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { api, reload } from '../bridge'

const shots = process.env['LEDGER_SHOTS']

interface Options {
  today: string
  rooms: { id: string; number: string }[]
  channels: { id: string; code: string }[]
  methods: { id: string; code: string }[]
}

const addDays = (day: string, n: number): string => {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

async function book(page: Page, room: number, firstName: string, lastName: string) {
  const options = (await api<Options>(page, 'booking.options')).body
  const created = await api<{ reservation: { id: string } }>(page, 'booking.create', {
    guest: { firstName, lastName },
    channelId: options.channels.find((c) => c.code === 'direct')!.id,
    stays: [
      {
        roomId: options.rooms[room]!.id,
        checkIn: options.today,
        checkOut: addDays(options.today, 2),
        nightlyPriceMinor: 250_000
      }
    ]
  })
  expect(created.status, JSON.stringify(created.body)).toBe(200)
  return { id: created.body.reservation.id, options }
}

test('gün girişi (gelir + gider) → teslim al → kasa paneli sıfır; defterden ödeme gecelerin rengini değiştirir', async ({
  launch
}) => {
  test.setTimeout(120_000)
  const { page } = await launch()
  const { id } = await book(page, 0, 'Deniz', 'Yıldırım')
  await reload(page, '#/ledger')

  await page.getByTestId('add-payment').click()
  const pay = page.getByRole('dialog', { name: 'Ödeme ekle' })
  await pay.getByTestId('reservation-hit').first().click()
  await expect(pay.getByTestId('picked-reservation')).toContainText('Deniz Yıldırım')
  await expect(pay.getByLabel('Tutar')).toHaveValue('5.000')
  await pay.getByTestId('ledger-payment-save').click()
  await expect(pay).toHaveCount(0)
  await expect(page.getByTestId('day-payments')).toContainText('Deniz Yıldırım')

  // The same payments row the reservation panel reads: every night is paid now.
  const view = await api<{ stays: { nights: { payStatus: string }[] }[] }>(page, 'booking.get', { id })
  expect(view.body.stays[0]!.nights.map((n) => n.payStatus)).toEqual(['paid', 'paid'])

  await page.getByTestId('add-expense').click()
  const spend = page.getByRole('dialog', { name: 'Gider ekle' })
  await spend.getByLabel('Tutar').fill('400')
  await spend.getByTestId('expense-description').fill('Market')
  await spend.getByTestId('ledger-expense-save').click()
  await expect(spend).toHaveCount(0)
  await expect(page.getByTestId('day-expenses')).toContainText('Market')

  const panel = page.getByTestId('cash-panel')
  await expect(panel.getByTestId('drawer-TRY')).toContainText('₺4.600')
  await expect(page.getByTestId('cash-drawer-button')).toHaveAccessibleName(/₺4\.600/)
  await panel.getByTestId('drawer-collect').click()
  // QA2a: the net the history keeps (5.000 cash − 400 drawer expense) with the sum written out.
  await expect(page.getByTestId('handover-net')).toContainText('₺4.600')
  await expect(page.getByTestId('handover-parts')).toContainText('₺5.000')
  await page.getByTestId('handover-confirm').click()
  await expect(panel.getByTestId('drawer-TRY')).toContainText('₺0')
  await expect(panel.getByTestId('drawer-empty')).toBeVisible()
  await expect(page.getByTestId('cash-drawer-button')).toHaveAccessibleName(/₺0/)
  await expect(page.getByTestId('day-payments').getByTestId('collected-mark')).toHaveCount(1)
  await panel.getByTestId('drawer-history-toggle').click()
  await expect(panel.getByTestId('handover-history').getByRole('listitem')).toHaveCount(1)
  await expect(panel.getByTestId('handover-history')).toContainText('₺4.600')
})

test('rezervasyon panelinden girilen ödeme defterde ve kasa düğmesinde görünür', async ({ launch }) => {
  const { page } = await launch()
  const { id, options } = await book(page, 1, 'Ayşe', 'Demir')
  const paid = await api(page, 'booking.addPayment', {
    reservationId: id,
    date: options.today,
    methodId: options.methods.find((m) => m.code === 'cash')!.id,
    amountMinor: 120_000,
    currency: 'TRY'
  })
  expect(paid.status, JSON.stringify(paid.body)).toBe(200)
  await reload(page, '#/ledger')
  const row = page.getByTestId('day-payments').getByTestId('income-row').filter({ hasText: 'Ayşe Demir' })
  await expect(row).toHaveCount(1)
  await expect(row).toContainText(options.rooms[1]!.number)
  await expect(row).toContainText('₺1.200')
  await expect(page.getByTestId('cash-drawer-button')).toHaveAccessibleName(/₺1\.200/)
  // The drawer opens from the top bar on any screen.
  await reload(page, '#/calendar')
  await page.getByTestId('cash-drawer-button').click()
  await expect(page.getByTestId('cash-drawer-sheet').getByTestId('drawer-TRY')).toContainText('₺1.200')
})

test('para alanı ve satır menüsü (QA2a): "abc" eski tutarı yazmaz, fazla ödeme sorulur, "İptal et" yalnız iptal penceresini açar', async ({
  launch
}) => {
  test.setTimeout(120_000)
  const { page } = await launch()
  const { id } = await book(page, 0, 'Deniz', 'Yıldırım')
  await reload(page, '#/ledger')

  await page.getByTestId('add-payment').click()
  const pay = page.getByRole('dialog', { name: 'Ödeme ekle' })
  await pay.getByTestId('reservation-hit').first().click()
  const amount = pay.getByLabel('Tutar')
  await expect(amount).toHaveValue('5.000')
  await amount.fill('abc')
  await pay.getByTestId('ledger-payment-save').click()
  await expect(pay.getByTestId('money-error')).toContainText('Tutar sayı olmalı')
  await amount.press('Enter')
  await expect(pay).toBeVisible()
  let payments = await api<{ payments: unknown[] }>(page, 'booking.get', { id })
  expect(payments.body.payments).toHaveLength(0)

  // More than the balance: asked first; "Vazgeç" writes nothing, "Yine de kaydet" writes it.
  await amount.fill('99.999,99')
  await pay.getByTestId('ledger-payment-save').click()
  const ask = page.getByRole('alertdialog', { name: 'Bakiyeden fazla ödeme alınsın mı?' })
  await expect(ask).toContainText('Bakiye ₺5.000, alınan ₺99.999,99.')
  await ask.getByRole('button', { name: 'Vazgeç' }).click()
  await expect(ask).toHaveCount(0)
  await amount.fill('3.000')
  await pay.getByTestId('ledger-payment-save').click()
  await expect(pay).toHaveCount(0)
  payments = await api<{ payments: unknown[] }>(page, 'booking.get', { id })
  expect(payments.body.payments).toHaveLength(1)

  // The row's "⋯" → "İptal et": only the void window, not the edit form under it.
  const row = page.getByTestId('day-payments').getByTestId('income-row').filter({ hasText: 'Deniz Yıldırım' })
  await row.getByRole('button', { name: /Satır işlemleri/ }).click()
  await page.getByRole('menuitem', { name: 'İptal et' }).click()
  await expect(page.getByRole('dialog', { name: /iptal edilsin mi/ })).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Ödemeyi düzenle' })).toHaveCount(0)
  await page.keyboard.press('Escape')
  // By keyboard too.
  await row.getByRole('button', { name: /Satır işlemleri/ }).focus()
  await page.keyboard.press('Enter')
  await page.getByRole('menuitem', { name: 'İptal et' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog', { name: /iptal edilsin mi/ })).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Ödemeyi düzenle' })).toHaveCount(0)
})

test('ekran görüntüleri: gün, ay, kasa, formlar; Türkçe açık ve Rusça koyu (yalnız LEDGER_SHOTS ile)', async ({
  launch
}) => {
  test.skip(!shots, 'screenshots only')
  test.setTimeout(240_000)
  const { page } = await launch()
  const { id, options } = await book(page, 0, 'Deniz', 'Yıldırım')
  await book(page, 2, 'Olga', 'Petrova')
  const method = (code: string) => options.methods.find((m) => m.code === code)!.id
  const pay = (amountMinor: number, code: string, currency = 'TRY') =>
    api(page, 'ledger.addPayment', {
      reservationId: id,
      date: options.today,
      methodId: method(code),
      amountMinor,
      currency,
      ...(currency !== 'TRY' ? { manualRateMicro: 38_500_000 } : {})
    })
  await pay(250_000, 'cash')
  await pay(250_000, 'card')
  await pay(10_000, 'bank', 'EUR')
  const sections = (await api<{ sections: { id: string; code: string }[] }>(page, 'ledger.options')).body
    .sections
  const general = sections.find((s) => s.code === 'general')!.id
  for (const [amount, description, drawer] of [
    [40_000, 'Market (su, çay, şeker)', true],
    [1_196_400, 'Elektrik faturası', false]
  ] as const)
    await api(page, 'ledger.addExpense', {
      date: options.today,
      sectionId: general,
      amountMinor: amount,
      currency: 'TRY',
      description,
      paidFromDrawer: drawer,
      ...(drawer ? {} : { methodId: method('bank') })
    })
  await api(page, 'ledger.setDayNote', { date: options.today, note: 'Selin izin kullandı.' })
  for (const [lang, theme] of [
    ['tr', 'light'],
    ['ru', 'dark']
  ] as const) {
    await api(page, 'settings.set', { 'ui.language': lang, 'ui.theme': theme })
    await reload(page, '#/ledger')
    await expect(page.getByTestId('day-payments').getByTestId('income-row').first()).toBeVisible()
    await page.screenshot({ path: `${shots}/ledger-day-${lang}-${theme}.png` })
    await page.getByTestId('add-payment').click()
    await page.getByTestId('reservation-hit').first().waitFor()
    await page.screenshot({ path: `${shots}/ledger-payment-${lang}-${theme}.png` })
    await page.keyboard.press('Escape')
    await page.getByTestId('add-expense').click()
    await page.getByTestId('expense-description').waitFor()
    await page.screenshot({ path: `${shots}/ledger-expense-${lang}-${theme}.png` })
    // No rate is known in the test data folder (no internet): a EUR expense asks for the typed rate (K-43); the
    // owner's section has no "paid from the drawer" (K-42).
    const form = page.getByRole('dialog')
    await form.getByRole('combobox').first().click()
    await page.getByRole('option', { name: /EUR/ }).click()
    await form.getByTestId('expense-section').click()
    await page.getByRole('option').last().click()
    await form.getByTestId('manual-rate-pay').waitFor()
    await page.screenshot({ path: `${shots}/ledger-expense-rate-${lang}-${theme}.png` })
    await page.keyboard.press('Escape')
    await page.getByTestId('cash-drawer-button').click()
    const sheet = page.getByTestId('cash-drawer-sheet')
    await sheet.getByTestId('drawer-history-toggle').click()
    await page.screenshot({ path: `${shots}/ledger-drawer-${lang}-${theme}.png` })
    await sheet.getByTestId('drawer-collect').click()
    await page.getByTestId('handover-confirm').waitFor()
    await page.screenshot({ path: `${shots}/ledger-handover-${lang}-${theme}.png` })
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('handover-confirm')).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(sheet).toHaveCount(0)
    await page.getByTestId('view-month').click()
    await page.getByTestId('month-band').first().click()
    await page.screenshot({ path: `${shots}/ledger-month-${lang}-${theme}.png` })
  }
})
