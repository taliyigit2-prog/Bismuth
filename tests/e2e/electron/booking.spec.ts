// faz-05 kabul ölçütleri in the real app (P5b, reservation panel): a reservation is written through the form, a
// payment turns its night red ("ödendi") at once; a second person without the KBS mark raises the warning sign;
// a name on the blacklist raises the red warning. The tape chart grid itself is P5a's; the panel paints each
// night with the same rule (§6.14), so the colour is checked there.
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { api, reload } from '../bridge'

const shots = process.env['BOOKING_SHOTS']

async function newReservation(page: Page, guest: string): Promise<void> {
  await reload(page, '#/calendar')
  await page.getByRole('button', { name: 'Yeni rezervasyon' }).first().click()
  await page.getByRole('combobox', { name: 'Misafir' }).click()
  await page.getByPlaceholder('Ad ya da telefon…').fill(guest)
  await page.getByText(`Yeni misafir: ${guest}`).click()
}

async function pickRoom(page: Page, number: string): Promise<void> {
  await page.getByTestId('room-multi-picker').click()
  await page.getByTestId(`room-option-${number}`).getByRole('checkbox').click()
  await page.keyboard.press('Escape')
}

test('rezervasyon oluşturulur, ödeme girilince gecenin rengi "ödendi" olur; ikinci kişi KBS işaretsizse uyarı çıkar', async ({
  launch
}) => {
  test.setTimeout(120_000)
  const { page } = await launch()
  await newReservation(page, 'Deniz Yıldırım')
  await pickRoom(page, '101')
  await expect(page.getByTestId('suggested-price')).toContainText('₺')
  if (shots) await page.screenshot({ path: `${shots}/booking-new-desktop.png` })
  await page.getByTestId('new-reservation-save').click()

  const panel = page.getByTestId('reservation-panel')
  await expect(panel.getByTestId('panel-guest')).toHaveText('Deniz Yıldırım')
  await panel.getByRole('tab', { name: 'Geceler' }).click()
  const paint = panel.locator('[data-testid^="paint-"]').first()
  await expect(paint).toHaveAttribute('data-paint', 'unpaid')

  await panel.getByTestId('panel-pay').click()
  await page.getByTestId('payment-save').click()
  await expect(paint).toHaveAttribute('data-paint', 'paid')
  await panel.getByRole('tab', { name: 'Para' }).click()
  await expect(panel.getByTestId('folio-balance')).toContainText('0')
  await expect(panel.getByRole('list', { name: 'Ödemeler' }).getByRole('listitem')).toHaveCount(1)

  // Check in, add a second person without the KBS mark: the warning sign shows; marking clears it.
  await panel.getByTestId('panel-check-in').click()
  await expect(panel.getByTestId('panel-check-out')).toBeVisible()
  await panel.getByRole('tab', { name: /Kişiler/ }).click()
  await panel.getByRole('button', { name: "KBS'ye bildirildi olarak işaretle" }).first().click()
  await expect(panel.getByTestId('panel-kbs-warning')).toHaveCount(0)
  await panel.getByTestId('person-name').fill('Bora Yıldırım')
  await panel.getByRole('button', { name: 'Kişi ekle' }).click()
  await expect(panel.getByTestId('panel-kbs-warning')).toHaveText('KBS eksik: 1')
  await expect(panel.getByTestId('panel-kbs-alert')).toContainText('Bora Yıldırım')
  if (shots) await page.screenshot({ path: `${shots}/booking-panel-kbs-desktop.png` })
  await panel.getByRole('button', { name: "KBS'ye bildirildi olarak işaretle" }).click()
  await expect(panel.getByTestId('panel-kbs-warning')).toHaveCount(0)

  // Check-out asks for the KBS check-out marks: an unticked person is named.
  await panel.getByTestId('panel-check-out').click()
  await expect(page.getByTestId('checkout-kbs-warning')).toContainText('Bora Yıldırım')
  if (shots) await page.screenshot({ path: `${shots}/booking-checkout-desktop.png` })
})

test('kara listedeki ad yazılınca kırmızı uyarı çıkar ve onaysız kaydedilmez', async ({ launch }) => {
  const { page } = await launch()
  // Faz 6: the entry is written through the blacklist's own procedure (as the Kara liste screen does).
  const added = await api(page, 'blacklist.add', {
    name: 'Sorunlu Kişi',
    severity: 'block',
    reasonCode: 'damage',
    reasonText: 'Odaya zarar verdi'
  })
  expect(added.status, JSON.stringify(added.body)).toBe(200)
  await newReservation(page, 'Sorunlu Kişi')
  const warning = page.getByTestId('blacklist-warning')
  await expect(warning).toContainText('Bu kişi kara listede')
  await expect(warning).toContainText('Odaya zarar verdi')
  await pickRoom(page, '102')
  await page.getByTestId('new-reservation-save').click()
  await expect(page.getByTestId('new-reservation-error')).toContainText('Kara liste uyarısını')
  if (shots) await page.screenshot({ path: `${shots}/booking-blacklist-desktop.png` })
  await warning.getByTestId('blacklist-confirm').click()
  await page.getByTestId('new-reservation-save').click()
  await expect(page.getByTestId('reservation-panel').getByTestId('panel-guest')).toHaveText('Sorunlu Kişi')
})

const SHOT_SETUP = {
  tr: { guest: 'Ada Yılmaz', button: 'Yeni rezervasyon', room: '103' },
  ru: { guest: 'Ирина Смирнова', button: 'Новая бронь', room: '201' }
} as const

test('ekran görüntüleri: form, ödeme, özet, geceler, para; Türkçe açık ve Rusça koyu (yalnız BOOKING_SHOTS ile)', async ({
  launch
}) => {
  test.skip(!shots, 'screenshots only')
  test.setTimeout(180_000)
  const { page } = await launch()
  for (const [lang, theme] of [
    ['tr', 'light'],
    ['ru', 'dark']
  ] as const) {
    const { guest, button, room } = SHOT_SETUP[lang]
    await api(page, 'settings.set', { 'ui.language': lang, 'ui.theme': theme })
    await reload(page, '#/calendar')
    await page.getByRole('button', { name: button }).first().click()
    await page.getByRole('combobox').first().click()
    await page.keyboard.type(guest)
    await page.locator('[cmdk-item]').last().click()
    await pickRoom(page, room)
    await page.getByTestId(`price-block-${room}`).scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${shots}/booking-new-price-${lang}-${theme}.png` })
    await page.getByTestId('new-reservation-save').click()
    const panel = page.getByTestId('reservation-panel')
    await panel.getByTestId('panel-pay').click()
    await page.screenshot({ path: `${shots}/booking-payment-${lang}-${theme}.png` })
    await page.getByTestId('payment-save').click()
    await expect(page.getByTestId('payment-save')).toHaveCount(0)
    for (const [i, name] of ['summary', 'nights', 'money'].entries()) {
      await panel.getByRole('tab').nth(i).click()
      await page.screenshot({ path: `${shots}/booking-${name}-${lang}-${theme}.png` })
    }
    await page.keyboard.press('Escape')
  }
})
