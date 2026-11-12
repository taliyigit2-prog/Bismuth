// Faz 9 (P9b) in the real app: a task is created on Görevler and ticked done (who and when recorded); the day shift
// writes a handover on top of the automatic summary, the receptionist signs in and says "Okudum", and the unread
// badge source (`shift.unreadHandovers`) is empty afterwards.
import { expect, test } from './fixtures'
import { api, reload } from '../bridge'
import { OWNER, RECEPTION } from '../setup-draft.mjs'

interface TaskRow {
  id: string
  title: string
  status: string
  doneBy: string | null
  doneByName: string | null
  doneAt: string | null
}

test('görev oluşturulur, tek tıkla yapıldı olur; yapan ve saat kaydedilir', async ({ launch }) => {
  test.setTimeout(120_000)
  const { page } = await launch()
  await reload(page, '#/tasks')
  await page.getByTestId('task-new').click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Başlık').fill('302 klima filtresini temizle')
  await dialog.getByLabel('Saat').fill('23:59')
  await dialog.getByTestId('task-save').click()
  await expect(dialog).toBeHidden()

  const tasks = await api<TaskRow[]>(page, 'tasks.list', { status: ['open'] })
  const made = tasks.body.find((t) => t.title === '302 klima filtresini temizle')!
  const row = page.getByTestId(`task-${made.id}`)
  await expect(row).toBeVisible()
  await row.getByRole('checkbox').click()
  await expect(row).toHaveAttribute('data-status', 'done')
  await expect(row).toContainText('Yapan: Otel Sahibi')
  const done = await api<TaskRow[]>(page, 'tasks.list', { status: ['done'] })
  expect(done.body.find((t) => t.id === made.id)).toMatchObject({
    status: 'done',
    doneByName: OWNER.displayName
  })
})

test('devir yazılır; gelen vardiya (başka kullanıcı) okudum der, okunmamış devir kalmaz', async ({
  launch
}) => {
  test.setTimeout(120_000)
  const { page } = await launch()
  await reload(page, '#/shift')
  const write = page.getByTestId('handover-write')
  await expect(write.getByTestId('handover-auto')).toBeVisible()
  await write.getByLabel('Devir notu').fill('203 geç gelecek, anahtar resepsiyonda.')
  await write.getByTestId('handover-save').click()
  await expect(page.getByTestId('handover-history')).toContainText('203 geç gelecek')
  // The writer does not see their own handover as unread.
  await expect(page.getByTestId('handover-unread')).toContainText('Okunmamış devir yok.')

  // The receptionist signs in (the owner set her password: she changes it first).
  expect(
    (await api(page, 'auth.signIn', { username: RECEPTION.username, secret: RECEPTION.password })).status
  ).toBe(200)
  expect(
    (
      await api(page, 'auth.changePassword', {
        currentPassword: RECEPTION.password,
        newPassword: 'yeni-resepsiyon-sifresi'
      })
    ).status
  ).toBe(200)
  await reload(page, '#/shift')
  const unread = page.getByTestId('handover-unread')
  await expect(unread.getByTestId('handover-text')).toHaveText('203 geç gelecek, anahtar resepsiyonda.')
  await expect(unread).toContainText('Otel Sahibi')
  await unread.getByTestId('handover-read').click()
  await expect(unread).toContainText('Okunmamış devir yok.')
  await expect(page.getByTestId('handover-history')).toContainText(`Okudu: ${RECEPTION.displayName}`)
  const left = await api<unknown[]>(page, 'shift.unreadHandovers')
  expect(left.body).toEqual([])
})
