// Faz 9 bug hunt (P9fix): the same figure on Today, the handover and the reports; the KBS check-out of someone
// never marked; a KBS mark set twice; the hotel's "KBS checks off"; a generated holiday saved unchanged; a
// reopened issue's history.
import { afterEach, describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { createHandlers } from '../api/handlers'
import type { DatabaseHandle } from '../db/client'
import { roomTypes, salesChannels, settings, stayOccupants } from '../db/schema'
import { createServices } from '.'
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
  const book = (roomId: string, checkIn: string, checkOut: string, firstName = 'Ayşe', lastName = 'Yılmaz') =>
    services.reservations.create(owner, {
      guest: { firstName, lastName },
      channelId,
      stays: [{ roomId, checkIn, checkOut, nightlyPriceMinor: 100_000 }]
    })
  const setting = (key: string, value: unknown) =>
    db
      .insert(settings)
      .values({ key, valueJson: JSON.stringify(value), updatedAt: '2026-10-01T00:00:00.000Z' })
      .onConflictDoUpdate({ target: settings.key, set: { valueJson: JSON.stringify(value) } })
      .run()
  const summary = () =>
    (createHandlers(services) as unknown as Record<string, (c: unknown, i: unknown) => { tasks: unknown[] }>)[
      'today.summary'
    ]!(owner, {})
  return { db, clock, services, room, book, setting, summary }
}

describe('Bugün ↔ vardiya devri ↔ rapor aynı sayıyı verir', () => {
  it('çıkış günü geçmiş ve hâlâ odada olan konaklama "Bugün çıkacaklar"da vurgulu (P9fix #4)', async () => {
    const w = await world('2026-10-03T10:00:00.000Z')
    const r1 = w.room('101')
    const made = w.book(r1.id, '2026-10-03', '2026-10-05')
    w.services.reservations.checkIn(owner, made.stays[0]!.id)
    w.clock.set('2026-10-06T07:00:00.000Z')
    const handover = w.services.shifts.handoverSummary(owner)
    const day = w.services.occupants.dayLists(owner)
    expect(handover.overdueCheckouts?.map((s) => s.roomNumber)).toEqual(['101'])
    expect(day.departures?.map((s) => [s.roomNumber, s.checkOut, s.overdue])).toEqual([
      ['101', '2026-10-05', true]
    ])
  })

  it('arızalı oda bu gece satılabilir sayılmaz: Bugün ve rapor aynı doluluğu verir (P9fix #5)', async () => {
    const w = await world('2026-10-05T09:00:00.000Z')
    const r1 = w.room('101')
    const r2 = w.room('102')
    w.book(r1.id, '2026-10-05', '2026-10-06')
    w.services.rooms.setHousekeepingStatus(owner, r2.id, 'out_of_order', 'su kaçağı')
    const day = w.services.occupants.dayLists(owner)
    const rep = w.services.reports.summary(owner, { from: '2026-10-05', to: '2026-10-06' })
    expect(day.sellableRooms).toBe(1)
    expect(day.sellableRooms).toBe(rep.occupancy.sellableNights)
    expect(day.soldTonight).toBe(rep.occupancy.soldNights)
  })

  it('gece yarısından sonra dünün gelmemiş girişi devirde ve Bugün’de; çıkış saatinden sonra düşer (P9fix #7)', async () => {
    const w = await world('2026-10-05T15:00:00.000Z')
    const r1 = w.room('101')
    w.book(r1.id, '2026-10-05', '2026-10-07', 'Geç', 'Gelen')
    w.clock.set('2026-10-05T22:30:00.000Z') // 01:30 on the 6th in Istanbul
    expect(w.services.shifts.handoverSummary(owner).arrivalsPending?.map((s) => s.guestName)).toEqual([
      'Geç Gelen'
    ])
    expect(w.services.occupants.dayLists(owner).arrivals?.map((s) => s.guestName)).toEqual(['Geç Gelen'])
    w.clock.set('2026-10-06T09:00:00.000Z') // 12:00, the check-out time
    expect(w.services.shifts.handoverSummary(owner).arrivalsPending).toEqual([])
    expect(w.services.occupants.dayLists(owner).arrivals).toEqual([])
  })

  it('tarihsiz derin temizlik görevi Bugün’de de sayılır: Bugün = devir (P9fix #11)', async () => {
    const w = await world('2026-10-01T09:00:00.000Z')
    const r1 = w.room('101')
    w.services.tasks.addTemplate(owner, {
      title: 'Derin temizlik',
      recurrence: { kind: 'everyNStays', n: 1 }
    })
    w.clock.set('2026-10-02T09:00:00.000Z')
    const made = w.book(r1.id, '2026-10-02', '2026-10-03')
    w.services.reservations.checkIn(owner, made.stays[0]!.id)
    w.clock.set('2026-10-03T08:00:00.000Z')
    w.services.reservations.checkOut(owner, made.stays[0]!.id)
    const handover = w.services.shifts.handoverSummary(owner)
    expect(w.summary().tasks.length).toBe(handover.openTasks?.length)
    expect(handover.openTasks?.some((t) => t.dueAt === null)).toBe(true)
  })
})

describe('KBS işaretleri', () => {
  it('KBS girişi işaretlenmeden ayrılan kişi için "KBS çıkışını yaptım" iki işareti birden koyar (P9fix #3)', async () => {
    const w = await world('2026-10-05T09:00:00.000Z')
    const r1 = w.room('101')
    const made = w.book(r1.id, '2026-10-05', '2026-10-06')
    const stayId = made.stays[0]!.id
    w.services.reservations.checkIn(owner, stayId)
    w.clock.set('2026-10-06T08:00:00.000Z')
    w.services.reservations.checkOut(owner, stayId)
    const pending = w.services.occupants.inHouseView(owner).checkoutPending
    expect(pending).toEqual([expect.objectContaining({ kbsReported: false })])
    const row = w.services.occupants.markKbsCheckout(owner, pending[0]!.occupantId)
    expect(row.kbsReportedAt).not.toBeNull()
    expect(row.kbsCheckoutAt).not.toBeNull()
    expect(w.services.occupants.inHouseView(owner).checkoutPending).toEqual([])
  })

  it('otelde kalan, girişi işaretlenmemiş kişide çıkış işareti reddedilir', async () => {
    const w = await world('2026-10-05T09:00:00.000Z')
    const r1 = w.room('101')
    const made = w.book(r1.id, '2026-10-05', '2026-10-07')
    w.services.reservations.checkIn(owner, made.stays[0]!.id)
    const person = w.db.select().from(stayOccupants).get()!
    expect(() => w.services.occupants.markKbsCheckout(owner, person.id)).toThrow(
      expect.objectContaining({ messageKey: 'errors.kbsNotReported' })
    )
  })

  it('işaret zaten varken yeniden işaretlemek ilk "kim, ne zaman"ı ezmez (P9fix #15)', async () => {
    const w = await world('2026-10-05T09:00:00.000Z')
    const r1 = w.room('101')
    const made = w.book(r1.id, '2026-10-05', '2026-10-07')
    w.services.reservations.checkIn(owner, made.stays[0]!.id)
    const person = w.db.select().from(stayOccupants).get()!
    const first = w.services.occupants.markKbsReported(owner, person.id)
    w.clock.set('2026-10-05T12:00:00.000Z')
    const again = w.services.occupants.markKbsReported(roleCtx('reception', 'u-other'), person.id)
    expect([again.kbsReportedAt, again.kbsReportedBy]).toEqual([first.kbsReportedAt, first.kbsReportedBy])
  })

  it('KBS kontrolleri kapalıyken takvim çubuğu ve Otelde kalanlar kimseyi eksik göstermez (P9fix #14)', async () => {
    const w = await world('2026-10-05T09:00:00.000Z')
    const r1 = w.room('101')
    const made = w.book(r1.id, '2026-10-05', '2026-10-07')
    w.services.reservations.checkIn(owner, made.stays[0]!.id)
    const grid = () => w.services.calendar.grid(owner, { from: '2026-10-01', to: '2026-10-15' })
    expect(grid().stays.map((s) => s.kbsMissing)).toEqual([true])
    expect(w.services.occupants.inHouseView(owner).kbsChecks).toBe(true)
    w.setting('kbs.checksEnabled', false)
    expect(grid().stays.map((s) => s.kbsMissing)).toEqual([false])
    expect(w.services.occupants.inHouseView(owner)).toMatchObject({ kbsChecks: false, checkoutPending: [] })
  })
})

describe('bayram değiştirilmeden kaydedilince üretilmiş kalır (P9fix #10)', () => {
  it('aynı değerlerle düzenleme yazmaz; gerçek bir değişiklik "user" yapar', async () => {
    const w = await world('2026-10-05T09:00:00.000Z')
    const days = w.services.calendar.listRange(owner, '2026-10-01', '2026-11-01')
    const holiday = days.find((d) => d.date === '2026-10-29' && d.kind === 'holiday')!
    expect(holiday.source).toBe('generated')
    const same = w.services.calendar.editDay(owner, holiday.id, {
      kind: holiday.kind,
      title: holiday.titleI18n?.tr ?? holiday.title ?? '',
      note: holiday.note,
      color: holiday.color,
      recurringYearly: holiday.recurringYearly
    })
    expect(same.source).toBe('generated')
    const changed = w.services.calendar.editDay(owner, holiday.id, { note: 'Resepsiyon yarım gün' })
    expect(changed.source).toBe('user')
  })
})

describe('yeniden açılan arıza (P9fix #19)', () => {
  it('eski çözüm notu açık arızada kalmaz; geçmişte çözüm ve yeniden açma nedeniyle görünür', async () => {
    const w = await world('2026-10-05T09:00:00.000Z')
    const r1 = w.room('101')
    const issue = w.services.roomIssues.create(owner, { roomId: r1.id, title: 'Musluk damlıyor' })
    w.clock.set('2026-10-05T10:00:00.000Z')
    w.services.roomIssues.resolve(owner, issue.id, { resolutionNote: 'Conta değişti' })
    w.clock.set('2026-10-06T10:00:00.000Z')
    const reopened = w.services.roomIssues.reopen(owner, issue.id, 'Yine damlıyor')
    expect(reopened.resolutionNote).toBeNull()
    expect(reopened.history.map((h) => [h.kind, h.note])).toEqual([
      ['resolved', 'Conta değişti'],
      ['reopened', 'Yine damlıyor']
    ])
    w.clock.set('2026-10-07T10:00:00.000Z')
    const again = w.services.roomIssues.resolve(owner, issue.id, {})
    expect(again.resolutionNote).toBeNull()
    expect(again.history.map((h) => [h.kind, h.note])).toEqual([
      ['resolved', 'Conta değişti'],
      ['reopened', 'Yine damlıyor'],
      ['resolved', null]
    ])
  })
})
