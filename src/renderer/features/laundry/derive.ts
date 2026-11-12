// Laundry view model (G-171, S-95, K-28, §6.13) over the service's answers: per item type this month's out / in /
// stained and today's balance (out − in, from laundry.outstanding) split into "in the wash" (the latest batch) and
// "missing" (pieces of an earlier delivery that have not come back: loud), plus pieces that came back without
// having been sent (negative balance: a warning). Prices: the one valid on a day and the last rise.
import type { LocalDate } from '@shared/date'
import { isInMonth } from '@shared/domain/local-datetime'
import { priceOn, type LaundryPrice } from '@shared/domain/laundry'
import { money, multiplyRatio, subtract } from '@shared/money'
import type {
  LaundryDeliveryView,
  LaundryOutstandingView,
  LaundryPriceView
} from '@shared/contract/procedures/supply'

export interface ItemType {
  id: string
  name: string
  /** False for a type taken off the list (Ayarlar → Listeler): shown while its pieces are out. */
  active?: boolean
}

export interface TypeRow {
  item: ItemType
  /** The month's pieces sent dirty, pieces back clean and stained pieces among them. */
  out: number
  in: number
  stained: number
  /** Today: the latest batch still in the wash … */
  inTransit: number
  /** … pieces of earlier deliveries that have not come back … */
  missing: number
  /** … and pieces that came back without having been sent (negative balance). */
  extra: number
  /** Oldest outgoing day still open (FIFO) and how many days ago. */
  openSince: LocalDate | null
  daysOpen: number | null
}

export interface YearMonth {
  year: number
  month: number
}

export const shiftMonth = ({ year, month }: YearMonth, by: number): YearMonth => {
  const index = year * 12 + (month - 1) + by
  return { year: Math.floor(index / 12), month: (index % 12) + 1 }
}

export const monthStart = ({ year, month }: YearMonth): LocalDate =>
  `${year}-${String(month).padStart(2, '0')}-01` as LocalDate

/** Last day of the month (the price the month's invoice is checked with). */
export const monthLast = (m: YearMonth): LocalDate => {
  const next = monthStart(shiftMonth(m, 1))
  const d = new Date(`${next}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10) as LocalDate
}

const sumOf = (
  deliveries: readonly LaundryDeliveryView[],
  direction: 'out' | 'in',
  itemTypeId: string,
  pick: 'qty' | 'stainedQty',
  month: YearMonth
): number =>
  deliveries
    .filter(
      (d) =>
        !d.voidedAt && d.direction === direction && isInMonth(d.date as LocalDate, month.year, month.month)
    )
    .reduce((s, d) => s + (d.items.find((x) => x.itemTypeId === itemTypeId)?.[pick] ?? 0), 0)

/**
 * The item types worth a row: the active ones with any movement, balance or price, and a closed one while it has
 * movement or pieces out (K-28: switching a type off never hides what is owed); when nothing was ever recorded,
 * all active types (so the hotel sees its list).
 */
export function typeRows(
  types: readonly ItemType[],
  deliveries: readonly LaundryDeliveryView[],
  outstanding: LaundryOutstandingView,
  prices: readonly LaundryPriceView[],
  month: YearMonth
): TypeRow[] {
  const outs = deliveries
    .filter((d) => !d.voidedAt && d.direction === 'out' && d.date <= outstanding.until)
    .sort((a, b) => a.date.localeCompare(b.date))
  const rows = types.map((item): TypeRow & { used: boolean } => {
    const line = outstanding.lines.find((l) => l.itemTypeId === item.id)
    const pending = line?.pendingQty ?? 0
    const latest = outs.findLast((d) => d.items.some((x) => x.itemTypeId === item.id && x.qty > 0))
    const latestQty = latest?.items.find((x) => x.itemTypeId === item.id)?.qty ?? 0
    // FIFO: an open delivery older than the latest one means pieces from it never came back.
    const missing =
      pending > 0 && latest && line?.oldestOpenSince && line.oldestOpenSince < latest.date
        ? Math.max(0, pending - latestQty)
        : 0
    const row = {
      item,
      out: sumOf(deliveries, 'out', item.id, 'qty', month),
      in: sumOf(deliveries, 'in', item.id, 'qty', month),
      stained: sumOf(deliveries, 'in', item.id, 'stainedQty', month),
      inTransit: Math.max(0, pending) - missing,
      missing,
      extra: pending < 0 ? -pending : 0,
      openSince: line?.oldestOpenSince ?? null,
      daysOpen: line?.daysOpen ?? null
    }
    const moved = !!line?.outQty || !!line?.inQty || pending !== 0 || row.out > 0 || row.in > 0
    const open = item.active !== false
    const used = moved || (open && prices.some((p) => p.itemTypeId === item.id))
    return { ...row, used }
  })
  const used = rows.filter((r) => r.used)
  return (used.length ? used : rows.filter((r) => r.item.active !== false)).map(({ used: _used, ...r }) => r)
}

/** Types a return can be written for: the active ones, and a closed one while pieces of it are still out. */
export function receivable(types: readonly ItemType[], rows: readonly TypeRow[]): ItemType[] {
  return types.filter(
    (ty) => ty.active !== false || rows.some((r) => r.item.id === ty.id && r.inTransit + r.missing > 0)
  )
}

const asDomain = (p: LaundryPriceView): LaundryPrice => ({
  contactId: p.laundryContactId,
  itemTypeId: p.itemTypeId,
  validFrom: p.validFrom as LocalDate,
  unitPriceMinor: p.unitPriceMinor,
  currency: p.currency
})

/** Unit price valid on `day` (the shared rule: latest `validFrom` ≤ day). */
export function priceAt(
  prices: readonly LaundryPriceView[],
  itemTypeId: string,
  day: LocalDate
): number | null {
  const first = prices[0]
  if (!first) return null
  return priceOn(prices.map(asDomain), first.laundryContactId, itemTypeId, day)?.unitPriceMinor ?? null
}

export interface PriceInfo {
  current: LaundryPriceView
  /** The last rise (or cut): % in basis points against the price before it, and the date it started. */
  change: { basisPoints: number; from: LocalDate } | null
}

/** Per item type the price valid today and the last change (K-28: "son zam: +%X, tarih"). */
export function priceInfo(
  prices: readonly LaundryPriceView[],
  itemTypeId: string,
  today: LocalDate
): PriceInfo | null {
  const rows = prices
    .filter((p) => p.itemTypeId === itemTypeId && p.validFrom <= today)
    .sort((a, b) => a.validFrom.localeCompare(b.validFrom) || a.createdAt.localeCompare(b.createdAt))
  const current = rows.at(-1)
  if (!current) return null
  const previous = rows.slice(0, -1).findLast((p) => p.validFrom < current.validFrom)
  if (!previous || previous.unitPriceMinor <= 0 || previous.currency !== current.currency)
    return { current, change: null }
  const diff = subtract(
    money(current.unitPriceMinor, current.currency),
    money(previous.unitPriceMinor, current.currency)
  )
  return {
    current,
    change: {
      basisPoints: multiplyRatio(diff, 10_000, previous.unitPriceMinor).amountMinor,
      from: current.validFrom as LocalDate
    }
  }
}

export const piecesOf = (d: LaundryDeliveryView): number => d.items.reduce((s, i) => s + i.qty, 0)
export const stainedOf = (d: LaundryDeliveryView): number => d.items.reduce((s, i) => s + i.stainedQty, 0)
