// P21d (Ö-22): late check-out line, no-show fee, damage deposit and the night report on the real services.
import { afterEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { lateCheckoutSuggestion, noShowSuggestion } from '@shared/domain/fees'
import { depsOf, roleCtx, testClock } from '../../../tests/factories/ctx'
import { seededDatabase } from '../../../tests/factories/db'
import type { DatabaseHandle } from '../db/client'
import { auditLog, damageDeposits, paymentMethods, roomTypes, salesChannels } from '../db/schema'
import { createServices } from './index'

const owner = roleCtx('owner')
const reception = roleCtx('reception')
const housekeeping = roleCtx('housekeeping')
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
  const room = svc.rooms.createRoom(owner, {
    number: '501',
    roomTypeId: standard.id,
    beds: 2,
    validFrom: '2026-01-01'
  })
  const direct = handle.db.select().from(salesChannels).where(eq(salesChannels.code, 'direct')).get()!.id
  const cash = handle.db.select().from(paymentMethods).where(eq(paymentMethods.code, 'cash')).get()!.id
  const book = (checkIn = '2026-10-01', checkOut = '2026-10-03') =>
    svc.reservations.create(reception, {
      guest: { firstName: 'Örnek', lastName: 'Misafir', phone: '0532 000 00 00' },
      channelId: direct,
      status: 'confirmed',
      stays: [{ roomId: room.id, checkIn, checkOut, nightlyPriceMinor: 200_000 }]
    })
  return { svc, clock, cash, book }
}

describe('ücret önerisi (saf hesap, kuruş tam sayı)', () => {
  const late = { mode: 'percent', afterTime: '12:00', amountMinor: 0, percentBp: 5000 } as const
  it('eşiğe kadar ücret yok, sonrası gecelik fiyatın yüzdesi', () => {
    expect(lateCheckoutSuggestion(late, '12:00', 200_001, 'TRY')).toBe(0)
    expect(lateCheckoutSuggestion(late, '14:30', 200_001, 'TRY')).toBe(100_001)
    expect(lateCheckoutSuggestion({ ...late, percentBp: 3333 }, '14:30', 100_000, 'TRY')).toBe(33_330)
  })
  it('sabit tutar ve "yok" kuralı', () => {
    expect(lateCheckoutSuggestion({ ...late, mode: 'fixed', amountMinor: 50_000 }, '13:00', 1, 'TRY')).toBe(
      50_000
    )
    expect(lateCheckoutSuggestion({ ...late, mode: 'none' }, '18:00', 100, 'TRY')).toBe(0)
  })
  it('gelmedi bedeli: yok, ilk gece ya da sabit', () => {
    expect(noShowSuggestion({ mode: 'none', amountMinor: 5 }, 200_000)).toBe(0)
    expect(noShowSuggestion({ mode: 'first_night', amountMinor: 5 }, 200_000)).toBe(200_000)
    expect(noShowSuggestion({ mode: 'fixed', amountMinor: 75_000 }, 200_000)).toBe(75_000)
  })
})

describe('geç çıkış kalemi', () => {
  it('ayardaki kural öneriyi verir; kalem folyoya düşer, bakiyeyi artırır, geçersiz kılınabilir', async () => {
    const { svc, book } = await setup()
    svc.settings.set(owner, {
      'fees.lateCheckout': { mode: 'percent', afterTime: '12:00', amountMinor: 0, percentBp: 5000 }
    })
    const b = book()
    const stayId = b.stays[0]!.id
    svc.reservations.checkIn(reception, stayId)
    const quote = svc.fees.quote(reception, { kind: 'lateCheckout', stayId, time: '15:00' })
    expect(quote).toMatchObject({ suggestedMinor: 100_000, nightlyMinor: 200_000, currency: 'TRY' })
    // The desk changes the amount.
    const before = svc.reservations.view(reception, b.reservation.id).folio.chargesMinor
    svc.fees.addLateCheckout(reception, { stayId, time: '15:00', amountMinor: 80_000 })
    expect(svc.reservations.view(reception, b.reservation.id).folio.chargesMinor).toBe(before + 80_000)
    const lines = svc.fees.folioLines(reception, b.reservation.id)
    const fee = lines.charges.find((c) => c.code === 'late_checkout')!
    expect(fee).toMatchObject({ amountMinor: 80_000, voided: false })
    expect(fee.description).toContain('15:00')
    svc.fees.voidFee(reception, { chargeId: fee.id, reason: 'yanlış girildi' })
    expect(svc.reservations.view(reception, b.reservation.id).folio.chargesMinor).toBe(before)
    expect(
      handle.db
        .select()
        .from(auditLog)
        .where(eq(auditLog.entityId, fee.id))
        .all()
        .map((a) => a.action)
    ).toEqual(['create', 'void'])
  })

  it('girişi yapılmamış konaklamaya ve yetkisiz role yazılmaz', async () => {
    const { svc, book } = await setup()
    const b = book()
    const stayId = b.stays[0]!.id
    expect(() => svc.fees.addLateCheckout(reception, { stayId, time: '15:00', amountMinor: 1000 })).toThrow(
      /feeStayNotStarted/
    )
    svc.reservations.checkIn(reception, stayId)
    expect(() =>
      svc.fees.addLateCheckout(housekeeping, { stayId, time: '15:00', amountMinor: 1000 })
    ).toThrow()
  })
})

describe('gelmedi bedeli', () => {
  it('ilk gece kuralı bedeli önerir; işaretlerken yazılır, folyo bakiyesine girer', async () => {
    const { svc, book } = await setup()
    svc.settings.set(owner, { 'fees.noShow': { mode: 'first_night', amountMinor: 0 } })
    const b = book('2026-10-01', '2026-10-03')
    expect(svc.fees.quote(reception, { kind: 'noShow', reservationId: b.reservation.id })).toMatchObject({
      suggestedMinor: 200_000,
      mode: 'first_night'
    })
    const after = svc.reservations.noShow(reception, b.reservation.id, 'no_show', 200_000)
    expect(after.reservation.status).toBe('no_show')
    // Room nights were released; only the fee stays on the folio.
    expect(after.folio.chargesMinor).toBe(200_000)
    expect(after.folio.balanceMinor).toBe(200_000)
    const fee = svc.fees
      .folioLines(reception, b.reservation.id)
      .charges.find((c) => c.code === 'no_show_fee')!
    expect(fee).toMatchObject({ kind: 'penalty', amountMinor: 200_000 })
  })

  it('bedelsiz işaretleme eskisi gibi çalışır; negatif bedel reddedilir', async () => {
    const { svc, book } = await setup()
    const b = book()
    expect(() => svc.reservations.noShow(reception, b.reservation.id, 'no_show', -5)).toThrow()
    expect(svc.reservations.noShow(reception, b.reservation.id).folio.chargesMinor).toBe(0)
  })
})

describe('hasar depozitosu', () => {
  it('alınınca gelir ve bakiye değişmez; iadede gelire girmez', async () => {
    const { svc, book, cash } = await setup()
    const b = book()
    svc.fees.takeDeposit(reception, { reservationId: b.reservation.id, amountMinor: 100_000, methodId: cash })
    const v = svc.reservations.view(reception, b.reservation.id)
    expect(v.folio.balanceMinor).toBe(v.folio.chargesMinor)
    expect(v.payments).toEqual([])
    const dep = svc.fees.folioLines(reception, b.reservation.id).deposits![0]!
    expect(dep).toMatchObject({ status: 'held', amountMinor: 100_000 })
    // Night report: held, not income.
    const rep = svc.fees.nightReport(owner, { date: '2026-10-01' })
    expect(rep.cash!.byCurrency.find((c) => c.currency === 'TRY')).toMatchObject({
      incomeMinor: 0,
      depositHeldMinor: 100_000
    })
    svc.fees.settleDeposit(reception, { id: dep.id, action: 'refund' })
    expect(svc.fees.folioLines(reception, b.reservation.id).deposits![0]!.status).toBe('refunded')
    expect(
      svc.fees.nightReport(owner, { date: '2026-10-01' }).cash!.byCurrency[0]?.depositHeldMinor ?? 0
    ).toBe(0)
    expect(() => svc.fees.settleDeposit(reception, { id: dep.id, action: 'refund' })).toThrow(
      /depositSettled/
    )
  })

  it('gelire çevirme gerekçe ister; hasar kalemi + ödeme yazar, gelire o an girer', async () => {
    const { svc, book, cash } = await setup()
    const b = book()
    svc.fees.takeDeposit(reception, { reservationId: b.reservation.id, amountMinor: 100_000, methodId: cash })
    const id = svc.fees.folioLines(reception, b.reservation.id).deposits![0]!.id
    expect(() => svc.fees.settleDeposit(reception, { id, action: 'convert' })).toThrow()
    const before = svc.reservations.view(reception, b.reservation.id).folio
    svc.fees.settleDeposit(reception, { id, action: 'convert', reason: 'kırık lamba' })
    const v = svc.reservations.view(reception, b.reservation.id)
    expect(v.folio.chargesMinor).toBe(before.chargesMinor + 100_000)
    expect(v.folio.balanceMinor).toBe(before.balanceMinor) // charge and payment cancel out
    expect(v.payments).toHaveLength(1)
    expect(handle.db.select().from(damageDeposits).get()).toMatchObject({
      status: 'converted',
      settleNote: 'kırık lamba'
    })
    expect(
      svc.fees.nightReport(owner, { date: '2026-10-01' }).cash!.byCurrency.find((c) => c.currency === 'TRY')
    ).toMatchObject({ incomeMinor: 100_000, depositHeldMinor: 0 })
    // The damage line goes with its payment: it is not voided alone.
    const line = svc.fees.folioLines(reception, b.reservation.id).charges.find((c) => c.code === 'damage_fee')!
    expect(() => svc.fees.voidFee(owner, { chargeId: line.id, reason: 'yanlış' })).toThrow()
  })

  it('kat hizmetleri depozito alamaz', async () => {
    const { svc, book, cash } = await setup()
    const b = book()
    expect(() =>
      svc.fees.takeDeposit(housekeeping, {
        reservationId: b.reservation.id,
        amountMinor: 1000,
        methodId: cash
      })
    ).toThrow()
  })
})

describe('gece raporu', () => {
  it('gelen, giden, kalan, gelmeyen ve oda durumu doğru gruplanır; parasız rol kasayı görmez', async () => {
    const { svc, book } = await setup()
    const a = book('2026-10-01', '2026-10-03')
    svc.reservations.checkIn(reception, a.stays[0]!.id)
    const rep = svc.fees.nightReport(owner, { date: '2026-10-01' })
    expect(rep.arrivals.map((l) => l.room)).toEqual(['501'])
    expect(rep.staying).toHaveLength(1)
    expect(rep.departures).toHaveLength(0)
    expect(rep.rooms).toMatchObject({ total: 1, occupied: 1 })
    const out = svc.fees.nightReport(owner, { date: '2026-10-03' })
    expect(out.departures).toHaveLength(1)
    expect(out.staying).toHaveLength(0)
    expect(() => svc.fees.nightReport(housekeeping, { date: '2026-10-01' })).toThrow()
  })

  it('gelmedi işaretlenen rezervasyon o günün "Gelmeyenler" listesinde görünür', async () => {
    const { svc, book } = await setup()
    const b = book('2026-10-01', '2026-10-03')
    svc.reservations.noShow(reception, b.reservation.id)
    const rep = svc.fees.nightReport(owner, { date: '2026-10-01' })
    expect(rep.noShows).toHaveLength(1)
    expect(rep.arrivals).toHaveLength(0)
  })
})
