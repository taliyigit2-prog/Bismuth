// Faz 16 kabul ölçütü "Ağ tamamen kapalıyken tüm akışlar çalışır" in the real app: the hotel switches "İnternetten
// güncelle" off and starts the program again; every screen opens, a reservation with a payment, an expense and a
// backup are written, the online data is asked for by hand — and the fake internet receives not one request, the
// window loads nothing over http(s).
import { startFakeExternal, type FakeExternal } from '../../factories/fake-external'
import { api, reload } from '../bridge'
import { SCREEN_ROUTES } from '../routes'
import { expect, test } from './fixtures'

let fake: FakeExternal
test.beforeEach(async () => {
  fake = await startFakeExternal({})
})
test.afterEach(async () => {
  await fake.close()
})
test.setTimeout(240_000)

test('ağ kapalıyken bütün ekranlar ve kayıt akışı çalışır; dışarı tek istek gitmez', async ({
  launch,
  userData
}) => {
  const first = await launch({ externalOrigin: fake.origin })
  expect((await api(first.page, 'settings.set', { 'network.enabled': false })).status).toBe(200)
  await first.app.close()

  // From here on the program starts with the network off.
  const before = fake.hits.length
  const { page, requests } = await launch({ dir: userData, externalOrigin: fake.origin })
  for (const route of SCREEN_ROUTES) {
    await reload(page, `#/${route}`)
    await expect(page.getByTestId('crash-screen')).toHaveCount(0)
  }

  const options = await api<{
    today: string
    rooms: { id: string }[]
    channels: { id: string }[]
    methods: { id: string }[]
  }>(page, 'booking.options')
  expect(options.status).toBe(200)
  const { today, rooms, channels, methods } = options.body
  const checkOut = new Date(`${today}T12:00:00Z`)
  checkOut.setUTCDate(checkOut.getUTCDate() + 2)
  const created = await api<{ reservation: { id: string } }>(page, 'booking.create', {
    guest: { firstName: 'Deniz', lastName: 'Örnek' },
    channelId: channels[0]!.id,
    stays: [
      {
        roomId: rooms[0]!.id,
        checkIn: today,
        checkOut: checkOut.toISOString().slice(0, 10),
        nightlyPriceMinor: 250_000
      }
    ]
  })
  expect(created.status, JSON.stringify(created.body)).toBe(200)
  const paid = await api(page, 'ledger.addPayment', {
    reservationId: created.body.reservation.id,
    date: today,
    methodId: methods[0]!.id,
    amountMinor: 500_000,
    currency: 'TRY'
  })
  expect(paid.status, JSON.stringify(paid.body)).toBe(200)
  expect((await api(page, 'backup.run', {})).status).toBe(200)
  for (const name of ['fx.refresh', 'weather.refresh'])
    expect((await api(page, name, {})).status, name).toBe(200)

  await reload(page, '#/ledger')
  await expect(page.getByText('Deniz Örnek').first()).toBeVisible()
  await page.waitForTimeout(1500)
  expect(fake.hits.slice(before)).toEqual([])
  expect(requests.filter((url) => /^(https?|wss?):/.test(url))).toEqual([])
})
