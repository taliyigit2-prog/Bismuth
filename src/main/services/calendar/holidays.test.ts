import { describe, expect, it } from 'vitest'
import { generateTurkishHolidays, type HolidayRow } from './holidays'

const mark = (r: HolidayRow): string => `${r.date} ${r.kind === 'half_holiday' ? '½' : '1'}`
const pick = (year: number, slug: string): string[] =>
  generateTurkishHolidays(year)
    .filter((r) => r.groupKey.startsWith(`${slug}:`))
    .map(mark)

const FIXED_MM_DD = ['01-01', '04-23', '05-01', '05-19', '07-15', '08-30', '10-29']

function fixedDays(year: number): string[] {
  return generateTurkishHolidays(year)
    .filter((r) => r.kind === 'holiday' && !r.estimated)
    .map((r) => r.date.slice(5))
}

describe('generateTurkishHolidays', () => {
  it('2026 Ramazan Bayramı: arife 19 Mart yarım gün + 20–22 Mart (Diyanet ile aynı)', () => {
    expect(pick(2026, 'ramazan-bayrami')).toEqual([
      '2026-03-19 ½',
      '2026-03-20 1',
      '2026-03-21 1',
      '2026-03-22 1'
    ])
  })

  it('2026 Kurban Bayramı: arife 26 Mayıs yarım gün + 27–30 Mayıs (Diyanet ile aynı)', () => {
    expect(pick(2026, 'kurban-bayrami')).toEqual([
      '2026-05-26 ½',
      '2026-05-27 1',
      '2026-05-28 1',
      '2026-05-29 1',
      '2026-05-30 1'
    ])
  })

  it('28 Ekim öğleden sonra yarım gün, 29 Ekim tam gün; ikisi aynı grupta', () => {
    const rows = generateTurkishHolidays(2026).filter((r) => r.groupKey === 'cumhuriyet-bayrami:2026-10-29')
    expect(rows.map(mark)).toEqual(['2026-10-28 ½', '2026-10-29 1'])
    expect(rows.every((r) => !r.estimated && r.generator === 'date-holidays')).toBe(true)
  })

  it('2026 tam liste: 7 sabit tatil + 28 Ekim + Ramazan (1 + 3) + Kurban (1 + 4) = 17 satır', () => {
    const rows = generateTurkishHolidays(2026)
    expect(rows).toHaveLength(17)
    expect(rows.filter((r) => r.kind === 'half_holiday').map((r) => r.date)).toEqual([
      '2026-03-19',
      '2026-05-26',
      '2026-10-28'
    ])
  })

  it('2027: Ramazan arife 8 Mart + 9–11 Mart, Kurban arife 15 Mayıs + 16–19 Mayıs (Diyanet listesi)', () => {
    expect(pick(2027, 'ramazan-bayrami')).toEqual([
      '2027-03-08 ½',
      '2027-03-09 1',
      '2027-03-10 1',
      '2027-03-11 1'
    ])
    expect(pick(2027, 'kurban-bayrami')).toEqual([
      '2027-05-15 ½',
      '2027-05-16 1',
      '2027-05-17 1',
      '2027-05-18 1',
      '2027-05-19 1'
    ])
  })

  it('2028: Ramazan arife 25 Şubat + 26–28 Şubat, Kurban arife 4 Mayıs + 5–8 Mayıs', () => {
    expect(pick(2028, 'ramazan-bayrami')).toEqual([
      '2028-02-25 ½',
      '2028-02-26 1',
      '2028-02-27 1',
      '2028-02-28 1'
    ])
    expect(pick(2028, 'kurban-bayrami')).toEqual([
      '2028-05-04 ½',
      '2028-05-05 1',
      '2028-05-06 1',
      '2028-05-07 1',
      '2028-05-08 1'
    ])
  })

  it('dini bayramlar "tahmini", sabit tatiller kesin işaretlenir', () => {
    const rows = generateTurkishHolidays(2026)
    for (const r of rows) {
      const religious = r.groupKey.startsWith('ramazan-bayrami:') || r.groupKey.startsWith('kurban-bayrami:')
      expect(r.estimated, `${r.date} ${r.titleI18n.tr}`).toBe(religious)
    }
  })

  it('başlıklar üç dilde: arife "Eve of …" / "Канун …", gün "day 1" / "1-й день"', () => {
    const rows = generateTurkishHolidays(2026)
    const byDate = (d: string): HolidayRow[] => rows.filter((r) => r.date === d)
    expect(byDate('2026-03-19')[0]?.titleI18n).toEqual({
      tr: 'Ramazan Bayramı Arifesi',
      en: 'Eve of Eid al-Fitr',
      ru: 'Канун Ураза-байрама'
    })
    expect(byDate('2026-05-27')[0]?.titleI18n).toEqual({
      tr: 'Kurban Bayramı 1. Gün',
      en: 'Eid al-Adha, day 1',
      ru: 'Курбан-байрам, 1-й день'
    })
    expect(byDate('2026-10-29')[0]?.titleI18n.ru).toBe('День Республики')
    expect(byDate('2026-10-28')[0]?.titleI18n.en).toBe('Eve of Republic Day')
    for (const r of rows) {
      expect(r.titleI18n.tr.length).toBeGreaterThan(0)
      expect(r.titleI18n.en.length).toBeGreaterThan(0)
      expect(r.titleI18n.ru.length).toBeGreaterThan(0)
    }
  })

  it('2036 ve 2100 hatasız üretilir ve sabit tatilleri içerir', () => {
    for (const year of [2036, 2100]) {
      const days = fixedDays(year)
      for (const d of FIXED_MM_DD) expect(days, `${year}-${d}`).toContain(d)
    }
  })

  it('kütüphane tablosu bitince (2076 sonrası) Intl Umm al-Qura yedeği devreye girer', () => {
    const first = (year: number): HolidayRow | undefined =>
      generateTurkishHolidays(year).find((r) => r.estimated && r.kind === 'holiday')
    expect(first(2050)?.generator).toBe('date-holidays')
    expect(first(2100)?.generator).toBe('intl-umalqura')
    const y2100 = generateTurkishHolidays(2100)
    expect(y2100.filter((r) => r.titleI18n.tr === 'Ramazan Bayramı 1. Gün')).toHaveLength(1)
    expect(y2100.filter((r) => r.titleI18n.tr === 'Kurban Bayramı 1. Gün')).toHaveLength(1)
  })

  it('sınırsız yıl: 2026–2200 arası her yıl iki bayram ve 7 sabit tatil üretilir', () => {
    for (let year = 2026; year <= 2200; year++) {
      const rows = generateTurkishHolidays(year)
      expect(
        rows.some((r) => r.groupKey.startsWith('ramazan-bayrami:')),
        String(year)
      ).toBe(true)
      expect(
        rows.some((r) => r.groupKey.startsWith('kurban-bayrami:')),
        String(year)
      ).toBe(true)
      expect(rows.filter((r) => !r.estimated && r.kind === 'holiday')).toHaveLength(7)
    }
  })

  it("2033'te iki Ramazan Bayramı vardır (Hicri yıl kayması), grup anahtarları farklıdır", () => {
    const starts = generateTurkishHolidays(2033).filter((r) => r.titleI18n.tr === 'Ramazan Bayramı 1. Gün')
    expect(starts.map((r) => r.date)).toEqual(['2033-01-02', '2033-12-23'])
    expect(new Set(starts.map((r) => r.groupKey)).size).toBe(2)
  })

  it('yıl sınırını aşan bayram: 2071 son günü başlayan Kurban 2072 Ocak günlerini doldurur', () => {
    expect(pick(2071, 'kurban-bayrami').slice(-2)).toEqual(['2071-12-30 ½', '2071-12-31 1'])
    const jan = generateTurkishHolidays(2072).filter((r) => r.groupKey === 'kurban-bayrami:2071-12-31')
    expect(jan.map((r) => `${r.date} ${r.titleI18n.tr}`)).toEqual([
      '2072-01-01 Kurban Bayramı 2. Gün',
      '2072-01-02 Kurban Bayramı 3. Gün',
      '2072-01-03 Kurban Bayramı 4. Gün'
    ])
  })

  it('aynı güne düşen iki farklı tatil iki satır olarak kalır (2023-04-23)', () => {
    const rows = generateTurkishHolidays(2023).filter((r) => r.date === '2023-04-23')
    expect(rows.map((r) => r.titleI18n.tr).sort()).toEqual([
      'Ramazan Bayramı 3. Gün',
      'Ulusal Egemenlik ve Çocuk Bayramı'
    ])
  })

  it('aynı girdi aynı çıktıyı verir; satırlar yıl içinde, sıralı ve tekrarsız', () => {
    for (const year of [2026, 2027, 2028, 2033, 2072, 2100]) {
      const a = generateTurkishHolidays(year)
      expect(generateTurkishHolidays(year)).toEqual(a)
      expect(a.every((r) => r.date.startsWith(`${year}-`))).toBe(true)
      expect(a.map((r) => r.date)).toEqual([...a.map((r) => r.date)].sort())
      const keys = a.map((r) => `${r.date}|${r.groupKey}|${r.kind}`)
      expect(new Set(keys).size).toBe(keys.length)
    }
  })

  it('geçersiz yıl reddedilir', () => {
    expect(() => generateTurkishHolidays(2026.5)).toThrow(RangeError)
    expect(() => generateTurkishHolidays(1800)).toThrow(RangeError)
    expect(() => generateTurkishHolidays(10_000)).toThrow(RangeError)
  })
})
