// Faz 10 hata avı düzeltmeleri (P10fix): the same role sees the same money in every report and in the ledger
// (K-42), the staff report follows the salary and finance rights, the hotel's own payment methods reach the
// month-end check, a foreign-currency night is never silently 0 in the room revenue, and the files say what the
// screens say.
import { afterEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import ExcelJS from 'exceljs'
import { defaultPermissions } from '@shared/permissions'
import { roleCtx, testClock } from '../../../../tests/factories/ctx'
import { seededDatabase } from '../../../../tests/factories/db'
import type { DatabaseHandle } from '../../db/client'
import { expenseSections, fxRates, paymentMethods, roomTypes, salesChannels } from '../../db/schema'
import { createServices } from '..'
import { ctxFromPermissions } from '../context'
import { revenueBase } from '../revenue-base'

const owner = roleCtx('owner')
const manager = roleCtx('manager')
const accountant = roleCtx('accountant')
const runtime = {
  name: 'Bismuth',
  version: 'test',
  packaged: false,
  dataDir: '',
  electron: null,
  chrome: null
}
const OCTOBER = { from: '2026-10-01', to: '2026-11-01' }

let handle: DatabaseHandle
afterEach(() => handle?.close())

async function hotel(start = '2026-10-20T09:00:00.000Z') {
  handle = await seededDatabase()
  const clock = testClock(start)
  const s = createServices(handle, runtime, { clock })
  const code = <T extends typeof paymentMethods | typeof salesChannels | typeof expenseSections>(
    table: T,
    c: string
  ) => handle.db.select().from(table).where(eq(table.code, c)).get()!.id
  const typeId = handle.db.select().from(roomTypes).where(eq(roomTypes.code, 'standard')).get()!.id
  const rooms = ['101', '102', '103'].map((number) =>
    s.rooms.createRoom(owner, { number, roomTypeId: typeId, beds: 2, validFrom: '2026-01-01' })
  )
  const book = (room: number, checkIn: string, checkOut: string, price: number, currency?: string) =>
    s.reservations.create(owner, {
      guest: { firstName: 'Örnek', lastName: `Misafir ${room}` },
      channelId: code(salesChannels, 'direct'),
      ...(currency ? { currency } : {}),
      stays: [{ roomId: rooms[room]!.id, checkIn, checkOut, nightlyPriceMinor: price }]
    }).reservation.id
  const pay = (reservationId: string, amountMinor: number, methodId: string, date: string) =>
    s.payments.create(owner, { reservationId, date, methodId, amountMinor, currency: 'TRY', kind: 'payment' })
  return { s, clock, code, rooms, book, pay }
}

async function sheets(base64: string): Promise<Record<string, unknown[][]>> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(Buffer.from(base64, 'base64') as unknown as ArrayBuffer)
  const out: Record<string, unknown[][]> = {}
  wb.eachSheet((ws) => {
    const rows: unknown[][] = []
    ws.eachRow((row) => rows.push((row.values as unknown[]).slice(1)))
    out[ws.name] = rows
  })
  return out
}

/** Card income 10.000, a 500 general expense and a 30.000 salary paid by IBAN (not from the drawer). */
async function octoberWithSalary() {
  const h = await hotel()
  const r = h.book(0, '2026-10-02', '2026-10-04', 500_000)
  h.pay(r, 1_000_000, h.code(paymentMethods, 'card'), '2026-10-02')
  h.s.expenses.createExpense(owner, {
    date: '2026-10-05',
    sectionId: h.code(expenseSections, 'general'),
    amountMinor: 50_000,
    currency: 'TRY',
    description: 'Deterjan'
  })
  const emp = h.s.staff.createEmployee(owner, {
    firstName: 'Deniz',
    lastName: 'Yıldız',
    startDate: '2026-01-01',
    salary: { monthlyMinor: 4_000_000, currency: 'TRY', validFrom: '2026-01-01' }
  })
  h.s.staff.addTransaction(owner, {
    employeeId: emp.id,
    date: '2026-10-10',
    kind: 'salary_payment',
    amountMinor: 3_000_000,
    currency: 'TRY',
    methodId: h.code(paymentMethods, 'bank')
  })
  return { ...h, emp }
}

describe('K-42 (2): rapor = defter = ay sonu = Excel (aynı rol)', () => {
  it('Müdür havale maaşını defterde de raporlarda da görmez: gider 500 her yerde', async () => {
    const { s } = await octoberWithSalary()
    const ledger = s.ledger.monthSummary(manager, 2026, 10)
    expect(ledger.expensesBaseMinor).toBe(50_000)
    const monthly = s.reports.monthly(manager, OCTOBER)
    const monthEnd = s.reports.monthEnd(manager, { year: 2026, month: 10 })
    const expenses = s.reports.expenses(manager, OCTOBER)
    expect(monthly.expensesMinor).toBe(ledger.expensesBaseMinor)
    expect(s.reports.summary(manager, OCTOBER).finance?.expensesMinor).toBe(50_000)
    expect(monthEnd.expensesMinor).toBe(50_000)
    expect(monthEnd.profitMinor).toBe(1_000_000 - 50_000)
    expect(expenses.totalMinor).toBe(50_000)
    expect(expenses.staffMinor).toBe(0)
    expect(s.reports.yearly(manager, { years: [2026] }).years[0]!.months[9]!.expensesMinor).toBe(50_000)
    expect(monthly.daily.find((d) => d.date === '2026-10-10')?.expensesMinor ?? 0).toBe(0)
    for (const top of [monthly.topExpenses, monthEnd.topExpenses, expenses.topExpenses])
      expect(top.map((g) => g.kind)).toEqual(['description'])
    expect(monthly.partial).toBe(true)

    const file = await s.reports.export(manager, {
      report: 'monthEnd',
      format: 'xlsx',
      locale: 'tr',
      year: 2026,
      month: 10
    })
    const book = await sheets(file.base64)
    const results = Object.entries(book).find(([name]) => name.startsWith('Ciro'))![1]
    expect(results.find((r) => r[0] === 'Gider')?.[1]).toBe(500)
    expect(JSON.stringify(book)).not.toContain('Personel')
  })

  it('Sahip maaşı görür: defter ve raporlar 30.500', async () => {
    const { s } = await octoberWithSalary()
    expect(s.ledger.monthSummary(owner, 2026, 10).expensesBaseMinor).toBe(3_050_000)
    expect(s.reports.monthly(owner, OCTOBER).expensesMinor).toBe(3_050_000)
    expect(s.reports.monthEnd(owner, { year: 2026, month: 10 }).topExpenses[0]).toMatchObject({
      kind: 'staff',
      totalMinor: 3_000_000
    })
  })
})

describe('personel raporu yetkisi (P10fix #2)', () => {
  it('maaş yetkisi olmayan rol para sütunlarını almaz; ciro ve oran reports.finance ister', async () => {
    const { s } = await octoberWithSalary()
    const staffOnly = ctxFromPermissions('u-custom', 'dev', 'ipc', {
      ...defaultPermissions('manager'),
      'reports.staff': 'view'
    })
    const r = s.reports.staff(staffOnly, { year: 2026 })
    expect(r.salaryVisible).toBe(false)
    expect(r.employees.map((e) => [e.name, e.costMinor, e.byKind])).toEqual([['Deniz Yıldız', null, {}]])
    expect(r.months.every((m) => m.costMinor === null)).toBe(true)
    expect(r.laborRatioBp).toBeNull()
    // The manager has reports.finance: revenue yes, the staff-cost ratio no (it would reveal the salaries).
    expect(r.revenueMinor).toBe(1_000_000)

    const noFinance = ctxFromPermissions('u-custom2', 'dev', 'ipc', {
      ...defaultPermissions('accountant'),
      'reports.finance': 'none'
    })
    const r2 = s.reports.staff(noFinance, { year: 2026 })
    expect(r2.employees[0]).toMatchObject({ costMinor: 3_000_000 })
    expect(r2.revenueMinor).toBeNull()
    expect(r2.laborRatioBp).toBeNull()

    const full = s.reports.staff(accountant, { year: 2026 })
    expect(full).toMatchObject({ salaryVisible: true, revenueMinor: 1_000_000, laborRatioBp: 30_000 })
  })

  it('maaş yetkisi olmayanın Excel dosyasında para sütunu yok', async () => {
    const { s } = await octoberWithSalary()
    const staffOnly = ctxFromPermissions('u-custom', 'dev', 'ipc', {
      ...defaultPermissions('manager'),
      'reports.staff': 'view',
      'reports.export': 'view'
    })
    const file = await s.reports.export(staffOnly, {
      report: 'staff',
      format: 'xlsx',
      locale: 'tr',
      year: 2026
    })
    const book = await sheets(file.base64)
    expect(Object.keys(book)).toHaveLength(1)
    const [head] = Object.values(book)[0]!
    expect(head).not.toContain('Maaş')
    expect(JSON.stringify(book)).not.toContain('30000')
  })

  it("Excel'deki izin günü ekranla aynı: tatilde çalışılan gün izin sayılmaz (P10fix #9)", async () => {
    const { s, emp } = await octoberWithSalary()
    s.staff.addLeave(owner, { employeeId: emp.id, date: '2026-10-05', kind: 'rest_day' })
    s.staff.addLeave(owner, { employeeId: emp.id, date: '2026-10-06', kind: 'holiday_worked' })
    const file = await s.reports.export(owner, { report: 'staff', format: 'xlsx', locale: 'tr', year: 2026 })
    const rows = Object.values(await sheets(file.base64))[0]!
    const col = (rows[0] as string[]).indexOf('İzin günü')
    expect(col).toBeGreaterThan(-1)
    expect(rows[1]![col]).toBe(1)
  })
})

describe('otelin eklediği ödeme yöntemleri (P10fix #6)', () => {
  it('eklenirken grup seçilir; ay sonu bütün grupları gösterir, x bekleyenler nakit dışı her grubu kapsar', async () => {
    const h = await hotel()
    const pos = h.s.lists.create(owner, { kind: 'paymentMethods', name: 'Sanal POS', group: 'card' })
    const voucher = h.s.lists.create(owner, { kind: 'paymentMethods', name: 'Çek', group: 'other' })
    const till = h.s.lists.create(owner, { kind: 'paymentMethods', name: 'Kasa 2', isCash: true })
    expect([pos.group, pos.isCash, voucher.group, till.group, till.isCash]).toEqual([
      'card',
      false,
      'other',
      'cash',
      true
    ])
    const r = h.book(0, '2026-10-02', '2026-10-04', 500_000)
    h.pay(r, 1_000_000, pos.id, '2026-10-02')
    h.pay(r, 200_000, voucher.id, '2026-10-03')
    h.pay(r, 100_000, h.code(paymentMethods, 'cash'), '2026-10-03')

    const me = h.s.reports.monthEnd(owner, { year: 2026, month: 10 })
    expect(me.revenueMinor).toBe(1_300_000)
    expect(me.methods.map((m) => [m.group, m.totalMinor, m.pendingRows])).toEqual([
      ['card', 1_000_000, 1],
      ['bank', 0, 0],
      ['other', 200_000, 1],
      ['cash', 100_000, 1]
    ])
    expect(me.methods.reduce((t, m) => t + m.totalMinor, 0)).toBe(me.revenueMinor)

    const cash = h.s.reports.cash(owner, OCTOBER)
    expect(cash.uncheckedTotal).toBe(2)
    expect(cash.unchecked.map((u) => [u.group, u.amountMinor]).sort()).toEqual([
      ['card', 1_000_000],
      ['other', 200_000]
    ])
  })
})

describe('yabancı para birimli gece ücreti (P10fix #7)', () => {
  const eurRate = (ts: string) =>
    handle.db
      .insert(fxRates)
      .values({
        id: `01JZZZZZZZZZZZZZZZZZZZZ${ts.slice(8, 10)}`,
        ts,
        base: 'EUR',
        quote: 'TRY',
        midRateMicro: 50_000_000,
        source: 'market_mid',
        createdAt: ts
      })
      .run()

  it('kur biliniyorsa gece ücreti yazıldığı anda ana para birimine dondurulur', async () => {
    const h = await hotel('2026-10-01T09:00:00.000Z')
    eurRate('2026-10-01T08:00:00.000Z')
    h.book(0, '2026-10-02', '2026-10-04', 10_000, 'EUR')
    const sum = h.s.reports.summary(owner, OCTOBER)
    expect(sum.finance).toMatchObject({
      roomRevenueMinor: 1_000_000,
      missingNightRates: 0,
      adrMinor: 500_000
    })
    // A later rate does not change a frozen night.
    handle.db
      .insert(fxRates)
      .values({
        id: '01JZZZZZZZZZZZZZZZZZZZZZZ9',
        ts: '2026-10-10T08:00:00.000Z',
        base: 'EUR',
        quote: 'TRY',
        midRateMicro: 60_000_000,
        source: 'market_mid',
        createdAt: '2026-10-10T08:00:00.000Z'
      })
      .run()
    expect(h.s.reports.summary(owner, OCTOBER).finance?.roomRevenueMinor).toBe(1_000_000)
    expect(revenueBase(handle.db, { base: 'room_revenue_all', ...OCTOBER, currency: 'TRY' })).toBe(1_000_000)
  })

  it('kur yoksa sessizce 0 sayılmaz: "kur yok" sayısına girer; o gün için kur gelince rapor onu kullanır', async () => {
    const h = await hotel('2026-10-01T09:00:00.000Z')
    h.book(0, '2026-10-02', '2026-10-04', 10_000, 'EUR')
    h.book(1, '2026-10-02', '2026-10-03', 100_000)
    const before = h.s.reports.summary(owner, OCTOBER).finance!
    expect(before).toMatchObject({ roomRevenueMinor: 100_000, missingNightRates: 2 })
    expect(h.s.reports.occupancy(owner, OCTOBER).missingNightRates).toBe(2)
    eurRate('2026-10-02T08:00:00.000Z')
    const after = h.s.reports.summary(owner, OCTOBER).finance!
    // 2 Oct uses the rate of its day; 3 Oct the newest known before its end: both 50.
    expect(after).toMatchObject({ roomRevenueMinor: 1_100_000, missingNightRates: 0 })
    expect(revenueBase(handle.db, { base: 'room_revenue_all', ...OCTOBER, currency: 'TRY' })).toBe(1_100_000)
  })
})

describe('ay sonu Excel başlıkları ekranla aynı (P10fix #16)', () => {
  it('sayfa adı "Ödeme yöntemleri", sütun "Bekleyen satır"', async () => {
    const h = await hotel()
    const r = h.book(0, '2026-10-02', '2026-10-04', 500_000)
    h.pay(r, 1_000_000, h.code(paymentMethods, 'card'), '2026-10-02')
    const file = await h.s.reports.export(owner, {
      report: 'monthEnd',
      format: 'xlsx',
      locale: 'tr',
      year: 2026,
      month: 10
    })
    const book = await sheets(file.base64)
    const methods = book['Ödeme yöntemleri']
    expect(methods?.[0]).toEqual(['Yöntem', 'Toplam', 'Teslim alındı (x)', 'Bekleyen', 'Bekleyen satır'])
    expect(methods?.[1]).toEqual(['Kredi kartı', 10_000, 0, 10_000, 1])
  })
})
