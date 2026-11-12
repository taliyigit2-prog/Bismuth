// Faz 13 kabul "Otel PC kapatılınca Mac'te tüm ekranlar yedek kopyadan salt-okunur açılır, rozet son eşitleme
// saatini gösterir; açılınca canlıya döner" (P13b), on this one machine: the hotel's computer runs server mode; a
// second Bismuth (its own data folder) connects and the owner signs in there — its read-only copy starts by itself
// and follows the main computer live. The main computer stops serving: every screen of the second one opens from
// the copy, the top bar says "Yedek kopya · 14:32", write buttons are gone and a write is refused; even a reload
// (the window starting again) opens from the copy instead of the connection screen. The main computer serves
// again: live at once. Ports: E2E_REPLICA_PORT (default 47475).
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { api, reload } from '../bridge'
import { OWNER } from '../setup-draft.mjs'

const PORT = Number(process.env['E2E_REPLICA_PORT'] ?? 47475)
/** REMOTE_SHOTS=<dir>: screenshots for review. */
const shots = process.env['REMOTE_SHOTS']
const folders: string[] = []
const fresh = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'bismuth-replica-e2e-'))
  folders.push(dir)
  return dir
}
test.afterAll(() => {
  for (const dir of folders.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const go = async (page: Page, hash: string): Promise<void> => {
  await page.evaluate((h) => {
    window.location.hash = h
  }, hash)
}

test('ana bilgisayar kapanınca ekranlar yedek kopyadan salt okunur açılır; açılınca canlıya döner', async ({
  launch
}) => {
  test.setTimeout(300_000)
  const host = await launch({ dir: fresh() })
  expect((await api(host.page, 'settings.set', { 'host.port': PORT })).status).toBe(200)
  await reload(host.page, '#/settings?tab=remote')
  await host.page.getByTestId('remote-mode-server').click()
  await expect(host.page.getByTestId('server-on')).toBeVisible()
  // A guest the copy must carry.
  expect((await api(host.page, 'guests.create', { firstName: 'Kopya', lastName: 'Misafiri' })).status).toBe(
    200
  )

  // The second computer: client mode, connected, the owner signs in.
  const client = await launch({ dir: fresh(), setup: false })
  await client.page.goto(client.page.url().replace(/#.*$/, '#/setup'))
  await client.page.getByTestId('setup-step-body').waitFor()
  await client.page.getByTestId('setup-next').click()
  await client.page.getByTestId('setup-mode-client').click()
  await client.page.getByTestId('setup-next').click()
  await expect(client.page).toHaveURL(/#\/connect/)
  await client.page.getByTestId('connect-address').fill(`127.0.0.1:${PORT}`)
  await client.page.getByTestId('connect-submit').click()
  await expect(client.page).toHaveURL(/#\/login/)
  await client.page.getByTestId('username').fill(OWNER.username)
  await client.page.getByTestId('secret').fill(OWNER.password)
  await client.page.getByTestId('sign-in').click()
  await expect(client.page.getByTestId('connection-badge')).toHaveAttribute('data-status', 'online')

  // The copy starts by itself and follows the main computer live.
  await expect
    .poll(async () => (await api<{ state: string }>(client.page, 'remote.replicaStatus')).body.state, {
      timeout: 30_000
    })
    .toBe('live')
  await reload(client.page, '#/settings?tab=remote')
  await expect(client.page.getByTestId('replica-state')).toHaveAttribute('data-state', 'live')
  if (shots) await client.page.screenshot({ path: `${shots}/client-replica-card.png`, fullPage: true })

  // The main computer stops serving.
  await host.page.getByTestId('remote-mode-single').click()
  await expect(host.page.getByTestId('server-state')).toHaveCount(0)

  // Every screen opens from the copy: badge with the time, the reason, no write buttons, writes refused.
  await go(client.page, '#/guests')
  await expect(client.page.getByTestId('connection-banner')).toHaveAttribute('data-status', 'readonly', {
    timeout: 20_000
  })
  await expect(client.page.getByTestId('connection-badge')).toHaveText(/^Yedek kopya · \d{2}:\d{2}$/)
  await expect(client.page.getByTestId('read-only-reason')).toContainText('yedek kopyadan gösteriliyor')
  await expect(client.page.getByText('Kopya Misafiri').first()).toBeVisible()
  if (shots) await client.page.screenshot({ path: `${shots}/client-readonly-guests.png` })
  await go(client.page, '#/calendar')
  await client.page.getByRole('heading', { level: 1 }).first().waitFor()
  await expect(client.page.getByRole('button', { name: 'Yeni rezervasyon' })).toHaveCount(0)
  const write = await api<{ error: { messageKey: string } }>(client.page, 'guests.create', {
    firstName: 'Yazılmaz',
    lastName: 'Misafir'
  })
  expect(write.status).toBe(409)
  expect(write.body.error.messageKey).toBe('errors.readOnlyCopy')
  await go(client.page, '#/today')
  await client.page.getByRole('heading', { level: 1 }).first().waitFor()
  if (shots) await client.page.screenshot({ path: `${shots}/client-readonly-today.png` })

  // The window starts again while the main computer is away: from the copy, not the connection screen.
  await client.page.reload()
  await client.page.getByTestId('app-ready').waitFor({ state: 'attached' })
  await expect(client.page).not.toHaveURL(/#\/(connect|login)/)
  await expect(client.page.getByTestId('connection-badge')).toHaveAttribute('data-status', 'readonly', {
    timeout: 20_000
  })

  // The main computer serves again: live, writing works again.
  await host.page.getByTestId('remote-mode-server').click()
  await expect(host.page.getByTestId('server-on')).toBeVisible()
  await expect(client.page.getByTestId('connection-banner')).toHaveCount(0, { timeout: 30_000 })
})
