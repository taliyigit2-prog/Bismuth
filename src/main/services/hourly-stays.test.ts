// Hourly stays (K-48, S-102…S-105; P17d): several hourly sales in one room and day, hour clashes, the cleaning gap
// warning, the second-round check-out (hata C), the free same-day stay (H-06), hours kept when a stay moves.
import { afterEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { depsOf, roleCtx, testClock } from '../../../tests/factories/ctx'
import { seededDatabase } from '../../../tests/factories/db'
import type { DatabaseHandle } from '../db/client'
import { roomNights, roomTypes, salesChannels } from '../db/schema'
import { createServices } from './index'

const owner = roleCtx('owner')
const reception = roleCtx('reception')
const accountant = roleCtx('accountant')
const housekeeping = roleCtx('housekeeping')
let handle: DatabaseHandle
afterEach(() => handle?.close())

async function setup(now = '2026-10-01T08:00:00.000Z') {
  handle = await seededDatabase()
  const clock = testClock(now)
  const deps = depsOf(handle, clock)
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
    { clock: deps.clock }
  )
  const standard = handle.db.select().from(roomTypes).where(eq(roomTypes.code, 'standard')).get()!
  handle.db
    .update(roomTypes)
    .set({ basePriceMinor: 200_000, weekendPriceMinor: 250_000, hourlyPriceMinor: 30_000 })
    .where(eq(roomTypes.id, standard.id))
    .run()
  const room = (n: string) =>
    svc.rooms.createRoom(owner, { number: n, roomTypeId: standard.id, beds: 2, validFrom: '2026-01-01' })
  const r501 = room('501')
  const r502 = room('502')
  const direct = handle.db.select().from(salesChannels).where(eq(salesChannels.code, 'direct')).get()!.id
  let n = 0
  const guest = () => ({ firstName: `Saatlik${++n}`, lastName: 'Misafir', phone: `0532 000 00 ${10 + n}` })
  const hourly = (roomId: string, date: string, startTime: string, endTime: string, price = 90_000) =>
    svc.reservations.create(reception, {
      guest: guest(),
      channelId: direct,
      stays: [{ roomId, checkIn: date, checkOut: date, startTime, endTime, nightlyPriceMinor: price }]
    })
  const night = (roomId: string, checkIn: string, checkOut: string, price = 200_000) =>
    svc.reservations.create(reception, {
      guest: guest(),
      channelId: direct,
      stays: [{ roomId, checkIn, checkOut, nightlyPriceMinor: price }]
    })
  const wholeDay = (roomId: string, date: string) =>
    svc.reservations.create(reception, {
      guest: guest(),
      channelId: direct,
      stays: [{ roomId, checkIn: date, checkOut: date, nightlyPriceMinor: 100_000 }]
    })
  return { svc, clock, r501, r502, direct, hourly, night, wholeDay }
}

describe('saatlik satış: aynı odada aynı gün sınırsız, yalnız saat çakışması engeller', () => {
  it('aynı odada aynı gün üç saatlik satış saatler çakışmazsa yazılır; uç uca değen aralıklar çakışmaz', async () => {
    const { svc, r501, hourly } = await setup()
    hourly(r501.id, '2026-10-05', '09:00', '12:00')
    hourly(r501.id, '2026-10-05', '12:00', '15:00')
    const third = hourly(r501.id, '2026-10-05', '16:00', '19:00')
    expect(third.reservation.kind).toBe('day_use')
    const rows = handle.db.select().from(roomNights).where(eq(roomNights.roomId, r501.id)).all()
    expect(rows.map((r) => [r.slot, r.startTime, r.endTime]).sort()).toEqual([
      ['day', '09:00', '12:00'],
      ['day', '12:00', '15:00'],
      ['day', '16:00', '19:00']
    ])
    // The grid carries the hours of each bar.
    const grid = svc.calendar.grid(reception, { from: '2026-10-05', to: '2026-10-06' })
    expect(grid.stays.map((s) => [s.startTime, s.endTime]).sort()).toEqual([
      ['09:00', '12:00'],
      ['12:00', '15:00'],
      ['16:00', '19:00']
    ])
  })

  it('saatler çakışırsa roomOccupied olur ve çakışan saatleri söyler', async () => {
    const { r501, hourly } = await setup()
    hourly(r501.id, '2026-10-05', '09:00', '12:00')
    let error: unknown
    try {
      hourly(r501.id, '2026-10-05', '11:00', '13:00')
    } catch (e) {
      error = e
    }
    expect(error).toMatchObject({
      messageKey: 'errors.roomOccupied',
      details: { hours: ['09:00–12:00'], dates: ['2026-10-05'] }
    })
  })

  it('tüm gün gündüz kullanımı ile saatli satış aynı günde bir arada olamaz (iki yönde)', async () => {
    const { r501, r502, hourly, wholeDay } = await setup()
    wholeDay(r501.id, '2026-10-05')
    expect(() => hourly(r501.id, '2026-10-05', '09:00', '10:00')).toThrow(/roomOccupied/)
    hourly(r502.id, '2026-10-05', '09:00', '10:00')
    expect(() => wholeDay(r502.id, '2026-10-05')).toThrow(/roomOccupied/)
  })

  it('saatlik satış aynı günün gecesini engellemez (D); süren konaklamanın ortasına yazılmaz (G-37)', async () => {
    const { r501, hourly, night } = await setup()
    hourly(r501.id, '2026-10-05', '09:00', '12:00')
    expect(night(r501.id, '2026-10-05', '2026-10-07').reservation.kind).toBe('overnight')
    expect(() => hourly(r501.id, '2026-10-06', '09:00', '10:00')).toThrow(/roomOccupied/)
    // The check-out day of that stay is free in daytime.
    expect(hourly(r501.id, '2026-10-07', '09:00', '10:00').reservation.kind).toBe('day_use')
  })

  it('saat aralığı geçersizse (bitiş başlangıçtan önce, yalnız bir saat, gecelik konaklamada saat) reddedilir', async () => {
    const { svc, r501, direct } = await setup()
    const base = { guest: { firstName: 'A', lastName: 'B' }, channelId: direct }
    const stay = { roomId: r501.id, nightlyPriceMinor: 90_000 }
    expect(() =>
      svc.reservations.create(reception, {
        ...base,
        stays: [
          { ...stay, checkIn: '2026-10-05', checkOut: '2026-10-05', startTime: '12:00', endTime: '09:00' }
        ]
      })
    ).toThrow()
    expect(() =>
      svc.reservations.create(reception, {
        ...base,
        stays: [{ ...stay, checkIn: '2026-10-05', checkOut: '2026-10-05', startTime: '09:00' }]
      })
    ).toThrow()
    expect(() =>
      svc.reservations.create(reception, {
        ...base,
        stays: [
          { ...stay, checkIn: '2026-10-05', checkOut: '2026-10-06', startTime: '09:00', endTime: '10:00' }
        ]
      })
    ).toThrow()
  })
})

describe('saat aralığı denetimi ve temizlik arası uyarısı', () => {
  it('temizlik arası dolmadan satışta uyarı verir ama satışı engellemez', async () => {
    const { svc, r501, hourly } = await setup()
    hourly(r501.id, '2026-10-05', '09:00', '12:00')
    const check = svc.reservations.hourlyCheck(reception, {
      roomId: r501.id,
      date: '2026-10-05',
      startTime: '12:30',
      endTime: '14:00'
    })
    expect(check).toMatchObject({
      taken: false,
      turnoverMinutes: 60,
      warnings: [{ startTime: '09:00', endTime: '12:00', gapMinutes: 30 }]
    })
    expect(hourly(r501.id, '2026-10-05', '12:30', '14:00').reservation.kind).toBe('day_use')
    // After the gap there is no warning.
    expect(
      svc.reservations.hourlyCheck(reception, {
        roomId: r501.id,
        date: '2026-10-05',
        startTime: '16:00',
        endTime: '17:00'
      }).warnings
    ).toEqual([])
  })

  it('çakışmayı, kapalı odayı ve oda tipinin saat ücretinden önerilen tutarı bildirir', async () => {
    const { svc, r501, hourly } = await setup()
    hourly(r501.id, '2026-10-05', '09:00', '12:00')
    const clash = svc.reservations.hourlyCheck(reception, {
      roomId: r501.id,
      date: '2026-10-05',
      startTime: '10:00',
      endTime: '11:00'
    })
    expect(clash).toMatchObject({ taken: true, hours: ['09:00–12:00'] })
    // 30.000 minor per hour × 2.5 hours.
    expect(
      svc.reservations.hourlyCheck(reception, {
        roomId: r501.id,
        date: '2026-10-06',
        startTime: '10:00',
        endTime: '12:30'
      })
    ).toMatchObject({ taken: false, suggestedMinor: 75_000, currency: 'TRY' })
  })

  it('görüntüleme yetkisi olmayan rol hourlyCheck çağıramaz', async () => {
    const { svc, r501 } = await setup()
    const input = { roomId: r501.id, date: '2026-10-05', startTime: '10:00', endTime: '11:00' }
    expect(() => svc.reservations.hourlyCheck(housekeeping, input)).toThrow(/PERMISSION_DENIED|permission/i)
    expect(svc.reservations.hourlyCheck(accountant, input).taken).toBe(false)
  })

  it('düzenleme yetkisi olmayan rol saatlik satış yazamaz', async () => {
    const { svc, r501, direct } = await setup()
    expect(() =>
      svc.reservations.create(accountant, {
        guest: { firstName: 'A', lastName: 'B' },
        channelId: direct,
        stays: [
          {
            roomId: r501.id,
            checkIn: '2026-10-05',
            checkOut: '2026-10-05',
            startTime: '09:00',
            endTime: '10:00',
            nightlyPriceMinor: 90_000
          }
        ]
      })
    ).toThrow(/PERMISSION_DENIED|permission/i)
  })
})

describe('hata C: ikinci tur çıkışından sonra oda o gece yeniden satılır', () => {
  it('A girip öğleden sonra çıkar, B geceyi alıp aynı gün girip çıkar; oda o gece üçüncü misafire satılabilir', async () => {
    const { svc, clock, r501, night } = await setup('2026-10-01T09:00:00.000Z')
    const a = night(r501.id, '2026-10-01', '2026-10-03')
    svc.reservations.checkIn(reception, a.stays[0]!.id)
    clock.set('2026-10-01T14:00:00.000Z')
    const aOut = svc.reservations.checkOut(reception, a.stays[0]!.id)
    expect(aOut.stays[0]!.nights.map((x) => [x.slot, x.startTime, x.endTime])).toEqual([
      ['day', '12:00', '17:00']
    ])

    // The night of the 1st is free again: B takes it, comes at 14:30 and leaves at 16:00.
    clock.set('2026-10-01T14:30:00.000Z')
    const b = night(r501.id, '2026-10-01', '2026-10-02')
    svc.reservations.checkIn(reception, b.stays[0]!.id)
    clock.set('2026-10-01T16:00:00.000Z')
    const bOut = svc.reservations.checkOut(reception, b.stays[0]!.id)
    expect(bOut.stays[0]).toMatchObject({ checkIn: '2026-10-01', checkOut: '2026-10-01', status: 'done' })
    expect(bOut.stays[0]!.nights.map((x) => [x.slot, x.startTime, x.endTime])).toEqual([
      ['day', '17:30', '19:00']
    ])
    expect(bOut.folio.chargesMinor).toBe(200_000)

    // No night row is left on the 1st: the room sells that night again.
    const rows = handle.db.select().from(roomNights).where(eq(roomNights.roomId, r501.id)).all()
    expect(rows.filter((r) => r.date === '2026-10-01' && r.slot === 'night')).toHaveLength(0)
    expect(night(r501.id, '2026-10-01', '2026-10-02').stays[0]!.nights).toHaveLength(1)
  })

  it('aynı dakikada girip çıkan ikinci tur da gündüz yuvasına döner (boş aralık bir dakikaya uzar)', async () => {
    const { svc, clock, r501, night } = await setup('2026-10-01T09:00:00.000Z')
    const a = night(r501.id, '2026-10-01', '2026-10-03')
    svc.reservations.checkIn(reception, a.stays[0]!.id)
    clock.set('2026-10-01T14:00:00.000Z')
    svc.reservations.checkOut(reception, a.stays[0]!.id)
    const b = night(r501.id, '2026-10-01', '2026-10-02')
    svc.reservations.checkIn(reception, b.stays[0]!.id)
    const bOut = svc.reservations.checkOut(reception, b.stays[0]!.id)
    expect(bOut.stays[0]!.nights[0]).toMatchObject({ slot: 'day', startTime: '17:00', endTime: '17:01' })
    expect(night(r501.id, '2026-10-01', '2026-10-02').stays).toHaveLength(1)
  })

  it('tek tur: ilk gece çıkışta o saatlerin gündüz yuvasına döner ve gece boşalır', async () => {
    const { svc, clock, r501, night } = await setup('2026-10-01T10:00:00.000Z')
    const a = night(r501.id, '2026-10-01', '2026-10-02')
    svc.reservations.checkIn(reception, a.stays[0]!.id)
    clock.set('2026-10-01T15:30:00.000Z')
    const out = svc.reservations.checkOut(reception, a.stays[0]!.id)
    expect(out.stays[0]!.nights.map((x) => [x.slot, x.startTime, x.endTime])).toEqual([
      ['day', '13:00', '18:30']
    ])
  })

  it('çıkış penceresi: gündüz yuvasının saatleri ve oda tipinin saat ücretinden önerilen tutar görünümde gelir', async () => {
    const { svc, clock, r501, night } = await setup('2026-10-01T10:00:00.000Z')
    const a = night(r501.id, '2026-10-01', '2026-10-03')
    svc.reservations.checkIn(reception, a.stays[0]!.id)
    clock.set('2026-10-01T12:00:00.000Z')
    const view = svc.reservations.view(reception, a.reservation.id)
    // 2 hours × 30.000.
    expect(view.stays[0]!.sameDay).toEqual({ startTime: '13:00', endTime: '15:00', suggestedMinor: 60_000 })
  })
})

describe('H-06: aynı gün çıkışta 0 ücret onay ister', () => {
  async function inHouse() {
    const ctx = await setup('2026-10-01T10:00:00.000Z')
    const a = ctx.night(ctx.r501.id, '2026-10-01', '2026-10-03')
    ctx.svc.reservations.checkIn(reception, a.stays[0]!.id)
    ctx.clock.set('2026-10-01T13:00:00.000Z')
    return { ...ctx, stayId: a.stays[0]!.id }
  }

  it('0 tutar onaysız reddedilir ve hiçbir şey yazılmaz', async () => {
    const { svc, stayId } = await inHouse()
    expect(() => svc.reservations.checkOut(reception, stayId, { dayUsePriceMinor: 0 })).toThrow(
      /dayUseFreeNeedsConfirm/
    )
    // Nothing was written: the guest is still in the house with the night in place.
    const rows = handle.db.select().from(roomNights).where(eq(roomNights.reservationRoomId, stayId)).all()
    expect(rows.map((r) => r.slot)).toEqual(['night', 'night'])
  })

  it('0 tutar onayla yazılır; tutar yazılmazsa ilk gecenin fiyatı kalır', async () => {
    const { svc, stayId } = await inHouse()
    const out = svc.reservations.checkOut(reception, stayId, {
      dayUsePriceMinor: 0,
      dayUseFreeConfirmed: true
    })
    expect(out.folio.chargesMinor).toBe(0)
    expect(out.stays[0]!.status).toBe('done')
  })
})

describe('saatli kayıt taşınınca ve değişince saatler korunur', () => {
  it('tarih taşıma saatleri yeni güne götürür ve orada çakışırsa reddeder', async () => {
    const { svc, r501, hourly } = await setup()
    const a = hourly(r501.id, '2026-10-05', '09:00', '12:00')
    hourly(r501.id, '2026-10-06', '11:00', '13:00')
    expect(() => svc.reservations.moveDates(reception, a.stays[0]!.id, { checkIn: '2026-10-06' })).toThrow(
      /roomOccupied/
    )
    const moved = svc.reservations.moveDates(reception, a.stays[0]!.id, { checkIn: '2026-10-07' })
    expect(moved.stays[0]!.nights.map((n) => [n.date, n.startTime, n.endTime])).toEqual([
      ['2026-10-07', '09:00', '12:00']
    ])
  })

  it('oda değişimi saatleri taşır ve yeni odada çakışmayı yakalar', async () => {
    const { svc, r501, r502, hourly } = await setup()
    const a = hourly(r501.id, '2026-10-05', '09:00', '12:00')
    hourly(r502.id, '2026-10-05', '10:00', '11:00')
    expect(() => svc.reservations.changeRoom(reception, a.stays[0]!.id, { newRoomId: r502.id })).toThrow(
      /roomOccupied/
    )
    const b = hourly(r501.id, '2026-10-05', '13:00', '14:00')
    const changed = svc.reservations.changeRoom(reception, b.stays[0]!.id, { newRoomId: r502.id })
    expect(changed.stays[0]!.nights[0]).toMatchObject({ startTime: '13:00', endTime: '14:00' })
  })

  it('saatlik kayıt iptal edilince saatleri boşalır ve aynı saatlere yeniden satılır', async () => {
    const { svc, r501, hourly } = await setup()
    const a = hourly(r501.id, '2026-10-05', '09:00', '12:00')
    svc.reservations.cancel(reception, a.reservation.id, 'misafir vazgeçti')
    expect(hourly(r501.id, '2026-10-05', '09:00', '12:00').reservation.kind).toBe('day_use')
  })
})

describe('saatlik misafir KBS listesinde (S-104)', () => {
  it('girişi yapılan saatlik misafir KBS eksiklerinde ve "Otelde kalanlar"da görünür; çıkışta KBS çıkışı beklenir', async () => {
    const { svc, clock, r501, hourly } = await setup('2026-10-05T07:00:00.000Z')
    const a = hourly(r501.id, '2026-10-05', '10:00', '12:00')
    const stayId = a.stays[0]!.id
    svc.reservations.checkIn(reception, stayId)
    expect(svc.occupants.kbsMissing(reception).map((i) => [i.reservationRoomId, i.kind])).toEqual([
      [stayId, 'checkin']
    ])
    expect(svc.occupants.inHouse(reception).map((r) => r.roomNumber)).toEqual(['501'])
    clock.set('2026-10-05T09:00:00.000Z')
    svc.reservations.checkOut(reception, stayId)
    expect(svc.occupants.kbsMissing(reception).map((i) => i.kind)).toEqual(['checkout'])
  })
})
