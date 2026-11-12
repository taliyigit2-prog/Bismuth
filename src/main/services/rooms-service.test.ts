import { afterEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { localDate as d } from '@shared/date'
import { roleCtx, depsOf, testClock } from '../../../tests/factories/ctx'
import { seededDatabase } from '../../../tests/factories/db'
import type { DatabaseHandle } from '../db/client'
import { auditLog, roomNights, roomTypes } from '../db/schema'
import { createRoomsService } from './rooms-service'

const owner = roleCtx('owner')
let handle: DatabaseHandle
afterEach(() => handle?.close())

async function setup() {
  handle = await seededDatabase()
  const clock = testClock()
  const svc = createRoomsService(depsOf(handle, clock))
  const standard = handle.db.select().from(roomTypes).where(eq(roomTypes.code, 'standard')).get()!
  return { svc, clock, standard }
}

describe('odalar ve kapasite geçmişi (G-12, K-27)', () => {
  it('oda eklenir, numara tekrarlanamaz; kapasite tarihe göre hesaplanır', async () => {
    const { svc, standard } = await setup()
    const r101 = svc.createRoom(owner, {
      number: '101',
      roomTypeId: standard.id,
      beds: 2,
      validFrom: '2026-01-01'
    })
    svc.createRoom(owner, { number: '102', roomTypeId: standard.id, beds: 2, validFrom: '2026-01-01' })
    expect(() =>
      svc.createRoom(owner, { number: '101', roomTypeId: standard.id, beds: 1, validFrom: '2026-01-01' })
    ).toThrow(/roomNumberTaken/)
    svc.updateRoom(owner, r101.id, { beds: 3, validFrom: '2026-06-01', note: 'tadilat' })
    expect(svc.bedsOn(owner, d('2026-05-31'))).toBe(4)
    expect(svc.bedsOn(owner, d('2026-06-01'))).toBe(5)
    svc.updateRoom(owner, r101.id, { active: false, validFrom: '2026-09-01' })
    expect(svc.bedsOn(owner, d('2026-09-15'))).toBe(2)
    expect(svc.bedsOn(owner, d('2025-12-31'))).toBe(0)
    expect(svc.listRooms(owner).map((r) => r.number)).toEqual(['102'])
  })

  it('oda ve oda tipi yazmak "Odalar" ayar yetkisi ister; her yazma denetim kaydına düşer', async () => {
    const { svc, standard } = await setup()
    expect(() =>
      svc.createRoom(roleCtx('reception'), {
        number: '1',
        roomTypeId: standard.id,
        beds: 1,
        validFrom: '2026-01-01'
      })
    ).toThrow(/PERMISSION_DENIED/)
    const junior = svc.createRoomType(owner, {
      name: 'Junior Room',
      basePriceMinor: 250_000,
      baseCurrency: 'TRY'
    })
    expect(junior).toMatchObject({ isCustom: true, group: 'custom', name: 'Junior Room' })
    const renamed = svc.updateRoomType(owner, standard.id, { name: 'Standard Room' })
    expect(renamed.nameI18n).toBeNull()
    // A patch changes only what it names: the seeded type keeps its group.
    expect(renamed.group).toBe(standard.group)
    expect(() => svc.updateRoomType(owner, standard.id, {})).toThrow(/VALIDATION/)
    const audits = handle.db.select().from(auditLog).all()
    expect(audits.map((a) => `${a.entity}:${a.action}`)).toEqual(['room_type:create', 'room_type:update'])
    expect(() => svc.createRoomType(owner, { name: '' })).toThrow(/VALIDATION/)
  })
})

describe('düzenleme yalnız gönderilen alanı değiştirir', () => {
  it('satışa kapalı odanın notu değişince satışa açılmaz ve sahte kapasite satırı yazılmaz', async () => {
    const { svc, standard } = await setup()
    const store = svc.createRoom(owner, {
      number: 'D1',
      roomTypeId: standard.id,
      beds: 1,
      sellable: false,
      validFrom: '2026-01-01'
    })
    const after = svc.updateRoom(owner, store.id, {
      notes: 'Depo olarak kullanılıyor',
      validFrom: '2026-03-01'
    })
    expect(after).toMatchObject({ sellable: false, notes: 'Depo olarak kullanılıyor' })
    expect(svc.capacityOn(owner, d('2026-03-02')).find((c) => c.roomId === store.id)?.sellable).toBe(false)
    expect(
      handle.sqlite.prepare('select count(*) n from room_capacity_changes where room_id = ?').get(store.id)
    ).toEqual({ n: 1 })
  })

  it('gerçek olmayan gün reddedilir (2026-02-31)', async () => {
    const { svc, standard } = await setup()
    expect(() =>
      svc.createRoom(owner, { number: 'X', roomTypeId: standard.id, beds: 1, validFrom: '2026-02-31' })
    ).toThrow(/VALIDATION/)
  })
})

describe('oda durumu ve bloklar (G-38, G-90)', () => {
  it('temizlik rolü oda durumunu değiştirir; resepsiyon blok açar ve kapatır', async () => {
    const { svc, standard } = await setup()
    const room = svc.createRoom(owner, {
      number: '304',
      roomTypeId: standard.id,
      beds: 2,
      validFrom: '2026-01-01'
    })
    expect(svc.setHousekeepingStatus(roleCtx('housekeeping'), room.id, 'dirty').hkStatus).toBe('dirty')
    expect(() => svc.setHousekeepingStatus(roleCtx('employee'), room.id, 'clean')).toThrow(
      /PERMISSION_DENIED/
    )
    expect(() => svc.setHousekeepingStatus(owner, room.id, 'shiny')).toThrow(/VALIDATION/)
    const block = svc.createBlock(roleCtx('reception'), {
      roomId: room.id,
      dateFrom: '2026-01-01',
      dateTo: '2026-02-01',
      kind: 'oos',
      reason: 'SATILMAZ'
    })
    expect(svc.listBlocks(owner, d('2026-01-31'), d('2026-02-02'))).toHaveLength(1)
    expect(svc.listBlocks(owner, d('2026-02-01'), d('2026-02-02'))).toHaveLength(0)
    // Over already (today is 2026-10-01): lifting it rewrites history, so only as a correction with a reason.
    expect(() => svc.cancelBlock(owner, block.id)).toThrow(/reasonRequired/)
    svc.cancelBlock(owner, block.id, 'yanlış girilmiş')
    expect(svc.listBlocks(owner, d('2026-01-01'), d('2026-02-01'))).toHaveLength(0)
    expect(() => svc.cancelBlock(owner, block.id, 'x')).toThrow(/alreadyCancelled/)
    // Running: it ends today, the days before stay blocked.
    const running = svc.createBlock(owner, {
      roomId: room.id,
      dateFrom: '2026-09-28',
      dateTo: '2026-10-10',
      kind: 'ooo',
      reason: 'boya'
    })
    expect(svc.cancelBlock(owner, running.id)).toMatchObject({ dateTo: '2026-10-01', cancelledAt: null })
    expect(svc.listBlocks(owner, d('2026-09-28'), d('2026-10-10')).map((b) => b.id)).toEqual([running.id])
    expect(svc.listBlocks(owner, d('2026-10-01'), d('2026-10-10'))).toEqual([])
    // Not started yet: cancelled as a whole.
    const later = svc.createBlock(owner, {
      roomId: room.id,
      dateFrom: '2026-11-01',
      dateTo: '2026-11-03',
      kind: 'oos',
      reason: 'SATILMAZ'
    })
    expect(svc.cancelBlock(owner, later.id).cancelledAt).not.toBeNull()
    expect(() =>
      svc.createBlock(owner, {
        roomId: room.id,
        dateFrom: '2026-03-02',
        dateTo: '2026-03-01',
        kind: 'oos',
        reason: 'x'
      })
    ).toThrow(/VALIDATION/)
  })

  it('satılmış geceye blok konamaz', async () => {
    const { svc, standard } = await setup()
    const room = svc.createRoom(owner, {
      number: '501',
      roomTypeId: standard.id,
      beds: 2,
      validFrom: '2026-01-01'
    })
    handle.sqlite.pragma('foreign_keys = OFF') // a bare night row is enough for this rule
    handle.db
      .insert(roomNights)
      .values({
        id: 'n1',
        reservationRoomId: 'rr1',
        roomId: room.id,
        date: '2026-10-05',
        slot: 'night',
        priceMinor: 1,
        currency: 'TRY',
        createdAt: '',
        updatedAt: ''
      })
      .run()
    handle.sqlite.pragma('foreign_keys = ON')
    const block = { roomId: room.id, kind: 'ooo' as const, reason: 'tadilat' }
    expect(() => svc.createBlock(owner, { ...block, dateFrom: '2026-10-04', dateTo: '2026-10-06' })).toThrow(
      /blockOverReservation/
    )
    expect(svc.createBlock(owner, { ...block, dateFrom: '2026-10-06', dateTo: '2026-10-08' }).kind).toBe(
      'ooo'
    )
  })
})
