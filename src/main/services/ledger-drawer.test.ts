// Faz 7 (P7): the drawer panel and the owner's "x" with its history and undo, totals per currency, the hidden
// section kept out of every list and total, rates frozen at the minute (or typed), staff and laundry rows locked,
// expenses with product lines (tedarik = gider), the description dictionary and the month view. All services wired
// as in the program (createServices); names and amounts are invented.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { roleCtx, testClock } from '../../../tests/factories/ctx'
import { seededDatabase } from '../../../tests/factories/db'
import type { DatabaseHandle } from '../db/client'
import {
  auditLog,
  expenses,
  expenseSections,
  laundryItemTypes,
  paymentMethods,
  productCategories,
  roles,
  roomTypes,
  salesChannels
} from '../db/schema'
import { ctxFromPermissions } from './context'
import { createServices } from '.'
import { defaultPermissions } from '@shared/permissions'

const owner = roleCtx('owner')
const manager = roleCtx('manager')
const reception = roleCtx('reception')
const accountant = roleCtx('accountant')

let handle: DatabaseHandle
let dir: string
afterEach(() => {
  handle?.close()
  if (dir) rmSync(dir, { recursive: true, force: true })
})

async function setup() {
  handle = await seededDatabase()
  dir = mkdtempSync(join(tmpdir(), 'bismuth-ledger-'))
  const clock = testClock('2026-10-04T09:00:00.000Z')
  const svc = createServices(
    handle,
    { name: 'Bismuth', version: 'test', packaged: false, dataDir: dir, electron: null, chrome: null },
    { clock, attachmentsDir: join(dir, 'attachments') }
  )
  const code = <T extends typeof paymentMethods | typeof salesChannels | typeof expenseSections>(
    table: T,
    c: string
  ) => handle.db.select().from(table).where(eq(table.code, c)).get()!.id
  const standard = handle.db.select().from(roomTypes).where(eq(roomTypes.code, 'standard')).get()!
  const room = svc.rooms.createRoom(owner, {
    number: '301',
    roomTypeId: standard.id,
    beds: 2,
    validFrom: '2026-01-01'
  })
  const booking = svc.reservations.create(owner, {
    guest: { firstName: 'Deniz', lastName: 'Yıldırım' },
    channelId: code(salesChannels, 'booking'),
    stays: [{ roomId: room.id, checkIn: '2026-10-03', checkOut: '2026-10-06', nightlyPriceMinor: 250_000 }]
  })
  const pay = (
    amountMinor: number,
    method: 'cash' | 'card' | 'bank',
    extra: { date?: string; currency?: string; kind?: 'payment' | 'refund' } = {}
  ) =>
    svc.payments.create(extra.kind === 'refund' ? owner : reception, {
      reservationId: booking.reservation.id,
      date: extra.date ?? '2026-10-04',
      methodId: code(paymentMethods, method),
      amountMinor,
      currency: extra.currency ?? 'TRY',
      kind: extra.kind ?? 'payment'
    })
  const general = code(expenseSections, 'general')
  const ownerSection = code(expenseSections, 'owner')
  const spend = (
    amountMinor: number,
    description: string,
    extra: { section?: string; drawer?: boolean; currency?: string; date?: string } = {}
  ) =>
    svc.expenses.createExpense(extra.section === ownerSection ? owner : reception, {
      date: extra.date ?? '2026-10-04',
      sectionId: extra.section ?? general,
      amountMinor,
      currency: extra.currency ?? 'TRY',
      description,
      paidFromDrawer: extra.drawer ?? true
    })
  return { clock, svc, code, room, booking, pay, spend, general, ownerSection }
}

describe('kasa paneli ve teslim alma (G-64, S-30, S-31; kabul ölçütü)', () => {
  it('gün girişi → panel "kasada olmalı"yı verir; teslim al → sıfır; geçmişte görünür; geri alınca geri gelir', async () => {
    const { svc, pay, spend, clock } = await setup()
    pay(300_000, 'cash')
    pay(500_000, 'card')
    pay(100_000, 'bank')
    spend(40_000, 'Market')
    spend(10_000, 'Banka masrafı', { drawer: false })

    const before = svc.ledger.drawerPanel(manager)
    expect(before.drawer).toEqual({ TRY: 260_000 })
    expect(before.pending).toEqual({ TRY: { cash: 300_000, card: 500_000, bank: 100_000 } })
    expect(before).toMatchObject({ uncollectedCount: 3, unsettledExpenseCount: 1, oldestDate: '2026-10-04' })
    expect(before.channels).toEqual({ booking: { TRY: 900_000 } })
    expect(svc.ledger.drawerSummary(reception)).toMatchObject({
      drawer: { TRY: 260_000 },
      pending: { TRY: 900_000 },
      uncollectedCount: 3,
      lastHandover: null
    })

    clock.advance(30)
    const done = svc.payments.handover(manager, { upToDate: '2026-10-04' })
    expect(done).toMatchObject({ payments: 3, expenses: 1 })
    const after = svc.ledger.drawerPanel(manager)
    expect(after.drawer).toEqual({})
    expect(after.pending).toEqual({})
    expect(after).toMatchObject({ uncollectedCount: 0, unsettledExpenseCount: 0, oldestDate: null })
    // The month's channel totals count collected payments too.
    expect(after.channels).toEqual({ booking: { TRY: 900_000 } })
    expect(after.lastHandover).toMatchObject({
      id: done.id,
      paymentCount: 3,
      expenseCount: 1,
      drawer: { TRY: 260_000 },
      revertedAt: null
    })
    // Card and IBAN rows carry the same "x" (S-31).
    const day = svc.ledger.getDay(owner, '2026-10-04')
    expect(day.income.every((r) => r.collected && r.handoverId === done.id)).toBe(true)
    expect(day.expenses.find((e) => e.description === 'Market')?.settled).toBe(true)

    svc.payments.revertHandover(owner, done.id, 'yanlış sayıldı')
    expect(svc.ledger.drawerPanel(manager).drawer).toEqual({ TRY: 260_000 })
    const history = svc.ledger.handovers(manager, 10)
    expect(history).toHaveLength(1)
    expect(history[0]).toMatchObject({ id: done.id, revertReason: 'yanlış sayıldı' })
    expect(history[0]?.revertedAt).not.toBeNull()
    expect(svc.ledger.drawerSummary(manager).lastHandover).toBeNull()
  })

  it('yalnız nakit teslim alınınca kart ve IBAN bekler; seçili satırlar ayrı ayrı alınabilir', async () => {
    const { svc, pay } = await setup()
    pay(300_000, 'cash')
    const card = pay(500_000, 'card')
    pay(100_000, 'bank')
    svc.payments.handover(owner, { upToDate: '2026-10-04', onlyCash: true })
    expect(svc.ledger.drawerPanel(owner).pending).toEqual({ TRY: { card: 500_000, bank: 100_000 } })
    svc.payments.handover(owner, { paymentIds: [card.id] })
    expect(svc.ledger.drawerPanel(owner).pending).toEqual({ TRY: { bank: 100_000 } })
    expect(svc.ledger.handovers(owner)).toHaveLength(2)
  })

  it('teslim alma yalnız Sahip ve Müdürde; Resepsiyon paneli görür ama "x" koyamaz ve geri alamaz', async () => {
    const { svc, pay } = await setup()
    pay(300_000, 'cash')
    expect(() => svc.ledger.drawerPanel(reception)).not.toThrow()
    expect(() => svc.payments.handover(reception, { upToDate: '2026-10-04' })).toThrow(/PERMISSION_DENIED/)
    expect(() => svc.payments.handover(accountant, { upToDate: '2026-10-04' })).toThrow(/PERMISSION_DENIED/)
    const done = svc.payments.handover(manager, { upToDate: '2026-10-04' })
    expect(() => svc.payments.revertHandover(reception, done.id, 'neden')).toThrow(/PERMISSION_DENIED/)
    expect(() => svc.ledger.drawerPanel(roleCtx('housekeeping'))).toThrow(/PERMISSION_DENIED/)
  })
})

describe('toplamlar ve görünürlük (G-62, G-67; kabul ölçütü)', () => {
  it('gün toplamları para birimi bazında; iade eksi, iptal edilen sayılmaz', async () => {
    const { svc, pay, spend } = await setup()
    svc.currency.recordRate(owner, { base: 'EUR', quote: 'TRY', midRateMicro: 50_000_000, source: 'hotel' })
    pay(300_000, 'cash')
    pay(10_000, 'cash', { currency: 'EUR' })
    pay(50_000, 'card', { kind: 'refund' })
    const voided = pay(999_900, 'cash')
    svc.payments.void(owner, voided.id, 'yanlış tutar')
    spend(40_000, 'Market')
    spend(2_000, 'Çiçek', { currency: 'EUR' })
    const day = svc.ledger.getDay(reception, '2026-10-04')
    expect(day.totals.byCurrency).toEqual([
      { currency: 'EUR', incomeMinor: 10_000, expensesMinor: 2_000 },
      { currency: 'TRY', incomeMinor: 250_000, expensesMinor: 40_000 }
    ])
    expect(day.totals).toMatchObject({
      revenueBaseMinor: 250_000 + 500_000,
      expensesBaseMinor: 40_000 + 100_000,
      netBaseMinor: 610_000
    })
    expect(svc.ledger.drawerPanel(owner).drawer).toEqual({ TRY: 260_000, EUR: 8_000 })
  })

  it('Resepsiyon yönetici giderini ne günde, ne ayda, ne panelde, ne teslim geçmişinin kasa tutarında görür', async () => {
    const { svc, pay, spend, ownerSection } = await setup()
    pay(300_000, 'cash')
    spend(40_000, 'Market')
    // K-42 (1): the owner's section is no longer paid from the drawer; a row written before that (old data)
    // must still stay out of every figure the reception sees.
    const old = spend(100_000, 'Sahip kişisel', { section: ownerSection, drawer: false })
    handle.db.update(expenses).set({ paidFromDrawer: true }).where(eq(expenses.id, old.id)).run()
    const forOwner = svc.ledger.drawerPanel(owner)
    expect(forOwner).toMatchObject({ drawer: { TRY: 160_000 }, partial: false })
    const forReception = svc.ledger.drawerPanel(reception)
    expect(forReception).toMatchObject({ drawer: { TRY: 260_000 }, partial: true, unsettledExpenseCount: 1 })

    const day = svc.ledger.getDay(reception, '2026-10-04')
    expect(day.partial).toBe(true)
    expect(day.totals.expensesBaseMinor).toBe(40_000)
    const month = svc.ledger.month(reception, 2026, 10)
    expect(month.partial).toBe(true)
    expect(month.expenses.map((e) => e.description)).toEqual(['Market'])
    expect(JSON.stringify([day, month, forReception])).not.toContain('Sahip kişisel')
    expect(svc.ledger.options(reception).sections.map((s) => s.code)).toEqual(['general'])
    expect(svc.expenses.descriptionGroups(reception).map((g) => g.description)).toEqual(['Market'])

    svc.payments.handover(owner, { upToDate: '2026-10-04' })
    expect(svc.ledger.handovers(owner)[0]?.drawer).toEqual({ TRY: 160_000 })
    // A partial view recomputes the batch from the rows it may see: never a figure that reveals the hidden one.
    expect(svc.ledger.handovers(reception)[0]).toMatchObject({ drawer: { TRY: 260_000 }, expenseCount: 1 })
    expect(() => svc.ledger.expenseRow(reception, day.expenses[0]!.id)).not.toThrow()
    const hidden = svc.ledger.month(owner, 2026, 10).expenses.find((e) => e.description === 'Sahip kişisel')!
    expect(() => svc.ledger.expenseRow(reception, hidden.id)).toThrow(/PERMISSION_DENIED/)
  })
})

describe('döviz çevirimi (S-32, G-70; kabul ölçütü)', () => {
  it('kur yazıldığı dakikada donar; kur yoksa elle kur girilebilir ve "manual" diye işaretlenir', async () => {
    const { svc, general } = await setup()
    const noRate = svc.expenses.createExpense(reception, {
      date: '2026-10-04',
      sectionId: general,
      amountMinor: 1_000,
      currency: 'GBP',
      description: 'Kitap',
      manualRateMicro: 42_500_000
    })
    expect(noRate).toMatchObject({ amountBaseMinor: 42_500, fxRateToBase: 42_500_000, fxSource: 'manual' })
    // A known rate wins over the typed one.
    svc.currency.recordRate(owner, { base: 'GBP', quote: 'TRY', midRateMicro: 44_000_000, source: 'hotel' })
    const known = svc.expenses.createExpense(reception, {
      date: '2026-10-04',
      sectionId: general,
      amountMinor: 1_000,
      currency: 'GBP',
      description: 'Kitap',
      manualRateMicro: 1_000_000
    })
    expect(known).toMatchObject({ amountBaseMinor: 44_000, fxSource: 'hotel' })
    const row = svc.ledger.getDay(owner, '2026-10-04').expenses.find((e) => e.id === noRate.id)
    expect(row).toMatchObject({ fxSource: 'manual', amountBaseMinor: 42_500 })
  })

  it('ödemenin TL karşılığı kayıt dakikasının kuruyla; tutar değişmeden düzenleme kuru korur', async () => {
    const { svc, pay, clock } = await setup()
    svc.currency.recordRate(owner, { base: 'EUR', quote: 'TRY', midRateMicro: 50_000_000, source: 'hotel' })
    clock.advance(1)
    const p = pay(10_000, 'cash', { currency: 'EUR' })
    clock.advance(60)
    svc.currency.recordRate(owner, { base: 'EUR', quote: 'TRY', midRateMicro: 51_000_000, source: 'hotel' })
    svc.payments.update(owner, p.id, { note: 'kapıda' })
    expect(svc.ledger.getDay(owner, '2026-10-04').income[0]).toMatchObject({
      amountBaseMinor: 500_000,
      fxRateToBase: 50_000_000,
      note: 'kapıda'
    })
    svc.payments.update(owner, p.id, { amountMinor: 20_000 })
    expect(svc.ledger.getDay(owner, '2026-10-04').income[0]?.amountBaseMinor).toBe(1_020_000)
  })
})

describe('tek giriş: personel, çamaşırhane, tedarik ve rezervasyon ödemesi (G-60, G-69, G-71)', () => {
  it('maaş ve avans defterde türüyle görünür ve defterden değiştirilemez (kind=staff kilitli)', async () => {
    const { svc } = await setup()
    const e = svc.staff.createEmployee(owner, {
      firstName: 'Selin',
      lastName: 'Kaya',
      position: 'Resepsiyon',
      startDate: '2026-01-01',
      salary: { monthlyMinor: 3_000_000, currency: 'TRY', validFrom: '2026-01-01' }
    })
    svc.staff.addTransaction(owner, {
      employeeId: e.id,
      date: '2026-10-04',
      kind: 'advance',
      amountMinor: 200_000
    })
    const row = svc.ledger.getDay(owner, '2026-10-04').expenses[0]!
    expect(row).toMatchObject({ kind: 'staff', staffKind: 'advance', employeeName: 'Selin Kaya' })
    expect(() => svc.expenses.updateExpense(owner, row.id, { amountMinor: 1 })).toThrow(
      /expenseManagedElsewhere/
    )
    expect(() => svc.expenses.voidExpense(owner, row.id, 'deneme')).toThrow(/expenseManagedElsewhere/)
    expect(svc.ledger.month(owner, 2026, 10).employees).toEqual([{ id: e.id, name: 'Selin Kaya' }])
  })

  it('çamaşırhane "ödendi" tek gider satırıdır, mutabakata bağlıdır ve kilitlidir', async () => {
    const { svc } = await setup()
    const laundry = svc.contacts.create(owner, { name: 'Örnek Çamaşırhane', category: 'laundry' })
    const sheet = handle.db.select().from(laundryItemTypes).get()!.id
    svc.laundry.setPrice(owner, {
      contactId: laundry.id,
      itemTypeId: sheet,
      validFrom: '2026-09-01',
      unitPriceMinor: 1_000
    })
    svc.laundry.recordDelivery(reception, {
      date: '2026-09-10',
      direction: 'out',
      contactId: laundry.id,
      items: [{ itemTypeId: sheet, qty: 10 }]
    })
    const settled = svc.laundry.settle(owner, {
      contactId: laundry.id,
      year: 2026,
      month: 9,
      invoicedTotalMinor: 10_000
    })
    const rows = svc.ledger.month(owner, 2026, 9).expenses
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ kind: 'laundry', laundrySettlementId: settled.settled!.id })
    expect(() => svc.expenses.updateExpense(owner, rows[0]!.id, { description: 'x' })).toThrow(
      /expenseManagedElsewhere/
    )
  })

  it('defterden ürün satırlı gider = tedarik alımı: fiyat geçmişinde aynı kayıt görünür', async () => {
    const { svc, general } = await setup()
    const categoryId = handle.db.select().from(productCategories).get()!.id
    const water = svc.supply.createProduct(owner, { name: 'Damacana su', categoryId, unit: 'piece' })
    const written = svc.expenses.createExpense(reception, {
      date: '2026-10-04',
      sectionId: general,
      amountMinor: 30_000,
      currency: 'TRY',
      description: 'Su',
      paidFromDrawer: true,
      items: [{ productId: water.id, qtyMilli: 2_000, unitPriceMinor: 15_000 }]
    })
    const row = svc.ledger.getDay(owner, '2026-10-04').expenses[0]!
    expect(row.items).toEqual([
      expect.objectContaining({ productName: 'Damacana su', qtyMilli: 2_000, amountMinor: 30_000 })
    ])
    expect(svc.supply.priceHistory(owner, water.id)).toEqual([
      expect.objectContaining({ date: '2026-10-04', unitPriceMinor: 15_000 })
    ])
    expect(svc.supply.purchases(owner, { from: '2026-10-01', to: '2026-10-31' }).map((p) => p.id)).toEqual([
      written.id
    ])
  })

  it('rezervasyondan girilen ödeme deftere, defterden girilen ödeme rezervasyonun bakiyesine düşer', async () => {
    const { svc, pay, booking, code } = await setup()
    pay(250_000, 'cash')
    const fromLedger = svc.payments.create(reception, {
      reservationId: booking.reservation.id,
      date: '2026-10-04',
      methodId: code(paymentMethods, 'card'),
      amountMinor: 100_000,
      currency: 'TRY'
    })
    const day = svc.ledger.getDay(reception, '2026-10-04')
    expect(day.income.map((r) => r.amountMinor)).toEqual([250_000, 100_000])
    expect(day.income[0]).toMatchObject({
      guestName: 'Deniz Yıldırım',
      roomNumbers: ['301'],
      channelCode: 'booking'
    })
    const view = svc.reservations.view(owner, booking.reservation.id)
    expect(view.folio.balanceMinor).toBe(750_000 - 350_000)
    expect(svc.ledger.getDay(owner, '2026-10-04').income.map((r) => r.id)).toContain(fromLedger.id)

    const hits = svc.ledger.searchReservations(reception, undefined, '2026-10-04')
    expect(hits).toEqual([
      expect.objectContaining({ guestName: 'Deniz Yıldırım', roomNumbers: ['301'], balanceMinor: 400_000 })
    ])
    expect(svc.ledger.searchReservations(reception, 'yildirim', '2026-12-01')).toHaveLength(1)
    expect(svc.ledger.searchReservations(reception, '301', '2026-10-05')).toHaveLength(1)
    expect(svc.ledger.searchReservations(reception, 'yok', '2026-10-04')).toEqual([])
  })

  it('ek hizmet satışı (bavul emaneti) odasız gelir olarak deftere girer', async () => {
    const { svc, code } = await setup()
    const luggage = svc.ledger.options(reception).extraServices.find((s) => s.code === 'luggage')!
    svc.payments.sellExtra(reception, {
      extraServiceId: luggage.id,
      date: '2026-10-04',
      qty: 2,
      unitMinor: 15_000,
      currency: 'TRY',
      description: '2 bavul',
      payment: { methodId: code(paymentMethods, 'cash') }
    })
    const row = svc.ledger.getDay(reception, '2026-10-04').income[0]!
    expect(row).toMatchObject({
      amountMinor: 30_000,
      saleTitle: '2 bavul',
      reservationId: null,
      roomNumbers: []
    })
    expect(svc.ledger.drawerPanel(owner).drawer).toEqual({ TRY: 30_000 })
  })
})

describe('açıklama sözlüğü (G-66; kabul ölçütü)', () => {
  it('"su", "Su " ve "SU" tek gruba düşer; yeniden adlandırma ve birleştirme bütün satırları değiştirir', async () => {
    const { svc, spend } = await setup()
    spend(1_000, 'su')
    spend(2_000, 'Su ')
    spend(3_000, 'SU')
    spend(4_000, 'Damacana')
    const groups = svc.expenses.descriptionGroups(reception)
    expect(groups[0]).toMatchObject({ key: 'su', count: 3 })
    expect(groups[0]?.spellings.map((s) => s.description).sort()).toEqual(['SU', 'Su', 'su'].sort())
    expect(svc.expenses.suggestDescriptions(reception, 'S').map((s) => s.key)).toEqual(['su'])

    expect(svc.expenses.renameDescription(reception, 'su', 'Su (damacana)')).toEqual({
      changed: 3,
      key: 'su damacana',
      skippedClosed: 0
    })
    // Renaming "Damacana" to the same text merges the two groups.
    svc.expenses.renameDescription(reception, 'damacana', 'Su (damacana)')
    const after = svc.expenses.descriptionGroups(reception)
    expect(after).toEqual([
      {
        key: 'su damacana',
        description: 'Su (damacana)',
        count: 4,
        spellings: [{ description: 'Su (damacana)', count: 4 }]
      }
    ])
    const audits = handle.db.select().from(auditLog).where(eq(auditLog.entity, 'expense')).all()
    expect(audits.filter((a) => a.action === 'update')).toHaveLength(4)
    expect(() => svc.expenses.renameDescription(roleCtx('housekeeping'), 'su', 'x')).toThrow(
      /PERMISSION_DENIED/
    )
    expect(() => svc.expenses.renameDescription(reception, 'yok', 'x')).toThrow(/NOT_FOUND/)
  })
})

describe('ay görünümü ve sıralama tercihi (G-62, G-63)', () => {
  it('ay görünümü gün notlarını, kapalı günleri ve iptal edilen satırları verir', async () => {
    const { svc, pay } = await setup()
    pay(100_000, 'cash', { date: '2026-10-02' })
    const v = pay(5_000, 'cash', { date: '2026-10-03' })
    svc.payments.void(owner, v.id, 'yanlış')
    svc.ledger.setDayNote(owner, '2026-10-02', 'Selin izin kullandı')
    svc.settings.set(owner, { 'businessDay.closingEnabled': true })
    svc.ledger.closeDay(owner, '2026-10-03')
    const month = svc.ledger.month(owner, 2026, 10)
    expect(month.days).toEqual([
      { date: '2026-10-02', status: 'open', note: 'Selin izin kullandı' },
      { date: '2026-10-03', status: 'closed', note: null }
    ])
    expect(month.income.map((r) => [r.date, r.voided])).toEqual([
      ['2026-10-02', false],
      ['2026-10-03', true]
    ])
    expect(month).toMatchObject({ from: '2026-10-01', to: '2026-11-01', closingEnabled: true })
  })

  it('sıralama tercihi kişiye göre hatırlanır', async () => {
    const { svc } = await setup()
    const role = handle.db.select().from(roles).where(eq(roles.code, 'reception')).get()!
    const user = svc.users.createUser(owner, {
      username: 'deniz',
      displayName: 'Deniz Arslan',
      roleId: role.id,
      password: 'resepsiyon-sifre-1'
    })
    const deniz = ctxFromPermissions(user.id, 'test-device', 'ipc', defaultPermissions('reception'))
    expect(svc.ledger.options(deniz).sort).toBe('method')
    svc.ledger.setSort(deniz, 'time')
    expect(svc.ledger.options(deniz).sort).toBe('time')
    expect(svc.ledger.options(owner).sort).toBe('method')
    expect(() => svc.ledger.setSort(roleCtx('housekeeping'), 'time')).toThrow(/PERMISSION_DENIED/)
  })
})

describe('"Teslim al" penceresinin net tutarı (QA2a)', () => {
  it('panel bugüne kadarki nakdi ve kasadan çıkanları (gider, avans ayrı) verir; farkı teslim geçmişindeki sayıdır', async () => {
    const { svc, pay, spend } = await setup()
    svc.settings.set(owner, { 'staff.advanceFromDrawer': true })
    const worker = svc.staff.createEmployee(owner, {
      firstName: 'Kenan',
      lastName: 'Örnek',
      startDate: '2026-01-01',
      salary: { monthlyMinor: 3_000_000, currency: 'TRY', validFrom: '2026-01-01' }
    })
    pay(280_000, 'cash')
    pay(90_000, 'card')
    pay(70_000, 'cash', { date: '2026-10-06' })
    spend(30_000, 'Market')
    spend(5_000, 'Su', { date: '2026-10-06' })
    svc.staff.addTransaction(owner, {
      employeeId: worker.id,
      date: '2026-10-04',
      kind: 'advance',
      amountMinor: 20_000,
      paidFromDrawer: true
    })
    const panel = svc.ledger.drawerPanel(manager)
    expect(panel.cashToday).toEqual({ TRY: 280_000 })
    expect(panel.drawerOut).toEqual([
      { date: '2026-10-04', currency: 'TRY', expensesMinor: 30_000, staffMinor: 20_000 },
      { date: '2026-10-06', currency: 'TRY', expensesMinor: 5_000, staffMinor: 0 }
    ])
    const shown =
      (panel.cashToday.TRY ?? 0) -
      panel.drawerOut
        .filter((o) => o.date <= '2026-10-04')
        .reduce((sum, o) => sum + o.expensesMinor + o.staffMinor, 0)
    expect(shown).toBe(230_000)
    svc.payments.handover(owner, { upToDate: '2026-10-04', onlyCash: true })
    expect(svc.ledger.handovers(owner)[0]!.drawer).toEqual({ TRY: shown })
  })
})
