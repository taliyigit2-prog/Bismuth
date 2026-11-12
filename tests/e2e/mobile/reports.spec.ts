// Reports on the phone (390×844, G-143: "telefonda ay sonu ve aylık özet okunur"): the report groups are a list
// instead of tabs, KPI cards two by two, tables as cards or narrow columns, 44 px targets, nothing widens the page.
// The harness database is shared by the phone specs, so figures are checked against what the service answers.
import { expect, test, type Page } from '@playwright/test'
import { overflowReport } from '../routes'
import { api } from '../bridge'
import { freeRoom } from '../shared-hotel'

const shots = process.env['REPORT_SHOTS']

interface Options {
  today: string
  rooms: { id: string; number: string }[]
  channels: { id: string; code: string }[]
  methods: { id: string; code: string }[]
}

async function seed(page: Page): Promise<void> {
  const options = (await api<Options>(page, 'booking.options')).body
  const end = new Date(`${options.today}T12:00:00Z`)
  end.setUTCDate(end.getUTCDate() + 1)
  // The phone specs share one hotel: a room free tonight, added when none is.
  const room = await freeRoom(page, options.today, end.toISOString().slice(0, 10))
  const created = await api<{ reservation: { id: string } }>(page, 'booking.create', {
    guest: { firstName: 'Telefon', lastName: 'Raporu' },
    channelId: options.channels.find((c) => c.code === 'direct')!.id,
    stays: [
      {
        roomId: room.id,
        checkIn: options.today,
        checkOut: end.toISOString().slice(0, 10),
        nightlyPriceMinor: 210_000
      }
    ]
  })
  expect(created.status, JSON.stringify(created.body)).toBe(200)
  const paid = await api(page, 'ledger.addPayment', {
    reservationId: created.body.reservation.id,
    date: options.today,
    methodId: options.methods.find((m) => m.code === 'card')!.id,
    amountMinor: 210_000,
    currency: 'TRY'
  })
  expect(paid.status, JSON.stringify(paid.body)).toBe(200)
}

const open = async (page: Page, hash: string) => {
  await page.goto(`/${hash}`)
  await page.getByTestId('app-ready').waitFor({ state: 'attached' })
}

test('telefonda raporlar ve ay sonu okunur; hedefler 44 px, sayfa taşmaz', async ({ page }) => {
  test.setTimeout(120_000)
  await open(page, '#/reports')
  await seed(page)
  await page.reload()
  await page.getByTestId('app-ready').waitFor({ state: 'attached' })

  const select = page.getByTestId('report-tab-select')
  await expect(select).toBeVisible()
  expect((await select.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  const kpis = page.getByTestId('report-kpis')
  await expect(kpis).toContainText('Ciro')
  const ctx = await api<{ today: string }>(page, 'reports.context')
  const month = ctx.body.today.slice(0, 7)
  const next = new Date(`${month}-01T12:00:00Z`)
  next.setUTCMonth(next.getUTCMonth() + 1)
  const summary = await api<{ finance: { revenueMinor: number } }>(page, 'reports.summary', {
    from: `${month}-01`,
    to: next.toISOString().slice(0, 10)
  })
  const revenue = new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 0,
    minimumFractionDigits: 0
  }).format(summary.body.finance.revenueMinor / 100)
  await expect(kpis).toContainText(revenue)
  await expect(page.getByTestId('income-detail')).toContainText('Kredi kartı')
  await expect.poll(() => page.evaluate(overflowReport)).toEqual([])
  const print = page.getByTestId('print-report')
  expect((await print.boundingBox())!.height).toBeGreaterThanOrEqual(44)

  await select.click()
  await page.getByRole('option', { name: 'Doluluk ve göstergeler' }).click()
  await expect(page.getByTestId('occupancy-kpis')).toBeVisible()
  await expect(page.getByTestId('chart-heatmap')).toBeVisible()
  await expect.poll(() => page.evaluate(overflowReport)).toEqual([])
  if (shots) await page.screenshot({ path: `${shots}/reports-phone-occupancy.png`, fullPage: true })

  await open(page, '#/month-end')
  // Month-end opens on the month before once the hotel has data from it (another phone spec's past stay does
  // that); the seeded payment is in this month, the newest one.
  const nextMonth = page.getByRole('button', { name: 'Sonraki ay' })
  await expect(page.getByTestId('month-kpis')).toBeVisible()
  for (let i = 0; i < 24 && (await nextMonth.isEnabled()); i++) await nextMonth.click()
  await expect(nextMonth).toBeDisabled()
  await expect(page.getByTestId('month-kpis')).toContainText(revenue)
  const cards = page.getByTestId('month-cards')
  await expect(cards.getByRole('table')).toHaveCount(0)
  await expect(cards).toContainText('Kredi kartı')
  await expect(page.getByTestId('check-cards')).toContainText('Bankada kontrol bekleyen')
  const tick = page.getByTestId('check-results').getByRole('checkbox')
  await tick.click()
  await expect(tick).toBeChecked()
  for (const name of ['Önceki ay', 'Sonraki ay'])
    expect((await page.getByRole('button', { name }).boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await expect.poll(() => page.evaluate(overflowReport)).toEqual([])
  if (shots) await page.screenshot({ path: `${shots}/month-end-phone.png`, fullPage: true })
})
