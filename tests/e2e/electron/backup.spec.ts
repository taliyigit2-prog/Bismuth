// Faz 14 acceptance in the real app (G-120…G-122): a manual backup from Settings → Yedek, a later change, the
// restore scheduled from the same screen and applied at the next start (the data comes back, the audit log keeps
// the restore); an export of every table saved as an .xlsx file.
import { mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from './fixtures'
import { api, reload } from '../bridge'

test('elle yedek → geri yükle: yeniden açılışta yedekteki veri gelir, denetim kaydı düşer', async ({
  launch,
  userData
}) => {
  test.setTimeout(180_000)
  const first = await launch()
  const { page } = first
  expect((await api(page, 'settings.set', { 'hotel.name': 'Yedekten Önce Otel' })).status).toBe(200)
  await reload(page, '#/settings?tab=backup')
  await page.getByTestId('backup-run').click()
  await expect(page.getByTestId('backup-item')).toHaveCount(1)
  await expect(page.getByTestId('backup-item').first()).toContainText('Elle')
  expect(
    readdirSync(join(userData, 'backups')).filter((n) => /^bismuth-yedek-.*-elle\.bmy$/.test(n))
  ).toHaveLength(1)

  // A change the restore must undo.
  expect((await api(page, 'settings.set', { 'hotel.name': 'Yedekten Sonra Otel' })).status).toBe(200)
  await page.getByTestId('backup-item').filter({ hasText: 'Elle' }).getByTestId('backup-restore').click()
  await page.getByTestId('restore-confirm').click()
  await expect(page.getByTestId('restore-pending')).toBeVisible()
  // The safety backup of today's data was taken first.
  await expect(page.getByTestId('backup-item').filter({ hasText: 'Geri yükleme öncesi' })).toHaveCount(1)
  await first.app.close()

  const second = await launch(userData)
  const name = await api<Record<string, unknown>>(second.page, 'settings.get')
  expect(name.body['hotel.name']).toBe('Yedekten Önce Otel')
  const audit = await api<{ entries: { entity: string; action: string }[] }>(second.page, 'audit.list', {
    entity: 'backup',
    action: 'restore'
  })
  expect(audit.body.entries.length).toBeGreaterThan(0)
  await reload(second.page, '#/settings?tab=backup')
  await expect(second.page.getByTestId('restore-pending')).toHaveCount(0)
})

test('dışa aktarma: tüm tablolar .xlsx dosyası olarak kaydedilir', async ({ launch, userData }) => {
  const { app, page } = await launch()
  const target = join(userData, 'indirilen')
  mkdirSync(target, { recursive: true })
  // The program's "Save as" dialog is answered by the test: the file goes to a known folder with its own name.
  await app.evaluate(({ dialog }, dir) => {
    dialog.showSaveDialog = (async (...args: unknown[]) => {
      const options = args.at(-1) as { defaultPath?: string }
      const name = (options.defaultPath ?? 'x.xlsx').split(/[\\/]/).pop()!
      return { canceled: false, filePath: `${dir}/${name}` }
    }) as typeof dialog.showSaveDialog
  }, target)
  await reload(page, '#/settings?tab=backup')
  await page.getByTestId('open-export').click()
  await page.getByTestId('export-run').click()
  await expect(page.getByText(/^Dosya hazır: /)).toBeVisible({ timeout: 30_000 })
  const files = readdirSync(target).filter((n) => n.endsWith('.xlsx'))
  expect(files).toHaveLength(1)
  const file = files[0]!
  expect(file).toMatch(/^Bismuth tüm tablolar \d{4}-\d{2}-\d{2}\.xlsx$/)
  expect(readFileSync(join(target, file)).subarray(0, 2).toString('latin1')).toBe('PK')
})

test('içe aktarma: aynı defter dosyası ikinci kez alınmaz; aktarım gerekçeyle iptal edilir (P14fix #2)', async ({
  launch
}) => {
  test.setTimeout(120_000)
  const { page } = await launch()
  const csv = 'Tarih;Ücret;Birim;İsim;Ödeme Yöntemi\n01.10.2026;1.000;TL;Deneme Satış;Nakit\n'
  const file = { name: 'defter-ekim.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8') }
  await reload(page, '#/settings?tab=backup')
  const importOnce = async () => {
    await page.getByTestId('open-import').click()
    await page.getByLabel(/Defter \(günlük satırlar\)/).click()
    await page.getByTestId('import-file').setInputFiles(file)
    await page.getByTestId('import-next').click()
    await page.getByTestId('import-preview').click()
    await expect(page.getByTestId('import-preview-step')).toBeVisible()
  }
  await importOnce()
  await page.getByTestId('import-run').click()
  await expect(page.getByTestId('import-report')).toContainText('1 ödeme')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('import-batch')).toHaveCount(1)

  // The same file again: the line is marked as imported and nothing is left to import.
  await importOnce()
  await expect(page.getByTestId('import-summary')).toContainText('daha önce alınmış')
  await expect(page.getByTestId('import-same-file')).toBeVisible()
  await expect(page.getByTestId('import-run')).toBeDisabled()
  await page.keyboard.press('Escape')

  await page.getByTestId('import-batch-cancel').click()
  await page.getByTestId('import-cancel-reason').fill('Yanlış dosya')
  await page.getByTestId('import-cancel-confirm').click()
  await expect(page.getByTestId('import-batch')).toContainText('İptal edildi: Yanlış dosya')
  const audit = await api<{ entries: unknown[] }>(page, 'audit.list', {
    entity: 'import_batch',
    action: 'void'
  })
  expect(audit.body.entries).toHaveLength(1)
})
