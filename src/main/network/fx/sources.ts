// Market mid-rate adapters (K-06; response shapes from the Faz 0 live check, canli-dogrulama.md §1 and
// prototypes/live-checks/check.mjs). Each one: URL → zod-checked answer → a table "pivot units for one unit of a
// currency". A shape that no longer matches throws SourceSchemaError and rests the source for 24 hours.
import * as z from 'zod'
import type { FxProvider } from '@shared/domain/external'

export interface FxTable {
  /** The currency the table is expressed in (TRY for Truncgil and TCMB, USD for OXR/currencylayer…). */
  pivot: string
  /** Pivot units for one unit of each currency (the pivot itself is implied 1). */
  perUnit: Record<string, number>
  /**
   * When the source says these rates are from (ISO), null for a live source: a daily table is up to a day old and
   * must not look fresh the moment it was downloaded (P14fix #19).
   */
  asOf?: string | null
}

export class SourceSchemaError extends Error {
  constructor(provider: string, detail: string) {
    super(`${provider}: answer does not match (${detail})`)
    this.name = 'SourceSchemaError'
  }
}

export interface FxAdapter {
  id: FxProvider | 'tcmb'
  url(base: string, key: string | null): string
  parse(text: string, base: string): FxTable
}

/** "49,1260", "49.126", "6.580,10" or a number → number (Turkish feeds mix the styles). */
export function decimal(value: string | number): number {
  if (typeof value === 'number') return value
  let s = value.trim().replace(/[%\s]/g, '')
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.')
  else s = s.replace(',', '.')
  return s === '' ? Number.NaN : Number(s)
}

const positive = z.number().positive().finite()
const decimalish = z.union([z.number(), z.string()]).transform(decimal).pipe(positive)

function json(provider: string, text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    throw new SourceSchemaError(provider, 'not JSON')
  }
}

function check<S extends z.ZodType>(provider: string, schema: S, value: unknown): z.output<S> {
  const r = schema.safeParse(value)
  if (!r.success) throw new SourceSchemaError(provider, r.error.issues[0]?.message ?? 'shape')
  return r.data
}

/** A source's own time stamp → ISO (null when absent or unreadable): a day, Unix seconds or a date text. */
export function asOfOf(value: unknown): string | null {
  let ms = Number.NaN
  if (typeof value === 'number') ms = value * 1000
  else if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value))
    ms = Date.parse(`${value}T00:00:00Z`)
  else if (typeof value === 'string') ms = Date.parse(value)
  return Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : null
}

/** Units of each currency for one pivot (`{usd: 0.0204}`) → pivot units for one of each. */
function invert(rates: Record<string, number>, upper = true): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [code, v] of Object.entries(rates)) if (v > 0) out[upper ? code.toUpperCase() : code] = 1 / v
  return out
}

/** Truncgil v4: TR market buying/selling, live (~5 min); the mid is their average. TRY tables only. */
const truncgil: FxAdapter = {
  id: 'truncgil',
  url: () => 'https://finans.truncgil.com/v4/today.json',
  parse(text) {
    const body = check('truncgil', z.record(z.string(), z.unknown()), json('truncgil', text))
    const entry = z.object({ Buying: decimalish, Selling: decimalish }).loose()
    const perUnit: Record<string, number> = {}
    for (const [code, value] of Object.entries(body)) {
      if (!/^[A-Z]{3}$/.test(code)) continue
      const r = entry.safeParse(value)
      if (r.success) perUnit[code] = (r.data.Buying + r.data.Selling) / 2
    }
    if (!perUnit['USD'] && !perUnit['EUR']) throw new SourceSchemaError('truncgil', 'no USD/EUR')
    return { pivot: 'TRY', perUnit }
  }
}

/** fawazahmed0 currency-api (CC0, daily): `{date, <base>: {usd: 0.02…}}`. */
const fawaz = (id: 'fawaz-jsdelivr' | 'fawaz-pages', host: string): FxAdapter => ({
  id,
  url: (base) =>
    host === 'jsdelivr'
      ? `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${base.toLowerCase()}.min.json`
      : `https://latest.currency-api.pages.dev/v1/currencies/${base.toLowerCase()}.min.json`,
  parse(text, base) {
    const key = base.toLowerCase()
    const body = check(
      id,
      z.object({ date: z.string(), [key]: z.record(z.string(), z.number()) }).loose(),
      json(id, text)
    ) as { date: string } & { [k: string]: Record<string, number> }
    return { pivot: base, perUnit: invert(body[key] ?? {}), asOf: asOfOf(body.date) }
  }
})

/** ExchangeRate-API open access (daily, attribution in Hakkında): `{result: "success", rates: {USD: 0.02…}}`. */
const openErApi: FxAdapter = {
  id: 'open-er-api',
  url: (base) => `https://open.er-api.com/v6/latest/${base}`,
  parse(text, base) {
    const body = check(
      'open-er-api',
      z
        .object({
          result: z.literal('success'),
          base_code: z.string(),
          rates: z.record(z.string(), z.number())
        })
        .loose(),
      json('open-er-api', text)
    )
    const stamp = body as { time_last_update_unix?: unknown; time_last_update_utc?: unknown }
    return {
      pivot: body.base_code || base,
      perUnit: invert(body.rates),
      asOf: asOfOf(stamp.time_last_update_unix ?? stamp.time_last_update_utc)
    }
  }
}

/** exchangerate-api.com v4 (daily): `{base, rates: {USD: 0.02…}}`. */
const exchangeRateApi: FxAdapter = {
  id: 'exchangerate-api',
  url: (base) => `https://api.exchangerate-api.com/v4/latest/${base}`,
  parse(text, base) {
    const body = check(
      'exchangerate-api',
      z.object({ base: z.string(), rates: z.record(z.string(), z.number()) }).loose(),
      json('exchangerate-api', text)
    )
    const stamp = body as { time_last_updated?: unknown; date?: unknown }
    return {
      pivot: body.base || base,
      perUnit: invert(body.rates),
      asOf: asOfOf(stamp.time_last_updated ?? stamp.date)
    }
  }
}

/** Frankfurter (ECB reference rates, business days; no RUB): `{base, rates: {USD: 0.02…}}`. */
const frankfurter: FxAdapter = {
  id: 'frankfurter',
  url: (base) => `https://api.frankfurter.app/latest?from=${base}`,
  parse(text, base) {
    const body = check(
      'frankfurter',
      z.object({ base: z.string(), rates: z.record(z.string(), z.number()) }).loose(),
      json('frankfurter', text)
    )
    return {
      pivot: body.base || base,
      perUnit: invert(body.rates),
      asOf: asOfOf((body as { date?: unknown }).date)
    }
  }
}

/** Open Exchange Rates (hotel's key; hourly; USD based): `{base: "USD", rates: {TRY: 49.1}}`. */
const openExchangeRates: FxAdapter = {
  id: 'openexchangerates',
  url: (_base, key) =>
    `https://openexchangerates.org/api/latest.json?app_id=${encodeURIComponent(key ?? '')}`,
  parse(text) {
    const body = check(
      'openexchangerates',
      z.object({ base: z.string(), rates: z.record(z.string(), z.number()) }).loose(),
      json('openexchangerates', text)
    )
    return {
      pivot: body.base,
      perUnit: invert(body.rates),
      asOf: asOfOf((body as { timestamp?: unknown }).timestamp)
    }
  }
}

/** currencyapi.com v3 (hotel's key): `{data: {USD: {code, value}}}` for the requested base. */
const currencyApi: FxAdapter = {
  id: 'currencyapi',
  url: (base, key) =>
    `https://api.currencyapi.com/v3/latest?apikey=${encodeURIComponent(key ?? '')}&base_currency=${base}`,
  parse(text, base) {
    const body = check(
      'currencyapi',
      z.object({ data: z.record(z.string(), z.object({ value: z.number() }).loose()) }).loose(),
      json('currencyapi', text)
    )
    return {
      pivot: base,
      perUnit: invert(Object.fromEntries(Object.entries(body.data).map(([c, v]) => [c, v.value]))),
      asOf: asOfOf((body as { meta?: { last_updated_at?: unknown } }).meta?.last_updated_at)
    }
  }
}

/** currencylayer (hotel's key; USD source): `{success: true, source: "USD", quotes: {USDTRY: 49.1}}`. */
const currencyLayer: FxAdapter = {
  id: 'currencylayer',
  url: (_base, key) => `https://api.currencylayer.com/live?access_key=${encodeURIComponent(key ?? '')}`,
  parse(text) {
    const body = check(
      'currencylayer',
      z
        .object({
          success: z.literal(true),
          source: z.string(),
          quotes: z.record(z.string(), z.number())
        })
        .loose(),
      json('currencylayer', text)
    )
    const rates: Record<string, number> = {}
    for (const [pair, v] of Object.entries(body.quotes))
      if (pair.startsWith(body.source)) rates[pair.slice(body.source.length)] = v
    return {
      pivot: body.source,
      perUnit: invert(rates),
      asOf: asOfOf((body as { timestamp?: unknown }).timestamp)
    }
  }
}

/**
 * TCMB today.xml (official indicative rates, business days 15:30; comparison line only, K-06). Mid = average of
 * ForexBuying and ForexSelling per `Unit`.
 */
export const tcmb: FxAdapter = {
  id: 'tcmb',
  url: () => 'https://www.tcmb.gov.tr/kurlar/today.xml',
  parse(text) {
    if (!/<Tarih_Date[\s>]/.test(text)) throw new SourceSchemaError('tcmb', 'no Tarih_Date')
    const perUnit: Record<string, number> = {}
    for (const block of text.match(/<Currency\b[\s\S]*?<\/Currency>/g) ?? []) {
      const code = /CurrencyCode="([A-Z]{3})"/.exec(block)?.[1]
      const unit = Number(/<Unit>(\d+)<\/Unit>/.exec(block)?.[1] ?? 1)
      const buy = Number(/<ForexBuying>([\d.]+)<\/ForexBuying>/.exec(block)?.[1])
      const sell = Number(/<ForexSelling>([\d.]+)<\/ForexSelling>/.exec(block)?.[1])
      if (code && unit > 0 && buy > 0 && sell > 0) perUnit[code] = (buy + sell) / 2 / unit
    }
    if (!perUnit['USD']) throw new SourceSchemaError('tcmb', 'no USD')
    return { pivot: 'TRY', perUnit }
  }
}

export const FX_ADAPTERS: Readonly<Record<FxProvider, FxAdapter>> = {
  truncgil,
  'fawaz-jsdelivr': fawaz('fawaz-jsdelivr', 'jsdelivr'),
  'fawaz-pages': fawaz('fawaz-pages', 'pages'),
  'open-er-api': openErApi,
  'exchangerate-api': exchangeRateApi,
  frankfurter,
  openexchangerates: openExchangeRates,
  currencyapi: currencyApi,
  currencylayer: currencyLayer
}
