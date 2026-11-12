// Faz 4 sign-in flows in the real app (G-22, G-23, G-144): PIN sign-in from the user cards, lock and unlock,
// the account lock after five wrong passwords, password recovery with a code, and a role the owner narrowed
// losing a screen in the menu and at the service.
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { api } from '../bridge'
import { OWNER, RECEPTION } from '../setup-draft.mjs'

async function signInWithUsername(page: Page, username: string, password: string): Promise<void> {
  await page.getByTestId('use-username').click()
  await page.getByTestId('username').fill(username)
  await page.getByLabel('Şifre', { exact: true }).fill(password)
  await page.getByTestId('sign-in').click()
}

async function signOutFromMenu(page: Page): Promise<void> {
  await page.getByTestId('user-menu').click()
  await page.getByTestId('menu-sign-out').click()
  await expect(page.getByTestId('login')).toBeVisible()
}

test('kişi kartından PIN ile oturum açılır; hesap menüsünde ad ve rol görünür', async ({ launch }) => {
  const { page } = await launch({ signIn: false })
  await expect(page.getByTestId('login')).toBeVisible()
  await page.getByRole('button', { name: /Otel Sahibi/ }).click()
  await expect(page.getByRole('radio', { name: 'PIN' })).toBeChecked()
  await page.getByTestId('secret').fill(OWNER.pin)
  await page.getByTestId('secret').press('Enter')
  await expect(page.getByRole('heading', { level: 1, name: 'Takvim' })).toBeVisible()
  await expect(page.getByTestId('user-menu')).toContainText('Otel Sahibi')
  await expect(page.getByTestId('user-menu')).toContainText('Sahip')
})

test('kilitle ve kilidi aç: menüden ve Ctrl+L ile; yazılan ekrana dönülür', async ({ launch }) => {
  const { page } = await launch()
  await page.getByTestId('nav-guests').click()
  await expect(page.getByRole('heading', { level: 1, name: 'Misafirler' })).toBeVisible()
  await page.getByTestId('user-menu').click()
  await page.getByTestId('menu-lock').click()
  await expect(page.getByTestId('lock')).toBeVisible()
  // Locked: the service refuses the data too, not only the screen.
  const refused = await api<{ error: { messageKey: string } }>(page, 'rooms.list')
  expect(refused.status).toBe(401)
  expect(refused.body.error.messageKey).toBe('errors.locked')
  await page.getByTestId('unlock-secret').fill('1357')
  await page.getByTestId('unlock').click()
  await expect(page.getByTestId('unlock-error')).toContainText('PIN yanlış.')
  // The wrong PIN is gone and the field is ready for the next try.
  await expect(page.getByTestId('unlock-secret')).toHaveValue('')
  await expect(page.getByTestId('unlock-secret')).toBeFocused()
  await page.getByTestId('unlock-secret').fill(OWNER.pin)
  await page.getByTestId('unlock').click()
  await expect(page.getByRole('heading', { level: 1, name: 'Misafirler' })).toBeVisible()

  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+l' : 'Control+l')
  await expect(page.getByTestId('lock')).toBeVisible()
  await page.getByRole('radio', { name: 'Şifre' }).click()
  await page.getByLabel('Şifre', { exact: true }).fill(OWNER.password)
  await page.getByTestId('unlock').click()
  await expect(page.getByRole('heading', { level: 1, name: 'Misafirler' })).toBeVisible()
})

test('beş yanlış şifreden sonra hesap bitiş saatiyle kilitlenir; doğru şifre açmaz, kurtarma kodu açar', async ({
  launch
}) => {
  const { page, recoveryCodes } = await launch({ signIn: false })
  await page.getByTestId('use-username').click()
  await page.getByTestId('username').fill(OWNER.username)
  const password = page.getByLabel('Şifre', { exact: true })
  for (let i = 1; i <= 5; i++) {
    await password.fill(`yanlis-sifre-${i}`)
    await page.getByTestId('sign-in').click()
    if (i < 5) await expect(page.getByTestId('sign-in-error')).toContainText('5 yanlış denemeden sonra')
    await expect(password).toHaveValue('')
    await expect(password).toBeFocused()
  }
  // The service's own answer, with the end of the lock (P4fix #4/#5).
  await expect(page.getByTestId('sign-in-error')).toContainText('hesap kilitli (bitiş:')
  await expect(page.getByTestId('sign-in-error')).not.toContainText('5 yanlış denemeden sonra')
  await password.fill(OWNER.password)
  await page.getByTestId('sign-in').click()
  await expect(page.getByTestId('sign-in-error')).toContainText('hesap kilitli (bitiş:')
  await expect(page.getByTestId('login')).toBeVisible()
  // The way out the message points to: a recovery code opens the locked account at once.
  await page.getByTestId('forgot').click()
  await page.getByLabel('Kullanıcı adı').fill(OWNER.username)
  await page.getByLabel('Kurtarma kodu').fill(recoveryCodes[0]!)
  await page.getByLabel('Yeni şifre', { exact: true }).fill('kilitten-sonra-1')
  await page.getByLabel('Yeni şifre (tekrar)').fill('kilitten-sonra-1')
  await page.getByTestId('recover-submit').click()
  await expect(page.getByTestId('recover-done')).toBeVisible()
  await page.getByTestId('recover-sign-in').click()
  await signInWithUsername(page, OWNER.username, 'kilitten-sonra-1')
  await expect(page.getByRole('heading', { level: 1, name: 'Takvim' })).toBeVisible()
})

test('kilit ekranında beş yanlış deneme pencereyi kapatır, hesabı kilitlemez', async ({ launch }) => {
  const { page } = await launch()
  await page.getByTestId('user-menu').click()
  await page.getByTestId('menu-lock').click()
  await expect(page.getByTestId('lock')).toBeVisible()
  for (let i = 1; i <= 5; i++) {
    await page.getByTestId('unlock-secret').fill(`9${i}75`)
    await page.getByTestId('unlock').click()
    if (i < 5)
      await expect(page.getByTestId('unlock-error')).toContainText('5 yanlış denemeden sonra oturum kapanır')
  }
  await expect(page.getByTestId('locked-out-notice')).toContainText('Hesap kilitli değil')
  await signInWithUsername(page, OWNER.username, OWNER.password)
  await expect(page.getByRole('heading', { level: 1, name: 'Takvim' })).toBeVisible()
})

test('kurtarma koduyla yeni şifre belirlenir ve onunla oturum açılır', async ({ launch }) => {
  const { page, recoveryCodes } = await launch({ signIn: false })
  expect(recoveryCodes.length).toBeGreaterThan(0)
  await page.getByTestId('forgot').click()
  await expect(page.getByTestId('recover')).toBeVisible()
  await expect(page.getByTestId('owner-reset-hint')).toContainText('Ayarlar')
  await page.getByLabel('Kullanıcı adı').fill(OWNER.username)
  await page.getByLabel('Kurtarma kodu').fill(recoveryCodes[0]!.toLowerCase())
  await page.getByLabel('Yeni şifre', { exact: true }).fill('yepyeni-sifre-1')
  await page.getByLabel('Yeni şifre (tekrar)').fill('yepyeni-sifre-1')
  await page.getByTestId('recover-submit').click()
  await expect(page.getByTestId('recover-done')).toBeVisible()
  await page.getByTestId('recover-sign-in').click()
  // The same code works only once.
  const again = await api(page, 'auth.recover', {
    username: OWNER.username,
    code: recoveryCodes[0],
    newPassword: 'baska-sifre-22'
  })
  expect(again.status).toBe(401)
  await signInWithUsername(page, OWNER.username, 'yepyeni-sifre-1')
  await expect(page.getByRole('heading', { level: 1, name: 'Takvim' })).toBeVisible()
})

test('Resepsiyon personeli göremeyince menüden kalkar ve doğrudan çağrı reddedilir; "görür" seçilince geri gelir', async ({
  launch
}) => {
  test.setTimeout(120_000)
  const { page } = await launch()
  const roles = await api<{ id: string; code: string | null }[]>(page, 'roles.list')
  const reception = roles.body.find((r) => r.code === 'reception')!
  const setReception = async (staff: 'none' | 'view') => {
    const res = await api(page, 'roles.update', {
      id: reception.id,
      patch: { permissions: { staff, 'staff.salary': 'none' } }
    })
    expect(res.status).toBe(200)
  }
  await setReception('none')
  await signOutFromMenu(page)

  // The receptionist's first sign-in: the password the owner gave must be changed first.
  await signInWithUsername(page, RECEPTION.username, RECEPTION.password)
  await expect(page.getByTestId('change-password')).toBeVisible()
  await page.getByTestId('current-password').fill(RECEPTION.password)
  await page.getByTestId('new-password').fill('deniz-yeni-sifre')
  await page.getByTestId('repeat-password').fill('deniz-yeni-sifre')
  await page.getByTestId('change-password-submit').click()
  await expect(page.getByRole('heading', { level: 1, name: 'Takvim' })).toBeVisible()
  await expect(page.getByTestId('user-menu')).toContainText('Resepsiyon')
  await expect(page.getByTestId('nav-calendar')).toBeVisible()
  await expect(page.getByTestId('nav-staff')).toHaveCount(0)
  await expect(page.getByTestId('nav-audit')).toHaveCount(0)
  expect((await api(page, 'staff.listEmployees')).status).toBe(403)
  expect((await api(page, 'staff.getPolicy', {})).status).toBe(403)
  expect((await api(page, 'audit.list', {})).status).toBe(403)

  // The owner lets Reception see the staff list (not the salaries).
  await signOutFromMenu(page)
  await page.getByRole('button', { name: /Otel Sahibi/ }).click()
  await page.getByTestId('secret').fill(OWNER.pin)
  await page.getByTestId('sign-in').click()
  await expect(page.getByRole('heading', { level: 1, name: 'Takvim' })).toBeVisible()
  await setReception('view')
  await signOutFromMenu(page)
  await signInWithUsername(page, RECEPTION.username, 'deniz-yeni-sifre')
  await expect(page.getByTestId('nav-staff')).toBeVisible()
  expect((await api(page, 'staff.listEmployees')).status).toBe(200)
  expect((await api(page, 'staff.getPolicy', {})).status).toBe(403)
})
