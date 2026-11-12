// Grid navigation (faz-05 madde 6): today, a week back and forward, jump to a month and a year, pick a date.
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarSearchIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { LOCALE_TAG } from '@shared/format'
import { localDate, type LocalDate } from '@shared/date'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MonthCalendar } from '@/components/date-input'
import { useFormat } from '@/hooks/use-format'

export interface NavigationProps {
  /** The day the screen is on (a few days after the left edge). */
  anchor: LocalDate
  /** The hotel's today. */
  today: LocalDate
  /** First and last day the grid holds. */
  min: LocalDate
  max: LocalDate
  onToday: () => void
  /** Moves the screen by whole days (a week: ±7). */
  onShift: (days: number) => void
  /** Puts a day at the screen's anchor. */
  onGoTo: (date: LocalDate) => void
}

const MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'))

export function CalendarNavigation({ anchor, today, min, max, onToday, onShift, onGoTo }: NavigationProps) {
  const { t } = useTranslation()
  const f = useFormat()
  const [picking, setPicking] = useState(false)
  const monthName = useMemo(() => {
    const format = new Intl.DateTimeFormat(LOCALE_TAG[f.locale], { month: 'long', numberingSystem: 'latn' })
    return (month: string) => format.format(new Date(2026, Number(month) - 1, 15))
  }, [f.locale])
  const years = useMemo(() => {
    const first = Number(min.slice(0, 4))
    const last = Number(max.slice(0, 4))
    return Array.from({ length: last - first + 1 }, (_, i) => String(first + i))
  }, [min, max])
  const year = anchor.slice(0, 4)
  const month = anchor.slice(5, 7)
  const goToMonth = (y: string, m: string) => {
    const date = localDate(`${y}-${m}-01`)
    onGoTo(date < min ? min : date > max ? max : date)
  }

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="calendar-nav">
      <Button variant="outline" size="sm" onClick={onToday} aria-pressed={anchor === today}>
        {t('common.today')}
      </Button>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={t('calendar.previousWeek')}
          onClick={() => onShift(-7)}
        >
          <ChevronLeftIcon className="rtl:rotate-180" />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={t('calendar.nextWeek')}
          onClick={() => onShift(7)}
        >
          <ChevronRightIcon className="rtl:rotate-180" />
        </Button>
      </div>
      <Select value={month} onValueChange={(m) => goToMonth(year, m)}>
        <SelectTrigger size="sm" className="w-36" aria-label={t('calendar.nav.month')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MONTHS.map((m) => (
            <SelectItem key={m} value={m}>
              {monthName(m)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={year} onValueChange={(y) => goToMonth(y, month)}>
        <SelectTrigger size="sm" className="w-24 tabular-nums" aria-label={t('calendar.nav.year')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {years.map((y) => (
            <SelectItem key={y} value={y} className="tabular-nums">
              {y}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Popover open={picking} onOpenChange={setPicking}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm">
            <CalendarSearchIcon aria-hidden />
            {t('calendar.nav.goToDate')}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-3" align="start">
          <MonthCalendar
            value={anchor}
            min={min}
            max={max}
            onPick={(d) => {
              setPicking(false)
              onGoTo(d)
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}
