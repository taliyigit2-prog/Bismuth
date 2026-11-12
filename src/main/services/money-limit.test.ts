// One upper limit for every typed amount (QA2a, K-46): MAX_AMOUNT_MINOR (1.000.000.000,00) is refused by the
// services themselves — not only by the forms — and so are zero and negative advances, salary payments and expenses.
import { afterEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { MAX_AMOUNT_MINOR } from '@shared/money'
import { depsOf, roleCtx, testClock } from '../../../tests/factories/ctx'
import { seededDatabase } from '../../../tests/factories/db'
import type { DatabaseHandle } from '../db/client'
import { expenseSections } from '../db/schema'
import { createExpensesService } from './expenses-service'
import { createStaffService } from './staff-service'

const owner = roleCtx('owner')
let handle: DatabaseHandle
afterEach(() => handle?.close())

async function setup() {
  handle = await seededDatabase()
  const deps = depsOf(handle, testClock('2026-10-04T09:00:00.000Z'))
  const staff = createStaffService(deps)
  const exp = createExpensesService(deps)
  const general = handle.db.select().from(expenseSections).where(eq(expenseSections.code, 'general')).get()!
    .id
  const kenan = staff.createEmployee(owner, {
    firstName: 'Kenan',
    lastName: 'Örnek',
    startDate: '2026-01-01',
    salary: { monthlyMinor: 3_000_000, currency: 'TRY', validFrom: '2026-01-01' }
  })
  return { staff, exp, general, kenan }
}

describe('para üst sınırı ve eksi/sıfır tutar (QA2a, K-46)', () => {
  it('avans ve maaş ödemesi: 0, eksi ve sınırın üstü reddedilir; sınırın kendisi yazılır', async () => {
    const { staff, kenan } = await setup()
    const advance = (amountMinor: number, kind: 'advance' | 'salary_payment' = 'advance') =>
      staff.addTransaction(owner, { employeeId: kenan.id, date: '2026-10-04', kind, amountMinor })
    expect(() => advance(0)).toThrow(/VALIDATION/)
    expect(() => advance(-10_000)).toThrow(/VALIDATION/)
    expect(() => advance(-10_000, 'salary_payment')).toThrow(/VALIDATION/)
    expect(() => advance(MAX_AMOUNT_MINOR + 1)).toThrow(/VALIDATION/)
    expect(() => advance(9_999_999_999_900)).toThrow(/VALIDATION/) // 99.999.999.999 TL
    expect(advance(MAX_AMOUNT_MINOR)).toMatchObject({ amountMinor: MAX_AMOUNT_MINOR })
  })

  it('maaş ve gider: sınırın üstü reddedilir', async () => {
    const { staff, exp, general, kenan } = await setup()
    expect(() =>
      staff.addSalary(owner, {
        employeeId: kenan.id,
        validFrom: '2026-11-01',
        monthlyMinor: MAX_AMOUNT_MINOR + 1,
        currency: 'TRY'
      })
    ).toThrow(/VALIDATION/)
    const expense = (amountMinor: number) =>
      exp.createExpense(owner, {
        date: '2026-10-04',
        sectionId: general,
        amountMinor,
        currency: 'TRY',
        description: 'Deneme'
      })
    expect(() => expense(MAX_AMOUNT_MINOR + 1)).toThrow(/VALIDATION/)
    expect(() => expense(-500)).toThrow(/VALIDATION/)
    expect(expense(MAX_AMOUNT_MINOR)).toMatchObject({ amountMinor: MAX_AMOUNT_MINOR })
  })
})
