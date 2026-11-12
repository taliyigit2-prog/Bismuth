import { describe, expect, it } from 'vitest'
import { localDate } from '../date'
import {
  addMinutes,
  addMonthsClamped,
  atTime,
  clampedDate,
  compareLocalDateTime,
  datePart,
  daysInMonth,
  isInMonth,
  isLocalDateTime,
  localDateTime,
  localDateTimeOf,
  monthRange,
  timePart
} from './local-datetime'

describe('LocalDateTime', () => {
  it('yalnız geçerli YYYY-MM-DDTHH:MM değerlerini kabul eder', () => {
    expect(isLocalDateTime('2026-10-02T12:00')).toBe(true)
    expect(isLocalDateTime('2026-02-30T12:00')).toBe(false)
    expect(isLocalDateTime('2026-10-02T24:00')).toBe(false)
    expect(isLocalDateTime('2026-10-02 12:00')).toBe(false)
    expect(isLocalDateTime('2026-10-02T12:00:00')).toBe(false)
    expect(() => localDateTime('2026-10-02T9:00')).toThrow(RangeError)
  })

  it('gün ve saati birleştirir, parçalarına ayırır', () => {
    const dt = atTime(localDate('2026-10-02'), '09:30')
    expect(dt).toBe('2026-10-02T09:30')
    expect(datePart(dt)).toBe('2026-10-02')
    expect(timePart(dt)).toBe('09:30')
    expect(() => atTime(localDate('2026-10-02'), '9:30')).toThrow(RangeError)
  })

  it('dakika eklemede gün ve yaz saati kayması olmaz', () => {
    expect(addMinutes(localDateTime('2026-10-02T23:30'), 45)).toBe('2026-10-03T00:15')
    expect(addMinutes(localDateTime('2027-03-28T09:00'), -3 * 24 * 60)).toBe('2027-03-25T09:00')
    expect(addMinutes(localDateTime('2026-10-25T02:30'), 60)).toBe('2026-10-25T03:30')
    expect(() => addMinutes(localDateTime('2026-10-02T12:00'), 1.5)).toThrow(RangeError)
  })

  it('kronolojik karşılaştırır ve bilgisayarın yerel saatini okur', () => {
    expect(compareLocalDateTime(localDateTime('2026-10-02T09:00'), localDateTime('2026-10-02T10:00'))).toBe(
      -1
    )
    expect(compareLocalDateTime(localDateTime('2026-10-02T09:00'), localDateTime('2026-10-02T09:00'))).toBe(0)
    expect(localDateTimeOf(new Date(2026, 9, 2, 7, 5))).toBe('2026-10-02T07:05')
  })
})

describe('Ay yardımcıları', () => {
  it('ayın gün sayısını artık yılla birlikte verir', () => {
    expect(daysInMonth(2026, 2)).toBe(28)
    expect(daysInMonth(2028, 2)).toBe(29)
    expect(daysInMonth(2026, 4)).toBe(30)
    expect(daysInMonth(2026, 12)).toBe(31)
    expect(() => daysInMonth(2026, 13)).toThrow(RangeError)
  })

  it('ayda olmayan gün ayın son gününe düşer', () => {
    expect(clampedDate(2026, 4, 31)).toBe('2026-04-30')
    expect(clampedDate(2027, 2, 31)).toBe('2027-02-28')
    expect(clampedDate(2028, 2, 30)).toBe('2028-02-29')
    expect(clampedDate(2026, 1, 5)).toBe('2026-01-05')
  })

  it('ay eklerken asıl günü korur: 31 Ocak → 28 Şubat → 31 Mart', () => {
    const jan = localDate('2027-01-31')
    expect(addMonthsClamped(jan, 1)).toBe('2027-02-28')
    expect(addMonthsClamped(localDate('2027-02-28'), 1, 31)).toBe('2027-03-31')
    expect(addMonthsClamped(localDate('2027-02-28'), 1)).toBe('2027-03-28')
    expect(addMonthsClamped(localDate('2026-11-30'), 3)).toBe('2027-02-28')
    expect(addMonthsClamped(localDate('2027-03-15'), -3)).toBe('2026-12-15')
  })

  it('tarihin hangi ayda olduğunu ve ayın yarı açık aralığını verir', () => {
    expect(isInMonth(localDate('2026-10-31'), 2026, 10)).toBe(true)
    expect(isInMonth(localDate('2026-11-01'), 2026, 10)).toBe(false)
    expect(monthRange(2028, 2)).toEqual({ start: '2028-02-01', end: '2028-03-01' })
    expect(monthRange(2026, 12)).toEqual({ start: '2026-12-01', end: '2027-01-01' })
  })
})
