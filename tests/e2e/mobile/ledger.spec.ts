// The ledger on the phone (390×844, G-143 "kasa paneli"): the drawer first, then the day as cards; the top-bar drawer
// button and the row actions keep 44 px targets, the forms open as bottom sheets, "Teslim al" brings the drawer to
// zero, and nothing widens the page.
import { expect, test, type Page } from '@playwright/test'
import { overflowReport } from '../routes'
import { api } from '../bridge'
import { freeRoom, runTag } from '../shared-hotel'

const shots = process.env['LEDGER_SHOTS']

interface Options {
  today: string
  rooms: { id: string; number: string }[]
  channels: { id: string; code: string }[]
  methods: { id: string; code: string }[]
}

async function seed(page: Page, guest: { firstName: string; lastName: string }): Promise<void> {
  const options = (await api<Options>(page, 'booking.options')).body
  const end = new Date(`${options.today}T12:00:00Z`)
  end.setUTCDate(end.getUTCDate() + 1)
  // The phone specs share one hotel: a room free tonight, added when none is.
  const room = await freeRoom(page, options.today, end.toISOString().slice(0, 10))
  const created = await api<{ reservation: { id: string } }>(page, 'booking.create', {
    guest,
    channelId: options.channels.find((c) => c.code === 'direct')!.id,
    stays: [
      {
        roomId: room.id,
        checkIn: options.today,
        checkOut: end.toISOString().slice(0, 10),
        nightlyPriceMinor: 180_000
      }
    ]
  })
  expect(created.status, JSON.stringify(created.body)).toBe(200)
  const cash = options.methods.find((m) => m.code === 'cash')!.id
  const paid = await api(page, 'ledger.addPayment', {
    reservationId: created.body.reservation.id,
    date: options.today,
    methodId: cash,
    amountMinor: 180_000,
    currency: 'TRY'
  })
  expect(paid.status, JSON.stringify(paid.body)).toBe(200)
  const sections = (await api<{ sections: { id: string; code: string }[] }>(page, 'ledger.options')).body
    .sections
  const spent = await api(page, 'ledger.addExpense', {
    date: options.today,
    sectionId: sections.find((s) => s.code === 'general')!.id,
    amountMinor: 25_000,
    currency: 'TRY',
    description: 'Telefon gideri',
    paidFromDrawer: true
  })
  expect(spent.status, JSON.stringify(spent.body)).toBe(200)
}

test('telefonda defter: önce kasa, sonra kart listeleri; formlar alttan açılır; teslim alınca kasa sıfır', async ({
  page
}) => {
  test.setTimeout(120_000)
  await page.goto('/#/ledger')
  await page.getByTestId('app-ready').waitFor({ state: 'attached' })
  // This attempt's guest: the phone specs share one hotel, and a retry would find the first attempt's payment too.
  const guest = { firstName: 'Telefon', lastName: `Kasası ${runTag()}` }
  await seed(page, guest)
  await page.reload()
  await page.getByTestId('app-ready').waitFor({ state: 'attached' })

  const panel = page.getByTestId('cash-panel')
  const payments = page.getByTestId('day-payments')
  await expect(
    payments.getByTestId('income-row').filter({ hasText: `${guest.firstName} ${guest.lastName}` })
  ).toHaveCount(1)
  await expect(page.getByTestId('day-expenses')).toContainText('Telefon gideri')
  const panelBox = await panel.boundingBox()
  const paymentsBox = await payments.boundingBox()
  expect(panelBox!.y).toBeLessThan(paymentsBox!.y)
  await expect(payments.getByRole('table')).toHaveCount(0)
  await expect.poll(() => page.evaluate(overflowReport)).toEqual([])

  const drawerButton = page.getByTestId('cash-drawer-button')
  expect((await drawerButton.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  const rowMenu = payments.getByRole('button', { name: /Satır işlemleri/ }).first()
  expect((await rowMenu.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  // QA2a: the Gün/Ay tabs and the row's pick box (its invisible ::after area) are 44 px too.
  for (const tab of ['view-day', 'view-month']) {
    const b = (await page.getByTestId(tab).boundingBox())!
    expect(b.height, tab).toBeGreaterThanOrEqual(44)
    expect(b.width, tab).toBeGreaterThanOrEqual(44)
  }
  const pick = payments.getByRole('checkbox').first()
  const hit = await pick.evaluate((el) => {
    const after = getComputedStyle(el, '::after')
    const r = el.getBoundingClientRect()
    return {
      w: r.width - parseFloat(after.left || '0') - parseFloat(after.right || '0'),
      h: r.height - parseFloat(after.top || '0') - parseFloat(after.bottom || '0')
    }
  })
  expect(hit.w).toBeGreaterThanOrEqual(44)
  expect(hit.h).toBeGreaterThanOrEqual(44)
  if (shots) {
    for (const [lang, theme] of [
      ['tr', 'light'],
      ['ru', 'dark']
    ] as const) {
      await api(page, 'settings.set', { 'ui.language': lang, 'ui.theme': theme })
      await page.reload()
      await page.getByTestId('app-ready').waitFor({ state: 'attached' })
      await page.getByTestId('day-payments').getByTestId('income-row').first().waitFor()
      await page.screenshot({ path: `${shots}/ledger-phone-${lang}-${theme}.png`, fullPage: true })
    }
    await api(page, 'settings.set', { 'ui.language': 'tr', 'ui.theme': 'light' })
    await page.reload()
    await page.getByTestId('app-ready').waitFor({ state: 'attached' })
  }

  await page.getByTestId('add-expense').click()
  const sheet = page.getByRole('dialog', { name: 'Gider ekle' })
  await expect(sheet).toBeVisible()
  const rect = await sheet.boundingBox()
  expect(Math.round((rect?.y ?? 0) + (rect?.height ?? 0))).toBeGreaterThanOrEqual(840)
  // QA2a: the "paid from the drawer" switch keeps its look; its ::after makes the tap area 44 px.
  const switchHit = await sheet.getByTestId('expense-drawer').evaluate((el) => {
    const after = getComputedStyle(el, '::after')
    const r = el.getBoundingClientRect()
    return {
      w: r.width - parseFloat(after.left || '0') - parseFloat(after.right || '0'),
      h: r.height - parseFloat(after.top || '0') - parseFloat(after.bottom || '0')
    }
  })
  expect(switchHit.w).toBeGreaterThanOrEqual(44)
  expect(switchHit.h).toBeGreaterThanOrEqual(44)
  await sheet.getByRole('button', { name: 'Vazgeç' }).click()
  await expect(sheet).toHaveCount(0)

  await panel.getByTestId('drawer-collect').click()
  await page.getByTestId('handover-confirm').click()
  await expect(panel.getByTestId('drawer-TRY')).toContainText('₺0')
  await expect(panel.getByTestId('drawer-empty')).toBeVisible()
  await expect.poll(() => page.evaluate(overflowReport)).toEqual([])
})
