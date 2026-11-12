// Import wizard bug-hunt fixes (P14fix: #2 import twice / cancel an import, #10 salary sheet, #14 hotel day,
// #17 live reservations only, #18 the sale folio of an unmatched income line in one transaction).
import { afterEach, describe, expect, it } from 'vitest'
import { and, eq, isNotNull, isNull } from 'drizzle-orm'
import { defaultPermissions } from '@shared/permissions'
import { depsOf, roleCtx, testClock } from '../../../tests/factories/ctx'
import { seededDatabase } from '../../../tests/factories/db'
import type { DatabaseHandle } from '../db/client'
import {
  auditLog,
  businessDays,
  cashHandovers,
  charges,
  employeeSalaries,
  expenses,
  folios,
  paymentMethods,
  payments,
  reservations,
  roomNights,
  roomTypes,
  salesChannels,
  settings,
  staffTransactions
} from '../db/schema'
import { ctxFromPermissions } from './context'
import { createDataImportService } from './data-import-service'
import { createExpensesService } from './expenses-service'
import { createPaymentsService } from './payments-service'
import { createReservationsService } from './reservations-service'
import { createRoomsService } from './rooms-service'
import { createStaffService } from './staff-service'

const owner = roleCtx('owner', 'u-owner')
let handle: DatabaseHandle
afterEach(() => handle?.close())

async function setup(start = '2026-10-15T09:00:00.000Z') {
  handle = await seededDatabase()
  const clock = testClock(start)
  const deps = depsOf(handle, clock)
  const roomsSvc = createRoomsService(deps)
  const standard = handle.db.select().from(roomTypes).where(eq(roomTypes.code, 'standard')).get()!
  for (const n of ['101', '102', '103', '104'])
    roomsSvc.createRoom(owner, { number: n, roomTypeId: standard.id, beds: 2, validFrom: '2026-01-01' })
  const res = createReservationsService(deps)
  const pay = createPaymentsService(deps)
  const exp = createExpensesService(deps)
  const staff = createStaffService(deps)
  const imp = createDataImportService({ ...deps, reservations: res, payments: pay, expenses: exp, staff })
  const id = (table: typeof salesChannels | typeof paymentMethods, code: string) =>
    handle.db.select().from(table).where(eq(table.code, code)).get()!.id
  const roomId = (n: string) => roomsSvc.listRooms(owner).find((r) => r.number === n)!.id
  return { clock, res, pay, exp, staff, imp, id, roomId }
}

const b64 = (text: string) => Buffer.from(text, 'utf8').toString('base64')

const LEDGER = [
  'Tarih;Kasa;Ücret;Birim;İsim;Ödeme Yöntemi;Oda;Platform;Kasa;Gider;Birim;Gider Açıklaması',
  '01.10.2026;x;2.500;TL;Deneme Gelir A;Nakit;;---;x;300;TL;Deneme market',
  '01.10.2026;;1.000;TL;Deneme Gelir B;Kredi Kartı;;---;;150;TL;Deneme kargo',
  // The same line twice in one file: two real sales, both go in.
  '02.10.2026;;500;TL;Deneme Gelir C;Nakit;;---;;;;',
  '02.10.2026;;500;TL;Deneme Gelir C;Nakit;;---;;;;'
].join('\n')

const ledgerInput = (text = LEDGER, fileName = 'Defter Ekim 2026.csv') => ({
  template: 'ledgerRows' as const,
  fileName,
  contentBase64: b64(text)
})

const live = <T extends typeof payments | typeof expenses>(table: T) =>
  handle.db.select().from(table).where(isNull(table.voidedAt)).all()

describe('içe aktarma tekrarı ve aktarımı iptal (P14fix #2)', () => {
  it('aynı defter dosyası ikinci kez alınınca hiçbir satır iki kez yazılmaz; önizleme "zaten alınmış" der', async () => {
    const s = await setup()
    const first = await s.imp.run(owner, ledgerInput())
    expect(first).toMatchObject({ payments: 4, expenses: 2, skipped: 0, errorCount: 0 })
    expect(first.batchId).toBeTruthy()
    expect(live(payments)).toHaveLength(4)

    const preview = await s.imp.preview(owner, ledgerInput())
    expect(preview).toMatchObject({ recordCount: 6, alreadyImported: 6 })
    expect(preview.sameFileAt).toBe('2026-10-15T09:00:00.000Z')
    expect(preview.records.every((r) => r.already)).toBe(true)

    const again = await s.imp.run(owner, ledgerInput())
    expect(again).toMatchObject({ payments: 0, expenses: 0, skipped: 6, batchId: null })
    expect(live(payments)).toHaveLength(4)
    expect(live(expenses)).toHaveLength(2)
  })

  it('dosyada düzeltilip yeniden alınınca yalnız yeni ya da düzeltilen satır girer', async () => {
    const s = await setup()
    const broken = LEDGER.replace('Deneme Gelir B;Kredi Kartı', 'Deneme Gelir B;Çek')
    const first = await s.imp.run(owner, ledgerInput(broken, 'defter.csv'))
    expect(first).toMatchObject({ payments: 3, errorCount: 1 })
    // Fixed in the file and saved under another name: the three already taken are skipped.
    const fixed = await s.imp.run(owner, ledgerInput(LEDGER, 'defter (2).csv'))
    expect(fixed).toMatchObject({ payments: 1, expenses: 0, skipped: 5, errorCount: 0 })
    expect(live(payments)).toHaveLength(4)
  })

  it('"Bu aktarımı iptal et" yazdığı her şeyi gerekçeyle iptal eder, teslimi geri alır; sonra yeniden alınabilir', async () => {
    const s = await setup()
    const first = await s.imp.run(owner, ledgerInput())
    expect(handle.db.select().from(payments).where(isNotNull(payments.collectedAt)).all()).toHaveLength(1)
    const [batch] = s.imp.batches(owner)
    expect(batch).toMatchObject({
      id: first.batchId,
      template: 'ledgerRows',
      fileName: 'Defter Ekim 2026.csv',
      voidedAt: null,
      summary: { payments: 4, expenses: 2 }
    })
    await expect(
      Promise.resolve().then(() => s.imp.voidBatch(owner, { id: first.batchId!, reason: '' }))
    ).rejects.toMatchObject({ code: 'VALIDATION' })
    const voided = s.imp.voidBatch(owner, { id: first.batchId!, reason: 'Yanlış dosya seçildi' })
    expect(voided).toMatchObject({ voidReason: 'Yanlış dosya seçildi' })
    expect(voided.voidedAt).not.toBeNull()
    expect(live(payments)).toHaveLength(0)
    expect(live(expenses)).toHaveLength(0)
    expect(
      handle.db
        .select()
        .from(auditLog)
        .where(and(eq(auditLog.entity, 'import_batch'), eq(auditLog.action, 'void')))
        .all()
    ).toHaveLength(1)
    // Cancelled twice: refused; the rows of a cancelled import may come in again.
    expect(() => s.imp.voidBatch(owner, { id: first.batchId!, reason: 'Yeniden' })).toThrow(
      /errors.alreadyCancelled/
    )
    const again = await s.imp.run(owner, ledgerInput())
    expect(again).toMatchObject({ payments: 4, expenses: 2, skipped: 0 })
    expect(live(payments)).toHaveLength(4)
  })

  it('rezervasyon tablosu: ikinci kez alınınca atlanır; iptal edilince geceler boşalır, ödemeler iptal olur', async () => {
    const s = await setup()
    const grid = {
      template: 'reservationGrid' as const,
      fileName: 'Rezervasyon Ekim 2026.csv',
      contentBase64: b64(
        ['ODA NO;01.10.2026;02.10.2026;03.10.2026', '101;Deneme Kişi (2000 TL);Deneme Kişi (2000 TL);'].join(
          '\n'
        )
      ),
      paidMethodId: null
    }
    const first = await s.imp.run(owner, grid)
    expect(first).toMatchObject({ reservations: 1, nights: 2 })
    expect(await s.imp.run(owner, grid)).toMatchObject({ reservations: 0, skipped: 1, errorCount: 0 })
    s.imp.voidBatch(owner, { id: first.batchId!, reason: 'Deneme aktarımı' })
    expect(handle.db.select().from(reservations).get()?.status).toBe('cancelled')
    expect(handle.db.select().from(roomNights).all()).toHaveLength(0)
    expect(await s.imp.run(owner, grid)).toMatchObject({ reservations: 1, nights: 2 })
  })

  it('iptal bir parçada takılırsa hiçbir şey değişmez (tek işlem)', async () => {
    const s = await setup()
    const first = await s.imp.run(owner, ledgerInput())
    // A day of the import was closed since: a role without the closed-day right cannot cancel it.
    handle.db
      .insert(settings)
      .values({
        key: 'businessDay.closingEnabled',
        valueJson: 'true',
        updatedAt: '2026-10-15T09:00:00.000Z',
        updatedBy: null
      })
      .onConflictDoUpdate({ target: settings.key, set: { valueJson: 'true' } })
      .run()
    handle.db
      .insert(businessDays)
      .values({
        date: '2026-10-02',
        status: 'closed',
        createdAt: '2026-10-03T00:00:00.000Z',
        updatedAt: '2026-10-03T00:00:00.000Z'
      })
      .run()
    const perms = { ...defaultPermissions('owner'), 'ledger.locked': 'none' as const }
    const noLocked = ctxFromPermissions('u-owner', 'd', 'ipc', perms)
    expect(() => s.imp.voidBatch(noLocked, { id: first.batchId!, reason: 'Deneme iptal' })).toThrow(
      /errors.dayClosed/
    )
    expect(live(payments)).toHaveLength(4)
    expect(live(expenses)).toHaveLength(2)
    expect(s.imp.batches(owner)[0]?.voidedAt).toBeNull()
  })
})

describe('maaş tablosu şablonu (P14fix #10, G-123)', () => {
  const salaryCsv = [
    'Personel;Ay;Maaş;Ödenen;Ödeme Yöntemi',
    'Kenan Deneme;Ekim 2026;40.000;31.500;Nakit',
    'Selvi Örnek;2026-10;35.000;;',
    'Bilinmeyen Kişi;Ekim 2026;30.000;30.000;Nakit',
    'Kenan Deneme;Onüçüncü ay;40.000;1.000;Nakit'
  ].join('\n')
  const input = {
    template: 'salaryRows' as const,
    fileName: 'Maaşlar 2026.csv',
    contentBase64: b64(salaryCsv)
  }

  it('çalışan, ay, net maaş, ödenen ve yöntem okunur; maaş servisinden yazılır; bilinmeyen çalışan raporlanır', async () => {
    const s = await setup('2026-11-05T09:00:00.000Z')
    const kenan = s.staff.createEmployee(owner, {
      firstName: 'Kenan',
      lastName: 'Deneme',
      startDate: '2026-01-01',
      salary: { monthlyMinor: 3_000_000, currency: 'TRY', validFrom: '2026-01-01' }
    })
    const selvi = s.staff.createEmployee(owner, {
      firstName: 'Selvi',
      lastName: 'Örnek',
      startDate: '2026-03-01'
    })
    const preview = await s.imp.preview(owner, input)
    expect(preview.mapping).toMatchObject({ employee: 0, month: 1, salary: 2, paid: 3, method: 4 })
    expect(preview.errors.map((e) => [e.row, e.code])).toEqual([
      [4, 'unknownEmployee'],
      [5, 'badMonth']
    ])
    expect(preview.records[0]).toMatchObject({
      kind: 'salary',
      name: 'Kenan Deneme',
      date: '2026-10-01',
      amountMinor: 4_000_000,
      paidMinor: 3_150_000
    })
    const report = await s.imp.run(owner, input)
    expect(report).toMatchObject({ salaries: 2, salaryPayments: 1, errorCount: 2 })
    // A raise from October (history is never rewritten), the October payment from the drawer's cash method.
    expect(
      handle.db
        .select()
        .from(employeeSalaries)
        .where(eq(employeeSalaries.employeeId, kenan.id))
        .all()
        .map((r) => [r.validFrom, r.monthlyMinor])
    ).toEqual([
      ['2026-01-01', 3_000_000],
      ['2026-10-01', 4_000_000]
    ])
    expect(
      handle.db.select().from(employeeSalaries).where(eq(employeeSalaries.employeeId, selvi.id)).get()
    ).toMatchObject({ validFrom: '2026-10-01', monthlyMinor: 3_500_000 })
    const txn = handle.db.select().from(staffTransactions).get()!
    expect(txn).toMatchObject({
      employeeId: kenan.id,
      kind: 'salary_payment',
      amountMinor: 3_150_000,
      periodYear: 2026,
      periodMonth: 10,
      date: '2026-10-31'
    })
    expect(handle.db.select().from(expenses).where(eq(expenses.id, txn.expenseId!)).get()).toMatchObject({
      kind: 'staff',
      methodId: s.id(paymentMethods, 'cash')
    })
    // The same sheet again: nothing doubles.
    expect(await s.imp.run(owner, input)).toMatchObject({ salaries: 0, salaryPayments: 0, skipped: 2 })
    expect(handle.db.select().from(staffTransactions).all()).toHaveLength(1)
    // Cancelling the import voids the payment (and its expense row).
    s.imp.voidBatch(owner, { id: report.batchId!, reason: 'Yanlış ay' })
    expect(handle.db.select().from(staffTransactions).get()?.voidedAt).not.toBeNull()
  })

  it('maaş şablonu maaş yazma yetkisi ister; örnek dosya başlıkları kişinin dilindedir', async () => {
    const s = await setup()
    // The accountant writes salaries (staff.salary edit); reception has no backup right at all.
    await expect(s.imp.preview(roleCtx('reception'), input)).rejects.toMatchObject({
      code: 'PERMISSION_DENIED'
    })
    const noSalary = ctxFromPermissions('u-x', 'd', 'ipc', { 'settings.backup': 'edit' })
    await expect(s.imp.run(noSalary, input)).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
    const sample = await s.imp.sample(owner, { template: 'salaryRows', locale: 'tr' })
    expect(sample.fileName).toMatch(/\.csv$/)
    const text = Buffer.from(sample.base64, 'base64').toString('utf8')
    expect(text.split('\r\n')[0]).toBe('﻿Personel;Ay;Maaş;Ödenen;Ödeme yöntemi;Ödeme tarihi;Para birimi')
    const en = await s.imp.sample(owner, { template: 'salaryRows', locale: 'en' })
    expect(Buffer.from(en.base64, 'base64').toString('utf8')).toContain('Employee,Month,Salary')
    // The sample reads back through the same template.
    const back = await s.imp.preview(owner, {
      template: 'salaryRows',
      fileName: sample.fileName,
      contentBase64: sample.base64
    })
    expect(back.mapping).toMatchObject({ employee: 0, month: 1, salary: 2, paid: 3, method: 4, date: 5 })
  })
})

describe('defter içe aktarma düzeltmeleri', () => {
  it('biten konaklama otelin gününe göre "çıkış yaptı" olur: 22:30 UTC İstanbul’da ertesi gündür (P14fix #14)', async () => {
    const s = await setup('2026-10-04T22:30:00.000Z')
    await s.imp.run(owner, {
      template: 'reservationGrid',
      fileName: 'ekim.csv',
      contentBase64: b64(
        ['ODA NO;02.10.2026;03.10.2026', '101;Deneme Gece (1000 TL);Deneme Gece (1000 TL)'].join('\n')
      )
    })
    // Left on 4 October: in Istanbul it is already the 5th.
    expect(handle.db.select().from(reservations).get()?.status).toBe('checked_out')
  })

  it('gelir satırı iptal edilmiş rezervasyona bağlanmaz (P14fix #17)', async () => {
    const s = await setup()
    const r = s.res.create(owner, {
      guest: { firstName: 'Deneme', lastName: 'Gelir' },
      channelId: s.id(salesChannels, 'direct'),
      stays: [
        { roomId: s.roomId('101'), checkIn: '2026-10-01', checkOut: '2026-10-03', nightlyPriceMinor: 100_000 }
      ]
    })
    s.res.cancel(owner, r.reservation.id, 'Misafir gelmeyecek')
    await s.imp.run(owner, {
      template: 'ledgerRows',
      fileName: 'defter.csv',
      contentBase64: b64(
        ['Tarih;Ücret;Birim;İsim;Ödeme Yöntemi;Oda', '02.10.2026;1.000;TL;Deneme Gelir;Nakit;101'].join('\n')
      )
    })
    const payment = handle.db.select().from(payments).get()!
    const folio = handle.db.select().from(folios).where(eq(folios.id, payment.folioId)).get()!
    expect(folio).toMatchObject({ kind: 'sale', reservationId: null })
  })

  it('eşleşmeyen gelirin satış folyosu ödemeyle tek işlemde yazılır: ödeme reddedilirse geride masraf kalmaz (P14fix #18)', async () => {
    const s = await setup()
    handle.db
      .insert(settings)
      .values({
        key: 'businessDay.closingEnabled',
        valueJson: 'true',
        updatedAt: '2026-10-15T09:00:00.000Z',
        updatedBy: null
      })
      .onConflictDoUpdate({ target: settings.key, set: { valueJson: 'true' } })
      .run()
    handle.db
      .insert(businessDays)
      .values({
        date: '2026-10-02',
        status: 'closed',
        createdAt: '2026-10-03T00:00:00.000Z',
        updatedAt: '2026-10-03T00:00:00.000Z'
      })
      .run()
    const perms = { ...defaultPermissions('owner'), 'ledger.locked': 'none' as const }
    const noLocked = ctxFromPermissions('u-owner', 'd', 'ipc', perms)
    const report = await s.imp.run(noLocked, {
      template: 'ledgerRows',
      fileName: 'defter.csv',
      contentBase64: b64(
        ['Tarih;Ücret;Birim;İsim;Ödeme Yöntemi', '02.10.2026;1.000;TL;Deneme Satış;Nakit'].join('\n')
      )
    })
    expect(report.errors.map((e) => e.code)).toEqual(['dayClosed'])
    expect(handle.db.select().from(charges).all()).toHaveLength(0)
    expect(handle.db.select().from(folios).where(eq(folios.kind, 'sale')).all()).toHaveLength(0)
  })

  it('içe aktarmanın gerekçesi kod olarak yazılır; teslim notu otelin dilinde, "Faz" sözü olmadan (yasak 8)', async () => {
    const s = await setup()
    handle.db
      .insert(settings)
      .values({
        key: 'ui.language',
        valueJson: '"en"',
        updatedAt: '2026-10-15T09:00:00.000Z',
        updatedBy: null
      })
      .onConflictDoUpdate({ target: settings.key, set: { valueJson: '"en"' } })
      .run()
    await s.imp.run(owner, ledgerInput())
    const reasons = handle.db
      .select({ reason: auditLog.reason })
      .from(auditLog)
      .where(and(eq(auditLog.action, 'import'), isNotNull(auditLog.reason)))
      .all()
    expect(reasons.length).toBeGreaterThan(0)
    expect(new Set(reasons.map((r) => r.reason))).toEqual(new Set(['import']))
    const [handover] = handle.db.select().from(cashHandovers).all()
    expect(handover!.note).toBe('Import')
    const texts = JSON.stringify(handle.db.select().from(auditLog).all())
    expect(texts).not.toContain('Faz 14')
  })
})
