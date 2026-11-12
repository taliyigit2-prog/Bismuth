// Faz 10 madde 10 in the real app: a synthetic KBS file is chosen, the typo and "KIBRIS" are confirmed, the ministry
// table appears in the panel's order and is copied, the month is marked "bildirildi" and shows in the history.
// Identity columns of the file never reach the screen.
import { expect, test } from './fixtures'
import { api, reload } from '../bridge'
import { E2E_IDENTITY, E2E_STAYS, E2E_TOTALS, KBS_FILE_NAME, kbsFile } from '../kbs-file'

test('KBS listesi yüklenir, uyruklar onaylanır, tablo kopyalanır ve bildirildi işaretlenir', async ({
  launch
}) => {
  test.setTimeout(120_000)
  const { app, page } = await launch()
  await reload(page, '#/tourism')
  await expect(page.getByRole('heading', { level: 1, name: 'Turizm istatistiği' })).toBeVisible()
  await expect(page.getByText('Bu ay için dosya seçilmedi')).toBeVisible()

  await page.getByTestId('kbs-file').setInputFiles({
    name: KBS_FILE_NAME,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: await kbsFile()
  })
  const preview = page.getByTestId('tourism-preview')
  await expect(preview).toContainText(String(E2E_TOTALS.arrivals))
  await expect(page.getByTestId('tourism-file')).toContainText(KBS_FILE_NAME)
  await expect(page.getByTestId('tourism-in-house')).toContainText('Oda 203')

  // Copy waits for the two spellings.
  const result = page.getByTestId('tourism-step-result')
  await expect(result.getByRole('button', { name: 'Tabloyu kopyala' })).toBeDisabled()
  await page.getByTestId('review-TÜRKYİE').getByRole('button', { name: 'Kabul et' }).click()
  await expect(page.getByTestId('review-TÜRKYİE')).toHaveCount(0)
  await page.getByTestId('review-KIBRIS').getByRole('button', { name: 'KIBRIS için ülke' }).click()
  await page.getByRole('option', { name: 'Kuzey Kıbrıs Türk Cumhuriyeti' }).click()
  await expect(page.getByTestId('review-KIBRIS')).toHaveCount(0)
  await expect(page.getByTestId('tourism-step-review')).toContainText('Bütün uyruklar tanındı.')

  const table = page.getByTestId('tourism-table')
  await expect(table.getByRole('row').nth(1)).toContainText('Türkiye')
  await expect(table).toContainText('Almanya')
  await expect(table).toContainText('Kuzey Kıbrıs Türk Cumhuriyeti')
  await expect(page.getByTestId('tourism-facts')).toContainText(String(E2E_TOTALS.nights))
  for (const v of Object.values(E2E_IDENTITY)) await expect(page.locator('body')).not.toContainText(v)

  await result.getByRole('button', { name: 'Tabloyu kopyala' }).click()
  await expect(result.getByRole('button', { name: 'Kopyalandı' })).toBeVisible()
  const copied = await app.evaluate(({ clipboard }) => clipboard.readText())
  expect(copied).toBe('Türkiye\t5\t8\nAlmanya\t2\t6\nKuzey Kıbrıs Türk Cumhuriyeti\t2\t2')
  await table.getByRole('button', { name: 'Almanya satırını kopyala' }).click()
  await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.readText())).toBe('Almanya\t2\t6')

  await page.getByTestId('mark-reported').click()
  await expect(page.getByTestId('tourism-reported')).toContainText('Bildirildi')
  await expect(page.getByTestId('tourism-history').getByTestId('history-row')).toContainText('bildirildi')
  const imports = await api<{ reportedAt: string | null }[]>(page, 'tourism.listImports')
  expect(imports.body[0]?.reportedAt).toBeTruthy()

  // The confirmation is remembered: the same file again needs nobody.
  await page.getByTestId('kbs-file').setInputFiles({
    name: KBS_FILE_NAME,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: await kbsFile()
  })
  await expect(page.getByTestId('tourism-history').getByTestId('history-row')).toHaveCount(2)
  await expect(page.getByTestId('tourism-step-review')).toContainText('Bütün uyruklar tanındı.')
  // The month stays reported with the newer file (P10fix #10).
  await expect(page.getByTestId('tourism-reported')).toContainText('Bildirildi')
})

test('uyruğu boş KBS satırı satır bazında ülkeye atanır; atanınca tablo kopyalanır (P10fix #4)', async ({
  launch
}) => {
  test.setTimeout(120_000)
  const { app, page } = await launch()
  await reload(page, '#/tourism')
  const blank = { arrival: '2026-09-21', departure: '2026-09-22', room: '103', nationality: '-' }
  await page.getByTestId('kbs-file').setInputFiles({
    name: KBS_FILE_NAME,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: await kbsFile([...E2E_STAYS, blank])
  })
  await expect(page.getByTestId('tourism-preview')).toContainText(String(E2E_TOTALS.arrivals + 1))
  await page.getByTestId('review-TÜRKYİE').getByRole('button', { name: 'Kabul et' }).click()
  await expect(page.getByTestId('review-TÜRKYİE')).toHaveCount(0)
  await page.getByTestId('review-KIBRIS').getByRole('button', { name: 'KIBRIS için ülke' }).click()
  await page.getByRole('option', { name: 'Kuzey Kıbrıs Türk Cumhuriyeti' }).click()
  await expect(page.getByTestId('review-KIBRIS')).toHaveCount(0)

  // The blank row is not a spelling: it waits in its own list and keeps the copy closed.
  const result = page.getByTestId('tourism-step-result')
  const blankList = page.getByTestId('tourism-blank')
  await expect(blankList.getByTestId('blank-row')).toContainText('Oda 103')
  await expect(blankList).toContainText('Uyruk eksik')
  await expect(result.getByRole('button', { name: 'Tabloyu kopyala' })).toBeDisabled()
  await blankList.getByTestId('blank-picker').click()
  await page.getByPlaceholder(/Ülke adı yazın/).fill('Türkiye')
  await page.getByRole('option', { name: 'Türkiye', exact: true }).click()
  await expect(blankList).toContainText('Türkiye')
  await expect(result.getByRole('button', { name: 'Tabloyu kopyala' })).toBeEnabled()
  await result.getByRole('button', { name: 'Tabloyu kopyala' }).click()
  await expect
    .poll(() => app.evaluate(({ clipboard }) => clipboard.readText()))
    .toBe('Türkiye\t6\t9\nAlmanya\t2\t6\nKuzey Kıbrıs Türk Cumhuriyeti\t2\t2')
})
