// Ministry of Culture and Tourism monthly accommodation statistics from KBS rows (K-24, K-29, K-36; G-150;
// 03-mimari.md §6.11). Rules confirmed by the owner with the ministry:
//  • nights = calendar-day difference between arrival and departure; same day = 1 night
//  • all nights of a stay belong to the ARRIVAL month, including nights running into the next month
//  • every KBS row is one arrival (children are not counted separately); Turkish citizens are included
//  • ministry occupancy = nights ÷ (real beds × days in month)
// Guests still in-house (KBS "1900-01-01" sentinel) are counted to the planned departure of Bismuth's own
// reservation for the same room and arrival day, otherwise to the import day; both are listed for correction.
import { diffDays, isLocalDate, localDate, type LocalDate } from '@shared/date'
import {
  mapNationality,
  ministryNameOf,
  normalizeCountryKey,
  type NationalityMatch,
  type UserCountryMap
} from './country-map'
import type { KbsRow } from './kbs-reader'

/** "YYYY-MM" */
export type StatsPeriod = string

export interface MinistryTableOptions {
  /** Real bed count for the month (capacity history, K-27); null or ≤ 0 → no occupancy. */
  beds: number | null
  /**
   * Σ beds of every day of the month, when the capacity changed during it (a room closed for repairs): replaces
   * beds × days as the denominator.
   */
  bedDays?: number | null
  /** Day in-house guests without a planned departure are counted to (the import day). */
  asOf: LocalDate
  /** Planned departures from Bismuth's reservations, keyed by `plannedDepartureKey(room, arrival)`. */
  plannedDepartures?: Readonly<Record<string, LocalDate>>
  /** User-confirmed nationality mappings keyed by normalized key. */
  userMap?: UserCountryMap
  /** Names the user gave a country for the ministry panel, by ISO code (they win over every other name). */
  countryNames?: Readonly<Record<string, string>>
}

/** A stored KBS row: its id and the user's correction of an in-house guest's last counted day. */
export interface StoredKbsRow extends KbsRow {
  id?: string
  /** Set by the user: an in-house guest is counted to this day instead of the plan or the import day. */
  manualUntil?: LocalDate | null
  /** Set by the user for a row whose nationality KBS left empty: this row's country (never remembered). */
  assignedIso2?: string | null
}

/** A KBS row with no nationality ("" or "-"): assigned to a country one row at a time (P10fix #4). */
export interface BlankNationalityRow {
  rowId: string | null
  room: string
  arrival: LocalDate
  departure: LocalDate | null
  raw: string
  /** The country the user chose for this row; null = still to assign (the table cannot be copied yet). */
  assignedIso2: string | null
}

/** No usable nationality at all: empty, "-" or only punctuation. */
export const isBlankNationality = (raw: string): boolean => normalizeCountryKey(raw) === ''

export interface MinistryTableRow {
  /** Turkish ministry name, or the raw KBS value when the nationality is unresolved. */
  country: string
  iso2: string | null
  mapped: boolean
  /** The user renamed the country for the ministry panel. */
  renamed: boolean
  /** At least one row of this country awaits the user's confirmation. */
  needsReview: boolean
  arrivals: number
  nights: number
}

/** A KBS row whose departure is before its arrival: a data error, left out of the table and the nights. */
export interface InvalidDatesRow {
  rowId: string | null
  room: string
  arrival: LocalDate
  departure: LocalDate
}

export type InHouseBasis = 'plan' | 'import_day' | 'manual'
/** How a row's nights were counted (kbs_stay_rows.nights_basis). */
export type NightsBasis = 'actual' | InHouseBasis

export interface StayCount {
  nights: number
  basis: NightsBasis
  countedUntil: LocalDate
}

export interface InHouseStay {
  /** kbs_stay_rows.id, for the user's correction (null for rows not yet stored). */
  rowId: string | null
  room: string
  arrival: LocalDate
  countedUntil: LocalDate
  nights: number
  basis: InHouseBasis
}

export interface NationalityReview {
  key: string
  /** First spelling seen in the file. */
  raw: string
  iso2: string | null
  ministryNameTr: string | null
  reason: NonNullable<NationalityMatch['reason']>
  suggestions: readonly string[]
  rows: number
}

export interface MinistryTableIssues {
  /** Arrival and departure on the same day (counted as 1 night). */
  sameDay: number
  /** Status "Aktif" in the file. */
  active: number
  /** No usable departure: counted by plan or import day (see `inHouse`). */
  missingDeparture: number
  /** Raw values that resolved to no country code. */
  unmapped: string[]
  /** Rows whose arrival is outside the period (ignored). */
  outsidePeriod: number
  /** Rows whose departure is before the arrival (not counted; see `invalidDates`). */
  invalidDates: number
}

export interface MinistryTableResult {
  period: StatsPeriod
  daysInMonth: number
  table: MinistryTableRow[]
  totals: { arrivals: number; nights: number }
  /** nights ÷ (beds × daysInMonth); a ratio, not money. */
  occupancy: number | null
  /** round(10000 × occupancy): 7368 = 73.68 %. */
  occupancyBasisPoints: number | null
  inHouse: InHouseStay[]
  review: NationalityReview[]
  /** Rows without a nationality, assigned or not (assigned ones count under their country). */
  blankNationality: BlankNationalityRow[]
  /** Rows with departure before arrival, in file order. */
  invalidDates: InvalidDatesRow[]
  issues: MinistryTableIssues
}

const PERIOD = /^(\d{4})-(0[1-9]|1[0-2])$/
const collator = new Intl.Collator('tr')

export const plannedDepartureKey = (room: string, arrival: LocalDate): string => `${room.trim()}|${arrival}`

/** Ministry rule: at least one night, same-day stays included. */
export const ministryNights = (arrival: LocalDate, until: LocalDate): number =>
  Math.max(1, diffDays(arrival, until))

export function daysInPeriod(period: StatsPeriod): number {
  const m = PERIOD.exec(period)
  if (!m) throw new RangeError(`tourism: invalid period "${period}"`)
  return new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).getUTCDate()
}

/** First day of the month after `period`: in-house guests counted to the end of the file month. */
export function periodEnd(period: StatsPeriod): LocalDate {
  const m = PERIOD.exec(period)
  if (!m) throw new RangeError(`tourism: invalid period "${period}"`)
  return localDate(new Date(Date.UTC(Number(m[1]), Number(m[2]), 1)).toISOString().slice(0, 10))
}

/**
 * Nights of one KBS row under the ministry rules: the real departure if any; for an in-house guest the planned
 * departure of the reservation with the same room and arrival day, otherwise `asOf` (the import day).
 */
export function countStayNights(
  row: StoredKbsRow,
  opts: Pick<MinistryTableOptions, 'asOf' | 'plannedDepartures'>
): StayCount {
  if (row.departure && row.departure < row.arrival)
    return { nights: 0, basis: 'actual', countedUntil: row.arrival }
  if (row.departure) {
    return {
      nights: ministryNights(row.arrival, row.departure),
      basis: 'actual',
      countedUntil: row.departure
    }
  }
  if (row.manualUntil && isLocalDate(row.manualUntil) && row.manualUntil >= row.arrival)
    return {
      nights: ministryNights(row.arrival, row.manualUntil),
      basis: 'manual',
      countedUntil: row.manualUntil
    }
  const plan = opts.plannedDepartures?.[plannedDepartureKey(row.room, row.arrival)]
  const usePlan = plan !== undefined && isLocalDate(plan) && plan >= row.arrival
  const countedUntil = usePlan ? plan : opts.asOf
  return {
    nights: ministryNights(row.arrival, countedUntil),
    basis: usePlan ? 'plan' : 'import_day',
    countedUntil
  }
}

const isActiveStatus = (status: string): boolean => normalizeCountryKey(status) === 'AKTIF'

function groupKey(nat: NationalityMatch): string {
  if (nat.iso2) return `iso:${nat.iso2}`
  if (nat.ministryNameTr) return `name:${nat.ministryNameTr}`
  return `raw:${nat.key}`
}

export function ministryTable(
  rows: readonly StoredKbsRow[],
  period: StatsPeriod,
  opts: MinistryTableOptions
): MinistryTableResult {
  const daysInMonth = daysInPeriod(period)
  const userMap = opts.userMap ?? {}
  const matches = new Map<string, NationalityMatch>()
  const byCountry = new Map<string, MinistryTableRow>()
  const review = new Map<string, NationalityReview>()
  const unmapped = new Set<string>()
  const inHouse: InHouseStay[] = []
  const blankNationality: BlankNationalityRow[] = []
  const invalidDates: InvalidDatesRow[] = []
  const issues = { sameDay: 0, active: 0, missingDeparture: 0, outsidePeriod: 0, invalidDates: 0 }

  for (const r of rows) {
    if (r.arrival.slice(0, 7) !== period) {
      issues.outsidePeriod++
      continue
    }
    if (r.departure && r.departure < r.arrival) {
      issues.invalidDates++
      invalidDates.push({ rowId: r.id ?? null, room: r.room, arrival: r.arrival, departure: r.departure })
      continue
    }
    let nat: NationalityMatch | undefined
    if (isBlankNationality(r.nationalityRaw)) {
      // Not a spelling to confirm: each such row gets its own country (or waits in the "uyruk eksik" list).
      const assigned = r.assignedIso2 ?? null
      blankNationality.push({
        rowId: r.id ?? null,
        room: r.room,
        arrival: r.arrival,
        departure: r.departure,
        raw: r.nationalityRaw,
        assignedIso2: assigned
      })
      nat = {
        raw: r.nationalityRaw,
        key: '',
        iso2: assigned,
        ministryNameTr: assigned ? ministryNameOf(assigned) : null,
        needsReview: !assigned,
        reason: null,
        suggestions: [],
        source: assigned ? 'user' : 'unmapped'
      }
    } else {
      nat = matches.get(r.nationalityRaw)
      if (!nat) {
        nat = mapNationality(r.nationalityRaw, userMap)
        matches.set(r.nationalityRaw, nat)
      }
    }

    const { nights, basis, countedUntil } = countStayNights(r, opts)
    if (basis === 'actual') {
      if (r.departure === r.arrival) issues.sameDay++
    } else {
      issues.missingDeparture++
      inHouse.push({ rowId: r.id ?? null, room: r.room, arrival: r.arrival, countedUntil, nights, basis })
    }
    if (isActiveStatus(r.status)) issues.active++

    if (nat.needsReview && nat.reason) {
      if (!nat.iso2) unmapped.add(r.nationalityRaw)
      const entry = review.get(nat.key)
      if (entry) entry.rows++
      else {
        review.set(nat.key, {
          key: nat.key,
          raw: r.nationalityRaw,
          iso2: nat.iso2,
          ministryNameTr: nat.ministryNameTr,
          reason: nat.reason,
          suggestions: nat.suggestions,
          rows: 1
        })
      }
    }

    const gk = groupKey(nat)
    let line = byCountry.get(gk)
    if (!line) {
      const own = nat.iso2 ? opts.countryNames?.[nat.iso2] : undefined
      line = {
        // Rows with no nationality and no country chosen yet: one line with an empty name ("Uyruk eksik").
        country: own ?? nat.ministryNameTr ?? (nat.key === '' ? '' : r.nationalityRaw),
        iso2: nat.iso2,
        mapped: own !== undefined || nat.ministryNameTr !== null,
        renamed: own !== undefined,
        needsReview: false,
        arrivals: 0,
        nights: 0
      }
      byCountry.set(gk, line)
    }
    line.arrivals += 1
    line.nights += nights
    line.needsReview ||= nat.needsReview
  }

  const table = [...byCountry.values()].sort(
    (a, b) => b.arrivals - a.arrivals || b.nights - a.nights || collator.compare(a.country, b.country)
  )
  const totals = table.reduce(
    (t, x) => ({ arrivals: t.arrivals + x.arrivals, nights: t.nights + x.nights }),
    {
      arrivals: 0,
      nights: 0
    }
  )
  const capacity =
    opts.bedDays != null && opts.bedDays > 0
      ? opts.bedDays
      : opts.beds !== null && opts.beds > 0
        ? opts.beds * daysInMonth
        : null
  return {
    period,
    daysInMonth,
    table,
    totals,
    occupancy: capacity ? totals.nights / capacity : null,
    occupancyBasisPoints: capacity ? Math.round((totals.nights * 10_000) / capacity) : null,
    inHouse,
    review: [...review.values()].sort((a, b) => b.rows - a.rows || collator.compare(a.raw, b.raw)),
    blankNationality,
    invalidDates,
    issues: { ...issues, unmapped: [...unmapped] }
  }
}

/** Tab-separated "country · arrivals · nights" lines to paste into the ministry panel; unresolved rows marked "?". */
export function toClipboardText(result: Pick<MinistryTableResult, 'table'>): string {
  return result.table.map((r) => `${r.mapped ? '' : '? '}${r.country}\t${r.arrivals}\t${r.nights}`).join('\n')
}
