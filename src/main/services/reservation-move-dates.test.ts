// Son kontrol (QA2c #3): a stay dragged to other dates on the calendar keeps its length and every night keeps its
// own price — the total and what is paid stay the same (faz-15 madde 12, G-36).
import { afterEach, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { depsOf, roleCtx, testClock } from '../../../tests/factories/ctx'
import { seededDatabase } from '../../../tests/factories/db'
import type { DatabaseHandle } from '../db/client'
import { auditLog, charges, paymentMethods, roomTypes, salesChannels } from '../db/schema'
import { createPaymentsService } from './payments-service'
import { createReservationsService } from './reservations-service'
import { createRoomsService } from './rooms-service'

const owner = roleCtx('owner')
const reception = roleCtx('reception')
let handle: DatabaseHandle
afterEach(() => handle?.close())

async function setup() {
  handle = await seededDatabase()
  const clock = testClock('2026-10-01T09:00:00.000Z')
  const deps = depsOf(handle, clock)
  const roomsSvc = createRoomsService(deps)
  const res = createReservationsService(deps)
  const pay = createPaymentsService(deps)
  const standard = handle.db.select().from(roomTypes).where(eq(roomTypes.code, 'standard')).get()!
  const room = (n: string) =>
    roomsSvc.createRoom(owner, { number: n, roomTypeId: standard.id, beds: 2, validFrom: '2026-01-01' })
  const r501 = room('501')
  const direct = handle.db.select().from(salesChannels).where(eq(salesChannels.code, 'direct')).get()!.id
  const cash = handle.db.select().from(paymentMethods).where(eq(paymentMethods.code, 'cash')).get()!.id
  const book = (checkIn: string, checkOut: string, roomId = r501.id) =>
    res.create(reception, {
      guest: { firstName: 'Örnek', lastName: 'Misafir' },
      channelId: direct,
      stays: [{ roomId, checkIn, checkOut, nightlyPriceMinor: 200_000 }]
    })
  return { clock, res, pay, r501, cash, book }
}

const prices = (d: { stays: { nights: { date: string; priceMinor: number }[] }[] }) =>
  d.stays.flatMap((s) => s.nights.map((n) => `${n.date}=${n.priceMinor}`))

describe('sürükle-bırak tarih taşıma: geceler fiyatlarıyla kayar (booking.moveDates)', () => {
  it('3 gece (2.000 + 2.000 + 3.500 = 7.500) bir hafta sonraya taşınınca toplam 7.500 kalır', async () => {
    const { res, book } = await setup()
    const created = book('2026-10-05', '2026-10-08')
    const stayId = created.stays[0]!.id
    res.setNightPrices(reception, stayId, [{ date: '2026-10-07', priceMinor: 350_000 }])
    expect(res.get(reception, created.reservation.id).folio.chargesMinor).toBe(750_000)

    const after = res.moveDates(reception, stayId, { checkIn: '2026-10-12' })
    expect(after.folio.chargesMinor).toBe(750_000)
    expect(after.stays[0]).toMatchObject({ checkIn: '2026-10-12', checkOut: '2026-10-15' })
    expect(prices(after)).toEqual(['2026-10-12=200000', '2026-10-13=200000', '2026-10-14=350000'])
  })

  it('bir gün kaydırınca her gecenin fiyatı kendi gecesiyle gider (geri sürükleyince eski fiyatlar geri gelir)', async () => {
    const { res, book } = await setup()
    const created = book('2026-10-05', '2026-10-08')
    const stayId = created.stays[0]!.id
    res.setNightPrices(reception, stayId, [{ date: '2026-10-05', priceMinor: 350_000 }])
    const moved = res.moveDates(reception, stayId, { checkIn: '2026-10-06' })
    expect(prices(moved)).toEqual(['2026-10-06=350000', '2026-10-07=200000', '2026-10-08=200000'])
    expect(moved.folio.chargesMinor).toBe(750_000)
    const back = res.moveDates(reception, stayId, { checkIn: '2026-10-05' })
    expect(prices(back)).toEqual(['2026-10-05=350000', '2026-10-06=200000', '2026-10-07=200000'])
  })

  it('ödenmiş konaklama taşındıktan sonra da ödenmiş kalır; eski masraflar iptal edilir, denetim kaydı yazılır', async () => {
    const { res, pay, book, cash } = await setup()
    const created = book('2026-10-05', '2026-10-08')
    const stayId = created.stays[0]!.id
    pay.create(reception, {
      reservationId: created.reservation.id,
      date: '2026-10-01',
      kind: 'payment',
      methodId: cash,
      amountMinor: 600_000,
      currency: 'TRY'
    })
    const after = res.moveDates(reception, stayId, { checkIn: '2026-10-20' })
    expect(after.folio.balanceMinor).toBe(0)
    expect(after.stays.flatMap((s) => s.nights.map((n) => n.payStatus))).toEqual(['paid', 'paid', 'paid'])
    const voided = handle.db.select().from(charges).where(eq(charges.voidReason, 'stay_moved')).all()
    expect(voided).toHaveLength(3)
    const audit = handle.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entity, 'reservation_room'), eq(auditLog.entityId, stayId)))
      .all()
    expect(audit.some((a) => a.reason === 'move_dates')).toBe(true)
  })

  it('dolu günlere taşınamaz; otelde kalan misafirin tarihleri taşınmaz; muhasebeci taşıyamaz', async () => {
    const { res, book, clock } = await setup()
    const first = book('2026-10-05', '2026-10-08')
    book('2026-10-10', '2026-10-12')
    expect(() => res.moveDates(reception, first.stays[0]!.id, { checkIn: '2026-10-09' })).toThrow(/CONFLICT/)
    expect(() => res.moveDates(roleCtx('accountant'), first.stays[0]!.id, { checkIn: '2026-10-20' })).toThrow(
      /PERMISSION_DENIED/
    )
    const inHouse = book('2026-10-01', '2026-10-03')
    res.checkIn(reception, inHouse.stays[0]!.id)
    clock.set('2026-10-02T09:00:00.000Z')
    expect(() => res.moveDates(reception, inHouse.stays[0]!.id, { checkIn: '2026-10-04' })).toThrow(
      /stayStarted|INVALID/
    )
  })
})
