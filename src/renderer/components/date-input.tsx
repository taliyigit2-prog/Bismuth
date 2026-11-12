// Date field (YYYY-MM-DD local day, CLAUDE.md): a button showing the day in the UI language and a month grid in
// a popover. Week starts on Monday (tr/en-GB/ru); highlighted weekdays follow `calendar.highlightWeekdays`.
// Keyboard: arrows move a day/week, PageUp/PageDown a month, Home/End the week, Enter picks, Esc closes.
import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { addDays, diffDays, localDate, today as todayOf, weekday, type LocalDate } from '@shared/date'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useFormat } from '@/hooks/use-format'
import { useSettings } from '@/lib/api/hooks'
import { cn } from '@/lib/utils'

/** First day of the month of `d`. */
const monthStart = (d: LocalDate): LocalDate => localDate(`${d.slice(0, 7)}-01`)

/** Shift by whole months, clamping the day (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(d: LocalDate, months: number): LocalDate {
  const y = Number(d.slice(0, 4))
  const m = Number(d.slice(5, 7)) - 1 + months
  const year = y + Math.floor(m / 12)
  const month = ((m % 12) + 12) % 12
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const day = Math.min(Number(d.slice(8, 10)), last)
  return localDate(`${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`)
}

/** The 6×7 grid of a month view, Monday first. */
export function monthGrid(month: LocalDate): LocalDate[] {
  const first = monthStart(month)
  const back = (weekday(first) + 6) % 7
  const start = addDays(first, -back)
  return Array.from({ length: 42 }, (_, i) => addDays(start, i))
}

export function MonthCalendar({
  value,
  onPick,
  min,
  max
}: {
  value: LocalDate | null
  onPick: (d: LocalDate) => void
  min?: LocalDate
  max?: LocalDate
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const settings = useSettings()
  const highlight = settings.data?.['calendar.highlightWeekdays'] ?? [6, 0]
  const today = todayOf()
  const [focus, setFocus] = useState<LocalDate>(value ?? today)
  const [month, setMonth] = useState<LocalDate>(monthStart(value ?? today))
  const grid = useMemo(() => monthGrid(month), [month])
  const gridRef = useRef<HTMLDivElement>(null)
  const disabled = (d: LocalDate): boolean => (!!min && d < min) || (!!max && d > max)

  const move = (d: LocalDate): void => {
    setFocus(d)
    if (monthStart(d) !== month) setMonth(monthStart(d))
    requestAnimationFrame(() =>
      gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${d}"]`)?.focus()
    )
  }
  const onKeyDown = (e: KeyboardEvent): void => {
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
    if (e.key in step) {
      e.preventDefault()
      // The grid is a dir="ltr" island: left/right are earlier/later in every language.
      move(addDays(focus, step[e.key]!))
    } else if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault()
      move(addMonths(focus, e.key === 'PageUp' ? -1 : 1))
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault()
      const back = (weekday(focus) + 6) % 7
      move(addDays(focus, e.key === 'Home' ? -back : 6 - back))
    }
  }
  const weekdays = grid.slice(0, 7)
  return (
    <div className="grid gap-2" data-testid="month-calendar">
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t('dateInput.previousMonth')}
          onClick={() => setMonth(addMonths(month, -1))}
        >
          <ChevronLeftIcon className="rtl:rotate-180" />
        </Button>
        {/* First letter only: CSS `capitalize` would also write Russian "г." as "Г.". */}
        <p className="text-sm font-semibold" aria-live="polite">
          {f.monthYear(month).replace(/^\p{L}/u, (c) => c.toLocaleUpperCase(f.locale))}
        </p>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t('dateInput.nextMonth')}
          onClick={() => setMonth(addMonths(month, 1))}
        >
          <ChevronRightIcon className="rtl:rotate-180" />
        </Button>
      </div>
      <div
        dir="ltr"
        ref={gridRef}
        role="grid"
        aria-label={f.monthYear(month)}
        onKeyDown={onKeyDown}
        className="grid gap-1"
      >
        <div role="row" className="grid grid-cols-7 gap-1">
          {weekdays.map((d) => (
            <span
              role="columnheader"
              key={d}
              className={cn(
                'text-muted-foreground text-center text-xs font-medium',
                highlight.includes(weekday(d)) && 'text-primary'
              )}
            >
              {f.weekday(d)}
            </span>
          ))}
        </div>
        {[0, 1, 2, 3, 4, 5].map((row) => (
          <div role="row" key={row} className="grid grid-cols-7 gap-1">
            {grid.slice(row * 7, row * 7 + 7).map((d) => {
              const inMonth = d.slice(0, 7) === month.slice(0, 7)
              const selected = d === value
              return (
                <button
                  type="button"
                  role="gridcell"
                  key={d}
                  data-day={d}
                  tabIndex={d === focus ? 0 : -1}
                  aria-selected={selected}
                  aria-current={d === today ? 'date' : undefined}
                  aria-label={f.date(d, 'full')}
                  disabled={disabled(d)}
                  onClick={() => onPick(d)}
                  className={cn(
                    'focus-visible:ring-ring grid size-9 place-items-center rounded-md text-sm tabular-nums outline-none focus-visible:ring-[3px] max-md:size-11',
                    !inMonth && 'text-muted-foreground/60',
                    highlight.includes(weekday(d)) && inMonth && !selected && 'bg-accent/60',
                    d === today && !selected && 'ring-primary ring-1',
                    selected ? 'bg-primary text-primary-foreground font-semibold' : 'hover:bg-accent',
                    'disabled:pointer-events-none disabled:opacity-40'
                  )}
                >
                  {Number(d.slice(8))}
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

export function DateInput({
  value,
  onChange,
  label,
  min,
  max,
  placeholder
}: {
  value: LocalDate | null
  onChange: (d: LocalDate) => void
  label: string
  min?: LocalDate
  max?: LocalDate
  placeholder?: string
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const id = useId()
  const [open, setOpen] = useState(false)
  const relative = value ? diffDays(todayOf(), value) : null
  return (
    <div className="grid min-w-0 gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            variant="outline"
            className={cn(
              'border-input w-full min-w-0 justify-start gap-2 font-normal',
              !value && 'text-muted-foreground'
            )}
          >
            <CalendarIcon aria-hidden />
            {/* Short weekday + long date ("вс, 4 октября 2026 г."): the full weekday cut the year in Russian. */}
            <span className="min-w-0 truncate" title={value ? f.date(value, 'full') : undefined}>
              {value
                ? t('dateInput.value', { weekday: f.weekday(value), date: f.date(value, 'long') })
                : (placeholder ?? t('dateInput.pick'))}
            </span>
            {relative !== null && Math.abs(relative) <= 1 ? (
              <span className="text-muted-foreground ms-auto text-xs">
                {t(
                  relative === 0
                    ? 'dateInput.today'
                    : relative === 1
                      ? 'dateInput.tomorrow'
                      : 'dateInput.yesterday'
                )}
              </span>
            ) : null}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-3" align="start">
          <MonthCalendar
            value={value}
            min={min}
            max={max}
            onPick={(d) => {
              onChange(d)
              setOpen(false)
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}
