// Pure model of the reservation grid (faz-05 madde 1, 6, 7, 8): the column range (G-31: its years come from the
// data), the month windows it is read in, merging those windows, bar geometry (a multi-night stay is one bar; a day-use that shares its day
// with a night splits the cell in two), cell colours by the §6.14 rule, what sits in a cell, keyboard moves and
// the legend. No React here: the grid component and the tests share it.
import { STATUS_KEYS, type ProcedureOutput, type StatusKey } from '@shared/contract'
import { addDays, diffDays, localDate, weekday, type LocalDate } from '@shared/date'
import { calendarYears, type CalendarYears } from '@shared/domain/calendar-range'
import { cellStyle, type CustomTagLike } from '@shared/domain/cell-status'
import { deriveNightStatus } from '@shared/domain/night-status'
import type { LegendItem } from '@/components/legend'
import type { CellPaint, StayIcon } from '@/components/tape-chart/tape-chart'

export type GridPage = ProcedureOutput<'reservations.grid'>
export type GridRoomView = GridPage['rooms'][number]
export type GridStayView = GridPage['stays'][number]
export type GridBlockView = GridPage['blocks'][number]
export type GridDayView = GridPage['days'][number]
type TagView = ProcedureOutput<'statusTags.list'>[number]

// ── Range ───────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Column 0 and the number of day columns: 1 January of the first year to 31 December of the last (G-31; the years
 * come from the main computer, `calendar.bounds`).
 */
export function gridBounds(years: CalendarYears): { start: LocalDate; count: number } {
  const start = localDate(`${years.firstYear}-01-01`)
  const end = localDate(`${years.lastYear + 1}-01-01`)
  return { start, count: diffDays(start, end) }
}

/** The years without any record or setting (last year to ten years on): what the grid falls back to. */
export const defaultYears = (today: LocalDate): CalendarYears =>
  calendarYears({ thisYear: Number(today.slice(0, 4)), startYear: null, oldestYear: null, newestYear: null })

export const monthStart = (d: LocalDate): LocalDate => localDate(`${d.slice(0, 7)}-01`)

export function nextMonth(d: LocalDate): LocalDate {
  const y = Number(d.slice(0, 4))
  const m = Number(d.slice(5, 7))
  return localDate(m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`)
}

/** Whole-month windows [first of month, first of next month) covering [from, to): what the grid reads. */
export function monthsCovering(from: LocalDate, to: LocalDate): { from: LocalDate; to: LocalDate }[] {
  const out: { from: LocalDate; to: LocalDate }[] = []
  for (let m = monthStart(from); m < to; m = nextMonth(m)) out.push({ from: m, to: nextMonth(m) })
  return out
}

/**
 * The columns to draw for a scroll position: the visible ones plus a margin, snapped to whole weeks so a few
 * pixels of scrolling do not redraw the grid (faz-05: only the visible range is drawn).
 */
export function renderWindow(
  firstVisible: number,
  visibleCount: number,
  count: number,
  chunk = 14
): { from: number; to: number } {
  const from = Math.max(0, Math.floor((firstVisible - chunk) / chunk) * chunk)
  const to = Math.min(count, Math.ceil((firstVisible + visibleCount + chunk) / chunk) * chunk)
  return { from, to: Math.max(from, to) }
}

// ── Merge ───────────────────────────────────────────────────────────────────────────────────────────────────

export interface GridModel {
  today: LocalDate | null
  rooms: GridRoomView[]
  stays: GridStayView[]
  blocks: GridBlockView[]
  /** Holidays, special days, events and notes by date. */
  days: Map<string, GridDayView[]>
}

/** One model from the loaded month windows (a stay or block crossing months comes once). */
export function mergePages(pages: readonly GridPage[]): GridModel {
  const stays = new Map<string, GridStayView>()
  const blocks = new Map<string, GridBlockView>()
  const days = new Map<string, GridDayView[]>()
  const seenDay = new Set<string>()
  for (const page of pages) {
    for (const s of page.stays) stays.set(s.id, s)
    for (const b of page.blocks) blocks.set(b.id, b)
    for (const d of page.days) {
      const key = `${d.id}|${d.date}`
      if (seenDay.has(key)) continue
      seenDay.add(key)
      days.set(d.date, [...(days.get(d.date) ?? []), d])
    }
  }
  const first = pages[0]
  return {
    today: first?.today ?? null,
    rooms: first?.rooms ?? [],
    stays: [...stays.values()],
    blocks: [...blocks.values()],
    days
  }
}

// ── Geometry ────────────────────────────────────────────────────────────────────────────────────────────────

export interface StayBar {
  stay: GridStayView
  /** Column from the grid start; .5 = the second half of a split cell. */
  start: number
  /** In day columns (0.5 for half a split cell). */
  width: number
  /** "Aynı gün iki misafir" (G-37): the day-use takes the cell's first half, the night stay the second. */
  split: 'start' | 'end' | null
  /**
   * Several hourly stays of one room and day (K-48) are stacked in lanes in the order of their hours: `lane` of
   * `lanes` (0 of 1 for every other bar).
   */
  lane: number
  lanes: number
}

/** Bars of one room's stays (G-34, G-37): one bar per stay, cells split where a day-use meets a night. */
export function stayBars(stays: readonly GridStayView[], base: LocalDate): StayBar[] {
  const nightDates = new Set<string>()
  const dayUseDates = new Set<string>()
  for (const s of stays) {
    if (s.dayUse) dayUseDates.add(s.checkIn)
    else for (const n of s.nights) nightDates.add(n.date)
  }
  const lanes = hourLanes(stays)
  return stays.map((stay) => {
    const col = diffDays(base, stay.checkIn)
    const lane = lanes.get(stay.id) ?? { lane: 0, lanes: 1 }
    if (stay.dayUse) {
      const shared = nightDates.has(stay.checkIn)
      return { stay, start: col, width: shared ? 0.5 : 1, split: shared ? 'start' : null, ...lane }
    }
    const width = Math.max(1, diffDays(stay.checkIn, stay.checkOut))
    if (dayUseDates.has(stay.checkIn))
      return { stay, start: col + 0.5, width: width - 0.5, split: 'end', ...lane }
    return { stay, start: col, width, split: null, ...lane }
  })
}

/**
 * Lanes of the day-use stays of one room: the stays of one day (hourly sales of a room never overlap in time, so each
 * gets a lane of its own) are stacked in the order of their hours, `lanes` = how many that day holds.
 */
function hourLanes(stays: readonly GridStayView[]): Map<string, { lane: number; lanes: number }> {
  const byDay = new Map<string, GridStayView[]>()
  for (const s of stays) if (s.dayUse) byDay.set(s.checkIn, [...(byDay.get(s.checkIn) ?? []), s])
  const out = new Map<string, { lane: number; lanes: number }>()
  for (const day of byDay.values()) {
    const sorted = [...day].sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''))
    sorted.forEach((s, lane) => out.set(s.id, { lane, lanes: sorted.length }))
  }
  return out
}

/** A block covers [dateFrom, dateTo) like a stay's nights. */
export function blockSpan(block: GridBlockView, base: LocalDate): { start: number; width: number } {
  return {
    start: diffDays(base, block.dateFrom),
    width: Math.max(1, diffDays(block.dateFrom, block.dateTo))
  }
}

export const overlaps = (start: number, width: number, from: number, to: number): boolean =>
  start < to && start + width > from

// ── Colours (§6.14) ─────────────────────────────────────────────────────────────────────────────────────────

export interface StatusSetup {
  /** Automatic statuses the hotel keeps on. */
  enabled: ReadonlySet<StatusKey>
  /** The hotel's own tags, in their order. */
  custom: (CustomTagLike & { name: string; description: string | null })[]
}

/** Enabled automatic statuses and custom tags from `statusTags.list` (everything on while it loads). */
export function statusSetup(tags: readonly TagView[] | undefined): StatusSetup {
  if (!tags) return { enabled: new Set(STATUS_KEYS), custom: [] }
  const sorted = [...tags].sort((a, b) => a.sort - b.sort)
  return {
    enabled: new Set(
      sorted
        .filter((t) => t.kind === 'auto' && t.enabled)
        .map((t) => t.code)
        .filter((code): code is StatusKey => (STATUS_KEYS as readonly string[]).includes(code))
    ),
    custom: sorted
      .filter((t) => t.kind === 'custom')
      .map((t) => ({
        id: t.id,
        enabled: t.enabled,
        priorityOverAuto: t.priorityOverAuto,
        name: t.name ?? t.code,
        description: t.description
      }))
  }
}

export interface StayPaint {
  nights: { date: LocalDate; fill: CellPaint }[]
  border: CellPaint
  depositIcon: boolean
}

/** Night-by-night fill and the bar border of a stay: automatic status, custom tags on top (§6.14). */
export function paintStay(stay: GridStayView, setup: StatusSetup): StayPaint {
  const tags = setup.custom.filter((t) => stay.tagIds.includes(t.id))
  let depositIcon = false
  let border: CellPaint = null
  const nights = stay.nights.map((n, i) => {
    const style = cellStyle(
      { pay: n.pay, dayUse: stay.dayUse, blocked: false, past: false },
      setup.enabled,
      tags
    )
    depositIcon ||= style.depositIcon
    if (i === 0) border = style.border
    return { date: n.date, fill: style.fill }
  })
  return { nights, border, depositIcon }
}

/** Colour of an empty cell: grey before today, white from today (G-41), when the hotel keeps them on. */
export function emptyCellStatus(past: boolean, enabled: ReadonlySet<StatusKey>): StatusKey | null {
  if (past && enabled.has('pastEmpty')) return 'pastEmpty'
  return enabled.has('empty') ? 'empty' : null
}

/** Small marks on a bar, most urgent first; colour never carries the meaning alone. */
export function stayIcons(stay: GridStayView, depositIcon: boolean): StayIcon[] {
  const icons: StayIcon[] = []
  if (stay.groupId) icons.push('group')
  if (stay.standingNote?.level === 'warn') icons.push('warn')
  if (stay.kbsMissing) icons.push('kbs')
  if (stay.vip) icons.push('vip')
  if (stay.standingNote?.level === 'info') icons.push('request')
  if (stay.hasNotes) icons.push('note')
  if (stay.children > 0) icons.push('child')
  if (depositIcon) icons.push('deposit')
  return icons
}

/** Frame colours of group reservations (G-194), in rotation: `--group-1…6` in globals.css (full class names for Tailwind). */
const GROUP_RINGS = [
  'ring-(--group-1)',
  'ring-(--group-2)',
  'ring-(--group-3)',
  'ring-(--group-4)',
  'ring-(--group-5)',
  'ring-(--group-6)'
] as const

/** The same group always gets the same frame colour (a small hash of its id). */
export function groupRing(groupId: string): string {
  let h = 0
  for (const ch of groupId) h = (h * 31 + ch.charCodeAt(0)) % 997
  return GROUP_RINGS[h % GROUP_RINGS.length]!
}

/** Legend: the automatic statuses kept on, then the hotel's own tags (G-33). */
export function legendItems(
  tags: readonly TagView[] | undefined,
  label: (tag: TagView) => string
): LegendItem[] {
  const sorted = [...(tags ?? [])].sort((a, b) => a.sort - b.sort)
  return [
    ...sorted
      .filter((t) => t.kind === 'auto' && t.enabled)
      .filter((t) => (STATUS_KEYS as readonly string[]).includes(t.code))
      .map((t) => ({
        id: t.id,
        subject: { kind: 'auto' as const, code: t.code as StatusKey },
        label: label(t),
        description: t.description
      })),
    ...sorted
      .filter((t) => t.kind === 'custom' && t.enabled)
      .map((t) => ({
        id: t.id,
        subject: { kind: 'custom' as const, tagId: t.id },
        label: label(t),
        description: t.description,
        asBorder: !t.priorityOverAuto
      }))
  ]
}

// ── Cells and the keyboard (G-19) ───────────────────────────────────────────────────────────────────────────

/** Stays in a room on a date: the day-use first, then the night (a split cell holds both). */
export function staysAt(stays: readonly GridStayView[], roomId: string, date: LocalDate): GridStayView[] {
  return stays
    .filter(
      (s) => s.roomId === roomId && (s.dayUse ? s.checkIn === date : s.checkIn <= date && date < s.checkOut)
    )
    .sort((a, b) => Number(b.dayUse) - Number(a.dayUse))
}

export const blockAt = (
  blocks: readonly GridBlockView[],
  roomId: string,
  date: LocalDate
): GridBlockView | undefined =>
  blocks.find((b) => b.roomId === roomId && b.dateFrom <= date && date < b.dateTo)

export interface Cursor {
  /** Index into the room rows. */
  row: number
  /** Day column from the grid start. */
  col: number
}

const MOVES: Record<string, [number, number]> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
  PageUp: [0, -7],
  PageDown: [0, 7]
}

/** The cell an arrow key (or PageUp/PageDown: a week) moves to, kept inside the grid; null for other keys. */
export function moveCursor(cursor: Cursor, key: string, rows: number, cols: number): Cursor | null {
  const step = MOVES[key]
  if (!step) return null
  return {
    row: Math.min(Math.max(0, cursor.row + step[0]), Math.max(0, rows - 1)),
    col: Math.min(Math.max(0, cursor.col + step[1]), Math.max(0, cols - 1))
  }
}

export const dateAt = (base: LocalDate, col: number): LocalDate => addDays(base, col)

// ── Day list, day notes (phone, header) ─────────────────────────────────────────────────────────────────────

export interface DayActivity {
  arrivals: GridStayView[]
  departures: GridStayView[]
  staying: GridStayView[]
  /** Sellable rooms with no night and no block on the day, in grid order ("Boş oda bul" counts the same). */
  free: GridRoomView[]
}

/** Who comes, leaves and stays on `day`, and the rooms left free (a day-use counts as an arrival). */
export function dayActivity(page: GridPage, day: LocalDate): DayActivity {
  const stays = page.stays
  const arrivals = stays.filter((s) => s.checkIn === day)
  const departures = stays.filter((s) => !s.dayUse && s.checkOut === day)
  const staying = stays.filter((s) => !s.dayUse && s.checkIn < day && day < s.checkOut)
  const busy = new Set(staysOnDay(stays, day).map((s) => s.roomId))
  const free = page.rooms.filter((r) => r.sellable && !busy.has(r.id) && !blockAt(page.blocks, r.id, day))
  return { arrivals, departures, staying, free }
}

const staysOnDay = (stays: readonly GridStayView[], day: LocalDate): GridStayView[] =>
  stays.filter((s) => (s.dayUse ? s.checkIn === day : s.checkIn <= day && day < s.checkOut))

/** The automatic status a stay shows on a day (its night that day, else its last night: a departure). */
export function nightStatusOn(stay: GridStayView, day: LocalDate, today: LocalDate): StatusKey | null {
  const night = stay.nights.find((n) => n.date === day) ?? stay.nights.at(-1)
  return night ? deriveNightStatus({ date: night.date, pay: night.pay, dayUse: stay.dayUse }, today) : null
}

/** A seeded holiday name in the interface language, else the stored title. */
export function dayTitle(entry: GridDayView, locale: 'tr' | 'en' | 'ru'): string {
  return entry.titleI18n?.[locale] || entry.titleI18n?.tr || entry.title || ''
}

export type NoteMode = 'weekdays' | 'range' | 'list'

/** How many days a target covers (what the service will write). */
export function countDays(
  mode: NoteMode,
  from: LocalDate,
  to: LocalDate,
  weekdays: readonly number[],
  pasted: readonly string[]
): number {
  if (mode === 'list') return pasted.length
  const span = diffDays(from, to) + 1
  if (span <= 0) return 0
  if (mode === 'range') return span
  let n = 0
  for (let i = 0; i < span; i++) if (weekdays.includes(weekday(addDays(from, i)))) n++
  return n
}
