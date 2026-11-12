// faz-06 kabul ölçütleri in the real app: a guest is found with a spelling slip, the card shows the price history,
// "bu fiyatı yeni rezervasyona uygula" opens the reservation form with the guest and the last nightly price, and the
// reservation is saved; companies are entered and copied for the invoice program; a blacklisted phone warns a new
// guest card. Names and amounts are invented.
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { api, reload } from '../bridge'

const shots = process.env['GUESTS_SHOTS']

const localDay = (offset: number): string => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface Options {
  rooms: { id: string; number: string }[]
  channels: { id: string }[]
}

/** A past stay of GADİR GADİROV at ₺3.150 a night, written through the reservation panel's procedure. */
async function pastStay(page: Page): Promise<void> {
  const options = (await api<Options>(page, 'booking.options')).body
  const room = options.rooms.find((r) => r.number === '101')!
  const created = await api(page, 'booking.create', {
    guest: { firstName: 'GADİR', lastName: 'GADİROV', phone: '0532 111 22 33' },
    channelId: options.channels[0]!.id,
    stays: [{ roomId: room.id, checkIn: localDay(-40), checkOut: localDay(-38), nightlyPriceMinor: 315_000 }]
  })
  expect(created.status, JSON.stringify(created.body)).toBe(200)
}

test('misafir ara → geçmiş → bu fiyatla yeni rezervasyon: form misafir ve son fiyatla açılır, kaydedilir', async ({
  launch
}) => {
  test.setTimeout(120_000)
  const { page } = await launch()
  await pastStay(page)
  await reload(page, '#/guests')
  await page.getByTestId('guest-search').fill('gadir garibov')
  const table = page.getByTestId('guest-table')
  await table.getByRole('button', { name: 'GADİR GADİROV' }).click()
  const sheet = page.getByTestId('guest-sheet')
  await expect(sheet.getByTestId('summary-last-price')).toHaveText('₺3.150')
  await expect(sheet.getByTestId('history-list').getByRole('listitem')).toHaveCount(1)
  await expect(sheet.getByTestId('history-list')).toContainText(`2 × ₺3.150`)
  if (shots) await page.screenshot({ path: `${shots}/guests-card-desktop.png` })
  await sheet.getByTestId('apply-last-price').click()
  const dialog = page.getByRole('dialog', { name: 'Yeni rezervasyon' })
  await expect(dialog.getByTestId('guest-summary')).toBeVisible()
  await expect(dialog.getByRole('combobox').first()).toContainText('GADİR GADİROV')
  await page.getByTestId('room-multi-picker').click()
  await page.getByTestId('room-option-102').getByRole('checkbox').click()
  await page.keyboard.press('Escape')
  const block = page.getByTestId('price-block-102')
  await expect(block.getByRole('textbox').first()).toHaveValue('3.150')
  await expect(block.getByTestId('last-paid')).toContainText('₺3.150')
  if (shots) await page.screenshot({ path: `${shots}/guests-new-reservation-desktop.png` })
  await page.getByTestId('new-reservation-save').click()
  await expect(page.getByTestId('reservation-panel').getByTestId('panel-guest')).toHaveText('GADİR GADİROV')
})

test('firma eklenir, favori üstte, fatura bilgisi panoya alt alta kopyalanır', async ({ launch }) => {
  test.setTimeout(90_000)
  const { app, page } = await launch()
  await api(page, 'companies.create', { title: 'Alfa Ltd.' })
  await reload(page, '#/companies')
  await page.getByTestId('company-new').click()
  const dialog = page.getByRole('dialog', { name: 'Yeni firma' })
  await dialog.getByLabel('Unvan').fill('Zeta Turizm A.Ş.')
  await dialog.getByLabel('Vergi dairesi').fill('Kadıköy')
  await dialog.getByLabel('Vergi no').fill('1234567890')
  await dialog.getByLabel('IBAN').fill('tr83 0006 2000 0000 0012 3456 78')
  await dialog.getByText('Favori firma').click()
  await dialog.getByTestId('company-save').click()
  const list = page.getByTestId('company-list')
  const zeta = list.locator('[data-slot="card"]').filter({ hasText: 'Zeta Turizm A.Ş.' })
  // The favourite is first, before the older company.
  await expect(list.locator('[data-slot="card"]').first()).toContainText('Zeta Turizm A.Ş.')
  await zeta.getByRole('button', { name: 'Kopyala' }).click()
  await expect
    .poll(() => app.evaluate(({ clipboard }) => clipboard.readText()))
    .toBe(
      'Unvan: Zeta Turizm A.Ş.\nVergi dairesi / No: Kadıköy / 1234567890\nIBAN: TR83 0006 2000 0000 0012 3456 78'
    )
  if (shots) await page.screenshot({ path: `${shots}/companies-desktop.png` })
})

test('kara listeye telefonla eklenen kişi: yeni misafir kartında aynı telefon uyarı verir; resepsiyon kaldıramaz', async ({
  launch
}) => {
  test.setTimeout(90_000)
  const { page } = await launch()
  await reload(page, '#/blacklist')
  await page.getByTestId('blacklist-add').click()
  const add = page.getByRole('dialog', { name: 'Kara listeye ekle' })
  await add.getByLabel('Ad soyad').fill('Sorunlu Kişi')
  await add.getByRole('textbox', { name: 'Telefon' }).fill('533 000 00 01')
  await add.getByLabel('Neden', { exact: true }).fill('Odaya zarar verdi')
  await add.getByTestId('blacklist-save').click()
  await expect(page.getByTestId('blacklist-table')).toContainText('Sorunlu Kişi')
  await expect(page.getByTestId('blacklist-table')).toContainText('+90 533 000 00 01')
  if (shots) await page.screenshot({ path: `${shots}/blacklist-desktop.png` })

  await reload(page, '#/guests')
  await page.getByTestId('guest-new').click()
  const form = page.getByRole('dialog', { name: 'Yeni misafir' })
  await form.getByLabel('Ad', { exact: true }).fill('Bambaşka')
  await form.getByRole('textbox', { name: 'Telefon' }).fill('0533 000 00 01')
  await expect(form.getByTestId('guest-form-blacklist')).toContainText('Sorunlu Kişi')
  await expect(form.getByTestId('guest-form-blacklist')).toContainText('telefon eşleşti')
})

test('ekran görüntüleri: misafir kartı, firmalar, kara liste; Türkçe açık ve Rusça koyu (yalnız GUESTS_SHOTS ile)', async ({
  launch
}) => {
  test.skip(!shots, 'screenshots only')
  test.setTimeout(180_000)
  const { page } = await launch()
  await pastStay(page)
  await api(page, 'companies.create', {
    title: 'Zeta Turizm Seyahat Organizasyon Ltd. Şti.',
    address: 'Atatürk Cd. No: 1',
    city: 'İstanbul',
    taxOffice: 'Kadıköy',
    taxNumber: '1234567890',
    iban: 'TR830006200000000012345678',
    contactPerson: 'Ayşe Yılmaz',
    favorite: true
  })
  await api(page, 'blacklist.add', {
    name: 'Viktor Kaminski',
    phone: '+48 600 000 000',
    severity: 'block',
    reasonCode: 'damage',
    reasonText: 'Odaya zarar verdi, hasarı ödemedi'
  })
  const list = (await api<{ rows: { id: string }[] }>(page, 'guests.list', { q: 'gadir' })).body
  await api(page, 'guests.setStandingNote', {
    id: list.rows[0]!.id,
    note: { standingNote: 'Yüksek kat ister, ekstra yastık', standingNoteLevel: 'warn' }
  })
  for (const [lang, theme] of [
    ['tr', 'light'],
    ['ru', 'dark']
  ] as const) {
    await api(page, 'settings.set', { 'ui.language': lang, 'ui.theme': theme })
    await reload(page, '#/guests')
    await page.getByTestId('guest-table').getByRole('button', { name: 'GADİR GADİROV' }).click()
    await expect(page.getByTestId('summary-last-price')).toBeVisible()
    // The sheet slides in: shoot once it has stopped.
    await page.waitForTimeout(800)
    await page.screenshot({ path: `${shots}/guests-card-${lang}-${theme}.png` })
    await reload(page, '#/companies')
    await expect(page.getByTestId('company-list')).toBeVisible()
    await page.screenshot({ path: `${shots}/companies-${lang}-${theme}.png` })
    await reload(page, '#/blacklist')
    await expect(page.getByTestId('blacklist-table')).toBeVisible()
    await page.screenshot({ path: `${shots}/blacklist-${lang}-${theme}.png` })
  }
  await api(page, 'settings.set', { 'ui.language': 'tr', 'ui.theme': 'light' })
})
