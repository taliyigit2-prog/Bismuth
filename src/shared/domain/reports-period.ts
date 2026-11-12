// Report periods and sellable room-nights (03-mimari.md §6.10; G-104, K-27). A period is [from, to) like a stay;
// months are "YYYY-MM". Sellable nights follow the capacity history day by day and drop live blocks ("satılmaz" and
// "kullanım dışı", G-38): the denominator of occupancy and RevPAR.
import { addDays, diffDays, localDate, weekday, type LocalDate } from '../date'

export interface Period {
  from: LocalDate
  /** Exclusive. */
  to: LocalDate
}

/** Longest report period (ten years of data plus a margin; Faz 16 performance target). */
export const MAX_PERIOD_DAYS = 4020

export const PERIOD_PRESETS = ['thisMonth', 'lastMonth', 'thisYear', 'custom'] as const
export type PeriodPreset = (typeof PERIOD_PRESETS)[number]

export const COMPARE_MODES = ['previous', 'lastYear', 'none'] as const
export type CompareMode = (typeof COMPARE_MODES)[number]

export const monthOf = (d: LocalDate): string => d.slice(0, 7)
export const firstOfMonth = (month: string): LocalDate => localDate(`${month}-01`)

/** "2026-12" → "2027-01". */
export function addMonths(month: string, n: number): string {
  const y = Number(month.slice(0, 4))
  const m = Number(month.slice(5, 7)) - 1 + n
  const year = y + Math.floor(m / 12)
  const mm = ((m % 12) + 12) % 12
  return `${year}-${String(mm + 1).padStart(2, '0')}`
}

export const monthPeriod = (month: string): Period => ({
  from: firstOfMonth(month),
  to: firstOfMonth(addMonths(month, 1))
})

export const yearPeriod = (year: number): Period => ({
  from: localDate(`${year}-01-01`),
  to: localDate(`${year + 1}-01-01`)
})

export const daysIn = (p: Period): number => Math.max(0, diffDays(p.from, p.to))

/** Months the period touches, oldest first. */
export function monthsIn(p: Period): string[] {
  const out: string[] = []
  for (let m = monthOf(p.from); firstOfMonth(m) < p.to; m = addMonths(m, 1)) out.push(m)
  return out
}

/** Whole calendar months: starts on a 1st and ends before a 1st. */
export const isWholeMonths = (p: Period): boolean => p.from.endsWith('-01') && p.to.endsWith('-01')

export function presetPeriod(preset: Exclude<PeriodPreset, 'custom'>, today: LocalDate): Period {
  const month = monthOf(today)
  if (preset === 'thisMonth') return monthPeriod(month)
  if (preset === 'lastMonth') return monthPeriod(addMonths(month, -1))
  return yearPeriod(Number(today.slice(0, 4)))
}

/** The period just before: as many whole months, or as many days. */
export function previousPeriod(p: Period): Period {
  if (isWholeMonths(p)) {
    const n = monthsIn(p).length
    return { from: firstOfMonth(addMonths(monthOf(p.from), -n)), to: p.from }
  }
  return { from: addDays(p.from, -daysIn(p)), to: p.from }
}

/** The same day one year earlier (29 February → 28 February). */
export function lastYearDay(d: LocalDate): LocalDate {
  const y = Number(d.slice(0, 4)) - 1
  const md = d.slice(5)
  return md === '02-29' ? localDate(`${y}-02-28`) : localDate(`${y}-${md}`)
}

export const sameLastYear = (p: Period): Period => ({ from: lastYearDay(p.from), to: lastYearDay(p.to) })

export function comparisonPeriod(p: Period, mode: CompareMode): Period | null {
  if (mode === 'none') return null
  return mode === 'previous' ? previousPeriod(p) : sameLastYear(p)
}

export const overlaps = (a: Period, b: Period): boolean => a.from < b.to && b.from < a.to

export function intersect(a: Period, b: Period): Period | null {
  const from = a.from > b.from ? a.from : b.from
  const to = a.to < b.to ? a.to : b.to
  return from < to ? { from, to } : null
}

// ── Sellable room-nights (K-27 capacity history, G-38 blocks) ───────────────────────────────────────────────────

export interface CapacityChange {
  roomId: string
  validFrom: LocalDate
  active: boolean
  sellable: boolean
  /** Same-day changes: the later one wins. */
  createdAt: string
}

export interface BlockSpan {
  roomId: string
  dateFrom: LocalDate
  /** Exclusive. */
  dateTo: LocalDate
}

export interface RoomCapacity {
  id: string
  /** The room row's own flags: used before its first capacity change and when it has none. */
  active: boolean
  sellable: boolean
}

/** Spans of one room in which it was active and for sale, inside `p`. */
function sellableSpans(room: RoomCapacity, changes: readonly CapacityChange[], p: Period): Period[] {
  const own = changes
    .filter((c) => c.roomId === room.id)
    .sort((a, b) =>
      a.validFrom === b.validFrom ? (a.createdAt < b.createdAt ? -1 : 1) : a.validFrom < b.validFrom ? -1 : 1
    )
  if (!own.length) return room.active && room.sellable ? [p] : []
  const spans: Period[] = []
  for (let i = 0; i < own.length; i++) {
    const c = own[i]!
    const next = own[i + 1]
    // A later change on the same day replaces this one.
    if (next && next.validFrom === c.validFrom) continue
    if (!c.active || !c.sellable) continue
    const span = intersect({ from: c.validFrom, to: next ? next.validFrom : p.to }, p)
    if (span) spans.push(span)
  }
  return spans
}

/**
 * Calls `fn(roomId, day)` for every sellable room-day of `p`: the room active and for sale by its capacity history
 * on that day, and no live block on it. Ten years × twenty rooms is ~73 000 calls.
 */
export function forEachSellableDay(
  rooms: readonly RoomCapacity[],
  changes: readonly CapacityChange[],
  blocks: readonly BlockSpan[],
  p: Period,
  fn: (roomId: string, day: LocalDate) => void
): void {
  for (const room of rooms) {
    const blocked = new Set<LocalDate>()
    for (const b of blocks) {
      if (b.roomId !== room.id) continue
      const span = intersect({ from: b.dateFrom, to: b.dateTo }, p)
      if (!span) continue
      for (let d = span.from; d < span.to; d = addDays(d, 1)) blocked.add(d)
    }
    for (const span of sellableSpans(room, changes, p))
      for (let d = span.from; d < span.to; d = addDays(d, 1)) if (!blocked.has(d)) fn(room.id, d)
  }
}

/** Bucket key of the weekday heat map: month and weekday (0 = Sunday). */
export const heatKey = (d: LocalDate): string => `${monthOf(d)}|${weekday(d)}`
