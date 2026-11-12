// Early bug hunt fixes of Faz 8 (P7fix): hiring again after leaving (employment periods), staff money on a closed
// day, salary paid out of the drawer, the manager's correction of worked minutes and the hotel's pay rules as
// seeded rows. Names and amounts are invented.
import { afterEach, describe, expect, it } from 'vitest'
import { and, eq, isNull } from 'drizzle-orm'
import { depsOf, roleCtx, testClock } from '../../../tests/factories/ctx'
import { seededDatabase } from '../../../tests/factories/db'
import type { DatabaseHandle } from '../db/client'
import { expenses, payPolicies } from '../db/schema'
import { createLedgerService } from './ledger-service'
import { createSettingsService } from './settings-service'
import { createStaffService } from './staff-service'

const owner = roleCtx('owner')
const manager = roleCtx('manager')
const accountant = roleCtx('accountant')
let handle: DatabaseHandle
afterEach(() => handle?.close())

async function setup() {
  handle = await seededDatabase()
  const clock = testClock('2026-10-04T09:00:00.000Z')
  const deps = depsOf(handle, clock)
  const staff = createStaffService(deps)
  const ledger = createLedgerService(deps)
  const settings = createSettingsService(handle.db, clock)
  const kenan = staff.createEmployee(owner, {
    firstName: 'Kenan',
    lastName: 'Örnek',
    startDate: '2026-01-01',
    userId: 'u-kenan',
    salary: { monthlyMinor: 3_000_000, currency: 'TRY', validFrom: '2026-01-01' }
  })
  return { clock, deps, staff, ledger, settings, kenan, kenanSelf: roleCtx('employee', 'u-kenan') }
}

describe('yeniden işe alma: çalışma dönemleri (B6)', () => {
  it('31 Mart çıkışlı, 16 Haziran yeniden alınan: Nisan–Mayıs boş, Haziran yarım ay, Ocak–Mart korunur', async () => {
    const { staff, kenan } = await setup()
    staff.updateEmployee(owner, kenan.id, { endDate: '2026-03-31' })
    staff.lockMonth(accountant, 2026, 2)
    const back = staff.rehire(owner, { employeeId: kenan.id, startDate: '2026-06-16' })
    expect(back).toMatchObject({ startDate: '2026-06-16', endDate: null, active: true })
    expect(back.periods).toEqual([
      { startDate: '2026-01-01', endDate: '2026-03-31' },
      { startDate: '2026-06-16', endDate: null }
    ])
    const rows = (month: number) => staff.salaryTable(accountant, 2026, month).rows
    expect(rows(4)).toEqual([])
    expect(rows(5)).toEqual([])
    expect(rows(6)[0]).toMatchObject({ employedDays: 15, salaryDue: 1_500_000 })
    expect(rows(3)[0]).toMatchObject({ employedDays: 31, salaryDue: 3_000_000 })
    expect(rows(2)[0]).toMatchObject({ locked: true })
    // Correcting the start of the current period keeps the old period (and its months).
    staff.updateEmployee(owner, kenan.id, { startDate: '2026-06-17' })
    expect(rows(1)).toHaveLength(1)
    expect(rows(6)[0]?.employedDays).toBe(14)
    expect(() => staff.rehire(owner, { employeeId: kenan.id, startDate: '2026-07-01' })).toThrow(
      /employeeStillEmployed/
    )
    expect(() => staff.rehire(manager, { employeeId: kenan.id, startDate: '2026-07-01' })).toThrow(
      /PERMISSION_DENIED/
    )
  })

  it('yeniden işe alma eski çıkış gününden sonra olmalı', async () => {
    const { staff, kenan } = await setup()
    staff.updateEmployee(owner, kenan.id, { endDate: '2026-03-31' })
    expect(() => staff.rehire(owner, { employeeId: kenan.id, startDate: '2026-03-15' })).toThrow(
      /rehireBeforeEnd/
    )
  })
})

describe('kapalı günde personel parası (B8)', () => {
  it('Sahip gerekçeyle kapalı güne avans yazar ve iptal eder; Muhasebeci yazamaz', async () => {
    const { staff, settings, kenan, deps } = await setup()
    settings.set(owner, { 'businessDay.closingEnabled': true })
    createLedgerService(deps).closeDay(owner, '2026-10-03')
    const input = { employeeId: kenan.id, date: '2026-10-03', kind: 'advance' as const, amountMinor: 100_000 }
    expect(() => staff.addTransaction(accountant, input)).toThrow(/dayClosed/)
    expect(() => staff.addTransaction(owner, input)).toThrow(/dayClosed/)
    const t = staff.addTransaction(owner, { ...input, reason: 'unutulan avans' })
    // The cancel reason is the closed-day reason too (like voiding an expense).
    expect(() => staff.voidTransaction(accountant, t.id, 'yanlış kayıt')).toThrow(/dayClosed/)
    expect(staff.voidTransaction(owner, t.id, 'yanlış kayıt').voidedAt).not.toBeNull()
  })
})

describe('kasadan maaş (B9)', () => {
  it('kasadan ödenen maaş kasadan düşer; ikramiye kasadan "ödenemez"', async () => {
    const { staff, ledger, kenan } = await setup()
    const t = staff.addTransaction(accountant, {
      employeeId: kenan.id,
      date: '2026-10-04',
      kind: 'salary_payment',
      amountMinor: 1_000_000,
      paidFromDrawer: true
    })
    const row = handle.db.select().from(expenses).where(eq(expenses.id, t.expenseId!)).get()
    expect(row).toMatchObject({ paidFromDrawer: true, methodId: null })
    expect(ledger.drawerPanel(owner).drawer).toEqual({ TRY: -1_000_000 })
    expect(() =>
      staff.addTransaction(accountant, {
        employeeId: kenan.id,
        date: '2026-10-04',
        kind: 'bonus',
        amountMinor: 1_000,
        paidFromDrawer: true
      })
    ).toThrow(/validation/)
    // An advance from the drawer still follows the hotel's setting.
    expect(() =>
      staff.addTransaction(accountant, {
        employeeId: kenan.id,
        date: '2026-10-04',
        kind: 'advance',
        amountMinor: 1_000,
        paidFromDrawer: true
      })
    ).toThrow(/drawerAdvanceDisabled/)
  })
})

describe('Müdürün saat düzeltmesi korunur (B22)', () => {
  it('çalışan saatini yeniden girince Müdürün düzelttiği dakika ezilmez; Müdür yeni saat girerse yeniden hesaplanır', async () => {
    const { staff, kenan, kenanSelf } = await setup()
    staff.recordWork(kenanSelf, { date: '2026-10-03', startTime: '21:00', endTime: '09:00' })
    staff.recordWork(manager, { employeeId: kenan.id, date: '2026-10-03', minutesWorked: 600 })
    const again = staff.recordWork(kenanSelf, { date: '2026-10-03', startTime: '21:00', endTime: '09:00' })
    expect(again.minutesWorked).toBe(600)
    const byManager = staff.recordWork(manager, {
      employeeId: kenan.id,
      date: '2026-10-03',
      startTime: '21:00',
      endTime: '08:00'
    })
    expect(byManager.minutesWorked).toBe(660)
  })
})

describe('ödeme kuralları otelin ayar satırlarıdır (B29)', () => {
  it('ilk açılışta pay_policies otel satırları tohumlanır; kural değeri satırdan okunur', async () => {
    const { staff } = await setup()
    const rows = handle.db
      .select()
      .from(payPolicies)
      .where(and(eq(payPolicies.scope, 'hotel'), isNull(payPolicies.employeeId)))
      .all()
    const byKey = Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.valueJson) as unknown]))
    expect(byKey).toMatchObject({
      leaveDaysPerMonth: 4,
      dailyDivisor: 30,
      overtimeMode: 'none',
      holidayMultiplier: '2'
    })
    expect(staff.getPolicy(owner).hotel).toMatchObject({ leaveDaysPerMonth: 4, dailyDivisor: 30 })
  })
})
