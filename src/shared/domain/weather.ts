// Weather model and pure rules (G-113, K-13, S-19, S-90; repo-alan-tr-hava.md §3.3). Provider-independent: MET
// Norway's `symbol_code` is the common language (the bundled Yr symbols have one file per code), daily values are
// built here from the hourly series, in the hotel's time zone. No probability of rain (MET does not give it): mm.

/**
 * Every MET Locationforecast symbol (metno/weathericons `weather/legend.csv`, 41 codes). `true` = has day/night/
 * polar-twilight variants (`clearsky_day`, `clearsky_night`, `clearsky_polartwilight`). The two misspellings
 * ("lightssleet…", "lightssnow…") are MET's own codes.
 */
export const MET_SYMBOLS: Readonly<Record<string, boolean>> = {
  clearsky: true,
  fair: true,
  partlycloudy: true,
  cloudy: false,
  lightrainshowers: true,
  rainshowers: true,
  heavyrainshowers: true,
  lightrainshowersandthunder: true,
  rainshowersandthunder: true,
  heavyrainshowersandthunder: true,
  lightsleetshowers: true,
  sleetshowers: true,
  heavysleetshowers: true,
  lightssleetshowersandthunder: true,
  sleetshowersandthunder: true,
  heavysleetshowersandthunder: true,
  lightsnowshowers: true,
  snowshowers: true,
  heavysnowshowers: true,
  lightssnowshowersandthunder: true,
  snowshowersandthunder: true,
  heavysnowshowersandthunder: true,
  lightrain: false,
  rain: false,
  heavyrain: false,
  lightrainandthunder: false,
  rainandthunder: false,
  heavyrainandthunder: false,
  lightsleet: false,
  sleet: false,
  heavysleet: false,
  lightsleetandthunder: false,
  sleetandthunder: false,
  heavysleetandthunder: false,
  lightsnow: false,
  snow: false,
  heavysnow: false,
  lightsnowandthunder: false,
  snowandthunder: false,
  heavysnowandthunder: false,
  fog: false
}

/** Every full `symbol_code` MET can send (83): the base codes with their variants. */
export const MET_SYMBOL_CODES: readonly string[] = Object.entries(MET_SYMBOLS).flatMap(([code, variants]) =>
  variants ? [`${code}_day`, `${code}_night`, `${code}_polartwilight`] : [code]
)

const VARIANT = /_(day|night|polartwilight)$/

/** The base code of a symbol ("rainshowers_night" → "rainshowers"). */
export const symbolBase = (code: string): string => code.replace(VARIANT, '')

/**
 * The bundled icon for a code: the code itself when known, the day variant of a base code, otherwise a neutral
 * cloud. Never undefined, so a new MET code can never break the card.
 */
export function iconFor(code: string | null | undefined): string {
  if (!code) return 'cloudy'
  if (MET_SYMBOL_CODES.includes(code)) return code
  const base = symbolBase(code)
  if (base in MET_SYMBOLS) return MET_SYMBOLS[base] ? `${base}_day` : base
  return 'cloudy'
}

/** Rain, sleet or snow is expected (the "yağmur bekleniyor" line). */
export const isWet = (code: string | null | undefined): boolean => !!code && /rain|sleet|snow/.test(code)

export interface WeatherHour {
  /** ISO-8601 UTC start of the hour. */
  time: string
  tempC: number
  symbol: string | null
  precipMm: number
  windMs: number | null
}

export interface WeatherDay {
  /** Local date (hotel time zone). */
  date: string
  minC: number
  maxC: number
  symbol: string
  precipMm: number
}

export interface WeatherNow {
  time: string
  tempC: number
  symbol: string
  windMs: number | null
  humidity: number | null
}

/** One forecast as the screens use it, whatever the provider. */
export interface WeatherForecast {
  provider: 'metno' | 'openmeteo'
  /** When the provider computed it (MET `updated_at`). */
  updatedAt: string | null
  now: WeatherNow | null
  /** Next hours (at most 48). */
  hours: WeatherHour[]
  /** Today and the next six days. */
  days: WeatherDay[]
}

/** One point of a provider's series before aggregation (MET: instant + next_1/6_hours). */
export interface SeriesPoint {
  time: string
  tempC: number
  windMs: number | null
  humidity: number | null
  /** next_1_hours (hourly part of the series) or next_6_hours. */
  symbol1h: string | null
  precip1h: number | null
  symbol6h: string | null
  precip6h: number | null
}

const dateFormatters = new Map<string, Intl.DateTimeFormat>()

/** Local date of an instant in `timeZone` (falls back to UTC for an unknown zone). */
export function localDateIn(iso: string, timeZone: string): string {
  let fmt = dateFormatters.get(timeZone)
  if (!fmt) {
    try {
      fmt = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    } catch {
      fmt = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'UTC',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      })
    }
    dateFormatters.set(timeZone, fmt)
  }
  return fmt.format(new Date(iso))
}

/** Local hour (0–23) of an instant in `timeZone`. */
export function localHourIn(iso: string, timeZone: string): number {
  try {
    return Number(
      new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' }).format(new Date(iso))
    )
  } catch {
    return new Date(iso).getUTCHours()
  }
}

const round1 = (n: number): number => Math.round(n * 10) / 10

/**
 * Builds the screen model from a series (repo-alan-tr-hava.md §3.3): `now` is the point covering `nowIso`; days
 * take min/max of the temperatures that fall on the local day, the symbol of the point nearest local noon
 * (6-hour symbol first, so a day reads "rain" rather than one dry hour), and the rain of the hourly part plus the
 * 6-hour blocks after it (no double counting).
 */
export function buildForecast(
  provider: WeatherForecast['provider'],
  updatedAt: string | null,
  series: readonly SeriesPoint[],
  nowIso: string,
  timeZone: string
): WeatherForecast {
  const points = [...series].sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0))
  const nowMs = Date.parse(nowIso)
  const current = points.filter((p) => Date.parse(p.time) <= nowMs).at(-1) ?? points[0]
  const usable = current && nowMs - Date.parse(current.time) < 3 * 3_600_000 ? current : null
  const now: WeatherNow | null = usable
    ? {
        time: usable.time,
        tempC: round1(usable.tempC),
        symbol: iconFor(usable.symbol1h ?? usable.symbol6h),
        windMs: usable.windMs,
        humidity: usable.humidity
      }
    : null

  const startHour = nowMs - 3_600_000
  const hours: WeatherHour[] = points
    .filter((p) => Date.parse(p.time) > startHour && p.symbol1h !== null)
    .slice(0, 48)
    .map((p) => ({
      time: p.time,
      tempC: round1(p.tempC),
      symbol: p.symbol1h ? iconFor(p.symbol1h) : null,
      precipMm: round1(p.precip1h ?? 0),
      windMs: p.windMs
    }))

  const today = localDateIn(nowIso, timeZone)
  const byDay = new Map<string, SeriesPoint[]>()
  for (const p of points) {
    const d = localDateIn(p.time, timeZone)
    if (d < today) continue
    const list = byDay.get(d) ?? []
    list.push(p)
    byDay.set(d, list)
  }
  const days: WeatherDay[] = []
  for (const [date, list] of [...byDay.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (days.length === 7) break
    const temps = list.map((p) => p.tempC)
    // Rain: hourly amounts while the series is hourly, then each 6-hour block once.
    let precip = 0
    let coveredUntil = 0
    for (const p of list) {
      const t = Date.parse(p.time)
      if (t < coveredUntil) continue
      if (p.precip1h !== null && p.symbol1h !== null) {
        precip += p.precip1h
        coveredUntil = t + 3_600_000
      } else if (p.precip6h !== null) {
        precip += p.precip6h
        coveredUntil = t + 6 * 3_600_000
      }
    }
    const noon = list.reduce((best, p) =>
      Math.abs(localHourIn(p.time, timeZone) - 12) < Math.abs(localHourIn(best.time, timeZone) - 12)
        ? p
        : best
    )
    // A day with only a night point or two left (the series' end) is not a forecast worth a tile.
    if (date !== today && list.length < 2) continue
    days.push({
      date,
      minC: Math.round(Math.min(...temps)),
      maxC: Math.round(Math.max(...temps)),
      symbol: iconFor(noon.symbol6h ?? noon.symbol1h),
      precipMm: round1(precip)
    })
  }
  return { provider, updatedAt, now, hours, days }
}

/** How old the shown weather is: `null` while fresh (under 3 hours), else the whole hours (the "X saat önce" badge). */
export function weatherAgeHours(fetchedAt: string | null, nowIso: string): number | null {
  if (!fetchedAt) return null
  const hours = Math.floor((Date.parse(nowIso) - Date.parse(fetchedAt)) / 3_600_000)
  return hours >= 3 ? hours : null
}

/**
 * WMO weather code (Open-Meteo, only when the owner switches it on) → the nearest MET symbol, so one icon set and
 * one set of words serve both providers.
 */
export function wmoToSymbol(code: number, isDay: boolean): string {
  const v = (base: string): string => `${base}_${isDay ? 'day' : 'night'}`
  if (code === 0) return v('clearsky')
  if (code === 1) return v('fair')
  if (code === 2) return v('partlycloudy')
  if (code === 3) return 'cloudy'
  if (code === 45 || code === 48) return 'fog'
  if (code >= 51 && code <= 55) return 'lightrain'
  if (code === 56 || code === 57 || code === 66 || code === 67) return 'sleet'
  if (code === 61) return 'lightrain'
  if (code === 63) return 'rain'
  if (code === 65) return 'heavyrain'
  if (code === 71 || code === 77) return 'lightsnow'
  if (code === 73) return 'snow'
  if (code === 75) return 'heavysnow'
  if (code === 80) return v('lightrainshowers')
  if (code === 81) return v('rainshowers')
  if (code === 82) return v('heavyrainshowers')
  if (code === 85) return v('lightsnowshowers')
  if (code === 86) return v('heavysnowshowers')
  if (code === 95) return 'rainandthunder'
  if (code === 96 || code === 99) return 'heavyrainandthunder'
  return 'cloudy'
}
