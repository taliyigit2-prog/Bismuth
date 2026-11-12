// Currency conversion with a rate frozen at the minute a record is written (03-mimari.md §6.5; G-70, G-112,
// K-15, S-32). Rates are integers: `midRateMicro` = QUOTE units for one BASE unit × 1 000 000
// (1 EUR = 49,031234 TRY → base EUR, quote TRY, 49031234). Fetching is Faz 11; here lookups and arithmetic.
import { minorDigits, money, multiplyRatio, type CurrencyCode, type Money } from '../money'

export const RATE_SCALE = 1_000_000

export type RateSource = 'market_mid' | 'user_api' | 'tcmb' | 'manual' | 'hotel'

export interface RateRow {
  /** ISO-8601 instant the rate was observed. */
  ts: string
  base: CurrencyCode
  quote: CurrencyCode
  midRateMicro: number
  source: RateSource
}

interface RateHit {
  rateMicro: bigint
  denomMicro: bigint
  row: RateRow
}

/** Which source wins when several have a rate (fixed order; records written now use `pickRate`). */
export const RATE_PRIORITY: readonly RateSource[] = ['hotel', 'manual', 'market_mid', 'user_api']

/**
 * The rate for base→quote observed at or before `at` (inverse pairs are used when needed): the highest
 * priority source wins, the newest row within that source.
 */
export function rateAt(
  rows: readonly RateRow[],
  from: CurrencyCode,
  to: CurrencyCode,
  at: string,
  sources: readonly RateSource[] = RATE_PRIORITY
): RateHit | null {
  let best: RateHit | null = null
  for (const row of rows) {
    if (row.ts > at || !sources.includes(row.source)) continue
    let candidate: RateHit | null = null
    if (row.base === from && row.quote === to)
      candidate = { rateMicro: BigInt(row.midRateMicro), denomMicro: BigInt(RATE_SCALE), row }
    else if (row.base === to && row.quote === from)
      candidate = { rateMicro: BigInt(RATE_SCALE), denomMicro: BigInt(row.midRateMicro), row }
    if (!candidate) continue
    const better =
      !best ||
      sources.indexOf(row.source) < sources.indexOf(best.row.source) ||
      (row.source === best.row.source && row.ts > best.row.ts)
    if (better) best = candidate
  }
  return best
}

/**
 * Faz 11 rule for a record written now: the hotel's own rate when it is in force for that currency (`hotel`), else
 * the newest of the market and correction rates — a newer market rate replaces an older correction.
 */
export function pickRate(
  rows: readonly RateRow[],
  from: CurrencyCode,
  to: CurrencyCode,
  at: string,
  opts: { hotel: boolean }
): RateHit | null {
  if (opts.hotel) {
    const hotel = rateAt(rows, from, to, at, ['hotel'])
    if (hotel) return hotel
  }
  let best: RateHit | null = null
  for (const source of ['manual', 'market_mid', 'user_api'] as const) {
    const hit = rateAt(rows, from, to, at, [source])
    if (hit && (!best || hit.row.ts > best.row.ts)) best = hit
  }
  return best
}

/** Converts with an exact rational rate, rounding half away from zero in the target's minor units. */
export function convert(m: Money, to: CurrencyCode, rateMicro: bigint, denomMicro: bigint): Money {
  if (m.currency === to) return m
  const scaleUp = 10n ** BigInt(minorDigits(to))
  const scaleDown = 10n ** BigInt(minorDigits(m.currency))
  const converted = multiplyRatio(m, rateMicro * scaleUp, denomMicro * scaleDown)
  return money(converted.amountMinor, to)
}

export interface FrozenConversion {
  amountBaseMinor: number
  /** Rate used, in RATE_SCALE units of base currency per 1 unit of the record currency. */
  rateToBaseMicro: number
  /** The record's write time: the moment the rate was frozen (fx_rate_at). */
  rateAt: string
  /** When the rate used was observed (fx_rate_observed_at); null for the same currency. */
  rateObservedAt: string | null
  source: RateSource | null
  /** The rate row is older than `staleAfterHours` (shown as "kur X saat önceki"). */
  stale: boolean
}

/**
 * Freezes the base-currency value of a record written at `at`. Same currency → rate 1. No rate known →
 * null (the service keeps the record and flags it; offline entry must never be blocked, G-01).
 */
export function freezeToBase(
  m: Money,
  base: CurrencyCode,
  rows: readonly RateRow[],
  at: string,
  staleAfterHours = 6,
  /** Faz 11: pick with `pickRate` (hotel rate only while in force); omitted = fixed RATE_PRIORITY. */
  pick?: { hotel: boolean }
): FrozenConversion | null {
  if (m.currency === base)
    return {
      amountBaseMinor: m.amountMinor,
      rateToBaseMicro: RATE_SCALE,
      rateAt: at,
      rateObservedAt: null,
      source: null,
      stale: false
    }
  const r = pick ? pickRate(rows, m.currency, base, at, pick) : rateAt(rows, m.currency, base, at)
  if (!r) return null
  const converted = convert(m, base, r.rateMicro, r.denomMicro)
  const unit = Number((r.rateMicro * BigInt(RATE_SCALE) + r.denomMicro / 2n) / r.denomMicro)
  const ageHours = (Date.parse(at) - Date.parse(r.row.ts)) / 3_600_000
  return {
    amountBaseMinor: converted.amountMinor,
    rateToBaseMicro: unit,
    rateAt: at,
    rateObservedAt: r.row.ts,
    source: r.row.source,
    stale: ageHours > staleAfterHours
  }
}

/** S-32: a new rate is taken only when the amount or the currency changes; other edits keep the frozen one. */
export const needsNewRate = (
  before: { amountMinor: number; currency: CurrencyCode },
  after: { amountMinor: number; currency: CurrencyCode }
): boolean => before.amountMinor !== after.amountMinor || before.currency !== after.currency
