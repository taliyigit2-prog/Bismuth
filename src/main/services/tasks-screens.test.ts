// Faz 9 (P9b): what the Görevler and Bakım screens and the hotel computer's task round read and write — the task
// window without copies, month-end dues (31 → 30 / 28), "3 gün önce" reminders once, the every-N-stays counter
// per room and "yapıldı" from Bakım.
import { afterEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { depsOf, roleCtx, testClock } from '../../../tests/factories/ctx'
import { seededDatabase } from '../../../tests/factories/db'
import type { SystemRoleCode } from '@shared/permissions'
import type { DatabaseHandle } from '../db/client'
import { notifications, roles, roomTypes, salesChannels, taskTemplates, tasks, users } from '../db/schema'
import { createReservationsService } from './reservations-service'
import { createRoomsService } from './rooms-service'
import { createTasksService } from './tasks-service'

const owner = roleCtx('owner')
let handle: DatabaseHandle
afterEach(() => handle?.close())

async function setup(start = '2026-10-01T06:00:00.000Z') {
  handle = await seededDatabase()
  const clock = testClock(start)
  const deps = depsOf(handle, clock)
  const svc = createTasksService(deps)
  const res = createReservationsService({
    ...deps,
    hooks: { onCheckout: (ctx, roomId, date) => svc.onCheckout(ctx, roomId, date) }
  })
  const roomsSvc = createRoomsService(deps)
  const standard = handle.db.select().from(roomTypes).where(eq(roomTypes.code, 'standard')).get()!
  const room = (n: string) =>
    roomsSvc.createRoom(owner, { number: n, roomTypeId: standard.id, beds: 2, validFrom: '2026-01-01' })
  const user = (code: SystemRoleCode, id: string, displayName: string) => {
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
  const templateByCode = (code: string) =>
    handle.db.select().from(taskTemplates).where(eq(taskTemplates.code, code)).get()!
  const ofTemplate = (templateId: string) =>
    handle.db.select().from(tasks).where(eq(tasks.templateId, templateId)).all()
  const channelId = handle.db.select().from(salesChannels).where(eq(salesChannels.code, 'direct')).get()!.id
  /** One night in `roomId` checked in and out (the check-out runs the every-N-stays hook). */
  const stay = (roomId: string, checkIn: string, checkOut: string) => {
    clock.set(`${checkIn}T11:00:00.000Z`)
    const made = res.create(owner, {
      guest: { firstName: `Misafir ${checkIn}` },
      channelId,
      stays: [{ roomId, checkIn, checkOut, nightlyPriceMinor: 100_000 }]
    })
    res.checkIn(owner, made.stays[0]!.id)
    clock.set(`${checkOut}T07:00:00.000Z`)
    res.checkOut(owner, made.stays[0]!.id)
  }
  return { clock, svc, room, user, templateByCode, ofTemplate, stay }
}

describe('görev penceresi ve zamanlayıcı turu (§6.8, §4.9-15)', () => {
  it('"her gün 12:00" şablonu bugünden bir hafta sonrasına günde bir görev üretir; tekrar turda kopya yok', async () => {
    const { svc, clock, ofTemplate } = await setup()
    const t = svc.addTemplate(owner, {
      title: 'Çıkış yapmayan odaları ara',
      recurrence: { kind: 'daily', time: '12:00' },
      firstDueAt: '2026-10-01T12:00'
    })
    const dues = () =>
      ofTemplate(t.id)
        .map((x) => x.dueAt)
        .sort()
    expect(dues()).toEqual([
      '2026-10-01T12:00',
      '2026-10-02T12:00',
      '2026-10-03T12:00',
      '2026-10-04T12:00',
      '2026-10-05T12:00',
      '2026-10-06T12:00',
      '2026-10-07T12:00',
      '2026-10-08T12:00'
    ])
    svc.runSchedule(owner)
    svc.runSchedule(owner)
    expect(dues()).toHaveLength(8)
    // Next day the window moves on by one day only.
    clock.set('2026-10-02T06:00:00.000Z')
    svc.runSchedule(owner)
    expect(dues()).toHaveLength(9)
    expect(dues().at(-1)).toBe('2026-10-09T12:00')
  })

  it('ayın 31’i: kısa ayda son güne düşer (30 Kasım, 28 Şubat); aylık bakım yapıldıkça 31 → 28 → 31 → 30', async () => {
    const { svc, clock, ofTemplate } = await setup('2026-11-25T06:00:00.000Z')
    const monthly = svc.addTemplate(owner, {
      title: 'Ay sonu sayımı',
      recurrence: { kind: 'monthly', day: 31, time: '18:00' },
      firstDueAt: '2026-11-01T00:00'
    })
    expect(ofTemplate(monthly.id).map((x) => x.dueAt)).toEqual(['2026-11-30T18:00'])
    clock.set('2027-02-25T06:00:00.000Z')
    svc.materializeWindow(owner)
    expect(ofTemplate(monthly.id).map((x) => x.dueAt)).toContain('2027-02-28T18:00')

    clock.set('2027-01-20T06:00:00.000Z')
    const elevator = svc.addTemplate(owner, {
      title: 'Asansör bakımı',
      kind: 'maintenance',
      recurrence: { kind: 'interval', unit: 'months', every: 1, time: '10:00' },
      firstDueAt: '2027-01-31T10:00'
    })
    const next = () => svc.templateDetails(owner).find((x) => x.id === elevator.id)!.nextDueAt
    expect(next()).toBe('2027-01-31T10:00')
    for (const [doneOn, expected] of [
      ['2027-01-31', '2027-02-28T10:00'],
      ['2027-02-28', '2027-03-31T10:00'],
      ['2027-03-31', '2027-04-30T10:00']
    ] as const) {
      clock.set(`${doneOn}T15:00:00.000Z`)
      svc.completeTemplate(owner, elevator.id, { doneOn })
      expect(next()).toBe(expected)
    }
    // A late completion counts from the day it was done (K-34).
    clock.set('2027-05-03T08:00:00.000Z')
    svc.completeTemplate(owner, elevator.id, { doneOn: '2027-05-02' })
    expect(next()).toBe('2027-06-02T10:00')
    expect(() => svc.completeTemplate(owner, elevator.id, { doneOn: '2027-05-09' })).toThrow(/VALIDATION/)
  })

  it('3 gün önce hatırlatma: zamanı gelince tek bildirim; tekrar turda yok; vade geçince gecikme bildirimi', async () => {
    const { svc, clock } = await setup('2026-10-01T06:00:00.000Z')
    const tpl = svc.addTemplate(owner, {
      title: 'Yangın tüplerinin kontrolü',
      kind: 'maintenance',
      recurrence: { kind: 'interval', unit: 'years', every: 1, time: '10:00' },
      firstDueAt: '2026-10-20T10:00',
      remindMinutesBefore: 3 * 24 * 60
    })
    // The seeded legal reminders run alongside; look at this reminder's notices only.
    const mine = <T extends { title: string }>(list: T[]) =>
      list.filter((n) => n.title === 'Yangın tüplerinin kontrolü')
    clock.set('2026-10-17T06:59:00.000Z') // 09:59 in Istanbul: one minute early
    expect(mine(svc.runSchedule(owner))).toEqual([])
    clock.set('2026-10-17T07:00:00.000Z')
    const sent = mine(svc.runSchedule(owner))
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({
      kind: 'task_reminder',
      refId: `${tpl.id}|2026-10-20T10:00`,
      body: '2026-10-20T10:00'
    })
    clock.set('2026-10-19T07:00:00.000Z')
    expect(mine(svc.runSchedule(owner))).toEqual([])
    clock.set('2026-10-20T08:00:00.000Z')
    expect(mine(svc.runSchedule(owner)).map((n) => n.kind)).toEqual(['task_overdue'])
    expect(mine(svc.runSchedule(owner))).toEqual([])
    expect(mine(handle.db.select().from(notifications).all())).toHaveLength(2)
  })
})

describe('her N konaklama sayacı (S-94)', () => {
  it('oda bazında sayar; 10. çıkışta görev açılır; Bakım’dan "temizlendi" sayacı sıfırlar; erken temizlik de sıfırlar', async () => {
    const { svc, room, stay, templateByCode, ofTemplate, clock } = await setup()
    const r501 = room('501')
    const r502 = room('502')
    const deep = templateByCode('deep_clean_every_n')
    for (let day = 2; day <= 10; day++)
      stay(r501.id, `2026-10-${String(day).padStart(2, '0')}`, `2026-10-${String(day + 1).padStart(2, '0')}`)
    stay(r502.id, '2026-10-02', '2026-10-03')
    const counter = (roomId: string) =>
      svc
        .stayCounters(owner)
        .find((g) => g.templateId === deep.id)!
        .rooms.find((r) => r.roomId === roomId)!
    expect(counter(r501.id)).toMatchObject({ count: 9, openTaskId: null })
    expect(counter(r502.id)).toMatchObject({ count: 1 })
    stay(r501.id, '2026-10-11', '2026-10-12')
    const open = ofTemplate(deep.id).filter((x) => x.status === 'open')
    expect(open).toHaveLength(1)
    expect(counter(r501.id)).toMatchObject({ count: 10, openTaskId: open[0]!.id })
    // The list shows it as an undated task of the room.
    const item = svc.listItems(owner, { status: ['open'] }).find((x) => x.id === open[0]!.id)!
    expect(item).toMatchObject({ kind: 'maintenance', templateCode: 'deep_clean_every_n', roomNumber: '501' })

    clock.set('2026-10-12T12:00:00.000Z')
    svc.completeTemplate(owner, deep.id, { roomId: r501.id })
    expect(counter(r501.id)).toMatchObject({ count: 0, openTaskId: null })
    expect(counter(r501.id).lastDoneAt).toBe('2026-10-12T12:00:00.000Z')
    // 502 was deep-cleaned early: its counter starts again, no task was waiting.
    svc.completeTemplate(owner, deep.id, { roomId: r502.id })
    expect(counter(r502.id)).toMatchObject({ count: 0 })
    expect(() => svc.completeTemplate(owner, deep.id, {})).toThrow(/VALIDATION/)
  })
})

describe('liste, seçenekler ve öneriler', () => {
  it('liste yapan ve atanan adını, odayı verir; "yapıldı" görünümü son günlerle sınırlanır', async () => {
    const { svc, user, room, clock } = await setup()
    const ayse = user('reception', 'u-ayse', 'Ayşe Kaya')
    const r = room('301')
    const a = svc.createTask(owner, {
      title: 'Minibarı doldur',
      assigneeUserId: 'u-ayse',
      roomId: r.id,
      dueAt: '2026-10-01T15:00'
    })
    const old = svc.createTask(owner, { title: 'Eski iş', dueAt: '2026-09-01T10:00' })
    clock.set('2026-09-01T09:00:00.000Z')
    svc.done(owner, old.id)
    clock.set('2026-10-01T12:00:00.000Z')
    svc.done(ayse, a.id)
    const done = svc.listItems(owner, { status: ['done'], doneFrom: '2026-09-25' })
    expect(done.map((x) => x.title)).toEqual(['Minibarı doldur'])
    expect(done[0]).toMatchObject({
      assigneeName: 'Ayşe Kaya',
      doneByName: 'Ayşe Kaya',
      roomNumber: '301',
      kind: 'general'
    })
  })

  it('seçenekler: temizlik rolü (yalnız kendi görevleri) şablon yönetemez; resepsiyon yönetir', async () => {
    const { svc, user, room } = await setup()
    room('101')
    const hk = user('housekeeping', 'u-hk', 'Fatma')
    const rec = user('reception', 'u-rec', 'Deniz')
    const forHk = svc.lookups(hk)
    expect(forHk.canManage).toBe(false)
    expect(forHk.rooms.map((r) => r.number)).toEqual(['101'])
    expect(forHk.shifts.map((s) => s.code)).toEqual(['day', 'night'])
    expect(svc.lookups(rec).canManage).toBe(true)
    expect(() => svc.addTemplate(hk, { title: 'X', recurrence: { kind: 'daily', time: '09:00' } })).toThrow(
      /PERMISSION_DENIED/
    )
    expect(() => svc.lookups(roleCtx('accountant', 'u-none'))).not.toThrow()
  })

  it('öneri eklenince açılır ve görevleri yazılır; "gerek yok" deneni karttan düşer, yasal hatırlatıcı kapatılır', async () => {
    const { svc, templateByCode, ofTemplate } = await setup()
    const call = templateByCode('call_late_checkouts')
    const on = svc.setTemplateActive(owner, call.id, { active: true })
    expect(on).toMatchObject({ active: true, suggested: false })
    expect(ofTemplate(call.id).length).toBeGreaterThan(0)
    const laundry = templateByCode('laundry_out')
    expect(svc.dismissSuggestion(owner, laundry.id)).toMatchObject({ active: false, suggested: false })
    expect(() => svc.dismissSuggestion(owner, call.id)).toThrow(/VALIDATION/)
    const kbs = templateByCode('legal_kbs_checkout')
    svc.materializeWindow(owner)
    const off = svc.setTemplateActive(owner, kbs.id, { active: false })
    expect(off).toMatchObject({ active: false, nextDueAt: null })
    expect(ofTemplate(kbs.id).some((x) => x.status === 'open' && x.dueAt! > '2026-10-02')).toBe(false)
    const legal = svc.templateDetails(owner, { kind: ['legal'], includeInactive: true })
    expect(legal.find((x) => x.code === 'legal_tourism_stats')).toMatchObject({
      active: true,
      // G-93: due on the 10th, reminded from the 1st.
      nextDueAt: '2026-10-10T23:59'
    })
  })
})
