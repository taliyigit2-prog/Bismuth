// O-4 completed (P13sec2: N-8 and the database review's write paths): once another computer took over, the old main
// computer writes nothing through the services — the settings, the copy grants and password recovery included, and
// the program's own jobs (systemCtx) too. Bookkeeping that keeps it answering read-only (sessions) stays open.
import { eq } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { replicaGrants, sessions, users } from '../../src/main/db/schema'
import { createGrant } from '../../src/main/replica/grants'
import { systemCtx } from '../../src/main/services/context'
import { readSetting } from '../../src/main/services/settings-service'
import { hostHarness, PASSWORD, phone, type HostHarness } from './host-harness'

let h: HostHarness
afterEach(() => h?.close())

const notMain = expect.objectContaining({ messageKey: 'errors.notMainComputer' })

describe('yerine geçilmiş ana bilgisayarda yazma kapısı', () => {
  it("writeGate='replaced' iken settings.set(systemCtx()) → errors.notMainComputer (N-8)", async () => {
    let replaced = false
    h = await hostHarness({ writeGate: () => (replaced ? 'replaced' : null) })
    h.services.settings.set(systemCtx(), { 'hotel.checkinTime': '13:00' })
    replaced = true
    expect(() => h.services.settings.set(systemCtx(), { 'hotel.checkinTime': '15:00' })).toThrow(notMain)
    expect(readSetting(h.handle.db, 'hotel.checkinTime')).toBe('13:00')
  })

  it('kopya izni verilmez: yerine geçilmiş bilgisayar ya da salt-okunur bağlam (createGrant)', async () => {
    h = await hostHarness()
    const id = h.user('sahip', 'owner')
    await phone(h.app).call('auth.signIn', { username: 'sahip', secret: PASSWORD })
    const deviceId = h.handle.db.select().from(sessions).get()!.deviceId
    const owner = { ...systemCtx(), userId: id, deviceId }
    expect(() => createGrant(h.handle.db, owner, new Date(), () => 'replaced')).toThrow(notMain)
    expect(() => createGrant(h.handle.db, { ...owner, readOnly: 'replica' }, new Date())).toThrow(
      expect.objectContaining({ messageKey: 'errors.readOnlyCopy' })
    )
    expect(h.handle.db.select().from(replicaGrants).all()).toHaveLength(0)
    expect(createGrant(h.handle.db, owner, new Date(), () => null).userId).toBe(id)
  })

  it('kurtarma koduyla yeni şifre yazılmaz; oturum ve kilit kayıtları (salt-okunur yanıt için) çalışmaya devam eder', async () => {
    let replaced = false
    h = await hostHarness({ writeGate: () => (replaced ? 'replaced' : null) })
    const id = h.user('sahip', 'owner')
    const [code] = h.services.auth.generateRecoveryCodes(systemCtx(), id)
    const p = phone(h.app)
    expect((await p.call('auth.signIn', { username: 'sahip', secret: PASSWORD })).status).toBe(200)
    replaced = true
    const before = h.handle.db.select().from(users).where(eq(users.id, id)).get()!.passwordHash
    expect(() =>
      h.services.auth.recoverWithCode({ username: 'sahip', code: code!, newPassword: 'yeni-sifre-1234' })
    ).toThrow(notMain)
    expect(h.handle.db.select().from(users).where(eq(users.id, id)).get()!.passwordHash).toBe(before)
    // The phone keeps its session and may lock it (bookkeeping, not hotel data).
    expect((await p.call('auth.lock')).status).toBe(200)
    expect((await p.call('auth.unlock', { secret: PASSWORD })).status).toBe(200)
  })
})
