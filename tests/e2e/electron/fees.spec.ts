// P21d (Ö-22) in the real app: the late check-out line and the no-show fee on the folio, a damage deposit that is not
// income, and the night report with its A4 print preview.
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { api, reload } from '../bridge'
import { freeRooms, hotelToday, shiftDay } from '../shared-hotel'

interface Options {
  channels: { id: string }[]
}
interface View {
  reservation: { id: string }
  stays: { id: string; status: string }[]
  folio: { chargesMinor: number; balanceMinor: number | null }
}

async function book(page: Page, roomId: string, guest: string, checkIn: string, checkOut: string) {
  const options = await api<Options>(page, 'booking.options')
  const res = await api<View>(page, 'booking.create', {
    guest: { firstName: guest, lastName: 'Örnek' },
    channelId: options.body.channels[0]!.id,
    stays: [{ roomId, checkIn, checkOut, nightlyPriceMinor: 100_000 }]
  })
  expect(res.status, JSON.stringify(res.body)).toBe(200)
  return res.body
}

test('geç çıkış kalemi, gelmedi bedeli ve depozito folyoda; depozito gelir sayılmaz; gece raporu yazdırılır', async ({
  launch
}) => {
  test.setTimeout(180_000)
  const { app, page } = await launch()
  const today = await hotelToday(page)
  const [stayRoom, noShowRoom] = await freeRooms(page, today, shiftDay(today, 2), 2)
  // The hotel's rules (settings): late check-out after 00:00 costs half a night, a no-show the first night.
  const set = await api(page, 'settings.set', {
    'fees.lateCheckout': { mode: 'percent', afterTime: '00:00', amountMinor: 0, percentBp: 5000 },
    'fees.noShow': { mode: 'first_night', amountMinor: 0 }
  })
  expect(set.status, JSON.stringify(set.body)).toBe(200)

  const stay = await book(page, stayRoom!.id, 'Geççıkan', today, shiftDay(today, 2))
  const checkedIn = await api(page, 'booking.checkIn', { stayId: stay.stays[0]!.id })
  expect(checkedIn.status).toBe(200)
  const noShow = await book(page, noShowRoom!.id, 'Gelmeyen', today, shiftDay(today, 2))

  await reload(page, '#/calendar')
  await page.getByTestId(`stay-${stay.stays[0]!.id}`).click()
  const panel = page.getByTestId('reservation-panel')
  await panel.getByRole('tab', { name: 'Para' }).click()

  // Late check-out line: the dialog offers half the night (500,00), the desk keeps it.
  await panel.getByTestId('late-checkout-add').click()
  await page.getByTestId('late-time').fill('15:00')
  await page.getByRole('button', { name: 'Kalemi ekle' }).click()
  await expect(panel.getByTestId('fee-line-late_checkout')).toContainText('15:00')
  await expect(panel.getByTestId('fee-line-late_checkout')).toContainText('500')
  await expect(panel.getByTestId('folio-charges')).toContainText('2.500')

  // Damage deposit: held, the folio does not change.
  await panel.getByTestId('deposit-take').click()
  await page.getByRole('textbox', { name: 'Tutar' }).fill('1000')
  await page.getByRole('button', { name: 'Depozitoyu kaydet' }).click()
  await expect(panel.getByTestId('deposit-held')).toContainText('Emanette')
  await expect(panel.getByTestId('folio-charges')).toContainText('2.500')
  const report = await api<{ cash: { byCurrency: { incomeMinor: number; depositHeldMinor: number }[] } }>(
    page,
    'reports.nightReport',
    { date: today }
  )
  expect(report.body.cash.byCurrency[0]).toMatchObject({ incomeMinor: 0, depositHeldMinor: 100_000 })

  // Give it back at check-out time: it leaves "emanette", still no income.
  await panel.getByTestId('deposit-refund').click()
  await page.getByRole('button', { name: 'İade et' }).last().click()
  await expect(panel.getByTestId('deposit-refunded')).toContainText('İade edildi')

  // No-show: the dialog offers the first night; the fee line lands on the folio.
  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()
  await page.getByTestId(`stay-${noShow.stays[0]!.id}`).click()
  await panel.getByTestId('panel-more').click()
  await page.getByTestId('panel-no-show').click()
  await expect(page.getByTestId('no-show-fee')).toContainText('Gelmeme bedeli')
  await expect(page.getByTestId('no-show-fee').getByRole('textbox')).toHaveValue('1.000')
  await page.getByTestId('no-show-confirm').click()
  await expect(panel.getByTestId('panel-status')).toHaveText('Gelmedi')
  await panel.getByRole('tab', { name: 'Para' }).click()
  await expect(panel.getByTestId('fee-line-no_show_fee')).toContainText('1.000')
  await expect(panel.getByTestId('folio-balance')).toContainText('1.000')

  // Night report: arrivals, in-house and the no-show; printed on one A4 page.
  await reload(page, '#/reports')
  await page.getByTestId('tab-night').click()
  const view = page.getByTestId('night-report')
  await expect(view.getByTestId('night-arrivals')).toContainText('Geççıkan')
  await expect(view.getByTestId('night-noShows')).toContainText('Gelmeyen')
  await expect(view.getByTestId('night-staying')).toContainText('Geççıkan')
  await expect(view.getByTestId('night-rooms-occupied')).toHaveText('1')
  await page.evaluate(() => {
    window.print = () => undefined
  })
  await page.getByTestId('print-report').click()
  const root = page.getByTestId('print-root')
  await expect(root).toBeAttached()
  await expect(root.getByTestId('night-report')).toBeAttached()
  await expect(root.getByTestId('night-cash')).toContainText('Emanetteki depozito')
  // Nothing in the print layout is wider than the printable A4 width, and the report is one page.
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(703, 900))
  await page.emulateMedia({ media: 'print' })
  const overflow = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="print-root"]') as HTMLElement
    return el.scrollWidth - el.clientWidth
  })
  expect(overflow).toBeLessThanOrEqual(1)
  await page.emulateMedia({ media: null })
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1366, 768))
  await expect(root).toBeAttached()
  const pdf = await app.evaluate(async ({ BrowserWindow }) => {
    const data = await BrowserWindow.getAllWindows()[0]!.webContents.printToPDF({
      pageSize: 'A4',
      preferCSSPageSize: true
    })
    return Buffer.from(data).toString('latin1')
  })
  expect((pdf.match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBe(1)
  const box = /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(pdf)
  expect(Math.abs(Number(box![1]) - 595.3)).toBeLessThan(3)
  await expect(root).toHaveCount(0)
})
