// LocalDate = "YYYY-MM-DD" hotel-local calendar day (CLAUDE.md "Kod kuralları"). No time zone, no Date math
// on wall-clock times: day arithmetic runs on UTC midnights so DST never shifts a night.

export type LocalDate = string & { readonly __brand: 'LocalDate' }

const PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

export function isLocalDate(value: unknown): value is LocalDate {
  if (typeof value !== 'string') return false
  const m = PATTERN.exec(value)
  if (!m) return false
  const [, y, mo, d] = m
  const t = Date.UTC(Number(y), Number(mo) - 1, Number(d))
  return new Date(t).toISOString().slice(0, 10) === value
}

export function localDate(value: string): LocalDate {
  if (!isLocalDate(value)) throw new RangeError(`date: invalid local date "${value}"`)
  return value
}

// The app has ONE "today": the hotel's calendar day (setting `hotel.timezone`). The main process and the window set the
// zone once settings are known (setHotelTimeZone); until then, and for an unknown zone, the machine's own zone is used.
// A machine in the hotel's zone therefore behaves exactly as before.
let hotelZone: string | null = null
const zoneFormats = new Map<string, Intl.DateTimeFormat | null>()

function formatFor(zone: string): Intl.DateTimeFormat | null {
  let f = zoneFormats.get(zone)
  if (f === undefined) {
    try {
      f = new Intl.DateTimeFormat('en-CA', {
        timeZone: zone,
        numberingSystem: 'latn',
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      })
    } catch {
      f = null
    }
    zoneFormats.set(zone, f)
  }
  return f
}

/** Set (or clear with null) the hotel's IANA time zone. An unknown zone is ignored (machine zone stays). */
export function setHotelTimeZone(zone: string | null | undefined): void {
  hotelZone = zone && formatFor(zone) ? zone : null
}

export function getHotelTimeZone(): string | null {
  return hotelZone
}

/** Wall-clock parts of `d` in the hotel zone, or in the machine zone when no zone is set. */
export function hotelParts(d: Date): { y: string; mo: string; d: string; h: string; mi: string } {
  const f = hotelZone ? formatFor(hotelZone) : null
  if (!f) {
    const pad = (n: number): string => String(n).padStart(2, '0')
    return {
      y: String(d.getFullYear()),
      mo: pad(d.getMonth() + 1),
      d: pad(d.getDate()),
      h: pad(d.getHours()),
      mi: pad(d.getMinutes())
    }
  }
  const parts = Object.fromEntries(f.formatToParts(d).map((p) => [p.type, p.value]))
  return { y: parts.year!, mo: parts.month!, d: parts.day!, h: parts.hour!, mi: parts.minute! }
}

/** The hotel's calendar day of `d` (hotel.timezone; machine zone until a zone is set). */
export function localDateOf(d: Date): LocalDate {
  const p = hotelParts(d)
  return `${p.y}-${p.mo}-${p.d}` as LocalDate
}

/** The app's single "today" (the hotel's day). */
export const today = (): LocalDate => localDateOf(new Date())

const toUtc = (d: LocalDate): number => Date.parse(`${d}T00:00:00Z`)

export function addDays(d: LocalDate, days: number): LocalDate {
  if (!Number.isInteger(days)) throw new RangeError('date: days must be an integer')
  return new Date(toUtc(d) + days * 86_400_000).toISOString().slice(0, 10) as LocalDate
}

/** Whole days from a to b (b − a). */
export function diffDays(a: LocalDate, b: LocalDate): number {
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000)
}

/** Nights of a stay [checkIn, checkOut): the check-out day is not a night. */
export function nightsOf(checkIn: LocalDate, checkOut: LocalDate): LocalDate[] {
  const n = diffDays(checkIn, checkOut)
  return Array.from({ length: Math.max(0, n) }, (_, i) => addDays(checkIn, i))
}

/** 0 = Sunday … 6 = Saturday (same as Date#getUTCDay). */
export function weekday(d: LocalDate): number {
  return new Date(toUtc(d)).getUTCDay()
}

/** "2026-09" → first day of the next month ("2026-10-01"). */
export function nextMonthStart(month: string): LocalDate {
  const y = Number(month.slice(0, 4))
  const m = Number(month.slice(5, 7))
  return localDate(m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`)
}

/** "2026-09" → "2026-08". */
export function previousMonth(month: string): string {
  return addDays(localDate(`${month}-01`), -1).slice(0, 7)
}

/** A JS Date at local noon of the day — safe to hand to Intl formatters without DST edge cases. */
export function toDisplayDate(d: LocalDate): Date {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y ?? 1970, (m ?? 1) - 1, day ?? 1, 12)
}
