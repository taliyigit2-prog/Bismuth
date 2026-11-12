import { describe, expect, it } from 'vitest'
import {
  MET_SYMBOL_CODES,
  buildForecast,
  iconFor,
  isWet,
  localDateIn,
  localHourIn,
  symbolBase,
  weatherAgeHours,
  wmoToSymbol,
  type SeriesPoint
} from './weather'

const IST = 'Europe/Istanbul'

/** A MET-like series: hourly points (1-hour symbol and rain) for `hours` hours, then 6-hour blocks. */
function series(startIso: string, hours: number, blocks: number): SeriesPoint[] {
  const start = Date.parse(startIso)
  const out: SeriesPoint[] = []
  for (let h = 0; h < hours; h++)
    out.push({
      time: new Date(start + h * 3_600_000).toISOString().replace('.000Z', 'Z'),
      tempC: 14 + (h % 12),
      windMs: 3.2,
      humidity: 70,
      symbol1h: h < 3 ? 'lightrain' : 'partlycloudy_day',
      precip1h: h < 3 ? 0.4 : 0,
      symbol6h: 'rain',
      precip6h: 2
    })
  const after = start + hours * 3_600_000
  for (let b = 0; b < blocks; b++)
    out.push({
      time: new Date(after + b * 6 * 3_600_000).toISOString().replace('.000Z', 'Z'),
      tempC: 10 + b,
      windMs: null,
      humidity: null,
      symbol1h: null,
      precip1h: null,
      symbol6h: b % 2 ? 'cloudy' : 'fair_day',
      precip6h: b % 2 ? 1.5 : 0
    })
  return out
}

describe('hava durumu simgeleri (MET)', () => {
  it('83 kod: 41 temel kod, değişkenlileri gündüz/gece/kutup alacası ile', () => {
    expect(MET_SYMBOL_CODES).toHaveLength(83)
    expect(MET_SYMBOL_CODES).toContain('clearsky_polartwilight')
    expect(MET_SYMBOL_CODES).toContain('fog')
  })

  it('bilinen kod aynen, değişkenli temel kod gündüz biçimiyle, bilinmeyen ve boş kod bulut olur', () => {
    expect(iconFor('rainshowers_night')).toBe('rainshowers_night')
    expect(iconFor('rainshowers')).toBe('rainshowers_day')
    expect(iconFor('heavyrain_day')).toBe('heavyrain')
    expect(iconFor('volcanicash')).toBe('cloudy')
    expect(iconFor(null)).toBe('cloudy')
    expect(iconFor(undefined)).toBe('cloudy')
    expect(symbolBase('fair_polartwilight')).toBe('fair')
  })

  it('yağmur, karla karışık yağmur ve kar "ıslak" sayılır; sis ve bulut sayılmaz', () => {
    expect(isWet('lightrain')).toBe(true)
    expect(isWet('sleetshowers_day')).toBe(true)
    expect(isWet('heavysnow')).toBe(true)
    expect(isWet('fog')).toBe(false)
    expect(isWet(null)).toBe(false)
  })

  it('WMO kodları en yakın MET simgesine çevrilir; bilinmeyen kod bulut', () => {
    const cases: [number, boolean, string][] = [
      [0, true, 'clearsky_day'],
      [1, false, 'fair_night'],
      [2, true, 'partlycloudy_day'],
      [3, true, 'cloudy'],
      [45, true, 'fog'],
      [48, false, 'fog'],
      [53, true, 'lightrain'],
      [56, true, 'sleet'],
      [67, true, 'sleet'],
      [61, true, 'lightrain'],
      [63, true, 'rain'],
      [65, true, 'heavyrain'],
      [71, true, 'lightsnow'],
      [77, true, 'lightsnow'],
      [73, true, 'snow'],
      [75, true, 'heavysnow'],
      [80, true, 'lightrainshowers_day'],
      [81, false, 'rainshowers_night'],
      [82, true, 'heavyrainshowers_day'],
      [85, true, 'lightsnowshowers_day'],
      [86, false, 'heavysnowshowers_night'],
      [95, true, 'rainandthunder'],
      [96, true, 'heavyrainandthunder'],
      [99, true, 'heavyrainandthunder'],
      [42, true, 'cloudy']
    ]
    for (const [code, day, symbol] of cases) expect(wmoToSymbol(code, day), String(code)).toBe(symbol)
    // Every answer is a symbol the bundled icon set has.
    for (const [code, day] of cases) expect(iconFor(wmoToSymbol(code, day))).toBe(wmoToSymbol(code, day))
  })
})

describe('otelin saat dilimi', () => {
  it('UTC 21:30 İstanbul’da ertesi gün 00:30’dur', () => {
    expect(localDateIn('2026-10-04T21:30:00Z', IST)).toBe('2026-10-05')
    expect(localHourIn('2026-10-04T21:30:00Z', IST)).toBe(0)
  })

  it('bilinmeyen saat dilimi UTC sayılır (kart bozulmaz)', () => {
    expect(localDateIn('2026-10-04T21:30:00Z', 'Mars/Olympus')).toBe('2026-10-04')
    expect(localHourIn('2026-10-04T21:30:00Z', 'Mars/Olympus')).toBe(21)
  })
})

describe('tahmin modeli (repo-alan-tr-hava.md §3.3)', () => {
  const now = '2026-10-04T09:20:00Z'
  const points = series('2026-10-04T09:00:00Z', 48, 24)

  it('şimdi: şu anı kapsayan nokta, 1 saatlik simgesiyle; en çok 48 saatlik liste', () => {
    const f = buildForecast('metno', '2026-10-04T08:00:00Z', points, now, IST)
    expect(f.provider).toBe('metno')
    expect(f.now).toMatchObject({
      time: '2026-10-04T09:00:00Z',
      tempC: 14,
      symbol: 'lightrain',
      humidity: 70
    })
    expect(f.hours).toHaveLength(48)
    expect(f.hours[0]).toMatchObject({ precipMm: 0.4, symbol: 'lightrain' })
    expect(f.hours.every((h) => h.symbol !== null)).toBe(true)
  })

  it('günler: bugün ve sonraki altı gün; yağmur saatlik bölümle 6 saatlik bloklar bir kez toplanır', () => {
    const f = buildForecast('metno', null, points, now, IST)
    expect(f.days).toHaveLength(7)
    expect(f.days[0]!.date).toBe('2026-10-04')
    expect(f.days.map((d) => d.date)).toEqual([
      '2026-10-04',
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
      '2026-10-09',
      '2026-10-10'
    ])
    // Today: three wet hours of 0,4 mm (12:00–14:59 local); the 6-hour totals of those hours are not added again.
    expect(f.days[0]!.precipMm).toBe(1.2)
    for (const d of f.days) expect(d.minC).toBeLessThanOrEqual(d.maxC)
    // A day of 6-hour blocks takes the noon block's 6-hour symbol.
    expect(['cloudy', 'fair_day']).toContain(f.days[4]!.symbol)
  })

  it('üç saatten eski seri "şimdi" göstermez; tek gece noktası kalan gün kutu olmaz', () => {
    const stale = buildForecast('openmeteo', null, points, '2026-10-20T12:00:00Z', IST)
    expect(stale.now).toBeNull()
    expect(stale.hours).toEqual([])
    const tail = buildForecast(
      'metno',
      null,
      [
        ...series('2026-10-04T09:00:00Z', 3, 0),
        { ...points[0]!, time: '2026-10-05T21:00:00Z', symbol1h: null, precip1h: null }
      ],
      now,
      IST
    )
    expect(tail.days.map((d) => d.date)).toEqual(['2026-10-04'])
  })

  it('boş seri boş tahmin verir', () => {
    expect(buildForecast('metno', null, [], now, IST)).toEqual({
      provider: 'metno',
      updatedAt: null,
      now: null,
      hours: [],
      days: []
    })
  })

  it('üç saatten eski hava "X saat önce" rozetini alır', () => {
    expect(weatherAgeHours(null, now)).toBeNull()
    expect(weatherAgeHours('2026-10-04T07:30:00Z', now)).toBeNull()
    expect(weatherAgeHours('2026-10-04T05:00:00Z', now)).toBe(4)
  })
})
