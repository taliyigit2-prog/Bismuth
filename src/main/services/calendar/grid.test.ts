import { afterEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { depsOf, roleCtx, testClock } from '../../../../tests/factories/ctx'
import { seededDatabase } from '../../../../tests/factories/db'
import type { DatabaseHandle } from '../../db/client'
import { paymentMethods, roomTypes, salesChannels } from '../../db/schema'
import { createCalendarService } from '../calendar-service'
import { createOccupantsService } from '../occupants-service'
import { createPaymentsService } from '../payments-service'
import { createReservationsService } from '../reservations-service'
import { createRoomsService } from '../rooms-service'

const owner = roleCtx('owner')
const reception = roleCtx('reception')
let handle: DatabaseHandle
afterEach(() => handle?.close())

async function setup() {
  handle = await seededDatabase()
  const clock = testClock('2026-10-05T09:00:00.000Z')
  const deps = depsOf(handle, clock)
  const roomsSvc = createRoomsService(deps)
  const res = createReservationsService(deps)
  const pay = createPaymentsService(deps)
  const occ = createOccupantsService(deps)
  const cal = createCalendarService(deps)
  const type = (code: string) => handle.db.select().from(roomTypes).where(eq(roomTypes.code, code)).get()!
  const standard = type('standard')
  const other = handle.db
    .select()
    .from(roomTypes)
    .all()
    .find((t) => t.id !== standard.id)!
  const room = (n: string, typeId = standard.id) =>
    roomsSvc.createRoom(owner, { number: n, roomTypeId: typeId, beds: 2, validFrom: '2026-01-01' })
  const [r101, r102, r103] = [room('101'), room('102'), room('103', other.id)]
  const direct = handle.db.select().from(salesChannels).where(eq(salesChannels.code, 'direct')).get()!.id
  const cash = handle.db.select().from(paymentMethods).where(eq(paymentMethods.code, 'cash')).get()!.id
  const book = (
    roomId: string,
    checkIn: string,
    checkOut: string,
    guest: { firstName: string; lastName: string; phone?: string } = {
      firstName: 'Örnek',
      lastName: 'Misafir'
    },
    price = 200_000
  ) =>
    res.create(reception, {
      guest,
      channelId: direct,
      stays: [{ roomId, checkIn, checkOut, nightlyPriceMinor: price }]
    })
  const payFor = (reservationId: string, amountMinor: number) =>
    pay.create(reception, {
      reservationId,
      date: '2026-10-05',
      kind: 'payment',
      methodId: cash,
      amountMinor,
      currency: 'TRY'
    })
  return { clock, roomsSvc, res, occ, cal, r101, r102, r103, standard, book, payFor }
}

describe('takvim ızgarası (reservations.grid)', () => {
  it('odalar sırayla gelir; pencereye gecesi düşen konaklama bütün geceleri ve ödeme durumlarıyla gelir', async () => {
    const { cal, book, payFor, r101, r102 } = await setup()
    // Three nights from 30 Sep: the window starting 1 Oct still shows the stay with all its nights.
    const r = book(r101.id, '2026-09-30', '2026-10-03')
    payFor(r.reservation.id, 200_000)
    book(r102.id, '2026-11-02', '2026-11-04')
    const g = cal.grid(owner, { from: '2026-10-01', to: '2026-11-01' })
    expect(g.today).toBe('2026-10-05')
    expect(g.rooms.map((x) => x.number)).toEqual(['101', '102', '103'])
    expect(g.stays).toHaveLength(1)
    const stay = g.stays[0]!
    expect(stay).toMatchObject({
      roomId: r101.id,
      checkIn: '2026-09-30',
      checkOut: '2026-10-03',
      dayUse: false,
      reservationStatus: 'confirmed',
      guestName: 'Örnek Misafir',
      currency: 'TRY'
    })
    expect(stay.nights.map((n) => [n.date, n.pay])).toEqual([
      ['2026-09-30', 'paid'],
      ['2026-10-01', 'unpaid'],
      ['2026-10-02', 'unpaid']
    ])
  })

  it('kısmi ödeme ikinci geceyi "kısmen" yapar; aynı gün iki misafir (gündüz + gece) ayrı konaklama olarak gelir', async () => {
    const { cal, book, payFor, r101 } = await setup()
    const night = book(r101.id, '2026-10-10', '2026-10-12')
    payFor(night.reservation.id, 300_000)
    book(r101.id, '2026-10-10', '2026-10-10', { firstName: 'Gündüz', lastName: 'Konuk' }, 100_000)
    const g = cal.grid(owner, { from: '2026-10-01', to: '2026-11-01' })
    const [a, b] = [...g.stays].sort((x, y) => Number(x.dayUse) - Number(y.dayUse))
    expect(a!.nights.map((n) => n.pay)).toEqual(['paid', 'partial'])
    expect(b).toMatchObject({ dayUse: true, checkIn: '2026-10-10', checkOut: '2026-10-10' })
    expect(b!.nights).toEqual([{ date: '2026-10-10', pay: 'unpaid', priceMinor: 100_000 }])
  })

  it('iptal edilen ve park edilen rezervasyon ızgarada yoktur; satılmaz blok gelir', async () => {
    const { cal, res, roomsSvc, book, r101, r102, r103 } = await setup()
    const cancelled = book(r101.id, '2026-10-10', '2026-10-12')
    res.cancel(owner, cancelled.reservation.id, 'misafir vazgeçti')
    const parked = book(r102.id, '2026-10-10', '2026-10-12')
    res.park(owner, parked.reservation.id, { reason: 'postponed' })
    roomsSvc.createBlock(owner, {
      roomId: r103.id,
      dateFrom: '2026-10-20',
      dateTo: '2026-10-23',
      kind: 'oos',
      reason: 'Boya'
    })
    const g = cal.grid(owner, { from: '2026-10-01', to: '2026-11-01' })
    expect(g.stays).toEqual([])
    expect(g.blocks).toEqual([
      expect.objectContaining({ roomId: r103.id, dateFrom: '2026-10-20', dateTo: '2026-10-23', kind: 'oos' })
    ])
    expect(cal.grid(owner, { from: '2026-10-23', to: '2026-10-30' }).blocks).toEqual([])
  })

  it('içerideki odada KBS bildirilmemiş kişi varsa işaret gelir; bildirilince kalkar', async () => {
    const { cal, res, occ, book, r101 } = await setup()
    const r = book(r101.id, '2026-10-05', '2026-10-07')
    const stayId = r.stays[0]!.id
    res.checkIn(owner, stayId)
    const flag = () =>
      cal.grid(owner, { from: '2026-10-01', to: '2026-11-01' }).stays.find((s) => s.id === stayId)!.kbsMissing
    expect(flag()).toBe(true)
    for (const person of occ.list(owner, stayId)) occ.markKbsReported(owner, person.id)
    expect(flag()).toBe(false)
  })

  it('günlerin resmî tatilleri ve eklenen not ızgarayla gelir', async () => {
    const { cal } = await setup()
    cal.addNote(owner, { title: 'Fuar', note: 'Erken dolar', target: { mode: 'single', date: '2026-10-14' } })
    const g = cal.grid(owner, { from: '2026-10-01', to: '2026-11-01' })
    expect(g.days.find((d) => d.date === '2026-10-29' && d.kind === 'holiday')).toBeTruthy()
    expect(g.days.find((d) => d.date === '2026-10-14')).toMatchObject({
      kind: 'note',
      title: 'Fuar',
      note: 'Erken dolar'
    })
  })

  it('yetkisi olmayan rol takvimi okuyamaz; muhasebe okur ama not ekleyemez', async () => {
    const { cal } = await setup()
    const housekeeping = roleCtx('housekeeping')
    const accountant = roleCtx('accountant')
    expect(() => cal.grid(housekeeping, { from: '2026-10-01', to: '2026-11-01' })).toThrow(
      /PERMISSION_DENIED/
    )
    expect(() => cal.findStays(housekeeping, { query: 'Örnek' })).toThrow(/PERMISSION_DENIED/)
    expect(() => cal.freeRooms(housekeeping, { checkIn: '2026-10-01', checkOut: '2026-10-02' })).toThrow(
      /PERMISSION_DENIED/
    )
    expect(cal.grid(accountant, { from: '2026-10-01', to: '2026-11-01' }).rooms).toHaveLength(3)
    expect(() =>
      cal.addNote(accountant, { title: 'Not', target: { mode: 'single', date: '2026-10-14' } })
    ).toThrow(/PERMISSION_DENIED/)
  })

  it('ters ya da çok uzun aralık geçersizdir', async () => {
    const { cal } = await setup()
    expect(() => cal.grid(owner, { from: '2026-10-10', to: '2026-10-01' })).toThrow(/VALIDATION/)
    expect(() => cal.grid(owner, { from: '2026-01-01', to: '2027-06-01' })).toThrow(/VALIDATION/)
  })
})

describe('misafir ara (reservations.findStays)', () => {
  it('ad, telefon ya da rezervasyon kodu bulur; bugüne en yakın konaklama önce gelir', async () => {
    const { cal, book, r101, r102 } = await setup()
    const guest = { firstName: 'Ayşe', lastName: 'Kılıç', phone: '0532 111 22 33' }
    book(r101.id, '2026-12-01', '2026-12-03', guest)
    const near = book(r102.id, '2026-10-06', '2026-10-08', guest)
    book(r101.id, '2026-10-20', '2026-10-22', { firstName: 'Mehmet', lastName: 'Demir' })
    const byName = cal.findStays(owner, { query: 'ayse kilic' })
    expect(byName.map((s) => s.checkIn)).toEqual(['2026-10-06', '2026-12-01'])
    expect(byName[0]).toMatchObject({ guestName: 'Ayşe Kılıç', roomNumber: '102' })
    expect(cal.findStays(owner, { query: '111 22' }).map((s) => s.guestName)).toEqual([
      'Ayşe Kılıç',
      'Ayşe Kılıç'
    ])
    expect(cal.findStays(owner, { query: near.reservation.code })).toHaveLength(1)
    expect(cal.findStays(owner, { query: '%%' })).toEqual([])
  })

  it('soyad önce yazılınca, "Oda 102" önekiyle ve telefon sonu "00 01" ile de bulur; çok uzun metin kesilir', async () => {
    const { cal, book, r101, r102 } = await setup()
    book(r101.id, '2026-10-06', '2026-10-08', {
      firstName: 'Ahmet',
      lastName: 'Yılmaz',
      phone: '0532 000 00 01'
    })
    book(r102.id, '2026-10-06', '2026-10-08', { firstName: 'Mehmet', lastName: 'Demir' })
    expect(cal.findStays(owner, { query: 'Yılmaz Ahmet' }).map((s) => s.guestName)).toEqual(['Ahmet Yılmaz'])
    expect(cal.findStays(owner, { query: 'Yılmaz Demir' })).toEqual([])
    for (const q of ['Oda 102', 'oda 102', 'Room 102', 'Номер 102', '102'])
      expect(cal.findStays(owner, { query: q }).map((s) => s.roomNumber)).toEqual(['102'])
    for (const q of ['0001', '00 01', '000 00 01'])
      expect(cal.findStays(owner, { query: q }).map((s) => s.guestName)).toEqual(['Ahmet Yılmaz'])
    expect(() => cal.findStays(owner, { query: 'a'.repeat(500) })).not.toThrow()
  })
})

describe('boş oda bul (reservations.freeRooms)', () => {
  it('dolu ve bloklu odaları çıkarır; oda tipine göre süzer; gündüz kullanımı süren konaklamanın içinde boş sayılmaz', async () => {
    const { cal, roomsSvc, book, r101, r102, r103, standard } = await setup()
    book(r101.id, '2026-10-10', '2026-10-12')
    roomsSvc.createBlock(owner, {
      roomId: r102.id,
      dateFrom: '2026-10-11',
      dateTo: '2026-10-13',
      kind: 'ooo',
      reason: 'Su kaçağı'
    })
    const free = (checkIn: string, checkOut: string, roomTypeId?: string) =>
      cal.freeRooms(reception, { checkIn, checkOut, roomTypeId })
    expect(free('2026-10-10', '2026-10-12')).toEqual([r103.id])
    expect(free('2026-10-12', '2026-10-14')).toEqual([r101.id, r103.id])
    expect(free('2026-10-08', '2026-10-10', standard.id)).toEqual([r101.id, r102.id])
    // Day-use inside 101's stay (10–12): not free (G-37); the block closes 102.
    expect(free('2026-10-11', '2026-10-11')).toEqual([r103.id])
    // On 101's check-in day the room is free in daytime; 102's block starts the next day.
    expect(free('2026-10-10', '2026-10-10')).toEqual([r101.id, r102.id, r103.id])
  })
})
