// Faz 9 bug hunt (P9fix): the maintenance series never stops, the seeded deep clean reaches Temizlik, the tourism
// reminder is due on the 10th and follows the Turizm screen's "bildirildi" mark, open tasks follow their template,
// a switched-off template leaves nothing late behind, and the seed corrects the first release's rows once.
import { afterEach, describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { and, eq } from 'drizzle-orm'
import type { SystemRoleCode } from '@shared/permissions'
import { createHandlers } from '../api/handlers'
import type { DatabaseHandle } from '../db/client'
import { seedBaseData } from '../db/seed/seed'
import { TOURISM_REMIND_MINUTES, TOURISM_RULE, TOURISM_RULE_V1 } from '../db/seed/tasks'
import {
  auditLog,
  kbsImports,
  notifications,
  roles,
  roomTypes,
  salesChannels,
  settings,
  taskTemplates,
  tasks,
  users
} from '../db/schema'
import { createServices } from '.'
import { TEMPLATE_CHANGED_REASON } from './tasks-service'
import { roleCtx, testClock } from '../../../tests/factories/ctx'
import { seededDatabase } from '../../../tests/factories/db'
import { tempDataDir } from '../../../tests/factories/runtime'

const owner = roleCtx('owner')
let handle: DatabaseHandle
afterEach(() => handle?.close())

async function world(start: string) {
  handle = await seededDatabase()
  const clock = testClock(start)
  const dataDir = tempDataDir()
  const runtime = { name: 'Bismuth', version: 'test', packaged: false, dataDir, electron: null, chrome: null }
  const services = createServices(handle, runtime, { clock, attachmentsDir: join(dataDir, 'attachments') })
  const db = handle.db
  const standard = db.select().from(roomTypes).where(eq(roomTypes.code, 'standard')).get()!
  const channelId = db.select().from(salesChannels).where(eq(salesChannels.code, 'direct')).get()!.id
  const room = (number: string) =>
    services.rooms.createRoom(owner, { number, roomTypeId: standard.id, beds: 2, validFrom: '2026-01-01' })
  const ofTemplate = (id: string) =>
    db
      .select()
      .from(tasks)
      .where(eq(tasks.templateId, id))
      .all()
      .sort((a, b) => (a.dueAt ?? '').localeCompare(b.dueAt ?? ''))
  const user = (code: SystemRoleCode, id: string) => {
    const roleId = db.select().from(roles).where(eq(roles.code, code)).get()!.id
    db.insert(users)
      .values({
        id,
        username: id,
        displayName: id,
        roleId,
        passwordHash: 'x',
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-01T00:00:00.000Z'
      })
      .run()
    return roleCtx(code, id)
  }
  const stay = (roomId: string, checkIn: string, checkOut: string) => {
    clock.set(`${checkIn}T10:00:00.000Z`)
    const made = services.reservations.create(owner, {
      guest: { firstName: 'Ayşe', lastName: 'Yılmaz' },
      channelId,
      stays: [{ roomId, checkIn, checkOut, nightlyPriceMinor: 100_000 }]
    })
    const id = made.stays[0]!.id
    services.reservations.checkIn(owner, id)
    clock.set(`${checkOut}T08:00:00.000Z`)
    services.reservations.checkOut(owner, id)
  }
  const template = (code: string) =>
    db.select().from(taskTemplates).where(eq(taskTemplates.code, code)).get()!
  return { db, clock, services, room, ofTemplate, user, stay, template }
}

const day = (m: number, d: number, y = 2026) =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T07:00:00.000Z`
const everyDay = (from: Date, to: Date): string[] => {
  const out: string[] = []
  for (let t = from.getTime(); t <= to.getTime(); t += 86_400_000) out.push(new Date(t).toISOString())
  return out
}

describe('bakım serisi her "Yapıldı"dan sonra ilerler (P9fix #1)', () => {
  it('aynı gün iki kez "Yapıldı": seri durmaz, 2,5 ay sonra yine açık görev vardır', async () => {
    const { clock, services, ofTemplate } = await world('2026-10-05T07:00:00.000Z')
    const t = services.tasks.addTemplate(owner, {
      title: 'Klima filtresi',
      kind: 'maintenance',
      recurrence: { kind: 'interval', unit: 'days', every: 30, time: '10:00' },
      firstDueAt: '2026-10-05T10:00'
    })
    services.tasks.completeTemplate(owner, t.id, {})
    services.tasks.completeTemplate(owner, t.id, {})
    const after = services.tasks.templateDetails(owner).find((x) => x.id === t.id)!
    expect(after.nextDueAt).toBe('2026-12-04T10:00')
    for (const iso of everyDay(new Date(day(10, 6)), new Date(day(12, 20)))) {
      clock.set(iso)
      services.tasks.runSchedule(owner)
    }
    expect(ofTemplate(t.id).some((r) => r.status === 'open')).toBe(true)
  })

  it('üçüncü "Yapıldı" önceki yapılmış kaydı ezmez: üç ayrı yapıldı satırı kalır', async () => {
    const { clock, services, ofTemplate } = await world('2026-10-05T07:00:00.000Z')
    const t = services.tasks.addTemplate(owner, {
      title: 'Klima filtresi',
      kind: 'maintenance',
      recurrence: { kind: 'interval', unit: 'days', every: 30, time: '10:00' },
      firstDueAt: '2026-10-05T10:00'
    })
    services.tasks.completeTemplate(owner, t.id, {})
    services.tasks.completeTemplate(owner, t.id, {})
    const before = ofTemplate(t.id).map((r) => [r.id, r.doneAt])
    clock.set('2026-11-20T07:00:00.000Z')
    services.tasks.completeTemplate(owner, t.id, {})
    const done = ofTemplate(t.id).filter((r) => r.status === 'done')
    expect(done).toHaveLength(3)
    for (const [id, doneAt] of before) expect(done.find((r) => r.id === id)?.doneAt).toBe(doneAt)
  })

  it('7 günlük bakım tam 7 gün erken yapılınca seri durmaz', async () => {
    const { clock, services, ofTemplate } = await world('2026-10-03T07:00:00.000Z')
    const t = services.tasks.addTemplate(owner, {
      title: 'Su deposu',
      kind: 'maintenance',
      recurrence: { kind: 'interval', unit: 'days', every: 7, time: '10:00' },
      firstDueAt: '2026-10-10T10:00'
    })
    services.tasks.completeTemplate(owner, t.id, {})
    for (const iso of everyDay(new Date(day(10, 4)), new Date(day(10, 31)))) {
      clock.set(iso)
      services.tasks.runSchedule(owner)
    }
    expect(ofTemplate(t.id).some((r) => r.status === 'open')).toBe(true)
  })

  it("ayın 31'ine bağlı aylık bakım 30 Kasım'da iki kez yapılınca 31 Ocak'a ilerler", async () => {
    const { clock, services, ofTemplate } = await world('2026-11-28T07:00:00.000Z')
    const t = services.tasks.addTemplate(owner, {
      title: 'Asansör',
      kind: 'maintenance',
      recurrence: { kind: 'interval', unit: 'months', every: 1, time: '10:00' },
      firstDueAt: '2026-10-31T10:00'
    })
    services.tasks.completeTemplate(owner, t.id, { doneOn: '2026-10-31' })
    clock.set('2026-11-30T07:00:00.000Z')
    services.tasks.runSchedule(owner)
    services.tasks.completeTemplate(owner, t.id, {})
    services.tasks.completeTemplate(owner, t.id, {})
    clock.set('2027-01-26T07:00:00.000Z')
    services.tasks.runSchedule(owner)
    expect(
      ofTemplate(t.id)
        .filter((r) => r.status === 'open')
        .map((r) => r.dueAt)
    ).toEqual(['2027-01-31T10:00'])
  })
})

describe('tohumdaki derin temizlik Temizlik rolüne gider (P9fix #2, #16)', () => {
  it('10. konaklamada Temizlik görevi görür ve "Temizlendi" ile kapatır', async () => {
    const w = await world('2026-10-01T09:00:00.000Z')
    const r1 = w.room('101')
    const hk = w.user('housekeeping', 'u-hk')
    const tpl = w.template('deep_clean_every_n')
    for (let i = 0; i < 10; i++) {
      const d = 2 + i * 2
      w.stay(r1.id, `2026-10-${String(d).padStart(2, '0')}`, `2026-10-${String(d + 1).padStart(2, '0')}`)
    }
    expect(w.services.tasks.listItems(hk, { status: ['open'] }).some((x) => x.templateId === tpl.id)).toBe(
      true
    )
    w.services.tasks.completeTemplate(hk, tpl.id, { roomId: r1.id })
    expect(w.ofTemplate(tpl.id).map((x) => x.status)).toEqual(['done'])
  })

  it('görevi bekleyen yokken Temizlik erken temizlik açamaz (düğme yalnız görevi olana)', async () => {
    const w = await world('2026-10-01T09:00:00.000Z')
    const r1 = w.room('101')
    const hk = w.user('housekeeping', 'u-hk')
    expect(() =>
      w.services.tasks.completeTemplate(hk, w.template('deep_clean_every_n').id, { roomId: r1.id })
    ).toThrow(expect.objectContaining({ code: 'PERMISSION_DENIED' }))
  })

  it('tohum N değerini tasks.everyNStays ayarından alır; Bakım kartından N değişir', async () => {
    const fresh = await seededDatabase()
    const now = '2026-10-01T00:00:00.000Z'
    fresh.db.delete(taskTemplates).where(eq(taskTemplates.code, 'deep_clean_every_n')).run()
    fresh.db
      .insert(settings)
      .values({ key: 'tasks.everyNStays', valueJson: '7', updatedAt: now })
      .onConflictDoUpdate({ target: settings.key, set: { valueJson: '7' } })
      .run()
    seedBaseData(fresh.db, new Date(now))
    const row = fresh.db
      .select()
      .from(taskTemplates)
      .where(eq(taskTemplates.code, 'deep_clean_every_n'))
      .get()!
    expect(row.recurrence).toMatchObject({ kind: 'everyNStays', n: 7 })
    fresh.close()

    const w = await world('2026-10-01T09:00:00.000Z')
    w.room('101')
    const tpl = w.template('deep_clean_every_n')
    w.services.tasks.editTemplate(owner, tpl.id, {
      recurrence: { kind: 'everyNStays', n: 6, countDayUse: true }
    })
    expect(w.services.tasks.stayCounters(owner)[0]!.n).toBe(6)
    expect(() =>
      w.services.tasks.editTemplate(w.user('housekeeping', 'u-hk'), tpl.id, {
        recurrence: { kind: 'everyNStays', n: 3, countDayUse: true }
      })
    ).toThrow(expect.objectContaining({ code: 'PERMISSION_DENIED' }))
  })
})

type Summary = {
  reminders: { kind: string; daysLeft: number }[]
  tasks: { templateCode: string | null; overdue: boolean; dueAt: string | null }[]
}

describe("turizm istatistiği görevi ayın 10'unda dolar ve Turizm ekranını izler (P9fix #6)", () => {
  it('ayın 1\'inde gecikme bildirimi yok, hatırlatma var; 2\'sinde Bugün "9 gün kaldı" der ve görev gecikmiş değildir', async () => {
    const w = await world('2026-09-28T09:00:00.000Z')
    w.room('101')
    w.clock.set('2026-10-01T06:10:00.000Z')
    const notices = w.services.tasks.runSchedule(owner)
    const code = w.template('legal_tourism_stats')
    expect(notices.filter((n) => n.kind === 'task_overdue')).toEqual([])
    expect(notices.some((n) => n.kind === 'task_reminder' && n.refId?.startsWith(code.id))).toBe(true)
    w.clock.set('2026-10-02T07:00:00.000Z')
    const handlers = createHandlers(w.services) as unknown as Record<
      string,
      (c: unknown, i: unknown) => Summary
    >
    const s = handlers['today.summary']!(owner, {})
    expect(s.reminders).toEqual([expect.objectContaining({ kind: 'tourism', daysLeft: 8 })])
    expect(s.tasks.filter((t) => t.templateCode === 'legal_tourism_stats' && t.overdue)).toEqual([])
    // On the 11th the duty is late (the round of the 5th wrote it).
    w.clock.set('2026-10-05T07:00:00.000Z')
    w.services.tasks.runSchedule(owner)
    w.clock.set('2026-10-11T07:00:00.000Z')
    w.services.tasks.runSchedule(owner)
    const late = w.ofTemplate(code.id).find((t) => t.dueAt === '2026-10-10T23:59')
    expect(late?.status).toBe('open')
    expect(
      w.db
        .select()
        .from(notifications)
        .where(and(eq(notifications.kind, 'task_overdue'), eq(notifications.refId, late!.id)))
        .all()
    ).toHaveLength(1)
  })

  it('"bildirildi" işareti o ayın görevini kapatır, işaret kalkınca görev yeniden açılır; yazılmamış görev yapıldı olarak yazılır', async () => {
    const w = await world('2026-10-02T07:00:00.000Z')
    const code = w.template('legal_tourism_stats')
    const imp = (id: string) =>
      w.db
        .insert(kbsImports)
        .values({
          id,
          periodYear: 2026,
          periodMonth: 9,
          fileName: `${id}.xlsx`,
          importedAt: '2026-10-02T07:00:00.000Z',
          rowCount: 0,
          sameDayCount: 0,
          activeCount: 0,
          createdAt: '2026-10-02T07:00:00.000Z',
          updatedAt: '2026-10-02T07:00:00.000Z'
        })
        .run()
    imp('IMP0000000000000000000000A')
    imp('IMP0000000000000000000000B')
    // 2 Oct: the 10 Oct task is not written yet; marking writes it as done, the scheduler then adds nothing.
    w.services.tourism.markReported(owner, 'IMP0000000000000000000000A', true)
    w.clock.set('2026-10-05T07:00:00.000Z')
    w.services.tasks.runSchedule(owner)
    expect(w.ofTemplate(code.id).map((t) => [t.dueAt, t.status])).toEqual([['2026-10-10T23:59', 'done']])
    // A second file of the same month still marked: the task stays done when the first mark is taken back.
    w.services.tourism.markReported(owner, 'IMP0000000000000000000000B', true)
    w.services.tourism.markReported(owner, 'IMP0000000000000000000000A', false)
    expect(w.ofTemplate(code.id)[0]!.status).toBe('done')
    w.services.tourism.markReported(owner, 'IMP0000000000000000000000B', false)
    expect(w.ofTemplate(code.id)[0]).toMatchObject({ status: 'open', doneAt: null })
    w.services.tourism.markReported(owner, 'IMP0000000000000000000000A', true)
    expect(w.ofTemplate(code.id)[0]!.status).toBe('done')
    const audits = w.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entity, 'task'), eq(auditLog.reason, 'legal_tourism_stats:2026-09')))
      .all()
    expect(audits.map((a) => a.action)).toEqual(['create', 'reopen', 'done'])
  })

  it("ilk sürümün şablonu (1'i 09:00) açılışta bir kez düzeltilir; otelin değiştirdiği şablona dokunulmaz", async () => {
    const w = await world('2026-10-05T07:00:00.000Z')
    const tpl = w.template('legal_tourism_stats')
    // As the first release left it: rule on the 1st, an overdue open task of 1 Oct.
    w.db
      .update(taskTemplates)
      .set({ recurrence: { ...TOURISM_RULE_V1 }, remindMinutesBefore: null })
      .where(eq(taskTemplates.id, tpl.id))
      .run()
    w.db
      .insert(tasks)
      .values({
        id: '01J00000000000000000000001',
        templateId: tpl.id,
        title: 'x',
        dueAt: '2026-10-01T09:00',
        status: 'open',
        createdAt: '2026-10-01T06:00:00.000Z',
        updatedAt: '2026-10-01T06:00:00.000Z'
      })
      .run()
    const report = seedBaseData(w.db, new Date('2026-10-05T07:00:00.000Z'))
    expect(report.inserted['task_templates_upgraded']).toBe(1)
    expect(w.template('legal_tourism_stats')).toMatchObject({
      recurrence: TOURISM_RULE,
      remindMinutesBefore: TOURISM_REMIND_MINUTES
    })
    expect(w.ofTemplate(tpl.id)[0]).toMatchObject({
      status: 'cancelled',
      cancelReason: TEMPLATE_CHANGED_REASON
    })
    w.services.tasks.runSchedule(owner)
    expect(
      w
        .ofTemplate(tpl.id)
        .filter((t) => t.status === 'open')
        .map((t) => t.dueAt)
    ).toEqual(['2026-10-10T23:59'])
    // Idempotent; a hotel-chosen rule stays.
    expect(seedBaseData(w.db).inserted['task_templates_upgraded']).toBeUndefined()
    w.db
      .update(taskTemplates)
      .set({ recurrence: { kind: 'monthly', day: 1, time: '10:00' }, remindMinutesBefore: null })
      .where(eq(taskTemplates.id, tpl.id))
      .run()
    seedBaseData(w.db)
    expect(w.template('legal_tourism_stats').recurrence).toEqual({ kind: 'monthly', day: 1, time: '10:00' })
  })

  it('sorumlusuz derin temizlik şablonu açılışta Temizlik rolüne verilir, açık görevleri de', async () => {
    const w = await world('2026-10-05T07:00:00.000Z')
    const tpl = w.template('deep_clean_every_n')
    const hkRole = w.db.select().from(roles).where(eq(roles.code, 'housekeeping')).get()!.id
    expect(tpl.assigneeRoleId).toBe(hkRole)
    w.db.update(taskTemplates).set({ assigneeRoleId: null }).where(eq(taskTemplates.id, tpl.id)).run()
    seedBaseData(w.db)
    expect(w.template('deep_clean_every_n').assigneeRoleId).toBe(hkRole)
  })
})

describe('şablon değişince açık görevler izler, kapanınca gecikmiş görev kalmaz (P9fix #12, #13)', () => {
  it('başlık ve sorumlu değişince açık görevler yeni değerleri taşır; yapılmış görev eskisini korur', async () => {
    const w = await world('2026-10-05T07:00:00.000Z')
    const rec = w.user('reception', 'u-rec')
    const t = w.services.tasks.addTemplate(owner, {
      title: 'Lobi çiçekleri',
      recurrence: { kind: 'daily', time: '10:00' },
      firstDueAt: '2026-10-05T10:00'
    })
    const first = w.ofTemplate(t.id)[0]!
    w.services.tasks.done(owner, first.id)
    w.services.tasks.editTemplate(owner, t.id, { title: 'Lobi çiçeklerini sula', assigneeUserId: 'u-rec' })
    const rows = w.ofTemplate(t.id)
    expect(rows.find((r) => r.id === first.id)).toMatchObject({
      title: 'Lobi çiçekleri',
      assigneeUserId: null
    })
    const open = rows.filter((r) => r.status === 'open')
    expect(open.length).toBeGreaterThan(0)
    for (const r of open) expect(r).toMatchObject({ title: 'Lobi çiçeklerini sula', assigneeUserId: 'u-rec' })
    expect(
      w.services.tasks.listItems(rec, { status: ['open'] }).filter((x) => x.templateId === t.id).length
    ).toBe(open.length)
  })

  it('kapatılan şablonun gecikmiş açık görevi de kapanır', async () => {
    const w = await world('2026-10-05T07:00:00.000Z')
    const t = w.services.tasks.addTemplate(owner, {
      title: 'Kasa sayımı',
      recurrence: { kind: 'daily', time: '09:00' },
      firstDueAt: '2026-10-05T09:00'
    })
    w.clock.set('2026-10-06T07:00:00.000Z')
    expect(w.ofTemplate(t.id).find((r) => r.dueAt === '2026-10-05T09:00')?.status).toBe('open')
    w.services.tasks.setTemplateActive(owner, t.id, { active: false })
    expect(w.ofTemplate(t.id).filter((r) => r.status === 'open')).toEqual([])
    expect(
      w.services.tasks.listItems(owner, { status: ['open'] }).filter((x) => x.templateId === t.id)
    ).toEqual([])
  })
})
