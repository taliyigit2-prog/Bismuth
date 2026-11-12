// Exchange-rate table and the "rate frozen at the minute of writing" rule (03-mimari.md §6.5; G-70, G-110…G-112,
// K-06, K-15, S-32). Market rates arrive from src/main/network (Faz 11) through `ingestMarketRates`; the hotel's
// own fixed rate is a setting (`fx.hotelRates`) with a history row per change.
import { and, desc, eq, gte, inArray, lte } from 'drizzle-orm'
import * as z from 'zod'
import { currencyCode } from '@shared/contract/settings'
import type { FxOverview, FxRateView } from '@shared/contract/external'
import {
  convert,
  freezeToBase,
  RATE_PRIORITY,
  RATE_SCALE,
  type FrozenConversion,
  type RateRow,
  type RateSource
} from '@shared/domain/fx'
import { fxCurrencies } from '@shared/domain/external'
import { localDateIn } from '@shared/domain/weather'
import { minorDigits, money, type Money } from '@shared/money'
import { fxRates, settings } from '../db/schema'
import type { Ctx } from './context'
import { permissionDenied } from './errors'
import { inTransaction, newId, parseInput, requirePermission, type ServiceDeps, type Tx } from './kit'
import { readSetting } from './settings-service'
import { writeAudit } from './audit'

export const manualRateSchema = z.object({
  base: currencyCode,
  quote: currencyCode,
  /** Quote units for one base unit × 1 000 000 (1 EUR = 50 TRY → 50_000_000). */
  midRateMicro: z.number().int().positive().safe(),
  /** hotel = the owner's fixed "otel kuru"; manual = a one-off correction. */
  source: z.enum(['hotel', 'manual'])
})
export type ManualRateInput = z.input<typeof manualRateSchema>

export const hotelRateSchema = z
  .object({ currency: currencyCode, rateMicro: z.number().int().positive().safe().nullable() })
  .strict()

export interface IngestedRate {
  currency: string
  /** Base-currency units for one unit × 1 000 000. */
  micro: number
  provider: string
  /** The source's own time of the rate (a daily table's day); absent/null or in the future = observed now. */
  asOf?: string | null
}

type DbLike = Pick<Tx, 'select'>

/** Base currency setting (defaults to TRY). */
export function baseCurrencyOf(db: DbLike): string {
  const row = db.select().from(settings).where(eq(settings.key, 'hotel.baseCurrency')).get()
  if (!row) return 'TRY'
  const parsed = currencyCode.safeParse(JSON.parse(row.valueJson))
  return parsed.success ? parsed.data : 'TRY'
}

/**
 * The candidates of the freeze lookup: per source and direction, the newest rate observed up to `at`. Picking
 * per source keeps a week-old hotel rate in view however many market rates arrived since (priority first).
 */
function ratesFor(db: DbLike, a: string, b: string, at: string): RateRow[] {
  const out: RateRow[] = []
  for (const [base, quote] of [
    [a, b],
    [b, a]
  ] as const)
    for (const source of RATE_PRIORITY) {
      const r = db
        .select()
        .from(fxRates)
        .where(
          and(
            eq(fxRates.base, base),
            eq(fxRates.quote, quote),
            eq(fxRates.source, source),
            lte(fxRates.ts, at)
          )
        )
        .orderBy(desc(fxRates.ts))
        .limit(1)
        .get()
      if (r)
        out.push({
          ts: r.ts,
          base: r.base,
          quote: r.quote,
          midRateMicro: r.midRateMicro,
          source: r.source as RateSource
        })
    }
  return out
}

/** The hotel's rate is used for `a`↔`b` when "misafire bu kurdan söyle" is on and one of them has a rate in force. */
function hotelRateInForce(db: DbLike, a: string, b: string): boolean {
  if (!readSetting(db, 'fx.quoteHotelRate')) return false
  const rates = readSetting(db, 'fx.hotelRates')
  return rates[a] !== undefined || rates[b] !== undefined
}

/**
 * Freeze `m` into `target` (base or folio currency) at `at`; null when no rate is known (entry still allowed).
 * The hotel's own rate wins while it is in force; otherwise the newest market rate or correction (Faz 11).
 */
export function freezeAt(db: DbLike, m: Money, target: string, at: string): FrozenConversion | null {
  return freezeToBase(m, target, ratesFor(db, m.currency, target, at), at, 6, {
    hotel: hotelRateInForce(db, m.currency, target)
  })
}

/**
 * "Şu anın kuru" for a record written now (S-32, G-70): payments and expenses call this when they are saved and
 * again when their amount or currency changes. With no internet the last known rate is used and `stale` is set
 * (older than 6 hours); null only when no rate was ever known for the pair.
 */
export function freezeNow(db: DbLike, m: Money, target: string, now: Date): FrozenConversion | null {
  return freezeAt(db, m, target, now.toISOString())
}

/**
 * A charge's base-currency amount frozen when it is written (K-15, S-32; P10fix #7): the amount itself in the base
 * currency, otherwise converted with the rate known now; null when no rate was ever known (reports convert it
 * later with a rate for its date, or count it as "kur yok").
 */
export function chargeBaseMinor(db: DbLike, amountMinor: number, currency: string, now: Date): number | null {
  const base = baseCurrencyOf(db)
  if (currency === base) return amountMinor
  return freezeNow(db, money(amountMinor, currency), base, now)?.amountBaseMinor ?? null
}

/** A typed rate: base units for one unit of the currency × 1 000 000 (K-43: "1 USD = 34 TL"). */
function manualFrozen(m: Money, base: string, rateMicro: number, at: string): FrozenConversion {
  return {
    amountBaseMinor: convert(m, base, BigInt(rateMicro), BigInt(RATE_SCALE)).amountMinor,
    rateToBaseMicro: rateMicro,
    rateAt: at,
    rateObservedAt: at,
    source: 'manual',
    stale: false
  }
}

export interface ViaBase {
  /** The base value of the amount (null: no rate known and none typed; the record is still kept, G-01). */
  base: FrozenConversion | null
  /** The amount in `target`; null when the target's rate is missing too. */
  targetMinor: number | null
}

/**
 * K-43: an amount's value in the base currency and in another currency (a folio's), always through the base
 * currency (USD → TRY → EUR), so a payment shows the same base amount in the folio, the ledger and the reports.
 * A typed rate counts only when no rate is known: `manualRateMicro` for 1 unit of the amount's currency,
 * `manualTargetRateMicro` for 1 unit of the target, both in base units × 1 000 000.
 */
export function convertViaBase(
  db: DbLike,
  m: Money,
  target: string,
  now: Date,
  manual: { rateMicro?: number | undefined; targetRateMicro?: number | undefined } = {}
): ViaBase {
  const at = now.toISOString()
  const base = baseCurrencyOf(db)
  let toBase = freezeNow(db, m, base, now)
  if (!toBase && manual.rateMicro) toBase = manualFrozen(m, base, manual.rateMicro, at)
  if (target === m.currency) return { base: toBase, targetMinor: m.amountMinor }
  if (target === base) return { base: toBase, targetMinor: toBase?.amountBaseMinor ?? null }
  if (!toBase) return { base: null, targetMinor: null }
  // Base units for one target unit: the target's own rate (inverse of what the folio is written in).
  const unit = money(10 ** minorDigits(target), target)
  const targetRate =
    freezeNow(db, unit, base, now)?.rateToBaseMicro ??
    (manual.targetRateMicro ? manual.targetRateMicro : null)
  if (!targetRate) return { base: toBase, targetMinor: null }
  const inTarget = convert(
    money(toBase.amountBaseMinor, base),
    target,
    BigInt(RATE_SCALE),
    BigInt(targetRate)
  )
  return { base: toBase, targetMinor: inTarget.amountMinor }
}

/** Anyone who sees money in some screen may read the base currency and convert a preview. */
const MONEY_READ_KEYS = ['currency', 'payments', 'expenses', 'ledger', 'cash'] as const

/** Writes `fx.hotelRates` inside the caller's transaction (the setting's own audit row). */
function writeHotelRates(
  tx: Tx,
  ctx: Ctx,
  now: Date,
  next: Partial<Record<string, number>>,
  before: Partial<Record<string, number>>
): void {
  const valueJson = JSON.stringify(next)
  tx.insert(settings)
    .values({ key: 'fx.hotelRates', valueJson, updatedAt: now.toISOString(), updatedBy: ctx.userId })
    .onConflictDoUpdate({
      target: settings.key,
      set: { valueJson, updatedAt: now.toISOString(), updatedBy: ctx.userId }
    })
    .run()
  writeAudit(
    tx,
    ctx,
    { entity: 'settings', entityId: 'fx.hotelRates', action: 'update', before, after: next },
    now
  )
}

const DAY_MS = 86_400_000

export function createCurrencyService(deps: ServiceDeps) {
  const { db } = deps
  const requireMoneyRead = (ctx: Ctx): void => {
    if (!MONEY_READ_KEYS.some((key) => ctx.can(key, 'view'))) throw permissionDenied()
  }

  /** Market rows of one currency against the base since `from`, oldest first. */
  const marketRows = (currency: string, base: string, from: string) =>
    db
      .select()
      .from(fxRates)
      .where(
        and(
          eq(fxRates.base, currency),
          eq(fxRates.quote, base),
          gte(fxRates.ts, from),
          inArray(fxRates.source, ['market_mid', 'user_api'])
        )
      )
      .orderBy(fxRates.ts)
      .all()

  const newestOf = (currency: string, base: string, sources: RateSource[]) =>
    db
      .select()
      .from(fxRates)
      .where(and(eq(fxRates.base, currency), eq(fxRates.quote, base), inArray(fxRates.source, sources)))
      .orderBy(desc(fxRates.ts))
      .limit(1)
      .get()

  return {
    baseCurrency(ctx: Ctx): string {
      requireMoneyRead(ctx)
      return baseCurrencyOf(db)
    },

    /** Records the hotel's fixed rate or a manual correction (market rates arrive through `ingestMarketRates`). */
    recordRate(ctx: Ctx, input: ManualRateInput) {
      requirePermission(ctx, 'currency', 'edit')
      const data = parseInput(manualRateSchema, input)
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const row = {
          id: newId(now),
          ts: now.toISOString(),
          base: data.base,
          quote: data.quote,
          midRateMicro: data.midRateMicro,
          source: data.source,
          isManual: true,
          createdBy: ctx.userId,
          createdAt: now.toISOString()
        }
        tx.insert(fxRates).values(row).run()
        audit({ entity: 'fx_rate', entityId: row.id, action: 'create', after: row })
        // A hotel rate against the base currency is the one in force from now on.
        if (data.source === 'hotel' && data.quote === baseCurrencyOf(tx)) {
          const before = readSetting(tx, 'fx.hotelRates')
          writeHotelRates(tx, ctx, now, { ...before, [data.base]: data.midRateMicro }, before)
        }
        return row
      })
    },

    /**
     * Sets the hotel's own rate for a currency ("1 € = 50 TL"), or ends it (`rateMicro: null`: back to the market
     * rate). Records already written keep their frozen rate.
     */
    setHotelRate(ctx: Ctx, input: z.input<typeof hotelRateSchema>): void {
      requirePermission(ctx, 'currency', 'edit')
      const data = parseInput(hotelRateSchema, input)
      inTransaction(deps, ctx, (tx, audit, now) => {
        const base = baseCurrencyOf(tx)
        const before = readSetting(tx, 'fx.hotelRates')
        const next = { ...before }
        if (data.rateMicro === null) delete next[data.currency]
        else {
          next[data.currency] = data.rateMicro
          const row = {
            id: newId(now),
            ts: now.toISOString(),
            base: data.currency,
            quote: base,
            midRateMicro: data.rateMicro,
            source: 'hotel' as const,
            isManual: true,
            createdBy: ctx.userId,
            createdAt: now.toISOString()
          }
          tx.insert(fxRates).values(row).run()
          audit({ entity: 'fx_rate', entityId: row.id, action: 'create', after: row })
        }
        writeHotelRates(tx, ctx, now, next, before)
      })
    },

    /**
     * Stores the market rates one refresh brought (the program's scheduler or someone's "Şimdi güncelle"): one row
     * per currency, observed now; one audit row for the batch. TCMB rows are the comparison line only.
     */
    ingestMarketRates(ctx: Ctx, rates: readonly IngestedRate[], kind: 'market_mid' | 'user_api' | 'tcmb') {
      requirePermission(ctx, 'currency', 'view')
      if (rates.length === 0) return 0
      return inTransaction(deps, ctx, (tx, audit, now) => {
        const base = baseCurrencyOf(tx)
        const ts = now.toISOString()
        // P14fix #19: a daily source's rate keeps its own date, so its age (and the stale badge) is honest.
        const seen = (r: IngestedRate): string =>
          r.asOf && Date.parse(r.asOf) <= now.getTime() ? new Date(Date.parse(r.asOf)).toISOString() : ts
        for (const r of rates) {
          tx.insert(fxRates)
            .values({
              id: newId(now),
              ts: seen(r),
              base: r.currency,
              quote: base,
              midRateMicro: r.micro,
              source: kind,
              provider: r.provider,
              isManual: false,
              createdBy: null,
              createdAt: ts
            })
            .onConflictDoNothing()
            .run()
        }
        audit({
          entity: 'fx_rate',
          entityId: ts,
          action: 'create',
          after: { kind, ts, rates: rates.map((r) => ({ c: r.currency, m: r.micro, p: r.provider })) }
        })
        return rates.length
      })
    },

    /** Rate history of a pair in [from, to] (G-112). */
    history(ctx: Ctx, base: string, quote: string, from: string, to: string) {
      requirePermission(ctx, 'currency', 'view')
      return db
        .select()
        .from(fxRates)
        .where(
          and(eq(fxRates.base, base), eq(fxRates.quote, quote), gte(fxRates.ts, from), lte(fxRates.ts, to))
        )
        .orderBy(fxRates.ts)
        .all()
    },

    /**
     * The Döviz screen: for each accepted currency the newest market rate (and its source), the hotel rate in force,
     * yesterday's close for the change arrow, 30 days of daily closes and the TCMB comparison.
     */
    overview(
      ctx: Ctx,
      status: { networkEnabled: boolean; lastSuccessAt: string | null; lastAttemptAt: string | null }
    ): FxOverview {
      requirePermission(ctx, 'currency', 'view')
      const now = deps.clock()
      const base = baseCurrencyOf(db)
      const tz = readSetting(db, 'hotel.timezone')
      const hotelRates = readSetting(db, 'fx.hotelRates')
      const currencies = fxCurrencies(readSetting(db, 'hotel.currencies'), base)
      const from = new Date(now.getTime() - 31 * DAY_MS).toISOString()
      const today = localDateIn(now.toISOString(), tz)
      const rates: FxRateView[] = currencies.map((currency) => {
        const rows = marketRows(currency, base, from)
        const daily = new Map<string, number>()
        for (const r of rows) daily.set(localDateIn(r.ts, tz), r.midRateMicro)
        const history = [...daily.entries()].map(([date, micro]) => ({ date, micro })).slice(-30)
        const newest = rows.at(-1) ?? newestOf(currency, base, ['market_mid', 'user_api'])
        const previous = [...daily.entries()].filter(([d]) => d < today).at(-1)?.[1] ?? null
        const tcmb = newestOf(currency, base, ['tcmb'])
        return {
          currency,
          marketMicro: newest?.midRateMicro ?? null,
          marketAt: newest?.ts ?? null,
          provider: newest?.provider ?? null,
          hotelMicro: hotelRates[currency] ?? null,
          previousMicro: previous,
          history,
          tcmbMicro: tcmb?.midRateMicro ?? null,
          tcmbAt: tcmb?.ts ?? null
        }
      })
      return {
        base,
        now: now.toISOString(),
        today,
        networkEnabled: status.networkEnabled,
        refreshMinutes: readSetting(db, 'fx.refreshMinutes'),
        lastSuccessAt: status.lastSuccessAt,
        lastAttemptAt: status.lastAttemptAt,
        rates
      }
    },

    /**
     * Which of `currencies` have no rate to the base currency right now (K-43: the forms show the typed-rate field
     * only for these). A rate once known stays known (the last one is used offline).
     */
    knownRates(ctx: Ctx, currencies: readonly string[]): { base: string; missing: string[] } {
      if (!ctx.can('payments', 'view') && !ctx.can('expenses', 'view')) throw permissionDenied()
      const base = baseCurrencyOf(db)
      const now = deps.clock()
      const missing = [...new Set(currencies)].filter(
        (c) => c !== base && !freezeNow(db, money(10 ** minorDigits(c), c), base, now)
      )
      return { base, missing }
    },

    /** Value of an amount in the base currency right now (preview before saving). */
    preview(ctx: Ctx, amountMinor: number, currency: string): FrozenConversion | null {
      requireMoneyRead(ctx)
      return freezeNow(db, money(amountMinor, currency), baseCurrencyOf(db), deps.clock())
    }
  }
}

export type CurrencyService = ReturnType<typeof createCurrencyService>
