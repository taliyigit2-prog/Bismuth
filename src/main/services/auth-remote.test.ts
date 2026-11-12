// The server mode's part of sign-in (faz-13 "Faz 4'ten notlar"): hashes computed off the main thread, the role's
// three-way remote rule (anywhere / local network / off; migration 0010), the remote session length, and the PIN
// pause bound to the caller's address as well as the device.
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { depsOf, roleCtx, testClock } from '../../../tests/factories/ctx'
import { MIGRATIONS, seededDatabase } from '../../../tests/factories/db'
import { openDatabase, type DatabaseHandle } from '../db/client'
import { roles, users } from '../db/schema'
import {
  createAuthService,
  hashSecret,
  hashSecretAsync,
  remoteAccessOf,
  verifySecret,
  verifySecretAsync
} from './auth-service'
import { createUsersService, ctxForUser } from './users-service'

let handle: DatabaseHandle
afterEach(() => handle?.close())

const phone = { kind: 'mobile' as const, deviceName: 'iPhone · Safari' }

async function setup() {
  handle = await seededDatabase()
  const clock = testClock('2026-10-01T09:00:00.000Z')
  const auth = createAuthService({ ...depsOf(handle, clock), lockMinutes: 15, maxFailedAttempts: 5 })
  const roleId = (code: string) => handle.db.select().from(roles).where(eq(roles.code, code)).get()!.id
  const user = (username: string, role: string, pin?: string) => {
    handle.db
      .insert(users)
      .values({
        id: `u-${username}`,
        username,
        displayName: username,
        roleId: roleId(role),
        passwordHash: hashSecret('gizli-sifre-1'),
        pinHash: pin ? hashSecret(pin) : null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z'
      })
      .run()
    return `u-${username}`
  }
  const setAccess = (role: string, access: 'anywhere' | 'lan' | 'off') =>
    handle.db
      .update(roles)
      .set({ remoteAccess: access, remoteAllowed: access !== 'off' })
      .where(eq(roles.id, roleId(role)))
      .run()
  return { clock, auth, user, setAccess, roleId }
}

describe('asenkron şifre özeti (sunucu modu)', () => {
  it('asenkron özet ve doğrulama eşzamanlı olanla aynı sonucu verir', async () => {
    const stored = await hashSecretAsync('Çok gizli')
    expect(verifySecret('Çok gizli', stored)).toBe(true)
    expect(await verifySecretAsync('Çok gizli', hashSecret('Çok gizli'))).toBe(true)
    expect(await verifySecretAsync('çok gizli', stored)).toBe(false)
    expect(await verifySecretAsync('x', 'bozuk')).toBe(false)
  })

  it('loginAsync oturum açar; süre sunucunun ayarından (24 saat) gelir', async () => {
    const { auth, user } = await setup()
    user('ayse', 'reception')
    const s = await auth.loginAsync(
      { username: 'ayse', secret: 'gizli-sifre-1', device: phone },
      { remote: true, network: 'lan', sessionHours: 24 }
    )
    expect(s.expiresAt).toBe('2026-10-02T09:00:00.000Z')
    await expect(
      auth.loginAsync({ username: 'ayse', secret: 'yanlis', device: phone }, { remote: true, network: 'lan' })
    ).rejects.toMatchObject({ messageKey: 'errors.invalidCredentials' })
  })
})

describe('rol başına uzaktan erişim: her yerden / yalnız yerel ağ / kapalı', () => {
  it("yalnız yerel ağ: Wi‑Fi'dan açılır, özel ağdan doğru şifreyle 403 (yanlış şifreyle 401)", async () => {
    const { auth, user, setAccess } = await setup()
    user('kat', 'housekeeping')
    setAccess('housekeeping', 'lan')
    const input = { username: 'kat', secret: 'gizli-sifre-1', device: phone }
    expect(auth.login(input, { remote: true, network: 'lan' }).userId).toBe('u-kat')
    expect(() => auth.login(input, { remote: true, network: 'private' })).toThrow(
      expect.objectContaining({ code: 'PERMISSION_DENIED', messageKey: 'errors.remoteLanOnly' })
    )
    // Network unknown counts as the private network.
    expect(() => auth.login(input, { remote: true })).toThrow(
      expect.objectContaining({ messageKey: 'errors.remoteLanOnly' })
    )
    expect(() => auth.login({ ...input, secret: 'yanlis-1' }, { remote: true, network: 'private' })).toThrow(
      expect.objectContaining({ messageKey: 'errors.invalidCredentials' })
    )
    // The hotel's own computer (IPC) is never limited.
    expect(auth.login(input).userId).toBe('u-kat')
  })

  it("açık oturum da kurala uyar: yalnız yerel ağ rolünün ctx'i özel ağda yok, kapalı rolün hiç yok", async () => {
    const { user, setAccess } = await setup()
    user('kat', 'housekeeping')
    setAccess('housekeeping', 'lan')
    expect(ctxForUser(handle.db, 'u-kat', 'd1', 'http', 'lan')).not.toBeNull()
    expect(ctxForUser(handle.db, 'u-kat', 'd1', 'http', 'private')).toBeNull()
    expect(ctxForUser(handle.db, 'u-kat', 'd1', 'ipc')).not.toBeNull()
    setAccess('housekeeping', 'off')
    expect(ctxForUser(handle.db, 'u-kat', 'd1', 'http', 'lan')).toBeNull()
  })

  it('rol düzenleyici üç durumu yazar; eski "remoteAllowed" girişi de çalışır', async () => {
    const { roleId } = await setup()
    const usersService = createUsersService(depsOf(handle))
    const owner = roleCtx('owner')
    const updated = usersService.updateRole(owner, roleId('housekeeping'), { remoteAccess: 'lan' })
    expect(updated).toMatchObject({ remoteAccess: 'lan', remoteAllowed: true })
    expect(usersService.updateRole(owner, roleId('housekeeping'), { remoteAllowed: false })).toMatchObject({
      remoteAccess: 'off',
      remoteAllowed: false
    })
    const created = usersService.createRole(owner, { name: 'Gece resepsiyonu', remoteAccess: 'lan' })
    expect(created).toMatchObject({ remoteAccess: 'lan', remoteAllowed: true })
    expect(remoteAccessOf(handle.db, created.id)).toBe('lan')
    // The owner role is fixed, where it signs in from included (P4fix #14: the role editor shows it locked).
    expect(() => usersService.updateRole(owner, roleId('owner'), { remoteAccess: 'lan' })).toThrow(
      /errors.ownerRoleLocked/
    )
    // A role without rights over roles cannot change it.
    expect(() =>
      usersService.updateRole(roleCtx('manager'), roleId('housekeeping'), { remoteAccess: 'anywhere' })
    ).toThrow(expect.objectContaining({ code: 'PERMISSION_DENIED' }))
  })
})

describe('PIN duraklatması adrese de bağlı', () => {
  it('yeni cihaz çerezi PIN denemelerini sıfırlamaz: aynı adresten 5 yanlıştan sonra durur', async () => {
    const { auth, user } = await setup()
    user('ayse', 'reception', '8642')
    user('mehmet', 'reception', '9753')
    for (let i = 0; i < 5; i++) {
      const device = { kind: 'mobile' as const, deviceName: `cihaz-${i}` }
      expect(() =>
        auth.loginWithPin(
          { userId: i % 2 ? 'u-ayse' : 'u-mehmet', pin: '1111', device },
          { remote: true, network: 'lan', ip: '192.168.1.45' }
        )
      ).toThrow(expect.objectContaining({ messageKey: 'errors.invalidCredentials' }))
    }
    expect(() =>
      auth.loginWithPin(
        { userId: 'u-ayse', pin: '8642', device: { kind: 'mobile', deviceName: 'yepyeni' } },
        { remote: true, network: 'lan', ip: '192.168.1.45' }
      )
    ).toThrow(expect.objectContaining({ messageKey: 'errors.pinPaused' }))
    // Another address and device: the PIN works (the account itself is not locked by PIN tries).
    const s = await auth.loginWithPinAsync(
      { userId: 'u-ayse', pin: '8642', device: { kind: 'mobile', deviceName: 'başka' } },
      { remote: true, network: 'lan', ip: '192.168.1.46' }
    )
    expect(s.userId).toBe('u-ayse')
  })
})

describe('migrasyon 0010 (rol başına uzaktan erişim)', () => {
  it('eski değer korunur: remote_allowed 1 → her yerden, 0 → kapalı', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bismuth-0010-'))
    try {
      const staged = join(dir, 'drizzle')
      cpSync(MIGRATIONS, staged, { recursive: true })
      const journalPath = join(staged, 'meta', '_journal.json')
      const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: { tag: string }[] }
      const at = journal.entries.findIndex((e) => e.tag.startsWith('0010_'))
      expect(at).toBeGreaterThan(0)
      writeFileSync(journalPath, JSON.stringify({ ...journal, entries: journal.entries.slice(0, at) }))
      const file = join(dir, 'bismuth.db')
      const old = await openDatabase({ file, migrationsFolder: staged })
      const insert = old.sqlite.prepare(
        "insert into roles (id, name, is_system, created_at, updated_at, remote_allowed) values (?, ?, 0, 'x', 'x', ?)"
      )
      insert.run('r-open', 'Açık', 1)
      insert.run('r-closed', 'Kapalı', 0)
      old.close()
      handle = await openDatabase({ file, migrationsFolder: MIGRATIONS })
      const rows = handle.sqlite
        .prepare("select id, remote_access a from roles where id in ('r-open', 'r-closed') order by id")
        .all()
      expect(rows).toEqual([
        { id: 'r-closed', a: 'off' },
        { id: 'r-open', a: 'anywhere' }
      ])
    } finally {
      handle?.close()
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
