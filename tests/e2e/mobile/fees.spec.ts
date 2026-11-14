// P21d (Ö-22) on the phone (390×844): the night report is readable in one column with a 44 px print button, the fee
// rules card of Ayarlar fits, and a reservation with a deposit held shows it in the report; nothing widens the page.
import { expect, test, type Page } from '@playwright/test'
import { overflowReport } from '../routes'
import { api } from '../bridge'
import { freeRoom } from '../shared-hotel'

interface Options {
  today: string
  channels: { id: string; code: string }[]
  methods: { id: string; code: string }[]
}

const open = async (page: Page, hash: string) => {
  await page.goto(`/${hash}`)
  await page.getByTestId('app-ready').waitFor({ state: 'attached' })
}

test('telefonda gece raporu ve ücret kuralları okunur; depozito emanette görünür', async ({ page }) => {
  test.setTimeout(120_000)
  await open(page, '#/reports')
  const options = (await api<Options>(page, 'booking.options')).body
  const end = new Date(`${options.today}T12:00:00Z`)
  end.setUTCDate(end.getUTCDate() + 1)
  const room = await freeRoom(page, options.today, end.toISOString().slice(0, 10))
  const created = await api<{ reservation: { id: string } }>(page, 'booking.create', {
    guest: { firstName: 'Gece', lastName: 'Raporu' },
    channelId: options.channels.find((c) => c.code === 'direct')!.id,
    stays: [
      {
        roomId: room.id,
        checkIn: options.today,
        checkOut: end.toISOString().slice(0, 10),
        nightlyPriceMinor: 120_000
      }
    ]
  })
  expect(created.status, JSON.stringify(created.body)).toBe(200)
  const deposit = await api(page, 'booking.takeDeposit', {
    reservationId: created.body.reservation.id,
    amountMinor: 50_000,
    methodId: options.methods.find((m) => m.code === 'cash')!.id
  })
  expect(deposit.status, JSON.stringify(deposit.body)).toBe(200)

  await page.reload()
  await page.getByTestId('app-ready').waitFor({ state: 'attached' })
  await page.getByTestId('report-tab-select').click()
  await page.getByRole('option', { name: 'Gece raporu' }).click()
  const view = page.getByTestId('night-report')
  await expect(view.getByTestId('night-arrivals')).toContainText('Gece Raporu')
  await expect(view.getByTestId('night-cash')).toContainText('Emanetteki depozito')
  await expect.poll(() => page.evaluate(overflowReport)).toEqual([])
  expect((await page.getByTestId('print-report').boundingBox())!.height).toBeGreaterThanOrEqual(44)

  await open(page, '#/settings?tab=hotel')
  const card = page.getByTestId('fees-card')
  await expect(card).toBeVisible()
  await card.getByTestId('fees-late-mode').click()
  await page.getByRole('option', { name: 'Gecelik fiyatın yüzdesi' }).click()
  await expect(card.getByTestId('fees-late-percent')).toBeVisible()
  expect((await card.getByTestId('fees-save').boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await expect.poll(() => page.evaluate(overflowReport)).toEqual([])
})
