// Faz 10 madde 1–9 in the real app: money is entered (a payment through the ledger form, more through the API), the
// month-end check and the summary report show the same figures, a report day opens in the ledger, the workbook is
// saved through the "Save as" dialog with Turkish letters intact, and the print layout fits A4 (printToPDF).
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import ExcelJS from 'exceljs'
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { api, reload } from '../bridge'
import { RECEPTION } from '../setup-draft.mjs'

const shots = process.env['REPORT_SHOTS']

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

async function book(page: Page, room: number, firstName: string, lastName: string, nights = 2) {
  const options = (await api<Options>(page, 'booking.options')).body
  const created = await api<{ reservation: { id: string } }>(page, 'booking.create', {
    guest: { firstName, lastName },
    channelId: options.channels.find((c) => c.code === 'direct')!.id,
    stays: [
      {
        roomId: options.rooms[room]!.id,
        checkIn: options.today,
        checkOut: addDays(options.today, nights),
        nightlyPriceMinor: 250_000
      }
    ]
  })
  expect(created.status, JSON.stringify(created.body)).toBe(200)
  return { id: created.body.reservation.id, options }
}

const monthTitle = (day: string): string => {
  const text = new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric' }).format(
    new Date(`${day}T12:00:00`)
  )
  return text.charAt(0).toLocaleUpperCase('tr') + text.slice(1)
}

test('veri gir → ay sonu → özet → gün defterde → Excel → yazdır (A4)', async ({ launch, userData }) => {
  test.setTimeout(180_000)
  const { app, page } = await launch()
  const { options } = await book(page, 0, 'Deniz', 'Yıldırım')
  const second = await book(page, 1, 'Olga', 'Petrova', 1)
  const method = (code: string) => options.methods.find((m) => m.code === code)!.id

  // Veri gir: the first stay's payment through the ledger form (5.000 cash), a card payment and an expense.
  await reload(page, '#/ledger')
  await page.getByTestId('add-payment').click()
  const pay = page.getByRole('dialog', { name: 'Ödeme ekle' })
  await pay.getByTestId('reservation-hit').filter({ hasText: 'Deniz Yıldırım' }).click()
  await expect(pay.getByLabel('Tutar')).toHaveValue('5.000')
  await pay.getByTestId('ledger-payment-save').click()
  await expect(pay).toHaveCount(0)
  const card = await api(page, 'ledger.addPayment', {
    reservationId: second.id,
    date: options.today,
    methodId: method('card'),
    amountMinor: 300_000,
    currency: 'TRY'
  })
  expect(card.status, JSON.stringify(card.body)).toBe(200)
  const sections = (await api<{ sections: { id: string; code: string }[] }>(page, 'ledger.options')).body
    .sections
  const spent = await api(page, 'ledger.addExpense', {
    date: options.today,
    sectionId: sections.find((s) => s.code === 'general')!.id,
    amountMinor: 40_000,
    currency: 'TRY',
    description: 'Çamaşır suyu ve şişe',
    paidFromDrawer: true
  })
  expect(spent.status, JSON.stringify(spent.body)).toBe(200)

  // Ay sonu: this month (the only one with records), card waiting for the x, revenue 8.000, expense 400.
  await reload(page, '#/month-end')
  await expect(page.getByRole('heading', { level: 1, name: 'Ay sonu kontrolü' })).toBeVisible()
  await expect(page.getByTestId('month-select')).toContainText(monthTitle(options.today))
  const kpis = page.getByTestId('month-kpis')
  await expect(kpis).toContainText('₺8.000')
  await expect(kpis).toContainText('₺400')
  await expect(page.getByTestId('check-cards')).toContainText('Bankada kontrol bekleyen ₺3.000')
  await expect(page.getByTestId('month-top')).toContainText('Çamaşır suyu ve şişe')
  await page.getByTestId('check-results').getByRole('checkbox').click()
  await expect(page.getByTestId('check-progress')).toContainText('1/')

  // Özet: the same revenue; the day opens in the ledger.
  await reload(page, '#/reports')
  await expect(page.getByTestId('report-kpis')).toContainText('₺8.000')
  const income = page.getByTestId('income-detail')
  await expect(income).toContainText('Nakit')
  await expect(income).toContainText('Kredi kartı')
  const daily = page.getByTestId('chart-daily')
  await daily.getByRole('radio', { name: 'Tablo' }).click()
  await daily.getByRole('row').nth(1).getByRole('button').click()
  const detail = page.getByTestId('day-detail')
  await expect(detail).toContainText('₺8.000')
  await detail.getByRole('link', { name: /Defterde aç/ }).click()
  await expect(page.getByTestId('day-payments')).toContainText('Deniz Yıldırım')

  // Excel: the program's "Save as" dialog is answered by the test.
  const target = join(userData, 'raporlar')
  mkdirSync(target, { recursive: true })
  await app.evaluate(({ dialog }, dir) => {
    dialog.showSaveDialog = (async (...args: unknown[]) => {
      const opts = args.at(-1) as { defaultPath?: string }
      const name = (opts.defaultPath ?? 'x.xlsx').split(/[\\/]/).pop()!
      return { canceled: false, filePath: `${dir}/${name}` }
    }) as typeof dialog.showSaveDialog
  }, target)
  await reload(page, '#/reports')
  await page.getByTestId('export-report').click()
  await expect(page.getByText(/^Dosya kaydedildi: /)).toBeVisible({ timeout: 30_000 })
  const files = readdirSync(target).filter((n) => n.endsWith('.xlsx'))
  expect(files).toHaveLength(1)
  expect(files[0]).toMatch(/^Özet raporu \d{4}-\d{2}-01_\d{4}-\d{2}-\d{2}\.xlsx$/)
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(readFileSync(join(target, files[0]!)) as unknown as ArrayBuffer)
  const top = wb.getWorksheet('En çok harcama')!
  const cells: string[] = []
  top.eachRow((row) => row.eachCell((c) => cells.push(String(c.text))))
  expect(cells).toContain('Çamaşır suyu ve şişe')
  expect(cells).toContain('Kalem')

  // Yazdır: the print layout (window.print answered by the test), then a real A4 PDF of it.
  await page.evaluate(() => {
    window.print = () => undefined
  })
  await page.getByTestId('print-report').click()
  const root = page.getByTestId('print-root')
  await expect(root).toBeAttached()
  await expect(root.getByTestId('print-range')).toContainText(' – ')
  // Nothing in the print layout is wider than the printable A4 width (210 − 2 × 12 mm ≈ 703 px).
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(703, 900))
  await page.emulateMedia({ media: 'print' })
  const overflow = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="print-root"]') as HTMLElement
    return el.scrollWidth - el.clientWidth
  })
  expect(overflow).toBeLessThanOrEqual(1)
  await page.emulateMedia({ media: null })
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1366, 768))
  // printToPDF fires beforeprint/afterprint like the real print: the layout goes away after it.
  await expect(root).toBeAttached()
  const pdf = await app.evaluate(async ({ BrowserWindow }) => {
    const data = await BrowserWindow.getAllWindows()[0]!.webContents.printToPDF({
      pageSize: 'A4',
      preferCSSPageSize: true
    })
    return Buffer.from(data).toString('latin1')
  })
  const pages = pdf.match(/\/Type\s*\/Page[^s]/g) ?? []
  expect(pages.length).toBeGreaterThanOrEqual(1)
  expect(pages.length).toBeLessThanOrEqual(6)
  const box = /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(pdf)
  expect(box, 'MediaBox').not.toBeNull()
  expect(Math.abs(Number(box![1]) - 595.3)).toBeLessThan(3)
  expect(Math.abs(Number(box![2]) - 841.9)).toBeLessThan(3)
  await expect(root).toHaveCount(0)
  if (shots) {
    writeFileSync(`${shots}/reports-print.pdf`, Buffer.from(pdf, 'latin1'))
    await page.getByTestId('print-report').click()
    await page.emulateMedia({ media: 'print' })
    await page.screenshot({ path: `${shots}/reports-print-preview.png`, fullPage: true })
    await page.emulateMedia({ media: null })
  }
})

test('resepsiyon menüde raporları ve ay sonunu görmez; adresle açınca yetkisiz', async ({ launch }) => {
  test.setTimeout(90_000)
  const { page } = await launch()
  await api(page, 'auth.signOut')
  const signed = await api(page, 'auth.signIn', { username: RECEPTION.username, secret: RECEPTION.password })
  expect(signed.status, JSON.stringify(signed.body)).toBe(200)
  const changed = await api(page, 'auth.changePassword', {
    currentPassword: RECEPTION.password,
    newPassword: 'deniz-rapor-sifresi'
  })
  expect(changed.status).toBe(200)
  await reload(page, '#/today')
  await expect(page.getByRole('link', { name: 'Raporlar' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Ay sonu kontrolü' })).toHaveCount(0)
  const direct = await api(page, 'reports.monthly', { from: '2026-10-01', to: '2026-11-01' })
  expect(direct.status).toBe(403)
  await reload(page, '#/reports')
  await expect(page.getByText(/yetkiniz yok/).first()).toBeVisible()
})
