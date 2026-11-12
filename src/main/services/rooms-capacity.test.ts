// Ayarlar → Odalar with a validity date (K-27; Faz 4 bug hunt P4fix #1–#3, #15c): a planned change waits for its
// day, an earlier-dated change withdraws a later plan, a room leaves the calendar only after its date and only
// without stays on its closed days, and a room that opens later is neither booked nor counted before that.
import { afterEach, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { localDate as d } from '@shared/date'
import { depsOf, roleCtx, testClock } from '../../../tests/factories/ctx'
import { seededDatabase } from '../../../tests/factories/db'
import type { DatabaseHandle } from '../db/client'
import { auditLog, roomTypes, salesChannels } from '../db/schema'
import { createServices } from './index'

const owner = roleCtx('owner')
let handle: DatabaseHandle
afterEach(() => handle?.close())

async function setup(now = '2026-10-05T09:00:00.000Z') {
  handle = await seededDatabase()
  const clock = testClock(now)
  const svc = createServices(
    handle,
    {
      name: 'Bismuth',
      version: 'test',
      packaged: false,
      dataDir: '/tmp/unused',
      electron: null,
      chrome: null
    },
    { clock: depsOf(handle, clock).clock }
  )
  const standard = handle.db.select().from(roomTypes).where(eq(roomTypes.code, 'standard')).get()!
  const room = (number: string, validFrom = '2026-01-01') =>
    svc.rooms.createRoom(owner, { number, roomTypeId: standard.id, beds: 2, validFrom })
  const direct = handle.db.select().from(salesChannels).where(eq(salesChannels.code, 'direct')).get()!.id
  const book = (roomId: string, checkIn: string, checkOut: string, firstName = 'Örnek') =>
    svc.reservations.create(owner, {
      guest: { firstName, lastName: 'Deneme' },
      channelId: direct,
      stays: [{ roomId, checkIn, checkOut, nightlyPriceMinor: 100_000 }]
    })
  const error = (fn: () => unknown): { messageKey: string; details: Record<string, unknown> } => {
    try {
      fn()
    } catch (e) {
      return e as { messageKey: string; details: Record<string, unknown> }
    }
    throw new Error('expected a refusal')
  }
  return { svc, clock, room, book, error, standard }
}

describe('ileri tarihli kapasite değişikliği (#2)', () => {
  it('1 Aralıktan 3 yatak: bugünkü kart 2 yatak kalır, plan görünür; 1 Aralık gelince kart 3 yatak olur', async () => {
    const { svc, clock, room } = await setup()
    const r101 = room('101')
    const saved = svc.rooms.updateRoom(owner, r101.id, { beds: 3, validFrom: '2026-12-01' })
    expect(saved.beds).toBe(2)
    const card = svc.rooms.listRooms(owner).find((r) => r.id === r101.id)!
    expect(card.beds).toBe(2)
    expect(card.nextChange).toMatchObject({ validFrom: '2026-12-01', beds: 3, active: true })
    expect(svc.rooms.bedsOn(owner, d('2026-10-05'))).toBe(2)
    expect(svc.rooms.bedsOn(owner, d('2026-12-15'))).toBe(3)
    clock.set('2026-12-01T09:00:00.000Z')
    expect(svc.rooms.listRooms(owner).find((r) => r.id === r101.id)).toMatchObject({
      beds: 3,
      nextChange: null
    })
  })

  it('vazgeçip bugünden 2 yatak girilince ileri tarihli plan iptal olur; 15 Aralık toplamı kartla aynı', async () => {
    const { svc, clock, room } = await setup()
    const r101 = room('101')
    room('102')
    svc.rooms.updateRoom(owner, r101.id, { beds: 3, validFrom: '2026-12-01' })
    clock.set('2026-10-06T09:00:00.000Z')
    svc.rooms.updateRoom(owner, r101.id, { beds: 2, validFrom: '2026-10-06' })
    expect(svc.rooms.bedsOn(owner, d('2026-12-15'))).toBe(svc.rooms.bedsOn(owner, d('2026-10-07')))
    expect(svc.rooms.listRooms(owner).find((r) => r.id === r101.id)?.nextChange).toBeNull()
    const history = svc.rooms.capacityHistory(owner, r101.id)
    expect(history.map((c) => [c.validFrom, c.beds, c.cancelledAt !== null])).toEqual([
      ['2026-12-01', 3, true],
      ['2026-01-01', 2, false]
    ])
    const cancelled = handle.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entity, 'room_capacity_change'), eq(auditLog.action, 'cancel')))
      .all()
    expect(cancelled).toHaveLength(1)
  })

  it('planlı değişiklik geri alınır; başlamış değişiklik ve odayı açan ilk satır geri alınmaz', async () => {
    const { svc, room, error } = await setup()
    const r101 = room('101')
    svc.rooms.updateRoom(owner, r101.id, { beds: 1, validFrom: '2026-03-01' })
    svc.rooms.updateRoom(owner, r101.id, { beds: 4, validFrom: '2026-11-01', note: 'ek yatak' })
    const [planned, started, first] = svc.rooms.capacityHistory(owner, r101.id)
    expect(error(() => svc.rooms.cancelCapacityChange(owner, started!.id)).messageKey).toBe(
      'errors.capacityChangeStarted'
    )
    expect(error(() => svc.rooms.cancelCapacityChange(owner, first!.id)).messageKey).toBe(
      'errors.capacityChangeStarted'
    )
    const done = svc.rooms.cancelCapacityChange(owner, planned!.id)
    expect(done.cancelledAt).not.toBeNull()
    expect(svc.rooms.bedsOn(owner, d('2026-11-15'))).toBe(1)
    expect(error(() => svc.rooms.cancelCapacityChange(owner, planned!.id)).messageKey).toBe(
      'errors.alreadyCancelled'
    )
    expect(() => svc.rooms.cancelCapacityChange(roleCtx('reception'), planned!.id)).toThrow(
      /PERMISSION_DENIED/
    )
  })

  it('henüz açılmamış odanın açılış satırı geri alınmaz', async () => {
    const { svc, room, error } = await setup()
    const r601 = room('601', '2026-12-01')
    const [opening] = svc.rooms.capacityHistory(owner, r601.id)
    expect(error(() => svc.rooms.cancelCapacityChange(owner, opening!.id)).messageKey).toBe(
      'errors.capacityFirstChange'
    )
  })
})

describe('odayı kullanımdan kaldırma (#1)', () => {
  it('20 Ekimden kaldırılan odanın 25 Ekim rezervasyonu varsa kapatma reddedilir ve liste döner', async () => {
    const { svc, room, book, error } = await setup()
    const r103 = room('103')
    book(r103.id, '2026-10-10', '2026-10-12', 'Geçmiş')
    const later = book(r103.id, '2026-10-25', '2026-10-27', 'Gelecek')
    const refused = error(() =>
      svc.rooms.updateRoom(owner, r103.id, { active: false, validFrom: '2026-10-20' })
    )
    expect(refused.messageKey).toBe('errors.roomHasStays')
    expect(refused.details).toMatchObject({
      room: '103',
      stays: [{ code: later.reservation.code, guestName: 'Gelecek Deneme', checkIn: '2026-10-25' }]
    })
    // Nothing was written: the room is still in use and has no closing row.
    expect(svc.rooms.capacityHistory(owner, r103.id)).toHaveLength(1)
    svc.reservations.cancel(owner, later.reservation.id, 'misafir vazgeçti')
    expect(svc.rooms.updateRoom(owner, r103.id, { active: false, validFrom: '2026-10-20' }).active).toBe(true)
  })

  it('kaldırılan oda tarihine kadar takvimde ve listede kalır; önceki konaklaması görünür, sonrası kapalı çizilir', async () => {
    const { svc, clock, room, book } = await setup()
    const r103 = room('103')
    room('104')
    book(r103.id, '2026-10-10', '2026-10-12', 'Geçmiş')
    svc.rooms.updateRoom(owner, r103.id, { active: false, validFrom: '2026-10-20' })
    expect(svc.rooms.listRooms(owner).map((r) => r.number)).toEqual(['103', '104'])
    const october = svc.calendar.grid(owner, { from: '2026-10-01', to: '2026-11-01' })
    expect(october.rooms.map((r) => r.number)).toEqual(['103', '104'])
    expect(october.stays.filter((s) => s.roomId === r103.id)).toHaveLength(1)
    expect(october.blocks.filter((b) => b.roomId === r103.id)).toEqual([
      expect.objectContaining({ dateFrom: '2026-10-20', dateTo: '2026-11-01', closed: true, manual: false })
    ])
    expect(
      svc.calendar.grid(owner, { from: '2026-11-01', to: '2026-12-01' }).rooms.map((r) => r.number)
    ).toEqual(['104'])
    expect(svc.calendar.freeRooms(owner, { checkIn: '2026-10-19', checkOut: '2026-10-21' })).not.toContain(
      r103.id
    )
    clock.set('2026-10-25T09:00:00.000Z')
    expect(svc.rooms.listRooms(owner).map((r) => r.number)).toEqual(['104'])
    expect(svc.rooms.listRooms(owner, { includeInactive: true }).find((r) => r.id === r103.id)?.active).toBe(
      false
    )
    // The past stay of the closed room is still on the calendar of its month.
    expect(
      svc.calendar.grid(owner, { from: '2026-10-01', to: '2026-10-15' }).rooms.map((r) => r.number)
    ).toEqual(['103', '104'])
  })

  it('1 Aralıktan kapanacak oda o güne kadar rezerve edilir; kapalı güne rezervasyon reddedilir', async () => {
    const { svc, room, book, error } = await setup()
    const r102 = room('102')
    svc.rooms.updateRoom(owner, r102.id, { active: false, validFrom: '2026-12-01' })
    expect(svc.rooms.listRooms(owner).some((r) => r.id === r102.id)).toBe(true)
    expect(book(r102.id, '2026-10-10', '2026-10-12').stays[0]?.roomId).toBe(r102.id)
    const refused = error(() => book(r102.id, '2026-11-30', '2026-12-02'))
    expect(refused.messageKey).toBe('errors.roomClosedOn')
    expect(refused.details).toMatchObject({ room: '102', date: '2026-12-01' })
    expect(svc.reservations.roomsTaken(owner, { from: '2026-11-30', to: '2026-12-02' }).occupied).toContain(
      r102.id
    )
  })
})

describe('ileri tarihten açılan yeni oda (#3)', () => {
  it('1 Aralıkta açılacak 601: 28 Kasım rezerve edilemez, raporlar ve bakanlık yatağı saymaz; açılınca sayılır', async () => {
    const { svc, room, book, error } = await setup()
    room('101')
    const r601 = room('601', '2026-12-01')
    expect(svc.rooms.listRooms(owner).map((r) => r.number)).toEqual(['101'])
    expect(svc.rooms.listRooms(owner, { includeInactive: true }).find((r) => r.id === r601.id)).toMatchObject(
      {
        active: false,
        opensOn: '2026-12-01'
      }
    )
    expect(error(() => book(r601.id, '2026-11-28', '2026-11-30')).messageKey).toBe('errors.roomClosedOn')
    expect(svc.calendar.freeRooms(owner, { checkIn: '2026-11-28', checkOut: '2026-11-30' })).not.toContain(
      r601.id
    )
    expect(svc.calendar.freeRooms(owner, { checkIn: '2026-12-01', checkOut: '2026-12-03' })).toContain(
      r601.id
    )
    expect(svc.rooms.capacityOn(owner, d('2026-11-28')).some((c) => c.roomId === r601.id)).toBe(false)
    const nights = (from: string, to: string) =>
      svc.reports.occupancy(owner, { from, to }).rooms.find((r) => r.id === r601.id)?.sellableNights ?? 0
    expect(nights('2026-11-28', '2026-11-30')).toBe(0)
    expect(nights('2026-11-28', '2026-12-03')).toBe(2)
    expect(book(r601.id, '2026-12-01', '2026-12-03').stays[0]?.roomId).toBe(r601.id)
    // The reservation form offers it (for its own days), with its opening capacity.
    expect(svc.reservations.formOptions(owner).rooms.map((r) => r.number)).toContain('601')
  })
})

describe('oda güncellemesinin denetim satırı (#15c)', () => {
  it('kapasite değişikliğinin geçerlilik tarihi ve notu denetim kaydına yazılır', async () => {
    const { svc, room } = await setup()
    const r101 = room('101')
    svc.rooms.updateRoom(owner, r101.id, { beds: 3, validFrom: '2026-11-01', note: 'ek yatak' })
    const row = handle.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityId, r101.id), eq(auditLog.action, 'update')))
      .get()!
    expect(JSON.parse(row.afterJson ?? '{}')).toMatchObject({
      capacityChange: { validFrom: '2026-11-01', note: 'ek yatak' }
    })
  })
})
