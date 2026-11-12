// Faz 11: the Döviz screen with a fake internet (tests never reach the real one). The app fetches market rates and
// the weather from the fake server, then "İnternetten güncelle" is switched off: the screen keeps converting with
// the last rates, the weather tab keeps the last forecast, and not one more request leaves the program.
import {
  GOOGLE_ICS,
  GOOGLE_ICS_PATH,
  MET_PATH,
  TRUNCGIL_PATH,
  metCompact,
  startFakeExternal,
  truncgil,
  type FakeExternal
} from '../../factories/fake-external'
import { api, reload } from '../bridge'
import { expect, test } from './fixtures'

let fake: FakeExternal
test.beforeEach(async () => {
  const hour = new Date()
  hour.setUTCMinutes(0, 0, 0)
  fake = await startFakeExternal({
    [TRUNCGIL_PATH]: { body: truncgil() },
    [MET_PATH]: {
      body: metCompact(hour.toISOString().replace('.000Z', 'Z')),
      headers: { expires: new Date(Date.now() + 3_600_000).toUTCString() }
    },
    [GOOGLE_ICS_PATH]: { body: GOOGLE_ICS, headers: { 'content-type': 'text/calendar' } }
  })
})
test.afterEach(async () => {
  await fake.close()
})

test('Döviz sekmesi: kurlar ve hava sahte sunucudan gelir; ağ kapatılınca son kurla çevirir, istek çıkmaz', async ({
  launch
}) => {
  const { page } = await launch({ externalOrigin: fake.origin })
  // The timer fetches right after setup; wait until the rates are stored.
  await expect
    .poll(
      async () =>
        (await api<{ rates: { marketMicro: number | null }[] }>(page, 'fx.overview')).body.rates.filter(
          (r) => r.marketMicro !== null
        ).length,
      { timeout: 20_000 }
    )
    .toBe(4)
  await reload(page, '#/currency')
  const usd = page.getByTestId('rate-USD')
  await expect(usd).toContainText('49,1260')
  await expect(usd).toContainText('Truncgil')
  // 2.500 TL → USD at 49,126; the converter shows cents unless a rounding is chosen.
  await page.getByRole('combobox', { name: 'Hangi birime' }).click()
  await page.getByRole('option', { name: 'USD' }).click()
  await expect(page.getByTestId('fx-result')).toContainText('$50,89')

  await page.getByRole('switch', { name: 'İnternetten güncelle' }).click()
  await expect(page.getByTestId('fx-offline')).toContainText('son bilinen kurlar')
  const hitsWhenOff = fake.hits.length
  await expect(page.getByRole('button', { name: 'Şimdi güncelle' })).toBeDisabled()

  // A restart with the network off: last rates, no request at all.
  await reload(page, '#/currency')
  await expect(page.getByTestId('fx-offline')).toBeVisible()
  const amount = page.getByLabel('Tutar')
  await amount.fill('5.000')
  await expect(page.getByTestId('fx-result')).toContainText('$101,78')
  await page.getByRole('tab', { name: 'Hava durumu' }).click()
  await expect(page.getByTestId('weather-offline')).toBeVisible()
  await expect(page.getByTestId('weather-now')).toBeVisible()
  await expect(page.getByTestId('weather-attribution')).toHaveText('Veri: MET Norway · Simgeler: Yr/NRK')
  await page.waitForTimeout(1500)
  expect(fake.hits.length).toBe(hitsWhenOff)
  expect(fake.hits.some((h) => h.startsWith('api.met.no/weatherapi/locationforecast/2.0/compact?lat='))).toBe(
    true
  )
})

test('Bugün ekranında hava kartı son tahminle görünür', async ({ launch }) => {
  const { page } = await launch({ externalOrigin: fake.origin })
  await expect
    .poll(async () => (await api<{ forecast: unknown }>(page, 'weather.get')).body.forecast !== null, {
      timeout: 20_000
    })
    .toBe(true)
  await reload(page, '#/today')
  const card = page.getByTestId('weather-card')
  await expect(card).toBeVisible()
  await expect(card.getByTestId('weather-days').getByRole('listitem')).toHaveCount(7)
})
