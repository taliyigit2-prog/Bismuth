import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { metCompact } from '../../../../tests/factories/fake-external'
import { parseMet } from './providers'
import {
  buildForecast,
  iconFor,
  isWet,
  localDateIn,
  MET_SYMBOL_CODES,
  MET_SYMBOLS,
  weatherAgeHours,
  wmoToSymbol
} from '@shared/domain/weather'
import { cityKey, CITIES, DEFAULT_CITY, findCity } from '@shared/domain/cities'

const ICONS = new Set(
  readdirSync(resolve(__dirname, '../../../renderer/assets/weather'))
    .filter((f) => f.endsWith('.svg'))
    .map((f) => f.replace(/\.svg$/, ''))
)

describe('hava simgeleri (K-13, S-90)', () => {
  it('MET’in 41 kodu ve gündüz/gece/kutup biçimleri — 83 symbol_code — paketteki bir Yr simgesine birebir eşlenir', () => {
    expect(Object.keys(MET_SYMBOLS)).toHaveLength(41)
    expect(MET_SYMBOL_CODES).toHaveLength(83)
    for (const code of MET_SYMBOL_CODES) {
      expect(iconFor(code)).toBe(code)
      expect(ICONS.has(iconFor(code)), code).toBe(true)
    }
  })

  it('bilinmeyen ya da eksik kod bulutlu simgeye düşer; soneksiz kod gündüz biçimini alır', () => {
    expect(iconFor('rainshowers')).toBe('rainshowers_day')
    expect(iconFor('cloudy_day')).toBe('cloudy')
    expect(iconFor('volcanic_ash')).toBe('cloudy')
    expect(iconFor(null)).toBe('cloudy')
    expect(isWet('lightsleetshowers_night')).toBe(true)
    expect(isWet('fair_day')).toBe(false)
  })

  it('Open-Meteo WMO kodları da aynı simge setine düşer', () => {
    const codes = [
      0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96,
      99
    ]
    for (const c of codes) {
      expect(ICONS.has(wmoToSymbol(c, true)), String(c)).toBe(true)
      expect(ICONS.has(wmoToSymbol(c, false)), String(c)).toBe(true)
    }
    expect(wmoToSymbol(0, false)).toBe('clearsky_night')
  })
})

describe('günlük tahmin (repo-alan-tr-hava.md §3.3)', () => {
  const start = '2026-10-04T06:00:00.000Z'
  const series = parseMet(JSON.stringify(metCompact('2026-10-04T06:00:00Z'))).series

  it('şimdi = içinde bulunulan saat; günler İstanbul’un yerel gününe göre, bugünden başlar, en çok 7', () => {
    const f = buildForecast('metno', null, series, '2026-10-04T09:30:00.000Z', 'Europe/Istanbul')
    expect(f.now).toMatchObject({ time: '2026-10-04T09:00:00.000Z', symbol: 'partlycloudy_day' })
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
    expect(f.hours[0]!.time).toBe('2026-10-04T09:00:00.000Z')
    expect(f.hours.length).toBeLessThanOrEqual(48)
  })

  it('yağış saatlik bölümde saat saat, sonra 6 saatlik bloklarla bir kez toplanır; gün simgesi öğlenin 6 saatlik simgesi', () => {
    const f = buildForecast('metno', null, series, start, 'Europe/Istanbul')
    // Second day of the series (05 Oct, 09:00 local onwards in UTC terms) is wet: 0,5 mm an hour.
    const wet = f.days.find((d) => d.date === '2026-10-05')!
    expect(wet.symbol).toBe('rain')
    expect(wet.precipMm).toBeGreaterThan(0)
    expect(wet.precipMm % 0.5).toBe(0)
    // 8 Oct: three 6-hour blocks of 4,2 mm start on that local day (09:00, 15:00, 21:00) — each counted once.
    const snowy = f.days.find((d) => d.date === '2026-10-08')!
    expect(snowy.symbol).toBe('heavysnowshowersandthunder_day')
    expect(snowy.precipMm).toBe(12.6)
    expect(f.days[0]!.maxC).toBeGreaterThan(f.days[0]!.minC)
  })

  it('üç saatten eski veri "X saat önce" rozeti alır; 3 saatten eski şimdiki değer gösterilmez', () => {
    expect(weatherAgeHours('2026-10-04T08:00:00.000Z', '2026-10-04T09:00:00.000Z')).toBeNull()
    expect(weatherAgeHours('2026-10-04T05:00:00.000Z', '2026-10-04T09:30:00.000Z')).toBe(4)
    const late = buildForecast('metno', null, series, '2026-10-12T09:00:00.000Z', 'Europe/Istanbul')
    expect(late.now).toBeNull()
    expect(late.days.length).toBeLessThan(7)
    expect(localDateIn('2026-10-04T22:30:00.000Z', 'Europe/Istanbul')).toBe('2026-10-05')
  })
})

describe('şehir → koordinat (paket içi liste)', () => {
  it('81 il ve İstanbul ilçeleri; yazım farkları ve "ilçe, il" biçimi tanınır', () => {
    expect(CITIES.filter((c) => !c.province)).toHaveLength(81)
    expect(findCity('istanbul')).toBe(DEFAULT_CITY)
    expect(findCity('ISTANBUL')).toBe(DEFAULT_CITY)
    expect(findCity('Kadıköy, İstanbul')?.name).toBe('Kadıköy')
    expect(findCity('Kadikoy / Istanbul')).toMatchObject({ lat: 40.99, lon: 29.03 })
    expect(findCity('Atlantis')).toBeNull()
    expect(findCity('')).toBeNull()
    expect(cityKey('  Şanlıurfa ')).toBe('sanliurfa')
    for (const c of CITIES) {
      expect(c.lat).toBeGreaterThan(35.8)
      expect(c.lat).toBeLessThan(42.2)
      expect(c.lon).toBeGreaterThan(25.6)
      expect(c.lon).toBeLessThan(44.9)
    }
  })
})
