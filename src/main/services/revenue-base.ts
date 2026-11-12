// Revenue of a period as one number in one currency (S-36, G-86): the commission base of the salary table. The
// staff report (Faz 10) reads the same function, so the base and the report always show the same figure.
// Room revenue = room-night charges by night date; extras = extra-service charges; own sales = payments the
// employee's account took (refunds subtracted). Voided rows are left out; amounts in another currency are
// turned with the rate frozen on the row (or the one known for the night / its writing); rows without a known rate
// are left out (the reports count them as "kur yok").
import { and, eq, gte, isNull, lt } from 'drizzle-orm'
import type { CommissionBase } from '@shared/contract/staff'
import { money } from '@shared/money'
import { charges, payments } from '../db/schema'
import { baseCurrencyOf, freezeAt } from './currency-service'
import type { Tx } from './kit'

type Reader = Pick<Tx, 'select'>

export interface RevenueBaseQuery {
  base: CommissionBase
  /** [from, to) local days. */
  from: string
  to: string
  currency: string
  /** The employee's user account (own sales); without one own sales are 0. */
  userId?: string | null
}

export function revenueBase(db: Reader, q: RevenueBaseQuery): number {
  const inCurrency = (amountMinor: number, cur: string, at: string, frozenBase: number | null): number => {
    if (cur === q.currency) return amountMinor
    if (frozenBase !== null && baseCurrencyOf(db) === q.currency) return frozenBase
    return freezeAt(db, money(amountMinor, cur), q.currency, at)?.amountBaseMinor ?? 0
  }
  if (q.base === 'own_sales') {
    if (!q.userId) return 0
    return db
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.soldByUserId, q.userId),
          isNull(payments.voidedAt),
          gte(payments.date, q.from),
          lt(payments.date, q.to)
        )
      )
      .all()
      .reduce((acc, p) => {
        const v = inCurrency(p.amountMinor, p.currency, p.createdAt, p.amountBaseMinor)
        return acc + (p.kind === 'refund' ? -v : v)
      }, 0)
  }
  return db
    .select()
    .from(charges)
    .where(
      and(
        eq(charges.kind, q.base === 'extras' ? 'extra' : 'room_night'),
        isNull(charges.voidedAt),
        gte(charges.date, q.from),
        lt(charges.date, q.to)
      )
    )
    .all()
    .reduce((acc, c) => {
      // Frozen when written (0014); else a rate known for the night's day, or for its writing if later (§ reports).
      const nightEnd = `${c.date}T23:59:59.999Z`
      const at = c.createdAt > nightEnd ? c.createdAt : nightEnd
      return acc + inCurrency(c.amountMinor, c.currency, at, c.amountBaseMinor)
    }, 0)
}
