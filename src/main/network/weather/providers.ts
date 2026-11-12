// Weather adapters (K-13; repo-alan-tr-hava.md §3.1–3.2, §3.6): MET Norway Locationforecast `compact` first —
// key-less, commercial use allowed, it asks for an identifying User-Agent, `Expires`/`If-Modified-Since` and at
// most four decimals; Open-Meteo only when the owner switches it on (its free tier is non-commercial).
import * as z from 'zod'
import { wmoToSymbol, type SeriesPoint } from '@shared/domain/weather'
import type { HttpClient } from '../http'
import { SourceSchemaError } from '../fx/sources'

export interface WeatherAnswer {
  provider: 'metno' | 'openmeteo'
  series: SeriesPoint[]
  updatedAt: string | null
  expiresAt: string | null
  lastModified: string | null
}

export type WeatherFetch =
  | { kind: 'off' }
  | { kind: 'notModified'; expiresAt: string | null }
  | { kind: 'ok'; answer: WeatherAnswer; deprecated: boolean }
  /** `rest`: the provider refused us or changed its shape (24 h pause); otherwise just try later. */
  | { kind: 'failed'; rest: boolean }

const num = z.number().finite()
const summary = z.object({ symbol_code: z.string() }).loose()

const metSchema = z
  .object({
    properties: z
      .object({
        meta: z.object({ updated_at: z.string() }).loose(),
        timeseries: z
          .array(
            z
              .object({
                time: z.string(),
                data: z
                  .object({
                    instant: z
                      .object({
                        details: z
                          .object({
                            air_temperature: num,
                            wind_speed: num.optional(),
                            relative_humidity: num.optional()
                          })
                          .loose()
                      })
                      .loose(),
                    next_1_hours: z
                      .object({
                        summary,
                        details: z.object({ precipitation_amount: num.optional() }).loose().optional()
                      })
                      .loose()
                      .optional(),
                    next_6_hours: z
                      .object({
                        summary,
                        details: z.object({ precipitation_amount: num.optional() }).loose().optional()
                      })
                      .loose()
                      .optional()
                  })
                  .loose()
              })
              .loose()
          )
          .min(1)
      })
      .loose()
  })
  .loose()

const httpDate = (value: string | null): string | null => {
  if (!value) return null
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? null : new Date(ms).toISOString()
}

/** One plain address: no spaces, brackets or quotes (it goes into a header as it is). */
const CONTACT_EMAIL = /^[^\s@<>()",;\\]+@[^\s@<>()",;\\]+\.[^\s@<>()",;\\]+$/

/**
 * MET's terms (K-13): an identifying User-Agent with a way to reach whoever runs the program — the hotel's e-mail
 * when the service layer hands one over (this module reads no settings), else the project's address.
 */
export const metUserAgent = (version: string, contactEmail?: string | null): string => {
  const email = contactEmail?.trim() ?? ''
  return email.length <= 120 && CONTACT_EMAIL.test(email)
    ? `Bismuth/${version} ${email}`
    : `Bismuth/${version} (+https://github.com/taliyigit2-prog/Hotel-CRM)`
}

/** MET wants at most four decimals; two (~1 km) are enough and say less about where the hotel is. */
const TWO_DECIMALS = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: false
})
export const coord = (n: number): string => TWO_DECIMALS.format(n)

export function parseMet(text: string): Omit<WeatherAnswer, 'expiresAt' | 'lastModified'> {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new SourceSchemaError('metno', 'not JSON')
  }
  const r = metSchema.safeParse(raw)
  if (!r.success) throw new SourceSchemaError('metno', r.error.issues[0]?.message ?? 'shape')
  const series: SeriesPoint[] = r.data.properties.timeseries.map((p) => ({
    time: new Date(p.time).toISOString(),
    tempC: p.data.instant.details.air_temperature,
    windMs: p.data.instant.details.wind_speed ?? null,
    humidity: p.data.instant.details.relative_humidity ?? null,
    symbol1h: p.data.next_1_hours?.summary.symbol_code ?? null,
    precip1h: p.data.next_1_hours?.details?.precipitation_amount ?? null,
    symbol6h: p.data.next_6_hours?.summary.symbol_code ?? null,
    precip6h: p.data.next_6_hours?.details?.precipitation_amount ?? null
  }))
  return { provider: 'metno', series, updatedAt: r.data.properties.meta.updated_at }
}

export async function fetchMet(
  http: HttpClient,
  opts: { lat: number; lon: number; userAgent: string; lastModified: string | null }
): Promise<WeatherFetch> {
  const headers: Record<string, string> = { 'User-Agent': opts.userAgent, Accept: 'application/json' }
  if (opts.lastModified) headers['If-Modified-Since'] = opts.lastModified
  const res = await http.get(
    `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${coord(opts.lat)}&lon=${coord(opts.lon)}`,
    headers
  )
  if (!res.ok) return res.reason === 'off' ? { kind: 'off' } : { kind: 'failed', rest: false }
  const { status, headers: h, text } = res.result
  const expiresAt = httpDate(h.get('expires'))
  if (status === 304) return { kind: 'notModified', expiresAt }
  // 403: identification problem; 429: too many requests — both mean "stay away for a while".
  if (status === 403 || status === 429) return { kind: 'failed', rest: true }
  if (status !== 200 && status !== 203) return { kind: 'failed', rest: false }
  try {
    const parsed = parseMet(text)
    return {
      kind: 'ok',
      // 203: the product version is being retired (keep using it, tell the log).
      deprecated: status === 203,
      answer: { ...parsed, expiresAt, lastModified: h.get('last-modified') }
    }
  } catch {
    return { kind: 'failed', rest: true }
  }
}

const openMeteoSchema = z
  .object({
    hourly: z
      .object({
        time: z.array(z.string()).min(1),
        temperature_2m: z.array(num.nullable()),
        weather_code: z.array(num.nullable()),
        precipitation: z.array(num.nullable()),
        wind_speed_10m: z.array(num.nullable()),
        relative_humidity_2m: z.array(num.nullable()),
        is_day: z.array(num.nullable())
      })
      .loose()
  })
  .loose()

export function parseOpenMeteo(text: string): Omit<WeatherAnswer, 'expiresAt' | 'lastModified'> {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new SourceSchemaError('openmeteo', 'not JSON')
  }
  const r = openMeteoSchema.safeParse(raw)
  if (!r.success) throw new SourceSchemaError('openmeteo', r.error.issues[0]?.message ?? 'shape')
  const h = r.data.hourly
  const series: SeriesPoint[] = []
  h.time.forEach((t, i) => {
    const temp = h.temperature_2m[i]
    if (temp === null || temp === undefined) return
    const code = h.weather_code[i]
    const symbol = code === null || code === undefined ? null : wmoToSymbol(code, h.is_day[i] !== 0)
    series.push({
      // timezone=UTC: "2026-10-01T09:00" is UTC.
      time: new Date(`${t}:00Z`).toISOString(),
      tempC: temp,
      windMs: h.wind_speed_10m[i] ?? null,
      humidity: h.relative_humidity_2m[i] ?? null,
      symbol1h: symbol,
      precip1h: h.precipitation[i] ?? 0,
      symbol6h: null,
      precip6h: null
    })
  })
  if (series.length === 0) throw new SourceSchemaError('openmeteo', 'empty')
  return { provider: 'openmeteo', series, updatedAt: null }
}

export async function fetchOpenMeteo(
  http: HttpClient,
  opts: { lat: number; lon: number }
): Promise<WeatherFetch> {
  const res = await http.get(
    `https://api.open-meteo.com/v1/forecast?latitude=${coord(opts.lat)}&longitude=${coord(opts.lon)}` +
      '&hourly=temperature_2m,weather_code,precipitation,wind_speed_10m,relative_humidity_2m,is_day' +
      '&timezone=UTC&forecast_days=8&wind_speed_unit=ms',
    { Accept: 'application/json' }
  )
  if (!res.ok) return res.reason === 'off' ? { kind: 'off' } : { kind: 'failed', rest: false }
  if (res.result.status === 429) return { kind: 'failed', rest: true }
  if (res.result.status !== 200) return { kind: 'failed', rest: false }
  try {
    return {
      kind: 'ok',
      deprecated: false,
      answer: { ...parseOpenMeteo(res.result.text), expiresAt: null, lastModified: null }
    }
  } catch {
    return { kind: 'failed', rest: true }
  }
}
