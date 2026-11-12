// Pure helpers of the history list: price runs ("3 × ₺2.800") and upcoming vs. past stays.
import { localDateOf, type LocalDate } from '@shared/date'
import type { HistoryStayDto } from '@shared/contract/procedures/guests'

/** Consecutive nights at the same price, for a short "3 × ₺2.800" line. */
export function priceRuns(
  nights: HistoryStayDto['nights']
): { priceMinor: number; currency: string; count: number }[] {
  const runs: { priceMinor: number; currency: string; count: number }[] = []
  for (const n of nights) {
    const last = runs.at(-1)
    if (last && last.priceMinor === n.priceMinor && last.currency === n.currency) last.count += 1
    else runs.push({ priceMinor: n.priceMinor, currency: n.currency, count: 1 })
  }
  return runs
}

const UPCOMING = new Set(['tentative', 'confirmed'])

/** Stays still to come (planned, not started) and the rest, newest first. */
export function splitStays(
  stays: readonly HistoryStayDto[],
  today: LocalDate = localDateOf(new Date())
): { upcoming: HistoryStayDto[]; past: HistoryStayDto[] } {
  const upcoming = stays
    .filter((s) => UPCOMING.has(s.status) && s.checkIn > today)
    .sort((a, b) => a.checkIn.localeCompare(b.checkIn))
  const ids = new Set(upcoming.map((s) => s.reservationId))
  return { upcoming, past: stays.filter((s) => !ids.has(s.reservationId)) }
}
