// Reservation tape chart (G-34…G-47; faz-03 madde 7 iskelet, Faz 5 sanallaştırır): rooms down, days across,
// fixed room column and day header, one bar per stay coloured night by night (§6.14: automatic status fill,
// custom tag border or fill), blocks, today line, weekend and special-day header marks. The grid is a `dir="ltr"`
// island (.claude/rules/ui.md); bar position and width are the only computed inline values (allowed exception).
import { memo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangleIcon,
  BabyIcon,
  CoinsIcon,
  ConciergeBellIcon,
  CrownIcon,
  MessageSquareTextIcon,
  ShieldAlertIcon,
  UsersIcon,
  WrenchIcon
} from 'lucide-react'
import type { StatusKey } from '@shared/contract'
import type { LocalDate } from '@shared/date'
import type { LegendItem } from '@/components/legend'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useFormat } from '@/hooks/use-format'
import { STATUS_BORDER, STATUS_FILL, tagBorder, tagFill } from '@/lib/status-style'
import { cn } from '@/lib/utils'
import { columnOf, spanOf } from './layout'

export type CellPaint = { kind: 'auto'; code: StatusKey } | { kind: 'custom'; tagId: string } | null
export type StayIcon = 'note' | 'request' | 'vip' | 'kbs' | 'warn' | 'deposit' | 'child' | 'group'

export interface TapeRoom {
  id: string
  number: string
  typeLabel: string
  beds: number
  hk: 'clean' | 'dirty' | 'inspected' | 'maintenance' | 'out_of_order'
}

export interface TapeStay {
  id: string
  reservationId: string
  roomId: string
  checkIn: LocalDate
  checkOut: LocalDate
  dayUse: boolean
  guest: string
  price: string
  nights: { date: LocalDate; fill: CellPaint }[]
  border: CellPaint
  depositIcon: boolean
  icons: StayIcon[]
  inHouse: boolean
}

export interface TapeBlock {
  id: string
  roomId: string
  dateFrom: LocalDate
  dateTo: LocalDate
  kind: 'oos' | 'ooo'
  reason: string
}

export interface TapeDay {
  date: LocalDate
  highlighted: boolean
  special: { kind: 'holiday' | 'half_holiday' | 'special' | 'event'; name: string } | null
}

export interface TapeChartProps {
  rooms: TapeRoom[]
  days: TapeDay[]
  today: LocalDate
  stays: TapeStay[]
  blocks: TapeBlock[]
  /** "Geçmiş tarih, boş" is on (else past empty days look like empty days). */
  pastEmptyOn: boolean
  onOpenStay: (stay: TapeStay) => void
  onOpenCell: (roomId: string, date: LocalDate) => void
  footer?: ReactNode
  /** A picture only (the status-tag preview): bars are not buttons and cells do not open anything. */
  readOnly?: boolean
  /** The legend on the page: a bar's accessible name says its status in words, not only in colour. */
  legend?: readonly LegendItem[]
}

const HK_DOT: Record<TapeRoom['hk'], string> = {
  clean: 'bg-hk-clean',
  dirty: 'bg-hk-dirty',
  inspected: 'bg-hk-inspected',
  maintenance: 'bg-hk-maintenance',
  out_of_order: 'bg-hk-ooo'
}

const ICON: Record<StayIcon, typeof CrownIcon> = {
  note: MessageSquareTextIcon,
  request: ConciergeBellIcon,
  vip: CrownIcon,
  kbs: ShieldAlertIcon,
  warn: AlertTriangleIcon,
  deposit: CoinsIcon,
  child: BabyIcon,
  group: UsersIcon
}

const paintFill = (p: CellPaint): string =>
  p === null ? 'bg-muted text-foreground' : p.kind === 'auto' ? STATUS_FILL[p.code] : tagFill(p.tagId)
const paintBorder = (p: CellPaint): string =>
  p === null ? 'border-transparent' : p.kind === 'auto' ? STATUS_BORDER[p.code] : tagBorder(p.tagId)

/** The legend names of a bar's first-night fill and its tag border ("Ödenmedi, VIP"). */
const paintNames = (legend: readonly LegendItem[], ...paints: CellPaint[]): string =>
  paints
    .flatMap((p) => {
      if (p === null) return []
      const item = legend.find((l) =>
        l.subject.kind === 'auto'
          ? p.kind === 'auto' && l.subject.code === p.code
          : p.kind === 'custom' && l.subject.tagId === p.tagId
      )
      return item ? [item.label] : []
    })
    .filter((name, i, all) => all.indexOf(name) === i)
    .join(', ')

/** Bar geometry: the one inline style the rules allow (computed position and size). */
const place = (start: number, span: number) => ({
  left: `calc(var(--tape-day) * ${start} + 2px)`,
  width: `calc(var(--tape-day) * ${span} - 4px)`
})

export const TapeChart = memo(function TapeChart({
  rooms,
  days,
  today,
  stays,
  blocks,
  pastEmptyOn,
  onOpenStay,
  onOpenCell,
  footer,
  readOnly = false,
  legend = []
}: TapeChartProps) {
  const { t } = useTranslation()
  const f = useFormat()
  const from = days[0]?.date
  if (!from) return null
  const count = days.length
  const todayCol = columnOf(from, count, today)

  return (
    <div
      dir="ltr"
      data-testid="tape-chart"
      className="bg-card relative max-h-[calc(100dvh-13rem)] overflow-auto rounded-xl border"
    >
      <div className="w-max min-w-full">
        {/* Header: month + weekday/day, sticky on top; the room corner is sticky on both axes. */}
        <div className="bg-card sticky top-0 z-20 flex border-b">
          <div className="bg-card sticky left-0 z-30 flex w-(--tape-room) shrink-0 items-end border-r px-3 pb-1.5 text-xs font-medium">
            {t('tape.room')}
          </div>
          {days.map((d, i) => {
            const isToday = i === todayCol
            const first = i === 0 || d.date.endsWith('-01')
            return (
              <div
                key={d.date}
                data-testid={isToday ? 'tape-today' : undefined}
                className={cn(
                  'relative flex h-14 w-(--tape-day) shrink-0 flex-col items-center justify-end border-r pb-1 text-xs tabular-nums',
                  d.highlighted && 'bg-accent/60',
                  d.special?.kind === 'holiday' && 'bg-chart-3/20',
                  isToday && 'bg-primary text-primary-foreground'
                )}
              >
                {first ? (
                  // Wider than a day column ("ОКТ. 2026 Г."): one line over the next days, on its own
                  // background so a highlighted or today column under it does not hide it.
                  <span className="bg-card text-muted-foreground absolute top-1 left-0.5 z-[1] rounded-sm px-1 text-xs leading-4 font-semibold whitespace-nowrap uppercase">
                    {f.monthYear(d.date)}
                  </span>
                ) : null}
                <span className={cn('leading-none', !isToday && 'text-muted-foreground')}>
                  {f.weekday(d.date)}
                </span>
                <span className="text-sm leading-tight font-semibold">{Number(d.date.slice(8))}</span>
                {d.special ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        role="img"
                        aria-label={d.special.name}
                        className={cn(
                          'absolute top-1 right-1 size-2 rounded-full',
                          d.special.kind === 'event' ? 'bg-chart-5' : 'bg-chart-3',
                          d.special.kind === 'half_holiday' && 'ring-chart-3 bg-transparent ring-2'
                        )}
                      />
                    </TooltipTrigger>
                    <TooltipContent>{d.special.name}</TooltipContent>
                  </Tooltip>
                ) : null}
              </div>
            )
          })}
        </div>

        {rooms.map((room) => {
          const roomStays = stays.filter((s) => s.roomId === room.id)
          const roomBlocks = blocks.filter((b) => b.roomId === room.id)
          return (
            <div
              key={room.id}
              className="flex border-b last:border-b-0"
              data-testid={`tape-row-${room.number}`}
            >
              <div className="bg-card sticky left-0 z-10 flex h-(--density-row) w-(--tape-room) shrink-0 items-center gap-2 border-r px-3">
                <span className={cn('size-2 shrink-0 rounded-full', HK_DOT[room.hk])} aria-hidden />
                <span className="text-sm font-semibold tabular-nums">{room.number}</span>
                <span
                  className="text-muted-foreground line-clamp-2 min-w-0 text-[0.6875rem] leading-tight break-words"
                  title={room.typeLabel}
                >
                  {room.typeLabel}
                </span>
              </div>
              <div className="relative flex">
                {days.map((d, i) => (
                  <div
                    key={d.date}
                    aria-hidden
                    onClick={readOnly ? undefined : () => onOpenCell(room.id, d.date)}
                    className={cn(
                      'h-(--density-row) w-(--tape-day) shrink-0 border-r',
                      !readOnly && 'cursor-cell',
                      i < todayCol && pastEmptyOn ? STATUS_FILL.pastEmpty : STATUS_FILL.empty,
                      i < todayCol && 'opacity-60',
                      d.highlighted && i >= todayCol && 'bg-accent/40'
                    )}
                  />
                ))}
                {todayCol >= 0 ? (
                  <div
                    aria-hidden
                    className="bg-primary pointer-events-none absolute inset-y-0 z-[5] w-0.5"
                    style={{ left: `calc(var(--tape-day) * ${todayCol})` }}
                  />
                ) : null}
                {roomBlocks.map((b) => {
                  const span = spanOf(from, count, b.dateFrom, b.dateTo)
                  if (!span) return null
                  const label = t(b.kind === 'ooo' ? 'tape.blockOoo' : 'tape.blockOos', { reason: b.reason })
                  return (
                    <div
                      key={b.id}
                      role="img"
                      aria-label={label}
                      title={label}
                      className={cn(
                        'absolute inset-y-1 z-[6] flex items-center gap-1 overflow-hidden rounded-md px-2 text-xs font-medium',
                        'bg-[repeating-linear-gradient(135deg,transparent_0_6px,rgb(255_255_255/0.12)_6px_12px)] dark:bg-[repeating-linear-gradient(135deg,transparent_0_6px,rgb(0_0_0/0.18)_6px_12px)]',
                        STATUS_FILL.blocked
                      )}
                      style={place(span.start, span.span)}
                    >
                      <WrenchIcon className="size-3.5 shrink-0" aria-hidden />
                      <span className="truncate">{b.reason}</span>
                    </div>
                  )
                })}
                {roomStays.map((s) => {
                  const span = s.dayUse
                    ? spanOf(
                        from,
                        count,
                        s.checkIn,
                        days[columnOf(from, count, s.checkIn) + 1]?.date ?? s.checkIn
                      )
                    : spanOf(from, count, s.checkIn, s.checkOut)
                  if (!span) return null
                  const visibleNights = s.nights.filter((n) => columnOf(from, count, n.date) >= 0)
                  const firstFill = visibleNights[0]?.fill ?? null
                  const stayLabel = t('tape.stayLabel', {
                    guest: s.guest,
                    room: room.number,
                    from: f.dayMonth(s.checkIn),
                    to: f.dayMonth(s.checkOut)
                  })
                  const status = paintNames(legend, firstFill, s.border)
                  const label = status ? t('tape.stayWithStatus', { stay: stayLabel, status }) : stayLabel
                  const barClass = cn(
                    'focus-visible:ring-ring absolute inset-y-1 z-[7] flex overflow-hidden rounded-md border-2 text-start shadow-xs outline-none focus-visible:ring-[3px]',
                    paintBorder(s.border),
                    s.dayUse && 'inset-y-2',
                    span.cutStart && 'rounded-s-none',
                    span.cutEnd && 'rounded-e-none',
                    s.inHouse && 'ring-foreground/30 ring-1'
                  )
                  const content = (
                    <>
                      {visibleNights.map((n) => (
                        <span key={n.date} aria-hidden className={cn('h-full flex-1', paintFill(n.fill))} />
                      ))}
                      <span
                        className={cn(
                          'absolute inset-0 flex items-center gap-1 px-1.5 text-xs leading-none',
                          paintFill(firstFill),
                          'bg-transparent'
                        )}
                      >
                        <span className="truncate font-semibold">{s.guest}</span>
                        {/* Short bars keep the room for the name; the price is in the panel. */}
                        {span.span > 2 ? <span className="shrink-0 tabular-nums">{s.price}</span> : null}
                        <span className="ms-auto flex shrink-0 items-center gap-0.5">
                          {s.icons.map((icon) => {
                            const Icon = ICON[icon]
                            return <Icon key={icon} className="size-3" aria-hidden />
                          })}
                        </span>
                      </span>
                    </>
                  )
                  return readOnly ? (
                    <div
                      key={s.id}
                      role="img"
                      data-testid={`stay-${s.id}`}
                      aria-label={label}
                      title={label}
                      className={barClass}
                      style={place(span.start, span.span)}
                    >
                      {content}
                    </div>
                  ) : (
                    <button
                      type="button"
                      key={s.id}
                      data-testid={`stay-${s.id}`}
                      aria-label={label}
                      title={label}
                      onClick={() => onOpenStay(s)}
                      className={barClass}
                      style={place(span.start, span.span)}
                    >
                      {content}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
      {footer}
    </div>
  )
})
