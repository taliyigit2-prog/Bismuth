// Faz 11 shapes: market rates and the hotel rate (G-110…G-112, K-06), weather (G-113, K-13), the yearly holiday
// check (G-16, K-04). Procedures in ./procedures/external.ts.
import * as z from 'zod'
import { FX_KEYED_PROVIDERS, FX_PROVIDERS } from '../domain/external'
import { currencyCode } from './settings'

const iso = z.string().min(10).max(40)
const micro = z.number().int().positive().safe()
const localDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const fxProviderSchema = z.enum(FX_PROVIDERS)
export const fxKeyedProviderSchema = z.enum(FX_KEYED_PROVIDERS)

/** One currency on the Döviz screen: the market mid rate, the hotel rate, and the last 30 days. */
export const fxRateViewSchema = z.object({
  currency: currencyCode,
  /** Newest market mid rate (base units for one unit × 1 000 000). */
  marketMicro: micro.nullable(),
  marketAt: iso.nullable(),
  /** Source of the market rate (provider id) or null. */
  provider: z.string().nullable(),
  /** The hotel's own rate in force, if any. */
  hotelMicro: micro.nullable(),
  /** The market rate at the end of the previous local day (daily change arrow). */
  previousMicro: micro.nullable(),
  /** Last market rate of each of the last 30 local days (oldest first; days without a rate are left out). */
  history: z.array(z.object({ date: localDay, micro })),
  /** TCMB comparison (K-06): the latest bulletin's mid rate. */
  tcmbMicro: micro.nullable(),
  tcmbAt: iso.nullable()
})
export type FxRateView = z.infer<typeof fxRateViewSchema>

export const fxOverviewSchema = z.object({
  base: currencyCode,
  /** Server's "now": the screens compute ages against it. */
  now: iso,
  /** The hotel's day at `now` (its time zone): the rate history's "today". */
  today: localDay,
  networkEnabled: z.boolean(),
  refreshMinutes: z.number().int(),
  /** Last successful market refresh and the last try (null = never). */
  lastSuccessAt: iso.nullable(),
  lastAttemptAt: iso.nullable(),
  rates: z.array(fxRateViewSchema)
})
export type FxOverview = z.infer<typeof fxOverviewSchema>

export const fxRefreshResultSchema = z.object({
  ok: z.boolean(),
  provider: z.string().nullable(),
  /** network off: nothing was asked. */
  skipped: z.boolean()
})

export const fxSetHotelRateSchema = z.object({ currency: currencyCode, rateMicro: micro.nullable() }).strict()

export const fxSourceStatusSchema = z.object({
  id: fxProviderSchema,
  keyed: z.boolean(),
  hasKey: z.boolean(),
  /** ok: last try worked; failed: last try failed (next try goes on); resting: answer did not match, 24 h pause. */
  state: z.enum(['ok', 'failed', 'resting', 'untried', 'needsKey']),
  restingUntil: iso.nullable(),
  lastOkAt: iso.nullable()
})
export type FxSourceStatus = z.infer<typeof fxSourceStatusSchema>

export const fxSetApiKeySchema = z
  .object({ provider: fxKeyedProviderSchema, key: z.string().trim().min(8).max(200).nullable() })
  .strict()

const weatherHourSchema = z.object({
  time: iso,
  tempC: z.number(),
  symbol: z.string().nullable(),
  precipMm: z.number(),
  windMs: z.number().nullable()
})

const weatherDaySchema = z.object({
  date: localDay,
  minC: z.number(),
  maxC: z.number(),
  symbol: z.string(),
  precipMm: z.number()
})

export const weatherForecastSchema = z.object({
  provider: z.enum(['metno', 'openmeteo']),
  updatedAt: iso.nullable(),
  now: z
    .object({
      time: iso,
      tempC: z.number(),
      symbol: z.string(),
      windMs: z.number().nullable(),
      humidity: z.number().nullable()
    })
    .nullable(),
  hours: z.array(weatherHourSchema),
  days: z.array(weatherDaySchema)
})

export const weatherViewSchema = z.object({
  enabled: z.boolean(),
  networkEnabled: z.boolean(),
  now: iso,
  /** Where the forecast is for: the hotel's city from the bundled list, a hand-typed point, or the default. */
  location: z.object({
    lat: z.number(),
    lon: z.number(),
    name: z.string().nullable(),
    from: z.enum(['city', 'manual', 'default'])
  }),
  /** Last forecast (also offline); null = none yet: the card stays hidden. */
  forecast: weatherForecastSchema.nullable(),
  fetchedAt: iso.nullable(),
  /** The forecast belongs to another point (the location changed and no new one arrived yet). */
  otherLocation: z.boolean()
})
export type WeatherView = z.infer<typeof weatherViewSchema>

/** One feast (or a part of it) compared with the online list (K-04). */
export const holidayDiffSchema = z.object({
  groupKey: z.string(),
  title: z.object({ tr: z.string(), en: z.string(), ru: z.string() }),
  /** Dates the calendar had (generated rows) and the online list's dates. */
  before: z.array(localDay),
  after: z.array(localDay),
  /** moved: generated rows moved; confirmed: same dates; userKept: a person's edit kept, list differs. */
  outcome: z.enum(['moved', 'confirmed', 'userKept']),
  /** The online list still marks the dates as not final ("kesin değil"). */
  tentative: z.boolean()
})

export const holidayCheckResultSchema = z.object({
  year: z.number().int(),
  /** google: Google Calendar TR feed; nager: Nager.Date; null: no source answered. */
  source: z.enum(['google', 'nager']).nullable(),
  skipped: z.boolean(),
  checkedAt: iso,
  diffs: z.array(holidayDiffSchema)
})
export type HolidayCheckResult = z.infer<typeof holidayCheckResultSchema>
