// P17c (G-195) on the phone (390×844): a long press on a day-list row opens the stay's ten actions as a menu with
// 44 px targets; "Giriş yap" checks the guest in, the other actions open the reservation panel's own dialogs.
import { expect, test } from '@playwright/test'
import { api } from '../bridge'
import { overflowReport } from '../routes'
import { freeRoom, freeRooms, hotelToday, runTag, shiftDay } from '../shared-hotel'

interface Options {
  channels: { id: string }[]
}
interface View {
  reservation: { id: string }
  stays: { id: string; status: string }[]
}

test.describe('telefonda hızlı işlemler', () => {
  test('gün listesinde uzun basma 10 işlemlik menüyü açar; Giriş yap konaklamayı odaya yerleştirir', async ({
    page
  }) => {
    await page.goto('/#/calendar')
    await page.getByTestId('app-ready').waitFor({ state: 'attached' })
    const today = await hotelToday(page)
    const room = await freeRoom(page, today, shiftDay(today, 1))
    const options = await api<Options>(page, 'booking.options')
    const tag = runTag()
    const made = await api<View>(page, 'booking.create', {
      guest: { firstName: `Uzun${tag}`, lastName: 'Basma' },
      channelId: options.body.channels[0]!.id,
      stays: [{ roomId: room.id, checkIn: today, checkOut: shiftDay(today, 1), nightlyPriceMinor: 100_000 }]
    })
    expect(made.status, JSON.stringify(made.body)).toBe(200)
    await page.reload()
    await page.getByTestId('app-ready').waitFor({ state: 'attached' })

    const row = page.getByTestId('day-list').getByRole('button', { name: new RegExp(`Uzun${tag} Basma`) })
    await expect(row).toBeVisible()
    // A touch press held past the long-press time (the menu's own timer), no release.
    const box = (await row.boundingBox())!
    await row.dispatchEvent('pointerdown', {
      pointerType: 'touch',
      isPrimary: true,
      button: 0,
      clientX: box.x + box.width / 2,
      clientY: box.y + box.height / 2
    })
    const items = page.getByRole('menuitem')
    await expect(items).toHaveCount(10)
    // 44 px targets on the phone and no sideways scroll.
    for (const item of await items.all())
      expect((await item.boundingBox())!.height).toBeGreaterThanOrEqual(43.5)
    await expect.poll(() => page.evaluate(overflowReport)).toEqual([])

    await page.getByTestId('ctx-checkIn').click()
    await expect
      .poll(
        async () =>
          (await api<View>(page, 'booking.get', { id: made.body.reservation.id })).body.stays[0]!.status
      )
      .toBe('in_house')
  })

  test('grup paneli: tek ödeme odalara dağılır, oda satırı düğmeleri 44 px ve yatay kaydırma yok', async ({
    page
  }) => {
    await page.goto('/#/calendar')
    await page.getByTestId('app-ready').waitFor({ state: 'attached' })
    const today = await hotelToday(page)
    const rooms = await freeRooms(page, today, shiftDay(today, 1), 2)
    const options = await api<Options>(page, 'booking.options')
    const tag = runTag()
    const made = await api<{ id: string }>(page, 'booking.createGroup', {
      name: `Telefon ödeme ${tag}`,
      leader: { firstName: `Lider${tag}`, lastName: 'Grup' },
      channelId: options.body.channels[0]!.id,
      rooms: rooms.map((r) => ({
        stay: { roomId: r.id, checkIn: today, checkOut: shiftDay(today, 1), nightlyPriceMinor: 100_000 }
      }))
    })
    expect(made.status, JSON.stringify(made.body)).toBe(200)
    await page.reload()
    await page.getByTestId('app-ready').waitFor({ state: 'attached' })
    await page
      .getByTestId('day-list')
      .getByRole('button', { name: new RegExp(`Lider${tag} Grup`) })
      .first()
      .click()
    await page.getByTestId('panel-group').click()
    const panel = page.getByTestId('group-panel')
    await expect(panel.getByTestId('group-balance')).toContainText('2.000')
    for (const button of await panel.getByRole('button', { name: 'Rezervasyonu aç' }).all())
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(43.5)
    await expect.poll(() => page.evaluate(overflowReport)).toEqual([])
    await panel.getByTestId('group-pay-open').click()
    await page.getByTestId('group-pay-save').click()
    await expect
      .poll(async () => {
        const g = await api<{ totals: { balanceMinor: number } }>(page, 'booking.group', { id: made.body.id })
        return g.body.totals.balanceMinor
      })
      .toBe(0)
  })
})
