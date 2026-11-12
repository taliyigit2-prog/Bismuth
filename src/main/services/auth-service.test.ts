import { afterEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { depsOf, roleCtx, testClock } from '../../../tests/factories/ctx'
import { seededDatabase } from '../../../tests/factories/db'
import type { SystemRoleCode } from '@shared/permissions'
import type { DatabaseHandle } from '../db/client'
import { auditLog, roles, users } from '../db/schema'
import { createAuthService, hashSecret, scryptCost, verifySecret } from './auth-service'

let handle: DatabaseHandle
afterEach(() => handle?.close())

const desk = { kind: 'desktop' as const, deviceName: 'Resepsiyon PC' }
const phone = { kind: 'mobile' as const, deviceName: 'Sahibin telefonu' }

async function setup() {
  handle = await seededDatabase()
  const clock = testClock('2026-10-01T09:00:00.000Z')
  const auth = createAuthService({ ...depsOf(handle, clock), lockMinutes: 15, maxFailedAttempts: 5 })
  const user = (username: string, role: SystemRoleCode, password = 'gizli-sifre-1') => {
    const roleId = handle.db.select().from(roles).where(eq(roles.code, role)).get()!.id
    handle.db
      .insert(users)
      .values({
        id: `u-${username}`,
        username,
        displayName: username,
        roleId,
        passwordHash: hashSecret(password),
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z'
      })
      .run()
    return `u-${username}`
  }
  const failures = () => handle.db.select().from(auditLog).where(eq(auditLog.action, 'login_failed')).all()
  return { clock, auth, user, failures }
}

describe('şifre özeti', () => {
  it('scrypt özeti doğru şifreyi tanır, yanlışı ve bozuk kaydı reddeder', () => {
    const h = hashSecret('Çok gizli')
    // Under Vitest the work factor is small (same code path); the hash names its own parameters.
    expect(h.startsWith('scrypt$1024$8$1$')).toBe(true)
    expect(verifySecret('Çok gizli', h)).toBe(true)
    expect(verifySecret('çok gizli', h)).toBe(false)
    expect(verifySecret('x', 'scrypt$3$8$1$aaaa$bbbb')).toBe(false)
    expect(verifySecret('x', null)).toBe(false)
    expect(hashSecret('a')).not.toBe(hashSecret('a'))
  })

  it('programda (Vitest dışında) iş yükü N=16384, r=8, p=5; yalnız Vitest küçük yük kullanır', () => {
    expect(scryptCost({})).toEqual({ N: 16_384, r: 8, p: 5 })
    expect(scryptCost({ NODE_ENV: 'production' })).toEqual({ N: 16_384, r: 8, p: 5 })
    expect(scryptCost({ VITEST: 'true' })).toEqual({ N: 1024, r: 8, p: 1 })
    // A hash made with the program's factor is still checked correctly under the small one.
    const strong = ['scrypt', 16_384, 8, 5].join('$')
    expect(verifySecret('x', `${strong}$aaaa$bbbb`)).toBe(false)
  })
})

describe('giriş ve oturum (G-22, G-144, §8)', () => {
  it('doğru şifre belirteç verir; belirteç yalnız özetiyle saklanır; çıkış oturumu bitirir', async () => {
    const { auth, user } = await setup()
    const id = user('ayse', 'reception')
    const s = auth.login({ username: '  AYSE ', secret: 'gizli-sifre-1', device: desk })
    expect(s).toMatchObject({ userId: id, mustChange: false, expiresAt: '2026-10-01T21:00:00.000Z' })
    expect(
      handle.sqlite.prepare('select count(*) n from sessions where token_hash = ?').get(s.token)
    ).toEqual({
      n: 0
    })
    expect(auth.resolveSession(s.token)).toMatchObject({ userId: id, deviceId: s.deviceId })
    expect(auth.logout(s.token)).toBe(true)
    expect(auth.resolveSession(s.token)).toBeNull()
    expect(auth.logout(s.token)).toBe(false)
  })

  it('"son görülme" dakikada en çok bir kez yazılır; yeni IP hemen yazılır', async () => {
    const { auth, user, clock } = await setup()
    user('ayse', 'reception')
    const s = auth.login({ username: 'ayse', secret: 'gizli-sifre-1', device: desk })
    const seen = () =>
      handle.sqlite
        .prepare(
          'select s.last_seen_at session, d.last_seen_at device, d.last_ip ip from sessions s join devices d on d.id = s.device_id'
        )
        .get()
    auth.resolveSession(s.token, '10.0.0.5')
    expect(seen()).toEqual({
      session: '2026-10-01T09:00:00.000Z',
      device: '2026-10-01T09:00:00.000Z',
      ip: '10.0.0.5'
    })
    clock.advance(0.5)
    auth.resolveSession(s.token, '10.0.0.5')
    expect(seen()).toMatchObject({ session: '2026-10-01T09:00:00.000Z', device: '2026-10-01T09:00:00.000Z' })
    auth.resolveSession(s.token, '10.0.0.6')
    expect(seen()).toEqual({
      session: '2026-10-01T09:00:00.000Z',
      device: '2026-10-01T09:00:30.000Z',
      ip: '10.0.0.6'
    })
    clock.advance(1)
    auth.resolveSession(s.token)
    expect(seen()).toEqual({
      session: '2026-10-01T09:01:30.000Z',
      device: '2026-10-01T09:01:30.000Z',
      ip: '10.0.0.6'
    })
  })

  it('5 hatalı denemeden sonra hesap 15 dakika kilitlenir; kilitte doğru şifre de "hesap kilitli" der', async () => {
    const { auth, user, clock, failures } = await setup()
    user('ayse', 'reception')
    for (let i = 0; i < 4; i++)
      expect(() => auth.login({ username: 'ayse', secret: 'yanlis', device: desk })).toThrow(
        /errors.invalidCredentials/
      )
    // The fifth wrong try locks the account and says so, with the end time (P4fix #4).
    expect(() => auth.login({ username: 'ayse', secret: 'yanlis', device: desk })).toThrow(
      /errors.accountLocked/
    )
    const row = () => handle.db.select().from(users).where(eq(users.username, 'ayse')).get()!
    expect(row()).toMatchObject({ failedAttempts: 5, lockedUntil: '2026-10-01T09:15:00.000Z' })
    expect(() => auth.login({ username: 'ayse', secret: 'gizli-sifre-1', device: desk })).toThrow(
      /errors.accountLocked/
    )
    expect(JSON.parse(failures().at(-1)!.afterJson!)).toMatchObject({ reason: 'locked' })
    clock.advance(16)
    expect(auth.login({ username: 'ayse', secret: 'gizli-sifre-1', device: desk }).userId).toBe('u-ayse')
    expect(row()).toMatchObject({ failedAttempts: 0, lockedUntil: null })
  })

  it('bilinmeyen kullanıcı aynı hatayı alır ve yazılan ad kayda geçmez', async () => {
    const { auth, failures } = await setup()
    expect(() => auth.login({ username: 'sifrem123', secret: 'x', device: desk })).toThrow(
      /errors.invalidCredentials/
    )
    const [row] = failures()
    expect(row).toMatchObject({ entityId: 'unknown', userId: null })
    expect(JSON.stringify(row)).not.toContain('sifrem123')
  })

  it('oturum 12 saat sonra biter; pasif kullanıcının oturumu hemen geçersizleşir', async () => {
    const { auth, user, clock } = await setup()
    user('ayse', 'reception')
    const s = auth.login({ username: 'ayse', secret: 'gizli-sifre-1', device: desk })
    clock.advance(11 * 60)
    expect(auth.resolveSession(s.token)).not.toBeNull()
    clock.advance(61)
    expect(auth.resolveSession(s.token)).toBeNull()
    const again = auth.login({ username: 'ayse', secret: 'gizli-sifre-1', device: desk })
    handle.db.update(users).set({ active: false }).where(eq(users.id, 'u-ayse')).run()
    expect(auth.resolveSession(again.token)).toBeNull()
    expect(() => auth.login({ username: 'ayse', secret: 'gizli-sifre-1', device: desk })).toThrow(
      /errors.invalidCredentials/
    )
  })

  it('"bu cihazı çıkar" o cihazdaki oturumları anında bitirir; aynı kimlikle gelen yeni cihaz sayılır', async () => {
    const { auth, user } = await setup()
    user('sahip', 'owner')
    user('ayse', 'reception')
    const ownerSession = auth.login({ username: 'sahip', secret: 'gizli-sifre-1', device: desk })
    const onPhone = auth.login({ username: 'ayse', secret: 'gizli-sifre-1', device: phone })
    const ownerCtx = roleCtx('owner', 'u-sahip', ownerSession.deviceId)
    expect(auth.listDevices(ownerCtx).map((d) => [d.name, d.sessions.length])).toEqual(
      expect.arrayContaining([
        ['Resepsiyon PC', 1],
        ['Sahibin telefonu', 1]
      ])
    )
    expect(() => auth.revokeDevice(roleCtx('reception', 'u-ayse'), onPhone.deviceId)).toThrow(
      /PERMISSION_DENIED/
    )
    auth.revokeDevice(ownerCtx, onPhone.deviceId)
    expect(auth.resolveSession(onPhone.token)).toBeNull()
    expect(auth.resolveSession(ownerSession.token)).not.toBeNull()
    const back = auth.login({
      username: 'ayse',
      secret: 'gizli-sifre-1',
      device: { ...phone, deviceId: onPhone.deviceId }
    })
    expect(back.deviceId).not.toBe(onPhone.deviceId)
  })

  it('kendi oturumunu herkes kapatır; başkasınınki cihaz yetkisi ister', async () => {
    const { auth, user } = await setup()
    user('ayse', 'reception')
    user('mehmet', 'reception')
    const a = auth.login({ username: 'ayse', secret: 'gizli-sifre-1', device: desk })
    const m = auth.login({ username: 'mehmet', secret: 'gizli-sifre-1', device: desk })
    const ayse = roleCtx('reception', 'u-ayse', a.deviceId)
    expect(() => auth.revokeSession(ayse, m.sessionId)).toThrow(/PERMISSION_DENIED/)
    expect(() => auth.openSessionsOf(ayse, ['u-mehmet'])).toThrow(/PERMISSION_DENIED/)
    expect(auth.openSessionsOf(ayse, ['u-ayse'])).toHaveLength(1)
    expect(auth.revokeSession(ayse, a.sessionId).revokedAt).not.toBeNull()
    expect(auth.resolveSession(a.token)).toBeNull()
    expect(auth.revokeSession(roleCtx('owner', 'u-x'), m.sessionId).revokedAt).not.toBeNull()
    expect(auth.openSessionsOf(roleCtx('owner', 'u-x'), ['u-ayse', 'u-mehmet'])).toEqual([])
  })

  it('şifre değişince diğer cihazlardaki oturumlar biter, bu cihaz açık kalır', async () => {
    const { auth, user } = await setup()
    user('ayse', 'reception')
    const here = auth.login({ username: 'ayse', secret: 'gizli-sifre-1', device: desk })
    const there = auth.login({ username: 'ayse', secret: 'gizli-sifre-1', device: phone })
    const ctx = roleCtx('reception', 'u-ayse', here.deviceId)
    expect(() =>
      auth.changePassword(ctx, { currentPassword: 'yanlis', newPassword: 'yeni-sifre-2' })
    ).toThrow(/errors.wrongPassword/)
    auth.changePassword(ctx, { currentPassword: 'gizli-sifre-1', newPassword: 'yeni-sifre-2' })
    expect(auth.resolveSession(here.token)).not.toBeNull()
    expect(auth.resolveSession(there.token)).toBeNull()
    expect(auth.login({ username: 'ayse', secret: 'yeni-sifre-2', device: desk }).userId).toBe('u-ayse')
  })

  it('PIN ile hızlı kullanıcı değişimi; PIN yoksa giriş olmaz', async () => {
    const { auth, user } = await setup()
    const id = user('ayse', 'reception')
    expect(() => auth.loginWithPin({ userId: id, pin: '2856', device: desk })).toThrow(
      /errors.invalidCredentials/
    )
    auth.setPin(roleCtx('reception', id), { currentPassword: 'gizli-sifre-1', pin: '2856' })
    expect(auth.loginWithPin({ userId: id, pin: '2856', device: desk }).userId).toBe(id)
    expect(() => auth.loginWithPin({ userId: id, pin: '9999', device: desk })).toThrow(
      /errors.invalidCredentials/
    )
  })

  it('kolay tahmin edilen PIN kabul edilmez (tekrar, sıralı, yaygın)', async () => {
    const { auth, user } = await setup()
    const id = user('ayse', 'reception')
    for (const pin of ['1111', '1234', '9876', '2580', '123456'])
      expect(() => auth.setPin(roleCtx('reception', id), { currentPassword: 'gizli-sifre-1', pin })).toThrow(
        /VALIDATION/
      )
    auth.setPin(roleCtx('reception', id), { currentPassword: 'gizli-sifre-1', pin: '2856' })
  })

  it('yanlış PIN hesabı kilitlemez; 5 yanlış PIN sonrası PIN ile giriş durur, şifre çalışır ve PIN’i açar', async () => {
    const { auth, user, clock } = await setup()
    const ayse = user('ayse', 'reception')
    const mehmet = user('mehmet', 'reception')
    auth.setPin(roleCtx('reception', ayse), { currentPassword: 'gizli-sifre-1', pin: '2856' })
    auth.setPin(roleCtx('reception', mehmet), { currentPassword: 'gizli-sifre-1', pin: '7395' })
    // Spraying PINs over different accounts from one desk counts too.
    for (const [id, pin] of [
      [ayse, '1000'],
      [mehmet, '1001'],
      [ayse, '1002'],
      [mehmet, '1003'],
      [ayse, '1004']
    ] as const)
      expect(() => auth.loginWithPin({ userId: id, pin, device: desk })).toThrow(/errors.invalidCredentials/)
    expect(() => auth.loginWithPin({ userId: mehmet, pin: '7395', device: desk })).toThrow(/errors.pinPaused/)
    // The account itself is not locked: the password still signs in (and lifts the pause on this desk).
    expect(handle.db.select().from(users).where(eq(users.id, ayse)).get()).toMatchObject({
      failedAttempts: 0,
      lockedUntil: null
    })
    expect(auth.login({ username: 'mehmet', secret: 'gizli-sifre-1', device: desk }).userId).toBe(mehmet)
    expect(auth.loginWithPin({ userId: mehmet, pin: '7395', device: desk }).userId).toBe(mehmet)
    // Wrong PINs for one account from anywhere pause it too (three already came from the desk); the pause
    // ends by itself after the lock time.
    for (const pin of ['1005', '1006'])
      expect(() => auth.loginWithPin({ userId: ayse, pin, device: phone })).toThrow(
        /errors.invalidCredentials/
      )
    expect(() => auth.loginWithPin({ userId: ayse, pin: '2856', device: phone })).toThrow(/errors.pinPaused/)
    clock.advance(16)
    expect(auth.loginWithPin({ userId: ayse, pin: '2856', device: phone }).userId).toBe(ayse)
  })

  it('karttan seçilen hesap şifreyle girer; yanlış şifre aynı sayaca yazılır', async () => {
    const { auth, user } = await setup()
    const id = user('ayse', 'reception')
    expect(() => auth.login({ userId: id, secret: 'yanlis', device: desk })).toThrow(
      /errors.invalidCredentials/
    )
    expect(handle.db.select().from(users).where(eq(users.id, id)).get()!.failedAttempts).toBe(1)
    expect(auth.login({ userId: id, secret: 'gizli-sifre-1', device: desk }).userId).toBe(id)
    expect(() => auth.login({ userId: 'yok', secret: 'gizli-sifre-1', device: desk })).toThrow(
      /errors.invalidCredentials/
    )
    // One of the two, never both.
    expect(() => auth.login({ userId: id, username: 'ayse', secret: 'gizli-sifre-1', device: desk })).toThrow(
      /VALIDATION/
    )
  })

  it('uzaktan giremeyen rolün hesabı kurtarma kodunu da uzaktan kullanamaz', async () => {
    const { auth, user } = await setup()
    const id = user('ayse', 'reception')
    handle.db.update(roles).set({ remoteAllowed: false }).where(eq(roles.code, 'reception')).run()
    const [code] = auth.generateRecoveryCodes(roleCtx('owner', 'u-sahip'), id)
    const input = { username: 'ayse', code: code!, newPassword: 'kurtarilan-1' }
    expect(() => auth.recoverWithCode(input, { remote: true })).toThrow(/errors.invalidCredentials/)
    auth.recoverWithCode(input)
    expect(auth.login({ username: 'ayse', secret: 'kurtarilan-1', device: desk }).userId).toBe(id)
  })

  it('kurtarma koduyla yeni şifre eskisiyle aynı olamaz; kod harcanmaz, farklı şifre kabul edilir', async () => {
    const { auth, user } = await setup()
    const id = user('ayse', 'reception')
    const [code] = auth.generateRecoveryCodes(roleCtx('owner', 'u-sahip'), id)
    expect(() =>
      auth.recoverWithCode({ username: 'ayse', code: code!, newPassword: 'gizli-sifre-1' })
    ).toThrow(/errors.samePassword/)
    auth.recoverWithCode({ username: 'ayse', code: code!, newPassword: 'yepyeni-sifre-1' })
    expect(auth.login({ username: 'ayse', secret: 'yepyeni-sifre-1', device: desk }).userId).toBe(id)
  })

  it('kurtarma kodu bir kez çalışır, yazım farkını tolere eder ve tüm oturumları bitirir', async () => {
    const { auth, user } = await setup()
    const id = user('ayse', 'reception')
    user('mudur', 'manager')
    user('sahip', 'owner')
    const s = auth.login({ username: 'ayse', secret: 'gizli-sifre-1', device: desk })
    // Own codes need the current password, not only an open session.
    expect(() => auth.generateRecoveryCodes(roleCtx('reception', id), id)).toThrow(/errors.wrongPassword/)
    auth.setPin(roleCtx('reception', id), { currentPassword: 'gizli-sifre-1', pin: '7395' })
    const codes = auth.generateRecoveryCodes(roleCtx('reception', id), id, 'gizli-sifre-1')
    expect(codes).toHaveLength(10)
    expect(codes[0]).toMatch(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/)
    auth.recoverWithCode({
      username: 'ayse',
      code: ` ${codes[0]!.toLowerCase().replaceAll('-', ' ')} `,
      newPassword: 'kurtarilan-1'
    })
    // The PIN goes with the forgotten password.
    expect(() => auth.loginWithPin({ userId: id, pin: '7395', device: desk })).toThrow(
      /errors.invalidCredentials/
    )
    expect(auth.resolveSession(s.token)).toBeNull()
    expect(auth.login({ username: 'ayse', secret: 'kurtarilan-1', device: desk }).userId).toBe(id)
    expect(() =>
      auth.recoverWithCode({ username: 'ayse', code: codes[0]!, newPassword: 'baska-sifre-1' })
    ).toThrow(/errors.invalidCredentials/)
    // Someone else's codes need the user-management right (and at least that user's rights).
    expect(() => auth.generateRecoveryCodes(roleCtx('reception', id), 'u-mudur')).toThrow(/PERMISSION_DENIED/)
    expect(auth.generateRecoveryCodes(roleCtx('owner', 'u-sahip'), 'u-mudur')).toHaveLength(10)
  })
})
