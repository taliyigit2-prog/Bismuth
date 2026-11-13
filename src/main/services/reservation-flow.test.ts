import { afterEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { defaultPermissions } from '@shared/permissions'
import { depsOf, roleCtx, testClock } from '../../../tests/factories/ctx'
import { seededDatabase } from '../../../tests/factories/db'
import type { DatabaseHandle } from '../db/client'
import {
  auditLog,
  charges,
  expenses,
  expenseSections,
  extraServices,
  fxRates,
  paymentMethods,
  rooms,
  roomTypes,
  salesChannels,
  settings
} from '../db/schema'
import { ctxFromPermissions } from './context'
import { createCurrencyService } from './currency-service'
import { createOccupantsService } from './occupants-service'
import { createPaymentsService } from './payments-service'
import { createReservationsService } from './reservations-service'
import { createRoomsService } from './rooms-service'

const owner = roleCtx('owner')
const reception = roleCtx('reception')
const manager = roleCtx('manager')
let handle: DatabaseHandle
afterEach(() => handle?.close())

async function setup() {
  handle = await seededDatabase()
  const clock = testClock('2026-10-01T09:00:00.000Z')
  const onCheckout = vi.fn()
  const deps = depsOf(handle, clock)
  const roomsSvc = createRoomsService(deps)
  const res = createReservationsService({ ...deps, hooks: { onCheckout } })
  const pay = createPaymentsService(deps)
  const occ = createOccupantsService(deps)
  const fx = createCurrencyService(deps)
  const standard = handle.db.select().from(roomTypes).where(eq(roomTypes.code, 'standard')).get()!
  const room = (n: string) =>
    roomsSvc.createRoom(owner, { number: n, roomTypeId: standard.id, beds: 2, validFrom: '2026-01-01' })
  const r501 = room('501')
  const r502 = room('502')
  const id = (table: typeof salesChannels | typeof paymentMethods | typeof extraServices, code: string) =>
    handle.db.select().from(table).where(eq(table.code, code)).get()!.id
  const direct = id(salesChannels, 'direct')
  const cash = id(paymentMethods, 'cash')
  const card = id(paymentMethods, 'card')
  const book = (roomId = r501.id, checkIn = '2026-10-01', checkOut = '2026-10-04', price = 200_000) =>
    res.create(reception, {
      guest: { firstName: 'Örnek', lastName: 'Misafir', phone: '0532 000 00 00' },
      channelId: direct,
      stays: [{ roomId, checkIn, checkOut, nightlyPriceMinor: price }]
    })
  return { clock, res, pay, occ, fx, roomsSvc, r501, r502, direct, cash, card, book, onCheckout, id }
}

const statuses = (d: { stays: { nights: { payStatus: string }[] }[] }) =>
  d.stays.flatMap((s) => s.nights.map((n) => n.payStatus))

describe('rezervasyon → ödeme → gece durumu (§6.3, kabul ölçütü)', () => {
  it('6.000 borçlu 3 gece: 2.000 → [ödendi, ödenmedi, ödenmedi]; 5.000 → son gece kısmen; iade sonrası kısmen', async () => {
    const { res, pay, book, cash } = await setup()
    const r = book()
    expect(r.reservation.code).toBe('R-2026-000001')
    expect(r.folio).toMatchObject({ chargesMinor: 600_000, creditedMinor: 0, balanceMinor: 600_000 })
    const p = (amountMinor: number, kind: 'payment' | 'deposit' | 'refund' = 'payment', ctx = reception) =>
      pay.create(ctx, {
        reservationId: r.reservation.id,
        date: '2026-10-01',
        kind,
        methodId: cash,
        amountMinor,
        currency: 'TRY'
      })
    p(200_000, 'deposit')
    expect(statuses(res.get(owner, r.reservation.id))).toEqual(['paid', 'unpaid', 'unpaid'])
    p(300_000)
    expect(statuses(res.get(owner, r.reservation.id))).toEqual(['paid', 'paid', 'partial'])
    p(100_000)
    expect(statuses(res.get(owner, r.reservation.id))).toEqual(['paid', 'paid', 'paid'])
    // S-100: reception may refund by default; the owner can switch the right off in the role editor.
    const noRefund = ctxFromPermissions('user-reception-2', 'test-device', 'ipc', {
      ...defaultPermissions('reception'),
      'payments.refund': 'none'
    })
    expect(() => p(100_000, 'refund', noRefund)).toThrow(/PERMISSION_DENIED/)
    p(100_000, 'refund', manager)
    const after = res.get(owner, r.reservation.id)
    expect(statuses(after)).toEqual(['paid', 'paid', 'partial'])
    expect(after.folio.balanceMinor).toBe(100_000)
  })

  it('aynı odaya çakışan rezervasyon yazılamaz; çıkış günü yeni giriş ve gündüz kullanımı olur', async () => {
    const { book, r501 } = await setup()
    book()
    expect(() => book(r501.id, '2026-10-03', '2026-10-05')).toThrow(/roomOccupied/)
    expect(book(r501.id, '2026-10-04', '2026-10-06').stays[0]?.nights).toHaveLength(2)
    // The day-use goes on the check-out day (04), not inside the first stay (G-37).
    expect(() => book(r501.id, '2026-10-03', '2026-10-03', 150_000)).toThrow(/roomOccupied/)
    const dayUse = book(r501.id, '2026-10-04', '2026-10-04', 150_000)
    expect(dayUse.reservation.kind).toBe('day_use')
    expect(dayUse.stays[0]?.nights.map((n) => n.slot)).toEqual(['day'])
  })

  it('aynı rezervasyonda aynı odaya çakışan iki konaklama "oda dolu" döner; konaklama en çok 400 gece', async () => {
    const { res, direct, r502 } = await setup()
    const stay = (checkIn: string, checkOut: string) => ({
      roomId: r502.id,
      checkIn,
      checkOut,
      nightlyPriceMinor: 100_000
    })
    const input = (stays: ReturnType<typeof stay>[]) => ({
      guest: { firstName: 'Örnek', lastName: 'Misafir' },
      channelId: direct,
      stays
    })
    expect(() =>
      res.create(reception, input([stay('2026-10-01', '2026-10-03'), stay('2026-10-02', '2026-10-04')]))
    ).toThrow(/roomOccupied/)
    expect(() => res.create(reception, input([stay('2026-10-01', '2027-11-06')]))).toThrow(/VALIDATION/)
    const r = res.create(reception, input([stay('2026-10-01', '2027-11-05')])) // 400 nights
    expect(r.stays[0]?.nights).toHaveLength(400)
    expect(() =>
      res.changeDates(reception, r.stays[0]!.id, { checkIn: '2026-10-01', checkOut: '2027-11-06' })
    ).toThrow(/VALIDATION/)
  })

  it('satılmaz bloğa yalnız "yine de" ve blok yetkisiyle yazılır; gerekçe denetim kaydına düşer', async () => {
    const { roomsSvc, res, r502, direct } = await setup()
    roomsSvc.createBlock(owner, {
      roomId: r502.id,
      dateFrom: '2026-10-01',
      dateTo: '2026-10-10',
      kind: 'oos',
      reason: 'SATILMAZ'
    })
    const input = {
      guest: { firstName: 'A', lastName: 'B' },
      channelId: direct,
      stays: [{ roomId: r502.id, checkIn: '2026-10-02', checkOut: '2026-10-03', nightlyPriceMinor: 1 }]
    }
    expect(() => res.create(reception, input)).toThrow(/roomBlocked/)
    const noBlockRight = ctxFromPermissions('u9', 'd', 'ipc', { calendar: 'edit' })
    expect(() => res.create(noBlockRight, { ...input, overrideBlockReason: 'sahip onayladı' })).toThrow(
      /roomBlocked/
    )
    res.create(owner, { ...input, overrideBlockReason: 'sahip onayladı' })
    const reasons = handle.db
      .select()
      .from(auditLog)
      .all()
      .map((a) => a.reason)
    expect(reasons).toContain('sahip onayladı')
  })
})

describe('konaklama değişiklikleri (G-36, G-44)', () => {
  it('uzatma ve kısaltma geceleri ve masrafları günceller; gece fiyatı değişince eski masraf iptal edilir', async () => {
    const { res, book } = await setup()
    const r = book()
    const stayId = r.stays[0]!.id
    let d = res.changeDates(reception, stayId, { checkIn: '2026-10-01', checkOut: '2026-10-06' })
    expect(d.stays[0]?.nights.map((n) => n.priceMinor)).toEqual([200_000, 200_000, 200_000, 200_000, 200_000])
    d = res.changeDates(reception, stayId, {
      checkIn: '2026-10-01',
      checkOut: '2026-10-03',
      nightlyPriceMinor: 1
    })
    expect(d.folio.chargesMinor).toBe(400_000)
    d = res.setNightPrices(reception, stayId, [{ date: '2026-10-02', priceMinor: 250_000 }])
    expect(d.stays[0]?.nights.map((n) => n.priceMinor)).toEqual([200_000, 250_000])
    expect(d.folio.chargesMinor).toBe(450_000)
    const voided = handle.db
      .select()
      .from(charges)
      .all()
      .filter((c) => c.voidedAt)
    expect(voided.map((c) => c.voidReason).sort()).toEqual([
      'price_change',
      'stay_shortened',
      'stay_shortened',
      'stay_shortened'
    ])
    expect(() => res.setNightPrices(reception, stayId, [{ date: '2026-10-09', priceMinor: 1 }])).toThrow(
      /nightNotInStay/
    )
  })

  it('oda değişikliği: tüm konaklama ya da otelde kalırken yarıdan bölünür; eski oda kirli olur', async () => {
    const { res, roomsSvc, book, r501, r502, clock } = await setup()
    const r = book()
    let d = res.changeRoom(reception, r.stays[0]!.id, { newRoomId: r502.id })
    expect(d.stays.map((s) => s.roomNumber)).toEqual(['502'])
    d = res.checkIn(reception, d.stays[0]!.id)
    clock.set('2026-10-02T10:00:00.000Z')
    d = res.changeRoom(reception, d.stays[0]!.id, { newRoomId: r501.id, fromDate: '2026-10-02' })
    expect(d.stays.map((s) => `${s.roomNumber}:${s.status}:${s.nights.length}`)).toEqual([
      '502:done:1',
      '501:in_house:2'
    ])
    expect(roomsSvc.getRoom(owner, r502.id).hkStatus).toBe('dirty')
    expect(d.folio.chargesMinor).toBe(600_000)
  })

  it('ileri tarihli oda değişikliği: taşınma günü çıkış kişileri KBS işaretleriyle yeni odaya geçirir', async () => {
    const { res, occ, roomsSvc, book, clock, onCheckout, r501, r502 } = await setup()
    const stayId = book().stays[0]!.id
    res.checkIn(reception, stayId)
    const primary = occ.list(reception, stayId)[0]!
    occ.markKbsReported(reception, primary.id)
    let d = res.changeRoom(reception, stayId, { newRoomId: r502.id, fromDate: '2026-10-03' })
    expect(d.stays.map((s) => `${s.roomNumber}:${s.status}:${s.checkIn}>${s.checkOut}`)).toEqual([
      '501:in_house:2026-10-01>2026-10-03',
      '502:planned:2026-10-03>2026-10-04'
    ])
    clock.set('2026-10-03T08:00:00.000Z')
    d = res.checkOut(reception, stayId)
    expect(d.reservation.status).toBe('checked_in')
    expect(d.stays.map((s) => `${s.roomNumber}:${s.status}`)).toEqual(['501:done', '502:in_house'])
    const moved = occ.list(reception, d.stays[1]!.id)
    expect(moved.map((o) => [o.id, o.leftAt, !!o.kbsReportedAt])).toEqual([[primary.id, null, true]])
    expect(occ.kbsMissing(reception)).toEqual([]) // nobody left the hotel: no KBS check-out
    expect(roomsSvc.getRoom(owner, r501.id).hkStatus).toBe('dirty')
    expect(onCheckout).toHaveBeenCalledWith(reception, r501.id, '2026-10-03')
    const moveLog = handle.db.select().from(auditLog).where(eq(auditLog.entityId, d.stays[1]!.id)).all()
    expect(moveLog.map((a) => a.action)).toContain('check_in')
    clock.set('2026-10-04T08:00:00.000Z')
    d = res.checkOut(reception, d.stays[1]!.id)
    expect(d.reservation.status).toBe('checked_out')
    expect(occ.kbsMissing(reception).map((i) => [i.occupantId, i.kind, i.roomId])).toEqual([
      [primary.id, 'checkout', r502.id]
    ])
  })

  it('ardışık iki odalı rezervasyonda ikinci odaya giriş kişileri ilk odadan taşır', async () => {
    const { res, occ, clock, onCheckout, direct, r501, r502 } = await setup()
    const r = res.create(reception, {
      guest: { firstName: 'Örnek', lastName: 'Misafir' },
      channelId: direct,
      stays: [
        { roomId: r501.id, checkIn: '2026-10-01', checkOut: '2026-10-02', nightlyPriceMinor: 100_000 },
        { roomId: r502.id, checkIn: '2026-10-02', checkOut: '2026-10-03', nightlyPriceMinor: 100_000 }
      ]
    })
    const [first, second] = r.stays
    res.checkIn(reception, first!.id)
    const person = occ.add(reception, first!.id, { fullName: 'İkinci Kişi' })
    expect(() => res.checkIn(reception, second!.id)).toThrow(/checkInTooEarly/)
    clock.set('2026-10-02T07:00:00.000Z')
    const d = res.checkIn(reception, second!.id)
    expect(d.stays.map((s) => `${s.roomNumber}:${s.status}`)).toEqual(['501:done', '502:in_house'])
    expect(occ.list(reception, second!.id).map((o) => o.id)).toContain(person.id)
    expect(occ.list(reception, first!.id)).toEqual([])
    expect(onCheckout).toHaveBeenCalledWith(reception, r501.id, '2026-10-02')
    expect(occ.kbsMissing(reception).every((i) => i.kind === 'checkin' && i.roomId === r502.id)).toBe(true)
  })

  it('iptal geceleri boşaltır, ödemeler kalır; park edilen rezervasyon yeni tarihle geri alınır', async () => {
    const { res, pay, book, cash, r501 } = await setup()
    const r = book()
    pay.create(reception, {
      reservationId: r.reservation.id,
      date: '2026-10-01',
      methodId: cash,
      amountMinor: 100_000,
      currency: 'TRY'
    })
    const c = res.cancel(reception, r.reservation.id, 'misafir vazgeçti')
    expect(c.reservation.status).toBe('cancelled')
    expect(c.folio).toMatchObject({ chargesMinor: 0, creditedMinor: 100_000, balanceMinor: -100_000 })
    expect(book().stays[0]?.nights).toHaveLength(3) // the room is free again
    const second = book(r501.id, '2026-11-01', '2026-11-02')
    const parked = res.park(reception, second.reservation.id, { reason: 'no_show_paid' })
    expect(res.listParked(owner).map((x) => x.id)).toEqual([parked.reservation.id])
    const back = res.unpark(reception, second.reservation.id, [
      { roomId: r501.id, checkIn: '2026-11-10', checkOut: '2026-11-12', nightlyPriceMinor: 200_000 }
    ])
    expect(back.reservation.status).toBe('confirmed')
    expect(back.stays.filter((s) => s.status !== 'cancelled')[0]?.nights).toHaveLength(2)
    expect(() => res.cancel(reception, r.reservation.id, 'x')).toThrow(/reservationClosed/)
  })
})

describe('durum, gelmedi, takvim aralığı, fiyat önerisi (G-39, G-48)', () => {
  it('opsiyon ↔ kesin elle değişir; gelmedi geceleri boşaltır ve kaydı kapatır', async () => {
    const { res, book, r502 } = await setup()
    const r = book()
    expect(res.setStatus(reception, r.reservation.id, 'tentative').reservation.status).toBe('tentative')
    expect(res.setStatus(reception, r.reservation.id, 'confirmed').reservation.status).toBe('confirmed')
    expect(() => res.setStatus(reception, r.reservation.id, 'checked_out' as 'confirmed')).toThrow(
      /VALIDATION/
    )
    const later = book(r502.id, '2026-10-01', '2026-10-03')
    const gone = res.noShow(reception, later.reservation.id)
    expect(gone.reservation.status).toBe('no_show')
    expect(gone.stays.flatMap((s) => s.nights)).toEqual([])
    expect(book(r502.id, '2026-10-01', '2026-10-03').stays[0]?.nights).toHaveLength(2) // the room is free again
    expect(() => res.setStatus(reception, later.reservation.id, 'confirmed')).toThrow(/reservationClosed/)
    expect(() => res.noShow(roleCtx('housekeeping'), r.reservation.id)).toThrow(/PERMISSION_DENIED/)
  })

  it('gelmedi varış gününden önce servis katmanında reddedilir; gece boşalmaz', async () => {
    const { res, book, r502 } = await setup()
    const future = book(r502.id, '2026-10-05', '2026-10-07')
    expect(() => res.noShow(reception, future.reservation.id)).toThrow(/noShowTooEarly/)
    expect(res.get(reception, future.reservation.id).stays[0]?.nights).toHaveLength(2)
    expect(res.cancel(reception, future.reservation.id, 'x').reservation.status).toBe('cancelled')
  })

  it('takvim aralığı yalnız o günlerde gecesi olan rezervasyonları verir; ters ya da çok uzun aralık reddedilir', async () => {
    const { res, book, r502 } = await setup()
    const r = book() // 01–04 October
    const later = book(r502.id, '2026-10-10', '2026-10-12')
    const ids = (from: string, to: string) =>
      res
        .listInRange(owner, from, to)
        .map((d) => d.reservation.id)
        .sort()
    expect(ids('2026-10-03', '2026-10-11')).toEqual([r.reservation.id, later.reservation.id].sort())
    expect(ids('2026-10-04', '2026-10-10')).toEqual([])
    expect(() => res.listInRange(owner, '2026-10-10', '2026-10-01')).toThrow(/VALIDATION/)
    expect(() => res.listInRange(owner, '2026-01-01', '2027-06-01')).toThrow(/VALIDATION/)
    expect(() => res.listInRange(roleCtx('employee'), '2026-10-01', '2026-10-02')).toThrow(
      /PERMISSION_DENIED/
    )
  })

  it('fiyat önerisi oda tipinden: vurgulu hafta sonu günü hafta sonu fiyatı; fiyatsız tipte öneri yok', async () => {
    const { res, roomsSvc, r501 } = await setup()
    expect(res.suggestPrice(reception, r501.id, '2026-10-05')).toBeNull()
    roomsSvc.updateRoomType(owner, r501.roomTypeId, {
      basePriceMinor: 200_000,
      weekendPriceMinor: 250_000,
      baseCurrency: 'EUR'
    })
    expect(res.suggestPrice(reception, r501.id, '2026-10-05')).toEqual({
      priceMinor: 200_000,
      currency: 'EUR'
    })
    expect(res.suggestPrice(reception, r501.id, '2026-10-03')).toEqual({
      priceMinor: 250_000,
      currency: 'EUR'
    })
    expect(() => res.suggestPrice(reception, r501.id, '2026-02-30')).toThrow(/VALIDATION/)
  })

  it('folyonun ödemeleri yazıldığı sırayla listelenir; iptal edilen de görünür', async () => {
    const { pay, book, cash, clock } = await setup()
    const r = book()
    const p = (amountMinor: number) =>
      pay.create(reception, {
        reservationId: r.reservation.id,
        date: '2026-10-01',
        methodId: cash,
        amountMinor,
        currency: 'TRY'
      })
    const first = p(10_000)
    clock.advance(1)
    const second = p(20_000)
    pay.void(owner, first.id, 'mükerrer')
    expect(pay.listForFolio(reception, r.folio.id).map((x) => [x.id, x.voidedAt !== null])).toEqual([
      [first.id, true],
      [second.id, false]
    ])
    expect(() => pay.listForFolio(roleCtx('housekeeping'), r.folio.id)).toThrow(/PERMISSION_DENIED/)
  })
})

describe('giriş, çıkış, oda durumu ve "her N konaklama" kancası (G-90, S-14)', () => {
  it('çıkışta oda kirli olur, kişiler ayrılır, görev kancası çağrılır; erken çıkış kalan geceleri bırakır', async () => {
    const { res, roomsSvc, book, onCheckout, clock, r501 } = await setup()
    const r = book()
    const stayId = r.stays[0]!.id
    expect(() => res.checkOut(reception, stayId)).toThrow(/invalidStayState/)
    res.checkIn(reception, stayId)
    clock.set('2026-10-02T08:00:00.000Z')
    const out = res.checkOut(reception, stayId)
    expect(out.reservation.status).toBe('checked_out')
    expect(out.stays[0]).toMatchObject({ checkOut: '2026-10-02', status: 'done' })
    expect(out.stays[0]?.nights).toHaveLength(1)
    expect(roomsSvc.getRoom(owner, r501.id).hkStatus).toBe('dirty')
    expect(onCheckout).toHaveBeenCalledWith(reception, r501.id, '2026-10-02')
    const log = handle.db.select().from(auditLog).where(eq(auditLog.action, 'check_out')).get()!
    expect(JSON.parse(log.beforeJson!)).toEqual({
      checkOut: '2026-10-04',
      nights: [
        { date: '2026-10-02', slot: 'night', priceMinor: 200_000 },
        { date: '2026-10-03', slot: 'night', priceMinor: 200_000 }
      ]
    })
    expect(() => res.checkIn(reception, book(r501.id, '2026-12-01', '2026-12-02').stays[0]!.id)).toThrow(
      /checkInTooEarly/
    )
  })

  it('temizlik ve muhasebe rolü rezervasyon yazamaz', async () => {
    const { res, direct, r501 } = await setup()
    const input = {
      guest: { firstName: 'x' },
      channelId: direct,
      stays: [{ roomId: r501.id, checkIn: '2026-10-01', checkOut: '2026-10-02', nightlyPriceMinor: 1 }]
    }
    expect(() => res.create(roleCtx('housekeeping'), input)).toThrow(/PERMISSION_DENIED/)
    expect(() => res.create(roleCtx('accountant'), input)).toThrow(/PERMISSION_DENIED/)
    expect(() => res.create(owner, { ...input, stays: [] })).toThrow(/VALIDATION/)
  })
})

describe('kur kaydın yazıldığı dakikada donar (K-15, kabul ölçütü)', () => {
  it('EUR ödeme TL folyoya o dakikanın kuruyla yazılır; yalnız tutar değişince yeni kur alınır', async () => {
    const { res, pay, fx, book, cash, clock } = await setup()
    const r = book()
    fx.recordRate(owner, { base: 'EUR', quote: 'TRY', midRateMicro: 50_000_000, source: 'hotel' })
    clock.advance(1)
    const p = pay.create(reception, {
      reservationId: r.reservation.id,
      date: '2026-10-01',
      methodId: cash,
      amountMinor: 10_000,
      currency: 'EUR'
    })
    expect(p).toMatchObject({
      amountFolioMinor: 500_000,
      amountBaseMinor: 500_000,
      fxRateToBase: 50_000_000,
      fxRateAt: '2026-10-01T09:01:00.000Z',
      fxRateObservedAt: '2026-10-01T09:00:00.000Z' // the rate's own time: "kur 1 dakika önceki"
    })
    clock.advance(60)
    fx.recordRate(owner, { base: 'EUR', quote: 'TRY', midRateMicro: 52_000_000, source: 'hotel' })
    clock.advance(1)
    const noted = pay.update(reception, p.id, { note: 'kapora' })
    expect(noted.fxRateAt).toBe(p.fxRateAt)
    expect(noted.amountBaseMinor).toBe(500_000)
    const changed = pay.update(reception, p.id, { amountMinor: 12_000 })
    expect(changed.amountBaseMinor).toBe(624_000)
    expect(changed.fxRateAt).not.toBe(p.fxRateAt)
    // 120 EUR × 52 = 6.240 TL ≥ 6.000 TL: every night paid.
    expect(statuses(res.get(owner, r.reservation.id))).toEqual(['paid', 'paid', 'paid'])
    expect(() =>
      pay.create(reception, {
        reservationId: r.reservation.id,
        date: '2026-10-01',
        methodId: cash,
        amountMinor: 100,
        currency: 'GBP'
      })
    ).toThrow(/noRate/)
    const manual = pay.create(reception, {
      reservationId: r.reservation.id,
      date: '2026-10-01',
      methodId: cash,
      amountMinor: 100,
      currency: 'GBP',
      manualRateMicro: 60_000_000
    })
    expect(manual).toMatchObject({ amountFolioMinor: 6_000, amountBaseMinor: 6_000, fxSource: 'manual' })
    expect(manual.fxRateObservedAt).toBe(manual.fxRateAt)
    const lira = pay.create(reception, {
      reservationId: r.reservation.id,
      date: '2026-10-01',
      methodId: cash,
      amountMinor: 100,
      currency: 'TRY'
    })
    expect(lira).toMatchObject({ fxRateToBase: 1_000_000, fxRateObservedAt: null })
  })
})

describe('kasa teslimi "x" (G-64, S-30, S-31)', () => {
  it('teslim alma Sahip + Müdür; teslim alınan ödeme değiştirilemez; geri alma gerekçeyle', async () => {
    const { pay, book, cash, card } = await setup()
    const r = book()
    const a = pay.create(reception, {
      reservationId: r.reservation.id,
      date: '2026-10-01',
      methodId: cash,
      amountMinor: 100_000,
      currency: 'TRY'
    })
    pay.create(reception, {
      reservationId: r.reservation.id,
      date: '2026-10-01',
      methodId: card,
      amountMinor: 50_000,
      currency: 'TRY'
    })
    const general = handle.db.select().from(expenseSections).where(eq(expenseSections.code, 'general')).get()!
    handle.db
      .insert(expenses)
      .values({
        id: 'e1',
        date: '2026-10-01',
        sectionId: general.id,
        amountMinor: 20_000,
        currency: 'TRY',
        description: 'deterjan',
        descriptionKey: 'deterjan',
        paidFromDrawer: true,
        createdAt: '',
        updatedAt: ''
      })
      .run()
    expect(() => pay.handover(reception, { upToDate: '2026-10-01' })).toThrow(/PERMISSION_DENIED/)
    const h = pay.handover(manager, { upToDate: '2026-10-01', onlyCash: true })
    expect(h).toMatchObject({ payments: 1, expenses: 1 })
    expect(h.totals.drawer).toEqual({ TRY: 80_000 })
    expect(() => pay.update(reception, a.id, { amountMinor: 1 })).toThrow(/paymentCollected/)
    expect(() => pay.void(owner, a.id, 'yanlış')).toThrow(/paymentCollected/)
    expect(() => pay.revertHandover(manager, h.id, '')).toThrow(/reasonRequired/)
    pay.revertHandover(manager, h.id, 'yanlış sayım')
    expect(pay.void(owner, a.id, 'yanlış kayıt').voidedAt).not.toBeNull()
    expect(() => pay.void(reception, a.id, 'x')).toThrow(/PERMISSION_DENIED/)
    expect(handle.db.select().from(expenses).where(eq(expenses.id, 'e1')).get()?.settledAt).toBeNull()
  })

  it('kapatılmış güne yazmak kilit yetkisi ve gerekçe ister (G-72)', async () => {
    const { pay, book, cash, id } = await setup()
    const r = book()
    handle.db
      .insert(settings)
      .values({ key: 'businessDay.closingEnabled', valueJson: 'true', updatedAt: '' })
      .run()
    handle.sqlite
      .prepare(
        "insert into business_days (date, status, created_at, updated_at) values ('2026-09-30', 'closed', '', '')"
      )
      .run()
    const input = {
      reservationId: r.reservation.id,
      date: '2026-09-30',
      methodId: cash,
      amountMinor: 1,
      currency: 'TRY'
    }
    expect(() => pay.create(manager, input)).toThrow(/dayClosed/)
    expect(() => pay.create(owner, input)).toThrow(/dayClosed/)
    const late = pay.create(owner, { ...input, dayClosedReason: 'geç gelen dekont' })
    expect(late.date).toBe('2026-09-30')
    // Voiding changes the closed day too: the manager may void, but not inside a closed day.
    expect(() => pay.void(manager, late.id, 'yanlış kayıt')).toThrow(/dayClosed/)
    expect(pay.void(owner, late.id, 'yanlış kayıt').voidedAt).not.toBeNull()
    const sale = {
      extraServiceId: id(extraServices, 'luggage'),
      date: '2026-09-30',
      unitMinor: 7_000,
      currency: 'TRY'
    }
    expect(() => pay.sellExtra(owner, sale)).toThrow(/dayClosed/)
    const sold = pay.sellExtra(owner, { ...sale, dayClosedReason: 'geç girilen emanet' })
    const row = handle.db.select().from(auditLog).where(eq(auditLog.entityId, sold.chargeId)).get()
    expect(row?.reason).toBe('geç girilen emanet')
  })

  it('müdürün teslimi göremediği bölümdeki kasa giderini kapatmaz (K-38)', async () => {
    const { pay } = await setup()
    const section = (code: string) =>
      handle.db.select().from(expenseSections).where(eq(expenseSections.code, code)).get()!.id
    for (const [id, code] of [
      ['e-general', 'general'],
      ['e-owner', 'owner']
    ] as const)
      handle.db
        .insert(expenses)
        .values({
          id,
          date: '2026-10-01',
          sectionId: section(code),
          amountMinor: 20_000,
          currency: 'TRY',
          description: 'deterjan',
          descriptionKey: 'deterjan',
          paidFromDrawer: true,
          createdAt: '',
          updatedAt: ''
        })
        .run()
    const settledAt = (id: string) =>
      handle.db.select().from(expenses).where(eq(expenses.id, id)).get()?.settledAt ?? null
    expect(pay.handover(manager, { upToDate: '2026-10-01' })).toMatchObject({ payments: 0, expenses: 1 })
    expect(settledAt('e-general')).not.toBeNull()
    expect(settledAt('e-owner')).toBeNull()
    expect(pay.handover(owner, { upToDate: '2026-10-01' })).toMatchObject({ expenses: 1 })
    expect(settledAt('e-owner')).not.toBeNull()
  })

  it('bavul emaneti gibi odasız satış kendi folyosunda kanal ve ödemeyle yazılır (G-68)', async () => {
    const { pay, id } = await setup()
    const sale = pay.sellExtra(reception, {
      extraServiceId: id(extraServices, 'luggage'),
      date: '2026-10-01',
      qty: 2,
      unitMinor: 7_000,
      currency: 'TRY',
      description: '1 bag',
      payment: { methodId: id(paymentMethods, 'bank'), channelId: id(salesChannels, 'bounce') }
    })
    expect(sale.paymentId).not.toBeNull()
    const charge = handle.db.select().from(charges).where(eq(charges.id, sale.chargeId)).get()
    expect(charge).toMatchObject({ kind: 'extra', amountMinor: 14_000, description: '1 bag' })
    expect(() =>
      pay.sellExtra(roleCtx('accountant'), {
        extraServiceId: id(extraServices, 'luggage'),
        date: '2026-10-01',
        unitMinor: 1,
        currency: 'TRY'
      })
    ).toThrow(/PERMISSION_DENIED/)
  })
})

describe('odadaki kişiler ve KBS (G-53, G-54, kabul ölçütü)', () => {
  it('sonradan eklenen kişi KBS işareti yoksa eksik döner, işaretlenince düşer; çıkışta KBS çıkışı istenir', async () => {
    const { res, occ, book, clock } = await setup()
    const r = book()
    const stayId = r.stays[0]!.id
    res.checkIn(reception, stayId)
    const primary = occ.list(reception, stayId)[0]!
    occ.markKbsReported(reception, primary.id)
    expect(occ.kbsMissing(reception)).toEqual([])
    clock.set('2026-10-01T22:30:00.000Z')
    const second = occ.add(reception, stayId, { fullName: 'İkinci Kişi', descriptorNote: 'kızıl saçlı' })
    expect(occ.kbsMissing(reception).map((i) => [i.fullName, i.kind])).toEqual([['İkinci Kişi', 'checkin']])
    expect(occ.inHouse(reception, 'KIZIL').map((x) => x.roomNumber)).toEqual(['501'])
    expect(occ.inHouse(reception)[0]?.people).toBe(2)
    occ.markKbsReported(reception, second.id)
    expect(occ.kbsMissing(reception)).toEqual([])
    clock.set('2026-10-04T08:00:00.000Z')
    res.checkOut(reception, stayId)
    expect(occ.kbsMissing(reception).map((i) => i.kind)).toEqual(['checkout', 'checkout'])
    occ.markKbsCheckout(reception, primary.id)
    occ.markKbsCheckout(reception, second.id)
    expect(occ.kbsMissing(reception)).toEqual([])
    expect(() => occ.markKbsReported(roleCtx('housekeeping'), primary.id)).toThrow(/PERMISSION_DENIED/)
  })

  it('erken ayrılan kişi için KBS çıkışı istenir; iki kez ayrılamaz; çıkışı bildirilenin giriş işareti kalkmaz', async () => {
    const { res, occ, book } = await setup()
    const stayId = book().stays[0]!.id
    res.checkIn(reception, stayId)
    const primary = occ.list(reception, stayId)[0]!
    const friend = occ.add(reception, stayId, { fullName: 'Arkadaş Kişi' })
    occ.markKbsReported(reception, primary.id)
    occ.markKbsReported(reception, friend.id)
    // A mistaken mark is taken back (audited) and the person shows as missing again.
    expect(occ.clearKbsReported(reception, friend.id).kbsReportedAt).toBeNull()
    expect(occ.kbsMissing(reception).map((i) => [i.occupantId, i.kind])).toEqual([[friend.id, 'checkin']])
    occ.markKbsReported(reception, friend.id)
    expect(occ.markLeft(reception, friend.id).leftAt).not.toBeNull()
    expect(() => occ.markLeft(reception, friend.id)).toThrow(/alreadyLeft/)
    expect(occ.inHouse(reception)[0]?.people).toBe(1)
    expect(occ.kbsMissing(reception).map((i) => [i.occupantId, i.kind])).toEqual([[friend.id, 'checkout']])
    occ.markKbsCheckout(reception, friend.id)
    expect(() => occ.clearKbsReported(reception, friend.id)).toThrow(/kbsCheckoutMarked/)
    expect(occ.kbsMissing(reception)).toEqual([])
    expect(() => occ.update(reception, primary.id, { guestId: 'yok' })).toThrow(/NOT_FOUND/)
    // The permission comes first: no existence probe for someone without the right.
    expect(() => occ.update(roleCtx('housekeeping'), primary.id, { guestId: 'yok' })).toThrow(
      /PERMISSION_DENIED/
    )
    expect(occ.update(reception, primary.id, { descriptorNote: 'gözlüklü' }).descriptorNote).toBe('gözlüklü')
    expect(() => occ.markLeft(roleCtx('housekeeping'), primary.id)).toThrow(/PERMISSION_DENIED/)
  })

  it('kimsenin yazılmadığı dolu oda isimsiz KBS uyarısı verir; kişi eklenip bildirilince düşer', async () => {
    const { res, occ, direct, r501, r502 } = await setup()
    const r = res.create(reception, {
      guest: { firstName: 'Grup', lastName: 'Lideri' },
      channelId: direct,
      stays: [
        { roomId: r501.id, checkIn: '2026-10-01', checkOut: '2026-10-03', nightlyPriceMinor: 100_000 },
        { roomId: r502.id, checkIn: '2026-10-01', checkOut: '2026-10-03', nightlyPriceMinor: 100_000 }
      ]
    })
    for (const s of r.stays) res.checkIn(reception, s.id)
    const leader = occ.list(reception, r.stays[0]!.id)[0]!
    occ.markKbsReported(reception, leader.id)
    expect(occ.kbsMissing(reception)).toEqual([
      {
        occupantId: null,
        reservationRoomId: r.stays[1]!.id,
        roomId: r502.id,
        fullName: null,
        kind: 'unnamed'
      }
    ])
    const guest = occ.add(reception, r.stays[1]!.id, { fullName: 'Grup Üyesi' })
    expect(occ.kbsMissing(reception).map((i) => [i.occupantId, i.kind])).toEqual([[guest.id, 'checkin']])
    occ.markKbsReported(reception, guest.id)
    expect(occ.kbsMissing(reception)).toEqual([])
  })

  it('KBS denetimi kapalıysa uyarı yok; KBS girişi olmadan çıkış işareti konamaz', async () => {
    const { res, occ, book } = await setup()
    const r = book()
    res.checkIn(reception, r.stays[0]!.id)
    const first = occ.list(reception, r.stays[0]!.id)[0]!
    expect(() => occ.markKbsCheckout(reception, first.id)).toThrow(/kbsNotReported/)
    expect(occ.kbsMissing(reception)).toHaveLength(1)
    handle.db.insert(settings).values({ key: 'kbs.checksEnabled', valueJson: 'false', updatedAt: '' }).run()
    expect(occ.kbsMissing(reception)).toEqual([])
    expect(handle.db.select().from(rooms).all()).toHaveLength(2)
  })
})

describe('Faz 5 bağlantıları (P5c): oda durumu ve dondurulan kur', () => {
  it('çıkış ve oda taşıma odayı oda durumu kuralıyla kirli yapar; denetim kaydının nedeni check_out', async () => {
    const { res, roomsSvc, book, clock, r501, r502 } = await setup()
    const first = book().stays[0]!.id
    res.checkIn(reception, first)
    // The guests move to 502 for the whole stay: 501 is left behind and needs cleaning.
    res.changeRoom(reception, first, { newRoomId: r502.id })
    expect(roomsSvc.getRoom(owner, r501.id).hkStatus).toBe('dirty')
    const roomLog = (roomId: string) =>
      handle.db
        .select()
        .from(auditLog)
        .where(eq(auditLog.entityId, roomId))
        .all()
        .filter((a) => a.entity === 'room' && a.action === 'update')
    expect(roomLog(r501.id).map((a) => a.reason)).toEqual(['check_out'])
    clock.set('2026-10-04T08:00:00.000Z')
    res.checkOut(reception, first)
    expect(roomsSvc.getRoom(owner, r502.id).hkStatus).toBe('dirty')
    expect(roomLog(r502.id).map((a) => a.reason)).toEqual(['check_out'])
  })

  it('bakımdaki odadan çıkış odanın durumunu bozmaz (bakım sürer)', async () => {
    const { res, roomsSvc, book, clock, r501 } = await setup()
    const stay = book().stays[0]!.id
    res.checkIn(reception, stay)
    handle.db.update(rooms).set({ hkStatus: 'maintenance' }).where(eq(rooms.id, r501.id)).run()
    clock.set('2026-10-04T08:00:00.000Z')
    res.checkOut(reception, stay)
    expect(roomsSvc.getRoom(owner, r501.id).hkStatus).toBe('maintenance')
  })

  it('internet yokken yazılan döviz ödemesi son bilinen kurla donar; panel "eski kur" der (S-32)', async () => {
    const { res, pay, book, cash, clock } = await setup()
    const r = book()
    // A market rate seen at 09:00; the next payment is written ten hours later with no newer rate.
    handle.db
      .insert(fxRates)
      .values({
        id: '01JZZZZZZZZZZZZZZZZZZZZZZ1',
        ts: '2026-10-01T09:00:00.000Z',
        base: 'EUR',
        quote: 'TRY',
        midRateMicro: 50_000_000,
        source: 'market_mid',
        createdAt: '2026-10-01T09:00:00.000Z'
      })
      .run()
    clock.advance(60)
    pay.create(reception, {
      reservationId: r.reservation.id,
      date: '2026-10-01',
      methodId: cash,
      amountMinor: 1_000,
      currency: 'EUR'
    })
    clock.advance(9 * 60)
    const late = pay.create(reception, {
      reservationId: r.reservation.id,
      date: '2026-10-01',
      methodId: cash,
      amountMinor: 2_000,
      currency: 'EUR'
    })
    expect(late).toMatchObject({
      amountFolioMinor: 100_000,
      fxRateAt: '2026-10-01T19:00:00.000Z',
      fxRateObservedAt: '2026-10-01T09:00:00.000Z',
      fxSource: 'market_mid'
    })
    const lines = res.view(reception, r.reservation.id).payments!
    expect(lines.map((p) => [p.amountMinor, p.rateStale, p.rateObservedAt])).toEqual([
      [1_000, false, '2026-10-01T09:00:00.000Z'],
      [2_000, true, '2026-10-01T09:00:00.000Z']
    ])
    // A payment in the folio's own currency has no rate to grow old.
    pay.create(reception, {
      reservationId: r.reservation.id,
      date: '2026-10-01',
      methodId: cash,
      amountMinor: 50_000,
      currency: 'TRY'
    })
    expect(res.view(reception, r.reservation.id).payments!.at(-1)!.rateStale).toBe(false)
  })
})
