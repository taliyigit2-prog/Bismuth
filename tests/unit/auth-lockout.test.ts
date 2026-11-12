// Sign-in lock, PIN pause, recovery code and forced password change as the desk sees them (Faz 4 bug hunt P4fix
// #4, #5, #6, #9): what the service does is what the screens say.
import { describe, expect, it } from 'vitest'
import { and, eq, isNull } from 'drizzle-orm'
import { auditLog, recoveryCodes, users } from '../../src/main/db/schema'
import { errorOf, makeHarness, setUp, type Harness } from '../factories/desk'

const userRow = (h: Harness, username: string) =>
  h.handle.db.select().from(users).where(eq(users.username, username)).get()!

describe('hesap kilidi (#4, #5)', () => {
  it('5. yanlış şifre hesabı kilitler ve bitiş saatini söyler; kilitte doğru şifre de "kilitli" der', async () => {
    const h = await makeHarness()
    await setUp(h)
    await h.call('auth.signOut')
    const keys: string[] = []
    for (let i = 0; i < 5; i++)
      keys.push(errorOf(await h.call('auth.signIn', { username: 'sahip', secret: `yanlis-${i}` })).messageKey)
    expect(keys).toEqual([...Array(4).fill('errors.invalidCredentials'), 'errors.accountLocked'])
    const right = await h.call('auth.signIn', { username: 'sahip', secret: 'cok-gizli-sifre' })
    expect(right.status).toBe(401)
    expect(errorOf(right)).toMatchObject({
      messageKey: 'errors.accountLocked',
      details: { until: '2026-10-05T09:15:00.000Z' }
    })
  })

  it('kilitli hesapta geçerli kurtarma kodu yeni şifre belirletir; yanlış kod "kod yanlış" der', async () => {
    const h = await makeHarness()
    const { codes } = await setUp(h)
    await h.call('auth.signOut')
    for (let i = 0; i < 5; i++) await h.call('auth.signIn', { username: 'sahip', secret: `yanlis-${i}` })
    expect(userRow(h, 'sahip').lockedUntil).not.toBeNull()
    const wrong = await h.call('auth.recover', {
      username: 'sahip',
      code: 'AAAA-BBBB-CCCC-DDDD',
      newPassword: 'yepyeni-sifre-1'
    })
    expect(errorOf(wrong).messageKey).toBe('errors.invalidCredentials')
    const ok = await h.call('auth.recover', {
      username: 'sahip',
      code: codes[0],
      newPassword: 'yepyeni-sifre-1'
    })
    expect(ok.status).toBe(200)
    expect(userRow(h, 'sahip')).toMatchObject({ failedAttempts: 0, lockedUntil: null })
    expect((await h.call('auth.signIn', { username: 'sahip', secret: 'yepyeni-sifre-1' })).status).toBe(200)
  })

  it('kilit bitince sayaç sıfırdan başlar: tek yanlış yeniden kilitlemez, doğru şifre çalışır', async () => {
    const h = await makeHarness()
    await setUp(h)
    await h.call('auth.signOut')
    for (let i = 0; i < 5; i++) await h.call('auth.signIn', { username: 'sahip', secret: `yanlis-${i}` })
    h.clock.advance(16)
    const once = await h.call('auth.signIn', { username: 'sahip', secret: 'bir-yanlis-daha' })
    expect(errorOf(once).messageKey).toBe('errors.invalidCredentials')
    expect(userRow(h, 'sahip')).toMatchObject({ failedAttempts: 1, lockedUntil: null })
    expect((await h.call('auth.signIn', { username: 'sahip', secret: 'cok-gizli-sifre' })).status).toBe(200)
  })

  it('PIN: 5 yanlış PIN hesabı kilitlemez; 6. deneme "PIN duraklatıldı" der, şifre hemen çalışır', async () => {
    const h = await makeHarness()
    await setUp(h)
    await h.call('auth.signOut')
    const owner = h.services.users.signInList('ipc').find((u) => u.displayName === 'Otel Sahibi')!
    for (let i = 0; i < 5; i++) {
      const r = await h.call('auth.signInWithPin', { userId: owner.id, pin: `135${i}` })
      expect(errorOf(r).messageKey).toBe('errors.invalidCredentials')
    }
    const sixth = await h.call('auth.signInWithPin', { userId: owner.id, pin: '2468' })
    expect(errorOf(sixth).messageKey).toBe('errors.pinPaused')
    expect(userRow(h, 'sahip').lockedUntil).toBeNull()
    expect((await h.call('auth.signIn', { userId: owner.id, secret: 'cok-gizli-sifre' })).status).toBe(200)
  })

  it('kilit ekranı: 5 yanlış deneme pencereyi kapatır, hesabı kilitlemez', async () => {
    const h = await makeHarness()
    await setUp(h)
    await h.call('auth.lock')
    const last = []
    for (let i = 0; i < 5; i++)
      last.push(errorOf(await h.call('auth.unlock', { secret: `yanlis-${i}` })).messageKey)
    expect(last.at(-1)).toBe('errors.unauthenticated')
    expect(userRow(h, 'sahip').lockedUntil).toBeNull()
    expect((await h.call('auth.signIn', { username: 'sahip', secret: 'cok-gizli-sifre' })).status).toBe(200)
  })
})

describe('zorunlu şifre değişikliği (#6)', () => {
  it('geçici şifre yeni şifre olarak yazılamaz', async () => {
    const h = await makeHarness()
    await setUp(h)
    await h.call('auth.signOut')
    await h.call('auth.signIn', { username: 'deniz', secret: 'gecici-sifre-1' })
    const same = await h.call('auth.changePassword', {
      currentPassword: 'gecici-sifre-1',
      newPassword: 'gecici-sifre-1'
    })
    expect(errorOf(same).messageKey).toBe('errors.samePassword')
    expect(userRow(h, 'deniz').mustChange).toBe(true)
    const own = await h.call('auth.changePassword', {
      currentPassword: 'gecici-sifre-1',
      newPassword: 'denizin-kendi-sifresi'
    })
    expect(own.status).toBe(200)
    expect(userRow(h, 'deniz').mustChange).toBe(false)
  })

  it('zorunlu değişiklik beklerken PIN ve kurtarma kodu alınamaz', async () => {
    const h = await makeHarness()
    await setUp(h)
    await h.call('auth.signOut')
    await h.call('auth.signIn', { username: 'deniz', secret: 'gecici-sifre-1' })
    const pin = await h.call('auth.setPin', { currentPassword: 'gecici-sifre-1', pin: '4826' })
    const codes = await h.call('auth.newRecoveryCodes', { currentPassword: 'gecici-sifre-1' })
    expect(errorOf(pin).messageKey).toBe('errors.mustChangePasswordFirst')
    expect(errorOf(codes).messageKey).toBe('errors.mustChangePasswordFirst')
    expect(userRow(h, 'deniz').pinHash).toBeNull()
  })

  it('şifre sıfırlanınca kişinin kullanılmamış kurtarma kodları da düşer', async () => {
    const h = await makeHarness()
    await setUp(h)
    const deniz = userRow(h, 'deniz')
    const ownerCtx = h.desktop.ctxFor(7)
    h.services.auth.generateRecoveryCodes(ownerCtx, deniz.id)
    const live = () =>
      h.handle.db
        .select()
        .from(recoveryCodes)
        .where(and(eq(recoveryCodes.userId, deniz.id), isNull(recoveryCodes.usedAt)))
        .all().length
    expect(live()).toBe(10)
    h.services.users.resetPassword(ownerCtx, deniz.id, 'yeni-gecici-12')
    expect(live()).toBe(0)
  })
})

describe('mevcut şifre soran yordamlar (#9)', () => {
  it('açık oturumda yanlış mevcut şifre sayılır, denetime yazılır; 5. yanlışta hesap kilitlenir ve oturum kapanır', async () => {
    const h = await makeHarness()
    await setUp(h)
    const reauth = () => h.handle.db.select().from(auditLog).where(eq(auditLog.action, 'reauth_failed')).all()
    const tries = [
      () => h.call('auth.changePassword', { currentPassword: 'tahmin-1', newPassword: 'yeni-sifre-123' }),
      () => h.call('auth.setPin', { currentPassword: 'tahmin-2', pin: '4826' }),
      () => h.call('auth.newRecoveryCodes', { currentPassword: 'tahmin-3' }),
      () => h.call('auth.changePassword', { currentPassword: 'tahmin-4', newPassword: 'yeni-sifre-123' })
    ]
    for (const run of tries) expect(errorOf(await run()).messageKey).toBe('errors.wrongPassword')
    expect(reauth()).toHaveLength(4)
    const fifth = await h.call('auth.setPin', { currentPassword: 'tahmin-5', pin: '4826' })
    expect(errorOf(fifth).messageKey).toBe('errors.accountLocked')
    expect(userRow(h, 'sahip').lockedUntil).not.toBeNull()
    // The try that locked also ended this window's session (N-2): back to the sign-in screen.
    expect((await h.call<{ session: unknown }>('auth.state')).body.session).toBeNull()
    // Locked: even the right password waits for the lock to end.
    const right = await h.call('auth.signIn', { username: 'sahip', secret: 'cok-gizli-sifre' })
    expect(errorOf(right).messageKey).toBe('errors.accountLocked')
    h.clock.advance(16)
    expect((await h.call('auth.signIn', { username: 'sahip', secret: 'cok-gizli-sifre' })).status).toBe(200)
    expect(
      (
        await h.call('auth.changePassword', {
          currentPassword: 'cok-gizli-sifre',
          newPassword: 'yeni-sifre-123'
        })
      ).status
    ).toBe(200)
    expect(userRow(h, 'sahip')).toMatchObject({ failedAttempts: 0, lockedUntil: null })
  })

  it('doğru mevcut şifre önceki yanlışları siler', async () => {
    const h = await makeHarness()
    await setUp(h)
    await h.call('auth.setPin', { currentPassword: 'tahmin', pin: '4826' })
    expect(userRow(h, 'sahip').failedAttempts).toBe(1)
    expect((await h.call('auth.setPin', { currentPassword: 'cok-gizli-sifre', pin: '4826' })).status).toBe(
      200
    )
    expect(userRow(h, 'sahip').failedAttempts).toBe(0)
  })
})
