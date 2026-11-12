// The tourism statistics on the phone (390×844): the KBS file is chosen, spellings are confirmed in a bottom sheet,
// the ministry table is a list with a 44 px copy button per row, nothing widens the page.
import { expect, test } from '@playwright/test'
import { overflowReport } from '../routes'
import { E2E_TOTALS, KBS_FILE_NAME, kbsFile } from '../kbs-file'

test('telefonda KBS listesi yüklenir, onaylanır, liste olarak görünür ve bildirildi işaretlenir', async ({
  page
}) => {
  await page.goto('/#/tourism')
  await page.getByTestId('app-ready').waitFor({ state: 'attached' })
  await expect(page.getByRole('heading', { level: 1, name: 'Turizm istatistiği' })).toBeVisible()
  await page.getByTestId('kbs-file').setInputFiles({
    name: KBS_FILE_NAME,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: await kbsFile()
  })
  await expect(page.getByTestId('tourism-preview')).toContainText(String(E2E_TOTALS.arrivals))

  // A rerun against a reused harness remembers the confirmations: only what is still asked is answered.
  const typo = page.getByTestId('review-TÜRKYİE')
  if (await typo.count()) {
    await typo.getByRole('button', { name: 'Kabul et' }).click()
    await expect(typo).toHaveCount(0)
  }
  const kibris = page.getByTestId('review-KIBRIS')
  if (await kibris.count()) {
    await kibris.getByRole('button', { name: 'KIBRIS için ülke' }).click()
    const sheet = page.getByRole('dialog', { name: 'KIBRIS için ülke' })
    await sheet.getByRole('option', { name: 'Kuzey Kıbrıs Türk Cumhuriyeti' }).click()
    await expect(kibris).toHaveCount(0)
  }

  const result = page.getByTestId('tourism-step-result')
  await expect(result.getByRole('table')).toHaveCount(0)
  const list = result.getByTestId('tourism-table')
  await expect(list).toContainText('Kuzey Kıbrıs Türk Cumhuriyeti')
  const copy = list.getByRole('button', { name: 'Almanya satırını kopyala' })
  const box = await copy.boundingBox()
  expect(box?.height).toBeGreaterThanOrEqual(44)
  expect(box?.width).toBeGreaterThanOrEqual(44)
  await expect(result.getByRole('button', { name: 'Tabloyu kopyala' })).toBeEnabled()

  const mark = page.getByTestId('mark-reported')
  if (await mark.count()) await mark.click()
  await expect(page.getByTestId('tourism-reported')).toContainText('Bildirildi')
  await expect.poll(() => page.evaluate(overflowReport)).toEqual([])
})
