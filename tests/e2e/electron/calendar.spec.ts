// Reservation grid (faz-05 madde 1, 5–9) on the real app with a seeded data folder: opens on the calendar, today,
// a picked date, guest search, free rooms, legend, the day's notes and the keyboard.
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { expect, test } from './fixtures'

const root = resolve(__dirname, '../../..')

/** Sets the data folder up with the e2e hotel and a few stays around today (tests/e2e/seed-calendar.ts). */
function seed(dir: string): void {
  execFileSync('npx', ['tsx', '--tsconfig', 'tsconfig.node.json', 'tests/e2e/seed-calendar.ts', dir], {
    cwd: root,
    stdio: 'inherit'
  })
}

const localToday = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

test('program takvimle açılır: bugün işaretli, konaklamalar, blok, lejant ve gün notu görünür', async ({
  launch,
  userData
}) => {
  seed(userData)
  const { page } = await launch(userData)
  await expect(page).toHaveURL(/#\/calendar/)
  const chart = page.getByTestId('tape-chart')
  await expect(chart.getByTestId('tape-today')).toBeVisible()
  await expect(chart.getByRole('button', { name: /^Ayşe Kılıç, oda 101/ })).toBeVisible()
  await expect(chart.getByRole('button', { name: /^Ayşe Kılıç, oda 101.*KBS/ })).toBeVisible()
  await expect(chart.getByRole('button', { name: 'Satılmaz: Sahibin misafiri' })).toBeVisible()
  // A day-use and a night in room 103 on the same day: both bars, side by side in one cell.
  const dayUse = await chart.getByRole('button', { name: /^Gündüz Konuk, oda 103/ }).boundingBox()
  const night = await chart.getByRole('button', { name: /^Elif Aydın, oda 103/ }).boundingBox()
  expect(dayUse && night && dayUse.x + dayUse.width <= night.x + 1).toBe(true)
  const legend = page.getByRole('region', { name: 'Lejant' })
  for (const name of ['Ödendi', 'Ödenmedi', 'Geçmiş tarih, boş', 'Satılmaz'])
    await expect(legend.getByText(name, { exact: true })).toBeVisible()
  await expect(page.getByText('Bu gece 4/6 oda dolu')).toBeVisible()
})

test('gezinme: tarihe git, sonraki hafta, bugüne dön; ay ve yıl seçimi', async ({ launch, userData }) => {
  seed(userData)
  const { page } = await launch(userData)
  const chart = page.getByTestId('tape-chart')
  await expect(chart.getByTestId('tape-today')).toBeVisible()
  const year = Number(localToday().slice(0, 4)) + 3
  await page.getByRole('combobox', { name: 'Yıl' }).click()
  await page.getByRole('option', { name: String(year) }).click()
  await page.getByRole('combobox', { name: 'Ay' }).click()
  await page.getByRole('option', { name: 'Mart' }).click()
  await expect(chart.getByTestId(`tape-day-${year}-03-01`)).toBeInViewport()
  await expect(chart.getByTestId('tape-today')).toHaveCount(0)
  await page.getByRole('button', { name: 'Sonraki hafta' }).click()
  await expect(chart.getByTestId(`tape-day-${year}-03-08`)).toBeInViewport()
  await page.getByRole('button', { name: 'Tarihe git' }).click()
  await page.getByRole('button', { name: 'Sonraki ay' }).click()
  await page.getByRole('gridcell', { name: new RegExp(`^15 Nisan ${year}`) }).click()
  await expect(chart.getByTestId(`tape-day-${year}-04-15`)).toBeInViewport()
  await page.getByRole('button', { name: 'Bugün', exact: true }).click()
  await expect(chart.getByTestId('tape-today')).toBeInViewport()
})

test('misafir ara sonuca atlar; boş oda bul uygun odaları işaretler', async ({ launch, userData }) => {
  seed(userData)
  const { page } = await launch(userData)
  await page.getByRole('button', { name: 'Misafir ara' }).click()
  await page.getByPlaceholder('Ad, telefon ya da rezervasyon kodu').fill('petrov')
  await page.getByRole('option', { name: /Ivan Petrov/ }).click()
  await expect(page.getByTestId('grid-announce')).toHaveText(/^Oda 202, .*: Ivan Petrov/)

  await page.getByRole('button', { name: 'Boş oda bul' }).click()
  const dialog = page.getByRole('dialog', { name: 'Boş oda bul' })
  await dialog.getByRole('button', { name: 'Odaları bul' }).click()
  // Tonight: 101, 102, 103 and 202 are taken; the block on 201 starts the day after tomorrow.
  await expect(page.getByTestId('free-banner')).toContainText('2 boş oda işaretlendi')
  await expect(page.getByTestId('tape-row-201').getByLabel('Uygun')).toBeVisible()
  await expect(page.getByTestId('tape-row-203').getByLabel('Uygun')).toBeVisible()
  await expect(page.getByTestId('tape-row-101').getByLabel('Uygun')).toHaveCount(0)
  await page.getByRole('button', { name: 'İşareti kaldır' }).click()
  await expect(page.getByTestId('free-banner')).toHaveCount(0)
})

test('gün başlığından not eklenir; klavye: oklar gezer, N yeni rezervasyon açar', async ({
  launch,
  userData
}) => {
  seed(userData)
  const { page } = await launch(userData)
  const chart = page.getByTestId('tape-chart')
  await chart.getByTestId('tape-today').click()
  const day = page.getByRole('dialog')
  await expect(day.getByText('Bu günde not yok.')).toBeVisible()
  await day.getByLabel('Başlık').fill('Grup gelişi')
  await day.getByLabel('Başlık').press('Enter')
  await expect(day.getByText('Grup gelişi')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(chart.getByTestId('tape-today')).toHaveAccessibleName(/: Grup gelişi$/)

  await chart.focus()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByTestId('grid-announce')).toHaveText(/^Oda 102, .*: Mehmet Demir/)
  await expect(page.getByTestId('grid-cursor')).toBeVisible()
  // N on a cell opens the quick reservation bar (P17c); "Ayrıntı" hands the cell to the full form.
  await page.keyboard.press('n')
  await expect(page.getByTestId('quick-book')).toBeVisible()
  await page.getByTestId('quick-detail').click()
  await expect(page.getByRole('dialog', { name: 'Yeni rezervasyon' })).toBeVisible()
})
