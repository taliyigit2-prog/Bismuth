// Early bug hunt fixes of Faz 5 / Faz 6 (P5fix): every test reproduces one finding on the real services first.
// Day-use inside a stay, same-day departure (K-44), the counted-stay rule of the guest history (§6.12), one
// blacklist match for list, card, reservation and people in the room, park / restore / no-show / cancel of one
// room, check-out bound of a stay in the house, names of people in rooms, audit rows, weekend price nights,
// rooms not for sale.
import { afterEach, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { depsOf, roleCtx, testClock } from '../../../tests/factories/ctx'
import { seededDatabase } from '../../../tests/factories/db'
import type { DatabaseHandle } from '../db/client'
import {
  auditLog,
  charges,
  paymentMethods,
  reservationRooms,
  roomNights,
  roomTypes,
  salesChannels,
  stayOccupants
} from '../db/schema'
import { ctxFromPermissions } from './context'
import { createServices } from './index'

const owner = roleCtx('owner')
const reception = roleCtx('reception')
const manager = roleCtx('manager')
let handle: DatabaseHandle
afterEach(() => handle?.close())

async function setup(now = '2026-10-01T09:00:00.000Z') {
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
    .set({ basePriceMinor: 200_000, weekendPriceMinor: 250_000 })
    .where(eq(roomTypes.id, standard.id))
    .run()
  const room = (n: string) =>
    svc.rooms.createRoom(owner, { number: n, roomTypeId: standard.id, beds: 2, validFrom: '2026-01-01' })
  const r501 = room('501')
  const r502 = room('502')
  const direct = handle.db.select().from(salesChannels).where(eq(salesChannels.code, 'direct')).get()!.id
  const cash = handle.db.select().from(paymentMethods).where(eq(paymentMethods.code, 'cash')).get()!.id
  const book = (
    roomId: string,
    checkIn: string,
    checkOut: string,
    opts: {
      status?: 'tentative' | 'confirmed'
      guest?: { id: string } | { firstName: string; lastName: string }
      price?: number
    } = {}
  ) =>
    svc.reservations.create(reception, {
      guest: opts.guest ?? { firstName: 'Örnek', lastName: 'Misafir', phone: '0532 000 00 00' },
      channelId: direct,
      status: opts.status,
      stays: [
        {
          roomId,
          checkIn,
          checkOut,
          nightlyPriceMinor: opts.price ?? 200_000,
          ...(checkIn === checkOut ? { startTime: '10:00', endTime: '11:00' } : {})
        }
      ]
    })
  const audits = (entityId: string) =>
    handle.db.select().from(auditLog).where(eq(auditLog.entityId, entityId)).all()
  return { svc, clock, r501, r502, direct, cash, book, audits }
}

describe('#1 gündüz kullanımı süren konaklamanın ortasına yazılmaz (G-37)', () => {
  it('01–04 konaklamasının 02 gününe gündüz kullanımı yazılmaz; "Boş oda bul" ve dolu oda listesi odayı dolu sayar', async () => {
    const { svc, r501, r502, book } = await setup()
    book(r501.id, '2026-10-01', '2026-10-04')
    expect(() => book(r501.id, '2026-10-02', '2026-10-02')).toThrow(/roomOccupied/)
    expect(svc.calendar.freeRooms(reception, { checkIn: '2026-10-03', checkOut: '2026-10-03' })).toEqual([
      r502.id
    ])
    expect(svc.reservations.roomsTaken(reception, { from: '2026-10-03', to: '2026-10-03' }).occupied).toEqual(
      [r501.id]
    )
    // Its check-in and check-out days stay open for a day-use.
    expect(book(r501.id, '2026-10-04', '2026-10-04').reservation.kind).toBe('day_use')
  })

  it('gündüz kullanımı olan günü kapsayan gece konaklaması yazılmaz; uzatma da o güne geçemez', async () => {
    const { svc, r502, book } = await setup()
    book(r502.id, '2026-10-10', '2026-10-10')
    expect(() => book(r502.id, '2026-10-09', '2026-10-12')).toThrow(/roomOccupied/)
    expect(
      svc.calendar.freeRooms(reception, { checkIn: '2026-10-09', checkOut: '2026-10-12' })
    ).not.toContain(r502.id)
    const before = book(r502.id, '2026-10-08', '2026-10-10')
    expect(() =>
      svc.reservations.changeDates(reception, before.stays[0]!.id, {
        checkIn: '2026-10-08',
        checkOut: '2026-10-11'
      })
    ).toThrow(/roomOccupied/)
  })
})

describe('#2 aynı gün ayrılış (K-44)', () => {
  it('giriş günü çıkış yapan misafirin konaklaması o günün gündüz kullanımına döner; oda bu gece yeniden satılır', async () => {
    const { svc, clock, r501, book } = await setup('2026-10-01T10:00:00.000Z')
    const r = book(r501.id, '2026-10-01', '2026-10-03', { price: 300_000 })
    const stayId = r.stays[0]!.id
    svc.reservations.checkIn(reception, stayId)
    clock.set('2026-10-01T15:00:00.000Z')
    const out = svc.reservations.checkOut(reception, stayId)
    expect(out.reservation).toMatchObject({ status: 'checked_out', kind: 'day_use' })
    expect(out.stays[0]).toMatchObject({ checkIn: '2026-10-01', checkOut: '2026-10-01' })
    expect(out.stays[0]!.nights.map((n) => [n.date, n.slot, n.priceMinor])).toEqual([
      ['2026-10-01', 'day', 300_000]
    ])
    expect(out.folio.chargesMinor).toBe(300_000)
    expect(book(r501.id, '2026-10-01', '2026-10-02').stays[0]!.nights).toHaveLength(1)
  })

  it('çıkış penceresinde yazılan gündüz kullanımı ücreti ilk gecenin fiyatının yerine geçer', async () => {
    const { svc, clock, r501, book } = await setup('2026-10-01T10:00:00.000Z')
    const r = book(r501.id, '2026-10-01', '2026-10-03', { price: 300_000 })
    const stayId = r.stays[0]!.id
    svc.reservations.checkIn(reception, stayId)
    clock.set('2026-10-01T15:00:00.000Z')
    const out = svc.reservations.checkOut(reception, stayId, { dayUsePriceMinor: 120_000 })
    expect(out.stays[0]!.nights.map((n) => n.priceMinor)).toEqual([120_000])
    expect(out.folio.chargesMinor).toBe(120_000)
    // The shortened stay row says when it changed (db rule 4: every write sets updated_at).
    const row = handle.db.select().from(reservationRooms).where(eq(reservationRooms.id, stayId)).get()!
    expect(row).toMatchObject({ checkOut: '2026-10-01', updatedAt: '2026-10-01T15:00:00.000Z' })
  })
})

describe('#3 #19 sayılan konaklama: bugüne kadar başlamış; park, gelmedi, iptal, gelecek hariç (§6.12)', () => {
  it('kart, liste ve arama aynı son konaklamayı ve son ödediği geceliği gösterir', async () => {
    const { svc, r501, r502, book } = await setup()
    const past = book(r501.id, '2026-09-01', '2026-09-03', {
      guest: { firstName: 'Gelen', lastName: 'Misafir' }
    })
    const guest = { id: past.guest.id }
    book(r502.id, '2026-11-01', '2026-11-03', { guest, price: 350_000 })
    const parked = book(r501.id, '2026-09-20', '2026-09-21', { guest, price: 500_000 })
    svc.reservations.park(reception, parked.reservation.id, { reason: 'postponed' })
    const history = svc.guests.guestHistory(reception, guest.id)
    expect(history).toMatchObject({
      lastStayDate: '2026-09-01',
      lastNightly: { amountMinor: 200_000, currency: 'TRY' },
      totalNights: 2,
      stayCount: 1
    })
    const row = svc.guests.list(reception, { q: 'gelen misafir' }).rows[0]
    expect(row).toMatchObject({ lastStayDate: '2026-09-01', nextStayDate: '2026-11-01', stays: 1 })
    expect(svc.guests.list(reception, { filter: 'returning' }).rows).toEqual([])
    expect(svc.reservations.stayCounts(reception, [guest.id]).get(guest.id)).toBe(1)
  })

  it('panelin özet kartı açık rezervasyonun kendisini "son konaklama" saymaz', async () => {
    const { svc, r501, r502, book } = await setup()
    const past = book(r501.id, '2026-09-01', '2026-09-03', {
      guest: { firstName: 'Gelen', lastName: 'Misafir' }
    })
    const now = book(r502.id, '2026-10-01', '2026-10-03', { guest: { id: past.guest.id }, price: 280_000 })
    svc.reservations.checkIn(reception, now.stays[0]!.id)
    expect(svc.guests.guestHistory(reception, past.guest.id).lastStayDate).toBe('2026-10-01')
    const summary = svc.guests.guestHistory(reception, past.guest.id, {
      excludeReservationId: now.reservation.id
    })
    expect(summary).toMatchObject({ lastStayDate: '2026-09-01', stayCount: 1 })
  })
})

describe('#4 #11 kara liste eşleşmesi tek kural: bağlı misafir kaydı da eşleşir (G-45, G-52)', () => {
  it('kara listedeki misafir başka bir kayıtla birleştirilince kart, kontrol ve rezervasyon uyarıyı kaybetmez', async () => {
    const { svc, r501, direct } = await setup()
    const bad = svc.guests.create(owner, { firstName: 'Gadir', lastName: 'Garibov' })
    const keep = svc.guests.create(owner, { firstName: 'Gadir', lastName: 'Gadirov' })
    svc.blacklist.add(owner, {
      guestId: bad.id,
      severity: 'warn',
      reasonCode: 'unpaid',
      reasonText: 'Ödemeden ayrıldı'
    })
    svc.guests.merge(owner, keep.id, bad.id)
    expect(svc.guests.list(reception, { q: 'gadirov' }).rows[0]?.blacklisted).toBe(true)
    expect(svc.guests.card(reception, keep.id).blacklist.map((h) => h.reasons)).toEqual([['guest', 'name']])
    expect(svc.reservations.blacklistCheck(reception, { name: '', guestId: keep.id })).toHaveLength(1)
    const input = {
      guest: { id: keep.id },
      channelId: direct,
      stays: [{ roomId: r501.id, checkIn: '2026-10-10', checkOut: '2026-10-11', nightlyPriceMinor: 100_000 }]
    }
    expect(() => svc.reservations.create(reception, input)).toThrow(/blacklistMatch/)
    expect(svc.reservations.create(reception, input, { blacklistConfirmed: true }).reservation.status).toBe(
      'confirmed'
    )
  })

  it('odaya eklenen kişi kara listeye karşı denetlenir: uyarı onay ister, "engelle" düzeyini resepsiyon geçemez', async () => {
    const { svc, r501, book } = await setup()
    svc.blacklist.add(owner, {
      name: 'Kara Kisi',
      severity: 'block',
      reasonCode: 'damage',
      reasonText: 'Odaya zarar verdi'
    })
    const stayId = book(r501.id, '2026-10-01', '2026-10-03').stays[0]!.id
    expect(() => svc.occupants.add(reception, stayId, { fullName: 'Kara Kişi' })).toThrow(/blacklistMatch/)
    expect(() =>
      svc.occupants.add(reception, stayId, { fullName: 'Kara Kişi' }, { blacklistConfirmed: true })
    ).toThrow(/blacklistBlocked/)
    const row = svc.occupants.add(manager, stayId, { fullName: 'Kara Kişi' }, { blacklistConfirmed: true })
    expect(row.fullName).toBe('Kara Kişi')
  })
})

describe('#5 #6 #20 park et ve takvime al', () => {
  it('ikinci kez park edilen rezervasyonun geri alma önerisi yalnız son odaları gösterir; kayıt tek oda açar', async () => {
    const { svc, clock, r501, r502, book } = await setup()
    const r = book(r501.id, '2026-10-05', '2026-10-07')
    const id = r.reservation.id
    svc.reservations.park(reception, id, { reason: 'postponed' })
    clock.advance(5)
    svc.reservations.unpark(reception, id, [
      { roomId: r502.id, checkIn: '2026-10-08', checkOut: '2026-10-10', nightlyPriceMinor: 200_000 }
    ])
    clock.advance(5)
    svc.reservations.park(reception, id, { reason: 'postponed' })
    const parked = svc.reservations.parked(reception)[0]!
    expect(parked.stays.map((s) => [s.roomNumber, s.checkIn])).toEqual([['502', '2026-10-08']])
    const back = svc.reservations.unpark(
      reception,
      id,
      parked.stays.map((s) => ({ ...s, nightlyPriceMinor: 200_000 }))
    )
    expect(back.stays.filter((s) => s.status === 'planned').map((s) => s.roomNumber)).toEqual(['502'])
    expect(back.folio.chargesMinor).toBe(400_000)
  })

  it('takvime alınca odadaki bütün kişiler (tanıtıcı notlarıyla) yeni odaya geçer, ön kayıt ön kayıt kalır; taşıma denetimde', async () => {
    const { svc, r501, r502, book, audits } = await setup()
    const r = book(r501.id, '2026-10-05', '2026-10-07', { status: 'tentative' })
    const id = r.reservation.id
    const second = svc.occupants.add(reception, r.stays[0]!.id, {
      fullName: 'Bora Örnek',
      descriptorNote: 'kızıl saçlı'
    })
    svc.reservations.park(reception, id, { reason: 'postponed' })
    const back = svc.reservations.unpark(reception, id, [
      { roomId: r502.id, checkIn: '2026-10-12', checkOut: '2026-10-14', nightlyPriceMinor: 200_000 }
    ])
    expect(back.reservation.status).toBe('tentative')
    const view = svc.reservations.view(reception, id)
    const live = view.stays.find((s) => s.status === 'planned')!
    expect(live.occupants.map((o) => [o.fullName, o.descriptorNote])).toEqual([
      ['Örnek Misafir', null],
      ['Bora Örnek', 'kızıl saçlı']
    ])
    expect(audits(second.id).some((a) => a.action === 'update' && a.afterJson?.includes(live.id))).toBe(true)
  })
})

describe('#7 #20 park alanından iptal ve gelmedi; denetim eylem adları', () => {
  it('park edilen rezervasyon iptal edilir ya da gelmedi olur; park ve gelmedi kendi eylem adıyla yazılır', async () => {
    const { svc, r501, r502, book, audits } = await setup()
    const a = book(r501.id, '2026-10-05', '2026-10-07')
    const b = book(r502.id, '2026-10-05', '2026-10-07')
    svc.reservations.park(reception, a.reservation.id, { reason: 'refund_pending' })
    svc.reservations.park(reception, b.reservation.id, { reason: 'no_show_paid' })
    expect(svc.reservations.cancel(reception, a.reservation.id, 'iade edildi').reservation.status).toBe(
      'cancelled'
    )
    expect(svc.reservations.noShow(reception, b.reservation.id).reservation.status).toBe('no_show')
    expect(svc.reservations.parked(reception)).toEqual([])
    expect(audits(a.reservation.id).map((x) => x.action)).toEqual(['create', 'park', 'cancel'])
    expect(audits(b.reservation.id).map((x) => x.action)).toEqual(['create', 'park', 'no_show'])
  })
})

describe('#8 tek oda iptali; kalınmış geceler kalır', () => {
  async function twoRooms() {
    const s = await setup()
    const r = s.book(s.r501.id, '2026-10-01', '2026-10-02')
    s.svc.reservations.addRoom(reception, r.reservation.id, {
      roomId: s.r502.id,
      checkIn: '2026-10-08',
      checkOut: '2026-10-10',
      nightlyPriceMinor: 200_000
    })
    s.svc.reservations.checkIn(reception, r.stays[0]!.id)
    s.clock.set('2026-10-02T09:00:00.000Z')
    s.svc.reservations.checkOut(reception, r.stays[0]!.id)
    const live = () =>
      handle.db
        .select()
        .from(charges)
        .all()
        .filter((c) => !c.voidedAt)
    return { ...s, r, live }
  }

  it('bir odası çıkış yapmış rezervasyonun ileri tarihli odası tek başına iptal edilir; rezervasyon çıkış yapmış olur', async () => {
    const { svc, r, live } = await twoRooms()
    const stay = svc.reservations.view(reception, r.reservation.id).stays.find((s) => s.status === 'planned')!
    const after = svc.reservations.cancelStay(reception, stay.id, 'ikinci oda gerekmedi')
    expect(after.reservation.status).toBe('checked_out')
    expect(after.stays.map((s) => s.status)).toEqual(['done', 'cancelled'])
    expect(live().map((c) => c.amountMinor)).toEqual([200_000])
  })

  it('bütün rezervasyon iptal edilirse yalnız gelecek geceler boşalır; kalınmış gecenin masrafı kalır', async () => {
    const { svc, r, live } = await twoRooms()
    const after = svc.reservations.cancel(reception, r.reservation.id, 'misafir vazgeçti')
    expect(after.stays.map((s) => s.status)).toEqual(['done', 'cancelled'])
    expect(after.reservation.status).toBe('checked_out')
    expect(live().map((c) => c.amountMinor)).toEqual([200_000])
  })
})

describe('#9 giriş yapılmış konaklamada çıkış bugünden önceye çekilmez', () => {
  it('01–05 giriş yapılmış, bugün 03: çıkış 02 ya da 01 olmaz; 03 olur', async () => {
    const { svc, clock, r501, book } = await setup()
    const r = book(r501.id, '2026-10-01', '2026-10-05')
    const stayId = r.stays[0]!.id
    svc.reservations.checkIn(reception, stayId)
    clock.set('2026-10-03T09:00:00.000Z')
    const change = (checkOut: string) =>
      svc.reservations.changeDates(reception, stayId, { checkIn: '2026-10-01', checkOut })
    expect(() => change('2026-10-02')).toThrow(/checkoutTooEarly/)
    expect(() => change('2026-10-01')).toThrow(/checkoutTooEarly/)
    expect(change('2026-10-03').stays[0]!.nights.map((n) => n.date)).toEqual(['2026-10-01', '2026-10-02'])
  })
})

describe('#14 misafir adı düzeltilince odadaki kişi satırı da düzelir (G-60)', () => {
  it('ad düzeltmesi ve birleştirme kişi satırına denetim kaydıyla yansır', async () => {
    const { svc, r501, book, audits } = await setup()
    const r = book(r501.id, '2026-10-01', '2026-10-03', {
      guest: { firstName: 'Mehmet', lastName: 'Yilmz' }
    })
    const occupant = svc.reservations.view(reception, r.reservation.id).stays[0]!.occupants[0]!
    svc.guests.update(reception, r.guest.id, { lastName: 'Yilmaz' })
    const row = () => handle.db.select().from(stayOccupants).where(eq(stayOccupants.id, occupant.id)).get()
    expect(row()?.fullName).toBe('Mehmet Yilmaz')
    expect(audits(occupant.id).some((a) => a.action === 'update' && a.afterJson?.includes('Yilmaz'))).toBe(
      true
    )
    const keep = svc.guests.create(owner, { firstName: 'Mehmet', lastName: 'Yılmaz' })
    svc.guests.merge(owner, keep.id, r.guest.id)
    expect(row()).toMatchObject({ guestId: keep.id, fullName: 'Mehmet Yılmaz' })
  })
})

describe('#15 çıkıştan sonra KBS çıkışı işaretlenmemiş kişi ızgarada simge üretir (§6.15)', () => {
  it('çıkış yapılmış ama KBS çıkışı yapılmamış konaklama takvim çubuğunda uyarı taşır', async () => {
    const { svc, clock, r501, book } = await setup()
    const r = book(r501.id, '2026-10-01', '2026-10-03')
    const stayId = r.stays[0]!.id
    svc.reservations.checkIn(reception, stayId)
    const primary = svc.reservations.view(reception, r.reservation.id).stays[0]!.occupants[0]!
    svc.occupants.markKbsReported(reception, primary.id)
    clock.set('2026-10-03T09:00:00.000Z')
    svc.reservations.checkOut(reception, stayId)
    const grid = svc.calendar.grid(reception, { from: '2026-10-01', to: '2026-10-05' })
    expect(grid.stays.find((s) => s.id === stayId)?.kbsMissing).toBe(true)
    expect(svc.reservations.view(reception, r.reservation.id).stays[0]!.kbsIssues.map((k) => k.kind)).toEqual(
      ['checkout']
    )
  })
})

describe('#16 #17 yetki her ekranda aynı', () => {
  it('ödeme görme yetkisi olmayan rol panelde tahsilat ve bakiye görmez', async () => {
    const { svc, r501, book } = await setup()
    const r = book(r501.id, '2026-10-01', '2026-10-03')
    const noMoney = ctxFromPermissions('u-x', 'd', 'ipc', { calendar: 'view' })
    const v = svc.reservations.view(noMoney, r.reservation.id)
    expect(v.folio).toMatchObject({ chargesMinor: 400_000, creditedMinor: null, balanceMinor: null })
  })

  it('firma görme yetkisi olmayan rol misafir listesinde firma adıyla arayamaz, firma adını görmez', async () => {
    const { svc } = await setup()
    const company = svc.companies.create(owner, { title: 'Deniz Turizm Ltd' })
    svc.guests.create(owner, { firstName: 'Ayşe', lastName: 'Demir', companyId: company.id })
    const noCompany = ctxFromPermissions('u-g', 'd', 'ipc', { guests: 'view' })
    expect(svc.guests.list(noCompany, { q: 'deniz turizm' }).rows).toEqual([])
    expect(svc.guests.list(noCompany, { q: 'ayşe' }).rows[0]?.companyTitle).toBeNull()
    expect(svc.guests.list(owner, { q: 'deniz turizm' }).rows[0]?.companyTitle).toBe('Deniz Turizm Ltd')
  })
})

describe('#20 her yazma denetim kaydında', () => {
  it('rezervasyonda açılan misafir, ana kişi satırı, giriş ve çıkıştaki kişi zamanları kaydedilir', async () => {
    const { svc, clock, r501, book, audits } = await setup()
    const r = book(r501.id, '2026-10-01', '2026-10-03')
    expect(audits(r.guest.id).map((a) => a.action)).toEqual(['create'])
    const occupant = svc.reservations.view(reception, r.reservation.id).stays[0]!.occupants[0]!
    expect(audits(occupant.id).map((a) => a.action)).toEqual(['create'])
    svc.reservations.checkIn(reception, r.stays[0]!.id)
    clock.set('2026-10-03T09:00:00.000Z')
    svc.reservations.checkOut(reception, r.stays[0]!.id)
    const rows = audits(occupant.id)
    expect(rows.map((a) => a.action)).toEqual(['create', 'update', 'update'])
    expect(rows[1]?.afterJson).toContain('arrivedAt')
    expect(rows[2]?.afterJson).toContain('leftAt')
  })
})

describe('#21 hafta sonu fiyat geceleri ayrı ayar (K-44)', () => {
  it('varsayılan cuma ve cumartesi geceleri hafta sonu fiyatı alır; ayar değişince takvim vurgusu değişmeden fiyat değişir', async () => {
    const { svc, r501 } = await setup()
    const nights = () =>
      svc.reservations
        .suggestPrices(reception, { roomId: r501.id, checkIn: '2026-10-29', checkOut: '2026-11-02' })
        ?.nights.map((n) => n.reason)
    // Thu, Fri, Sat, Sun.
    expect(nights()).toEqual(['base', 'weekend', 'weekend', 'base'])
    svc.settings.set(owner, { 'pricing.weekendNights': [6] })
    expect(nights()).toEqual(['base', 'base', 'weekend', 'base'])
    expect(svc.reservations.formOptions(reception).weekendNights).toEqual([6])
  })
})

describe('#22 #25 satılmaz blok ve satışa kapalı oda', () => {
  it('satışa kapalı odaya rezervasyon gerekçesiz yazılmaz; oda blok yetkilisi gerekçeyle yazar, kayıt denetimde', async () => {
    const { svc, r501, direct, audits } = await setup()
    // Through the service: "for sale" is a capacity change with its day (K-27; the row alone is today's copy).
    svc.rooms.updateRoom(owner, r501.id, { sellable: false, validFrom: '2026-10-01' })
    expect(
      svc.reservations.roomsTaken(reception, { from: '2026-10-05', to: '2026-10-06' }).notForSale
    ).toEqual([r501.id])
    expect(
      svc.calendar.freeRooms(reception, { checkIn: '2026-10-05', checkOut: '2026-10-06' })
    ).not.toContain(r501.id)
    const input = {
      guest: { firstName: 'Personel', lastName: 'Misafiri' },
      channelId: direct,
      stays: [{ roomId: r501.id, checkIn: '2026-10-05', checkOut: '2026-10-06', nightlyPriceMinor: 0 }]
    }
    expect(() => svc.reservations.create(reception, input)).toThrow(/roomNotForSale/)
    const noBlockRight = ctxFromPermissions('u-c', 'd', 'ipc', { calendar: 'edit' })
    expect(() =>
      svc.reservations.create(noBlockRight, { ...input, overrideBlockReason: 'sahibin misafiri' })
    ).toThrow(/roomNotForSale/)
    const ok = svc.reservations.create(reception, { ...input, overrideBlockReason: 'sahibin misafiri' })
    expect(ok.stays[0]?.roomId).toBe(r501.id)
    expect(audits(r501.id).some((a) => a.reason === 'sahibin misafiri')).toBe(true)
  })

  it('oda eklerken blok gerekçesi işleyiciye kadar gider', async () => {
    const { svc, r501, r502, book } = await setup()
    svc.rooms.createBlock(owner, {
      roomId: r502.id,
      dateFrom: '2026-10-01',
      dateTo: '2026-10-05',
      kind: 'oos',
      reason: 'boya'
    })
    const r = book(r501.id, '2026-10-01', '2026-10-03')
    const stay = { roomId: r502.id, checkIn: '2026-10-01', checkOut: '2026-10-03', nightlyPriceMinor: 1 }
    expect(() => svc.reservations.addRoom(manager, r.reservation.id, stay)).toThrow(/roomBlocked/)
    const v = svc.reservations.addRoom(manager, r.reservation.id, stay, 'boya bitti, misafir istedi')
    expect(v.stays.map((s) => s.roomNumber)).toEqual(['501', '502'])
    const night = handle.db
      .select()
      .from(roomNights)
      .where(and(eq(roomNights.roomId, r502.id), eq(roomNights.date, '2026-10-01')))
      .get()
    expect(night?.priceMinor).toBe(1)
  })
})
