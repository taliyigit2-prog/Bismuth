// Optional online data (G-02, G-110…G-113, K-04, K-06, K-13): the market-rate source chain and the age rules the
// screens show. Fetching lives only in src/main/network (CLAUDE.md yasak 1); these are names and pure rules.
import { RATE_SCALE } from './fx'

/**
 * Key-less market mid-rate sources in the order Faz 0 measured them (canli-dogrulama.md §1, K-06): Truncgil is
 * live and closest to Google; the others are daily and steady. Frankfurter (ECB) has no RUB.
 */
export const FX_FREE_PROVIDERS = [
  'truncgil',
  'fawaz-jsdelivr',
  'fawaz-pages',
  'open-er-api',
  'exchangerate-api',
  'frankfurter'
] as const

/** Sources that need the hotel's own key (free tiers: OXR 1 000/month hourly, currencyapi 300, currencylayer 100). */
export const FX_KEYED_PROVIDERS = ['openexchangerates', 'currencyapi', 'currencylayer'] as const

export const FX_PROVIDERS = [...FX_FREE_PROVIDERS, ...FX_KEYED_PROVIDERS] as const
export type FxProvider = (typeof FX_PROVIDERS)[number]
export type FxKeyedProvider = (typeof FX_KEYED_PROVIDERS)[number]

export const isKeyedProvider = (p: string): p is FxKeyedProvider =>
  (FX_KEYED_PROVIDERS as readonly string[]).includes(p)

/**
 * Default chain: the live source first, then a keyed source (skipped while it has no key; small free quotas, so
 * only when Truncgil fails), then the daily ones (K-06).
 */
export const DEFAULT_FX_SOURCES: readonly FxProvider[] = [
  'truncgil',
  'openexchangerates',
  'currencyapi',
  'currencylayer',
  'fawaz-jsdelivr',
  'fawaz-pages',
  'open-er-api',
  'exchangerate-api',
  'frankfurter'
]

/** Names shown next to a rate (proper names, the same in every language). */
export const FX_PROVIDER_NAMES: Readonly<Record<FxProvider | 'tcmb', string>> = {
  truncgil: 'Truncgil',
  'fawaz-jsdelivr': 'Currency API (jsDelivr)',
  'fawaz-pages': 'Currency API (Cloudflare)',
  'open-er-api': 'ExchangeRate-API',
  'exchangerate-api': 'ExchangeRate-API v4',
  frankfurter: 'Frankfurter (ECB)',
  openexchangerates: 'Open Exchange Rates',
  currencyapi: 'currencyapi.com',
  currencylayer: 'currencylayer',
  tcmb: 'TCMB'
}

/** The Döviz screen always shows these (G-110); the hotel's accepted currencies are added after them. */
export const FX_SCREEN_CURRENCIES: readonly string[] = ['USD', 'EUR', 'GBP', 'RUB']

/** Currencies the rates are kept for: the four above, then the hotel's own, never the base itself. */
export const fxCurrencies = (accepted: readonly string[], base: string): string[] =>
  [...new Set([...FX_SCREEN_CURRENCIES, ...accepted])].filter((c) => c !== base)

/** A source whose answer no longer matches its schema rests this long (K-06). */
export const SOURCE_REST_MS = 24 * 3_600_000

/** Age of a market rate: under 6 hours fresh, up to 48 hours stale (yellow), older very stale (red). */
export type RateAge = 'fresh' | 'stale' | 'veryStale'

export function rateAge(observedAt: string, nowIso: string): RateAge {
  const hours = (Date.parse(nowIso) - Date.parse(observedAt)) / 3_600_000
  if (hours <= 6) return 'fresh'
  if (hours <= 48) return 'stale'
  return 'veryStale'
}

/** A positive decimal rate as an integer micro rate (input from a provider; never used for money itself). */
export function toMicro(rate: number): number | null {
  if (!Number.isFinite(rate) || rate <= 0) return null
  const micro = Math.round(rate * RATE_SCALE)
  return micro > 0 && Number.isSafeInteger(micro) ? micro : null
}

/**
 * Hotel-currency rates from a provider's table: `perUnit[c]` = pivot units for one `c` (the pivot itself is 1).
 * Returns `base` units for one unit of each wanted currency, × RATE_SCALE, or nothing for a missing one.
 */
export function crossRates(
  pivot: string,
  perUnit: Readonly<Record<string, number>>,
  base: string,
  wanted: readonly string[]
): Record<string, number> {
  const unit = (c: string): number | undefined => (c === pivot ? 1 : perUnit[c])
  const baseUnit = unit(base)
  const out: Record<string, number> = {}
  if (!baseUnit || !Number.isFinite(baseUnit) || baseUnit <= 0) return out
  for (const c of wanted) {
    if (c === base) continue
    const u = unit(c)
    if (u === undefined) continue
    const micro = toMicro(u / baseUnit)
    if (micro !== null) out[c] = micro
  }
  return out
}
