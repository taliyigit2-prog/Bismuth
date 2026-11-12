import { afterEach, describe, expect, it } from 'vitest'
import { localDateTimeOf } from './domain/local-datetime'
import {
  addDays,
  getHotelTimeZone,
  localDateOf,
  setHotelTimeZone,
  diffDays,
  isLocalDate,
  localDate,
  nextMonthStart,
  nightsOf,
  previousMonth,
  weekday
} from './date'

describe('LocalDate', () => {
  it('yalnız geçerli YYYY-MM-DD günlerini kabul eder', () => {
    expect(isLocalDate('2026-09-30')).toBe(true)
    expect(isLocalDate('2026-02-30')).toBe(false)
    expect(isLocalDate('30.09.2026')).toBe(false)
  })

  it('gün eklemede yaz saati kayması olmaz', () => {
    expect(addDays(localDate('2026-03-28'), 2)).toBe('2026-03-30')
    expect(addDays(localDate('2026-10-24'), 2)).toBe('2026-10-26')
    expect(addDays(localDate('2028-02-28'), 1)).toBe('2028-02-29')
  })

  it('konaklama [giriş, çıkış): 30 Eylül → 2 Ekim iki gecedir, çıkış günü gece değildir', () => {
    expect(nightsOf(localDate('2026-09-30'), localDate('2026-10-02'))).toEqual(['2026-09-30', '2026-10-01'])
    expect(nightsOf(localDate('2026-09-30'), localDate('2026-09-30'))).toEqual([])
    expect(diffDays(localDate('2026-09-01'), localDate('2026-10-01'))).toBe(30)
  })

  it('haftanın gününü verir (3 Ekim 2026 cumartesi)', () => {
    expect(weekday(localDate('2026-10-03'))).toBe(6)
  })

  it('sonraki ayın ilk günü; aralıktan ocağa yıl atlar', () => {
    expect(nextMonthStart('2026-09')).toBe('2026-10-01')
    expect(nextMonthStart('2026-12')).toBe('2027-01-01')
  })

  it('önceki ay; ocaktan önceki yılın aralığına döner', () => {
    expect(previousMonth('2026-09')).toBe('2026-08')
    expect(previousMonth('2026-01')).toBe('2025-12')
    expect(previousMonth('2024-03')).toBe('2024-02')
  })
})

describe('the hotel day (single "today")', () => {
  // 2026-10-10 12:00 UTC: Istanbul (+3) still 10 Oct 15:00; Kiritimati (+14) already 11 Oct 02:00.
  const instant = new Date('2026-10-10T12:00:00Z')
  afterEach(() => setHotelTimeZone(null))

  it('follows hotel.timezone, not the machine zone', () => {
    setHotelTimeZone('Pacific/Kiritimati')
    expect(localDateOf(instant)).toBe('2026-10-11')
    expect(localDateTimeOf(instant)).toBe('2026-10-11T02:00')
    setHotelTimeZone('America/Los_Angeles')
    expect(localDateOf(instant)).toBe('2026-10-10')
    expect(localDateTimeOf(instant)).toBe('2026-10-10T05:00')
  })

  it('changes nothing when the machine zone is the hotel zone (tests run in Europe/Istanbul)', () => {
    const before = localDateOf(instant)
    const beforeTime = localDateTimeOf(instant)
    setHotelTimeZone('Europe/Istanbul')
    expect(localDateOf(instant)).toBe(before)
    expect(localDateTimeOf(instant)).toBe(beforeTime)
    expect(localDateOf(new Date('2026-10-10T20:59:00Z'))).toBe('2026-10-10')
    expect(localDateOf(new Date('2026-10-10T21:00:00Z'))).toBe('2026-10-11')
  })

  it('ignores an unknown zone and keeps the machine zone', () => {
    setHotelTimeZone('Mars/Olympus')
    expect(getHotelTimeZone()).toBeNull()
    expect(localDateOf(instant)).toBe('2026-10-10')
  })
})
