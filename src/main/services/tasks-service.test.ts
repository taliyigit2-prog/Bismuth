import { afterEach, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { depsOf, roleCtx, testClock } from '../../../tests/factories/ctx'
import { seededDatabase } from '../../../tests/factories/db'
import type { SystemRoleCode } from '@shared/permissions'
import type { DatabaseHandle } from '../db/client'
import { roles, roomTypes, salesChannels, taskTemplates, tasks, users } from '../db/schema'
import { createReservationsService } from './reservations-service'
import { createRoomsService } from './rooms-service'
import { createTasksService, TEMPLATE_CHANGED_REASON } from './tasks-service'
import { createUsersService } from './users-service'

const owner = roleCtx('owner')
let handle: DatabaseHandle
afterEach(() => handle?.close())

async function setup() {
  handle = await seededDatabase()
  const clock = testClock('2026-10-01T09:00:00.000Z')
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
  const roleId = (code: SystemRoleCode) =>
    handle.db.select().from(roles).where(eq(roles.code, code)).get()!.id
  /** A user row of a system role, so the service can see which role the ctx belongs to. */
  const user = (code: SystemRoleCode, id = `user-${code}`) => {
    handle.db
      .insert(users)
      .values({
        id,
        username: id,
        displayName: id,
        roleId: roleId(code),
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
  return { clock, svc, res, room, roleId, user, templateByCode, ofTemplate }
}

describe('görev şablonları ve oluşturma (§6.8, K-34)', () => {
  it('"her gün 12:00" şablonu iki kez işlenince kopya oluşmaz; çakışan aralık yalnız yenileri ekler', async () => {
    const { svc, ofTemplate } = await setup()
    const t = svc.createTemplate(owner, {
      title: 'Çıkış yapmayan odaları ara',
      recurrence: { kind: 'daily', time: '12:00' },
      firstDueAt: '2026-10-01'
    })
    const first = svc.materialize(owner, '2026-10-01', '2026-10-08')
    expect(first.filter((x) => x.templateId === t.id).map((x) => x.dueAt)).toEqual([
      '2026-10-01T12:00',
      '2026-10-02T12:00',
      '2026-10-03T12:00',
      '2026-10-04T12:00',
      '2026-10-05T12:00',
      '2026-10-06T12:00',
      '2026-10-07T12:00'
    ])
    expect(svc.materialize(owner, '2026-10-01', '2026-10-08')).toEqual([])
    const more = svc.materialize(owner, '2026-10-05', '2026-10-10')
    expect(more.filter((x) => x.templateId === t.id).map((x) => x.dueAt)).toEqual([
      '2026-10-08T12:00',
      '2026-10-09T12:00'
    ])
    expect(ofTemplate(t.id)).toHaveLength(9)
  })

  it('tohumdaki yasal hatırlatmalar etkin gelir: KBS çıkış kontrolü her gün 12:30, istatistik her ayın 10’u (1’inden hatırlatır)', async () => {
    const { svc, templateByCode } = await setup()
    const made = svc.materialize(owner, '2026-10-01', '2026-11-02')
    const kbs = templateByCode('legal_kbs_checkout')
    const stats = templateByCode('legal_tourism_stats')
    expect(made.filter((x) => x.templateId === kbs.id)).toHaveLength(32)
    // G-93: due at the end of the 10th (late only after it); the reminder starts on the 1st at 09:00.
    expect(made.filter((x) => x.templateId === stats.id).map((x) => x.dueAt)).toEqual(['2026-10-10T23:59'])
    expect(stats.remindMinutesBefore).toBe(9 * 24 * 60 + 14 * 60 + 59)
    expect(made.find((x) => x.templateId === kbs.id)?.title).toBe('KBS çıkış bildirimlerini kontrol et')
    const view = svc.listTasks(owner, { templateId: kbs.id }).at(0)!
    expect(view.titleI18n?.en).toBe('Check KBS check-out reports')
  })

  it('şablonun saati değişince bekleyen görevler iptal olur; eski saate dönünce aynı görevler geri açılır', async () => {
    const { svc, clock, ofTemplate } = await setup()
    const t = svc.createTemplate(owner, {
      title: 'Lobi çiçeklerini sula',
      recurrence: { kind: 'daily', time: '12:00' },
      firstDueAt: '2026-10-01'
    })
    svc.materialize(owner, '2026-10-01', '2026-10-04')
    clock.set('2026-10-02T06:00:00.000Z') // 09:00 in Istanbul: the 1 October task is already past
    svc.updateTemplate(owner, t.id, { recurrence: { kind: 'daily', time: '13:00' } })
    const statusOf = () =>
      ofTemplate(t.id)
        .map((x) => `${x.dueAt} ${x.status}${x.cancelReason ? ` ${x.cancelReason}` : ''}`)
        .sort()
    expect(statusOf()).toEqual([
      '2026-10-01T12:00 open',
      `2026-10-02T12:00 cancelled ${TEMPLATE_CHANGED_REASON}`,
      `2026-10-03T12:00 cancelled ${TEMPLATE_CHANGED_REASON}`
    ])
    svc.materialize(owner, '2026-10-02', '2026-10-04')
    expect(ofTemplate(t.id).filter((x) => x.status === 'open')).toHaveLength(3)
    svc.updateTemplate(owner, t.id, { recurrence: { kind: 'daily', time: '12:00' } })
    svc.materialize(owner, '2026-10-02', '2026-10-04')
    expect(statusOf()).toEqual([
      '2026-10-01T12:00 open',
      '2026-10-02T12:00 open',
      `2026-10-02T13:00 cancelled ${TEMPLATE_CHANGED_REASON}`,
      '2026-10-03T12:00 open',
      `2026-10-03T13:00 cancelled ${TEMPLATE_CHANGED_REASON}`
    ])
  })

  it('şablonun yalnız başlığı değişince türü (bakım/yasal) korunur; boş yama reddedilir', async () => {
    const { svc, templateByCode } = await setup()
    const legal = templateByCode('legal_kbs_checkout')
    const renamed = svc.updateTemplate(owner, legal.id, { title: 'KBS çıkışlarını kontrol et' })
    expect(renamed).toMatchObject({ kind: 'legal', title: 'KBS çıkışlarını kontrol et', titleI18n: null })
    expect(() => svc.updateTemplate(owner, legal.id, {})).toThrow(/errors.validation/)
  })

  it('kapatılan şablonun bekleyen görevleri iptal olur ve yeni görev üretilmez', async () => {
    const { svc, ofTemplate } = await setup()
    const t = svc.createTemplate(owner, {
      title: 'Kasa sayımı',
      recurrence: { kind: 'weekly', weekdays: [1], time: '10:00' },
      firstDueAt: '2026-10-01'
    })
    svc.materialize(owner, '2026-10-01', '2026-10-20')
    expect(ofTemplate(t.id).map((x) => x.dueAt)).toEqual([
      '2026-10-05T10:00',
      '2026-10-12T10:00',
      '2026-10-19T10:00'
    ])
    svc.deactivateTemplate(owner, t.id)
    expect(ofTemplate(t.id).every((x) => x.status === 'cancelled')).toBe(true)
    expect(svc.materialize(owner, '2026-10-01', '2026-11-01').filter((x) => x.templateId === t.id)).toEqual(
      []
    )
    expect(svc.listTemplates(owner).some((x) => x.id === t.id)).toBe(false)
    expect(svc.listTemplates(owner, { includeInactive: true }).some((x) => x.id === t.id)).toBe(true)
  })

  it('bakım hatırlatması (6 ayda bir) yapıldığı günden sayılır; tik geri alınınca planlanan sonraki iptal olur', async () => {
    const { svc, clock, templateByCode, ofTemplate } = await setup()
    // The seeded "su deposu temizliği" suggestion (every 6 months) is switched on with a first due.
    const tpl = svc.activateTemplate(owner, templateByCode('water_tank').id, {
      firstDueAt: '2026-10-05T10:00'
    })
    expect(tpl).toMatchObject({ active: true, suggested: false, firstDueAt: '2026-10-05T10:00' })
    const mine = (list: { templateId: string | null }[]) => list.filter((x) => x.templateId === tpl.id)
    const [due] = mine(svc.materialize(owner, '2026-10-01', '2027-12-31')) as ReturnType<typeof ofTemplate>
    expect(due?.dueAt).toBe('2026-10-05T10:00')
    clock.set('2026-10-07T08:00:00.000Z')
    svc.done(owner, due!.id)
    const [next] = mine(svc.materialize(owner, '2026-10-01', '2027-12-31')) as ReturnType<typeof ofTemplate>
    expect(next?.dueAt).toBe('2027-04-07T10:00')
    expect(mine(svc.materialize(owner, '2026-10-01', '2027-12-31'))).toEqual([])
    svc.undoDone(owner, due!.id, 'yanlış işaret')
    const rows = ofTemplate(tpl.id)
    expect(rows.find((x) => x.id === next!.id)).toMatchObject({
      status: 'cancelled',
      cancelReason: TEMPLATE_CHANGED_REASON
    })
    expect(rows.find((x) => x.id === due!.id)).toMatchObject({ status: 'open', doneAt: null })
    expect(templateByCode('water_tank').lastDoneAt).toBeNull()
  })

  it('her 10 konaklamada bir derin temizlik: 9. çıkışta yok, 10. çıkışta tek görev, tekrar çağrıda ikinci görev yok', async () => {
    const { svc, res, room, clock, templateByCode, ofTemplate } = await setup()
    const r = room('501')
    const other = room('502')
    const channelId = handle.db.select().from(salesChannels).where(eq(salesChannels.code, 'direct')).get()!.id
    const deep = templateByCode('deep_clean_every_n')
    const stayIn = (roomId: string, day: number) => {
      const checkIn = `2026-10-${String(day).padStart(2, '0')}`
      const checkOut = `2026-10-${String(day + 1).padStart(2, '0')}`
      clock.set(`${checkIn}T11:00:00.000Z`)
      const made = res.create(owner, {
        guest: { firstName: `Misafir ${day}` },
        channelId,
        stays: [{ roomId, checkIn, checkOut, nightlyPriceMinor: 100_000 }]
      })
      const stayId = made.stays[0]!.id
      res.checkIn(owner, stayId)
      clock.set(`${checkOut}T07:00:00.000Z`)
      res.checkOut(owner, stayId)
    }
    for (let day = 2; day <= 10; day++) stayIn(r.id, day)
    stayIn(other.id, 2)
    expect(ofTemplate(deep.id)).toEqual([])
    stayIn(r.id, 11)
    const opened = ofTemplate(deep.id)
    expect(opened).toHaveLength(1)
    expect(opened[0]).toMatchObject({
      roomId: r.id,
      dueAt: null,
      status: 'open',
      title: 'Odayı derin temizle'
    })
    expect(svc.onCheckout(owner, r.id, '2026-10-12')).toEqual([])
    expect(ofTemplate(deep.id)).toHaveLength(1)

    clock.set('2026-10-12T12:00:00.000Z')
    svc.done(owner, opened[0]!.id)
    for (let day = 12; day <= 20; day++) stayIn(r.id, day)
    expect(ofTemplate(deep.id).filter((x) => x.status === 'open')).toEqual([])
    stayIn(r.id, 21)
    expect(ofTemplate(deep.id).filter((x) => x.status === 'open')).toHaveLength(1)
  })

  it('n verilmeyen "her N konaklama" şablonu otelin ayarını (tasks.everyNStays) alır', async () => {
    const { svc } = await setup()
    const t = svc.createTemplate(owner, { title: 'Perdeleri yıka', recurrence: { kind: 'everyNStays' } })
    expect(t.recurrence).toMatchObject({ kind: 'everyNStays', n: 10 })
    const own = svc.createTemplate(owner, {
      title: 'Halı yıkama',
      recurrence: { kind: 'everyNStays', n: 25 }
    })
    expect(own.recurrence).toMatchObject({ n: 25 })
  })

  it('geciken açık görev için tek bildirim; ikinci çalıştırmada tekrar etmez', async () => {
    const { svc, clock } = await setup()
    const late = svc.createTask(owner, { title: 'Sigortayı yenile', dueAt: '2026-10-01T10:00' })
    svc.createTask(owner, { title: 'Yarınki iş', dueAt: '2026-10-02T10:00' })
    svc.createTask(owner, { title: 'Tarihsiz iş' })
    clock.set('2026-10-01T09:00:00.000Z') // 12:00 in Istanbul
    const sent = svc.notifyOverdue(owner)
    expect(sent.map((n) => n.refId)).toEqual([late.id])
    expect(svc.notifyOverdue(owner)).toEqual([])
    expect(svc.listTasks(owner).find((x) => x.id === late.id)?.overdue).toBe(true)
  })

  it('tarihli görevler önce, tarihsizler sonda listelenir; durum ve tarih süzgeci uygulanır', async () => {
    const { svc } = await setup()
    const a = svc.createTask(owner, { title: 'B', dueAt: '2026-10-03' })
    const b = svc.createTask(owner, { title: 'A', dueAt: '2026-10-02T15:00' })
    const c = svc.createTask(owner, { title: 'C' })
    expect(svc.listTasks(owner).map((x) => x.id)).toEqual([b.id, a.id, c.id])
    expect(svc.listTasks(owner, { dueFrom: '2026-10-03', withDueOnly: true }).map((x) => x.id)).toEqual([
      a.id
    ])
    expect(svc.listTasks(owner, { dueTo: '2026-10-03' }).map((x) => x.id)).toEqual([b.id, c.id])
    svc.cancel(owner, c.id, 'gerek kalmadı')
    expect(svc.listTasks(owner, { status: ['open'] }).map((x) => x.id)).toEqual([b.id, a.id])
    expect(() => svc.cancel(owner, c.id, 'tekrar')).toThrow(/errors.taskNotOpen/)
    expect(() => svc.undoDone(owner, a.id)).toThrow(/errors.taskNotDone/)
  })
})

describe('görev görünürlüğü ve yetki (§6.17, G-23)', () => {
  it('temizlik görevlisi yalnız kendisine ve rolüne verilen görevleri görür; resepsiyon hepsini görür', async () => {
    const { svc, user, roleId } = await setup()
    const hk = user('housekeeping', 'u-hk')
    const hk2 = user('housekeeping', 'u-hk2')
    const reception = user('reception', 'u-rec')
    const employee = user('employee', 'u-emp')
    const mine = svc.createTask(reception, { title: 'Oda 501 havlu', assigneeUserId: 'u-hk' })
    const role = svc.createTask(reception, { title: 'Kat 2 koridor', assigneeRoleId: roleId('housekeeping') })
    const open = svc.createTask(reception, { title: 'Genel iş' })
    const recOnly = svc.createTask(reception, { title: 'Faturayı ara', assigneeUserId: 'u-rec' })
    const peer = svc.createTask(reception, { title: 'Başkasının işi', assigneeUserId: 'u-hk2' })
    const ids = (ctx: typeof hk) =>
      svc
        .listTasks(ctx)
        .map((x) => x.id)
        .sort()
    expect(ids(hk)).toEqual([mine.id, role.id].sort())
    expect(ids(hk2)).toEqual([role.id, peer.id].sort())
    expect(ids(reception)).toEqual([mine.id, role.id, open.id, recOnly.id, peer.id].sort())
    expect(ids(employee)).toEqual([])
    expect(svc.done(hk, mine.id).status).toBe('done')
    expect(() => svc.done(hk, peer.id)).toThrow(/PERMISSION_DENIED/)
    expect(() => svc.done(hk, open.id)).toThrow(/PERMISSION_DENIED/)
    // An own-tasks-only role may still write its own one-off task ("depo eksik") but not plan templates.
    expect(svc.createTask(hk, { title: 'Depoda deterjan bitti' }).createdBy).toBe('u-hk')
    expect(() =>
      svc.createTemplate(hk, { title: 'X', recurrence: { kind: 'daily', time: '09:00' } })
    ).toThrow(/PERMISSION_DENIED/)
  })

  it('"yalnız kendi görevleri" rolün ayarıdır: sahip kapatınca temizlik rolü genel işi de görür', async () => {
    const { svc, user, roleId, clock } = await setup()
    const hk = user('housekeeping', 'u-hk')
    const open = svc.createTask(owner, { title: 'Genel iş' })
    const sees = () => svc.listTasks(hk).map((x) => x.id)
    expect(sees()).not.toContain(open.id)
    const usersSvc = createUsersService(depsOf(handle, clock))
    expect(usersSvc.updateRole(owner, roleId('housekeeping'), { tasksOwnOnly: false }).tasksOwnOnly).toBe(
      false
    )
    expect(sees()).toContain(open.id)
    const night = usersSvc.createRole(owner, { name: 'Gece temizlik', tasksOwnOnly: true })
    expect(night.tasksOwnOnly).toBe(true)
  })

  it('görüntüleme yetkili kullanıcı görev işaretleyemez; yetkisiz kullanıcı listeyi açamaz', async () => {
    const { svc } = await setup()
    const t = svc.createTask(owner, { title: 'Ortak iş' })
    const viewer = roleCtx('employee', 'not-in-users') // no user row: plain view rights
    expect(svc.listTasks(viewer).map((x) => x.id)).toEqual([t.id])
    expect(() => svc.done(viewer, t.id)).toThrow(/PERMISSION_DENIED/)
    expect(() => svc.createTask(viewer, { title: 'Y' })).toThrow(/PERMISSION_DENIED/)
    const nobody = { ...owner, can: () => false }
    expect(() => svc.listTasks(nobody)).toThrow(/PERMISSION_DENIED/)
    expect(() => svc.materialize(nobody, '2026-10-01', '2026-10-02')).toThrow(/PERMISSION_DENIED/)
    expect(() => svc.notifyOverdue(nobody)).toThrow(/PERMISSION_DENIED/)
  })

  it('bilinmeyen kişi/oda ataması reddedilir', async () => {
    const { svc } = await setup()
    expect(() => svc.createTask(owner, { title: 'X', assigneeUserId: 'yok' })).toThrow(/NOT_FOUND/)
    expect(() => svc.createTask(owner, { title: 'X', roomId: 'yok' })).toThrow(/NOT_FOUND/)
    expect(() => svc.createTask(owner, { title: 'X', assigneeShiftId: 'yok' })).toThrow(/NOT_FOUND/)
    expect(() => svc.createTask(owner, { title: 'X', assigneeRoleId: 'yok' })).toThrow(/NOT_FOUND/)
  })

  it('her yazma audit_log’a düşer', async () => {
    const { svc } = await setup()
    const t = svc.createTask(owner, { title: 'Kayıtlı iş' })
    svc.done(owner, t.id, { note: 'tamam' })
    const rows = handle.sqlite
      .prepare("select action from audit_log where entity = 'task' and entity_id = ? order by rowid")
      .all(t.id) as { action: string }[]
    expect(rows.map((r) => r.action)).toEqual(['create', 'done'])
    expect(
      handle.db
        .select()
        .from(tasks)
        .where(and(eq(tasks.id, t.id), eq(tasks.status, 'done')))
        .get()?.note
    ).toBe('tamam')
  })
})
