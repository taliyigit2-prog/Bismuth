import { rmSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { depsOf, roleCtx, testClock } from '../../../tests/factories/ctx'
import { seededDatabase } from '../../../tests/factories/db'
import type { DatabaseHandle } from '../db/client'
import { auditLog, employees, expenseSections, guests, roles, settings, users } from '../db/schema'
import { createAuditService } from './audit-service'
import { createAuthService } from './auth-service'
import { ctxFromPermissions } from './context'
import { createExpensesService } from './expenses-service'
import { createGuestsService } from './guests-service'
import { createStaffService } from './staff-service'
import { createSettingsService } from './settings-service'
import { createUsersService, ctxForUser } from './users-service'

const owner = roleCtx('owner', 'u-owner')
let handle: DatabaseHandle | undefined
const temps: string[] = []
afterEach(() => {
  handle?.close()
  handle = undefined
  for (const d of temps.splice(0)) rmSync(d, { recursive: true, force: true })
})

const roleId = (h: DatabaseHandle, code: string) =>
  h.db.select().from(roles).where(eq(roles.code, code)).get()!.id

describe('kullanıcılar ve roller (G-20…G-23, K-38)', () => {
  async function setup() {
    handle = await seededDatabase()
    const clock = testClock('2026-10-01T09:00:00.000Z')
    const deps = depsOf(handle, clock)
    const svc = createUsersService(deps)
    const h = handle
    // The first owner account exists from setup.
    const first = svc.createUser(owner, {
      username: 'Sahip',
      displayName: 'Otel Sahibi',
      roleId: roleId(h, 'owner'),
      password: 'ilk-sifre-123'
    })
    return { clock, deps, svc, h, first }
  }

  it('yeni kullanıcı ilk girişte şifre değiştirir; kullanıcı adı büyük/küçük harf duyarsız tektir', async () => {
    const { svc, h, deps } = await setup()
    const ayse = svc.createUser(owner, {
      username: 'AYŞE',
      displayName: 'Ayşe',
      roleId: roleId(h, 'reception'),
      password: 'gecici-sifre-1'
    })
    expect(ayse).toMatchObject({ username: 'ayşe', mustChange: true, roleCode: 'reception', hasPin: false })
    expect(ayse).not.toHaveProperty('passwordHash')
    expect(() =>
      svc.createUser(owner, {
        username: 'ayşe',
        displayName: 'x',
        roleId: roleId(h, 'reception'),
        password: '12345678'
      })
    ).toThrow(/errors.usernameTaken/)
    const auth = createAuthService(deps)
    const s = auth.login({
      username: 'Ayşe',
      secret: 'gecici-sifre-1',
      device: { kind: 'desktop', deviceName: 'PC' }
    })
    expect(s.mustChange).toBe(true)
    // Until the initial password is changed the account can do nothing else.
    expect(ctxForUser(h.db, ayse.id, s.deviceId, 'ipc')!.can('today', 'view')).toBe(false)
    auth.changePassword(ctxForUser(h.db, ayse.id, s.deviceId, 'ipc')!, {
      currentPassword: 'gecici-sifre-1',
      newPassword: 'kendi-sifrem-1'
    })
    const ctx = ctxForUser(h.db, ayse.id, s.deviceId, 'ipc')!
    expect(ctx.can('calendar', 'edit')).toBe(true)
    expect(ctx.can('payments.void', 'edit')).toBe(false)
    expect(svc.permissionsOf(ctx, ayse.id).calendar).toBe('edit')
    expect(() => svc.permissionsOf(ctx, 'u-owner')).toThrow(/PERMISSION_DENIED/)
  })

  it('kullanıcı bir personel kartına yalnız personel kartı üzerinden bağlanır; bağlı kart başkasına verilmez', async () => {
    const { svc, h, deps } = await setup()
    const staff = createStaffService(deps)
    const card = staff.createEmployee(owner, {
      firstName: 'Ece',
      lastName: 'Deneme',
      startDate: '2026-01-01'
    })
    const ece = svc.createUser(owner, {
      username: 'ece',
      displayName: 'Ece',
      roleId: roleId(h, 'reception'),
      password: 'gecici-sifre-1',
      employeeId: card.id
    })
    expect(ece.employeeId).toBe(card.id)
    const linkOf = (id: string) => h.db.select().from(employees).where(eq(employees.id, id)).get()?.userId
    expect(linkOf(card.id)).toBe(ece.id)
    expect(h.db.select().from(users).where(eq(users.id, ece.id)).get()?.employeeId).toBeNull()
    const other = {
      username: 'baska',
      displayName: 'Başka',
      roleId: roleId(h, 'reception'),
      password: 'gecici-sifre-2'
    }
    expect(() => svc.createUser(owner, { ...other, employeeId: card.id })).toThrow(/errors.employeeHasUser/)
    const second = staff.createEmployee(owner, {
      firstName: 'Can',
      lastName: 'Deneme',
      startDate: '2026-01-01'
    })
    expect(svc.updateUser(owner, ece.id, { employeeId: second.id }).employeeId).toBe(second.id)
    expect([linkOf(card.id), linkOf(second.id)]).toEqual([null, ece.id])
    expect(svc.updateUser(owner, ece.id, { employeeId: null }).employeeId).toBeNull()
    expect(linkOf(second.id)).toBeNull()
    expect(svc.createUser(owner, { ...other, employeeId: card.id }).employeeId).toBe(card.id)
  })

  it('sahip rolü kilitli; kimse sahip olduğundan fazla yetki veremez; son sahip kapatılamaz', async () => {
    const { svc, h, first, deps } = await setup()
    expect(() => svc.updateRole(owner, roleId(h, 'owner'), { name: 'Patron' })).toThrow(
      /errors.ownerRoleLocked/
    )
    const ownerRole = svc.listRoles(owner).find((r) => r.code === 'owner')!
    expect(ownerRole).toMatchObject({ locked: true, userCount: 1 })
    expect(ownerRole.permissions.audit_log).toBe('edit')
    // A manager-like custom role with user management cannot create an owner nor grant audit_log.
    const admin = svc.createRole(owner, {
      name: 'Yönetici yardımcısı',
      permissions: { 'settings.users': 'edit', 'settings.roles': 'edit', calendar: 'edit' }
    })
    expect(admin.permissions).toMatchObject({ calendar: 'edit', payments: 'none' })
    const helper = svc.createUser(owner, {
      username: 'yardimci',
      displayName: 'Y',
      roleId: admin.id,
      password: 'yardimci-123'
    })
    createAuthService(deps).changePassword(roleCtx('employee', helper.id), {
      currentPassword: 'yardimci-123',
      newPassword: 'yardimci-456'
    })
    const adminCtx = ctxForUser(h.db, helper.id, 'd', 'ipc')!
    expect(adminCtx.can('settings.users', 'edit')).toBe(true)
    expect(() =>
      svc.createUser(adminCtx, {
        username: 'x2',
        displayName: 'X',
        roleId: roleId(h, 'owner'),
        password: '12345678'
      })
    ).toThrow(/PERMISSION_DENIED/)
    expect(() => svc.createRole(adminCtx, { name: 'Z', permissions: { audit_log: 'view' } })).toThrow(
      /PERMISSION_DENIED/
    )
    expect(() => svc.resetPassword(adminCtx, first.id, 'yeni-sifre-99')).toThrow(/PERMISSION_DENIED/)
    expect(() => svc.setActive(owner, first.id, false)).toThrow(/errors.lastOwner/)
    expect(() => svc.resetPassword(roleCtx('owner', first.id), first.id, 'yeni-sifre-77')).toThrow(
      /errors.useChangePassword/
    )
    expect(() => svc.updateUser(owner, first.id, { roleId: roleId(h, 'manager') })).toThrow(
      /errors.lastOwner/
    )
    // Renaming a seeded role drops its translations.
    const reception = svc.updateRole(owner, roleId(h, 'reception'), {
      name: 'Ön büro',
      permissions: { cash: 'edit' }
    })
    expect(reception).toMatchObject({ name: 'Ön büro', displayName: null })
    expect(reception.permissions.cash).toBe('edit')
  })

  it('kullanıcı kapatılınca ve rolü değişince oturumları hemen biter; şifre sıfırlanınca ilk girişte değiştirilir', async () => {
    const { svc, h, deps } = await setup()
    const u = svc.createUser(owner, {
      username: 'mehmet',
      displayName: 'Mehmet',
      roleId: roleId(h, 'reception'),
      password: 'mehmet-123'
    })
    const auth = createAuthService(deps)
    const login = () =>
      auth.login({ username: 'mehmet', secret: 'mehmet-123', device: { kind: 'desktop', deviceName: 'PC' } })
    const s1 = login()
    svc.updateUser(owner, u.id, { roleId: roleId(h, 'housekeeping') })
    expect(auth.resolveSession(s1.token)).toBeNull()
    const s2 = login()
    svc.setActive(owner, u.id, false)
    expect(auth.resolveSession(s2.token)).toBeNull()
    expect(svc.listUsers(owner).map((x) => x.username)).toEqual(['sahip'])
    svc.setActive(owner, u.id, true)
    svc.resetPassword(owner, u.id, 'sifirlanan-1')
    expect(
      auth.login({
        username: 'mehmet',
        secret: 'sifirlanan-1',
        device: { kind: 'desktop', deviceName: 'PC' }
      }).mustChange
    ).toBe(true)
    expect(() => svc.listUsers(roleCtx('manager'))).toThrow(/PERMISSION_DENIED/)
    expect(() => svc.listRoles(roleCtx('accountant'))).toThrow(/PERMISSION_DENIED/)
  })
})

describe('denetim kaydı (G-24)', () => {
  it('her yazma kim, ne zaman, hangi cihaz ile listelenir; sayfalama imleçle; yalnız sahip görür', async () => {
    handle = await seededDatabase()
    const clock = testClock('2026-10-01T09:00:00.000Z')
    const deps = depsOf(handle, clock)
    const audit = createAuditService(deps)
    const settingsSvc = createSettingsService(handle.db, clock)
    for (let i = 0; i < 5; i++) {
      clock.advance(1)
      settingsSvc.set(owner, { 'hotel.name': `Otel ${i}` })
    }
    const first = audit.list(owner, { entity: 'settings', limit: 2 })
    expect(first.entries).toHaveLength(2)
    expect(first.entries[0]).toMatchObject({ entityId: 'hotel.name', after: 'Otel 4', userId: 'u-owner' })
    const second = audit.list(owner, { entity: 'settings', limit: 2, cursor: first.nextCursor! })
    expect(second.entries[0]?.after).toBe('Otel 2')
    const third = audit.list(owner, { entity: 'settings', limit: 2, cursor: second.nextCursor! })
    expect(third.entries).toHaveLength(1)
    expect(third.nextCursor).toBeNull()
    expect(audit.list(owner, { from: '2026-10-01T09:03:00.000Z', entity: 'settings' }).entries).toHaveLength(
      3
    )
    expect(() => audit.list(roleCtx('manager'))).toThrow(/PERMISSION_DENIED/)
    // A role given the audit log but not identity numbers or salaries sees them masked / hidden.
    createGuestsService(deps).create(owner, {
      firstName: 'Belgeli',
      lastName: 'Misafir',
      idDocType: 'passport',
      idDocNumber: 'U12345678'
    })
    const staff = createStaffService(deps)
    staff.createEmployee(owner, {
      firstName: 'Ece',
      lastName: 'Deneme',
      startDate: '2026-01-01',
      salary: { monthlyMinor: 4_000_000, currency: 'TRY' }
    })
    // A staff advance is also an expense row: it is salary data, and an owner-section expense stays hidden.
    staff.addTransaction(owner, {
      employeeId: staff.listEmployees(owner)[0]!.id,
      date: '2026-10-01',
      kind: 'advance',
      amountMinor: 1_250_000
    })
    const ownerSection = handle.db
      .select()
      .from(expenseSections)
      .where(eq(expenseSections.code, 'owner'))
      .get()!
    createExpensesService(deps).createExpense(owner, {
      date: '2026-10-01',
      sectionId: ownerSection.id,
      amountMinor: 7_000,
      currency: 'TRY',
      description: 'Sahibin özel harcaması'
    })
    const auditor = ctxFromPermissions('u-denetci', 'd', 'ipc', { audit_log: 'view' })
    const seen = JSON.stringify(audit.list(auditor, { limit: 500 }).entries)
    expect(seen).not.toContain('U12345678')
    // Without the guests right the guest rows' contents are hidden altogether (P4fix #15); with it, the number
    // shows masked.
    expect(seen).not.toContain('U1••••678')
    const guestReader = ctxFromPermissions('u-denetci2', 'd', 'ipc', { audit_log: 'view', guests: 'view' })
    const seenByGuestReader = JSON.stringify(audit.list(guestReader, { limit: 500 }).entries)
    expect(seenByGuestReader).not.toContain('U12345678')
    expect(seenByGuestReader).toContain('U1••••678')
    expect(seen).not.toContain('4000000')
    expect(seen).not.toContain('1250000')
    expect(seen).not.toContain('Sahibin özel harcaması')
    expect(JSON.stringify(audit.list(owner, { limit: 500 }).entries)).toContain('Sahibin özel harcaması')
    // The full number never reaches the log, not even for the owner: the guest row is its only copy.
    expect(JSON.stringify(audit.list(owner, { limit: 500 }).entries)).toContain('U1••••678')
    expect(JSON.stringify(handle.db.select().from(auditLog).all())).not.toContain('U12345678')
    expect(JSON.stringify(handle.db.select().from(guests).all())).toContain('U12345678')
    expect(() => audit.list(owner, { cursor: 'bozuk' })).toThrow(/errors.validation/)
    expect(handle.db.select().from(settings).where(eq(settings.key, 'hotel.name')).get()?.valueJson).toBe(
      '"Otel 4"'
    )
  })
})
