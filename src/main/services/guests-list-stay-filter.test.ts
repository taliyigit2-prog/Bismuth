// G-190 "Arama: ad, telefon, oda, tarih" (K-46 (3)): the guest list's room and date filter — "302'de Mart'ta kim
// kaldı". Stays in that room whose days touch the chosen days; the primary guest and the people in the room; a
// cancelled or no-show reservation is listed with its state.
import { afterEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { depsOf, roleCtx, testClock } from '../../../tests/factories/ctx'
import { seededDatabase } from '../../../tests/factories/db'
import type { DatabaseHandle } from '../db/client'
import { reservationRooms, reservations, rooms, roomTypes, salesChannels, stayOccupants } from '../db/schema'
import { ctxFromPermissions } from './context'
import { createGuestsService } from './guests-service'

const reception = roleCtx('reception')
const housekeeping = roleCtx('housekeeping')

let handle: DatabaseHandle
afterEach(() => handle?.close())

const T = '2026-01-01T00:00:00.000Z'
const ts = { createdAt: T, updatedAt: T }
let seq = 0
const nextId = (prefix: string): string => `${prefix}-${++seq}`

async function setup() {
  handle = await seededDatabase()
  const svc = createGuestsService(depsOf(handle, testClock('2026-10-05T09:00:00.000Z')))
  const standard = handle.db.select().from(roomTypes).where(eq(roomTypes.code, 'standard')).get()!
  const channel = handle.db.select().from(salesChannels).where(eq(salesChannels.code, 'direct')).get()!
  const room = (number: string): string => {
    const id = nextId('room')
    handle.db
      .insert(rooms)
      .values({ id, number, roomTypeId: standard.id, beds: 2, ...ts })
      .run()
    return id
  }
  const guest = (firstName: string, lastName: string): string =>
    svc.create(reception, { firstName, lastName }).id
  /** One reservation with one room; `with` = more people in that room. */
  const stay = (
    guestId: string,
    roomId: string,
    checkIn: string,
    checkOut: string,
    status: (typeof reservations.$inferInsert)['status'] = 'checked_out',
    withGuests: string[] = []
  ): string => {
    const reservationId = nextId('res')
    handle.db
      .insert(reservations)
      .values({
        id: reservationId,
        code: `R-${reservationId}`,
        primaryGuestId: guestId,
        channelId: channel.id,
        status,
        kind: 'overnight',
        ...ts
      })
      .run()
    const rrId = nextId('rr')
    handle.db
      .insert(reservationRooms)
      .values({
        id: rrId,
        reservationId,
        roomId,
        checkIn,
        checkOut,
        status: status === 'cancelled' || status === 'no_show' ? 'cancelled' : 'done',
        ...ts
      })
      .run()
    for (const id of withGuests)
      handle.db
        .insert(stayOccupants)
        .values({ id: nextId('occ'), reservationRoomId: rrId, guestId: id, fullName: 'Kişi', ...ts })
        .run()
    return reservationId
  }
  return { svc, room, guest, stay }
}

const names = (rows: { firstName: string; lastName: string }[]): string[] =>
  rows.map((r) => `${r.firstName} ${r.lastName}`).sort()

describe('misafir listesi: oda ve tarih süzgeci (G-190)', () => {
  it("302'de Mart'ta kim kaldı: o odada o günlere değen konaklamaların misafirleri ve odadaki kişiler", async () => {
    const { svc, room, guest, stay } = await setup()
    const r302 = room('302')
    const r303 = room('303')
    const ayla = guest('Ayla', 'Deneme')
    const burak = guest('Burak', 'Örnek')
    const cem = guest('Cem', 'Deneme')
    const deniz = guest('Deniz', 'Örnek')
    const ece = guest('Ece', 'Örnek')
    // In March, room 302: Ayla (with Cem in the room), and Deniz over the turn of the month.
    stay(ayla, r302, '2026-03-10', '2026-03-14', 'checked_out', [cem])
    stay(deniz, r302, '2026-02-27', '2026-03-02')
    // Not in March or not in 302: Burak leaves on 1 March (the check-out day is not a night), Ece in 303.
    stay(burak, r302, '2026-02-25', '2026-03-01')
    stay(ece, r303, '2026-03-05', '2026-03-08')

    const march = svc.list(reception, { room: '302', stayFrom: '2026-03-01', stayTo: '2026-03-31' })
    expect(names(march.rows)).toEqual(['Ayla Deneme', 'Cem Deneme', 'Deniz Örnek'])
    expect(march.total).toBe(3)
    const aylaRow = march.rows.find((r) => r.id === ayla)!
    expect(aylaRow.matchedStays).toEqual([
      expect.objectContaining({
        roomNumber: '302',
        checkIn: '2026-03-10',
        checkOut: '2026-03-14',
        status: 'checked_out'
      })
    ])
    // Only the room: every stay in 302; only the days: every room.
    expect(names(svc.list(reception, { room: '302' }).rows)).toEqual([
      'Ayla Deneme',
      'Burak Örnek',
      'Cem Deneme',
      'Deniz Örnek'
    ])
    expect(names(svc.list(reception, { stayFrom: '2026-03-05', stayTo: '2026-03-05' }).rows)).toEqual([
      'Ece Örnek'
    ])
    // Without the filter the rows carry no matched stays.
    expect(svc.list(reception, {}).rows.every((r) => r.matchedStays === undefined)).toBe(true)
  })

  it('oda numarası bütün olarak eşleşir; olmayan oda boş liste verir; arama ile birlikte çalışır', async () => {
    const { svc, room, guest, stay } = await setup()
    const r302 = room('302')
    const r1302 = room('1302')
    stay(guest('Ayla', 'Deneme'), r302, '2026-03-10', '2026-03-12')
    stay(guest('Burak', 'Deneme'), r1302, '2026-03-10', '2026-03-12')
    expect(names(svc.list(reception, { room: '302' }).rows)).toEqual(['Ayla Deneme'])
    expect(svc.list(reception, { room: '999' }).total).toBe(0)
    expect(names(svc.list(reception, { q: 'burak', room: '1302' }).rows)).toEqual(['Burak Deneme'])
    expect(svc.list(reception, { q: 'burak', room: '302' }).total).toBe(0)
  })

  it('aynı gün giriş‑çıkış kendi gününde sayılır', async () => {
    const { svc, room, guest, stay } = await setup()
    const r302 = room('302')
    stay(guest('Gün', 'Içi'), r302, '2026-03-20', '2026-03-20')
    expect(svc.list(reception, { room: '302', stayFrom: '2026-03-20', stayTo: '2026-03-20' }).total).toBe(1)
    expect(svc.list(reception, { room: '302', stayFrom: '2026-03-21', stayTo: '2026-03-31' }).total).toBe(0)
  })

  it('iptal edilmiş ve gelmeyen konaklama durumuyla listelenir; park edilmiş listelenmez', async () => {
    const { svc, room, guest, stay } = await setup()
    const r302 = room('302')
    const cancelled = guest('Iptal', 'Deneme')
    const noShow = guest('Gelmedi', 'Deneme')
    stay(cancelled, r302, '2026-03-10', '2026-03-12', 'cancelled')
    stay(noShow, r302, '2026-03-15', '2026-03-16', 'no_show')
    stay(guest('Park', 'Deneme'), r302, '2026-03-18', '2026-03-19', 'parked')
    const rows = svc.list(reception, { room: '302', stayFrom: '2026-03-01', stayTo: '2026-03-31' }).rows
    expect(names(rows)).toEqual(['Gelmedi Deneme', 'Iptal Deneme'])
    expect(rows.find((r) => r.id === cancelled)!.matchedStays![0]!.status).toBe('cancelled')
    expect(rows.find((r) => r.id === noShow)!.matchedStays![0]!.status).toBe('no_show')
  })

  it('ters tarih aralığı geçersizdir; misafir görme yetkisi olmayan rol süzemez', async () => {
    const { svc } = await setup()
    expect(() => svc.list(reception, { stayFrom: '2026-03-31', stayTo: '2026-03-01' })).toThrow(/VALIDATION/)
    expect(() => svc.list(housekeeping, { room: '302' })).toThrow(/PERMISSION_DENIED/)
  })

  it('kimlik no araması yetkiye bağlı kalır: yetkisiz rol kimlik no ile oda süzgecinde de bulamaz', async () => {
    const { svc, room, stay } = await setup()
    const r302 = room('302')
    const id = svc.create(roleCtx('owner'), {
      firstName: 'Kimlik',
      lastName: 'Deneme',
      idDocType: 'passport',
      idDocNumber: 'U12345678'
    }).id
    stay(id, r302, '2026-03-10', '2026-03-12')
    const noIdentity = ctxFromPermissions('user-custom', 'test-device', 'ipc', { guests: 'view' })
    expect(svc.list(roleCtx('owner'), { q: 'U12345678', room: '302' }).total).toBe(1)
    expect(svc.list(noIdentity, { q: 'U12345678', room: '302' }).total).toBe(0)
  })
})
