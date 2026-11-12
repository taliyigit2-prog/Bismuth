// Early bug hunt fixes of Faz 7 (P7fix): cross rates through the base currency and the typed rate (K-43), what a
// role without `staff.salary` sees of staff money and the owner's section kept out of the drawer (K-42), the
// owner's "x" with selected rows, the handover history and the shift handover's drawer figure, extra sale audit
// rows and the description dictionary on closed days. Names and amounts are invented.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { roleCtx, testClock } from '../../../tests/factories/ctx'
import { seededDatabase } from '../../../tests/factories/db'
import type { DatabaseHandle } from '../db/client'
import { auditLog, expenses, expenseSections, paymentMethods, roomTypes, salesChannels } from '../db/schema'
import { createServices } from '.'

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

async function setup(folioCurrency = 'TRY') {
  handle = await seededDatabase()
  dir = mkdtempSync(join(tmpdir(), 'bismuth-p7fix-'))
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
    currency: folioCurrency,
    stays: [{ roomId: room.id, checkIn: '2026-10-03', checkOut: '2026-10-05', nightlyPriceMinor: 10_000 }]
  })
  const cash = code(paymentMethods, 'cash')
  const general = code(expenseSections, 'general')
  const ownerSection = code(expenseSections, 'owner')
  const market = (rates: Record<string, number>) =>
    svc.currency.ingestMarketRates(
      owner,
      Object.entries(rates).map(([currency, micro]) => ({ currency, micro, provider: 'test' })),
      'market_mid'
    )
  return { clock, svc, code, booking, cash, general, ownerSection, market }
}

const balance = (svc: Awaited<ReturnType<typeof setup>>['svc'], id: string) =>
  svc.reservations.view(owner, id).folio.balanceMinor

describe('K-43: ödemede çapraz kur ve elle kur (B1, B4, B12, B24, B11)', () => {
  it('EUR folyoya USD ödeme, kurlar biliniyorsa ana para birimi üzerinden çevrilir; elle kur yok sayılır (B1)', async () => {
    const { svc, booking, cash, market } = await setup('EUR')
    market({ USD: 34_000_000, EUR: 38_000_000 })
    const p = svc.payments.create(reception, {
      reservationId: booking.reservation.id,
      date: '2026-10-04',
      methodId: cash,
      amountMinor: 10_000,
      currency: 'USD',
      manualRateMicro: 34_000_000
    })
    // 100 USD × 34 = 3.400 TL; 3.400 TL ÷ 38 = 89,47 €.
    expect(p).toMatchObject({ amountBaseMinor: 340_000, amountFolioMinor: 8_947, fxSource: 'market_mid' })
    expect(balance(svc, booking.reservation.id)).toBe(20_000 - 8_947)
  })

  it('piyasa kuru varken yazılan elle kur folyoya da deftere de geçmez; ikisi aynı TL tutarı (B4)', async () => {
    const { svc, booking, cash, market } = await setup('TRY')
    market({ EUR: 35_000_000 })
    const p = svc.payments.create(reception, {
      reservationId: booking.reservation.id,
      date: '2026-10-04',
      methodId: cash,
      amountMinor: 10_000,
      currency: 'EUR',
      manualRateMicro: 36_000_000
    })
    expect(p).toMatchObject({ amountFolioMinor: 350_000, amountBaseMinor: 350_000 })
    const row = svc.ledger.getDay(owner, '2026-10-04').income.find((r) => r.id === p.id)
    expect(row?.amountBaseMinor).toBe(p.amountFolioMinor)
  })

  it('internetsiz EUR folyoya EUR ödeme: elle kur ana para birimi değerini verir (B12)', async () => {
    const { svc, booking, cash } = await setup('EUR')
    const p = svc.payments.create(reception, {
      reservationId: booking.reservation.id,
      date: '2026-10-04',
      methodId: cash,
      amountMinor: 10_000,
      currency: 'EUR',
      manualRateMicro: 38_000_000
    })
    expect(p).toMatchObject({
      amountFolioMinor: 10_000,
      amountBaseMinor: 380_000,
      fxRateToBase: 38_000_000,
      fxSource: 'manual'
    })
  })

  it('internetsiz EUR folyoya TL ödeme: folyo para biriminin elle kuruyla tamamlanır (B12)', async () => {
    const { svc, booking, cash } = await setup('EUR')
    const input = {
      reservationId: booking.reservation.id,
      date: '2026-10-04',
      methodId: cash,
      amountMinor: 380_000,
      currency: 'TRY'
    }
    expect(() => svc.payments.create(reception, input)).toThrow(/noRate/)
    const p = svc.payments.create(reception, { ...input, manualFolioRateMicro: 38_000_000 })
    expect(p).toMatchObject({ amountFolioMinor: 10_000, amountBaseMinor: 380_000 })
    expect(balance(svc, booking.reservation.id)).toBe(10_000)
  })

  it('internetsiz EUR folyoya USD ödeme iki elle kurla (1 USD ve 1 EUR kaç TL) tamamlanır', async () => {
    const { svc, booking, cash } = await setup('EUR')
    const input = {
      reservationId: booking.reservation.id,
      date: '2026-10-04',
      methodId: cash,
      amountMinor: 10_000,
      currency: 'USD',
      manualRateMicro: 34_000_000
    }
    expect(() => svc.payments.create(reception, input)).toThrow(/noRate/)
    const p = svc.payments.create(reception, { ...input, manualFolioRateMicro: 38_000_000 })
    expect(p).toMatchObject({ amountBaseMinor: 340_000, amountFolioMinor: 8_947, fxSource: 'manual' })
  })

  it('döviz ek hizmet satışında elle kur ödemenin TL değerine yazılır (B24)', async () => {
    const { svc, cash } = await setup()
    const luggage = svc.ledger.options(reception).extraServices.find((s) => s.code === 'luggage')!
    const sold = svc.payments.sellExtra(reception, {
      extraServiceId: luggage.id,
      date: '2026-10-04',
      qty: 1,
      unitMinor: 500,
      currency: 'EUR',
      manualRateMicro: 38_000_000,
      payment: { methodId: cash }
    })
    const row = svc.ledger.getDay(owner, '2026-10-04').income.find((r) => r.id === sold.paymentId)
    expect(row).toMatchObject({ amountBaseMinor: 19_000, fxSource: 'manual' })
  })

  it('"kur yok" satırına tutar değişmeden yazılan elle kur uygulanır: ödeme ve gider (B11)', async () => {
    const { svc, booking, cash, general } = await setup('EUR')
    const p = svc.payments.create(reception, {
      reservationId: booking.reservation.id,
      date: '2026-10-04',
      methodId: cash,
      amountMinor: 10_000,
      currency: 'EUR'
    })
    expect(p.amountBaseMinor).toBeNull()
    const fixed = svc.payments.update(owner, p.id, { amountMinor: 10_000, manualRateMicro: 38_000_000 })
    expect(fixed).toMatchObject({ amountBaseMinor: 380_000, amountFolioMinor: 10_000, fxSource: 'manual' })

    const e = svc.expenses.createExpense(reception, {
      date: '2026-10-04',
      sectionId: general,
      amountMinor: 1_000,
      currency: 'GBP',
      description: 'Kitap'
    })
    expect(e.amountBaseMinor).toBeNull()
    const typed = svc.expenses.updateExpense(reception, e.id, {
      amountMinor: 1_000,
      manualRateMicro: 44_000_000
    })
    expect(typed).toMatchObject({ amountBaseMinor: 44_000, fxSource: 'manual' })
  })

  it('kurun bilinip bilinmediği para birimi bazında okunur (formdaki kur alanı yalnız gerekince)', async () => {
    const { svc, market } = await setup()
    market({ EUR: 38_000_000 })
    expect(svc.currency.knownRates(reception, ['EUR', 'USD', 'TRY'])).toEqual({
      base: 'TRY',
      missing: ['USD']
    })
    expect(() => svc.currency.knownRates(roleCtx('housekeeping'), ['EUR'])).toThrow(/PERMISSION_DENIED/)
  })
})

describe('iade ödenenden fazla olamaz (takvim hata avı #12)', () => {
  it('1.000 ödenmiş folyoya 5.000 iade reddedilir; ödenen kadar iade kabul edilir; düzenleme de aynı sınırda', async () => {
    const { svc, booking, cash } = await setup()
    const base = {
      reservationId: booking.reservation.id,
      date: '2026-10-04',
      methodId: cash,
      currency: 'TRY'
    }
    svc.payments.create(reception, { ...base, amountMinor: 100_000 })
    expect(() => svc.payments.create(owner, { ...base, amountMinor: 500_000, kind: 'refund' })).toThrow(
      /refundExceedsPaid/
    )
    const refund = svc.payments.create(owner, { ...base, amountMinor: 60_000, kind: 'refund' })
    expect(() => svc.payments.create(owner, { ...base, amountMinor: 50_000, kind: 'refund' })).toThrow(
      /refundExceedsPaid/
    )
    expect(() => svc.payments.update(owner, refund.id, { amountMinor: 120_000 })).toThrow(/refundExceedsPaid/)
    expect(svc.payments.update(owner, refund.id, { amountMinor: 100_000 }).amountMinor).toBe(100_000)
  })
})

describe('ek hizmet satışı denetim kaydı (B14)', () => {
  it('satışın folyosu ve ödemesi de denetim kaydına yazılır', async () => {
    const { svc, cash } = await setup()
    const luggage = svc.ledger.options(reception).extraServices.find((s) => s.code === 'luggage')!
    const sold = svc.payments.sellExtra(reception, {
      extraServiceId: luggage.id,
      date: '2026-10-04',
      qty: 1,
      unitMinor: 15_000,
      currency: 'TRY',
      payment: { methodId: cash }
    })
    const rows = handle.db.select().from(auditLog).all()
    expect(
      rows.some((a) => a.entity === 'payment' && a.entityId === sold.paymentId && a.action === 'create')
    ).toBe(true)
    expect(
      rows.some((a) => a.entity === 'folio' && a.entityId === sold.folioId && a.action === 'create')
    ).toBe(true)
  })
})

describe('kasa teslimi (B10, B21, B23)', () => {
  it('"seçili satırlar" teslimi seçilen nakdin gününe kadarki kasadan giderleri de kapatır (B10)', async () => {
    const { svc, booking, cash, general } = await setup()
    const p = svc.payments.create(reception, {
      reservationId: booking.reservation.id,
      date: '2026-10-04',
      methodId: cash,
      amountMinor: 300_000,
      currency: 'TRY'
    })
    svc.expenses.createExpense(reception, {
      date: '2026-10-04',
      sectionId: general,
      amountMinor: 40_000,
      currency: 'TRY',
      description: 'Market',
      paidFromDrawer: true
    })
    const done = svc.payments.handover(owner, { paymentIds: [p.id] })
    expect(done).toMatchObject({ payments: 1, expenses: 1, totals: { drawer: { TRY: 260_000 } } })
    expect(svc.ledger.drawerPanel(owner).drawer).toEqual({})
  })

  it('kasa panelindeki "son teslim" geri alınmış teslimi göstermez; Bugün kartıyla aynı (B21)', async () => {
    const { svc, booking, cash, clock } = await setup()
    const pay = (amountMinor: number) =>
      svc.payments.create(reception, {
        reservationId: booking.reservation.id,
        date: '2026-10-04',
        methodId: cash,
        amountMinor,
        currency: 'TRY'
      })
    pay(100_000)
    const first = svc.payments.handover(owner, { upToDate: '2026-10-04' })
    clock.advance(10)
    pay(50_000)
    const second = svc.payments.handover(owner, { upToDate: '2026-10-04' })
    svc.payments.revertHandover(owner, second.id, 'yanlış sayıldı')
    expect(svc.ledger.drawerPanel(owner).lastHandover?.id).toBe(first.id)
    expect(svc.ledger.drawerSummary(owner).lastHandover?.at).toBe(
      svc.ledger.drawerPanel(owner).lastHandover?.at
    )
  })

  it('teslim alınacak satır yoksa boş teslim kaydı yazılmaz (B23)', async () => {
    const { svc } = await setup()
    expect(() => svc.payments.handover(owner, { upToDate: '2026-10-04' })).toThrow(/nothingToCollect/)
    expect(svc.ledger.handovers(owner)).toEqual([])
  })
})

describe('K-42 (1): yönetici bölümü gideri kasadan ödenemez (N1)', () => {
  it('servis reddeder; var olan kasadan gider yönetici bölümüne taşınamaz; seçenek listesi bunu söyler', async () => {
    const { svc, general, ownerSection } = await setup()
    const base = { date: '2026-10-04', amountMinor: 100_000, currency: 'TRY', description: 'Sahip kişisel' }
    expect(() =>
      svc.expenses.createExpense(owner, { ...base, sectionId: ownerSection, paidFromDrawer: true })
    ).toThrow(/ownerSectionNotFromDrawer/)
    expect(() =>
      svc.expenses.createExpense(owner, { ...base, sectionId: ownerSection, paidFromDrawer: false })
    ).not.toThrow()
    const drawer = svc.expenses.createExpense(owner, { ...base, sectionId: general, paidFromDrawer: true })
    expect(() => svc.expenses.updateExpense(owner, drawer.id, { sectionId: ownerSection })).toThrow(
      /ownerSectionNotFromDrawer/
    )
    const sections = svc.ledger.options(owner).sections
    expect(sections.map((s) => [s.code, s.drawerAllowed])).toEqual([
      ['general', true],
      ['owner', false]
    ])
  })

  it('personel giderleri yönetici bölümüne yazılıyorsa kasadan avans reddedilir', async () => {
    const { svc } = await setup()
    svc.settings.set(owner, { 'staff.expenseSection': 'owner', 'staff.advanceFromDrawer': true })
    const e = svc.staff.createEmployee(owner, {
      firstName: 'Selin',
      lastName: 'Kaya',
      startDate: '2026-01-01',
      salary: { monthlyMinor: 3_000_000, currency: 'TRY' }
    })
    expect(() =>
      svc.staff.addTransaction(owner, {
        employeeId: e.id,
        date: '2026-10-04',
        kind: 'advance',
        amountMinor: 100_000,
        paidFromDrawer: true
      })
    ).toThrow(/ownerSectionNotFromDrawer/)
  })
})

describe('K-42 (2): maaş yetkisi olmayan rol kasadan olmayan personel ödemesini görmez (B2, B20)', () => {
  async function withStaffMoney() {
    const env = await setup()
    const { svc } = env
    const e = svc.staff.createEmployee(owner, {
      firstName: 'Selin',
      lastName: 'Kaya',
      startDate: '2026-01-01',
      salary: { monthlyMinor: 3_000_000, currency: 'TRY' }
    })
    const salary = svc.staff.addTransaction(owner, {
      employeeId: e.id,
      date: '2026-10-04',
      kind: 'salary_payment',
      amountMinor: 3_150_000
    })
    return { ...env, e, salary }
  }

  it('gün, ay, çalışan süzgeci, ay özeti ve tek satır okuması maaşı göstermez; görünüm kısmi', async () => {
    const { svc, salary } = await withStaffMoney()
    for (const who of [reception, manager]) {
      const day = svc.ledger.getDay(who, '2026-10-04')
      expect(day.expenses).toEqual([])
      expect(day.partial).toBe(true)
      const month = svc.ledger.month(who, 2026, 10)
      expect(month.expenses).toEqual([])
      expect(month.employees).toEqual([])
      expect(month.partial).toBe(true)
      expect(JSON.stringify([day, month])).not.toContain('Selin')
      expect(() => svc.ledger.expenseRow(who, salary.expenseId!)).toThrow(/PERMISSION_DENIED/)
      expect(svc.expenses.listExpenses(who, { from: '2026-10-01', to: '2026-10-31' })).toEqual([])
      expect(() => svc.expenses.getExpense(who, salary.expenseId!)).toThrow(/PERMISSION_DENIED/)
    }
    expect(svc.ledger.monthSummary(manager, 2026, 10)).toMatchObject({ expensesBaseMinor: 0, partial: true })
    // Owner and accountant (staff.salary) see it.
    expect(svc.ledger.getDay(owner, '2026-10-04')).toMatchObject({ partial: false })
    expect(svc.ledger.getDay(owner, '2026-10-04').expenses).toHaveLength(1)
    expect(svc.ledger.getDay(accountant, '2026-10-04').expenses).toHaveLength(1)
  })

  it('kasadan verilen avans kasa hareketidir: kasayı gören herkes görür', async () => {
    const { svc, e } = await withStaffMoney()
    svc.settings.set(owner, { 'staff.advanceFromDrawer': true })
    svc.staff.addTransaction(owner, {
      employeeId: e.id,
      date: '2026-10-04',
      kind: 'advance',
      amountMinor: 200_000,
      paidFromDrawer: true
    })
    const rows = svc.ledger.getDay(reception, '2026-10-04').expenses
    expect(rows.map((r) => [r.staffKind, r.amountMinor])).toEqual([['advance', 200_000]])
    expect(svc.ledger.drawerPanel(manager).drawer).toEqual({ TRY: -200_000 })
    expect(svc.ledger.drawerSummary(reception).drawer).toEqual({ TRY: -200_000 })
  })

  it('dışa aktarma ve satır sayısı maaşı ve gizli bölümü saymaz (B2, B20)', async () => {
    const { svc, general, ownerSection } = await withStaffMoney()
    svc.expenses.createExpense(owner, {
      date: '2026-10-04',
      sectionId: ownerSection,
      amountMinor: 900_000,
      currency: 'TRY',
      description: 'Sahibin özel harcaması'
    })
    svc.expenses.createExpense(reception, {
      date: '2026-10-04',
      sectionId: general,
      amountMinor: 40_000,
      currency: 'TRY',
      description: 'Market',
      paidFromDrawer: true
    })
    const count = (who: typeof owner) =>
      svc.dataExport.datasets(who).find((d) => d.id === 'ledgerExpenses')?.rows
    expect(count(owner)).toBe(3)
    expect(count(manager)).toBe(1)
    const file = await svc.dataExport.run(manager, { dataset: 'ledgerExpenses', format: 'csv', locale: 'tr' })
    const text = Buffer.from(file.base64, 'base64').toString('utf8')
    expect(text).toContain('Market')
    expect(text).not.toContain('Selin')
    expect(text).not.toContain('Sahibin')
    expect(file.rows).toBe(1)
  })
})

describe('K-42 (3): vardiya devrindeki kasa okuyana göre (B5)', () => {
  it('Sahip devrindeki kasa Resepsiyona yalnız görebildiği satırlardan hesaplanır ve kısmi işaretlenir', async () => {
    const { svc, booking, cash, ownerSection } = await setup()
    svc.payments.create(reception, {
      reservationId: booking.reservation.id,
      date: '2026-10-04',
      methodId: cash,
      amountMinor: 300_000,
      currency: 'TRY'
    })
    // A drawer expense of the owner's section written before K-42 (old data).
    const old = svc.expenses.createExpense(owner, {
      date: '2026-10-04',
      sectionId: ownerSection,
      amountMinor: 100_000,
      currency: 'TRY',
      description: 'Sahip kişisel',
      paidFromDrawer: false
    })
    handle.db.update(expenses).set({ paidFromDrawer: true }).where(eq(expenses.id, old.id)).run()
    const written = svc.shifts.saveHandover(owner, { text: 'Devir' })
    expect(written.summary.cash).toMatchObject({ drawer: { TRY: 200_000 } })
    const read = svc.shifts
      .listHandovers(reception, '2026-10-01', '2026-10-31')
      .find((h) => h.id === written.id)!
    expect(read.summary.cash).toMatchObject({ drawer: { TRY: 300_000 }, partial: true })
    expect(svc.shifts.listHandovers(owner, '2026-10-01', '2026-10-31')[0]?.summary.cash).toMatchObject({
      drawer: { TRY: 200_000 },
      partial: false
    })
  })
})

describe('açıklama sözlüğü kapalı günde (B16)', () => {
  it('yeniden adlandırma kapalı günün satırlarını yetki ve gerekçe olmadan değiştirmez', async () => {
    const { svc, general } = await setup()
    const spend = (date: string) =>
      svc.expenses.createExpense(accountant, {
        date,
        sectionId: general,
        amountMinor: 1_000,
        currency: 'TRY',
        description: 'su'
      })
    const closedRow = spend('2026-10-02')
    const openRow = spend('2026-10-04')
    svc.settings.set(owner, { 'businessDay.closingEnabled': true })
    svc.ledger.closeDay(owner, '2026-10-02')
    expect(svc.expenses.renameDescription(accountant, 'su', 'Su')).toEqual({
      changed: 1,
      key: 'su',
      skippedClosed: 1
    })
    const description = (id: string) =>
      handle.db.select().from(expenses).where(eq(expenses.id, id)).get()!.description
    expect(description(closedRow.id)).toBe('su')
    expect(description(openRow.id)).toBe('Su')
    expect(svc.expenses.renameDescription(owner, 'su', 'Su (damacana)', 'sözlük düzeni')).toMatchObject({
      changed: 2,
      skippedClosed: 0
    })
    expect(description(closedRow.id)).toBe('Su (damacana)')
    const audit = handle.db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.entity, 'expense'),
          eq(auditLog.entityId, closedRow.id),
          eq(auditLog.action, 'update')
        )
      )
      .all()
    expect(audit.at(-1)?.reason).toBe('sözlük düzeni')
  })
})
