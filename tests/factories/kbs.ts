// Synthetic KBS data for the tourism statistics tests (K-24, K-29, K-36). Test-only: no production module imports
// it. Reproduces the shape of the owner's September 2026 file (607 arrivals, 840 nights, 248 same-day stays,
// 23 countries, 5 guests still in-house) from aggregate counts only; identity columns hold obvious masked
// placeholders. A real KBS export never enters the repository.
import ExcelJS from 'exceljs'
import { addDays, localDate, type LocalDate } from '@shared/date'
import { normalizeCountryKey } from '../../src/main/services/tourism/country-map'
import type { KbsRow } from '../../src/main/services/tourism/kbs-reader'

interface CountryPlan {
  nationality: string
  sameDay: number
  /** Arrival days of guests still in-house at export time. */
  inHouse: readonly string[]
  stays: number
  stayNights: number
}

// Per-country arrivals/nights match the September table in docs/plan/04-arastirma/faz0-prototipler.md §3 for the
// six largest countries; the remaining 17 countries are invented.
const SEPTEMBER_PLAN: readonly CountryPlan[] = [
  {
    nationality: 'TÜRKİYE',
    sameDay: 240,
    inHouse: ['2026-09-29', '2026-09-30', '2026-09-30'],
    stays: 282,
    stayNights: 421
  },
  {
    nationality: 'GERMANY (Deutschland)',
    sameDay: 0,
    inHouse: ['2026-09-29', '2026-09-30'],
    stays: 21,
    stayNights: 85
  },
  { nationality: 'UZBEKISTAN', sameDay: 5, inHouse: [], stays: 15, stayNights: 15 },
  { nationality: 'KUZEY KIBRIS TURK CUMHURİYETİ', sameDay: 0, inHouse: [], stays: 10, stayNights: 24 },
  { nationality: 'AZERBAIJAN', sameDay: 3, inHouse: [], stays: 2, stayNights: 2 },
  { nationality: 'RUSSIAN FEDERATION', sameDay: 0, inHouse: [], stays: 3, stayNights: 6 },
  { nationality: 'IRAN, ISLAMIC REPUBLIC OF', sameDay: 0, inHouse: [], stays: 2, stayNights: 4 },
  {
    nationality: 'SWITZERLAND (Confederation of Helvetia)',
    sameDay: 0,
    inHouse: [],
    stays: 2,
    stayNights: 3
  },
  { nationality: 'UNITED STATES', sameDay: 0, inHouse: [], stays: 2, stayNights: 4 },
  { nationality: 'UNITED KINGDOM', sameDay: 0, inHouse: [], stays: 2, stayNights: 3 },
  ...['FRANCE', 'ITALY', 'NETHERLANDS', 'POLAND', 'UKRAINE', 'KAZAKHSTAN', 'GEORGIA', 'IRAQ'].map(
    (nationality) => ({
      nationality,
      sameDay: 0,
      inHouse: [],
      stays: 1,
      stayNights: 1
    })
  ),
  ...['SYRIAN ARAB REPUBLIC', 'PALESTINIAN TERRITORIES', 'KOREA, REPUBLIC OF', 'JAPAN', 'EGYPT'].map(
    (nationality) => ({ nationality, sameDay: 0, inHouse: [], stays: 1, stayNights: 2 })
  )
]

export const SEPTEMBER_EXPECTED = {
  period: '2026-09',
  arrivals: 607,
  /** In-house guests counted to the end of the file month (asOf 2026-10-01). */
  nights: 840,
  /** Same file with in-house guests counted to 30 September (each 1 night). */
  nightsAsOfLastDay: 838,
  sameDay: 248,
  countries: 23,
  inHouse: 5
} as const

const ROOMS = [
  101, 102, 103, 104, 105, 201, 202, 203, 204, 205, 301, 302, 303, 304, 305, 401, 402, 403, 404
].map(String)

const day = (d: number): LocalDate => localDate(`2026-09-${String(d).padStart(2, '0')}`)

/** 607 synthetic KBS rows for September 2026 (no identity data: KbsRow has none). */
export function septemberRows(): KbsRow[] {
  const rows: KbsRow[] = []
  let n = 0
  let sameIdx = 0
  let stayIdx = 0
  let inHouseIdx = 0
  for (const c of SEPTEMBER_PLAN) {
    for (let i = 0; i < c.sameDay; i++, n++, sameIdx++) {
      const d = day(1 + (sameIdx % 30))
      const room = ROOMS[n % ROOMS.length] ?? '101'
      rows.push({
        arrival: d,
        departure: d,
        room,
        nationalityRaw: c.nationality,
        status: 'Pasif'
      })
    }
    for (const a of c.inHouse) {
      const room = ROOMS[inHouseIdx++] ?? '101' // distinct rooms: room + arrival identifies the reservation
      rows.push({
        arrival: localDate(a),
        departure: null,
        room,
        nationalityRaw: c.nationality,
        status: 'Aktif'
      })
      n++
    }
    const base = Math.floor(c.stayNights / c.stays)
    const extra = c.stayNights % c.stays
    for (let i = 0; i < c.stays; i++, n++, stayIdx++) {
      const arrival = day(1 + (stayIdx % 28))
      const nights = base + (i < extra ? 1 : 0)
      const room = ROOMS[n % ROOMS.length] ?? '101'
      rows.push({
        arrival,
        departure: addDays(arrival, nights), // late-September stays run into October
        room,
        nationalityRaw: c.nationality,
        status: 'Pasif'
      })
    }
  }
  return rows.sort((a, b) => (a.arrival < b.arrival ? -1 : a.arrival > b.arrival ? 1 : 0))
}

/** Header row of the real export, identity columns included. */
export const KBS_EXPORT_HEADERS = [
  'Tc Kimlik No',
  'Geçerli Belge',
  'Adı',
  'Soyadı',
  'Araç Plakası',
  'Geliş Tarihi',
  'Çıkış Tarihi',
  'Verilen Oda',
  'Cinsiyet',
  'Uyruğu',
  'Durum'
] as const

/** Values placed in identity columns; a reader must never return any of them. */
export const IDENTITY_MARKERS = {
  'Tc Kimlik No': '00******000',
  'Geçerli Belge': 'U0*****',
  Adı: 'GİZLİAD*****',
  Soyadı: 'GİZLİSOYAD*****',
  'Araç Plakası': '00***00'
} as const

const serial = (d: LocalDate, hour: number, minute = 0): number =>
  Date.parse(`${d}T00:00:00Z`) / 86_400_000 + 25_569 + (hour * 60 + minute) / 1440

/** KBS writes Excel serial 1 ("1900-01-01") for guests who have not checked out. */
const NOT_CHECKED_OUT = 1

export interface KbsSheetOptions {
  /** Header order (defaults to the real export's). Unknown headers get blank cells. */
  headers?: readonly string[]
  /** Title lines written above the header row. */
  leadingRows?: readonly string[]
  sheetName?: string
}

/** Build an in-memory .xlsx shaped like the KBS export: Excel serial dates with times, sparse cells. */
export async function kbsWorkbookBuffer(
  rows: readonly KbsRow[],
  opts: KbsSheetOptions = {}
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(opts.sheetName ?? ' EGM_Konaklayan_Listesi')
  const headers = opts.headers ?? KBS_EXPORT_HEADERS
  let r = 1
  for (const title of opts.leadingRows ?? []) ws.getRow(r++).getCell(1).value = title
  headers.forEach((h, c) => (ws.getRow(r).getCell(c + 1).value = h))
  r++
  rows.forEach((row, i) => {
    const sameDay = row.departure === row.arrival
    const turkish = row.nationalityRaw === 'TÜRKİYE'
    const values: Record<string, string | number | null> = {
      'Tc Kimlik No': turkish ? IDENTITY_MARKERS['Tc Kimlik No'] : null,
      'Geçerli Belge': turkish ? null : IDENTITY_MARKERS['Geçerli Belge'],
      Adı: IDENTITY_MARKERS.Adı,
      Soyadı: IDENTITY_MARKERS.Soyadı,
      'Araç Plakası': i % 9 === 0 ? IDENTITY_MARKERS['Araç Plakası'] : null,
      'Geliş Tarihi': sameDay ? serial(row.arrival, 1 + (i % 8)) : serial(row.arrival, 14 + (i % 10), 30),
      'Çıkış Tarihi': row.departure ? serial(row.departure, 11) : NOT_CHECKED_OUT,
      'Verilen Oda': /^\d+$/.test(row.room) ? Number(row.room) : row.room,
      // Present in a real export; the reader must ignore it (not needed for the statistics, KVKK).
      Cinsiyet: i % 7 === 6 ? null : i % 2 === 0 ? 'Erkek' : 'Kadın',
      Uyruğu: row.nationalityRaw,
      Durum: row.status
    }
    const byHeader = new Map(Object.entries(values).map(([k, v]) => [normalizeCountryKey(k), v] as const))
    const line = ws.getRow(r++)
    headers.forEach((h, c) => {
      const v = byHeader.get(normalizeCountryKey(h)) // tolerate case/spacing variants of a header
      if (v !== null && v !== undefined && v !== '') line.getCell(c + 1).value = v // absent cells stay absent
    })
  })
  return Buffer.from(await wb.xlsx.writeBuffer())
}
