// "Otelde kalanlar" and the Today lists (faz-09 madde 5, 7; G-53, G-54, G-92): the night list with who marked KBS
// and when, the "kızıl" search over descriptor notes, people who left without the KBS check-out, today's arrivals
// and departures with the ones past check-out time first, and what a role without reservations may see.
import { afterEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { depsOf, roleCtx, testClock } from '../../../tests/factories/ctx'
import { seededDatabase } from '../../../tests/factories/db'
import type { DatabaseHandle } from '../db/client'
import { paymentMethods, roles, roomTypes, salesChannels, users } from '../db/schema'
import { defaultPermissions } from '@shared/permissions'
import { ctxFromPermissions } from './context'
import { createOccupantsService } from './occupants-service'
import { createPaymentsService } from './payments-service'
import { createReservationsService } from './reservations-service'
import { createRoomsService } from './rooms-service'

const owner = roleCtx('owner')
const reception = roleCtx('reception', 'u-deniz')
let handle: DatabaseHandle
afterEach(() => handle?.close())

/**
 * 2026-10-01 13:00 in Istanbul (after the 12:00 check-out): 501 in house (Ali reported to KBS by Deniz, "kızıl
 * saçlı" Ayşe not yet), 502 arrives today, 503 should have left at noon, 504 left yesterday without the KBS
 * check-out mark.
 */
async function hotelDay() {
  handle = await seededDatabase()
  const clock = testClock('2026-10-01T10:00:00.000Z')
  const deps = depsOf(handle, clock)
  const roomsSvc = createRoomsService(deps)
  const res = createReservationsService(deps)
  const occ = createOccupantsService(deps)
  const pay = createPaymentsService(deps)
  handle.db
    .insert(users)
    .values({
      id: 'u-deniz',
      username: 'deniz',
      displayName: 'Deniz Arslan',
      roleId: handle.db.select().from(roles).where(eq(roles.code, 'reception')).get()!.id,
      passwordHash: 'x',
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z'
    })
    .run()
  const standard = handle.db.select().from(roomTypes).where(eq(roomTypes.code, 'standard')).get()!
  const room = (n: string) =>
    roomsSvc.createRoom(owner, { number: n, roomTypeId: standard.id, beds: 2, validFrom: '2026-01-01' })
  const [r501, r502, r503, r504] = [room('501'), room('502'), room('503'), room('504')]
  const channelId = handle.db.select().from(salesChannels).where(eq(salesChannels.code, 'direct')).get()!.id
  const book = (roomId: string, checkIn: string, checkOut: string, firstName: string, notes?: string) =>
    res.create(owner, {
      guest: { firstName, lastName: 'Misafir' },
      channelId,
      notes,
      stays: [{ roomId, checkIn, checkOut, nightlyPriceMinor: 100_000 }]
    })
  clock.set('2026-09-29T12:00:00.000Z')
  const d = book(r504!.id, '2026-09-29', '2026-09-30', 'Derya')
  res.checkIn(owner, d.stays[0]!.id)
  occ.markKbsReported(owner, occ.list(owner, d.stays[0]!.id)[0]!.id)
  clock.set('2026-09-30T08:00:00.000Z')
  res.checkOut(owner, d.stays[0]!.id)
  clock.set('2026-10-01T10:00:00.000Z')
  const a = book(r501!.id, '2026-09-30', '2026-10-03', 'Ali')
  res.checkIn(owner, a.stays[0]!.id)
  occ.markKbsReported(reception, occ.list(owner, a.stays[0]!.id)[0]!.id)
  occ.add(owner, a.stays[0]!.id, { fullName: 'Ayşe Misafir', descriptorNote: 'Kızıl saçlı, gözlüklü' })
  const b = book(r502!.id, '2026-10-01', '2026-10-03', 'Banu', 'Geç gelecek')
  const c = book(r503!.id, '2026-09-29', '2026-10-01', 'Cem')
  res.checkIn(owner, c.stays[0]!.id)
  occ.markKbsReported(owner, occ.list(owner, c.stays[0]!.id)[0]!.id)
  const cash = handle.db.select().from(paymentMethods).where(eq(paymentMethods.code, 'cash')).get()!.id
  pay.create(owner, {
    reservationId: a.reservation.id,
    date: '2026-10-01',
    methodId: cash,
    amountMinor: 100_000,
    currency: 'TRY'
  })
  return { occ, res, clock, a, b, c, d }
}

describe('otelde kalanlar (G-54)', () => {
  it('oda oda kişiler, tanıtıcı not ve KBS işaretini kimin ne zaman koyduğu', async () => {
    const { occ } = await hotelDay()
    const view = occ.inHouseView(reception)
    expect(view.today).toBe('2026-10-01')
    expect(view.rooms.map((r) => [r.roomNumber, r.people, r.kbsGaps])).toEqual([
      ['501', 2, 1],
      ['503', 1, 0]
    ])
    const r501 = view.rooms[0]!
    expect(r501.guestName).toBe('Ali Misafir')
    expect(r501.occupants.map((o) => [o.fullName, o.descriptorNote, o.kbsReportedByName])).toEqual([
      ['Ali Misafir', null, 'Deniz Arslan'],
      ['Ayşe Misafir', 'Kızıl saçlı, gözlüklü', null]
    ])
    expect(r501.occupants[0]!.kbsReportedAt).toBe('2026-10-01T10:00:00.000Z')
    // 3 nights × 1.000 − 1.000 paid.
    expect([r501.balanceMinor, r501.currency]).toEqual([200_000, 'TRY'])
  })

  it('"kızıl" araması tanıtıcı notu bulur (büyük/küçük harf ve Türkçe harf farkı yok); oda ve ad da aranır', async () => {
    const { occ } = await hotelDay()
    expect(occ.inHouseView(reception, 'kızıl').rooms.map((r) => r.roomNumber)).toEqual(['501'])
    expect(occ.inHouseView(reception, 'KIZIL').rooms.map((r) => r.roomNumber)).toEqual(['501'])
    expect(occ.inHouseView(reception, '503').rooms.map((r) => r.roomNumber)).toEqual(['503'])
    expect(occ.inHouseView(reception, 'cem').rooms.map((r) => r.roomNumber)).toEqual(['503'])
    expect(occ.inHouseView(reception, 'yok böyle').rooms).toEqual([])
  })

  it('çıkıp KBS çıkışı yapılmayan kişi ayrı listede; işaretlenince listeden düşer', async () => {
    const { occ } = await hotelDay()
    const pending = occ.inHouseView(reception).checkoutPending
    expect(pending.map((p) => [p.roomNumber, p.fullName, p.leftAt])).toEqual([
      ['504', 'Derya Misafir', '2026-09-30T08:00:00.000Z']
    ])
    occ.markKbsCheckout(reception, pending[0]!.occupantId)
    expect(occ.inHouseView(reception).checkoutPending).toEqual([])
  })

  it('ödemeyi göremeyen rol bakiyeyi görmez; otelde kalanları göremeyen rol hiç okuyamaz', async () => {
    const { occ } = await hotelDay()
    const noMoney = ctxFromPermissions('u-x', 'd', 'ipc', {
      ...defaultPermissions('reception'),
      payments: 'none'
    })
    const view = occ.inHouseView(noMoney)
    expect(view.showMoney).toBe(false)
    expect(view.rooms.every((r) => r.balanceMinor === null && r.currency === null)).toBe(true)
    expect(() => occ.inHouseView(roleCtx('housekeeping'))).toThrow(/PERMISSION_DENIED/)
    expect(() => occ.inHouseView(roleCtx('accountant'))).toThrow(/PERMISSION_DENIED/)
  })
})

describe('Bugün listeleri (G-92)', () => {
  it('bugün gelenler ve çıkacaklar; öğlen çıkmamış oda üstte ve vurgulu', async () => {
    const { occ, b, c } = await hotelDay()
    const day = occ.dayLists(reception)
    expect([day.today, day.nowTime, day.checkoutTime]).toEqual(['2026-10-01', '13:00', '12:00'])
    expect(day.arrivals?.map((s) => [s.roomNumber, s.reservationId, s.nights, s.note])).toEqual([
      ['502', b.reservation.id, 2, 'Geç gelecek']
    ])
    expect(day.departures?.map((s) => [s.roomNumber, s.reservationId, s.overdue])).toEqual([
      ['503', c.reservation.id, true]
    ])
    expect(day.departures?.[0]?.balanceMinor).toBe(200_000)
    // Tonight: 501 (in house) and 502 (arriving) of 4 sellable rooms.
    expect([day.soldTonight, day.sellableRooms]).toEqual([2, 4])
  })

  it('çıkış saatinden önce çıkacak oda vurgulanmaz; çıkış yapınca saatle görünür', async () => {
    const { occ, res, clock, c } = await hotelDay()
    clock.set('2026-10-01T07:30:00.000Z') // 10:30
    expect(occ.dayLists(reception).departures?.[0]?.overdue).toBe(false)
    res.checkOut(owner, c.stays[0]!.id)
    clock.set('2026-10-01T10:00:00.000Z')
    const dep = occ.dayLists(reception).departures?.[0]
    expect([dep?.overdue, dep?.checkedOutAt]).toEqual([false, '2026-10-01T07:30:00.000Z'])
  })

  it('temizlik Bugün ekranını görür ama misafir adı gelmez; Bugün yetkisi olmayan okuyamaz', async () => {
    const { occ } = await hotelDay()
    const hk = occ.dayLists(roleCtx('housekeeping'))
    expect([hk.arrivals, hk.departures, hk.sellableRooms]).toEqual([null, null, 4])
    expect(() => occ.dayLists(ctxFromPermissions('u-x', 'd', 'ipc', { in_house: 'edit' }))).toThrow(
      /PERMISSION_DENIED/
    )
  })
})
