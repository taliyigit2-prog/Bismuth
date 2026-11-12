import { afterEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { depsOf, roleCtx, testClock } from '../../../tests/factories/ctx'
import { seededDatabase } from '../../../tests/factories/db'
import type { DatabaseHandle } from '../db/client'
import { expenseSections, paymentMethods, roomTypes, salesChannels } from '../db/schema'
import { createAuditService } from './audit-service'
import { createExpensesService } from './expenses-service'
import { createLedgerService } from './ledger-service'
import { createPaymentsService } from './payments-service'
import { createReservationsService } from './reservations-service'
import { createRoomsService } from './rooms-service'
import { createSettingsService } from './settings-service'

const owner = roleCtx('owner')
const reception = roleCtx('reception')
const accountant = roleCtx('accountant')
let handle: DatabaseHandle
afterEach(() => handle?.close())

async function setup() {
  handle = await seededDatabase()
  const clock = testClock('2026-10-01T09:00:00.000Z')
  const deps = depsOf(handle, clock)
  const ledger = createLedgerService(deps)
  const exp = createExpensesService(deps)
  const pay = createPaymentsService(deps)
  const res = createReservationsService(deps)
  const roomsSvc = createRoomsService(deps)
  const settings = createSettingsService(handle.db, clock)
  const code = <T extends typeof paymentMethods | typeof salesChannels | typeof expenseSections>(
    table: T,
    c: string
  ) => handle.db.select().from(table).where(eq(table.code, c)).get()!.id
  const standard = handle.db.select().from(roomTypes).where(eq(roomTypes.code, 'standard')).get()!
  const room = roomsSvc.createRoom(owner, {
    number: '501',
    roomTypeId: standard.id,
    beds: 2,
    validFrom: '2026-01-01'
  })
  const booking = res.create(owner, {
    guest: { firstName: 'Örnek', lastName: 'Misafir' },
    channelId: code(salesChannels, 'direct'),
    stays: [{ roomId: room.id, checkIn: '2026-10-01', checkOut: '2026-10-11', nightlyPriceMinor: 500_000 }]
  })
  const payment = (
    amountMinor: number,
    method: 'cash' | 'card' | 'bank',
    date = '2026-10-01',
    extra: { channel?: string; currency?: string; kind?: 'payment' | 'refund' } = {}
  ) =>
    pay.create(owner, {
      reservationId: booking.reservation.id,
      date,
      methodId: code(paymentMethods, method),
      amountMinor,
      currency: extra.currency ?? 'TRY',
      kind: extra.kind ?? 'payment',
      ...(extra.channel ? { channelId: code(salesChannels, extra.channel) } : {})
    })
  const general = code(expenseSections, 'general')
  const ownerSection = code(expenseSections, 'owner')
  return { clock, ledger, exp, pay, settings, payment, general, ownerSection, code, deps }
}

describe('gün defteri ve yönetici giderleri (G-62, G-67; kabul ölçütü)', () => {
  it('Resepsiyon bağlamıyla getDay yönetici giderini ve toplamını içermez; görünüm kısmi işaretlenir', async () => {
    const { ledger, exp, payment, general, ownerSection } = await setup()
    payment(300_000, 'cash')
    exp.createExpense(owner, {
      date: '2026-10-01',
      sectionId: general,
      amountMinor: 50_000,
      currency: 'TRY',
      description: 'Deterjan',
      paidFromDrawer: true
    })
    exp.createExpense(owner, {
      date: '2026-10-01',
      sectionId: ownerSection,
      amountMinor: 1_000_000,
      currency: 'TRY',
      description: 'Kira'
    })

    const ownersDay = ledger.getDay(owner, '2026-10-01')
    expect(ownersDay.expenses.map((e) => e.description)).toEqual(['Deterjan', 'Kira'])
    expect(ownersDay.totals).toMatchObject({
      revenueBaseMinor: 300_000,
      expensesBaseMinor: 1_050_000,
      netBaseMinor: -750_000
    })
    expect(ownersDay.partial).toBe(false)

    const receptionDay = ledger.getDay(reception, '2026-10-01')
    expect(receptionDay.expenses.map((e) => e.description)).toEqual(['Deterjan'])
    expect(receptionDay.totals).toMatchObject({ expensesBaseMinor: 50_000, netBaseMinor: 250_000 })
    expect(receptionDay.partial).toBe(true)
    expect(JSON.stringify(receptionDay)).not.toContain('Kira')
    expect(exp.listSections(reception).map((s) => s.code)).toEqual(['general'])
    expect(
      exp.listExpenses(reception, { from: '2026-10-01', to: '2026-10-31' }).map((e) => e.description)
    ).toEqual(['Deterjan'])
    expect(() =>
      exp.createExpense(reception, {
        date: '2026-10-01',
        sectionId: ownerSection,
        amountMinor: 1,
        currency: 'TRY',
        description: 'x'
      })
    ).toThrow(/PERMISSION_DENIED/)
  })

  it('gün satırları nakit → havale → kart sırasında, kendi içinde giriş saatine göre', async () => {
    const { ledger, payment, clock } = await setup()
    payment(100_000, 'card')
    clock.advance(5)
    payment(200_000, 'cash')
    clock.advance(5)
    payment(300_000, 'bank')
    clock.advance(5)
    payment(400_000, 'cash')
    const day = ledger.getDay(owner, '2026-10-01')
    expect(day.income.map((r) => `${r.methodCode} ${r.amountMinor}`)).toEqual([
      'cash 200000',
      'cash 400000',
      'bank 300000',
      'card 100000'
    ])
    expect(day.income[0]).toMatchObject({ guestName: 'Örnek Misafir', roomNumbers: ['501'] })
  })

  it('Ekim cirosu: KK 26.300 + İban 1.000 (Airbnb) + teslim alınmış nakit 10.000 = 37.300', async () => {
    const { ledger, pay, payment } = await setup()
    payment(1_630_000, 'card', '2026-10-02')
    payment(1_000_000, 'card', '2026-10-15')
    payment(100_000, 'bank', '2026-10-20', { channel: 'airbnb' })
    const cash = payment(1_000_000, 'cash', '2026-10-21')
    payment(999_999, 'cash', '2026-11-01') // next month
    pay.handover(owner, { paymentIds: [cash.id] })
    const october = ledger.monthSummary(owner, 2026, 10)
    expect(october.revenueBaseMinor).toBe(3_730_000)
    expect(october.revenueByMethodGroup).toEqual({ card: 2_630_000, bank: 100_000, cash: 1_000_000 })
    expect(october.revenueByChannel).toEqual({ direct: 3_630_000, airbnb: 100_000 })
    expect(october.profitBaseMinor).toBe(3_730_000)
    expect(october).toMatchObject({ from: '2026-10-01', to: '2026-11-01', partial: false })
    // The accountant does not see the owner's expense section by default (K-38): same revenue, partial view.
    expect(ledger.monthSummary(accountant, 2026, 10)).toMatchObject({
      revenueBaseMinor: 3_730_000,
      partial: true
    })
  })

  it('ay özeti iadeyi düşer, yalnız görünen giderleri sayar ve en çok harcamaları verir', async () => {
    const { ledger, exp, payment, general, ownerSection } = await setup()
    payment(500_000, 'cash', '2026-12-05')
    payment(100_000, 'cash', '2026-12-06', { kind: 'refund' })
    for (const [d, amount, text] of [
      ['2026-12-01', 20_000, 'Deterjan'],
      ['2026-12-09', 30_000, 'deterjan '],
      ['2026-12-10', 10_000, 'Su']
    ] as const)
      exp.createExpense(owner, {
        date: d,
        sectionId: general,
        amountMinor: amount,
        currency: 'TRY',
        description: text
      })
    exp.createExpense(owner, {
      date: '2026-12-31',
      sectionId: ownerSection,
      amountMinor: 70_000,
      currency: 'TRY',
      description: 'Kira'
    })
    const forOwner = ledger.monthSummary(owner, 2026, 12)
    expect(forOwner).toMatchObject({
      revenueBaseMinor: 400_000,
      expensesBaseMinor: 130_000,
      profitBaseMinor: 270_000,
      revenueByCurrency: { TRY: 400_000 },
      partial: false
    })
    expect(forOwner.topExpenses[0]).toMatchObject({ kind: 'description', label: 'Kira', totalMinor: 70_000 })
    for (const ctx of [accountant, roleCtx('manager')]) {
      const partial = ledger.monthSummary(ctx, 2026, 12)
      expect(partial).toMatchObject({ expensesBaseMinor: 60_000, profitBaseMinor: 340_000, partial: true })
      expect(partial.topExpenses[0]).toMatchObject({ key: 'deterjan', totalMinor: 50_000 })
    }
    expect(() => ledger.monthSummary(reception, 2026, 12)).toThrow(/PERMISSION_DENIED/)
  })
})

describe('kasa paneli ve gün kapatma (G-64, G-72)', () => {
  it('kasa paneli teslim alınmamış tutarları ve kasadan ödenen gideri gösterir', async () => {
    const { ledger, exp, pay, payment, general } = await setup()
    const a = payment(300_000, 'cash')
    payment(200_000, 'card')
    exp.createExpense(owner, {
      date: '2026-10-01',
      sectionId: general,
      amountMinor: 50_000,
      currency: 'TRY',
      description: 'Ekmek',
      paidFromDrawer: true
    })
    expect(ledger.cashPanel(reception)).toMatchObject({
      pending: { TRY: { cash: 300_000, card: 200_000 } },
      drawer: { TRY: 250_000 },
      partial: true
    })
    pay.handover(owner, { paymentIds: [a.id] })
    expect(ledger.cashPanel(owner).pending).toEqual({ TRY: { card: 200_000 } })
    expect(() => ledger.cashPanel(roleCtx('housekeeping'))).toThrow(/PERMISSION_DENIED/)
  })

  it('gün kapatma ayarı kapalıyken reddedilir; açılınca kapalı güne yazmak yetki ve gerekçe ister', async () => {
    const { ledger, exp, settings, general } = await setup()
    expect(() => ledger.closeDay(owner, '2026-10-01')).toThrow(/errors.dayClosingDisabled/)
    settings.set(owner, { 'businessDay.closingEnabled': true })
    const closed = ledger.closeDay(accountant, '2026-10-01')
    expect(closed).toMatchObject({ status: 'closed', closedBy: 'user-accountant' })
    expect(() => ledger.closeDay(owner, '2026-10-01')).toThrow(/errors.dayAlreadyClosed/)
    const input = {
      date: '2026-10-01',
      sectionId: general,
      amountMinor: 1_000,
      currency: 'TRY',
      description: 'Geç gelen fiş'
    }
    expect(() => exp.createExpense(reception, input)).toThrow(/errors.dayClosed/)
    expect(() => exp.createExpense(owner, input)).toThrow(/errors.dayClosed/) // no reason
    expect(exp.createExpense(owner, { ...input, reason: 'fiş sonradan geldi' }).amountMinor).toBe(1_000)
    expect(() => ledger.setDayNote(reception, '2026-10-01', 'not')).toThrow(/PERMISSION_DENIED/)
    expect(ledger.setDayNote(owner, '2026-10-01', 'Kasa sayıldı', 'düzeltme').note).toBe('Kasa sayıldı')
    expect(() => ledger.reopenDay(reception, '2026-10-01', 'yanlış')).toThrow(/PERMISSION_DENIED/)
    expect(ledger.reopenDay(owner, '2026-10-01', 'fiş eksikti').status).toBe('open')
    expect(() => ledger.reopenDay(owner, '2026-10-01', 'yine')).toThrow(/errors.dayNotClosed/)
    expect(exp.createExpense(reception, input).amountMinor).toBe(1_000)
    expect(ledger.getDay(owner, '2026-10-01')).toMatchObject({ status: 'open', note: 'Kasa sayıldı' })
  })

  it('iptal edilen ödeme denetim kaydında önce/sonra ve gerekçeyle görünür; Resepsiyon kaydı okuyamaz (faz-04 kabul)', async () => {
    const { pay, payment, deps, clock } = await setup()
    const p = payment(100_000, 'cash')
    clock.advance(5)
    pay.void(owner, p.id, 'yanlış kayıt')
    const audit = createAuditService(deps)
    const [entry] = audit.list(owner, { entity: 'payment', action: 'void' }).entries
    expect(entry).toMatchObject({ entityId: p.id, action: 'void', reason: 'yanlış kayıt' })
    expect(entry!.before).toMatchObject({ amountMinor: 100_000, voidedAt: null })
    expect(entry!.after).toMatchObject({ amountMinor: 100_000, voidedAt: '2026-10-01T09:05:00.000Z' })
    expect(() => audit.list(reception, { entity: 'payment' })).toThrow(/PERMISSION_DENIED/)
  })

  it('iptal edilen kayıtlar yalnız istenince gün görünümüne gelir', async () => {
    const { ledger, exp, pay, payment, general } = await setup()
    const p = payment(100_000, 'cash')
    pay.void(owner, p.id, 'yanlış kayıt')
    const e = exp.createExpense(owner, {
      date: '2026-10-01',
      sectionId: general,
      amountMinor: 10_000,
      currency: 'TRY',
      description: 'Çay'
    })
    exp.voidExpense(owner, e.id, 'mükerrer')
    expect(ledger.getDay(owner, '2026-10-01')).toMatchObject({ income: [], expenses: [] })
    const all = ledger.getDay(owner, '2026-10-01', { includeVoided: true })
    expect(all.income.map((r) => r.voided)).toEqual([true])
    expect(all.expenses.map((r) => r.voided)).toEqual([true])
    expect(all.totals.revenueBaseMinor).toBe(0)
  })
})
