// Faz 4 bug hunt (P4fix) over the real router and services: holidays of a hotel outside Türkiye (#8), rules
// between settings (#11, #12), the owner role (#14), what the audit log shows and writes (#15).
import { describe, expect, it } from 'vitest'
import { defaultPermissions } from '../../src/shared/permissions'
import { auditLog } from '../../src/main/db/schema'
import { ctxFromPermissions } from '../../src/main/services/context'
import { draftFrom, errorOf, makeHarness, setUp, type Harness } from '../factories/desk'

type Day = { date: string; kind: string }
const holidaysOf = async (h: Harness, from: string, to: string) =>
  (await h.call<Day[]>('calendar.days', { from, to })).body.filter((d) => d.kind === 'holiday')

describe('Türkiye dışındaki otelin bayramları (#8)', () => {
  it('ülkesi DE olan otelde Türk bayramı üretilmez; ülke TR olunca gelir, DE olunca yeniden kalkar', async () => {
    const h = await makeHarness()
    const options = await h.call<Parameters<typeof draftFrom>[0]>('setup.options')
    const draft = draftFrom(options.body)
    draft.hotel.country = 'DE'
    draft.hotel.timezone = 'Europe/Berlin'
    expect((await h.call('setup.finish', draft)).status).toBe(200)
    expect(await holidaysOf(h, '2026-10-28', '2026-10-31')).toEqual([])
    expect((await h.call('settings.set', { 'hotel.country': 'TR' })).status).toBe(200)
    expect((await holidaysOf(h, '2026-10-28', '2026-10-31')).map((d) => d.date)).toContain('2026-10-29')
    expect((await h.call('settings.set', { 'hotel.country': 'DE' })).status).toBe(200)
    expect(await holidaysOf(h, '2026-10-28', '2026-10-31')).toEqual([])
  })
})

describe('ayarların birbirine bağlı kuralları (#11, #12)', () => {
  it('ana para birimi kabul edilenlerden çıkarılamaz', async () => {
    const h = await makeHarness()
    await setUp(h)
    const res = await h.call('settings.set', { 'hotel.currencies': ['EUR'] })
    expect(errorOf(res).messageKey).toBe('errors.baseCurrencyNotAccepted')
    expect((await h.call('settings.set', { 'hotel.currencies': ['TRY', 'EUR'] })).status).toBe(200)
  })

  it('geçersiz saat dilimi (Mars/Olympus) reddedilir, gerçek IANA adı kabul edilir', async () => {
    const h = await makeHarness()
    await setUp(h)
    expect((await h.call('settings.set', { 'hotel.timezone': 'Mars/Olympus' })).status).toBe(400)
    expect((await h.call('settings.set', { 'hotel.timezone': 'Europe/Berlin' })).status).toBe(200)
  })

  it('personel gider bölümü sahip bölümü yetkisi ister ve var olan açık bölüm olmalı', async () => {
    const h = await makeHarness()
    await setUp(h)
    const manager = ctxFromPermissions('u-mudur', 'dev', 'ipc', defaultPermissions('manager'))
    expect(() => h.services.settings.set(manager, { 'staff.expenseSection': 'owner' })).toThrow(
      /PERMISSION_DENIED/
    )
    // The pay rules stay the manager's (K-38).
    expect(() => h.services.settings.set(manager, { 'staff.advanceFromDrawer': true })).not.toThrow()
    const owner = h.desktop.ctxFor(7)
    expect(() => h.services.settings.set(owner, { 'staff.expenseSection': 'yok_boyle' })).toThrow(
      /expenseSectionInvalid/
    )
    expect(h.services.settings.set(owner, { 'staff.expenseSection': 'owner' })['staff.expenseSection']).toBe(
      'owner'
    )
  })
})

describe('sahip rolü (#14)', () => {
  it('sahip rolünün uzaktan erişimi de değiştirilemez', async () => {
    const h = await makeHarness()
    await setUp(h)
    const ownerRole = h.services.users.listRoles(h.desktop.ctxFor(7)).find((r) => r.code === 'owner')!
    const res = await h.call('roles.update', { id: ownerRole.id, patch: { remoteAccess: 'lan' } })
    expect(errorOf(res).messageKey).toBe('errors.ownerRoleLocked')
  })
})

describe('kullanıcı ekranı rol düzenleyici yetkisi olmadan (#13)', () => {
  it('yalnız kullanıcı yetkisi olan rol rolleri adlarıyla ve verebileceği kadarıyla görür', async () => {
    const h = await makeHarness()
    await setUp(h)
    const perms = { ...defaultPermissions('manager'), 'settings.users': 'edit' as const }
    const admin = ctxFromPermissions('u-it', 'dev', 'ipc', perms)
    expect(() => h.services.users.listRoles(admin)).toThrow(/PERMISSION_DENIED/)
    const choices = h.services.users.roleChoices(admin)
    expect(choices.find((r) => r.code === 'reception')).toMatchObject({ assignable: true, locked: false })
    expect(choices.find((r) => r.code === 'owner')).toMatchObject({ assignable: false, locked: true })
    expect(choices[0]).not.toHaveProperty('permissions')
    const reception = choices.find((r) => r.code === 'reception')!
    const made = h.services.users.createUser(admin, {
      username: 'gece',
      displayName: 'Gece Resepsiyonu',
      roleId: reception.id,
      password: 'gece-sifre-123'
    })
    expect(made.roleId).toBe(reception.id)
  })
})

describe('denetim kaydı (#15)', () => {
  it('menüyü daraltıp açmak ve turu bitirmek denetim kaydına yazılmaz; dil değişikliği yazılır', async () => {
    const h = await makeHarness()
    await setUp(h)
    const count = () => h.handle.db.select().from(auditLog).all().length
    const before = count()
    for (let i = 0; i < 6; i++) await h.call('settings.set', { 'ui.sidebarCollapsed': i % 2 === 0 })
    await h.call('settings.set', { 'ui.tourDone': true })
    expect(count()).toBe(before)
    expect((await h.call('settings.get')).body).toMatchObject({
      'ui.sidebarCollapsed': false,
      'ui.tourDone': true
    })
    await h.call('settings.set', { 'ui.language': 'en' })
    expect(count()).toBe(before + 1)
  })

  it('misafir yetkisi olmayan denetim okuyucusu misafir kaydının içeriğini görmez', async () => {
    const h = await makeHarness()
    await setUp(h)
    const owner = h.desktop.ctxFor(7)
    const channel = h.services.lists.list(owner, 'salesChannels')[0]!
    const room = h.services.rooms.listRooms(owner)[0]!
    h.services.reservations.create(owner, {
      guest: { firstName: 'Ayşe', lastName: 'Deneme', phone: '0532 111 22 33' },
      channelId: channel.id,
      stays: [{ roomId: room.id, checkIn: '2026-10-10', checkOut: '2026-10-11', nightlyPriceMinor: 100_000 }]
    })
    const auditor = ctxFromPermissions('u-denetci', 'dev', 'ipc', { audit_log: 'view' })
    const guestRows = h.services.audit.list(auditor, { entity: 'guest' }).entries
    expect(guestRows.length).toBeGreaterThan(0)
    expect(guestRows.every((e) => JSON.stringify(e.after) === '{"hidden":true}')).toBe(true)
    expect(JSON.stringify(h.services.audit.list(auditor, {}).entries)).not.toContain('0532')
    // The owner reads it all.
    expect(JSON.stringify(h.services.audit.list(owner, { entity: 'guest' }).entries)).toContain('Ayşe')
  })
})
