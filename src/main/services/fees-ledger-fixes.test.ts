// S2-G2 fixes: night report staff money, closed-day reasons on fee lines, deposit conversion undo, cancelled
// reservations in the ledger picker, future day closing, far-future expense dates, stay-kind filter on ALOS/export,
// tourism planned departure with an hourly sale sharing the arrival day.
import { afterEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { localDate } from '@shared/date'
import { depsOf, roleCtx, testClock } from '../../../tests/factories/ctx'
import { seededDatabase } from '../../../tests/factories/db'
import { kbsWorkbookBuffer } from '../../../tests/factories/kbs'
import type { DatabaseHandle } from '../db/client'
import { damageDeposits, expenseSections, payments, paymentMethods, roomTypes, salesChannels } from '../db/schema'
import { createServices } from './index'
import { insertExpenseTx } from './expenses-service'

const owner = roleCtx('owner')
const reception = roleCtx('reception')
const manager = roleCtx('manager')
let handle: DatabaseHandle
afterEach(() => handle?.close())

async function setup(now = '2026-10-15T09:00:00.000Z') {
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
  const rooms = ['501', '502'].map((number) =>
    svc.rooms.createRoom(owner, { number, roomTypeId: standard.id, beds: 2, validFrom: '2026-01-01' })
  )
  const direct = handle.db.select().from(salesChannels).where(eq(salesChannels.code, 'direct')).get()!.id
  const cash = handle.db.select().from(paymentMethods).where(eq(paymentMethods.code, 'cash')).get()!.id
  const general = handle.db.select().from(expenseSections).where(eq(expenseSections.code, 'general')).get()!
    .id
  const book = (room: number, checkIn: string, checkOut: string, last = 'Misafir') =>
    svc.reservations.create(reception, {
      guest: { firstName: 'Örnek', lastName: last, phone: '0532 000 00 00' },
      channelId: direct,
      status: 'confirmed',
      stays: [{ roomId: rooms[room]!.id, checkIn, checkOut, nightlyPriceMinor: 100_000 }]
    })
  return { svc, clock, rooms, direct, cash, general, book }
}

describe('gece raporu giderleri', () => {
  it('personel parası yetkisiz müdürün gece raporuna girmez (defterle aynı rakam)', async () => {
    const { svc, general } = await setup()
    svc.expenses.createExpense(manager, {
      date: '2026-10-15',
      sectionId: general,
      amountMinor: 10_000,
      currency: 'TRY',
      description: 'Su',
      paidFromDrawer: false
    })
    handle.db.transaction((tx) => {
      insertExpenseTx(tx, owner, new Date('2026-10-15T09:00:00.000Z'), {
        date: '2026-10-15',
        sectionId: general,
        amountMinor: 4_000_000,
        currency: 'TRY',
        description: 'Maaş',
        kind: 'staff',
        paidFromDrawer: false
      })
    })
    const spent = (ctx: typeof owner) =>
      svc.fees.nightReport(ctx, { date: '2026-10-15' }).cash!.byCurrency.find((c) => c.currency === 'TRY')!
        .expenseMinor
    expect(spent(manager)).toBe(10_000)
    expect(svc.ledger.getDay(manager, '2026-10-15').expenses.reduce((s, e) => s + e.amountMinor, 0)).toBe(
      10_000
    )
    expect(spent(owner)).toBe(4_010_000)
  })
})

describe('kapalı güne ücret satırı ve depozito', () => {
  async function closedDay() {
    const t = await setup()
    t.svc.settings.set(owner, { 'businessDay.closingEnabled': true })
    const b = t.book(0, '2026-10-14', '2026-10-17')
    t.svc.reservations.checkIn(reception, b.stays[0]!.id)
    t.svc.fees.addLateCheckout(reception, { stayId: b.stays[0]!.id, time: '13:00', amountMinor: 50_000 })
    t.svc.ledger.closeDay(owner, '2026-10-15')
    return { ...t, b }
  }
  it('kapalı günde sahip gerekçeyle geç çıkış, depozito ve iptal yazabilir; gerekçesiz reddedilir', async () => {
    const { svc, b, cash } = await closedDay()
    const stayId = b.stays[0]!.id
    expect(() => svc.fees.addLateCheckout(owner, { stayId, time: '14:00', amountMinor: 1000 })).toThrow(
      /dayClosed/
    )
    svc.fees.addLateCheckout(owner, { stayId, time: '14:00', amountMinor: 1000, dayClosedReason: 'duzeltme' })
    svc.fees.takeDeposit(owner, {
      reservationId: b.reservation.id,
      amountMinor: 10_000,
      methodId: cash,
      dayClosedReason: 'duzeltme'
    })
    const line = svc.fees.folioLines(owner, b.reservation.id).charges.find((c) => c.code === 'late_checkout')!
    expect(() => svc.fees.voidFee(reception, { chargeId: line.id, reason: 'yanlis girildi' })).toThrow()
    svc.fees.voidFee(owner, { chargeId: line.id, reason: 'yanlis girildi' })
    expect(svc.fees.folioLines(owner, b.reservation.id).charges.find((c) => c.id === line.id)!.voided).toBe(
      true
    )
  })
})

describe('depozito gelire çevirmeyi geri alma', () => {
  it('kalem ve ödeme birlikte iptal olur, depozito yeniden elde tutulur; çevrilmemiş depozito reddedilir', async () => {
    const { svc, book, cash } = await setup()
    const b = book(0, '2026-10-15', '2026-10-17')
    svc.fees.takeDeposit(reception, { reservationId: b.reservation.id, amountMinor: 30_000, methodId: cash })
    const id = svc.fees.folioLines(owner, b.reservation.id).deposits![0]!.id
    expect(() => svc.fees.settleDeposit(owner, { id, action: 'undoConvert', reason: 'yanlis' })).toThrow(
      /depositNotConverted/
    )
    const before = svc.reservations.view(owner, b.reservation.id).folio
    svc.fees.settleDeposit(owner, { id, action: 'convert', reason: 'kirik lamba' })
    svc.fees.settleDeposit(owner, { id, action: 'undoConvert', reason: 'yanlis cevrildi' })
    const v = svc.reservations.view(owner, b.reservation.id)
    expect(v.folio.chargesMinor).toBe(before.chargesMinor)
    expect(v.folio.balanceMinor).toBe(before.balanceMinor)
    expect(handle.db.select().from(damageDeposits).get()).toMatchObject({
      status: 'held',
      convertedChargeId: null
    })
    // It can be settled again afterwards.
    svc.fees.settleDeposit(owner, { id, action: 'refund' })
    expect(handle.db.select().from(damageDeposits).get()!.status).toBe('refunded')
  })
  it('eşleşen ödeme bulunamazsa geri alma hiçbir şeyi iptal etmeden hata verir', async () => {
    const { svc, book, cash } = await setup()
    const b = book(0, '2026-10-15', '2026-10-17')
    svc.fees.takeDeposit(reception, { reservationId: b.reservation.id, amountMinor: 30_000, methodId: cash })
    const id = svc.fees.folioLines(owner, b.reservation.id).deposits![0]!.id
    svc.fees.settleDeposit(owner, { id, action: 'convert', reason: 'kirik' })
    handle.db.update(payments).set({ amountMinor: 1 }).where(eq(payments.kind, 'payment')).run()
    expect(() => svc.fees.settleDeposit(owner, { id, action: 'undoConvert', reason: 'yanlis' })).toThrow(
      /not.?found/i
    )
    expect(handle.db.select().from(damageDeposits).get()!.status).toBe('converted')
  })
  it('geri alma ödeme iptal yetkisi ister', async () => {
    const { svc, book, cash } = await setup()
    const b = book(0, '2026-10-15', '2026-10-17')
    svc.fees.takeDeposit(reception, { reservationId: b.reservation.id, amountMinor: 30_000, methodId: cash })
    const id = svc.fees.folioLines(owner, b.reservation.id).deposits![0]!.id
    svc.fees.settleDeposit(owner, { id, action: 'convert', reason: 'kirik' })
    expect(() => svc.fees.settleDeposit(reception, { id, action: 'undoConvert', reason: 'yanlis' })).toThrow()
  })
})

describe('defter: iptal edilmiş rezervasyon', () => {
  it('seçicide bulunur ve eski oda numarası görünür', async () => {
    const { svc, book, cash } = await setup()
    const b = book(0, '2026-10-15', '2026-10-17', 'Kaya')
    svc.payments.create(manager, {
      reservationId: b.reservation.id,
      date: '2026-10-15',
      kind: 'payment',
      methodId: cash,
      amountMinor: 100_000,
      currency: 'TRY'
    })
    svc.reservations.cancel(reception, b.reservation.id, 'vazgecti', {
      mode: 'keep',
      note: 'iptal bedeli'
    } as never)
    const hits = svc.ledger.searchReservations(owner, 'Kaya', '2026-10-15')
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({ status: 'cancelled', roomNumbers: ['501'] })
  })
})

describe('gün kapatma ve gider tarihi sınırları', () => {
  it('gelecekteki gün kapatılamaz, bugün kapatılabilir', async () => {
    const { svc } = await setup()
    svc.settings.set(owner, { 'businessDay.closingEnabled': true })
    expect(() => svc.ledger.closeDay(owner, '2027-01-01')).toThrow(/dayInFuture/)
    expect(svc.ledger.closeDay(owner, '2026-10-15').status).toBe('closed')
  })
  it('gider tarihi bir yıldan fazla ileri olamaz; yazım hatası 2099 reddedilir', async () => {
    const { svc, general } = await setup()
    const input = (date: string) => ({
      date,
      sectionId: general,
      amountMinor: 1000,
      currency: 'TRY',
      description: 'x',
      paidFromDrawer: false
    })
    expect(() => svc.expenses.createExpense(manager, input('2099-01-01'))).toThrow(/dateTooFar/)
    expect(svc.expenses.createExpense(manager, input('2026-12-01')).date).toBe('2026-12-01')
  })
})

describe('ödeme tarihi sınırı (G4)', () => {
  it('ödeme tarihi bir yıldan fazla ileri olamaz; makul gelecek tarih kabul edilir', async () => {
    const { svc, book, cash } = await setup()
    const b = book(0, '2026-10-15', '2026-10-17', 'Kaya')
    const pay = (date: string) =>
      svc.payments.create(manager, {
        reservationId: b.reservation.id,
        date,
        kind: 'payment',
        methodId: cash,
        amountMinor: 10_000,
        currency: 'TRY'
      })
    expect(() => pay('2099-03-15')).toThrow(/dateTooFar/)
    expect(pay('2026-12-01').date).toBe('2026-12-01')
  })
})

describe('rapor: konaklama türü süzgeci', () => {
  it('saatlik süzgeçte ortalama kalış süresi boş; gecelikte dolu; dışa aktarma süzgeci kabul eder', async () => {
    const { svc, book } = await setup()
    book(0, '2026-10-10', '2026-10-13')
    const p = { from: '2026-10-01', to: '2026-11-01' }
    expect(svc.reports.summary(owner, p).occupancy.alosHundredths).toBe(300)
    expect(svc.reports.summary(owner, { ...p, stayKind: 'hourly' }).occupancy.alosHundredths).toBe(0)
    expect(svc.reports.summary(owner, { ...p, stayKind: 'overnight' }).occupancy.alosHundredths).toBe(300)
  })
  it('dışa aktarma stayKind alanını kabul eder', async () => {
    const { svc } = await setup()
    const file = await svc.reports.export(owner, {
      report: 'occupancy',
      format: 'xlsx',
      locale: 'tr',
      from: '2026-10-01',
      to: '2026-11-01',
      stayKind: 'hourly'
    })
    expect(file.rows).toBeGreaterThanOrEqual(0)
  })
})

describe('turizm: aynı gün saatlik satış ve gecelik konaklama', () => {
  it('KBS aktif satırı gecelik konaklamanın planlı çıkışını kullanır', async () => {
    const { svc, rooms, direct, book, clock } = await setup('2026-09-01T09:00:00.000Z')
    book(0, '2026-09-10', '2026-09-14')
    svc.reservations.create(owner, {
      guest: { firstName: 'Saatlik', lastName: 'Misafir' },
      channelId: direct,
      stays: [
        {
          roomId: rooms[0]!.id,
          checkIn: '2026-09-10',
          checkOut: '2026-09-10',
          startTime: '09:00',
          endTime: '12:00',
          nightlyPriceMinor: 50_000
        }
      ]
    })
    clock.set('2026-09-20T09:00:00.000Z')
    const bytes = new Uint8Array(
      await kbsWorkbookBuffer([
        {
          arrival: localDate('2026-09-10'),
          departure: null,
          room: '501',
          nationalityRaw: 'GERMANY',
          status: 'Aktif'
        }
      ])
    )
    const t = await svc.tourism.importKbs(owner, {
      fileName: 'EGM_Konaklayan_Listesi_01092026_30092026.xlsx',
      bytes
    })
    expect(svc.tourism.table(owner, t.import.id).totals.nights).toBe(4)
  })
})
