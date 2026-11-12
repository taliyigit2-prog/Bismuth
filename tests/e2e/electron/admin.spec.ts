// Faz 4 acceptance in the real app, through the screens (G-12, G-20…G-24): a room type of the hotel's own added
// and given to a room; the role editor taking a screen away from Resepsiyon (menu, address and service all refuse);
// a new role and a copy of a system role, one assigned to an account; the change visible in the audit log with
// its before and after values.
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { api, reload } from '../bridge'
import { OWNER, RECEPTION } from '../setup-draft.mjs'

const go = (page: Page, hash: string) => reload(page, hash)

async function signOut(page: Page): Promise<void> {
  await page.getByTestId('user-menu').click()
  await page.getByTestId('menu-sign-out').click()
  await expect(page.getByTestId('login')).toBeVisible()
}

async function signInWithUsername(page: Page, username: string, password: string): Promise<void> {
  await page.getByTestId('use-username').click()
  await page.getByTestId('username').fill(username)
  await page.getByLabel('Şifre', { exact: true }).fill(password)
  await page.getByTestId('sign-in').click()
}

/** Picks a level in the role editor's matrix row of one permission (label as in Turkish). */
async function setLevel(page: Page, permission: string, level: 'Yok' | 'Görür' | 'Düzenler'): Promise<void> {
  await page.getByRole('combobox', { name: `${permission} yetkisi` }).click()
  await page.getByRole('option', { name: level, exact: true }).click()
}

test('otelin kendi oda tipi eklenir ve yeni odaya verilir', async ({ launch }) => {
  const { page } = await launch()
  await go(page, '#/settings?tab=rooms')
  await page.getByTestId('add-type').click()
  await page.getByTestId('type-name').fill('Bahçe katı aile odası')
  await page.getByTestId('dialog-save').click()
  await expect(page.getByTestId('type-table')).toContainText('Bahçe katı aile odası')

  await page.getByTestId('add-room').click()
  await page.getByTestId('room-number').fill('301')
  await page.getByLabel('Oda tipi').click()
  await page.getByRole('option', { name: 'Bahçe katı aile odası' }).click()
  await page.getByTestId('room-beds').fill('4')
  await page.getByTestId('dialog-save').click()
  await expect(page.getByTestId('room-301')).toContainText('Bahçe katı aile odası')

  const rooms = await api<{ number: string; roomTypeId: string; beds: number }[]>(page, 'rooms.list')
  const types = await api<{ id: string; name: string | null }[]>(page, 'rooms.listTypes')
  const custom = types.body.find((t) => t.name === 'Bahçe katı aile odası')!
  expect(rooms.body.find((r) => r.number === '301')).toMatchObject({ roomTypeId: custom.id, beds: 4 })
})

test('odanın ileri tarihli yatak değişikliği bugünkü kartı değiştirmez; kapasite geçmişinde görünür ve geri alınır', async ({
  launch
}) => {
  const { page } = await launch()
  const rooms = await api<{ id: string; number: string; beds: number }[]>(page, 'rooms.list')
  const room = rooms.body[0]!
  const planned = await api(page, 'rooms.update', {
    id: room.id,
    patch: { beds: room.beds + 1, validFrom: '2099-12-01' }
  })
  expect(planned.status).toBe(200)
  await go(page, '#/settings?tab=rooms')
  const row = page.getByTestId(`room-${room.number}`)
  await expect(page.getByTestId(`planned-${room.number}`)).toContainText(`${room.beds + 1} yatak`)
  await page.getByRole('button', { name: `Odayı düzenle: ${room.number}` }).click()
  await expect(page.getByTestId('room-beds')).toHaveValue(String(room.beds))
  const history = page.getByTestId('capacity-history')
  await expect(history.getByTestId('capacity-2099-12-01')).toContainText('Planlı')
  await history.getByTestId('withdraw-2099-12-01').click()
  await expect(history.getByTestId('capacity-2099-12-01')).toContainText('Geri alındı')
  await page.keyboard.press('Escape')
  await expect(row).toBeVisible()
  await expect(page.getByTestId(`planned-${room.number}`)).toHaveCount(0)
})

test('rol düzenleyici: "Personel kartları: Görür" Resepsiyona ekranı açar, "Yok" menüden, adresten ve servisten kaldırır; değişiklik denetim kaydında önce/sonra görünür', async ({
  launch
}) => {
  test.setTimeout(180_000)
  const { page } = await launch()
  const setReceptionStaff = async (level: 'Yok' | 'Görür') => {
    await go(page, '#/settings?tab=users')
    await page.getByRole('button', { name: /^Resepsiyon/ }).click()
    await setLevel(page, 'Personel kartları', level)
    await expect(page.getByTestId('role-unsaved')).toContainText('kaydedilmedi')
    await page.getByTestId('role-save').click()
    await expect(page.getByTestId('role-unsaved')).toContainText('Değişiklik yok')
  }
  const ownerBack = async () => {
    await signOut(page)
    await page.getByRole('button', { name: /Otel Sahibi/ }).click()
    await page.getByTestId('secret').fill(OWNER.pin)
    await page.getByTestId('sign-in').click()
    await expect(page.getByRole('heading', { level: 1, name: 'Takvim' })).toBeVisible()
  }

  await setReceptionStaff('Görür')
  // The owner reads the change in the audit log: who, what, before and after.
  await go(page, '#/audit')
  await expect(page.getByRole('heading', { level: 1, name: 'Denetim kaydı' })).toBeVisible()
  // The newest row may be the program's own (e.g. next year's holidays generated in the background): find the
  // owner's change of the Resepsiyon role instead of assuming it is first.
  const row = page
    .locator('[data-testid^="audit-row-"]')
    .filter({ hasText: 'Otel Sahibi' })
    .filter({ hasText: 'Resepsiyon' })
    .first()
  await expect(row).toBeVisible()
  await row.click()
  const diff = page.getByTestId('audit-diff')
  await expect(diff).toBeVisible()
  // Read the way the role editor says it: "Yetkiler › Personel kartları", "Yok" → "Görür" (not raw JSON).
  const staff = diff.locator('[data-field="permissions.staff"]')
  await expect(staff).toHaveAttribute('data-changed', 'true')
  await expect(staff).toContainText('Yetkiler')
  await expect(staff).toContainText('Personel kartları')
  await expect(staff).toContainText('Yok')
  await expect(staff).toContainText('Görür')
  await expect(diff).not.toContainText('"staff"')
  await page.keyboard.press('Escape')

  // The receptionist (first sign-in: own password first) sees Personel; salaries stay closed.
  await signOut(page)
  await signInWithUsername(page, RECEPTION.username, RECEPTION.password)
  await page.getByTestId('current-password').fill(RECEPTION.password)
  await page.getByTestId('new-password').fill('deniz-yeni-sifre')
  await page.getByTestId('repeat-password').fill('deniz-yeni-sifre')
  await page.getByTestId('change-password-submit').click()
  await expect(page.getByRole('heading', { level: 1, name: 'Takvim' })).toBeVisible()
  await expect(page.getByTestId('nav-staff')).toBeVisible()
  expect((await api(page, 'staff.listEmployees')).status).toBe(200)
  expect((await api(page, 'staff.setPolicy', { values: { leaveDaysPerMonth: 5 } })).status).toBe(403)

  // "Yok": no Personel in the menu, the address says no access, the service refuses.
  await ownerBack()
  await setReceptionStaff('Yok')
  await signOut(page)
  await signInWithUsername(page, RECEPTION.username, 'deniz-yeni-sifre')
  await expect(page.getByRole('heading', { level: 1, name: 'Takvim' })).toBeVisible()
  await expect(page.getByTestId('nav-staff')).toHaveCount(0)
  await expect(page.getByTestId('nav-audit')).toHaveCount(0)
  await go(page, '#/staff')
  await expect(page.getByText('Bu ekrana yetkiniz yok')).toBeVisible()
  await go(page, '#/audit')
  await expect(page.getByText('Bu ekrana yetkiniz yok')).toBeVisible()
  expect((await api(page, 'staff.listEmployees')).status).toBe(403)
  expect((await api(page, 'audit.list', {})).status).toBe(403)
})

test('yeni rol eklenir ve bir hesaba verilir; sistem rolü kopyalanır', async ({ launch }) => {
  const { page } = await launch()
  await go(page, '#/settings?tab=users')

  await page.getByTestId('role-add').click()
  await page.getByTestId('role-name').fill('Gece resepsiyonu')
  await page.getByTestId('dialog-save').click()
  await expect(page.getByRole('button', { name: /^Gece resepsiyonu/ })).toBeVisible()
  // A new role starts with nothing: the owner opens what it needs.
  await setLevel(page, 'Takvim ve rezervasyonlar', 'Görür')
  await page.getByTestId('role-save').click()
  await expect(page.getByTestId('role-unsaved')).toContainText('Değişiklik yok')

  await page.getByRole('button', { name: /^Resepsiyon/ }).click()
  await page.getByTestId('role-actions').click()
  await page.getByTestId('role-copy').click()
  await expect(page.getByRole('button', { name: /^Resepsiyon \(kopya\)/ })).toBeVisible()

  const roles = await api<
    { id: string; name: string; code: string | null; permissions: Record<string, string> }[]
  >(page, 'roles.list')
  const reception = roles.body.find((r) => r.code === 'reception')!
  const copy = roles.body.find((r) => r.name === 'Resepsiyon (kopya)')!
  expect(copy.code).toBeNull()
  expect(copy.permissions).toEqual(reception.permissions)
  const night = roles.body.find((r) => r.name === 'Gece resepsiyonu')!

  // Give the receptionist's account the new role.
  await page.getByRole('button', { name: `${RECEPTION.displayName} düzenle` }).click()
  await page.getByTestId('user-role').click()
  await page.getByRole('option', { name: 'Gece resepsiyonu' }).click()
  await page.getByTestId('dialog-save').click()
  await expect(page.getByTestId(`user-${RECEPTION.username}`)).toContainText('Gece resepsiyonu')
  const users = await api<{ username: string; roleId: string }[]>(page, 'users.list', {})
  expect(users.body.find((u) => u.username === RECEPTION.username)?.roleId).toBe(night.id)
})

test('1366×768: durum etiketleri tek sütunda, önizleme üstte; liste sekmeleri çizginin üstünde kalır', async ({
  launch
}) => {
  const { page } = await launch()
  await go(page, '#/settings?tab=tags')
  const preview = page.getByText('Takvim önizlemesi', { exact: true })
  const auto = page.getByText('Otomatik durumlar', { exact: true })
  await expect(auto).toBeVisible()
  const [previewBox, autoBox] = [await preview.boundingBox(), await auto.boundingBox()]
  // One column at this width: the preview comes first, the lists get the whole width.
  expect(previewBox!.y).toBeLessThan(autoBox!.y)
  expect(Math.abs(previewBox!.x - autoBox!.x)).toBeLessThan(2)

  await go(page, '#/settings?tab=lists')
  const tabs = page.getByRole('tablist', { name: 'Listeler' })
  await expect(tabs).toBeVisible()
  const below = await tabs.evaluate((list) => {
    const line = list.parentElement!.getBoundingClientRect().bottom
    return [...list.querySelectorAll('[role="tab"]')].filter(
      (tab) => tab.getBoundingClientRect().bottom > line
    ).length
  })
  expect(below).toBe(0)
})

test('kaydedilmemiş rol değişikliğiyle başka bölüme geçerken sorulur', async ({ launch }) => {
  const { page } = await launch()
  await go(page, '#/settings?tab=users')
  await page.getByRole('button', { name: /^Resepsiyon/ }).click()
  await setLevel(page, 'Personel kartları', 'Görür')
  await page.getByTestId('settings-tab-general').click()
  const dialog = page.getByRole('alertdialog', { name: 'Değişiklikler kaydedilmedi' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Vazgeç' }).click()
  await expect(page.getByTestId('role-unsaved')).toContainText('1 değişiklik kaydedilmedi')
  await page.getByTestId('settings-tab-general').click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Kaydetmeden devam et' }).click()
  await expect(page.getByTestId('language-select')).toBeVisible()
  // Nothing was saved.
  const roles = await api<{ code: string | null; permissions: Record<string, string> }[]>(page, 'roles.list')
  expect(roles.body.find((r) => r.code === 'reception')?.permissions['staff']).toBe('none')
})
