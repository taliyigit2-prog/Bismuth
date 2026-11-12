// Faz 9 (P9b) through the one router, as a window or a phone calls it: tasks follow the "Görevler" level and an
// own-tasks-only role (Temizlik) cannot manage repeating tasks; the handover follows "Vardiya notları"; a personal
// note is never readable by anyone else (the owner included); the handover summary of a synthetic day leaves the
// router in the contract's shape and is filled without typing; "okudum" clears the unread badge.
import { afterEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { SYSTEM_ROLE_CODES, defaultPermissions, levelAllows, type SystemRoleCode } from '@shared/permissions'
import { createApiApp } from '../../src/main/api/app'
import { createHandlers } from '../../src/main/api/handlers'
import { handleIpcRequest } from '../../src/main/ipc/handle'
import type { DatabaseHandle } from '../../src/main/db/client'
import { roles, roomTypes, salesChannels, taskTemplates, users } from '../../src/main/db/schema'
import { createServices } from '../../src/main/services'
import { ctxFromPermissions, type Ctx } from '../../src/main/services/context'
import { roleCtx, testClock } from '../factories/ctx'
import { seededDatabase } from '../factories/db'

let handle: DatabaseHandle
afterEach(() => handle?.close())

async function setup(start = '2026-10-01T10:00:00.000Z') {
  handle = await seededDatabase()
  const clock = testClock(start) // 13:00 in Istanbul
  const services = createServices(
    handle,
    { name: 'Bismuth', version: 'test', packaged: false, dataDir: '', electron: null, chrome: null },
    { clock }
  )
  const api = createApiApp({ handlers: createHandlers(services) })
  const call = async (ctx: Ctx, name: string, body: unknown = {}) => {
    const res = await handleIpcRequest(api, ctx, { path: `/api/${name}`, body: JSON.stringify(body) })
    return { status: res.status, body: JSON.parse(res.body) as Record<string, unknown> & unknown[] }
  }
  /** A real account of a system role (the task rules read the role from the user row). */
  const user = (code: SystemRoleCode, id: string, displayName = id) => {
    const roleId = handle.db.select().from(roles).where(eq(roles.code, code)).get()!.id
    handle.db
      .insert(users)
      .values({
        id,
        username: id,
        displayName,
        roleId,
        passwordHash: 'x',
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-01T00:00:00.000Z'
      })
      .run()
    return roleCtx(code, id)
  }
  const standard = handle.db.select().from(roomTypes).where(eq(roomTypes.code, 'standard')).get()!
  const room = (number: string) =>
    services.rooms.createRoom(roleCtx('owner'), {
      number,
      roomTypeId: standard.id,
      beds: 2,
      validFrom: '2026-01-01'
    })
  return { services, call, user, room, clock }
}

const code = (r: { body: unknown }) => (r.body as { error?: { code: string } }).error?.code

describe('görev yetkisi (matrise göre)', () => {
  it.each(SYSTEM_ROLE_CODES)(
    '%s: liste, seçenekler ve görev ekleme "Görevler" düzeyine uyar',
    async (role) => {
      const { call, user } = await setup()
      const ctx = user(role, `u-${role}`)
      const level = defaultPermissions(role).tasks
      const view = levelAllows(level, 'view') ? 200 : 403
      const edit = levelAllows(level, 'edit') ? 200 : 403
      expect((await call(ctx, 'tasks.list', { status: ['open'] })).status).toBe(view)
      expect((await call(ctx, 'tasks.lookups')).status).toBe(view)
      expect((await call(ctx, 'tasks.templates', { kind: ['maintenance'] })).status).toBe(view)
      expect((await call(ctx, 'tasks.stayCounters')).status).toBe(view)
      expect((await call(ctx, 'tasks.create', { title: 'Lobi çiçeklerini sula' })).status).toBe(edit)
    }
  )

  it('yalnız kendi görevlerini gören rol (Temizlik) tekrarlı görev ve öneri yönetemez (403); resepsiyon yönetir', async () => {
    const { call, user, services } = await setup()
    const hk = user('housekeeping', 'u-hk')
    const rec = user('reception', 'u-rec')
    const suggestion = handle.db
      .select()
      .from(taskTemplates)
      .where(eq(taskTemplates.code, 'laundry_out'))
      .get()!
    const repeat = { title: 'Havluları say', recurrence: { kind: 'daily', time: '10:00' } }
    const refused = await call(hk, 'tasks.addTemplate', repeat)
    expect(refused.status).toBe(403)
    expect(code(refused)).toBe('PERMISSION_DENIED')
    expect((await call(hk, 'tasks.setTemplateActive', { id: suggestion.id, active: true })).status).toBe(403)
    expect((await call(hk, 'tasks.dismissSuggestion', { id: suggestion.id })).status).toBe(403)
    expect((await call(rec, 'tasks.addTemplate', repeat)).status).toBe(200)
    expect((await call(rec, 'tasks.setTemplateActive', { id: suggestion.id, active: true })).status).toBe(200)

    // A task given to someone else's role is not hers to tick.
    const other = services.tasks.createTask(roleCtx('owner'), {
      title: 'Kasayı say',
      assigneeUserId: 'u-rec'
    })
    expect((await call(hk, 'tasks.done', { id: other.id })).status).toBe(403)
    const mine = services.tasks.createTask(roleCtx('owner'), { title: 'Kat 2 havlu', assigneeUserId: 'u-hk' })
    const done = await call(hk, 'tasks.done', { id: mine.id })
    expect(done.status).toBe(200)
    expect(done.body).toMatchObject({ status: 'done', doneBy: 'u-hk' })
    expect(
      (await call(roleCtx('employee', 'u-emp'), 'tasks.cancel', { id: mine.id, reason: 'x' })).status
    ).toBe(403)
  })
})

describe('vardiya devri ve not yetkisi', () => {
  it.each(SYSTEM_ROLE_CODES)('%s: özet ve devir "Vardiya notları" düzeyine uyar', async (role) => {
    const { call } = await setup()
    const ctx = roleCtx(role, `u-${role}`)
    const level = defaultPermissions(role).shift_notes
    const view = levelAllows(level, 'view') ? 200 : 403
    const edit = levelAllows(level, 'edit') ? 200 : 403
    expect((await call(ctx, 'shift.summary')).status).toBe(view)
    expect((await call(ctx, 'shift.unreadHandovers')).status).toBe(view)
    expect((await call(ctx, 'shift.handovers', { from: '2026-09-01', to: '2026-10-01' })).status).toBe(view)
    expect((await call(ctx, 'shift.saveHandover', { text: 'Sakin bir gün' })).status).toBe(edit)
    expect((await call(ctx, 'notes.add', { kind: 'board', text: 'Asansör öğlen bakımda' })).status).toBe(edit)
    // Anyone signed in keeps notes to self.
    expect((await call(ctx, 'notes.add', { kind: 'personal', text: 'Kendime' })).status).toBe(200)
  })

  it('kişisel not başka kullanıcıda — Sahip dahil — görünmez, değiştirilemez; yazanda görünür', async () => {
    const { call } = await setup()
    const ayse = roleCtx('reception', 'u-ayse')
    const owner = roleCtx('owner', 'u-owner')
    const added = await call(ayse, 'notes.add', {
      kind: 'personal',
      text: '18:00 Banu Hanım’ı ara',
      remindAt: '2026-10-01T18:00'
    })
    expect(added.status).toBe(200)
    const id = added.body['id'] as string
    const mine = await call(ayse, 'notes.list', {})
    expect((mine.body as unknown as { text: string }[]).map((n) => n.text)).toContain(
      '18:00 Banu Hanım’ı ara'
    )
    for (const other of [owner, roleCtx('manager', 'u-mgr'), roleCtx('reception', 'u-deniz')]) {
      const list = await call(other, 'notes.list', { includeDone: true, includeArchived: true })
      expect(list.status).toBe(200)
      expect(JSON.stringify(list.body)).not.toContain('Banu')
      expect((await call(other, 'notes.update', { id, patch: { text: 'x' } })).status).toBe(404)
      expect((await call(other, 'notes.setState', { id, done: true })).status).toBe(404)
      expect(JSON.stringify((await call(other, 'notes.dueReminders')).body)).not.toContain('Banu')
    }
    // The audit log keeps the note's id and state, never its text.
    const audit = await call(owner, 'audit.list', {})
    expect(JSON.stringify(audit.body)).not.toContain('Banu')
  })
})

describe('devir özeti (§6.16) — sentetik gün', () => {
  it('2 gelmemiş giriş, 1 KBS eksik, 1 bakiyeli konaklama, 1 açık görev elle yazılmadan dolar; devir saklanır, gelen vardiya okur', async () => {
    const { services, call, room, clock } = await setup('2026-10-01T07:00:00.000Z')
    const owner = roleCtx('owner', 'u-owner')
    const [r101, r102, r103] = [room('101'), room('102'), room('103')]
    const channelId = handle.db.select().from(salesChannels).where(eq(salesChannels.code, 'direct')).get()!.id
    const book = (roomId: string, checkIn: string, checkOut: string, firstName: string) =>
      services.reservations.create(owner, {
        guest: { firstName, lastName: 'Örnek' },
        channelId,
        stays: [{ roomId, checkIn, checkOut, nightlyPriceMinor: 150_000 }]
      })
    book(r101.id, '2026-10-01', '2026-10-03', 'Ada')
    book(r102.id, '2026-10-01', '2026-10-02', 'Can')
    const staying = book(r103.id, '2026-09-30', '2026-10-04', 'Eda')
    clock.set('2026-09-30T12:00:00.000Z')
    services.reservations.checkIn(owner, staying.stays[0]!.id)
    const primary = services.occupants.list(owner, staying.stays[0]!.id)[0]!
    services.occupants.markKbsReported(owner, primary.id)
    services.occupants.add(owner, staying.stays[0]!.id, { fullName: 'Efe Örnek' })
    clock.set('2026-10-01T07:00:00.000Z')
    services.tasks.createTask(owner, { title: '102’ye bebek yatağı koy', dueAt: '2026-10-01T14:00' })
    // Tomorrow's task is not the next shift's business.
    services.tasks.createTask(owner, { title: 'Yarınki iş', dueAt: '2026-10-02T10:00' })

    const day = roleCtx('reception', 'u-ayse')
    const summary = await call(day, 'shift.summary')
    expect(summary.status).toBe(200)
    const s = summary.body as unknown as {
      arrivalsPending: { roomNumber: string }[]
      kbsMissing: { roomNumber: string; fullName: string; kind: string }[]
      unpaid: { roomNumbers: string[]; balanceMinor: number }[]
      openTasks: { title: string }[]
      inHouse: { rooms: number; people: number }
    }
    expect(s.arrivalsPending.map((x) => x.roomNumber)).toEqual(['101', '102'])
    expect(s.kbsMissing.map((k) => [k.roomNumber, k.fullName, k.kind])).toEqual([
      ['103', 'Efe Örnek', 'checkin']
    ])
    expect(s.unpaid.map((u) => [u.roomNumbers, u.balanceMinor])).toEqual([[['103'], 600_000]])
    expect(s.openTasks.map((t) => t.title)).toEqual(['102’ye bebek yatağı koy'])
    expect(s.inHouse).toEqual({ rooms: 1, people: 2 })

    const saved = await call(day, 'shift.saveHandover', { text: '101 geç gelecek, anahtar resepsiyonda.' })
    expect(saved.status).toBe(200)
    const id = saved.body['id'] as string
    // Later records do not change the snapshot.
    services.tasks.createTask(owner, { title: 'Sonradan eklenen' })
    const night = roleCtx('reception', 'u-mehmet')
    const unread = await call(night, 'shift.unreadHandovers')
    expect((unread.body as unknown as { id: string; summary: typeof s }[]).map((h) => h.id)).toEqual([id])
    expect((unread.body as unknown as { summary: typeof s }[])[0]!.summary.openTasks).toHaveLength(1)
    expect(((await call(day, 'shift.unreadHandovers')).body as unknown[]).length).toBe(0)
    expect((await call(day, 'shift.acknowledge', { id })).status).toBe(409)
    clock.set('2026-10-01T18:05:00.000Z')
    const read = await call(night, 'shift.acknowledge', { id })
    expect(read.body).toMatchObject({
      acknowledgedBy: 'u-mehmet',
      acknowledgedAt: '2026-10-01T18:05:00.000Z'
    })
    expect(((await call(night, 'shift.unreadHandovers')).body as unknown[]).length).toBe(0)
  })
})

describe('P9fix yetki sızıntıları', () => {
  it('Temizlik rolüne pano için vardiya notu görme verilse de devir özetinde misafir adı görmez (#8)', async () => {
    const { services, room, call } = await setup('2026-10-05T09:00:00.000Z')
    const r1 = room('101')
    const channelId = handle.db.select().from(salesChannels).where(eq(salesChannels.code, 'direct')).get()!.id
    services.reservations.create(roleCtx('owner'), {
      guest: { firstName: 'Gizli', lastName: 'Misafir' },
      channelId,
      stays: [{ roomId: r1.id, checkIn: '2026-10-05', checkOut: '2026-10-07', nightlyPriceMinor: 100_000 }]
    })
    const hk = ctxFromPermissions('u-hk', 'dev', 'ipc', {
      ...defaultPermissions('housekeeping'),
      shift_notes: 'view'
    })
    const s = await call(hk, 'shift.summary')
    expect(s.status).toBe(200)
    expect(s.body['arrivalsPending']).toBeNull()
    expect(s.body['overdueCheckouts']).toBeNull()
    expect(JSON.stringify(s.body)).not.toContain('Gizli')
    const reception = await call(roleCtx('reception'), 'shift.summary')
    expect(JSON.stringify(reception.body)).toContain('Gizli Misafir')
  })

  it('yalnız kendi görevlerini gören rol sorumlusuz eklediği görevi görür ve kapatır (#18)', async () => {
    const { user, call } = await setup()
    const hk = user('housekeeping', 'u-ayse')
    const other = user('housekeeping', 'u-fatma')
    const made = await call(hk, 'tasks.create', { title: 'Kat 2 deposunda havlu bitti' })
    expect(made.status).toBe(200)
    const mine = (await call(hk, 'tasks.list', {})).body as unknown as { title: string }[]
    expect(mine.map((t) => t.title)).toContain('Kat 2 deposunda havlu bitti')
    const theirs = (await call(other, 'tasks.list', {})).body as unknown as { title: string }[]
    expect(theirs.map((t) => t.title)).not.toContain('Kat 2 deposunda havlu bitti')
    expect((await call(hk, 'tasks.done', { id: made.body['id'] })).status).toBe(200)
    expect((await call(other, 'tasks.done', { id: made.body['id'] })).status).toBe(403)
  })
})
