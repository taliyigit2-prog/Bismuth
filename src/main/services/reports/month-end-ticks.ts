// The owner's "baktım" ticks of the month-end check (K-46 (6); karar denetimi #13): kept per person in
// user_preferences on the main computer (`monthEnd.ticks.YYYY-MM`), so the owner sees the same ticks at the hotel
// and on the Mac. A personal view of the screen, not a record of the hotel: no audit row, like a remembered filter.
import { and, eq } from 'drizzle-orm'
import { MONTH_END_MANUAL_STEPS, type MonthEndManualStep } from '@shared/contract/procedures/reports'
import type { DbOrTx } from '../../db/client'
import { userPreferences, users } from '../../db/schema'
import { ctxKind, type Ctx } from '../context'
import { newId } from '../kit'

export const monthEndTickKey = (year: number, month: number): string =>
  `monthEnd.ticks.${year}-${String(month).padStart(2, '0')}`

const clean = (value: unknown): MonthEndManualStep[] =>
  Array.isArray(value) ? MONTH_END_MANUAL_STEPS.filter((step) => (value as unknown[]).includes(step)) : []

/** Only a signed-in account keeps ticks (the program itself and the wizard have nobody to remember them for). */
function ownerOf(db: DbOrTx, ctx: Ctx): string | null {
  if (!ctx.userId || ctxKind(ctx) !== 'user') return null
  return db.select({ id: users.id }).from(users).where(eq(users.id, ctx.userId)).get() ? ctx.userId : null
}

export function readMonthEndTicks(db: DbOrTx, ctx: Ctx, year: number, month: number): MonthEndManualStep[] {
  const userId = ownerOf(db, ctx)
  if (!userId) return []
  const row = db
    .select({ v: userPreferences.valueJson })
    .from(userPreferences)
    .where(and(eq(userPreferences.userId, userId), eq(userPreferences.key, monthEndTickKey(year, month))))
    .get()
  if (!row) return []
  try {
    return clean(JSON.parse(row.v))
  } catch {
    return []
  }
}

/** Replaces the month's ticks (or adds to them with `merge`); answers what is kept now. */
export function writeMonthEndTicks(
  db: DbOrTx,
  ctx: Ctx,
  input: { year: number; month: number; ticks: readonly MonthEndManualStep[]; merge?: boolean },
  now: Date
): MonthEndManualStep[] {
  const userId = ownerOf(db, ctx)
  if (!userId) return clean(input.ticks)
  const before = readMonthEndTicks(db, ctx, input.year, input.month)
  const next = clean(input.merge ? [...before, ...input.ticks] : input.ticks)
  if (next.length === before.length && next.every((s) => before.includes(s))) return before
  const iso = now.toISOString()
  const valueJson = JSON.stringify(next)
  db.insert(userPreferences)
    .values({
      id: newId(now),
      userId,
      key: monthEndTickKey(input.year, input.month),
      valueJson,
      createdAt: iso,
      updatedAt: iso
    })
    .onConflictDoUpdate({
      target: [userPreferences.userId, userPreferences.key],
      set: { valueJson, updatedAt: iso }
    })
    .run()
  return next
}
