// The reservation grid (faz-05 madde 1, 5, 7, 8; G-30…G-47): rooms down, ten years of days across, drawn only
// around what is on screen (column virtualisation: the visible days plus a margin, snapped to weeks). Room column
// and day header stay put; one bar per stay coloured night by night (§6.14), blocks striped with a lock or wrench,
// today's column marked, holidays and notes in the header. Keyboard: arrows (PageUp/PageDown a week) move a cell
// cursor, Enter opens, N starts a reservation, Home goes to today. The grid is a `dir="ltr"` island; computed
// positions and sizes are the only inline styles (the rule's exception for virtualised grids).
import {
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type Ref
} from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangleIcon,
  BabyIcon,
  CheckIcon,
  CoinsIcon,
  ConciergeBellIcon,
  CrownIcon,
  FlagIcon,
  FlagTriangleRightIcon,
  LockIcon,
  MessageSquareTextIcon,
  ShieldAlertIcon,
  StarIcon,
  StickyNoteIcon,
  TicketIcon,
  WrenchIcon
} from 'lucide-react'
import type { StatusKey } from '@shared/contract'
import { diffDays, weekday, type LocalDate } from '@shared/date'
import type { LegendItem } from '@/components/legend'
import type { CellPaint, StayIcon } from '@/components/tape-chart/tape-chart'
import { useFormat } from '@/hooks/use-format'
import { STATUS_BORDER, STATUS_FILL, tagBorder, tagFill } from '@/lib/status-style'
import { tagClass } from '@/lib/theme/user-theme'
import { cn } from '@/lib/utils'
import { matchesShortcut, shortcutById, type ShortcutDef } from '@/lib/shortcuts/registry'
import { countRender } from '@/lib/render-count'
import { dropTarget, sameMove, type StayMove } from './drag'
import {
  blockAt,
  blockSpan,
  dateAt,
  emptyCellStatus,
  monthStart,
  moveCursor,
  nextMonth,
  overlaps,
  paintStay,
  renderWindow,
  stayBars,
  staysAt,
  stayIcons,
  type Cursor,
  type GridBlockView,
  type GridDayView,
  type GridModel,
  type GridStayView,
  type StatusSetup,
  type StayBar,
  type StayPaint
} from './grid-model'

/** Fallback sizes before the first measurement (and in tests): 3.5rem day, 9.5rem room column. */
const DAY_PX = 56
const ROOM_PX = 152
const FALLBACK_VISIBLE = 14

const gridKey = (id: string): ShortcutDef => {
  const def = shortcutById(id)
  if (!def) throw new Error(`shortcut ${id} missing`)
  return def
}
const GRID_KEYS = {
  today: gridKey('calendar-today'),
  open: gridKey('calendar-open'),
  new: gridKey('calendar-new')
}

export interface GridHandle {
  /** Scrolls so `col` is the first column after a few days of context. */
  scrollToCol: (col: number) => void
  /** Moves the cursor to a cell, scrolls it into view and focuses the grid. */
  focusCell: (cell: Cursor) => void
}

export interface FreeHighlight {
  roomIds: ReadonlySet<string>
  from: LocalDate
  /** Exclusive (a day-use: from + 1). */
  to: LocalDate
}

/** What the room column says about a room's open issues. */
export interface RoomIssueMark {
  count: number
  urgent: boolean
  titles: string[]
}

export interface CalendarGridProps {
  model: GridModel
  /** Date of column 0. */
  base: LocalDate
  count: number
  today: LocalDate
  /** First column shown on mount. */
  initialCol: number
  setup: StatusSetup
  legend: readonly LegendItem[]
  highlight: readonly number[]
  free: FreeHighlight | null
  flashStayId: string | null
  onOpenStay: (stay: GridStayView) => void
  onOpenCell: (roomId: string, date: LocalDate) => void
  /** A block (satılmaz / kullanım dışı) was clicked or opened with Enter. */
  onOpenBlock: (block: GridBlockView) => void
  /** Open issues by room id (the room column shows a wrench, G-180). */
  issues: ReadonlyMap<string, RoomIssueMark>
  onOpenDay: (date: LocalDate) => void
  /** The first visible column and how many fit (the page reads months and names the month from it). */
  onView: (first: number, visible: number) => void
  /**
   * Drag-and-drop (faz-15 madde 12): a bar dropped on another room or other dates asks this to confirm the move;
   * without it (a role that may not change the calendar) bars do not drag.
   */
  onMoveStay?: (move: StayMove) => void
  ref?: Ref<GridHandle>
}

const ICON: Record<StayIcon, typeof CrownIcon> = {
  note: MessageSquareTextIcon,
  request: ConciergeBellIcon,
  vip: CrownIcon,
  kbs: ShieldAlertIcon,
  warn: AlertTriangleIcon,
  deposit: CoinsIcon,
  child: BabyIcon
}

const DAY_ICON: Record<GridDayView['kind'], typeof FlagIcon> = {
  holiday: FlagIcon,
  half_holiday: FlagTriangleRightIcon,
  special: StarIcon,
  event: TicketIcon,
  note: StickyNoteIcon
}

const HK_DOT = {
  clean: 'bg-hk-clean',
  dirty: 'bg-hk-dirty',
  inspected: 'bg-hk-inspected',
  maintenance: 'bg-hk-maintenance',
  out_of_order: 'bg-hk-ooo'
} as const

/** A second carrier beside the colour: clean a dot, dirty a diamond, inspected a ring, closed rooms a square. */
const HK_SHAPE = {
  clean: 'rounded-full',
  dirty: 'rotate-45 rounded-[1px]',
  inspected: 'rounded-full ring-2 ring-hk-inspected ring-offset-1 ring-offset-card size-1.5',
  maintenance: 'rounded-[1px]',
  out_of_order: 'rounded-[1px]'
} as const

const STATUS_TEXT: Record<StatusKey, string> = {
  paid: 'text-status-paid-fg',
  unpaid: 'text-status-unpaid-fg',
  partial: 'text-status-partial-fg',
  dayuse: 'text-status-dayuse-fg',
  pastEmpty: 'text-status-past-empty-fg',
  empty: 'text-status-empty-fg',
  blocked: 'text-status-blocked-fg'
}

const paintFill = (p: CellPaint): string =>
  p === null ? 'bg-muted' : p.kind === 'auto' ? STATUS_FILL[p.code] : tagFill(p.tagId)
const paintText = (p: CellPaint): string =>
  p === null
    ? 'text-foreground'
    : p.kind === 'auto'
      ? STATUS_TEXT[p.code]
      : `${tagClass(p.tagId)} text-tag-fg`
const paintBorder = (p: CellPaint): string =>
  p === null ? 'border-transparent' : p.kind === 'auto' ? STATUS_BORDER[p.code] : tagBorder(p.tagId)

/** Names of the paints for words next to the colour ("Ödendi, VIP"). */
function paintNames(legend: readonly LegendItem[], paints: readonly CellPaint[]): string[] {
  const names: string[] = []
  for (const p of paints) {
    if (p === null) continue
    const item = legend.find((l) =>
      l.subject.kind === 'auto'
        ? p.kind === 'auto' && l.subject.code === p.code
        : p.kind === 'custom' && l.subject.tagId === p.tagId
    )
    if (item && !names.includes(item.label)) names.push(item.label)
  }
  return names
}

/** A seeded name in the interface language, else the stored text. */
const localized = (
  i18n: Partial<Record<'tr' | 'en' | 'ru', string>> | null,
  fallback: string,
  locale: 'tr' | 'en' | 'ru'
): string => i18n?.[locale] || i18n?.tr || fallback

/** "Gündüz Konuk" → "GK" (a half cell). */
const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.slice(0, 1))
    .join('')

const colLeft = (col: number, pad = 0): string => `calc(var(--tape-day) * ${col} + ${pad}px)`
const colWidth = (cols: number, pad = 0): string => `calc(var(--tape-day) * ${cols} - ${pad}px)`
/**
 * Where a bar's name sits, from the bar's own left edge: its first column, or the first column on screen when the
 * bar's start is scrolled away. `--first-col` is set on the scroller each time the first visible column changes
 * (no React render), so the name follows the scroll column by column without redrawing the grid.
 */
const labelLeft = (start: number, pad = 0): string =>
  `calc(var(--tape-day) * (max(${start}, var(--first-col, 0)) - ${start}) + ${pad}px)`

export const CalendarGrid = memo(function CalendarGrid({
  model,
  base,
  count,
  today,
  initialCol,
  setup,
  legend,
  highlight,
  free,
  flashStayId,
  onOpenStay,
  onOpenCell,
  onOpenBlock,
  issues,
  onOpenDay,
  onView,
  onMoveStay,
  ref
}: CalendarGridProps) {
  const { t } = useTranslation()
  const f = useFormat()
  const scroller = useRef<HTMLDivElement>(null)
  const dayProbe = useRef<HTMLDivElement>(null)
  const roomProbe = useRef<HTMLDivElement>(null)
  const rowProbe = useRef<HTMLDivElement>(null)
  const metrics = useRef({ day: DAY_PX, room: ROOM_PX, row: 40 })
  // Where the screen is: kept in a ref, so scrolling re-renders only when the drawn window moves (whole weeks).
  const view = useRef({ first: Math.max(0, initialCol), visible: FALLBACK_VISIBLE })
  // The drawn window, and the first visible column when it was drawn (where cut-off bars put their name).
  const [win, setWin] = useState(() => ({
    ...renderWindow(view.current.first, view.current.visible, count),
    first: view.current.first
  }))
  const todayCol = diffDays(base, today)
  const [cursor, setCursor] = useState<Cursor>({ row: 0, col: Math.min(Math.max(0, todayCol), count - 1) })
  const [announce, setAnnounce] = useState('')
  const rooms = model.rooms

  const measure = useCallback(() => {
    const m = metrics.current
    m.day = dayProbe.current?.offsetWidth || DAY_PX
    m.room = roomProbe.current?.offsetWidth || ROOM_PX
    m.row = rowProbe.current?.offsetHeight || 40
  }, [])

  /** Visible columns for a scroll position (the room column covers the left of the scroll port). */
  const visibleAt = useCallback(
    (left: number): { first: number; visible: number } => {
      const el = scroller.current
      const m = metrics.current
      const width = el?.clientWidth ?? 0
      return {
        first: Math.min(Math.max(0, Math.floor(left / m.day)), count - 1),
        visible: width > m.room ? Math.ceil((width - m.room) / m.day) : FALLBACK_VISIBLE
      }
    },
    [count]
  )

  /** Tells the CSS which column is first on screen (bar names stick to it, `labelLeft`). */
  const markFirst = useCallback((first: number) => {
    scroller.current?.style.setProperty('--first-col', String(first))
  }, [])

  const showView = useCallback(
    (next: { first: number; visible: number }) => {
      const prev = view.current
      if (prev.first !== next.first) markFirst(next.first)
      if (prev.first === next.first && prev.visible === next.visible) return
      view.current = next
      onView(next.first, next.visible)
      const w = renderWindow(next.first, next.visible, count)
      setWin((old) => (old.from === w.from && old.to === w.to ? old : { ...w, first: next.first }))
    },
    [count, markFirst, onView]
  )

  const scrollLeftTo = useCallback(
    (col: number) => {
      const el = scroller.current
      const left = Math.max(0, col) * metrics.current.day
      if (el) el.scrollLeft = left
      // Tests (and a scroll that lands where it already was) fire no scroll event: show the target anyway.
      showView({ ...visibleAt(left), first: Math.min(Math.max(0, col), count - 1) })
    },
    [count, showView, visibleAt]
  )

  // First paint: measure, then put the initial day at the left edge.
  useLayoutEffect(() => {
    measure()
    markFirst(view.current.first)
    scrollLeftTo(initialCol)
    // initialCol is read once: later jumps go through the handle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const el = scroller.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      measure()
      showView(visibleAt(el.scrollLeft))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [measure, showView, visibleAt])

  const frame = useRef(0)
  const onScroll = () => {
    if (frame.current) return
    frame.current = requestAnimationFrame(() => {
      frame.current = 0
      const el = scroller.current
      if (el) showView(visibleAt(el.scrollLeft))
    })
  }
  useEffect(() => () => cancelAnimationFrame(frame.current), [])

  /** Brings a cell into view: horizontally by whole columns, vertically under the sticky header. */
  const ensureVisible = useCallback(
    (cell: Cursor) => {
      const el = scroller.current
      const m = metrics.current
      const current = el ? visibleAt(el.scrollLeft) : view.current
      if (cell.col < current.first) scrollLeftTo(cell.col)
      else if (cell.col >= current.first + current.visible - 1)
        scrollLeftTo(cell.col - Math.max(0, current.visible - 2))
      if (el) {
        const top = cell.row * m.row
        const header = 64
        if (top < el.scrollTop) el.scrollTop = top
        else if (top + m.row > el.scrollTop + el.clientHeight - header)
          el.scrollTop = top + m.row - el.clientHeight + header
      }
    },
    [scrollLeftTo, visibleAt]
  )

  const describe = useCallback(
    (cell: Cursor): string => {
      const room = rooms[cell.row]
      if (!room) return ''
      const date = dateAt(base, cell.col)
      const at = staysAt(model.stays, room.id, date)
      const block = blockAt(model.blocks, room.id, date)
      const what = at.length
        ? at
            .map((s) => {
              const night = s.nights.find((n) => n.date === date) ?? s.nights[0]
              const status = night
                ? paintNames(legend, [
                    paintStay(s, setup).nights.find((n) => n.date === night.date)?.fill ?? null
                  ])
                : []
              return [s.guestName, ...status].join(', ')
            })
            .join('; ')
        : block
          ? block.closed
            ? t('tape.roomClosed')
            : t(block.kind === 'ooo' ? 'tape.blockOoo' : 'tape.blockOos', { reason: block.reason })
          : t(`status.${emptyCellStatus(cell.col < todayCol, setup.enabled) ?? 'empty'}` as 'status.empty')
      return t('calendar.grid.cell', { room: room.number, date: f.date(date, 'full'), what })
    },
    [base, f, legend, model.blocks, model.stays, rooms, setup, t, todayCol]
  )

  const moveTo = useCallback(
    (cell: Cursor) => {
      setCursor(cell)
      ensureVisible(cell)
      setAnnounce(describe(cell))
    },
    [describe, ensureVisible]
  )

  useImperativeHandle(
    ref,
    () => ({
      scrollToCol: (col: number) => scrollLeftTo(col - 3),
      focusCell: (cell: Cursor) => {
        scrollLeftTo(cell.col - 3)
        setCursor(cell)
        setAnnounce(describe(cell))
        scroller.current?.focus({ preventScroll: true })
      }
    }),
    [describe, scrollLeftTo]
  )

  const openCell = (cell: Cursor) => {
    const room = rooms[cell.row]
    if (!room) return
    const date = dateAt(base, cell.col)
    const at = staysAt(model.stays, room.id, date)
    const block = blockAt(model.blocks, room.id, date)
    if (at[0]) onOpenStay(at[0])
    else if (block) onOpenBlock(block)
    else onOpenCell(room.id, date)
  }

  // ── Drag-and-drop of a bar (one axis at a time, ./drag.ts); a press without movement stays a click ──
  const drag = useRef<{ stay: GridStayView; row: number; x: number; y: number; moved: boolean } | null>(null)
  const [ghost, setGhost] = useState<StayMove | null>(null)
  const ghostRef = useRef<StayMove | null>(null)
  const swallowClick = useRef(false)
  const showGhost = (next: StayMove | null): void => {
    if (sameMove(ghostRef.current, next)) return
    ghostRef.current = next
    setGhost(next)
  }
  const endDrag = (): void => {
    drag.current = null
    showGhost(null)
  }
  const onBarPointerDown = (e: PointerEvent<HTMLButtonElement>, stay: GridStayView, row: number): void => {
    if (!onMoveStay || e.button !== 0) return
    drag.current = { stay, row, x: e.clientX, y: e.clientY, moved: false }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const onBarPointerMove = (e: PointerEvent<HTMLButtonElement>): void => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (!d.moved && Math.hypot(dx, dy) >= 6) d.moved = true
    if (!d.moved) return
    const m = metrics.current
    showGhost(dropTarget({ stay: d.stay, row: d.row, dx, dy, dayPx: m.day, rowPx: m.row, rooms, today }))
  }
  const onBarPointerUp = (): void => {
    const d = drag.current
    if (!d) return
    const target = ghostRef.current
    // A real drag never opens the panel on the click that follows the release.
    if (d.moved) swallowClick.current = true
    endDrag()
    if (target) onMoveStay?.(target)
  }
  const onBarClick = (stay: GridStayView): void => {
    if (swallowClick.current) {
      swallowClick.current = false
      return
    }
    onOpenStay(stay)
  }

  // The keys are listed in lib/shortcuts/registry.ts (the "?" list and the guide read the same list).
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && drag.current) {
      e.preventDefault()
      swallowClick.current = !!drag.current.moved
      endDrag()
      return
    }
    if (e.altKey || e.ctrlKey || e.metaKey) return
    const next = moveCursor(cursor, e.key, rooms.length, count)
    if (next) {
      e.preventDefault()
      moveTo(next)
    } else if (matchesShortcut(e, GRID_KEYS.today)) {
      e.preventDefault()
      moveTo({ row: cursor.row, col: Math.min(Math.max(0, todayCol), count - 1) })
    } else if (matchesShortcut(e, GRID_KEYS.open)) {
      e.preventDefault()
      openCell(cursor)
    } else if (matchesShortcut(e, GRID_KEYS.new)) {
      const room = rooms[cursor.row]
      if (!room) return
      e.preventDefault()
      onOpenCell(room.id, dateAt(base, cursor.col))
    }
  }

  const onTrackClick = (e: MouseEvent<HTMLDivElement>, row: number) => {
    if ((e.target as HTMLElement).closest('[data-bar]')) return
    const rect = e.currentTarget.getBoundingClientRect()
    const col = Math.floor((e.clientX - rect.left) / metrics.current.day)
    if (col < 0 || col >= count) return
    const cell = { row, col }
    setCursor(cell)
    openCell(cell)
  }

  // The rows' handlers, one stable object over the latest closures (rows are memoised, GridRow).
  const latest = useRef<RowActions | null>(null)
  useLayoutEffect(() => {
    latest.current = {
      trackClick: onTrackClick,
      openBlock: onOpenBlock,
      barClick: onBarClick,
      pointerDown: onBarPointerDown,
      pointerMove: onBarPointerMove,
      pointerUp: onBarPointerUp,
      pointerCancel: endDrag
    }
  })
  const actions = useMemo<RowActions>(
    () => ({
      trackClick: (e, row) => latest.current?.trackClick(e, row),
      openBlock: (b) => latest.current?.openBlock(b),
      barClick: (stay) => latest.current?.barClick(stay),
      pointerDown: (e, stay, row) => latest.current?.pointerDown(e, stay, row),
      pointerMove: (e) => latest.current?.pointerMove(e),
      pointerUp: () => latest.current?.pointerUp(),
      pointerCancel: () => latest.current?.pointerCancel()
    }),
    []
  )

  // Bars by room, computed once per data change.
  const bars = useMemo(() => {
    const byRoom = new Map<string, GridStayView[]>()
    for (const s of model.stays) byRoom.set(s.roomId, [...(byRoom.get(s.roomId) ?? []), s])
    return new Map([...byRoom].map(([roomId, list]) => [roomId, stayBars(list, base)]))
  }, [model.stays, base])
  const blocks = useMemo(() => {
    const byRoom = new Map<string, GridBlockView[]>()
    for (const b of model.blocks) byRoom.set(b.roomId, [...(byRoom.get(b.roomId) ?? []), b])
    return byRoom
  }, [model.blocks])
  const paints = useMemo(
    () => new Map(model.stays.map((s) => [s.id, paintStay(s, setup)])),
    [model.stays, setup]
  )

  const cols = Array.from({ length: win.to - win.from }, (_, i) => win.from + i)
  const months: { date: LocalDate; col: number; days: number }[] = []
  for (let m = monthStart(dateAt(base, win.from)); diffDays(base, m) < win.to; m = nextMonth(m))
    months.push({ date: m, col: diffDays(base, m), days: diffDays(m, nextMonth(m)) })
  const freeFrom = free ? diffDays(base, free.from) : 0
  const freeWidth = free ? Math.max(1, diffDays(free.from, free.to)) : 0
  const pastStatus = emptyCellStatus(true, setup.enabled)
  const futureStatus = emptyCellStatus(false, setup.enabled)

  return (
    <div
      ref={scroller}
      dir="ltr"
      data-testid="tape-chart"
      role="region"
      aria-label={t('calendar.grid.label')}
      aria-describedby="calendar-grid-help"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onScroll={onScroll}
      className="group/grid bg-card focus-visible:ring-ring/50 relative max-h-[calc(100dvh-16rem)] min-h-64 overflow-auto rounded-xl border outline-none focus-visible:ring-[3px]"
    >
      <p id="calendar-grid-help" className="sr-only">
        {t('calendar.grid.help')}
      </p>
      <p className="sr-only" aria-live="polite" data-testid="grid-announce">
        {announce}
      </p>
      <div ref={dayProbe} aria-hidden className="pointer-events-none invisible absolute h-0 w-(--tape-day)" />
      <div
        ref={roomProbe}
        aria-hidden
        className="pointer-events-none invisible absolute h-0 w-(--tape-room)"
      />
      <div
        ref={rowProbe}
        aria-hidden
        className="pointer-events-none invisible absolute h-(--density-row) w-0"
      />
      <div className="relative" style={{ width: `calc(var(--tape-room) + var(--tape-day) * ${count})` }}>
        {/* Header: month and day, sticky on top; the corner is sticky on both axes. */}
        <div className="bg-card sticky top-0 z-20 flex h-16 border-b">
          <div className="bg-card sticky start-0 z-30 flex w-(--tape-room) shrink-0 items-end border-e px-3 pb-1.5 text-xs font-medium">
            {t('tape.room')}
          </div>
          <div className="relative flex-1">
            {cols.map((col) => {
              const date = dateAt(base, col)
              const entries = model.days.get(date) ?? []
              const isToday = col === todayCol
              const holiday = entries.some((e) => e.kind === 'holiday')
              const names = entries.map((e) => localized(e.titleI18n, e.title ?? '', f.locale))
              const label = names.length
                ? t('calendar.grid.dayWith', { date: f.date(date, 'full'), entries: names.join(', ') })
                : f.date(date, 'full')
              return (
                <button
                  type="button"
                  key={date}
                  tabIndex={-1}
                  data-testid={isToday ? 'tape-today' : `tape-day-${date}`}
                  aria-label={label}
                  title={label}
                  onClick={() => onOpenDay(date)}
                  className={cn(
                    'absolute inset-y-0 flex w-(--tape-day) flex-col items-center justify-end border-e pb-1 text-xs tabular-nums',
                    'hover:bg-accent focus-visible:ring-ring outline-none focus-visible:ring-[3px] focus-visible:ring-inset',
                    highlight.includes(weekday(date)) && 'bg-accent/60',
                    holiday && 'bg-chart-3/20',
                    isToday && 'bg-primary text-primary-foreground hover:bg-primary/90'
                  )}
                  style={{ left: colLeft(col) }}
                >
                  {entries.length ? (
                    <span className="absolute end-0.5 top-1 flex gap-px" aria-hidden>
                      {[...new Set(entries.map((e) => e.kind))].slice(0, 2).map((kind) => {
                        const Icon = DAY_ICON[kind]
                        return (
                          <Icon
                            key={kind}
                            className={cn(
                              'size-3',
                              !isToday && (kind === 'note' ? 'text-info' : 'text-chart-3')
                            )}
                          />
                        )
                      })}
                    </span>
                  ) : null}
                  <span className={cn('leading-none', !isToday && 'text-muted-foreground')}>
                    {f.weekday(date)}
                  </span>
                  <span className="text-sm leading-tight font-semibold">{Number(date.slice(8))}</span>
                </button>
              )
            })}
            {/* Month names: one band per month; the name slides along while the month is on screen. */}
            {months.map((m) => (
              <div
                key={m.date}
                aria-hidden
                className="pointer-events-none absolute top-1 z-[1] h-4"
                style={{ left: colLeft(m.col), width: colWidth(m.days) }}
              >
                <span className="bg-card text-muted-foreground sticky start-(--tape-room) inline-block rounded-sm px-1 text-xs leading-4 font-semibold whitespace-nowrap">
                  {f.monthYear(m.date)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative">
          {/* Column backgrounds: grey before today, white from today, highlighted weekdays tinted. */}
          <div aria-hidden className="pointer-events-none absolute inset-y-0 start-(--tape-room) end-0">
            {cols.map((col) => {
              const status = col < todayCol ? pastStatus : futureStatus
              return (
                <div
                  key={col}
                  className={cn(
                    'absolute inset-y-0 w-(--tape-day) border-e',
                    status ? STATUS_FILL[status] : 'bg-card'
                  )}
                  style={{ left: colLeft(col) }}
                >
                  {col >= todayCol && highlight.includes(weekday(dateAt(base, col))) ? (
                    <div className="bg-accent/40 absolute inset-0" />
                  ) : null}
                </div>
              )
            })}
            {todayCol >= win.from && todayCol < win.to ? (
              <div
                className="bg-primary absolute inset-y-0 z-[6] w-0.5"
                style={{ left: colLeft(todayCol) }}
              />
            ) : null}
          </div>

          {rooms.map((room, row) => {
            const roomBars = bars.get(room.id)
            const has = (id: string | null): string | null =>
              id && roomBars?.some((b) => b.stay.id === id) ? id : null
            return (
              <GridRow
                key={room.id}
                room={room}
                row={row}
                isFree={!!free?.roomIds.has(room.id)}
                freeFrom={freeFrom}
                freeWidth={freeWidth}
                issue={issues.get(room.id)}
                bars={roomBars}
                blocks={blocks.get(room.id)}
                paints={paints}
                legend={legend}
                win={win}
                base={base}
                blockedEnabled={setup.enabled.has('blocked')}
                flashStayId={has(flashStayId)}
                ghostStayId={has(ghost?.stay.id ?? null)}
                draggable={!!onMoveStay}
                actions={actions}
              />
            )
          })}

          {/* Where a dragged bar would land (faz-15 madde 12). */}
          {ghost ? (
            <div
              aria-hidden
              data-testid="drag-ghost"
              className="bg-primary/15 ring-primary pointer-events-none absolute z-[9] rounded-md ring-2 ring-inset"
              style={{
                left: `calc(var(--tape-room) + var(--tape-day) * ${diffDays(base, ghost.kind === 'dates' ? ghost.checkIn : ghost.stay.checkIn)} + 2px)`,
                width: colWidth(Math.max(1, diffDays(ghost.stay.checkIn, ghost.stay.checkOut)), 4),
                top: `calc(var(--density-row) * ${ghost.row} + 4px)`,
                height: 'calc(var(--density-row) - 8px)'
              }}
            />
          ) : null}

          {/* The keyboard cursor: visible while the grid has keyboard focus. */}
          <div
            aria-hidden
            data-testid="grid-cursor"
            className="ring-ring pointer-events-none absolute z-[8] hidden h-(--density-row) w-(--tape-day) rounded-sm ring-[3px] ring-inset group-focus-visible/grid:block"
            style={{
              left: `calc(var(--tape-room) + var(--tape-day) * ${cursor.col})`,
              top: `calc(var(--density-row) * ${cursor.row})`
            }}
          />
        </div>
      </div>
    </div>
  )
})

/** What a row asks of the grid; one stable object, so a row draws again only when its own data changes. */
interface RowActions {
  trackClick: (e: MouseEvent<HTMLDivElement>, row: number) => void
  openBlock: (block: GridBlockView) => void
  barClick: (stay: GridStayView) => void
  pointerDown: (e: PointerEvent<HTMLButtonElement>, stay: GridStayView, row: number) => void
  pointerMove: (e: PointerEvent<HTMLButtonElement>) => void
  pointerUp: () => void
  pointerCancel: () => void
}

/**
 * One room's row (faz-15 madde 9): memoised — moving the keyboard cursor, announcing a cell, a drag target or a
 * flash elsewhere does not draw the other rows again (`countRender('tape-row')` shows it in the profile).
 */
const GridRow = memo(function GridRow({
  room,
  row,
  isFree,
  freeFrom,
  freeWidth,
  issue,
  bars,
  blocks,
  paints,
  legend,
  win,
  base,
  blockedEnabled,
  flashStayId,
  ghostStayId,
  draggable,
  actions
}: {
  room: GridModel['rooms'][number]
  row: number
  isFree: boolean
  freeFrom: number
  freeWidth: number
  issue: RoomIssueMark | undefined
  bars: readonly StayBar[] | undefined
  blocks: readonly GridBlockView[] | undefined
  paints: ReadonlyMap<string, StayPaint>
  legend: readonly LegendItem[]
  win: { from: number; to: number; first: number }
  base: LocalDate
  blockedEnabled: boolean
  flashStayId: string | null
  ghostStayId: string | null
  draggable: boolean
  actions: RowActions
}) {
  countRender('tape-row')
  const { t } = useTranslation()
  const f = useFormat()
  return (
    <div className="relative flex h-(--density-row) border-b" data-testid={`tape-row-${room.number}`}>
      <div
        className={cn(
          'bg-card sticky start-0 z-10 flex w-(--tape-room) shrink-0 items-center gap-2 border-e px-3',
          isFree && 'bg-accent'
        )}
      >
        {/* Room status by colour and shape (faz-15 madde 5: colour never alone), named for screen readers. */}
        <span
          role="img"
          aria-label={t(`hk.${room.hk}`)}
          title={t(`hk.${room.hk}`)}
          data-testid={`room-hk-${room.number}`}
          className={cn('size-2 shrink-0', HK_DOT[room.hk], HK_SHAPE[room.hk])}
        />
        <span className="text-sm font-semibold tabular-nums">{room.number}</span>
        <span
          className="text-muted-foreground line-clamp-2 min-w-0 flex-1 text-[0.6875rem] leading-tight break-words"
          title={localized(room.typeNameI18n, room.typeName, f.locale)}
        >
          {localized(room.typeNameI18n, room.typeName, f.locale)}
        </span>
        {issue ? (
          <span
            role="img"
            aria-label={t('calendar.grid.openIssues', { count: issue.count })}
            title={[t('calendar.grid.openIssues', { count: issue.count }), ...issue.titles].join('\n')}
            data-testid={`room-issue-${room.number}`}
            className={cn('shrink-0', issue.urgent ? 'text-destructive' : 'text-warning')}
          >
            <WrenchIcon className="size-3.5" aria-hidden />
          </span>
        ) : null}
        {isFree ? (
          <CheckIcon className="text-primary size-4 shrink-0" aria-label={t('calendar.grid.free')} />
        ) : null}
      </div>
      <div
        className="relative min-w-0 flex-1 cursor-cell"
        onClick={(e) => actions.trackClick(e, row)}
        data-testid={`tape-track-${room.number}`}
      >
        {isFree ? (
          <div
            aria-hidden
            className="bg-primary/10 ring-primary pointer-events-none absolute inset-y-0 z-[5] ring-2 ring-inset"
            style={{ left: colLeft(freeFrom), width: colWidth(freeWidth) }}
          />
        ) : null}
        {(blocks ?? []).map((b) => {
          const span = blockSpan(b, base)
          if (!overlaps(span.start, span.width, win.from, win.to)) return null
          // Days the room is not in use (Ayarlar → Odalar, K-27) are drawn like a block with their own words.
          const label = b.closed
            ? t('tape.roomClosed')
            : t(b.kind === 'ooo' ? 'tape.blockOoo' : 'tape.blockOos', { reason: b.reason })
          const Icon = b.kind === 'ooo' ? WrenchIcon : LockIcon
          return (
            <button
              type="button"
              key={b.id}
              tabIndex={-1}
              aria-label={label}
              title={label}
              data-bar
              data-testid={`block-${b.id}`}
              onClick={() => actions.openBlock(b)}
              className={cn(
                'absolute inset-y-1 z-[7] overflow-hidden rounded-md text-start text-xs font-medium outline-none',
                'bg-[repeating-linear-gradient(135deg,transparent_0_6px,color-mix(in_oklab,var(--status-blocked-fg)_22%,transparent)_6px_12px)]',
                blockedEnabled ? STATUS_FILL.blocked : 'bg-muted text-foreground'
              )}
              style={{ left: colLeft(span.start, 2), width: colWidth(span.width, 4) }}
            >
              <span
                className="absolute inset-y-0 end-0 flex min-w-0 items-center gap-1 px-1.5"
                style={{ left: labelLeft(span.start) }}
              >
                <Icon className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate">{b.closed ? t('tape.roomClosed') : b.reason}</span>
              </span>
            </button>
          )
        })}
        {(bars ?? []).map((bar) => {
          if (!overlaps(bar.start, bar.width, win.from, win.to)) return null
          const s = bar.stay
          const paint = paints.get(s.id)
          if (!paint) return null
          const icons = stayIcons(s, paint.depositIcon)
          // The name sits in the first night's cell (S-23); a bar whose start is scrolled away shows it
          // at the first column on screen (`labelLeft`); the price is the one of the night there when
          // this window was drawn.
          const labelCol = Math.max(bar.start, win.first)
          const labelIndex = Math.max(
            0,
            s.nights.findIndex((n) => diffDays(base, n.date) >= Math.floor(labelCol))
          )
          const labelNight = s.nights[labelIndex]
          const labelPaint = paint.nights[labelIndex]?.fill ?? null
          const stayLabel = t('tape.stayLabel', {
            guest: s.guestName,
            room: room.number,
            from: f.dayMonth(s.checkIn),
            to: f.dayMonth(s.checkOut)
          })
          const hours = s.startTime && s.endTime ? `${s.startTime}–${s.endTime}` : null
          const words = [
            ...(hours ? [hours] : []),
            ...paintNames(legend, [labelPaint, paint.border]),
            ...(s.reservationStatus === 'tentative' ? [t('calendar.resStatus.tentative')] : []),
            ...(s.kbsMissing ? [t('calendar.grid.kbs')] : []),
            ...(s.vip ? [t('calendar.grid.vip')] : []),
            ...(s.standingNote ? [t('calendar.grid.standing', { text: s.standingNote.text })] : [])
          ]
          const label = words.length
            ? t('tape.stayWithStatus', { stay: stayLabel, status: words.join(', ') })
            : stayLabel
          // A frame only when it says something: a custom tag, or "ön kayıt" (dashed).
          const framed = paint.border !== null || s.reservationStatus === 'tentative'
          const inset = 2 + (framed ? 2 : 0)
          return (
            <button
              type="button"
              key={s.id}
              tabIndex={-1}
              data-bar
              data-testid={`stay-${s.id}`}
              data-icons={icons.join(' ')}
              aria-label={label}
              title={label}
              onClick={() => actions.barClick(s)}
              onPointerDown={(e) => actions.pointerDown(e, s, row)}
              onPointerMove={actions.pointerMove}
              onPointerUp={actions.pointerUp}
              onPointerCancel={actions.pointerCancel}
              className={cn(
                'absolute z-[7] overflow-hidden rounded-md text-start text-xs leading-none outline-none',
                bar.lanes > 1 ? 'top-0' : 'inset-y-1',
                draggable && s.stayStatus !== 'done' && 'cursor-grab touch-none active:cursor-grabbing',
                ghostStayId === s.id && 'opacity-60',
                paintFill(paint.nights[0]?.fill ?? null),
                framed && 'border-2',
                framed && (paint.border ? paintBorder(paint.border) : 'border-foreground/60'),
                s.reservationStatus === 'tentative' && 'border-dashed',
                bar.split === 'start' && 'rounded-e-sm',
                bar.split === 'end' && 'rounded-s-sm'
              )}
              style={{
                left: colLeft(bar.start, 2),
                width: colWidth(bar.width, 4),
                // Hourly stays of one day stack in lanes (K-48): position and size only.
                ...(bar.lanes > 1
                  ? {
                      top: `calc(100% * ${bar.lane} / ${bar.lanes} + 2px)`,
                      height: `calc(100% / ${bar.lanes} - 4px)`
                    }
                  : {})
              }}
            >
              {paint.nights.map((n) => {
                const col = diffDays(base, n.date)
                if (col < win.from || col >= win.to) return null
                return (
                  <span
                    key={n.date}
                    aria-hidden
                    data-night={n.date}
                    data-paint={
                      n.fill === null ? 'none' : n.fill.kind === 'auto' ? n.fill.code : `tag:${n.fill.tagId}`
                    }
                    className={cn('absolute inset-y-0 w-(--tape-day)', paintFill(n.fill))}
                    style={{ left: colLeft(col - bar.start, -inset) }}
                  />
                )
              })}
              <span
                className={cn(
                  'absolute inset-y-0 end-0 flex min-w-0 items-center gap-1',
                  bar.width < 1 ? 'px-0.5' : 'px-1.5',
                  // Stacked hourly bars are thin: smaller text, and none from three lanes on (the label has it all).
                  bar.lanes > 1 && 'text-[10px]',
                  bar.lanes > 2 && 'hidden',
                  paintText(labelPaint)
                )}
                style={{ left: labelLeft(bar.start, -inset) }}
              >
                {/* Half a cell (a split day) has room for the initials only; the name is in the label. */}
                {hours && bar.width >= 1 ? (
                  <bdi className="shrink-0 tabular-nums" data-testid={`stay-hours-${s.id}`}>
                    {/* One day column holds the start only; the whole range is in the bar's label. */}
                    {bar.width >= 1.5 ? hours : s.startTime}
                  </bdi>
                ) : null}
                <span className="truncate font-semibold">
                  {bar.width < 1 ? initials(s.guestName) : s.guestName}
                </span>
                {bar.start + bar.width - labelCol > 2 && labelNight ? (
                  <bdi className="shrink-0 tabular-nums">{f.money(labelNight.priceMinor, s.currency)}</bdi>
                ) : null}
                <span className={cn('ms-auto flex shrink-0 items-center gap-0.5', bar.width < 1 && 'hidden')}>
                  {icons.map((icon) => {
                    const Icon = ICON[icon]
                    return <Icon key={icon} className="size-3" aria-hidden />
                  })}
                </span>
              </span>
              {flashStayId === s.id ? (
                <span
                  aria-hidden
                  className="ring-foreground pointer-events-none absolute inset-0 animate-pulse rounded-sm ring-[3px] ring-inset"
                />
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
})
