// P17a (K-55, S-100): the guest gave up after check-in — take the check-in back, cancel with the money settled,
// refund by reception, the closed reservation keeps taking a refund. Every step on the real services.
import { afterEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { defaultPermissions } from '@shared/permissions'
import { depsOf, roleCtx, testClock } from '../../../tests/factories/ctx'
import { seededDatabase } from '../../../tests/factories/db'
import type { DatabaseHandle } from '../db/client'
import {
  auditLog,
  paymentMethods,
  payments,
  reservationRooms,
  roomNights,
  roomTypes,
  salesChannels,
  stayOccupants
} from '../db/schema'
import { ctxFromPermissions } from './context'
import { createServices } from './index'

const owner = roleCtx('owner')
const manager = roleCtx('manager')
const reception = roleCtx('reception')
// Reception with the refund switched off by the owner (S-100: "rol ayarından kapatılabilir").
const receptionNoRefund = ctxFromPermissions('user-reception-2', 'test-device', 'ipc', {
  ...defaultPermissions('reception'),
  'payments.refund': 'none'
})
// Reception whom the owner allowed to take a check-in back.
const receptionUndo = ctxFromPermissions('user-reception-3', 'test-device', 'ipc', {
  ...defaultPermissions('reception'),
  'booking.undoCheckIn': 'edit'
})
let handle: DatabaseHandle
afterEach(() => handle?.close())

async function setup(now = '2026-10-01T09:00:00.000Z') {
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
  const room = (n: string) =>
    svc.rooms.createRoom(owner, { number: n, roomTypeId: standard.id, beds: 2, validFrom: '2026-01-01' })
  const r501 = room('501')
  const r502 = room('502')
  const direct = handle.db.select().from(salesChannels).where(eq(salesChannels.code, 'direct')).get()!.id
  const cash = handle.db.select().from(paymentMethods).where(eq(paymentMethods.code, 'cash')).get()!.id
  const book = (roomId: string, checkIn = '2026-10-01', checkOut = '2026-10-03') =>
    svc.reservations.create(reception, {
      guest: { firstName: 'Örnek', lastName: 'Misafir', phone: '0532 000 00 00' },
      channelId: direct,
      status: 'confirmed',
      stays: [{ roomId, checkIn, checkOut, nightlyPriceMinor: 200_000 }]
    })
  const pay = (
    reservationId: string,
    amountMinor: number,
    kind: 'payment' | 'deposit' | 'refund' = 'payment'
  ) =>
    svc.payments.create(manager, {
      reservationId,
      date: '2026-10-01',
      kind,
      methodId: cash,
      amountMinor,
      currency: 'TRY'
    })
  const audits = (entityId: string) =>
    handle.db.select().from(auditLog).where(eq(auditLog.entityId, entityId)).all()
  const refunds = (reservationId: string) =>
    svc.payments
      .listForFolio(manager, svc.reservations.view(manager, reservationId).folio.id)
      .filter((p) => p.kind === 'refund')
  return { svc, clock, r501, r502, cash, book, pay, audits, refunds }
}

const stayOccupantsOf = (stayId: string) =>
  handle.db.select().from(stayOccupants).where(eq(stayOccupants.reservationRoomId, stayId)).all()

describe('girişten sonra vazgeçme: iptal ve "girişi geri al"', () => {
  it('odada misafir varken iptal reddedilir (önce girişi geri al ya da çıkış yap)', async () => {
    const { svc, r501, book } = await setup()
    const a = book(r501.id)
    svc.reservations.checkIn(reception, a.stays[0]!.id)
    expect(() => svc.reservations.cancel(reception, a.reservation.id, 'vazgeçti')).toThrow(/guestInHouse/)
  })

  it('girişi geri alma: oda yeniden "planlandı", kişinin varış saati silinir, rezervasyon "kesin" olur, denetim satırı yazılır', async () => {
    const { svc, r501, book, audits } = await setup()
    const a = book(r501.id)
    const stayId = a.stays[0]!.id
    svc.reservations.checkIn(reception, stayId)
    expect(stayOccupantsOf(stayId)[0]?.arrivedAt).toBeTruthy()
    const after = svc.reservations.undoCheckIn(manager, stayId, { reason: 'odayı beğenmedi' })
    expect(after.reservation.status).toBe('confirmed')
    expect(after.stays[0]).toMatchObject({ status: 'planned', checkedInAt: null })
    expect(stayOccupantsOf(stayId)[0]?.arrivedAt).toBeNull()
    // The nights were never touched: still held by the planned stay.
    expect(
      handle.db.select().from(roomNights).where(eq(roomNights.reservationRoomId, stayId)).all()
    ).toHaveLength(2)
    const row = audits(stayId).find((x) => x.action === 'check_in_undo')
    expect(row?.reason).toBe('odayı beğenmedi')
    // It can check in again afterwards.
    expect(svc.reservations.checkIn(reception, stayId).reservation.status).toBe('checked_in')
  })

  it('yetki: Sahip ve Müdür geri alır; Resepsiyon varsayılanda alamaz, sahip açarsa alır', async () => {
    const { svc, r501, r502, book } = await setup()
    const a = book(r501.id)
    const b = book(r502.id)
    svc.reservations.checkIn(reception, a.stays[0]!.id)
    svc.reservations.checkIn(reception, b.stays[0]!.id)
    expect(() => svc.reservations.undoCheckIn(reception, a.stays[0]!.id, { reason: 'vazgeçti' })).toThrow(
      /PERMISSION_DENIED/
    )
    expect(
      svc.reservations.undoCheckIn(owner, a.stays[0]!.id, { reason: 'vazgeçti' }).reservation.status
    ).toBe('confirmed')
    expect(
      svc.reservations.undoCheckIn(receptionUndo, b.stays[0]!.id, { reason: 'vazgeçti' }).reservation.status
    ).toBe('confirmed')
  })

  it('yalnız giriş gününde: ertesi gün geri alınamaz', async () => {
    const { svc, clock, r501, book } = await setup()
    const a = book(r501.id, '2026-10-01', '2026-10-04')
    svc.reservations.checkIn(reception, a.stays[0]!.id)
    clock.set('2026-10-02T09:00:00.000Z')
    expect(() => svc.reservations.undoCheckIn(owner, a.stays[0]!.id, { reason: 'vazgeçti' })).toThrow(
      /undoCheckInNotToday/
    )
  })

  it('geri alınmış ya da çıkış yapmış konaklama geri alınamaz (kapalı durum reddi)', async () => {
    const { svc, r501, book } = await setup()
    const a = book(r501.id)
    const stayId = a.stays[0]!.id
    expect(() => svc.reservations.undoCheckIn(owner, stayId, { reason: 'vazgeçti' })).toThrow(
      /invalidStayState/
    )
    svc.reservations.checkIn(reception, stayId)
    svc.reservations.checkOut(reception, stayId)
    expect(() => svc.reservations.undoCheckIn(owner, stayId, { reason: 'vazgeçti' })).toThrow(
      /invalidStayState/
    )
  })

  it("KBS'ye bildirilmiş kişi varsa onay ister; onayla geri alınır ve bildirim kaydı kalır", async () => {
    const { svc, r501, book } = await setup()
    const a = book(r501.id)
    const stayId = a.stays[0]!.id
    svc.reservations.checkIn(reception, stayId)
    const person = stayOccupantsOf(stayId)[0]!
    svc.occupants.markKbsReported(owner, person.id)
    expect(() => svc.reservations.undoCheckIn(owner, stayId, { reason: 'vazgeçti' })).toThrow(
      /undoCheckInKbs/
    )
    expect(
      svc.reservations.undoCheckIn(owner, stayId, { reason: 'vazgeçti', kbsConfirmed: true }).stays[0]!.status
    ).toBe('planned')
    expect(stayOccupantsOf(stayId)[0]?.kbsReportedAt).toBeTruthy()
  })

  it('çok odalı rezervasyonda başka oda odadaysa rezervasyon "giriş yaptı" kalır', async () => {
    const { svc, r501, r502, book } = await setup()
    const a = book(r501.id)
    svc.reservations.addRoom(reception, a.reservation.id, {
      roomId: r502.id,
      checkIn: '2026-10-01',
      checkOut: '2026-10-03',
      nightlyPriceMinor: 200_000
    })
    const view = svc.reservations.view(reception, a.reservation.id)
    for (const s of view.stays) svc.reservations.checkIn(reception, s.id)
    const after = svc.reservations.undoCheckIn(owner, view.stays[0]!.id, { reason: 'vazgeçti' })
    expect(after.reservation.status).toBe('checked_in')
  })
})

describe('iptalde para: iade gir, tahsilat kalsın, iade bekliyor', () => {
  it('girişi geri al + iptal + iade: iade satırı yazılır, rezervasyon iptal olur, hiçbir kayıt silinmez', async () => {
    const { svc, r501, cash, book, pay, refunds, audits } = await setup()
    const a = book(r501.id)
    pay(a.reservation.id, 150_000, 'deposit')
    svc.reservations.checkIn(reception, a.stays[0]!.id)
    svc.reservations.undoCheckIn(manager, a.stays[0]!.id, { reason: 'odayı beğenmedi' })
    const done = svc.reservations.cancel(reception, a.reservation.id, 'odayı beğenmedi', {
      mode: 'refund',
      methodId: cash,
      amountMinor: 150_000
    })
    expect(done.reservation.status).toBe('cancelled')
    expect(refunds(a.reservation.id)).toHaveLength(1)
    expect(refunds(a.reservation.id)[0]).toMatchObject({ amountMinor: 150_000, date: '2026-10-01' })
    // Nothing is deleted: the deposit is still there next to the refund.
    expect(handle.db.select().from(payments).all()).toHaveLength(2)
    expect(
      handle.db
        .select()
        .from(reservationRooms)
        .where(eq(reservationRooms.reservationId, a.reservation.id))
        .all()
    ).toHaveLength(1)
    const cancelAudit = audits(a.reservation.id).find((x) => x.action === 'cancel')!
    expect(cancelAudit.afterJson).toContain('refundedMinor')
    expect(audits(refunds(a.reservation.id)[0]!.id).some((x) => x.action === 'create')).toBe(true)
  })

  it('Resepsiyon varsayılanda iade girer (S-100); iade kapatılmışsa yetkisiz ve iptal de geri alınır', async () => {
    const { svc, r501, r502, cash, book, pay, refunds } = await setup()
    const a = book(r501.id)
    pay(a.reservation.id, 100_000, 'deposit')
    expect(
      svc.payments.create(reception, {
        reservationId: a.reservation.id,
        date: '2026-10-01',
        kind: 'refund',
        methodId: cash,
        amountMinor: 10_000,
        currency: 'TRY'
      }).kind
    ).toBe('refund')
    const b = book(r502.id)
    pay(b.reservation.id, 100_000, 'deposit')
    expect(() =>
      svc.reservations.cancel(receptionNoRefund, b.reservation.id, 'vazgeçti', {
        mode: 'refund',
        methodId: cash,
        amountMinor: 100_000
      })
    ).toThrow(/PERMISSION_DENIED/)
    // All or nothing: the reservation is still open and no refund row exists.
    expect(svc.reservations.view(reception, b.reservation.id).reservation.status).toBe('confirmed')
    expect(refunds(b.reservation.id)).toHaveLength(0)
  })

  it('tahsilattan fazla iade reddedilir ve iptal yapılmaz', async () => {
    const { svc, r501, cash, book, pay, refunds } = await setup()
    const a = book(r501.id)
    pay(a.reservation.id, 100_000, 'deposit')
    expect(() =>
      svc.reservations.cancel(reception, a.reservation.id, 'vazgeçti', {
        mode: 'refund',
        methodId: cash,
        amountMinor: 100_001
      })
    ).toThrow(/refundExceedsPaid/)
    expect(svc.reservations.view(reception, a.reservation.id).reservation.status).toBe('confirmed')
    expect(refunds(a.reservation.id)).toHaveLength(0)
  })

  it('"tahsilat kalsın" gerekçesiz reddedilir; gerekçeyle iptal olur, ödeme yerinde kalır ve gerekçe denetime yazılır', async () => {
    const { svc, r501, book, pay, audits } = await setup()
    const a = book(r501.id)
    pay(a.reservation.id, 100_000, 'deposit')
    expect(() =>
      svc.reservations.cancel(reception, a.reservation.id, 'vazgeçti', { mode: 'keep', note: '' })
    ).toThrow()
    const done = svc.reservations.cancel(reception, a.reservation.id, 'vazgeçti', {
      mode: 'keep',
      note: 'iptal bedeli'
    })
    expect(done.reservation.status).toBe('cancelled')
    expect(done.folio.creditedMinor).toBe(100_000)
    expect(audits(a.reservation.id).find((x) => x.action === 'cancel')?.afterJson).toContain('iptal bedeli')
  })

  it('"iade bekliyor" parkı: gece boşalır, ödeme kalır; müdür sonra iade ile iptal eder', async () => {
    const { svc, r501, cash, book, pay, refunds } = await setup()
    const a = book(r501.id)
    pay(a.reservation.id, 100_000, 'deposit')
    const parked = svc.reservations.park(receptionNoRefund, a.reservation.id, { reason: 'refund_pending' })
    expect(parked.reservation).toMatchObject({ status: 'parked', parkedReason: 'refund_pending' })
    const done = svc.reservations.cancel(manager, a.reservation.id, 'iade edildi', {
      mode: 'refund',
      methodId: cash,
      amountMinor: 100_000
    })
    expect(done.reservation.status).toBe('cancelled')
    expect(refunds(a.reservation.id)).toHaveLength(1)
  })

  it('raporda iptal, gelmedi ve iade ayrı satırlardır; iade tutarı yalnız finans yetkisiyle görünür', async () => {
    const { svc, r501, r502, cash, book, pay } = await setup()
    const a = book(r501.id)
    pay(a.reservation.id, 150_000, 'deposit')
    svc.reservations.cancel(reception, a.reservation.id, 'vazgeçti', {
      mode: 'refund',
      methodId: cash,
      amountMinor: 150_000
    })
    const b = book(r502.id)
    svc.reservations.noShow(reception, b.reservation.id)
    const october = { from: '2026-10-01', to: '2026-11-01' }
    expect(svc.reports.occupancy(owner, october).outcomes).toEqual({
      cancelled: 1,
      noShow: 1,
      refundRows: 1,
      refundMinor: 150_000
    })
    // The manager reads the same lines (`reports.operations` + `reports.finance` view).
    const ops = svc.reports.occupancy(manager, october).outcomes
    expect(ops.cancelled).toBe(1)
    expect(svc.reports.occupancy(owner, { from: '2026-11-01', to: '2026-12-01' }).outcomes).toMatchObject({
      cancelled: 0,
      noShow: 0,
      refundRows: 0
    })
  })

  it('kapalı rezervasyon (çıkış yapıldı) iptal edilemez ama iade girilebilir; iade defter gününde ve kasa tesliminde görünür', async () => {
    const { svc, r501, cash, book, pay, refunds } = await setup()
    const a = book(r501.id, '2026-10-01', '2026-10-02')
    pay(a.reservation.id, 200_000)
    svc.reservations.checkIn(reception, a.stays[0]!.id)
    svc.reservations.checkOut(reception, a.stays[0]!.id)
    expect(() => svc.reservations.cancel(reception, a.reservation.id, 'vazgeçti')).toThrow(
      /reservationClosed/
    )
    const refund = svc.payments.create(reception, {
      reservationId: a.reservation.id,
      date: '2026-10-01',
      kind: 'refund',
      methodId: cash,
      amountMinor: 80_000,
      currency: 'TRY'
    })
    expect(refunds(a.reservation.id)).toHaveLength(1)
    const day = svc.ledger.getDay(manager, '2026-10-01')
    expect(day.income.find((r) => r.id === refund.id)).toMatchObject({ kind: 'refund', amountMinor: 80_000 })
    const done = svc.payments.handover(manager, { upToDate: '2026-10-01' })
    expect(done.payments).toBe(2)
    expect(handle.db.select().from(payments).where(eq(payments.id, refund.id)).get()?.handoverId).toBeTruthy()
  })
})
