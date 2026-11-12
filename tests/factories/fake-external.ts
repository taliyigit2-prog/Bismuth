// A local stand-in for the internet (Faz 11 tests): answers `<origin>/<host>/<path>` the way the real sources
// answer `https://<host>/<path>` (src/main/network/http.ts sends every request there when an origin is given).
// Response bodies follow the shapes measured live in Faz 0 (docs/plan/04-arastirma/canli-dogrulama.md); the
// numbers are the Faz 0 Truncgil sample (USD 49,126 · EUR 55,277 · GBP 64,868 · RUB 0,5882).
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

export interface FakeResponse {
  status?: number
  body?: string | object
  headers?: Record<string, string>
}

export type FakeRoute =
  FakeResponse | ((req: { query: URLSearchParams; headers: IncomingHttpHeaders }) => FakeResponse)

export interface FakeExternal {
  origin: string
  /** Every request as "host/path?query", in order. */
  hits: string[]
  headers: IncomingHttpHeaders[]
  /** Replace (or add) the answer of "host/path". */
  set(path: string, route: FakeRoute): void
  close(): Promise<void>
}

export async function startFakeExternal(routes: Record<string, FakeRoute>, port = 0): Promise<FakeExternal> {
  const table = new Map(Object.entries(routes))
  const hits: string[] = []
  const headers: IncomingHttpHeaders[] = []
  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://fake')
    const key = url.pathname.slice(1)
    hits.push(`${key}${url.search}`)
    headers.push(req.headers)
    const route = table.get(key)
    const answer: FakeResponse = !route
      ? { status: 404, body: 'not found' }
      : typeof route === 'function'
        ? route({ query: url.searchParams, headers: req.headers })
        : route
    const body = typeof answer.body === 'string' ? answer.body : JSON.stringify(answer.body ?? '')
    res.writeHead(answer.status ?? 200, { 'content-type': 'application/json', ...answer.headers })
    res.end(answer.status === 304 ? undefined : body)
  })
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve))
  const bound = (server.address() as AddressInfo).port
  return {
    origin: `http://127.0.0.1:${bound}`,
    hits,
    headers,
    set: (path, route) => void table.set(path, route),
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections()
        server.close(() => resolve())
      })
  }
}

// ── Sample answers ──

export const TRUNCGIL_PATH = 'finans.truncgil.com/v4/today.json'
export const FAWAZ_PATH = 'cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/try.min.json'
export const FAWAZ_PAGES_PATH = 'latest.currency-api.pages.dev/v1/currencies/try.min.json'
export const OPEN_ER_PATH = 'open.er-api.com/v6/latest/TRY'
export const EXCHANGERATE_PATH = 'api.exchangerate-api.com/v4/latest/TRY'
export const FRANKFURTER_PATH = 'api.frankfurter.app/latest'
export const TCMB_PATH = 'www.tcmb.gov.tr/kurlar/today.xml'
export const OXR_PATH = 'openexchangerates.org/api/latest.json'
export const MET_PATH = 'api.met.no/weatherapi/locationforecast/2.0/compact'
export const OPEN_METEO_PATH = 'api.open-meteo.com/v1/forecast'
export const GOOGLE_ICS_PATH =
  'calendar.google.com/calendar/ical/tr.turkish%23holiday%40group.v.calendar.google.com/public/basic.ics'
export const nagerPath = (year: number): string => `date.nager.at/api/v3/PublicHolidays/${year}/TR`

/** Truncgil v4: buying/selling around the Faz 0 mids. */
export const truncgil = (shift = 0): object => ({
  Meta_Data: { Minutes_Ago: 1, Current_Date: '2026-10-01T12:01:00', Update_Date: '2026-10-01T12:00:36' },
  USD: {
    Change: 0.12,
    Name: 'Amerikan Doları',
    Buying: 49.1 + shift,
    Type: 'Currency',
    Selling: 49.152 + shift
  },
  EUR: { Change: -0.05, Name: 'Euro', Buying: '55,2500', Type: 'Currency', Selling: '55,3040' },
  GBP: { Change: 0.2, Name: 'İngiliz Sterlini', Buying: 64.84, Type: 'Currency', Selling: 64.896 },
  RUB: { Change: 0, Name: 'Rus Rublesi', Buying: 0.588, Type: 'Currency', Selling: 0.5884 },
  GRA: { Change: 0.4, Name: 'Gram Altın', Buying: 6580.1, Type: 'Gold', Selling: 6584.9 }
})

/** fawazahmed0: units of each currency for one TRY. */
export const fawaz = {
  date: '2026-10-01',
  try: { usd: 1 / 49.028, eur: 1 / 55.484, gbp: 1 / 64.946, rub: 1 / 0.5879 }
}

export const openEr = {
  result: 'success',
  provider: 'https://www.exchangerate-api.com',
  time_last_update_utc: 'Thu, 01 Oct 2026 00:02:31 +0000',
  base_code: 'TRY',
  rates: { TRY: 1, USD: 1 / 49.049, EUR: 1 / 55.59, GBP: 1 / 65.092, RUB: 1 / 0.5874 }
}

export const exchangeRate = {
  base: 'TRY',
  date: '2026-10-01',
  time_last_updated: 1_790_000_000,
  rates: { TRY: 1, USD: 1 / 49.02, EUR: 1 / 55.556, GBP: 1 / 64.935, RUB: 1 / 0.5882 }
}

/** Frankfurter (ECB): no RUB. */
export const frankfurter = {
  amount: 1,
  base: 'TRY',
  date: '2026-10-01',
  rates: { USD: 1 / 49.044, EUR: 1 / 55.402, GBP: 1 / 64.893 }
}

export const oxr = {
  timestamp: 1_790_000_000,
  base: 'USD',
  rates: { USD: 1, TRY: 49.1, EUR: 49.1 / 55.3, GBP: 49.1 / 64.9, RUB: 49.1 / 0.588 }
}

export const TCMB_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Tarih_Date Tarih="01.10.2026" Date="10/01/2026" Bulten_No="2026/185">
  <Currency CrossOrder="0" Kod="USD" CurrencyCode="USD"><Unit>1</Unit><Isim>ABD DOLARI</Isim>
    <ForexBuying>48.9500</ForexBuying><ForexSelling>49.0320</ForexSelling></Currency>
  <Currency CrossOrder="9" Kod="EUR" CurrencyCode="EUR"><Unit>1</Unit><Isim>EURO</Isim>
    <ForexBuying>55.3000</ForexBuying><ForexSelling>55.3940</ForexSelling></Currency>
  <Currency CrossOrder="10" Kod="GBP" CurrencyCode="GBP"><Unit>1</Unit>
    <ForexBuying>64.7700</ForexBuying><ForexSelling>64.8560</ForexSelling></Currency>
  <Currency CrossOrder="15" Kod="RUB" CurrencyCode="RUB"><Unit>1</Unit>
    <ForexBuying>0.5850</ForexBuying><ForexSelling>0.5910</ForexSelling></Currency>
  <Currency CrossOrder="11" Kod="JPY" CurrencyCode="JPY"><Unit>100</Unit>
    <ForexBuying>32.1000</ForexBuying><ForexSelling>32.3000</ForexSelling></Currency>
</Tarih_Date>`

/**
 * MET Locationforecast `compact`: hourly points for 60 hours from `start` (UTC, whole hour), then 6-hourly up to
 * 9 days. Temperatures follow the hour of the day; rain on the second day; symbols named after it.
 */
export function metCompact(start: string, opts: { tempShift?: number } = {}): object {
  const t0 = Date.parse(start)
  const timeseries: object[] = []
  const temp = (ms: number): number => {
    const hour = new Date(ms).getUTCHours() + 3 // İstanbul
    return Math.round((15 + 6 * Math.sin(((hour - 9) / 24) * 2 * Math.PI) + (opts.tempShift ?? 0)) * 10) / 10
  }
  const day = (ms: number): number => Math.floor((ms - t0) / 86_400_000)
  for (let h = 0; h < 60; h++) {
    const ms = t0 + h * 3_600_000
    const wet = day(ms) === 1
    timeseries.push({
      time: new Date(ms).toISOString().replace('.000Z', 'Z'),
      data: {
        instant: { details: { air_temperature: temp(ms), wind_speed: 4.1, relative_humidity: 78.6 } },
        next_1_hours: {
          summary: { symbol_code: wet ? 'lightrain' : 'partlycloudy_day' },
          details: { precipitation_amount: wet ? 0.5 : 0 }
        },
        next_6_hours: {
          summary: { symbol_code: wet ? 'rain' : 'fair_day' },
          details: { precipitation_amount: wet ? 3 : 0 }
        }
      }
    })
  }
  for (let ms = t0 + 60 * 3_600_000; ms < t0 + 9 * 86_400_000; ms += 6 * 3_600_000) {
    const snowy = day(ms) === 4
    timeseries.push({
      time: new Date(ms).toISOString().replace('.000Z', 'Z'),
      data: {
        instant: { details: { air_temperature: temp(ms), wind_speed: 3, relative_humidity: 70 } },
        next_6_hours: {
          summary: { symbol_code: snowy ? 'heavysnowshowersandthunder_day' : 'clearsky_day' },
          details: { precipitation_amount: snowy ? 4.2 : 0 }
        }
      }
    })
  }
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [29.03, 40.99, 20] },
    properties: {
      meta: { updated_at: start, units: { air_temperature: 'celsius', precipitation_amount: 'mm' } },
      timeseries
    }
  }
}

/** Open-Meteo hourly (UTC), 7 days; WMO 61 (light rain) on the second day. */
export function openMeteo(start: string): object {
  const t0 = Date.parse(start)
  const time: string[] = []
  const temperature: number[] = []
  const code: number[] = []
  const rain: number[] = []
  for (let h = 0; h < 7 * 24; h++) {
    const ms = t0 + h * 3_600_000
    time.push(new Date(ms).toISOString().slice(0, 16))
    temperature.push(18)
    const wet = Math.floor(h / 24) === 1
    code.push(wet ? 61 : 1)
    rain.push(wet ? 0.4 : 0)
  }
  return {
    hourly: {
      time,
      temperature_2m: temperature,
      weather_code: code,
      precipitation: rain,
      wind_speed_10m: time.map(() => 3),
      relative_humidity_2m: time.map(() => 60),
      is_day: time.map(() => 1)
    }
  }
}

const vevent = (date: string, summary: string, description = 'Resmi tatil'): string =>
  [
    'BEGIN:VEVENT',
    `DTSTART;VALUE=DATE:${date.replaceAll('-', '')}`,
    `DTEND;VALUE=DATE:${date.replaceAll('-', '')}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    'END:VEVENT'
  ].join('\r\n')

/**
 * Google's Turkish holidays feed, 2026–2027 feasts as Faz 0 saw them: 2026 the same as the rule engine (Kurban with
 * the 25 May bridge day), 2027 Ramazan one day later than the rule engine and still "kesin değil".
 */
export const GOOGLE_ICS = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  "X-WR-CALNAME:Türkiye'deki Tatiller",
  vevent('2026-01-01', 'Yılbaşı'),
  vevent('2026-03-19', 'Ramazan Bayramı Arifesi'),
  vevent('2026-03-20', 'Ramazan Bayramı'),
  vevent('2026-03-21', 'Ramazan Bayramı (2. Gün)'),
  vevent('2026-03-22', 'Ramazan Bayramı (3. Gün)'),
  vevent('2026-05-25', 'Kurban Bayramı Tatili (idari izin)'),
  vevent('2026-05-26', 'Kurban Bayramı Arifesi'),
  vevent('2026-05-27', 'Kurban Bayramı'),
  vevent('2026-05-28', 'Kurban Bayramı (2. Gün)'),
  vevent('2026-05-29', 'Kurban Bayramı (3. Gün)'),
  vevent('2026-05-30', 'Kurban Bayramı (4. Gün)'),
  vevent('2027-03-09', 'Ramazan Bayramı Arifesi', 'Resmi tatil (kesin değil)'),
  vevent('2027-03-10', 'Ramazan Bayramı', 'Resmi tatil (kesin değil)'),
  vevent('2027-03-11', 'Ramazan Bayramı (2. Gün)', 'Resmi tatil (kesin değil)'),
  vevent('2027-03-12', 'Ramazan Bayramı (3. Gün)', 'Resmi tatil (kesin değil)'),
  vevent('2027-02-08', '1 Ramazan'),
  vevent('2027-05-15', 'Kurban Bayramı Arifesi', 'Resmi tatil (kesin değil)'),
  vevent('2027-05-16', 'Kurban Bayramı', 'Resmi tatil (kesin değil)'),
  vevent('2027-05-17', 'Kurban Bayramı (2. Gün)', 'Resmi tatil (kesin değil)'),
  'END:VCALENDAR'
].join('\r\n')

/** Nager.Date 2027 TR (no arife): Ramazan from 10 March. */
export const nager2027 = [
  { date: '2027-01-01', localName: 'Yılbaşı', name: "New Year's Day" },
  { date: '2027-03-10', localName: 'Ramazan Bayramı', name: 'Eid al-Fitr' },
  { date: '2027-03-11', localName: 'Ramazan Bayramı', name: 'Eid al-Fitr' },
  { date: '2027-03-12', localName: 'Ramazan Bayramı', name: 'Eid al-Fitr' },
  { date: '2027-05-16', localName: 'Kurban Bayramı', name: 'Eid al-Adha' },
  { date: '2027-05-17', localName: 'Kurban Bayramı', name: 'Eid al-Adha' }
]
