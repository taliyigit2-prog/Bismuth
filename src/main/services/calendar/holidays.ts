// Offline Turkish public holidays for any year (G-16, K-04; 03-mimari.md §6.7). Rows map 1:1 to calendar_days
// (source = generated). Main process only: date-holidays is too heavy for the renderer bundle.
//
// Law 2429: Ramazan Bayramı = arife (from 13:00, half day) + 3 days; Kurban Bayramı = arife + 4 days;
// 28 Ekim from 13:00 (half day) before Cumhuriyet Bayramı. date-holidays models feasts as sunset-to-sunset
// spans, so only the first local day is taken from it and the law is applied here.
// The library's Hijri table ends in 2076; wherever it has no matching first day, ICU's islamic-umalqura
// calendar (built into Node/Chromium) fills in. Both can differ ±1 day from Diyanet, so religious rows are
// `estimated` and the optional yearly online check (Faz 11) corrects generated rows.
import Holidays from 'date-holidays'
import { addDays, diffDays, localDate, type LocalDate } from '@shared/date'

export type HolidayKind = 'holiday' | 'half_holiday'
export type HolidayGenerator = 'date-holidays' | 'intl-umalqura'

export interface HolidayTitle {
  tr: string
  en: string
  ru: string
}

/** One calendar_days row (source = generated). */
export interface HolidayRow {
  date: LocalDate
  kind: HolidayKind
  titleI18n: HolidayTitle
  /** Ties a feast's arife and days (or 28/29 Ekim) together: "<slug>:<first holiday day>". */
  groupKey: string
  /** Religious feasts are calculated, not announced: may differ ±1 day from Diyanet. */
  estimated: boolean
  generator: HolidayGenerator
}

/** Stored in calendar_generation.source_version so a later generator change can be detected. */
export const HOLIDAY_SOURCE_VERSION = 'date-holidays@3.37.0+intl-umalqura'

export const MIN_HOLIDAY_YEAR = 1900
export const MAX_HOLIDAY_YEAR = 9998

type Feast = 'ramazan' | 'kurban'

interface FeastStart {
  feast: Feast
  /** First full holiday day (the arife is the day before). */
  date: LocalDate
  generator: HolidayGenerator
}

interface FeastInfo {
  slug: string
  days: number
  eve: HolidayTitle
  day: (n: number) => HolidayTitle
}

const FEASTS: Readonly<Record<Feast, FeastInfo>> = {
  ramazan: {
    slug: 'ramazan-bayrami',
    days: 3,
    eve: { tr: 'Ramazan Bayramı Arifesi', en: 'Eve of Eid al-Fitr', ru: 'Канун Ураза-байрама' },
    day: (n) => ({
      tr: `Ramazan Bayramı ${n}. Gün`,
      en: `Eid al-Fitr, day ${n}`,
      ru: `Ураза-байрам, ${n}-й день`
    })
  },
  kurban: {
    slug: 'kurban-bayrami',
    days: 4,
    eve: { tr: 'Kurban Bayramı Arifesi', en: 'Eve of Eid al-Adha', ru: 'Канун Курбан-байрама' },
    day: (n) => ({
      tr: `Kurban Bayramı ${n}. Gün`,
      en: `Eid al-Adha, day ${n}`,
      ru: `Курбан-байрам, ${n}-й день`
    })
  }
}

interface FixedInfo {
  slug: string
  title: HolidayTitle
  /** Half day before the holiday (only 28 Ekim). */
  eve?: HolidayTitle
}

// Keyed by the library's fixed-date rule ("MM-DD").
const FIXED: Readonly<Record<string, FixedInfo>> = {
  '01-01': { slug: 'yilbasi', title: { tr: 'Yılbaşı', en: "New Year's Day", ru: 'Новый год' } },
  '04-23': {
    slug: 'ulusal-egemenlik',
    title: {
      tr: 'Ulusal Egemenlik ve Çocuk Bayramı',
      en: "National Sovereignty and Children's Day",
      ru: 'День национального суверенитета и детей'
    }
  },
  '05-01': {
    slug: 'emek-dayanisma',
    title: { tr: 'Emek ve Dayanışma Günü', en: 'Labour and Solidarity Day', ru: 'День труда и солидарности' }
  },
  '05-19': {
    slug: 'genclik-spor',
    title: {
      tr: "Atatürk'ü Anma, Gençlik ve Spor Bayramı",
      en: 'Commemoration of Atatürk, Youth and Sports Day',
      ru: 'День памяти Ататюрка, молодёжи и спорта'
    }
  },
  '07-15': {
    slug: 'demokrasi-milli-birlik',
    title: {
      tr: 'Demokrasi ve Millî Birlik Günü',
      en: 'Democracy and National Unity Day',
      ru: 'День демократии и национального единства'
    }
  },
  '08-30': { slug: 'zafer-bayrami', title: { tr: 'Zafer Bayramı', en: 'Victory Day', ru: 'День Победы' } },
  '10-29': {
    slug: 'cumhuriyet-bayrami',
    title: { tr: 'Cumhuriyet Bayramı', en: 'Republic Day', ru: 'День Республики' },
    eve: { tr: 'Cumhuriyet Bayramı Arifesi', en: 'Eve of Republic Day', ru: 'Канун Дня Республики' }
  }
}

let library: Holidays | undefined
const tr = (): Holidays => (library ??= new Holidays('TR'))

function feastOfRule(rule: string): Feast | null {
  if (rule.startsWith('1 Shawwal')) return 'ramazan'
  if (rule.startsWith('10 Dhu al-Hijjah')) return 'kurban'
  return null
}

function fixedRows(rule: string, libraryName: string, date: LocalDate): HolidayRow[] {
  // An unknown rule only appears if the pinned library changes; keep it under its Turkish name.
  const info = FIXED[rule] ?? {
    slug: rule,
    title: { tr: libraryName, en: libraryName, ru: libraryName }
  }
  const groupKey = `${info.slug}:${date}`
  const base = { groupKey, estimated: false, generator: 'date-holidays' as const }
  const rows: HolidayRow[] = [{ ...base, date, kind: 'holiday', titleI18n: info.title }]
  if (info.eve) rows.push({ ...base, date: addDays(date, -1), kind: 'half_holiday', titleI18n: info.eve })
  return rows
}

function feastRows(start: FeastStart): HolidayRow[] {
  const info = FEASTS[start.feast]
  const base = { groupKey: `${info.slug}:${start.date}`, estimated: true, generator: start.generator }
  const rows: HolidayRow[] = [
    { ...base, date: addDays(start.date, -1), kind: 'half_holiday', titleI18n: info.eve }
  ]
  for (let i = 0; i < info.days; i++)
    rows.push({ ...base, date: addDays(start.date, i), kind: 'holiday', titleI18n: info.day(i + 1) })
  return rows
}

let hijri: Intl.DateTimeFormat | null | undefined
function hijriFormat(): Intl.DateTimeFormat | null {
  if (hijri === undefined) {
    const fmt = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
      day: 'numeric',
      month: 'numeric',
      timeZone: 'UTC'
    })
    // A runtime without full ICU silently falls back to gregorian; then "10/1" would be 1 October.
    hijri = fmt.resolvedOptions().calendar === 'islamic-umalqura' ? fmt : null
  }
  return hijri
}

/** Feast first days in [from, to] from ICU's Umm al-Qura calendar (1 Shawwal, 10 Dhu al-Hijjah). */
function intlFeastStarts(from: LocalDate, to: LocalDate): FeastStart[] {
  const fmt = hijriFormat()
  if (!fmt) return []
  const out: FeastStart[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) {
    let month = 0
    let day = 0
    for (const part of fmt.formatToParts(new Date(`${d}T00:00:00Z`))) {
      if (part.type === 'month') month = Number(part.value)
      if (part.type === 'day') day = Number(part.value)
    }
    if (month === 10 && day === 1) out.push({ feast: 'ramazan', date: d, generator: 'intl-umalqura' })
    if (month === 12 && day === 10) out.push({ feast: 'kurban', date: d, generator: 'intl-umalqura' })
  }
  return out
}

/** The library wins wherever it has the same feast within ±3 days; ICU fills the gaps (e.g. after 2076). */
function mergeFeasts(fromLibrary: FeastStart[], fromIntl: FeastStart[]): FeastStart[] {
  const covered = (f: FeastStart): boolean =>
    fromLibrary.some((l) => l.feast === f.feast && Math.abs(diffDays(l.date, f.date)) <= 3)
  return [...fromLibrary, ...fromIntl.filter((f) => !covered(f))]
}

function compareRows(a: HolidayRow, b: HolidayRow): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1
  if (a.kind !== b.kind) return a.kind === 'holiday' ? -1 : 1
  if (a.groupKey !== b.groupKey) return a.groupKey < b.groupKey ? -1 : 1
  return 0
}

/**
 * All Turkish public holidays and half days whose date lies in `year`, sorted by date (then full day before
 * half day, then group). Deterministic for a given runtime. Two different holidays can share a date
 * (e.g. 2023-04-23: Ramazan Bayramı 3. Gün and 23 Nisan); both rows are kept.
 */
export function generateTurkishHolidays(year: number): HolidayRow[] {
  if (!Number.isInteger(year) || year < MIN_HOLIDAY_YEAR || year > MAX_HOLIDAY_YEAR)
    throw new RangeError(`holidays: year must be an integer in ${MIN_HOLIDAY_YEAR}–${MAX_HOLIDAY_YEAR}`)

  // Neighbouring years too: an arife can fall on 31 Dec, the last feast day on 1–3 Jan.
  const windowStart = localDate(`${year - 1}-12-01`)
  const windowEnd = localDate(`${year + 1}-01-31`)
  const rows: HolidayRow[] = []
  const libraryFeasts: FeastStart[] = []

  for (const y of [year - 1, year, year + 1]) {
    for (const h of tr().getHolidays(y, 'tr')) {
      if (h.type !== 'public') continue
      // "2026-03-20 00:00:00 -0600" → first local day of the holiday.
      const date = localDate(h.date.slice(0, 10))
      const feast = feastOfRule(h.rule)
      if (feast) {
        if (date >= windowStart && date <= windowEnd)
          libraryFeasts.push({ feast, date, generator: 'date-holidays' })
      } else if (y === year) {
        // 28 Ekim belongs to the same year as 29 Ekim, so fixed holidays come from `year` only.
        rows.push(...fixedRows(h.rule, h.name, date))
      }
    }
  }
  for (const start of mergeFeasts(libraryFeasts, intlFeastStarts(windowStart, windowEnd)))
    rows.push(...feastRows(start))

  const prefix = `${year}-`
  const seen = new Set<string>()
  return rows
    .filter((r) => {
      const key = `${r.date}|${r.groupKey}|${r.kind}`
      if (!r.date.startsWith(prefix) || seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort(compareRows)
}
