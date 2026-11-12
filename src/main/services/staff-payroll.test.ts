// Faz 8 acceptance through the staff service (G-80…G-88, G-69, K-38): the 12-month table with a raise, overtime
// from worked hours, holiday work, the commission base the report shares, voiding an advance on both sides, the
// month lock with its audit rows, leave over several days, the leaving month and the linked account.
import { afterEach, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { depsOf, roleCtx, testClock } from '../../../tests/factories/ctx'
import { seededDatabase } from '../../../tests/factories/db'
import type { DatabaseHandle } from '../db/client'
import { auditLog, expenses, roles, roomTypes, salesChannels } from '../db/schema'
import { createLedgerService } from './ledger-service'
import { createReservationsService } from './reservations-service'
import { revenueBase } from './revenue-base'
import { createRoomsService } from './rooms-service'
import { createStaffService } from './staff-service'
import { createUsersService } from './users-service'

const owner = roleCtx('owner')
const manager = roleCtx('manager')
const accountant = roleCtx('accountant')
const reception = roleCtx('reception')
let handle: DatabaseHandle
afterEach(() => handle?.close())

async function setup(start = '2026-01-01') {
  handle = await seededDatabase()
  const clock = testClock('2026-12-31T09:00:00.000Z')
  const deps = depsOf(handle, clock)
  const staff = createStaffService(deps)
  const kenan = staff.createEmployee(owner, {
    firstName: 'Kenan',
    lastName: 'Örnek',
    position: 'Resepsiyon',
    startDate: start,
    userId: 'u-kenan',
    salary: { monthlyMinor: 3_000_000, currency: 'TRY', validFrom: start }
  })
  const kenanSelf = roleCtx('employee', 'u-kenan')
  return { clock, deps, staff, kenan, kenanSelf }
}

const mm = (m: number): string => String(m).padStart(2, '0')

describe('12 aylık maaş tablosu servis üzerinden (Excel formülü, maaş geçmişi)', () => {
  // [ay, avans, kullanılan izin, beklenen izin parası, beklenen net] — 30.000 Ocak–Ağustos, 40.000 Eylül'den.
  const YEAR: [number, number, number, number, number][] = [
    [1, 1_000_000, 0, 400_000, 2_400_000],
    [2, 1_500_000, 1, 300_000, 1_800_000],
    [3, 0, 4, 0, 3_000_000],
    [4, 3_000_000, 2, 200_000, 200_000],
    [5, 500_000, 3, 100_000, 2_600_000],
    [6, 2_000_000, 2, 200_000, 1_200_000],
    [7, 0, 0, 400_000, 3_400_000],
    [8, 1_250_000, 5, 0, 1_750_000],
    [9, 1_250_000, 1, 400_000, 3_150_000],
    [10, 4_000_000, 4, 0, 0],
    [11, 3_500_500, 2, 266_667, 766_167],
    [12, 0, 3, 133_333, 4_133_333]
  ]

  it('Ocak eski maaşla (30.000), Eylül yeni maaşla (40.000); her ay net Excel ile aynı', async () => {
    const { staff, kenan } = await setup()
    staff.addSalary(accountant, {
      employeeId: kenan.id,
      validFrom: '2026-09-01',
      monthlyMinor: 4_000_000,
      currency: 'TRY'
    })
    for (const [month, advance, used] of YEAR) {
      if (used > 0)
        staff.addLeaveDays(manager, {
          employeeId: kenan.id,
          from: `2026-${mm(month)}-02`,
          days: used,
          kind: 'rest_day'
        })
      if (advance > 0)
        staff.addTransaction(accountant, {
          employeeId: kenan.id,
          date: `2026-${mm(month)}-15`,
          kind: 'advance',
          amountMinor: advance
        })
    }
    for (const [month, advance, used, payout, net] of YEAR) {
      const row = staff.salaryTable(accountant, 2026, month).rows[0]!
      expect({
        month,
        monthly: row.monthly,
        advance: row.advances,
        used: row.leaveUsed,
        payout: row.leavePayout,
        net: row.net
      }).toEqual({
        month,
        monthly: month < 9 ? 3_000_000 : 4_000_000,
        advance,
        used,
        payout,
        net
      })
    }
    expect(staff.salaryHistory(accountant, kenan.id).map((s) => s.monthlyMinor)).toEqual([
      3_000_000, 4_000_000
    ])
  })
})

describe('mesai: çalışılan saatten öneri, müdür onayı, kurala göre tutar (S-34, S-39, K-38)', () => {
  it('10 saat çalışan (8 standart) için 2 saat öneri; müdür onaylayınca kurala göre ödenir', async () => {
    const { clock, staff, kenan, kenanSelf } = await setup()
    staff.addSalary(owner, {
      employeeId: kenan.id,
      validFrom: '2026-09-01',
      monthlyMinor: 4_000_000,
      currency: 'TRY'
    })
    // QA2a: one's own hours are written on the day (or a few days after), not months later.
    clock.set('2026-09-03T09:00:00.000Z')
    staff.recordWork(kenanSelf, { date: '2026-09-02', startTime: '08:00', endTime: '18:00' })
    clock.set('2026-12-31T09:00:00.000Z')
    const [day] = staff.listWork(manager, { employeeId: kenan.id, from: '2026-09-01', to: '2026-09-30' })
    expect(day).toMatchObject({ minutesWorked: 600, overtimeMinutes: 0, suggestedOvertimeMinutes: 120 })
    // Only Müdür/Sahip turn the suggestion into overtime.
    expect(() => staff.recordWork(kenanSelf, { date: '2026-09-02', overtimeMinutes: 120 })).toThrow(
      /PERMISSION_DENIED/
    )
    staff.recordWork(manager, {
      employeeId: kenan.id,
      date: '2026-09-02',
      overtimeMinutes: day!.suggestedOvertimeMinutes
    })
    const pay = () => staff.salaryPeriod(owner, { employeeId: kenan.id, year: 2026, month: 9 })
    expect(pay()).toMatchObject({ overtimeMinutes: 120, overtimePay: 0 }) // Pandora: no overtime pay
    staff.setPolicy(manager, { values: { overtimeMode: 'multiplier', overtimeMultiplier: '1.5' } })
    expect(pay().overtimePay).toBe(53_333) // 2 × 40.000 ÷ 225 × 1,5
    staff.setPolicy(owner, { values: { overtimeMode: 'hourly_fixed', overtimeHourlyMinor: 25_000 } })
    expect(pay().overtimePay).toBe(50_000) // 2 × 250
    // A longer standard day of this employee leaves no overtime to suggest.
    staff.setPolicy(manager, { employeeId: kenan.id, values: { standardHoursPerDay: 10 } })
    expect(
      staff.listWork(manager, { employeeId: kenan.id, from: '2026-09-02', to: '2026-09-02' })[0]
        ?.suggestedOvertimeMinutes
    ).toBe(0)
  })

  it('bayram gününde (29 Ekim, takvimden) çalışılan saate bayram çarpanı uygulanır', async () => {
    const { clock, staff, kenan, kenanSelf } = await setup()
    staff.addSalary(owner, {
      employeeId: kenan.id,
      validFrom: '2026-10-01',
      monthlyMinor: 4_000_000,
      currency: 'TRY'
    })
    clock.set('2026-10-30T09:00:00.000Z')
    staff.recordWork(kenanSelf, { date: '2026-10-29', startTime: '08:00', endTime: '18:00' })
    staff.recordWork(kenanSelf, { date: '2026-10-28', startTime: '08:00', endTime: '18:00' })
    clock.set('2026-12-31T09:00:00.000Z')
    const oct = () => staff.salaryPeriod(accountant, { employeeId: kenan.id, year: 2026, month: 10 })
    // 10 h × 40.000 ÷ 225 × (2 − 1) = 1.777,78
    expect(oct()).toMatchObject({ holidayDays: 1, holidayMinutes: 600, holidayPay: 177_778 })
    staff.setPolicy(owner, { values: { holidayMultiplier: '2.5' } })
    expect(oct().holidayPay).toBe(266_667)
    staff.setPolicy(owner, { values: { holidayPayMode: 'daily', holidayMultiplier: '2' } })
    expect(oct().holidayPay).toBe(133_333) // 1 day × 40.000 ÷ 30
  })
})

describe('prim tabanı raporla aynı rakam (S-36)', () => {
  it('yüzde prim seçilen tabandan hesaplanır; satırdaki taban revenueBase ile aynı', async () => {
    const { staff, kenan, deps } = await setup()
    const standard = handle.db.select().from(roomTypes).where(eq(roomTypes.code, 'standard')).get()!
    const room = createRoomsService(deps).createRoom(owner, {
      number: '501',
      roomTypeId: standard.id,
      beds: 2,
      validFrom: '2026-01-01'
    })
    const channelId = handle.db.select().from(salesChannels).where(eq(salesChannels.code, 'direct')).get()!.id
    createReservationsService(deps).create(owner, {
      guest: { firstName: 'Örnek' },
      channelId,
      stays: [{ roomId: room.id, checkIn: '2026-09-25', checkOut: '2026-10-05', nightlyPriceMinor: 250_000 }]
    })
    staff.setPolicy(owner, { values: { commissionMode: 'pct', commissionPct: '2' } })
    const sept = staff.salaryPeriod(accountant, { employeeId: kenan.id, year: 2026, month: 9 })
    const base = revenueBase(handle.db, {
      base: 'room_revenue_all',
      from: '2026-09-01',
      to: '2026-10-01',
      currency: 'TRY'
    })
    expect(base).toBe(6 * 250_000) // nights 25–30 September
    expect(sept.commissionBaseMinor).toBe(base)
    expect(sept.commission).toBe(30_000)
    staff.setPolicy(owner, { values: { commissionMode: 'fixed', commissionFixedMinor: 100_000 } })
    expect(staff.salaryPeriod(accountant, { employeeId: kenan.id, year: 2026, month: 9 })).toMatchObject({
      commission: 100_000,
      commissionBaseMinor: null
    })
  })
})

describe('avans iptali ve ay kilidi (G-69, G-88)', () => {
  it('avans defterde gider olur; iptal edilince gider de iptal olur ve maaş tablosu eski hâline döner', async () => {
    const { staff, kenan, deps } = await setup()
    const ledger = createLedgerService(deps)
    const before = staff.salaryTable(accountant, 2026, 10).rows[0]!.net
    const advance = staff.addTransaction(accountant, {
      employeeId: kenan.id,
      date: '2026-10-05',
      kind: 'advance',
      amountMinor: 500_000,
      note: 'Bayram öncesi'
    })
    expect(staff.salaryTable(accountant, 2026, 10).rows[0]!.net).toBe(before - 500_000)
    expect(ledger.getDay(owner, '2026-10-05').expenses.map((e) => [e.kind, e.amountMinor])).toEqual([
      ['staff', 500_000]
    ])
    staff.voidTransaction(accountant, advance.id, 'yanlış tutar')
    expect(staff.salaryTable(accountant, 2026, 10).rows[0]!.net).toBe(before)
    const expense = handle.db.select().from(expenses).where(eq(expenses.id, advance.expenseId!)).get()!
    expect(expense.voidedAt).not.toBeNull()
    expect(ledger.getDay(owner, '2026-10-05').expenses).toEqual([])
    expect(staff.staffPanel(owner, 2026, 10)[0]?.advancesMinor).toBe(0)
  })

  it('ay kilidi bütün satırları dondurur ve denetim kaydına yazar; açmak gerekçe ister', async () => {
    const { staff, kenan } = await setup()
    const other = staff.createEmployee(owner, {
      firstName: 'Ayşe',
      lastName: 'Deneme',
      startDate: '2026-03-01',
      salary: { monthlyMinor: 3_500_000, currency: 'TRY' }
    })
    staff.addTransaction(accountant, {
      employeeId: kenan.id,
      date: '2026-09-30',
      kind: 'salary_payment',
      amountMinor: 2_000_000
    })
    expect(() => staff.lockMonth(manager, 2026, 9)).toThrow(/PERMISSION_DENIED/)
    expect(staff.lockMonth(accountant, 2026, 9)).toEqual({ locked: 2 })
    const table = staff.salaryTable(owner, 2026, 9)
    expect(table.rows.every((r) => r.locked && r.lockedBy === 'user-accountant')).toBe(true)
    expect(table.rows.find((r) => r.employeeId === kenan.id)).toMatchObject({
      paid: 2_000_000,
      remaining: 1_400_000
    })
    expect(() =>
      staff.addTransaction(accountant, {
        employeeId: other.id,
        date: '2026-09-30',
        kind: 'advance',
        amountMinor: 1
      })
    ).toThrow(/salaryPeriodLocked/)
    expect(() => staff.lockMonth(accountant, 2026, 9)).toThrow(/salaryPeriodLocked/)
    const closes = handle.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entity, 'salary_period'), eq(auditLog.action, 'close')))
      .all()
    expect(closes).toHaveLength(2)
    expect(closes.every((a) => a.userId === 'user-accountant')).toBe(true)

    expect(() => staff.unlockMonth(owner, 2026, 9, ' ')).toThrow(/VALIDATION/)
    expect(() => staff.unlockMonth(manager, 2026, 9, 'avans eksik')).toThrow(/PERMISSION_DENIED/)
    expect(staff.unlockMonth(owner, 2026, 9, 'avans eksik')).toEqual({ unlocked: 2 })
    const reopen = handle.db.select().from(auditLog).where(eq(auditLog.action, 'reopen')).all()
    expect(reopen.map((a) => a.reason)).toEqual(['avans eksik', 'avans eksik'])
    expect(() => staff.unlockMonth(owner, 2026, 9, 'yine')).toThrow(/salaryPeriodNotLocked/)
  })
})

describe('izin günleri, son ay, hesap bağlantısı', () => {
  it('birkaç günlük izin tek seferde yazılır; bir gün doluysa hiçbiri yazılmaz', async () => {
    const { staff, kenan } = await setup()
    staff.addLeave(manager, { employeeId: kenan.id, date: '2026-10-07', kind: 'rest_day' })
    expect(() =>
      staff.addLeaveDays(manager, { employeeId: kenan.id, from: '2026-10-05', days: 3, kind: 'annual' })
    ).toThrow(/leaveExists/)
    expect(staff.leaveBetween(manager, { from: '2026-10-01', to: '2026-10-31' })).toHaveLength(1)
    const rows = staff.addLeaveDays(manager, {
      employeeId: kenan.id,
      from: '2026-10-08',
      days: 3,
      kind: 'sick'
    })
    expect(rows.map((r) => r.date)).toEqual(['2026-10-08', '2026-10-09', '2026-10-10'])
    expect(
      staff.leaveBetween(accountant, { from: '2026-10-01', to: '2026-10-09' }).map((r) => r.kind)
    ).toEqual(['rest_day', 'sick', 'sick'])
    expect(() => staff.leaveBetween(reception, { from: '2026-10-01', to: '2026-10-31' })).toThrow(
      /PERMISSION_DENIED/
    )
    expect(() =>
      staff.addLeaveDays(reception, { employeeId: kenan.id, from: '2026-11-01', days: 1, kind: 'sick' })
    ).toThrow(/PERMISSION_DENIED/)
  })

  it('15 Ekim’de ayrılan çalışanın son ayı gün payıyla hesaplanır; sonraki ayın tablosunda yoktur', async () => {
    const { staff, kenan } = await setup()
    staff.updateEmployee(owner, kenan.id, { endDate: '2026-10-15', active: false })
    const oct = staff.salaryPeriod(accountant, { employeeId: kenan.id, year: 2026, month: 10 })
    // 30.000 ÷ 30 × 15 = 15.000; rest days 4 × 15/31 → 1, unused → paid 1.000.
    expect(oct).toMatchObject({
      employedDays: 15,
      salaryDue: 1_500_000,
      leaveEntitled: 1,
      leavePayout: 100_000
    })
    expect(oct.net).toBe(1_600_000)
    expect(staff.salaryTable(accountant, 2026, 11).rows).toEqual([])
  })

  it('kart bağlı hesabın adını ve rolünü gösterir; bağlanabilecek hesaplar yalnız boştakiler', async () => {
    const { staff, kenan, deps } = await setup()
    const receptionRole = handle.db.select().from(roles).where(eq(roles.code, 'reception')).get()!
    const usersService = createUsersService(deps)
    const selin = usersService.createUser(owner, {
      username: 'selin',
      displayName: 'Selin Deneme',
      roleId: receptionRole.id,
      password: 'gecici-sifre-1'
    })
    expect(staff.linkableUsers(owner).map((u) => u.displayName)).toContain('Selin Deneme')
    expect(() => staff.linkableUsers(manager)).toThrow(/PERMISSION_DENIED/)
    const linked = staff.updateEmployee(owner, kenan.id, { userId: selin.id })
    expect(linked.account).toMatchObject({ displayName: 'Selin Deneme', roleCode: 'reception', active: true })
    expect(staff.linkableUsers(accountant).map((u) => u.id)).not.toContain(selin.id)
  })
})
