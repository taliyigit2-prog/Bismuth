// Tourism statistics helpers (G-150, 03-mimari.md §6.11): the reportable months and the ministry's window, the
// occupancy precision the panel shows, the text copied into the panel, and the file in and out of the screen.
import { shell } from '@/lib/shell'
import { addDays, localDate, nextMonthStart, previousMonth, type LocalDate } from '@shared/date'
import {
  KBS_MAX_BASE64,
  type TourismCountryOption,
  type TourismImportView,
  type TourismTableView
} from '@shared/contract/tourism'

type Row = TourismTableView['table'][number]

/** One line for the ministry panel: Turkish country name, arrivals, nights (tab-separated). */
export const copyRow = (r: Pick<Row, 'country' | 'arrivals' | 'nights'>): string =>
  `${r.country}\t${r.arrivals}\t${r.nights}`

/**
 * Digits of the ministry occupancy: one decimal like the owner's reports (%73,7), two below 1 % so a small hotel's
 * month still shows what the panel shows (1 arrival, 2 nights, 28 beds, 30 days → %0,24).
 */
export const occupancyDigits = (basisPoints: number): number => (basisPoints < 100 ? 2 : 1)

/** The twelve months that can be reported, newest first (up to the month before today's). */
export function reportableMonths(today: LocalDate): string[] {
  const out: string[] = []
  let m = previousMonth(today.slice(0, 7))
  for (let i = 0; i < 12; i++) {
    out.push(m)
    m = previousMonth(m)
  }
  return out
}

/** The months the screen offers: the last twelve plus every month that has an import (an older file). */
export function monthOptions(
  today: LocalDate,
  imports: readonly Pick<TourismImportView, 'period'>[]
): string[] {
  const set = new Set([...reportableMonths(today), ...imports.map((i) => i.period)])
  return [...set].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
}

/** The reporting window of a month: the 1st to the 10th of the next month (G-93). */
export function reportWindow(month: string): { from: LocalDate; to: LocalDate } {
  const from = nextMonthStart(month)
  return { from, to: addDays(from, 9) }
}

export const firstDay = (month: string): LocalDate => localDate(`${month}-01`)

/** The newest import of a month (imports arrive newest first). */
export const latestOf = (
  imports: readonly TourismImportView[],
  month: string
): TourismImportView | undefined => imports.find((i) => i.period === month)

/** The largest file whose base64 fits the procedure (≈5.6 MB; a real month is ≈100 KB). */
export const MAX_FILE_BYTES = Math.floor((KBS_MAX_BASE64 * 3) / 4)

/** Why a picked file is refused before it is read (null = fine). */
export function fileProblem(file: Pick<File, 'name' | 'size'>): 'wrongType' | 'tooLarge' | null {
  if (!/\.xlsx$/i.test(file.name)) return 'wrongType'
  if (file.size > MAX_FILE_BYTES) return 'tooLarge'
  return null
}

/** File bytes → base64 for the JSON envelope (chunked: a spread of 100 KB of bytes overflows the stack). */
export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

/** Saves a base64 file (the shell: Electron asks where to save it, a browser downloads it). */
export function saveBase64(fileName: string, mime: string, dataBase64: string): void {
  shell.saveFile({ fileName, mime, base64: dataBase64 })
}

/** Turkish-aware search key: "kıbrıs", "KIBRIS" and "Kibris" find the same country. */
export const searchKey = (s: string): string =>
  s.toLocaleLowerCase('tr').normalize('NFD').replace(/\p{M}/gu, '').replace(/ı/g, 'i')

export function matchCountries(
  options: readonly TourismCountryOption[],
  query: string,
  limit = 60
): TourismCountryOption[] {
  const q = searchKey(query.trim())
  if (!q) return options.slice(0, limit)
  const starts: TourismCountryOption[] = []
  const contains: TourismCountryOption[] = []
  for (const o of options) {
    const k = searchKey(o.name)
    if (k.startsWith(q)) starts.push(o)
    else if (k.includes(q) || o.iso2.toLowerCase() === q) contains.push(o)
  }
  return [...starts, ...contains].slice(0, limit)
}

/** Rows still in the way of the copy: spellings to confirm and rows without a nationality not yet assigned. */
export const pendingOf = (table: Pick<TourismTableView, 'review' | 'blankNationality'>): number =>
  table.review.length + table.blankNationality.filter((r) => !r.country).length
