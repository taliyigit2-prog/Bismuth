// Faz 8 acceptance in the real app, through the screens (G-80, G-81, G-87, G-69): an employee is added with a
// salary from the first of the month, gets an advance, the salary table shows the Excel formula, a part of the
// salary is paid and the debt left is what the service says; both money records are locked ledger expenses.
import { expect, test } from './fixtures'
import { api, reload } from '../bridge'

interface Row {
  employeeId: string
  net: number
  paid: number
  remaining: number
  advances: number
}

test('çalışan ekle → avans → maaş tablosu → kısmi ödeme → kalan borç', async ({ launch }) => {
  test.setTimeout(120_000)
  const { page } = await launch()
  await reload(page, '#/staff')
  await expect(page.getByRole('heading', { level: 1, name: 'Personel' })).toBeVisible()

  // 1. New card: name, salary 40.000, working from the 1st of this month (a full month: 40.000 + 4 × 40.000 ÷ 30).
  await page.getByTestId('new-employee').click()
  const form = page.getByRole('dialog', { name: 'Yeni çalışan' })
  await form.getByLabel('Ad', { exact: true }).fill('Ayşe')
  await form.getByLabel('Soyad').fill('Deneme')
  await form.getByLabel('Aylık maaş').fill('40000')
  await form.getByRole('button', { name: /^İşe giriş/ }).click()
  await page.getByTestId('month-calendar').getByRole('gridcell', { name: /^1 / }).first().click()
  await form.getByRole('button', { name: 'Kaydet' }).click()
  const sheet = page.getByTestId('employee-sheet')
  await expect(sheet).toContainText('Ayşe Deneme')
  await page.keyboard.press('Escape')
  await expect(sheet).toHaveCount(0)

  // 2. Advance 12.500 from the salary table.
  await page.getByRole('tab', { name: 'Maaş tablosu' }).click()
  const employees = await api<{ id: string; fullName: string }[]>(page, 'staff.employees', {})
  const ayse = employees.body.find((e) => e.fullName === 'Ayşe Deneme')!
  const row = page.getByTestId(`salary-row-${ayse.id}`)
  await expect(row).toContainText('₺40.000')
  await expect(row).toContainText('₺45.333')
  await page.getByRole('button', { name: 'Ayşe Deneme: avans ver' }).click()
  const advance = page.getByRole('dialog', { name: 'Avans ver' })
  await advance.getByLabel('Avans tutarı').fill('12500')
  await advance.getByRole('button', { name: 'Kaydet' }).click()
  await expect(advance).toHaveCount(0)
  await expect(row).toContainText('₺12.500')
  await expect(page.getByTestId(`salary-debt-${ayse.id}`)).toHaveText('₺32.833,33') // K-46: kuruş shown when there is some

  // 3. Part of the salary paid: 20.000 → 12.833 still owed.
  await page.getByRole('button', { name: 'Ayşe Deneme: maaş öde' }).click()
  const pay = page.getByRole('dialog', { name: 'Maaş öde' })
  await expect(pay.getByTestId('pay-summary')).toContainText('₺32.833')
  const amount = pay.getByLabel('Ödenen tutar')
  await amount.fill('20000')
  await amount.blur()
  await expect(pay.getByTestId('pay-after')).toContainText('₺12.833')
  await pay.getByRole('button', { name: 'Ödemeyi kaydet' }).click()
  await expect(pay).toHaveCount(0)
  await expect(page.getByTestId(`salary-debt-${ayse.id}`)).toHaveText('₺12.833,33')

  // The service agrees, and each payout is a ledger expense (G-69).
  const today = new Date()
  const table = await api<{ rows: Row[] }>(page, 'staff.salaryTable', {
    year: today.getFullYear(),
    month: today.getMonth() + 1
  })
  expect(table.body.rows.find((r) => r.employeeId === ayse.id)).toMatchObject({
    advances: 1_250_000,
    net: 3_283_333,
    paid: 2_000_000,
    remaining: 1_283_333
  })
  const txns = await api<{ kind: string; expenseId: string | null }[]>(page, 'staff.listTransactions', {
    employeeId: ayse.id,
    year: today.getFullYear(),
    month: today.getMonth() + 1
  })
  expect(txns.body.map((t) => t.kind)).toEqual(['advance', 'salary_payment'])
  expect(txns.body.every((t) => t.expenseId)).toBe(true)
})
