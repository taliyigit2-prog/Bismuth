// Son dalga G1 bulgu düzeltmeleri (B1-B6, B8): grup ödenebilir tutarı, saatlik satış ve gece sayımı, gelmedi bedeli
// kilitli gün, birleşmiş misafir, iptalde tutulan ödeme, kapalı rezervasyonda tahsilat.
import { afterEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { depsOf, roleCtx, testClock } from '../../../tests/factories/ctx'
import { seededDatabase } from '../../../tests/factories/db'
import type { DatabaseHandle } from '../db/client'
import { paymentMethods, roomTypes, salesChannels } from '../db/schema'
import { createServices } from './index'
import { groupPayableMinor, isGroupPayableStatus } from '@shared/domain/payment-allocation'

const owner = roleCtx('owner')
const reception = roleCtx('reception')
const manager = roleCtx('manager')
let handle: DatabaseHandle
afterEach(() => handle?.close())

async function setup(now = '2026-10-01T09:00:00.000Z') {
  handle = await seededDatabase()
  const clock = testClock(now)
  const svc = createServices(
    handle,
    { name: 'B', version: 't', packaged: false, dataDir: '/tmp/unused', electron: null, chrome: null },
    { clock: depsOf(handle, clock).clock }
  )
  const standard = handle.db.select().from(roomTypes).where(eq(roomTypes.code, 'standard')).get()!
  const rooms = ['501', '502', '503'].map((n) =>
    svc.rooms.createRoom(owner, { number: n, roomTypeId: standard.id, beds: 2, validFrom: '2026-01-01' })
  )
  const direct = handle.db.select().from(salesChannels).where(eq(salesChannels.code, 'direct')).get()!.id
  const cash = handle.db.select().from(paymentMethods).where(eq(paymentMethods.code, 'cash')).get()!.id
  let n = 0
  const book = (roomId: string, ci = '2026-10-01', co = '2026-10-03', price = 100_000) =>
    svc.reservations.create(reception, {
      guest: { firstName: `G${++n}`, lastName: 'Misafir', phone: `0532 000 00 ${10 + n}` },
      channelId: direct,
      status: 'confirmed',
      stays: [{ roomId, checkIn: ci, checkOut: co, nightlyPriceMinor: price }]
    })
  const pay = (
    rid: string,
    amt: number,
    kind: 'payment' | 'refund' | 'deposit' = 'payment',
    date = '2026-10-01'
  ) =>
    svc.payments.create(manager, {
      reservationId: rid,
      date,
      kind,
      methodId: cash,
      amountMinor: amt,
      currency: 'TRY'
    })
  const group = () =>
    svc.reservations.createGroup(reception, {
      name: 'Grp',
      leader: { firstName: 'L', lastName: 'Ider', phone: '0532 222 22 22' },
      channelId: direct,
      rooms: rooms.map((r, i) => ({
        stay: {
          roomId: r.id,
          checkIn: '2026-10-01',
          checkOut: '2026-10-02',
          nightlyPriceMinor: 100_000 * (i + 1)
        }
      }))
    })
  return { svc, clock, rooms, direct, cash, book, pay, group }
}

describe('B1 grup ödenebilir tutar', () => {
  it('birim: iptal ve gelmedi hariç, negatif bakiye 0 sayılır', () => {
    expect(isGroupPayableStatus('checked_out')).toBe(true)
    expect(isGroupPayableStatus('cancelled')).toBe(false)
    expect(
      groupPayableMinor([
        { status: 'confirmed', balanceMinor: 100 },
        { status: 'checked_out', balanceMinor: 50 },
        { status: 'cancelled', balanceMinor: 900 },
        { status: 'no_show', balanceMinor: 900 },
        { status: 'checked_in', balanceMinor: -40 }
      ])
    ).toBe(150)
  })

  it('çıkış yapmış odanın borcu panel toplamında ve ödemede kabul edilir', async () => {
    const { svc, cash, group } = await setup()
    const g = group()
    const stayId = g.rooms[0]!.stays[0]!.stayId
    svc.reservations.checkIn(reception, stayId)
    svc.reservations.checkOut(reception, stayId)
    const v = svc.reservations.group(manager, g.id)
    expect(v.totals?.payableMinor).toBe(600_000)
    const out = svc.reservations.payGroup(reception, {
      groupId: g.id,
      date: '2026-10-01',
      methodId: cash,
      amountMinor: v.totals!.payableMinor!,
      currency: 'TRY'
    })
    expect(out.totals?.payableMinor).toBe(0)
  })

  it('tek başına iptal edilen oda toplamı bozmaz; ödenebilir tutar açık odaların borcudur', async () => {
    const { svc, cash, group } = await setup()
    const g = group()
    svc.reservations.cancel(reception, g.rooms[0]!.reservationId, 'vazgecti')
    const v = svc.reservations.group(manager, g.id)
    expect(v.totals?.balanceMinor).toBe(500_000)
    expect(v.totals?.payableMinor).toBe(500_000)
    svc.reservations.payGroup(reception, {
      groupId: g.id,
      date: '2026-10-01',
      methodId: cash,
      amountMinor: 500_000,
      currency: 'TRY'
    })
  })
})

describe('B2/B3 saatlik satış gece sayılmaz', () => {
  it('misafir geçmişi saatlik konaklamayı gece saymaz', async () => {
    const { svc, rooms, direct, book } = await setup('2026-10-10T09:00:00.000Z')
    const a = book(rooms[0]!.id, '2026-10-05', '2026-10-07', 200_000)
    const gid = a.reservation.primaryGuestId
    svc.reservations.create(reception, {
      guest: { id: gid } as never,
      channelId: direct,
      stays: [
        {
          roomId: rooms[1]!.id,
          checkIn: '2026-10-09',
          checkOut: '2026-10-09',
          startTime: '10:00',
          endTime: '12:00',
          nightlyPriceMinor: 30_000
        }
      ]
    })
    const h = svc.guests.guestHistory(manager, gid)
    expect(h.totalNights).toBe(2)
    expect(h.lastNightly).toEqual({ amountMinor: 200_000, currency: 'TRY' })
  })

  it('bugün saatlik satışı olan oda arızalı yapılınca takvim kapanır', async () => {
    const { svc, rooms, direct, clock } = await setup('2026-10-10T07:00:00.000Z')
    const mk = svc.reservations.create(reception, {
      guest: { firstName: 'H', lastName: 'S' },
      channelId: direct,
      stays: [
        {
          roomId: rooms[0]!.id,
          checkIn: '2026-10-10',
          checkOut: '2026-10-10',
          startTime: '10:00',
          endTime: '11:00',
          nightlyPriceMinor: 30_000
        }
      ]
    })
    svc.reservations.checkIn(reception, mk.stays[0]!.id)
    clock.set('2026-10-10T08:00:00.000Z')
    svc.reservations.checkOut(reception, mk.stays[0]!.id, {})
    const r = svc.rooms.setHousekeepingStatus(owner, rooms[0]!.id, 'out_of_order')
    expect(r.block).not.toBeNull()
  })
})

describe('B4 gelmedi bedeli kapalı güne yazılmaz', () => {
  it('kilitli günde yetkisiz/gerekçesiz gelmedi bedeli reddedilir', async () => {
    const { svc, rooms, book } = await setup()
    svc.settings.set(owner, { 'businessDay.closingEnabled': true })
    const a = book(rooms[0]!.id)
    svc.ledger.closeDay(owner, '2026-10-01')
    expect(() => svc.reservations.noShow(reception, a.reservation.id, 'no_show', 50_000)).toThrowError(
      /dayClosed/
    )
  })
})

describe('B5 birleşmiş misafir', () => {
  it('grup lideri kalan karta geçer; birleşmiş kimlikle açılan rezervasyon kalan karta gider', async () => {
    const { svc, rooms, direct } = await setup('2026-10-10T09:00:00.000Z')
    const g = svc.reservations.createGroup(reception, {
      name: 'G',
      leader: { firstName: 'Lider', lastName: 'Bir', phone: '0532 100 00 01' },
      channelId: direct,
      rooms: [0, 1].map((i) => ({
        stay: { roomId: rooms[i]!.id, checkIn: '2026-10-12', checkOut: '2026-10-13', nightlyPriceMinor: 1000 }
      }))
    })
    const mergedId = g.leader!.id
    const dup = svc.guests.create(manager, {
      firstName: 'Lider',
      lastName: 'Bir',
      phone: '0532 100 00 01'
    } as never)
    svc.guests.merge(manager, dup.id, mergedId)
    expect(svc.reservations.group(manager, g.id).leader?.id).toBe(dup.id)
    const r = svc.reservations.create(reception, {
      guest: { id: mergedId } as never,
      channelId: direct,
      status: 'confirmed',
      stays: [
        { roomId: rooms[2]!.id, checkIn: '2026-10-12', checkOut: '2026-10-13', nightlyPriceMinor: 1000 }
      ]
    })
    expect(r.reservation.primaryGuestId).toBe(dup.id)
  })
})

describe('B6/B8 iptal edilmiş rezervasyon', () => {
  it('iptalde tutulan ödeme misafirin ödenen toplamında görünür', async () => {
    const { svc, rooms, book, pay } = await setup('2026-10-10T09:00:00.000Z')
    const a = book(rooms[0]!.id, '2026-10-20', '2026-10-22')
    pay(a.reservation.id, 100_000, 'deposit', '2026-10-10')
    svc.reservations.cancel(reception, a.reservation.id, 'gelemiyor', { mode: 'keep', note: 'iptal bedeli' })
    const h = svc.guests.guestHistory(manager, a.reservation.primaryGuestId)
    expect(h.totalSpent).toEqual({ TRY: 100_000 })
  })

  it('iptal edilmiş rezervasyona açık borcu aşan tahsilat girilemez', async () => {
    const { svc, rooms, book, pay, cash } = await setup('2026-10-10T09:00:00.000Z')
    const a = book(rooms[0]!.id, '2026-10-20', '2026-10-22')
    pay(a.reservation.id, 100_000)
    svc.reservations.cancel(reception, a.reservation.id, 'vazgecti', {
      mode: 'refund',
      methodId: cash,
      amountMinor: 100_000
    })
    expect(() => pay(a.reservation.id, 5_000)).toThrowError(/reservationClosed/)
  })
})
