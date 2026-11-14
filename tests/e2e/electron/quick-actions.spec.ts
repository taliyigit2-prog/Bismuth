// P17c (G-195) in the real app: right click → "Giriş yap", the quick reservation bar, a bulk payment on a Ctrl-click
// selection, the group's single-account payment and the room balances of a per-room group.
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { api, reload } from '../bridge'
import { freeRooms, hotelToday, shiftDay } from '../shared-hotel'

interface Options {
  channels: { id: string }[]
  methods: { id: string; code: string }[]
}
interface View {
  reservation: { id: string }
  stays: { id: string; status: string }[]
  folio: { balanceMinor: number | null }
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

test('sağ tık → Giriş yap: bugün gelen konaklama odaya yerleşir; çıkış kapalı görünür', async ({
  launch
}) => {
  test.setTimeout(120_000)
  const { page } = await launch()
  const today = await hotelToday(page)
  const [room] = await freeRooms(page, today, shiftDay(today, 2))
  const made = await book(page, room!.id, 'Sağtık', today, shiftDay(today, 2))
  await reload(page, '#/calendar')
  const bar = page.getByTestId(`stay-${made.stays[0]!.id}`)
  await bar.click({ button: 'right' })
  const menu = page.getByTestId('grid-menu')
  await expect(menu.getByRole('menuitem')).toHaveCount(10)
  await expect(menu.getByTestId('ctx-checkOut')).toHaveAttribute('data-disabled', '')
  await menu.getByTestId('ctx-checkIn').click()
  await expect
    .poll(
      async () => (await api<View>(page, 'booking.get', { id: made.reservation.id })).body.stays[0]!.status
    )
    .toBe('in_house')
  // The menu offers check-out now; it opens the panel's own check-out dialog.
  await bar.click({ button: 'right' })
  await page.getByTestId('ctx-checkOut').click()
  await expect(page.getByTestId('reservation-panel')).toBeVisible()
})

test('hızlı rezervasyon: boş hücreye tıkla, ad yaz, Enter; çubuk takvimde görünür; Ayrıntı tam formu açar', async ({
  launch
}) => {
  test.setTimeout(120_000)
  const { page } = await launch()
  const today = await hotelToday(page)
  const [room] = await freeRooms(page, today, shiftDay(today, 2))
  await reload(page, '#/calendar')
  // The grid scrolls to today once its data is in: click the cell under today's header.
  await expect(page.getByTestId('tape-today')).toBeInViewport()
  const cellOf = async (number: string) => {
    const header = (await page.getByTestId('tape-today').boundingBox())!
    const track = (await page.getByTestId(`tape-track-${number}`).boundingBox())!
    await page.mouse.click(header.x + header.width / 2, track.y + track.height / 2)
  }
  await cellOf(room!.number)
  const bar = page.getByTestId('quick-book')
  await expect(bar).toBeVisible()
  await bar.getByTestId('quick-name').fill('Hızlı Misafir')
  await bar.getByTestId('quick-nights').fill('2')
  // The suggested price for two nights arrives before the form can be saved.
  await expect(bar.getByRole('textbox', { name: 'Gecelik fiyat' })).not.toHaveValue('')
  await page.keyboard.press('Enter')
  await expect(
    page.getByTestId('tape-chart').getByRole('button', { name: /^Hızlı Misafir, oda/ })
  ).toBeVisible()
  await expect(bar).toHaveCount(0)

  // "Ayrıntı" hands another cell to the full form.
  const [other] = await freeRooms(page, today, shiftDay(today, 1), 1, [room!.id])
  await cellOf(other!.number)
  await page.getByTestId('quick-detail').click()
  await expect(page.getByRole('dialog', { name: 'Yeni rezervasyon' })).toBeVisible()
})

test('menü tuşu ve boşluk: Shift+F10 hücre menüsünü açar, Boşluk konaklamayı seçer, Esc temizler', async ({
  launch
}) => {
  test.setTimeout(120_000)
  const { page } = await launch()
  const today = await hotelToday(page)
  const [room] = await freeRooms(page, today, shiftDay(today, 2))
  const made = await book(page, room!.id, 'Klavye', today, shiftDay(today, 2))
  await reload(page, '#/calendar')
  const chart = page.getByTestId('tape-chart')
  await chart.focus()
  // Move the cursor to the booked room's row (the grid opens with the cursor on the first room, today).
  const row = await page.evaluate((number) => {
    const rows = [...document.querySelectorAll('[data-testid^="tape-row-"]')]
    return rows.findIndex((r) => r.getAttribute('data-testid') === `tape-row-${number}`)
  }, room!.number)
  for (let i = 0; i < row; i++) await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Shift+F10')
  await expect(page.getByTestId('grid-menu').getByTestId('ctx-title')).toContainText('Klavye')
  await page.keyboard.press('Escape')
  await chart.focus()
  await page.keyboard.press('Space')
  await expect(page.getByTestId('selection-bar')).toBeVisible()
  await expect(page.getByTestId(`stay-${made.stays[0]!.id}`)).toHaveAttribute('data-selected', '')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('selection-bar')).toHaveCount(0)
})

// Ctrl+click is the context menu on macOS; the multi-select key there is Cmd (the grid reads ctrl or meta).
const MULTI_KEY = process.platform === 'darwin' ? 'Meta' : 'Control'

test('Ctrl ile iki konaklama seç: toplu ödeme her rezervasyonun bakiyesini kapatır', async ({ launch }) => {
  test.setTimeout(120_000)
  const { page } = await launch()
  const today = await hotelToday(page)
  const rooms = await freeRooms(page, today, shiftDay(today, 2), 2)
  const a = await book(page, rooms[0]!.id, 'Birinci', today, shiftDay(today, 2))
  const b = await book(page, rooms[1]!.id, 'İkinci', today, shiftDay(today, 2))
  await reload(page, '#/calendar')
  await page.getByTestId(`stay-${a.stays[0]!.id}`).click({ modifiers: [MULTI_KEY] })
  await page.getByTestId(`stay-${b.stays[0]!.id}`).click({ modifiers: [MULTI_KEY] })
  const bulk = page.getByTestId('selection-bar')
  await expect(bulk.getByTestId('selection-count')).toContainText('2')
  await bulk.getByTestId('bulk-pay').click()
  const list = page.getByTestId('bulk-pay-list')
  await expect(list).toContainText('Birinci')
  await expect(list).toContainText('İkinci')
  await expect(page.getByTestId('bulk-pay-total')).toContainText('4.000')
  await page.getByTestId('bulk-pay-save').click()
  await expect(bulk).toHaveCount(0)
  for (const view of [a, b])
    await expect
      .poll(
        async () =>
          (await api<View>(page, 'booking.get', { id: view.reservation.id })).body.folio.balanceMinor
      )
      .toBe(0)
})

test('grup tek hesap: panelden tek ödeme odalara dağılır; oda başına kipte her odanın bakiyesi ayrı görünür', async ({
  launch
}) => {
  test.setTimeout(150_000)
  const { page } = await launch()
  const today = await hotelToday(page)
  const options = await api<Options>(page, 'booking.options')
  const make = async (name: string, rooms: { id: string }[]) =>
    api<{ id: string; rooms: { reservationId: string }[] }>(page, 'booking.createGroup', {
      name,
      leader: { firstName: 'Grup', lastName: 'Lideri' },
      channelId: options.body.channels[0]!.id,
      rooms: rooms.map((r) => ({
        stay: { roomId: r.id, checkIn: today, checkOut: shiftDay(today, 2), nightlyPriceMinor: 100_000 }
      }))
    })
  const rooms = await freeRooms(page, today, shiftDay(today, 2), 4)
  const single = await make('Tek hesap grubu', rooms.slice(0, 2))
  expect(single.status, JSON.stringify(single.body)).toBe(200)
  await api(page, 'settings.set', { 'booking.groupFolioMode': 'per_room' })
  const perRoom = await make('Oda başına grup', rooms.slice(2, 4))
  expect(perRoom.status, JSON.stringify(perRoom.body)).toBe(200)

  await reload(page, '#/calendar')
  // Single account: the leader pays once, the amount is spread over the rooms.
  await page.locator('[data-group]').first().click()
  await page.getByTestId('panel-group').click()
  const panel = page.getByTestId('group-panel')
  await expect(panel.getByTestId('group-balance')).toContainText('4.000')
  await panel.getByTestId('group-pay-open').click()
  await page.getByTestId('group-pay-save').click()
  await expect(panel.getByTestId('group-balance')).toContainText('0')
  await expect(panel.getByTestId('group-pay-open')).toHaveCount(0)
  await expect
    .poll(async () => {
      const g = await api<{ totals: { balanceMinor: number } }>(page, 'booking.group', { id: single.body.id })
      return g.body.totals.balanceMinor
    })
    .toBe(0)
  await page.keyboard.press('Escape')

  // A folio per room: each room shows its own balance and a pay button; no group payment.
  await reload(page, '#/calendar')
  const view = await api<{ rooms: { reservationId: string }[] }>(page, 'booking.group', {
    id: perRoom.body.id
  })
  const reservationId = view.body.rooms[0]!.reservationId
  const second = await api<View>(page, 'booking.get', { id: reservationId })
  await page.getByTestId(`stay-${second.body.stays[0]!.id}`).click()
  await page.getByTestId('panel-group').click()
  const roomPanel = page.getByTestId('group-panel')
  await expect(roomPanel.getByTestId(`group-room-balance-${reservationId}`)).toContainText('2.000')
  await expect(roomPanel.getByTestId('group-pay-open')).toHaveCount(0)
  await roomPanel.getByTestId(`group-room-pay-${reservationId}`).click()
  await expect(page.getByTestId('payment-save')).toBeVisible()
})
