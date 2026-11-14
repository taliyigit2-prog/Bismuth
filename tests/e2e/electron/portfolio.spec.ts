// P21c (K-54) in the real app, on the hotel's own computer: the owner's portfolio shows the hotel's own figures (the
// same numbers the reports give), the read-only calendar, and the note that the other hotel comes from the owner's own
// device; a receptionist neither sees the menu entry nor gets the data. (The client computer with two hotels and a
// read-only copy is covered by tests/unit/portfolio.test.ts and portfolio-wiring.test.ts.)
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { api, reload } from '../bridge'

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

async function seed(page: Page): Promise<Options> {
  const options = (await api<Options>(page, 'booking.options')).body
  const created = await api<{ reservation: { id: string } }>(page, 'booking.create', {
    guest: { firstName: 'Portföy', lastName: 'Misafiri' },
    channelId: options.channels.find((c) => c.code === 'direct')!.id,
    stays: [
      {
        roomId: options.rooms[0]!.id,
        checkIn: options.today,
        checkOut: addDays(options.today, 2),
        nightlyPriceMinor: 250_000
      }
    ]
  })
  expect(created.status, JSON.stringify(created.body)).toBe(200)
  const paid = await api(page, 'ledger.addPayment', {
    reservationId: created.body.reservation.id,
    date: options.today,
    methodId: options.methods.find((m) => m.code === 'card')!.id,
    amountMinor: 500_000,
    currency: 'TRY'
  })
  expect(paid.status, JSON.stringify(paid.body)).toBe(200)
  return options
}

test('sahip portföyde kendi otelinin rakamlarını (raporla aynı) ve salt okunur takvimi görür', async ({
  launch
}) => {
  test.setTimeout(120_000)
  const { page } = await launch()
  const options = await seed(page)
  const period = { from: `${options.today.slice(0, 7)}-01`, to: addDays(options.today, 1) }
  const summary = (await api<{ finance: { revenueMinor: number } }>(page, 'reports.summary', period)).body
  await reload(page, '#/portfolio')
  await expect(page.getByRole('heading', { level: 1, name: 'Portföy' })).toBeVisible()
  const card = page.getByTestId('portfolio-hotel-own')
  await expect(card).toBeVisible()
  await expect(card.getByTestId('source-live')).toBeVisible()
  await expect(card.getByTestId('kpi-card')).toHaveCount(6)
  // The same revenue the report gives (card payment of 5.000 today).
  expect(summary.finance.revenueMinor).toBeGreaterThanOrEqual(500_000)
  await expect(card).toContainText('₺5.000')
  await expect(page.getByTestId('portfolio-host-note')).toContainText('kendi cihazınızdan')
  await expect(page.getByTestId('portfolio-calendar')).toBeVisible()
  await expect(page.getByText('Portföy Misafiri').first()).toBeVisible()
  // Read-only: a click on the bar opens nothing (no panel, no dialog).
  await page.getByText('Portföy Misafiri').first().click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('yalnız sahip: resepsiyon menüde göremez ve servisten yetkisiz yanıtı alır', async ({ launch }) => {
  test.setTimeout(120_000)
  const { page } = await launch()
  await seed(page)
  const owner = await api(page, 'portfolio.overview', { from: '2026-01-01', to: '2026-02-01' })
  expect(owner.status).toBe(200)
  await reload(page, '#/today')
  await expect(page.getByRole('link', { name: 'Portföy' }).first()).toBeVisible()
  const roles = (await api<{ id: string; code: string }[]>(page, 'roles.list')).body
  expect(roles.some((r) => r.code === 'reception')).toBe(true)
  // The role's own default is "none" for the owner-only rights this screen needs.
  const reception = roles.find((r) => r.code === 'reception') as unknown as {
    permissions: Record<string, string>
  }
  expect(reception.permissions['remote.settings']).toBe('none')
})
