// Security re-review N-2 and N-11 (P4fix) through the server mode's front door, as a phone calls it: the current
// password asked again over the network counts on the remote counter (the desk's is untouched) and five wrong
// ones end that session; unlocking over the network looks at the remote lock.
import { afterEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { auditLog, users } from '../../src/main/db/schema'
import { PASSWORD, hostHarness, phone, type HostHarness } from './host-harness'

let h: HostHarness | null = null
afterEach(() => {
  h?.close()
  h = null
})

const row = (harness: HostHarness, id: string) =>
  harness.handle.db.select().from(users).where(eq(users.id, id)).get()!
const keyOf = (res: { body: unknown }) => (res.body as { error?: { messageKey: string } }).error?.messageKey

describe('ağdan mevcut şifre (N-2)', () => {
  it('ağdan 5 yanlış mevcut şifre uzaktan sayaçta sayılır, oturum düşer; masaüstü sayacı değişmez', async () => {
    h = await hostHarness()
    const id = h.user('ayse', 'reception')
    const p = phone(h.app)
    expect((await p.call('auth.signIn', { username: 'ayse', secret: PASSWORD })).status).toBe(200)
    const tries = [
      () => p.call('auth.changePassword', { currentPassword: 'tahmin-1', newPassword: 'yeni-sifre-123' }),
      () => p.call('auth.setPin', { currentPassword: 'tahmin-2', pin: '4826' }),
      () => p.call('auth.newRecoveryCodes', { currentPassword: 'tahmin-3' }),
      () => p.call('auth.changePassword', { currentPassword: 'tahmin-4', newPassword: 'yeni-sifre-123' })
    ]
    for (const run of tries) expect(keyOf(await run())).toBe('errors.wrongPassword')
    const fifth = await p.call('auth.changePassword', {
      currentPassword: 'tahmin-5',
      newPassword: 'yeni-sifre-123'
    })
    expect(fifth.status).toBe(401)
    // The session is gone: the phone is back at the sign-in screen.
    expect((await p.call('auth.me')).status).toBe(401)
    expect(row(h, id)).toMatchObject({ failedAttempts: 0, lockedUntil: null, remoteFailedAttempts: 5 })
    expect(row(h, id).remoteLockedUntil).not.toBeNull()
    const audits = h.handle.db.select().from(auditLog).where(eq(auditLog.action, 'reauth_failed')).all()
    expect(audits).toHaveLength(5)
    expect(JSON.parse(audits.at(-1)!.afterJson!)).toMatchObject({ remote: true, endedSessions: 1 })
    // The desk is not locked by the phone's guesses.
    expect(
      h.services.auth.login({
        username: 'ayse',
        secret: PASSWORD,
        device: { kind: 'desktop', deviceName: 'Resepsiyon PC' }
      }).userId
    ).toBe(id)
  })

  it('ağdan doğru mevcut şifreyle şifre değişir', async () => {
    h = await hostHarness()
    h.user('ayse', 'reception')
    const p = phone(h.app)
    await p.call('auth.signIn', { username: 'ayse', secret: PASSWORD })
    const res = await p.call('auth.changePassword', {
      currentPassword: PASSWORD,
      newPassword: 'yeni-sifre-123'
    })
    expect(res.status).toBe(200)
  })
})

describe('ağdan kilit açma (N-11)', () => {
  it('uzaktan kilitli hesap ağdan kilit açamaz (doğru şifreyle de); masaüstü kilidi ağı ilgilendirmez', async () => {
    h = await hostHarness()
    const id = h.user('ayse', 'reception')
    const p = phone(h.app)
    expect((await p.call('auth.signIn', { username: 'ayse', secret: PASSWORD })).status).toBe(200)
    expect((await p.call('auth.lock')).status).toBe(200)
    const later = new Date(Date.now() + 15 * 60_000).toISOString()
    h.handle.db.update(users).set({ remoteLockedUntil: later }).where(eq(users.id, id)).run()
    // The lock is told with the right password (QA3d); a wrong one stays "invalid".
    expect(keyOf(await p.call('auth.unlock', { secret: PASSWORD }))).toBe('errors.accountLocked')
    // Only the desk is locked: the phone unlocks.
    h.handle.db
      .update(users)
      .set({ remoteLockedUntil: null, lockedUntil: later })
      .where(eq(users.id, id))
      .run()
    expect((await p.call('auth.unlock', { secret: PASSWORD })).status).toBe(200)
  })
})
