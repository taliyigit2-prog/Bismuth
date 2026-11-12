// Reservation panel (faz-05 madde 2, 3, 4, 7b) on the real services: conflicts with their reason, payments → night
// colours, people and KBS marks through check-in and check-out, park / restore / refund, blacklist confirmation,
// the panel's own fields, open issues and the form's lists.
import { afterEach, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { depsOf, roleCtx, testClock } from '../../../tests/factories/ctx'
import { seededDatabase } from '../../../tests/factories/db'
import type { DatabaseHandle } from '../db/client'
import { auditLog, paymentMethods, rooms, roomTypes, salesChannels, statusTags } from '../db/schema'
import { ctxFromPermissions } from './context'
import { AppError } from './errors'
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
  const id = (table: typeof salesChannels | typeof paymentMethods, code: string) =>
    handle.db.select().from(table).where(eq(table.code, code)).get()!.id
  const direct = id(salesChannels, 'direct')
  const cash = id(paymentMethods, 'cash')
  const book = (
    roomId = r501.id,
    checkIn = '2026-10-01',
    checkOut = '2026-10-04',
    opts: { status?: 'tentative' | 'confirmed'; name?: string } = {}
  ) =>
    svc.reservations.create(reception, {
      guest: { firstName: opts.name ?? 'Örnek', lastName: 'Misafir', phone: '0532 000 00 00' },
      channelId: direct,
      status: opts.status,
      stays: [{ roomId, checkIn, checkOut, nightlyPriceMinor: 200_000 }]
    })
  return { svc, clock, r501, r502, direct, cash, book }
}

const fills = (v: { stays: { nights: { style: { fill: unknown } }[] }[] }) =>
  v.stays.flatMap((s) => s.nights.map((n) => n.style.fill))

describe('çakışma kuralı ve Türkçe neden (§6.1)', () => {
  it('aynı oda aynı gece iki kesin rezervasyon olmaz; hata oda numarasını, geceleri ve engel rezervasyonu söyler', async () => {
    const { book, r501 } = await setup()
    const first = book()
    let error: unknown
    try {
      book(r501.id, '2026-10-03', '2026-10-05')
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(AppError)
    expect(error).toMatchObject({
      code: 'CONFLICT',
      messageKey: 'errors.roomOccupied',
      details: { room: '501', dates: ['2026-10-03'], codes: [first.reservation.code] }
    })
  })

  it('ön kayıt da odayı tutar: ön kayıtla çakışan kesin rezervasyon yazılmaz', async () => {
    const { book, r501 } = await setup()
    book(r501.id, '2026-10-01', '2026-10-03', { status: 'tentative' })
    expect(() => book(r501.id, '2026-10-02', '2026-10-04')).toThrow(/roomOccupied/)
  })

  it('çıkış günü başka rezervasyonun giriş günü olabilir; aynı gün giriş-çıkış giriş ya da çıkış gününe yazılır, süren konaklamanın içine yazılmaz', async () => {
    const { book, r501, svc } = await setup()
    book()
    expect(book(r501.id, '2026-10-04', '2026-10-06').stays[0]?.nights).toHaveLength(2)
    // 02 is inside 01–04 (G-37): the room is not free in daytime.
    expect(() => book(r501.id, '2026-10-02', '2026-10-02')).toThrow(/roomOccupied/)
    // 01 is the first stay's check-in day: a day-use goes there, once.
    const dayUse = book(r501.id, '2026-10-01', '2026-10-01')
    expect(dayUse.reservation.kind).toBe('day_use')
    expect(() => book(r501.id, '2026-10-01', '2026-10-01')).toThrow(/roomOccupied/)
    const taken = svc.reservations.roomsTaken(reception, { from: '2026-10-04', to: '2026-10-06' })
    expect(taken.occupied).toEqual([r501.id])
    expect(svc.reservations.roomsTaken(reception, { from: '2026-10-06', to: '2026-10-08' }).occupied).toEqual(
      []
    )
  })
})

describe('ödeme → gece dağılımı ve renk (§6.3, §6.14)', () => {
  it('kapora ilk geceyi kırmızıya (ödendi), kısmi ödeme sonraki geceyi "kısmen" boyar; tamamı ödenince hepsi ödendi', async () => {
    const { book, svc, cash } = await setup()
    const r = book()
    const id = r.reservation.id
    const auto = (code: string) => ({ kind: 'auto', code })
    expect(fills(svc.reservations.view(reception, id))).toEqual([
      auto('unpaid'),
      auto('unpaid'),
      auto('unpaid')
    ])
    const pay = (amountMinor: number, kind: 'payment' | 'deposit' = 'payment') =>
      svc.payments.create(reception, {
        reservationId: id,
        date: '2026-10-01',
        kind,
        methodId: cash,
        amountMinor,
        currency: 'TRY'
      })
    pay(300_000, 'deposit')
    const v = svc.reservations.view(reception, id)
    expect(fills(v)).toEqual([auto('paid'), auto('partial'), auto('unpaid')])
    expect(v.payments?.map((p) => [p.kind, p.amountMinor])).toEqual([['deposit', 300_000]])
    expect(v.folio.balanceMinor).toBe(300_000)
    pay(300_000)
    expect(fills(svc.reservations.view(reception, id))).toEqual([auto('paid'), auto('paid'), auto('paid')])
  })

  it('özel etiket öncelikliyse dolguyu alır, ödeme durumu kenarlığa geçer; ödemeleri göremeyen rol ödeme listesini görmez', async () => {
    const { book, svc } = await setup()
    const vip = svc.statusTags.createCustom(owner, {
      name: 'VIP',
      color: '#7c3aed',
      description: 'Önemli misafir',
      priorityOverAuto: true
    })
    const r = book()
    const v = svc.reservations.view(
      reception,
      svc.reservations.update(reception, r.reservation.id, { tagIds: [vip.id] }).reservation.id
    )
    expect(v.tagIds).toEqual([vip.id])
    expect(v.stays[0]?.nights[0]?.style).toMatchObject({
      fill: { kind: 'custom', tagId: vip.id },
      border: { kind: 'auto', code: 'unpaid' }
    })
    const auto = handle.db.select().from(statusTags).where(eq(statusTags.code, 'paid')).get()!
    expect(() => svc.reservations.update(reception, r.reservation.id, { tagIds: [auto.id] })).toThrow(
      /VALIDATION/
    )
    const noMoney = ctxFromPermissions('u-x', 'd', 'ipc', { calendar: 'view' })
    const seen = svc.reservations.view(noMoney, r.reservation.id)
    expect(seen.payments).toBeNull()
    expect(seen.occupantsVisible).toBe(false)
    expect(seen.stays[0]?.occupants).toEqual([])
  })
})

describe('odadaki kişiler ve KBS işaretleri (G-53, G-54, §6.15)', () => {
  it('ikinci kişi KBS işaretsizse uyarı çıkar, işaretlenince kalkar; çıkışta işaretlenmeyen kişi "KBS çıkışı" ister, oda kirli olur', async () => {
    const { book, svc } = await setup()
    const r = book()
    const stayId = r.stays[0]!.id
    const id = r.reservation.id
    svc.reservations.checkIn(reception, stayId)
    const second = svc.occupants.add(reception, stayId, {
      fullName: 'Bora Örnek',
      descriptorNote: 'kızıl saçlı'
    })
    const primary = svc.reservations.view(reception, id).stays[0]!.occupants.find((o) => o.isPrimary)!
    const issues = () => svc.reservations.view(reception, id).stays[0]!.kbsIssues
    expect(issues().map((k) => [k.fullName, k.kind])).toEqual([
      ['Örnek Misafir', 'checkin'],
      ['Bora Örnek', 'checkin']
    ])
    svc.occupants.markKbsReported(reception, primary.id)
    expect(issues().map((k) => k.fullName)).toEqual(['Bora Örnek'])
    svc.occupants.markKbsReported(reception, second.id)
    expect(issues()).toEqual([])

    // Check-out with only the primary guest's KBS check-out ticked.
    const after = svc.reservations.view(
      reception,
      svc.reservations.checkOut(reception, stayId, { kbsCheckoutIds: [primary.id] }).reservation.id
    )
    expect(after.reservation.status).toBe('checked_out')
    expect(after.stays[0]!.kbsIssues).toEqual([
      { occupantId: second.id, fullName: 'Bora Örnek', kind: 'checkout' }
    ])
    const room = handle.db.select().from(rooms).where(eq(rooms.id, r.stays[0]!.roomId)).get()!
    expect(room.hkStatus).toBe('dirty')
  })

  it('KBS girişi yapılmamış kişiye çıkışta KBS çıkışı işaretlenemez; kişi işaretleri yetkisi olmayan rol işaretleyemez', async () => {
    const { book, svc } = await setup()
    const r = book()
    const stayId = r.stays[0]!.id
    svc.reservations.checkIn(reception, stayId)
    const primary = svc.reservations.view(reception, r.reservation.id).stays[0]!.occupants[0]!
    expect(() => svc.reservations.checkOut(reception, stayId, { kbsCheckoutIds: [primary.id] })).toThrow(
      /kbsNotReported/
    )
    const calendarOnly = ctxFromPermissions('u-c', 'd', 'ipc', { calendar: 'edit' })
    expect(() => svc.reservations.checkOut(calendarOnly, stayId, { kbsCheckoutIds: [primary.id] })).toThrow(
      /PERMISSION_DENIED/
    )
  })
})

describe('park et / geri al / iade (G-39)', () => {
  it('park edilen rezervasyon takvimden kalkar, park listesinde ödediğiyle ve eski odasıyla görünür; geri alınca geceler döner', async () => {
    const { book, svc, cash, r501, r502 } = await setup()
    const r = book()
    const id = r.reservation.id
    svc.payments.create(reception, {
      reservationId: id,
      date: '2026-10-01',
      kind: 'deposit',
      methodId: cash,
      amountMinor: 150_000,
      currency: 'TRY'
    })
    const parked = svc.reservations.park(reception, id, { reason: 'postponed', note: 'Kasımda gelecek' })
    expect(parked.reservation.status).toBe('parked')
    expect(svc.reservations.roomsTaken(reception, { from: '2026-10-01', to: '2026-10-04' }).occupied).toEqual(
      []
    )
    const list = svc.reservations.parked(reception)
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({
      id,
      guestName: 'Örnek Misafir',
      parkedReason: 'postponed',
      creditedMinor: 150_000,
      lastNightlyMinor: 200_000,
      stays: [{ roomNumber: '501', checkIn: '2026-10-01', checkOut: '2026-10-04' }]
    })
    // Refund while parked (manager: payments.refund).
    svc.payments.create(manager, {
      reservationId: id,
      date: '2026-10-01',
      kind: 'refund',
      methodId: cash,
      amountMinor: 50_000,
      currency: 'TRY'
    })
    expect(svc.reservations.parked(reception)[0]?.creditedMinor).toBe(100_000)
    const back = svc.reservations.unpark(reception, id, [
      { roomId: r502.id, checkIn: '2026-11-10', checkOut: '2026-11-12', nightlyPriceMinor: 210_000 }
    ])
    expect(back.reservation.status).toBe('confirmed')
    expect(svc.reservations.parked(reception)).toEqual([])
    expect(svc.reservations.view(reception, id).stays.find((s) => s.status === 'planned')).toMatchObject({
      roomNumber: '502',
      nights: [{ payStatus: 'partial' }, { payStatus: 'unpaid' }]
    })
    void r501
  })
})

describe('kara liste uyarısı ve onay (G-45, §6.9)', () => {
  it('kara listedeki ad onaysız yazılmaz, eşleşmeler döner; onaylanınca yazılır ve denetim kaydına geçer', async () => {
    const { book, svc, direct, r501 } = await setup()
    svc.blacklist.add(owner, {
      name: 'Kötü Niyetli',
      severity: 'warn',
      reasonCode: 'unpaid',
      reasonText: 'Ödemeden ayrıldı'
    })
    expect(svc.reservations.blacklistCheck(reception, { name: 'kotu  NIYETLI' })).toMatchObject([
      { name: 'Kötü Niyetli', reasons: ['name'], severity: 'warn', reasonText: 'Ödemeden ayrıldı' }
    ])
    const noBlacklistRead = ctxFromPermissions('u-n', 'd', 'ipc', { calendar: 'edit' })
    expect(
      svc.reservations.blacklistCheck(noBlacklistRead, { name: 'Kötü Niyetli' })[0]?.reasonText
    ).toBeNull()
    const input = {
      guest: { firstName: 'Kötü', lastName: 'Niyetli' },
      channelId: direct,
      stays: [{ roomId: r501.id, checkIn: '2026-10-10', checkOut: '2026-10-11', nightlyPriceMinor: 100_000 }]
    }
    expect(() => svc.reservations.create(reception, input)).toThrow(/blacklistMatch/)
    const created = svc.reservations.create(reception, input, { blacklistConfirmed: true })
    const row = handle.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityId, created.reservation.id), eq(auditLog.action, 'create')))
      .get()
    expect(row?.reason).toMatch(/^blacklist: /)
    void book
  })
})

describe('panelin kendi alanları, çoklu oda, öneri fiyat, açık arıza', () => {
  it('kanal, not, kişi sayısı ve durum değişir; kapanmış rezervasyon değişmez', async () => {
    const { book, svc } = await setup()
    const r = book()
    const booking = handle.db.select().from(salesChannels).where(eq(salesChannels.code, 'booking')).get()
    const patch = {
      channelId: booking?.id ?? r.reservation.channelId,
      notes: 'Geç gelecek',
      adults: 2,
      status: 'tentative' as const
    }
    const v = svc.reservations.update(reception, r.reservation.id, patch)
    expect(v.reservation).toMatchObject({ notes: 'Geç gelecek', adults: 2, status: 'tentative' })
    svc.reservations.cancel(reception, r.reservation.id, 'misafir vazgeçti')
    expect(() => svc.reservations.update(reception, r.reservation.id, { notes: 'x' })).toThrow(
      /reservationClosed/
    )
  })

  it('rezervasyona ikinci oda eklenir; aynı folyo, ödeme iki odanın gecelerine tarih sırasıyla dağılır', async () => {
    const { book, svc, r502, cash } = await setup()
    const r = book(undefined, '2026-10-01', '2026-10-03')
    const v = svc.reservations.addRoom(reception, r.reservation.id, {
      roomId: r502.id,
      checkIn: '2026-10-01',
      checkOut: '2026-10-03',
      nightlyPriceMinor: 100_000
    })
    expect(v.stays.map((s) => s.roomNumber)).toEqual(['501', '502'])
    expect(v.folio.chargesMinor).toBe(600_000)
    svc.payments.create(reception, {
      reservationId: r.reservation.id,
      date: '2026-10-01',
      kind: 'payment',
      methodId: cash,
      amountMinor: 300_000,
      currency: 'TRY'
    })
    const after = svc.reservations.view(reception, r.reservation.id)
    expect(after.stays.map((s) => s.nights.map((n) => n.payStatus))).toEqual([
      ['paid', 'unpaid'],
      ['paid', 'unpaid']
    ])
  })

  it('öneri fiyat hafta sonu ve özel günde farklı gelir; oda tipinin fiyatı yoksa öneri yok', async () => {
    const { svc, r501 } = await setup()
    const s = svc.reservations.suggestPrices(
      reception,
      { roomId: r501.id, checkIn: '2026-10-28', checkOut: '2026-11-01' },
      new Set(['2026-10-29'])
    )
    // Wed base, Thu special day, Fri and Sat weekend nights (K-44: pricing.weekendNights)
    expect(s?.nights.map((n) => [n.priceMinor, n.reason])).toEqual([
      [200_000, 'base'],
      [250_000, 'special'],
      [250_000, 'weekend'],
      [250_000, 'weekend']
    ])
    handle.db.update(roomTypes).set({ basePriceMinor: null }).run()
    expect(
      svc.reservations.suggestPrices(reception, {
        roomId: r501.id,
        checkIn: '2026-10-28',
        checkOut: '2026-10-29'
      })
    ).toBeNull()
  })

  it('odada açık arıza varsa form listesinde ve rezervasyon görünümünde uyarı olur; çözülünce kalkar', async () => {
    const { book, svc, r501 } = await setup()
    const issue = svc.roomIssues.create(reception, {
      roomId: r501.id,
      title: 'Klima su damlatıyor',
      severity: 'medium'
    })
    const options = svc.reservations.formOptions(reception)
    expect(options.rooms.find((r) => r.id === r501.id)?.openIssues.map((i) => i.title)).toEqual([
      'Klima su damlatıyor'
    ])
    expect(options.channels.length).toBeGreaterThan(0)
    expect(options.methods.some((m) => m.isCash)).toBe(true)
    const r = book()
    expect(svc.reservations.view(reception, r.reservation.id).stays[0]?.openIssues).toHaveLength(1)
    svc.roomIssues.resolve(reception, issue.id, {})
    expect(svc.reservations.view(reception, r.reservation.id).stays[0]?.openIssues).toEqual([])
  })
})
