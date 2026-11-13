// Opening screen (G-47, S-11): the reservation grid over the real service on the desktop — every year that holds a
// stay and ten years ahead (G-31), scrolled month by month, navigation, guest search, free rooms, holidays and
// notes, legend — and the day list on the phone (G-143). The reservation panel, the new-reservation dialog and the park area read the real service themselves;
// this page only tells them which reservation or cell to open.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import {
  CalendarDaysIcon,
  CalendarPlusIcon,
  ClockIcon,
  DoorOpenIcon,
  LockIcon,
  PlusIcon,
  XIcon
} from 'lucide-react'
import { addDays, diffDays, today as todayOf, type LocalDate } from '@shared/date'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Legend } from '@/components/legend'
import { Page } from '@/components/page'
import { EmptyState, ErrorState } from '@/components/states'
import { useFormat } from '@/hooks/use-format'
import { useIsMobile } from '@/hooks/use-mobile'
import { useApiQuery, useSettings } from '@/lib/api/hooks'
import { useTagStyles } from '@/lib/status-style'
import { useCan } from '@/lib/view-as'
import { useShortcutAction } from '@/lib/shortcuts/actions'
import { tagLabel } from '@/features/settings/use-status-tags'
import { BlockDialog, type BlockDialogState } from './block-dialog'
import { BulkNoteDialog } from './bulk-note-dialog'
import { CalendarGrid, type FreeHighlight, type GridHandle, type RoomIssueMark } from './calendar-grid'
import { CalendarNavigation } from './calendar-toolbar'
import { DayDialog } from './day-dialog'
import type { StayMove } from './drag'
import { MoveStayDialog } from './move-stay-dialog'
import { MobileCalendar } from '@/layouts/mobile/mobile-calendar'
import { FirstReservationHint } from './first-reservation-hint'
import { FreeRoomsDialog, type FreeRoomsResult } from './free-rooms-dialog'
import {
  dateAt,
  gridBounds,
  legendItems,
  statusSetup,
  type GridBlockView,
  type GridStayView
} from './grid-model'
import { GuestJump, type FoundStayView } from './guest-jump'
import { HourlyStayDialog, type HourlySeed } from './hourly-stay-dialog'
import { NewReservationDialog, type NewReservationSeed } from './new-reservation-dialog'
import { ParkArea } from './park-area'
import { ReservationPanel } from './reservation-panel'
import { useGridData, useGridYears } from './use-calendar'

const DEFAULT_HIGHLIGHT: readonly number[] = [6, 0]
/** Days shown before the anchor day (today, a picked date) at the left edge. */
const CONTEXT_DAYS = 3
/** Months read beyond the screen on each side, so a scroll rarely waits. */
const PREFETCH_DAYS = 31
/** How long a found stay pulses. */
const FLASH_MS = 2500

export function CalendarPage() {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const settings = useSettings()
  const highlight = settings.data?.['calendar.highlightWeekdays'] ?? DEFAULT_HIGHLIGHT
  const [openId, setOpenId] = useState<string | null>(null)
  const [seed, setSeed] = useState<NewReservationSeed | null>(null)
  const [hourly, setHourly] = useState<HourlySeed | null>(null)
  const [clientToday] = useState(todayOf)
  // A role that only looks at the calendar (Muhasebeci) gets no new-reservation form from the button, a cell, Enter
  // or N (ui.md: hidden; the service refuses anyway).
  const canBook = useCan()('calendar', 'edit')
  const openNew = useCallback(
    (roomId: string | null, date: LocalDate) => {
      if (canBook) setSeed({ roomId, date })
    },
    [canBook]
  )
  // N (lib/shortcuts): a new reservation from today, from any screen. "Today" is read at the key press: the
  // calendar is the opening screen and stays open overnight (QA2c #4).
  useShortcutAction('newReservation', () => openNew(null, todayOf()), { enabled: canBook })

  const actions = canBook ? (
    <>
      {/* min-w-0 + truncate: a long Russian label shortens inside its button instead of pushing out of the phone. */}
      <Button
        variant="outline"
        className="min-w-0"
        onClick={() => setHourly({ roomId: null, date: todayOf() })}
        data-testid="hourly-new"
      >
        <ClockIcon aria-hidden />
        <span className="truncate">{t('booking.hourly.button')}</span>
      </Button>
      <Button className="min-w-0" onClick={() => openNew(null, todayOf())}>
        <PlusIcon aria-hidden />
        <span className="truncate">{t('calendar.newReservation')}</span>
      </Button>
    </>
  ) : undefined

  return (
    <Page
      title={t('calendar.title')}
      description={t('calendar.description')}
      wide={!isMobile}
      actions={actions}
    >
      {isMobile ? (
        <>
          <FirstReservationHint />
          <MobileCalendar onOpen={setOpenId} />
        </>
      ) : (
        <DesktopCalendar
          clientToday={clientToday}
          highlight={highlight}
          onOpenReservation={setOpenId}
          onNew={openNew}
        />
      )}
      <ReservationPanel
        reservation={openId ? { id: openId } : null}
        onOpenChange={(o) => !o && setOpenId(null)}
      />
      <HourlyStayDialog
        key={hourly ? `${hourly.roomId}-${hourly.date}` : 'hourly-closed'}
        seed={hourly}
        onOpenChange={(o) => !o && setHourly(null)}
      />
      <NewReservationDialog
        key={seed ? `${seed.roomId}-${seed.date}` : 'closed'}
        seed={seed}
        onOpenChange={(o) => !o && setSeed(null)}
      />
    </Page>
  )
}

interface DesktopProps {
  clientToday: LocalDate
  highlight: readonly number[]
  onOpenReservation: (reservationId: string) => void
  onNew: (roomId: string | null, date: LocalDate) => void
}

function GridSkeleton() {
  const { t } = useTranslation()
  return (
    <div role="status" aria-busy className="grid gap-2">
      <span className="sr-only">{t('common.loading')}</span>
      {Array.from({ length: 8 }, (_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  )
}

/**
 * The grid's years come from the main computer (G-31: the start-year setting or the oldest stay, ten years on or
 * the furthest record). When the first year moves (a new start year, an older stay imported) the grid is drawn again
 * from its first column, on the day it was showing.
 */
function DesktopCalendar(props: DesktopProps) {
  const years = useGridYears(props.clientToday)
  const client = useQueryClient()
  const shown = useRef<LocalDate | null>(null)
  const onAnchor = useCallback((d: LocalDate) => {
    shown.current = d
  }, [])
  // A date outside the years held (a search answer newer than the years read): read the years again, then go there.
  const onOutside = useCallback(
    (d: LocalDate) => {
      shown.current = d
      void client.invalidateQueries({ queryKey: ['reservations.grid', 'calendar.bounds'] })
    },
    [client]
  )
  // Read when the grid (re)mounts, never while drawing.
  const openAt = useCallback(() => shown.current ?? props.clientToday, [props.clientToday])
  if (!years) return <GridSkeleton />
  const { start, count } = gridBounds(years)
  return (
    <DesktopGrid
      key={start}
      {...props}
      base={start}
      count={count}
      startAt={openAt}
      onAnchor={onAnchor}
      onOutside={onOutside}
    />
  )
}

function DesktopGrid({
  clientToday,
  highlight,
  onOpenReservation,
  onNew,
  base,
  count,
  startAt,
  onAnchor,
  onOutside
}: DesktopProps & {
  /** Column 0 and the number of day columns. */
  base: LocalDate
  count: number
  /** The day the screen opens on (today, or the day shown before the years changed); read once. */
  startAt: () => LocalDate
  onAnchor: (date: LocalDate) => void
  onOutside: (date: LocalDate) => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const can = useCan()
  const grid = useRef<GridHandle>(null)
  const last = addDays(base, count - 1)
  const [openedAt] = useState(startAt)
  const [initialCol] = useState(() => diffDays(base, openedAt) - CONTEXT_DAYS)
  const [view, setView] = useState({ first: Math.max(0, initialCol), visible: 31 })
  const onView = useCallback(
    (first: number, visible: number) =>
      setView((prev) => (prev.first === first && prev.visible === visible ? prev : { first, visible })),
    []
  )
  const data = useGridData(
    dateAt(base, Math.max(0, view.first - PREFETCH_DAYS)),
    dateAt(base, Math.min(count, view.first + view.visible + PREFETCH_DAYS))
  )
  const model = data.model
  const today = model.today ?? clientToday

  // The main computer's day wins over this computer's clock (they differ only around midnight or a wrong clock).
  const adjusted = useRef(openedAt !== clientToday)
  useEffect(() => {
    if (adjusted.current || !model.today) return
    adjusted.current = true
    if (model.today !== clientToday) grid.current?.scrollToCol(diffDays(base, model.today))
  }, [model.today, clientToday, base])

  const tags = useApiQuery('statusTags.list', {})
  const setup = useMemo(() => statusSetup(tags.data), [tags.data])
  const legend = useMemo(() => legendItems(tags.data, (tag) => tagLabel(tag, t)), [tags.data, t])
  useTagStyles(tags.data?.filter((tag) => tag.kind === 'custom'))
  // Open issues of the rooms (G-180): a wrench in the room column. A refusal only hides the marks.
  const openIssues = useApiQuery('housekeeping.openIssuesByRoom', {}, { staleTime: 30_000 })
  const issues = useMemo(
    () =>
      new Map<string, RoomIssueMark>(
        (openIssues.data ?? []).map((r) => [
          r.roomId,
          { count: r.count, urgent: r.severity === 'urgent', titles: r.issues.map((i) => i.title) }
        ])
      ),
    [openIssues.data]
  )
  const [block, setBlock] = useState<BlockDialogState | null>(null)
  const onOpenBlock = useCallback((b: GridBlockView) => setBlock({ mode: 'view', block: b }), [])

  const [dayOpen, setDayOpen] = useState<LocalDate | null>(null)
  const [bulkStart, setBulkStart] = useState<LocalDate | null>(null)
  const [freeOpen, setFreeOpen] = useState(false)
  const [free, setFree] = useState<(FreeHighlight & { count: number; checkOut: LocalDate }) | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  // Drag-and-drop (faz-15 madde 12): only a role that may change the calendar drags; the service checks anyway.
  const canMove = can('calendar', 'edit')
  const [move, setMove] = useState<StayMove | null>(null)
  useEffect(() => {
    if (!flash) return
    const id = setTimeout(() => setFlash(null), FLASH_MS)
    return () => clearTimeout(id)
  }, [flash])

  const anchor = dateAt(base, Math.min(count - 1, view.first + CONTEXT_DAYS))
  useEffect(() => onAnchor(anchor), [anchor, onAnchor])
  const colOf = useCallback(
    (d: LocalDate) => Math.min(Math.max(0, diffDays(base, d)), count - 1),
    [base, count]
  )
  /** A day outside the grid's years: they are read again and the grid opens there. */
  const outside = (d: LocalDate): boolean => {
    const col = diffDays(base, d)
    if (col >= 0 && col < count) return false
    onOutside(d)
    return true
  }
  const goTo = (d: LocalDate) => {
    if (!outside(d)) grid.current?.scrollToCol(colOf(d))
  }
  // T (lib/shortcuts): back to today, with the grid's cursor on today so the arrows go on from there.
  useShortcutAction('goToday', () => grid.current?.focusCell({ row: 0, col: colOf(today) }))
  const onPickStay = (s: FoundStayView) => {
    if (outside(s.checkIn)) return
    const row = model.rooms.findIndex((r) => r.id === s.roomId)
    const col = colOf(s.checkIn)
    if (row >= 0) grid.current?.focusCell({ row, col })
    else grid.current?.scrollToCol(col)
    setFlash(s.stayId)
  }
  const onFound = (r: FreeRoomsResult) => {
    setFree({
      roomIds: new Set(r.roomIds),
      from: r.checkIn,
      to: r.checkOut === r.checkIn ? addDays(r.checkIn, 1) : r.checkOut,
      count: r.roomIds.length,
      checkOut: r.checkOut
    })
    goTo(r.checkIn)
  }
  const onOpenStay = useCallback((s: GridStayView) => onOpenReservation(s.reservationId), [onOpenReservation])
  const onOpenCell = useCallback((roomId: string, date: LocalDate) => onNew(roomId, date), [onNew])
  const roomTypes = useMemo(() => {
    const seen = new Map<string, string>()
    for (const r of model.rooms)
      if (!seen.has(r.typeId))
        seen.set(r.typeId, r.typeNameI18n?.[f.locale] || r.typeNameI18n?.tr || r.typeName)
    return [...seen].map(([id, name]) => ({ id, name }))
  }, [model.rooms, f.locale])
  const occupied = useMemo(
    () =>
      new Set(
        model.stays.filter((s) => !s.dayUse && s.checkIn <= today && today < s.checkOut).map((s) => s.roomId)
      ).size,
    [model.stays, today]
  )

  if (data.isPending && model.rooms.length === 0) return <GridSkeleton />
  if (data.error) return <ErrorState error={data.error} onRetry={data.refetch} />
  if (model.rooms.length === 0)
    return (
      <EmptyState
        icon={CalendarDaysIcon}
        title={t('calendar.noRoomsTitle')}
        body={t('calendar.noRoomsBody')}
      />
    )

  return (
    <>
      {/* Hidden as soon as the grid shows a stay: it never moves the grid while someone is writing. */}
      <FirstReservationHint hidden={model.stays.length > 0} />
      <div className="flex flex-wrap items-center gap-2">
        <CalendarNavigation
          anchor={anchor}
          today={today}
          min={base}
          max={last}
          onToday={() => goTo(today)}
          onShift={(days) => grid.current?.scrollToCol(colOf(addDays(anchor, days)))}
          onGoTo={goTo}
        />
        <div className="ms-auto flex flex-wrap items-center gap-2">
          <GuestJump onPick={onPickStay} />
          <Button variant="outline" size="sm" onClick={() => setFreeOpen(true)}>
            <DoorOpenIcon aria-hidden />
            {t('calendar.freeRooms.button')}
          </Button>
          {can('rooms.block', 'edit') ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBlock({ mode: 'new', roomId: null, date: anchor < today ? today : anchor })}
              data-testid="block-new"
            >
              <LockIcon aria-hidden />
              {t('calendar.block.open')}
            </Button>
          ) : null}
          {can('calendar.notes', 'edit') ? (
            <Button variant="outline" size="sm" onClick={() => setBulkStart(anchor)}>
              <CalendarPlusIcon aria-hidden />
              {t('calendar.bulk.open')}
            </Button>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        <p className="text-muted-foreground">
          {t('calendar.occupancyToday', { count: occupied, rooms: model.rooms.length })}
        </p>
        {free ? (
          <p
            className="bg-accent flex items-center gap-2 rounded-md py-0.5 ps-2 pe-0.5"
            role="status"
            data-testid="free-banner"
          >
            <DoorOpenIcon className="text-primary size-3.5" aria-hidden />
            {t('calendar.freeRooms.banner', {
              count: free.count,
              from: f.dayMonth(free.from),
              to: f.dayMonth(free.checkOut)
            })}
            <Button variant="ghost" size="xs" onClick={() => setFree(null)}>
              <XIcon aria-hidden />
              {t('calendar.freeRooms.clear')}
            </Button>
          </p>
        ) : null}
      </div>
      <CalendarGrid
        ref={grid}
        model={model}
        base={base}
        count={count}
        today={today}
        initialCol={initialCol}
        setup={setup}
        legend={legend}
        highlight={highlight}
        free={free}
        flashStayId={flash}
        onOpenStay={onOpenStay}
        onOpenCell={onOpenCell}
        onOpenBlock={onOpenBlock}
        issues={issues}
        onOpenDay={setDayOpen}
        onView={onView}
        onMoveStay={canMove ? setMove : undefined}
      />
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <Legend items={legend} />
        {canMove ? (
          <p className="text-muted-foreground max-w-md text-xs" data-testid="drag-hint">
            {t('calendar.move.hint')}
          </p>
        ) : null}
      </div>
      <MoveStayDialog move={move} rooms={model.rooms} today={today} onDone={() => setMove(null)} />
      <ParkArea onOpenReservation={onOpenReservation} />
      <DayDialog
        date={dayOpen}
        entries={dayOpen ? (model.days.get(dayOpen) ?? []) : []}
        onOpenChange={(o) => !o && setDayOpen(null)}
        onBulk={(d) => {
          setDayOpen(null)
          setBulkStart(d)
        }}
      />
      <BlockDialog
        key={block ? (block.mode === 'view' ? block.block.id : `new-${block.date}`) : 'closed'}
        state={block}
        rooms={model.rooms}
        today={today}
        onOpenChange={(o) => !o && setBlock(null)}
      />
      <BulkNoteDialog
        key={bulkStart ?? 'closed'}
        start={bulkStart}
        onOpenChange={(o) => !o && setBulkStart(null)}
      />
      {freeOpen ? (
        <FreeRoomsDialog
          open
          onOpenChange={setFreeOpen}
          start={anchor < today ? today : anchor}
          types={roomTypes}
          onFound={onFound}
        />
      ) : null}
    </>
  )
}
