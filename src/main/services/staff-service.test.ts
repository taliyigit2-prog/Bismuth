import { afterEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { depsOf, roleCtx, testClock } from '../../../tests/factories/ctx'
import { seededDatabase } from '../../../tests/factories/db'
import type { DatabaseHandle } from '../db/client'
import { expenses, roomTypes, salesChannels } from '../db/schema'
import { createLedgerService } from './ledger-service'
import { createPaymentsService } from './payments-service'
import { createReservationsService } from './reservations-service'
import { createRoomsService } from './rooms-service'
import { createSettingsService } from './settings-service'
import { createStaffService } from './staff-service'

const owner = roleCtx('owner')
const manager = roleCtx('manager')
const accountant = roleCtx('accountant')
const reception = roleCtx('reception')
let handle: DatabaseHandle
afterEach(() => handle?.close())

async function setup() {
  handle = await seededDatabase()
  const clock = testClock('2026-09-01T09:00:00.000Z')
  const deps = depsOf(handle, clock)
  const staff = createStaffService(deps)
  const settings = createSettingsService(handle.db, clock)
  const deniz = staff.createEmployee(owner, {
    firstName: 'Deniz',
    lastName: 'Örnek',
    position: 'Resepsiyon',
    startDate: '2026-01-01',
    userId: 'u-deniz',
    salary: { monthlyMinor: 4_000_000, currency: 'TRY' }
  })
  const denizSelf = roleCtx('employee', 'u-deniz')
  return { clock, deps, staff, settings, deniz, denizSelf }
}

describe('maaş tablosu servis üzerinden (§6.6, Excel örnekleri)', () => {
  it('Eylül: 40.000 maaş, 12.500 kasadan avans, 4 hak / 1 kullanılan izin → net 31.500; avans gün defterinde gider', async () => {
    const { staff, settings, deniz, deps } = await setup()
    settings.set(owner, { 'staff.advanceFromDrawer': true })
    staff.addLeave(manager, { employeeId: deniz.id, date: '2026-09-10', kind: 'rest_day' })
    const advance = staff.addTransaction(accountant, {
      employeeId: deniz.id,
      date: '2026-09-05',
      kind: 'advance',
      amountMinor: 1_250_000,
      paidFromDrawer: true
    })
    const september = staff.salaryPeriod(owner, { employeeId: deniz.id, year: 2026, month: 9 })
    expect(september).toMatchObject({
      monthly: 4_000_000,
      advances: 1_250_000,
      leaveEntitled: 4,
      leaveUsed: 1,
      leaveLeft: 3,
      leavePayout: 400_000,
      net: 3_150_000,
      remaining: 3_150_000,
      locked: false
    })
    const expense = handle.db.select().from(expenses).where(eq(expenses.id, advance.expenseId!)).get()!
    expect(expense).toMatchObject({
      kind: 'staff',
      description: 'Deniz Örnek',
      paidFromDrawer: true,
      amountMinor: 1_250_000,
      employeeId: deniz.id,
      staffTxnId: advance.id
    })
    const day = createLedgerService(deps).getDay(reception, '2026-09-05')
    expect(day.expenses.map((e) => [e.kind, e.amountMinor])).toEqual([['staff', 1_250_000]])

    staff.addTransaction(accountant, {
      employeeId: deniz.id,
      date: '2026-09-30',
      kind: 'salary_payment',
      amountMinor: 3_150_000,
      methodId: null
    })
    expect(staff.salaryPeriod(owner, { employeeId: deniz.id, year: 2026, month: 9 })).toMatchObject({
      paid: 3_150_000,
      remaining: 0
    })
  })

  it('kasa tesliminde kapatılmış avans iptal edilemez; teslim geri alınınca edilir', async () => {
    const { staff, settings, deniz, deps } = await setup()
    settings.set(owner, { 'staff.advanceFromDrawer': true })
    const advance = staff.addTransaction(accountant, {
      employeeId: deniz.id,
      date: '2026-09-05',
      kind: 'advance',
      amountMinor: 100_000,
      paidFromDrawer: true
    })
    const pay = createPaymentsService(deps)
    const h = pay.handover(owner, { upToDate: '2026-09-05' })
    expect(h.expenses).toBe(1)
    expect(() => staff.voidTransaction(owner, advance.id, 'yanlış kayıt')).toThrow(/errors.expenseSettled/)
    pay.revertHandover(owner, h.id, 'yanlış sayım')
    expect(staff.voidTransaction(owner, advance.id, 'yanlış kayıt').voidedAt).not.toBeNull()
  })

  it('yanlış girilen izin gerekçeyle iptal edilir, hak geri gelir; kilitli ayda iptal edilemez', async () => {
    const { staff, deniz } = await setup()
    const month = () => staff.salaryPeriod(owner, { employeeId: deniz.id, year: 2026, month: 9 })
    const leave = staff.addLeave(manager, { employeeId: deniz.id, date: '2026-09-10', kind: 'rest_day' })
    expect(month().leaveUsed).toBe(1)
    expect(() => staff.voidLeave(manager, leave.id, '')).toThrow(/VALIDATION/)
    expect(() => staff.voidLeave(reception, leave.id, 'yanlış gün')).toThrow(/PERMISSION_DENIED/)
    expect(staff.voidLeave(manager, leave.id, 'yanlış gün').voidedAt).not.toBeNull()
    expect(month().leaveUsed).toBe(0)
    expect(() => staff.voidLeave(manager, leave.id, 'tekrar')).toThrow(/alreadyCancelled/)
    const other = staff.addLeave(manager, { employeeId: deniz.id, date: '2026-09-11', kind: 'rest_day' })
    staff.lockPeriod(accountant, { employeeId: deniz.id, year: 2026, month: 9 })
    expect(() => staff.voidLeave(manager, other.id, 'kilitli ay')).toThrow(/salaryPeriodLocked/)
  })

  it('kasadan avans ayarı kapalıyken reddedilir; maaş biriminden farklı para birimi reddedilir', async () => {
    const { staff, deniz } = await setup()
    const base = { employeeId: deniz.id, date: '2026-09-05', kind: 'advance' as const, amountMinor: 100 }
    expect(() => staff.addTransaction(owner, { ...base, paidFromDrawer: true })).toThrow(
      /errors.drawerAdvanceDisabled/
    )
    expect(() => staff.addTransaction(owner, { ...base, currency: 'EUR' })).toThrow(/errors.currencyMismatch/)
    const bonus = staff.addTransaction(owner, { ...base, kind: 'bonus' })
    expect(bonus.expenseId).toBeNull()
  })

  it('ay kilitlenince anlık görüntü döner ve o aya kayıt eklenemez; kilit açılınca eklenir', async () => {
    const { staff, deniz } = await setup()
    const locked = staff.lockPeriod(accountant, { employeeId: deniz.id, year: 2026, month: 9 })
    expect(locked.lockedBy).toBe('user-accountant')
    expect(() => staff.lockPeriod(owner, { employeeId: deniz.id, year: 2026, month: 9 })).toThrow(
      /errors.salaryPeriodLocked/
    )
    expect(() =>
      staff.addLeave(owner, { employeeId: deniz.id, date: '2026-09-11', kind: 'rest_day' })
    ).toThrow(/errors.salaryPeriodLocked/)
    expect(() =>
      staff.addTransaction(owner, { employeeId: deniz.id, date: '2026-09-11', kind: 'bonus', amountMinor: 1 })
    ).toThrow(/errors.salaryPeriodLocked/)
    // A raise written after the lock does not change the paid-out month.
    staff.addSalary(owner, {
      employeeId: deniz.id,
      validFrom: '2026-09-01',
      monthlyMinor: 5_000_000,
      currency: 'TRY'
    })
    expect(staff.salaryPeriod(owner, { employeeId: deniz.id, year: 2026, month: 9 })).toMatchObject({
      locked: true,
      monthly: 4_000_000
    })
    staff.unlockPeriod(owner, { employeeId: deniz.id, year: 2026, month: 9 }, 'avans eksik girilmiş')
    expect(staff.salaryPeriod(owner, { employeeId: deniz.id, year: 2026, month: 9 })).toMatchObject({
      locked: false,
      monthly: 5_000_000
    })
    expect(() => staff.unlockPeriod(owner, { employeeId: deniz.id, year: 2026, month: 9 }, 'tekrar')).toThrow(
      /errors.salaryPeriodNotLocked/
    )
    expect(staff.addLeave(owner, { employeeId: deniz.id, date: '2026-09-11', kind: 'rest_day' }).kind).toBe(
      'rest_day'
    )
  })

  it('iptal edilen avans gideriyle birlikte iptal olur ve nete girmez', async () => {
    const { staff, deniz } = await setup()
    const a = staff.addTransaction(owner, {
      employeeId: deniz.id,
      date: '2026-09-05',
      kind: 'advance',
      amountMinor: 500_000
    })
    staff.voidTransaction(owner, a.id, 'yanlış kişi')
    expect(handle.db.select().from(expenses).where(eq(expenses.id, a.expenseId!)).get()?.voidReason).toBe(
      'yanlış kişi'
    )
    expect(staff.salaryPeriod(owner, { employeeId: deniz.id, year: 2026, month: 9 }).advances).toBe(0)
    expect(() => staff.voidTransaction(owner, a.id, 'yine')).toThrow(/errors.alreadyCancelled/)
  })
})

describe('mesai ve bayram çalışması (S-34, S-35, S-39, K-38)', () => {
  it('çalışan kendi geliş/çıkışını girer; gece yarısını aşan vardiya 12 saat sayılır; ek mesaiyi yalnız müdür girer', async () => {
    const { clock, staff, deniz, denizSelf } = await setup()
    // QA2a: one's own hours go on today or a recent day, so the night shift is written the next morning.
    clock.set('2026-09-03T09:00:00.000Z')
    const night = staff.recordWork(denizSelf, { date: '2026-09-02', startTime: '21:00', endTime: '09:00' })
    expect(night).toMatchObject({ employeeId: deniz.id, minutesWorked: 720, overtimeMinutes: 0 })
    expect(() => staff.recordWork(denizSelf, { date: '2026-09-02', overtimeMinutes: 120 })).toThrow(
      /PERMISSION_DENIED/
    )
    const corrected = staff.recordWork(manager, {
      employeeId: deniz.id,
      date: '2026-09-02',
      overtimeMinutes: 120
    })
    expect(corrected).toMatchObject({
      id: night.id,
      minutesWorked: 720,
      overtimeMinutes: 120,
      startTime: '21:00'
    })
    // overtime_mode = none (Pandora): overtime hours pay nothing.
    expect(staff.salaryPeriod(owner, { employeeId: deniz.id, year: 2026, month: 9 }).overtimePay).toBe(0)
    expect(staff.listWork(denizSelf, { from: '2026-09-01', to: '2026-09-30' })).toHaveLength(1)
    expect(() =>
      staff.recordWork(roleCtx('housekeeping', 'u-other'), {
        employeeId: deniz.id,
        date: '2026-09-03',
        startTime: '09:00',
        endTime: '17:00'
      })
    ).toThrow(/PERMISSION_DENIED/)
  })

  it('çarpanlı mesaide 2 saat × (40.000 ÷ 225 × 1,5) = 533,33 TL', async () => {
    const { staff, deniz } = await setup()
    staff.setPolicy(manager, { values: { overtimeMode: 'multiplier' } })
    staff.recordWork(manager, { employeeId: deniz.id, date: '2026-09-02', overtimeMinutes: 120 })
    expect(staff.salaryPeriod(owner, { employeeId: deniz.id, year: 2026, month: 9 }).overtimePay).toBe(53_333)
  })

  it('29 Ekim’de çalışılan 8 saat bayram farkı alır (2×: 8 × 40.000 ÷ 225)', async () => {
    const { clock, staff, deniz, denizSelf } = await setup()
    // QA2a: one's own hours are written on the day or a few days after.
    clock.set('2026-10-30T18:00:00.000Z')
    staff.recordWork(denizSelf, { date: '2026-10-29', startTime: '09:00', endTime: '17:00' })
    staff.recordWork(denizSelf, { date: '2026-10-30', startTime: '09:00', endTime: '17:00' })
    clock.set('2026-09-01T09:00:00.000Z')
    expect(staff.salaryPeriod(accountant, { employeeId: deniz.id, year: 2026, month: 10 })).toMatchObject({
      holidayDays: 1,
      holidayMinutes: 480,
      holidayPay: 142_222
    })
  })
})

describe('ücret kuralları (staff.policy)', () => {
  it('çalışana özel kural otel kuralını ezer; "inherit" geri alır; eksik yüzde reddedilir', async () => {
    const { staff, deniz } = await setup()
    staff.setPolicy(owner, { values: { leaveDaysPerMonth: 4, dailyDivisor: 'days_in_month' } })
    staff.setPolicy(owner, { employeeId: deniz.id, values: { leaveDaysPerMonth: 6 } })
    expect(staff.getPolicy(accountant, deniz.id).values).toMatchObject({
      leaveDaysPerMonth: 6,
      dailyDivisor: 'days_in_month'
    })
    // October has 31 days: 6 unused days × 40.000 ÷ 31.
    expect(staff.salaryPeriod(owner, { employeeId: deniz.id, year: 2026, month: 10 }).leavePayout).toBe(
      774_194
    )
    staff.setPolicy(owner, { employeeId: deniz.id, inherit: ['leaveDaysPerMonth'] })
    expect(staff.getPolicy(owner, deniz.id)).toMatchObject({ values: { leaveDaysPerMonth: 4 }, employee: {} })
    expect(() => staff.setPolicy(owner, { values: { commissionMode: 'pct' } })).toThrow(/errors.validation/)
    expect(staff.getPolicy(owner).values.commissionMode).toBe('none')
    expect(() => staff.setPolicy(accountant, { values: { leaveDaysPerMonth: 5 } })).toThrow(
      /PERMISSION_DENIED/
    )
    expect(() => staff.getPolicy(reception)).toThrow(/PERMISSION_DENIED/)
  })

  it('izin devri açıkken kullanılmayan günler sonraki aya geçer ve ödenmez', async () => {
    const { staff, deniz } = await setup()
    staff.setPolicy(owner, { values: { leaveCarryOver: true } })
    staff.addLeave(owner, { employeeId: deniz.id, date: '2026-09-10', kind: 'rest_day' })
    const sept = staff.salaryPeriod(owner, { employeeId: deniz.id, year: 2026, month: 9 })
    expect(sept.leaveLeft).toBeGreaterThan(3) // Jan–Aug carried in
    expect(sept.leavePayout).toBe(0)
    staff.lockPeriod(owner, { employeeId: deniz.id, year: 2026, month: 9 })
    const oct = staff.salaryPeriod(owner, { employeeId: deniz.id, year: 2026, month: 10 })
    expect(oct.leaveCarriedIn).toBe(sept.leaveLeft)
    expect(oct.leaveLeft).toBe(sept.leaveLeft + 4)
  })

  it('yüzde prim tüm oda gelirinden hesaplanır (S-36)', async () => {
    const { staff, deniz, deps } = await setup()
    const rooms = createRoomsService(deps)
    const standard = handle.db.select().from(roomTypes).where(eq(roomTypes.code, 'standard')).get()!
    const room = rooms.createRoom(owner, {
      number: '501',
      roomTypeId: standard.id,
      beds: 2,
      validFrom: '2026-01-01'
    })
    const channelId = handle.db.select().from(salesChannels).where(eq(salesChannels.code, 'direct')).get()!.id
    createReservationsService(deps).create(owner, {
      guest: { firstName: 'Örnek' },
      channelId,
      stays: [{ roomId: room.id, checkIn: '2026-09-28', checkOut: '2026-10-08', nightlyPriceMinor: 100_000 }]
    })
    staff.setPolicy(owner, { employeeId: deniz.id, values: { commissionMode: 'pct', commissionPct: '2,5' } })
    // October nights 1–7: 7 × 1.000 = 7.000 → 2,5 % = 175.
    expect(staff.salaryPeriod(owner, { employeeId: deniz.id, year: 2026, month: 10 }).commission).toBe(17_500)
  })
})

describe('personel kartı ve paneli: yetkiler', () => {
  it('müdür personeli ve izinleri görür ama maaşları göremez; resepsiyon hiçbirini göremez', async () => {
    const { staff, deniz } = await setup()
    expect(staff.listEmployees(owner)[0]?.currentSalary).toMatchObject({ monthlyMinor: 4_000_000 })
    const seen = staff.listEmployees(manager)[0]!
    expect(seen.fullName).toBe('Deniz Örnek')
    expect(seen).not.toHaveProperty('currentSalary')
    expect(() => staff.listEmployees(reception)).toThrow(/PERMISSION_DENIED/)
    expect(() => staff.salaryPeriod(manager, { employeeId: deniz.id, year: 2026, month: 9 })).toThrow(
      /PERMISSION_DENIED/
    )
    expect(() =>
      staff.createEmployee(manager, { firstName: 'A', lastName: 'B', startDate: '2026-09-01' })
    ).toThrow(/PERMISSION_DENIED/)
    staff.addLeave(manager, { employeeId: deniz.id, date: '2026-09-10', kind: 'rest_day' })
    expect(() =>
      staff.addLeave(manager, { employeeId: deniz.id, date: '2026-09-10', kind: 'annual' })
    ).toThrow(/errors.leaveExists/)
    expect(staff.staffPanel(manager, 2026, 9)).toEqual([
      {
        employeeId: deniz.id,
        fullName: 'Deniz Örnek',
        position: 'Resepsiyon',
        advancesMinor: null,
        currency: null,
        leaveEntitled: 4,
        leaveUsed: 1,
        leaveLeft: 3
      }
    ])
    expect(staff.staffPanel(owner, 2026, 9)[0]).toMatchObject({ advancesMinor: 0, currency: 'TRY' })
  })

  it('çalışan yalnız kendi kartını görür; bir kullanıcı iki karta bağlanamaz', async () => {
    const { staff, deniz, denizSelf } = await setup()
    expect(staff.myEmployee(denizSelf)?.id).toBe(deniz.id)
    expect(staff.getEmployee(denizSelf, deniz.id).fullName).toBe('Deniz Örnek')
    const other = staff.createEmployee(owner, {
      firstName: 'Ayşe',
      lastName: 'Deneme',
      startDate: '2026-02-01'
    })
    expect(() => staff.getEmployee(denizSelf, other.id)).toThrow(/PERMISSION_DENIED/)
    expect(() => staff.updateEmployee(owner, other.id, { userId: 'u-deniz' })).toThrow(
      /errors.userHasEmployee/
    )
    expect(staff.updateEmployee(owner, other.id, { active: false }).active).toBe(false)
    expect(staff.listEmployees(owner).map((e) => e.id)).toEqual([deniz.id])
    expect(staff.listEmployees(owner, { includeInactive: true })).toHaveLength(2)
  })

  it('maaş tablosu ayın çalışanlarını verir; maaşı olmayanları ayrı listeler', async () => {
    const { staff, deniz } = await setup()
    const newcomer = staff.createEmployee(owner, {
      firstName: 'Zeynep',
      lastName: 'Yeni',
      startDate: '2026-09-15'
    })
    staff.createEmployee(owner, {
      firstName: 'Ali',
      lastName: 'Gitti',
      startDate: '2025-01-01',
      endDate: '2026-08-31',
      salary: { monthlyMinor: 3_000_000, currency: 'TRY' }
    })
    const table = staff.salaryTable(accountant, 2026, 9)
    expect(table.rows.map((r) => r.employeeId)).toEqual([deniz.id])
    expect(table.withoutSalary).toEqual([newcomer.id])
    expect(() => staff.salaryPeriod(owner, { employeeId: newcomer.id, year: 2026, month: 9 })).toThrow(
      /errors.noSalary/
    )
    expect(staff.salaryHistory(accountant, deniz.id)).toHaveLength(1)
    expect(staff.listTransactions(accountant, deniz.id, 2026, 9)).toEqual([])
    expect(staff.listLeave(manager, { employeeId: deniz.id, from: '2026-09-01', to: '2026-09-30' })).toEqual(
      []
    )
  })
})
