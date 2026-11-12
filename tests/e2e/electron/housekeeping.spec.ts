// Faz 9 (P9a) in the real app: an issue reported with a photo that closes its room for sale puts a block on the
// room (calendar), the photo lands in userData/attachments with its sha256 in the database, resolving the issue
// lifts the block; on the status board a room goes dirty → clean with one tap each, and the last change shows
// who and when.
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from './fixtures'
import { api, reload } from '../bridge'

/** 1×1 PNG. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)

interface BoardRoom {
  number: string
  hk: string
  hkByName: string | null
  openIssues: number | null
  block: { kind: string; active: boolean } | null
}
const board = async (page: Parameters<typeof api>[0]) =>
  (await api<{ rooms: BoardRoom[] }>(page, 'housekeeping.board')).body.rooms

test('arıza açılır ve odayı satışa kapatır → takvimde blok; fotoğraf ekler klasöründe; çözülünce blok kalkar', async ({
  launch,
  userData
}) => {
  test.setTimeout(120_000)
  const { page } = await launch()
  await reload(page, '#/issues')
  await page.getByTestId('issue-report').click()
  const dialog = page.getByRole('dialog')
  await dialog.getByTestId('room-picker').click()
  await page.getByRole('option', { name: /^101/ }).click()
  await dialog.getByLabel('Kısa başlık').fill('Tavandan su damlıyor')
  await dialog.getByRole('radio', { name: 'Acil' }).click()
  await dialog
    .locator('input[type=file]')
    .setInputFiles({ name: 'tavan.png', mimeType: 'image/png', buffer: PNG })
  await dialog.getByTestId('issue-blocks').click()
  await dialog.getByRole('button', { name: 'Kaydet' }).click()
  await expect(dialog).toBeHidden()

  const open = page.getByRole('region', { name: /Açık/ })
  await expect(open).toContainText('Tavandan su damlıyor')
  await expect(open).toContainText('Satışa kapalı')
  const r101 = (await board(page)).find((r) => r.number === '101')!
  expect(r101).toMatchObject({ openIssues: 1, block: { kind: 'oos', active: true } })

  // The photo: a file under userData/attachments, its sha256 in the database (K-25).
  const issues = await api<{ id: string; photos: number }[]>(page, 'housekeeping.issues', {})
  const issue = issues.body[0]!
  expect(issue.photos).toBe(1)
  const files = await api<{ id: string }[]>(page, 'attachments.list', {
    entity: 'room_issue',
    entityId: issue.id
  })
  const read = await api<{ dataBase64: string }>(page, 'attachments.read', { id: files.body[0]!.id })
  expect(read.status).toBe(200)
  // The screen shrinks a photo to JPEG before sending (the main process shrinks it again), so look it up by id.
  const dir = join(userData, 'attachments', 'room_issue', String(new Date().getFullYear()))
  const name = readdirSync(dir).find((f) => f.startsWith(files.body[0]!.id))!
  expect(name).toMatch(/\.(jpg|png)$/)
  const stored = readFileSync(join(dir, name))
  expect(createHash('sha256').update(stored).digest('hex')).toBe(
    createHash('sha256').update(Buffer.from(read.body.dataBase64, 'base64')).digest('hex')
  )

  // The room board shows the issue badge and the block.
  await reload(page, '#/rooms')
  await page.getByTestId('plan-room-101').click()
  const sheet = page.getByTestId('room-sheet')
  await expect(sheet.getByTestId('room-issues')).toContainText('Tavandan su damlıyor')
  await expect(sheet.getByTestId('room-block')).toContainText('Satılmaz')
  await page.keyboard.press('Escape')

  // Resolve: the block ends today.
  await reload(page, '#/issues')
  await page.getByRole('button', { name: 'Tavandan su damlıyor' }).click()
  const issueSheet = page.getByTestId('issue-sheet')
  await expect(issueSheet.getByTestId('issue-photo')).toHaveCount(1)
  await issueSheet.getByLabel('Çözüm notu').fill('Tesisatçı boruyu değiştirdi')
  await issueSheet.getByTestId('issue-resolve').click()
  await expect(issueSheet).toBeHidden()
  await expect(page.getByRole('region', { name: /Çözüldü/ })).toContainText('Tavandan su damlıyor')
  expect((await board(page)).find((r) => r.number === '101')).toMatchObject({ openIssues: 0, block: null })
})

test('oda durumu: kirli → temiz tek tıkla; son değiştiren ve saat görünür; bakım bloğu açılıp kalkar', async ({
  launch
}) => {
  test.setTimeout(120_000)
  const { page } = await launch()
  await reload(page, '#/rooms')
  await page.getByTestId('plan-room-202').click()
  const sheet = page.getByTestId('room-sheet')
  await sheet.getByTestId('hk-set-dirty').click()
  await expect(sheet.getByTestId('room-sheet-state')).toHaveText('Kirli')
  await expect(sheet).toContainText('Son değişiklik: Otel Sahibi')
  await page.keyboard.press('Escape')
  await page
    .getByTestId('hk-filter')
    .getByRole('radio', { name: /^Kirli/ })
    .click()
  await expect(page.getByTestId('floor-plan').getByRole('button')).toHaveCount(1)
  await page.getByTestId('plan-room-202').click()
  await sheet.getByTestId('hk-set-clean').click()
  await expect(sheet.getByTestId('room-sheet-state')).toHaveText('Temiz')
  expect((await board(page)).find((r) => r.number === '202')).toMatchObject({
    hk: 'clean',
    hkByName: 'Otel Sahibi'
  })

  // Maintenance closes the room on the calendar; back to clean opens it again.
  await sheet.getByTestId('hk-set-maintenance').click()
  await expect(sheet.getByTestId('room-block')).toContainText('Satılmaz')
  expect((await board(page)).find((r) => r.number === '202')?.block).toMatchObject({
    kind: 'oos',
    active: true
  })
  await sheet.getByTestId('hk-set-clean').click()
  await expect(sheet.getByTestId('room-sheet-state')).toHaveText('Temiz')
  expect((await board(page)).find((r) => r.number === '202')?.block).toBeNull()
})
