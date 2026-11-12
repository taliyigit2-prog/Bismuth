// Faz 12 acceptance in the real app, through the screens: the Munzur delivery slip (40 × 60 = 2.400) written as one
// expense, the second purchase at 65 showing "+%8,3 zam", the void taking it out again; the laundry's example clean
// slip typed by keyboard in under a minute, the invoice difference and "Ödendi"; "rehber: sucu" from Hızlı arama.
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { api, reload } from '../bridge'

const go = (page: Page, hash: string) => reload(page, hash)

interface Row {
  id: string
  code: string | null
}

async function ok<T>(page: Page, name: string, body: unknown): Promise<T> {
  const res = await api<T>(page, name, body)
  expect(res.status, `${name}: ${JSON.stringify(res.body)}`).toBe(200)
  return res.body
}

async function buy(page: Page, unit: string): Promise<void> {
  await page.getByTestId('purchase-open').click()
  const dialog = page.getByRole('dialog')
  await dialog.getByTestId('purchase-product').click()
  await page.getByRole('option', { name: 'Munzur 0,5 L' }).click()
  await dialog.getByTestId('purchase-qty').fill('40')
  await dialog.getByLabel('Birim fiyat').fill(unit)
  await dialog.getByLabel('Birim fiyat').press('Tab')
  await dialog.getByTestId('purchase-save').click()
  await expect(dialog).toBeHidden()
}

test('teslim fişi tek gider olur; ikinci alımda 65 TL "+%8,3 zam"; iptal edilen alım fiyat geçmişinden düşer', async ({
  launch
}) => {
  test.setTimeout(120_000)
  const { page } = await launch()
  const supplier = await ok<Row>(page, 'contacts.create', { name: 'Munzur Su Bayii', category: 'supplier' })
  const categories = await ok<Row[]>(page, 'supply.categories', {})
  await ok(page, 'supply.createProduct', {
    name: 'Munzur 0,5 L',
    categoryId: categories.find((c) => c.code === 'drinks')!.id,
    unit: 'piece',
    supplierContactId: supplier.id
  })
  await go(page, '#/supply')

  await buy(page, '60')
  const today = new Date().toLocaleDateString('sv')
  const month = `${today.slice(0, 8)}01`
  const first = await ok<{ amountMinor: number; vendorContactId: string; items: unknown[] }[]>(
    page,
    'supply.purchases',
    { from: month, to: today }
  )
  expect(first).toHaveLength(1)
  expect(first[0]).toMatchObject({
    amountMinor: 240_000,
    vendorContactId: supplier.id,
    items: [{ qtyMilli: 40_000, unitPriceMinor: 6_000, amountMinor: 240_000 }]
  })

  await buy(page, '65')
  const row = page.getByTestId('product-table').getByRole('row').filter({ hasText: 'Munzur 0,5 L' })
  await expect(row.getByTestId('price-rise')).toHaveText('+%8,3 zam')

  await page.getByRole('tab', { name: 'Alımlar' }).click()
  const latest = page.getByTestId('purchase-list').locator(':scope > li').filter({ hasText: '₺2.600' })
  await latest.getByRole('button', { name: 'Alımı iptal et' }).click()
  const alert = page.getByRole('alertdialog')
  await alert.getByLabel('İptal nedeni').fill('fiş iki kez girildi')
  await alert.getByRole('button', { name: 'Alımı iptal et' }).click()
  await expect(latest).toContainText('İptal edildi')
  await page.getByRole('tab', { name: 'Ürünler' }).click()
  await expect(row.getByTestId('price-rise')).toHaveCount(0)
  await expect(row).toContainText('İlk alım')
})

test('çamaşırhane: örnek temiz fişi klavyeyle bir dakikadan kısa sürede girilir; fatura farkı ve "Ödendi"', async ({
  launch
}) => {
  test.setTimeout(120_000)
  const { page } = await launch()
  const laundry = await ok<Row>(page, 'contacts.create', {
    name: 'Örnek Çamaşırhane',
    category: 'laundry',
    phones: [{ label: '', number: '0216 000 00 00' }]
  })
  const types = await ok<Row[]>(page, 'lists.list', { kind: 'laundryItemTypes' })
  const typeId = (code: string) => types.find((t) => t.code === code)!.id
  const today = new Date().toLocaleDateString('sv')
  const month = `${today.slice(0, 8)}01`
  for (const [code, price] of [
    ['sheet', 1_500],
    ['duvet_cover', 2_500],
    ['pillowcase', 800],
    ['bath_towel', 1_200],
    ['hand_towel', 600],
    ['bath_mat', 700]
  ] as const)
    await ok(page, 'laundry.setPrice', {
      contactId: laundry.id,
      itemTypeId: typeId(code),
      validFrom: month,
      unitPriceMinor: price
    })
  await go(page, '#/laundry')

  const started = Date.now()
  await page.getByTestId('laundry-in').click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByTestId('delivery-slip')).toBeFocused()
  // The slip's order is the list's order (Ayarlar → Listeler): sheet, mattress protector, duvet cover, pillowcase,
  // bath towel, hand towel, bath mat… — Enter moves on, an empty field counts as 0.
  const order = types.map((t) => t.code)
  const pieces: Record<string, number> = {
    sheet: 17,
    duvet_cover: 11,
    pillowcase: 27,
    bath_towel: 36,
    hand_towel: 5,
    bath_mat: 18
  }
  await page.keyboard.type('RC10746')
  await page.keyboard.press('Enter')
  const last = Math.max(...Object.keys(pieces).map((c) => order.indexOf(c)))
  for (let i = 0; i <= last; i++) {
    const code = order[i] ?? ''
    if (pieces[code]) await page.keyboard.type(String(pieces[code]))
    await page.keyboard.press('Enter')
    if (code === 'sheet') await page.keyboard.type('1')
    await page.keyboard.press('Enter')
  }
  await page.getByTestId('delivery-save').click()
  await expect(dialog).toBeHidden()
  expect(Date.now() - started).toBeLessThan(60_000)

  const slips = await ok<
    { slipNo: string; items: { itemTypeId: string; qty: number; stainedQty: number }[] }[]
  >(page, 'laundry.deliveries', { contactId: laundry.id })
  expect(slips).toHaveLength(1)
  expect(slips[0]?.slipNo).toBe('RC10746')
  expect(Object.fromEntries(slips[0]!.items.map((i) => [i.itemTypeId, i.qty]))).toEqual(
    Object.fromEntries(Object.entries(pieces).map(([code, qty]) => [typeId(code), qty]))
  )
  expect(slips[0]!.items.find((i) => i.itemTypeId === typeId('sheet'))?.stainedQty).toBe(1)

  // This month: 17×15 + 11×25 + 27×8 + 36×12 + 5×6 + 18×7 = 1.334.
  const card = page.getByTestId('laundry-settlement')
  await card.getByRole('radio').last().click()
  await expect(card.getByTestId('settlement-computed')).toHaveText('₺1.334')
  await card.getByTestId('settlement-invoice-open').click()
  const invoice = page.getByRole('dialog')
  await invoice.getByLabel('Fatura tutarı').fill('1.400')
  await invoice.getByLabel('Fatura tutarı').press('Tab')
  await invoice.getByTestId('invoice-save').click()
  await expect(card.getByTestId('invoice-difference')).toContainText('₺66')
  await card.getByTestId('settlement-mark-paid').click()
  await page.getByTestId('paid-confirm').click()
  await expect(card.getByTestId('settlement-paid')).toBeVisible()
})

test('Hızlı aramada "rehber: sucu" kişiyi bulur ve Rehber onu süzülmüş açar', async ({ launch }) => {
  const { page } = await launch()
  await ok(page, 'contacts.create', {
    name: 'Damacana Ahmet',
    category: 'custom',
    customCategory: 'Sucu',
    phones: [{ label: 'cep', number: '0532 000 00 01' }]
  })
  await ok(page, 'contacts.create', { name: 'Usta Tesisat', category: 'plumber' })
  await go(page, '#/today')
  await page.keyboard.press('Control+K')
  await page.getByPlaceholder('Ekran ya da ayar yazın…').fill('rehber: sucu')
  await page.getByRole('option', { name: /Damacana Ahmet/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Rehber' })).toBeVisible()
  await expect(page.getByTestId('contact-search')).toHaveValue('Damacana Ahmet')
  await expect(page.getByTestId('contact-list')).toContainText('Damacana Ahmet')
  await expect(page.getByTestId('contact-list')).not.toContainText('Usta Tesisat')
})
