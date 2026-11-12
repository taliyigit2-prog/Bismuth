import { describe, expect, it } from 'vitest'
import { calendarYears } from './calendar-range'

describe('takvim aralığı kuralı (G-31, K-46 (1))', () => {
  it('kayıt ve ayar yoksa geçen yıldan bugünden on yıl sonrasına', () => {
    expect(calendarYears({ thisYear: 2026, startYear: null, oldestYear: null, newestYear: null })).toEqual({
      firstYear: 2025,
      lastYear: 2036
    })
  })

  it('ayar ile en eski konaklamadan hangisi erkense oradan başlar', () => {
    const base = { thisYear: 2028, newestYear: 2028 }
    expect(calendarYears({ ...base, startYear: 2020, oldestYear: 2026 }).firstYear).toBe(2020)
    expect(calendarYears({ ...base, startYear: 2027, oldestYear: 2026 }).firstYear).toBe(2026)
    expect(calendarYears({ ...base, startYear: null, oldestYear: 2026 }).firstYear).toBe(2026)
    expect(calendarYears({ ...base, startYear: 2010, oldestYear: null }).firstYear).toBe(2010)
  })

  it('en ileri kayıt on yılı aşarsa bir yıl sonrasına kadar uzar; başlangıç bugünü geçmez', () => {
    expect(calendarYears({ thisYear: 2026, startYear: null, oldestYear: 2027, newestYear: 2040 })).toEqual({
      firstYear: 2026,
      lastYear: 2041
    })
    expect(
      calendarYears({ thisYear: 2026, startYear: null, oldestYear: 2026, newestYear: 2030 }).lastYear
    ).toBe(2036)
  })
})
