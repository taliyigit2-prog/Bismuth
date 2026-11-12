// Takvim notları ve özel günler (G-16, G-40, faz-09 madde 6): a year's public holidays — generated offline for
// any year the moment it is shown (2036 too) — and the hotel's own notes, special days and events, month by month.
// Notes are added for one day, a range, chosen weekdays ("her cumartesi") or a pasted list, with a kind, a colour
// and a yearly repeat; a generated holiday that is edited becomes the hotel's own and is kept. Nothing is deleted:
// a day is cancelled (alone, or all days of a bulk note). The yearly online check of holiday dates lives on the
// Döviz screen (Bayramlar tab, Faz 11); a link leads there.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { toast } from 'sonner'
import {
  CalendarHeartIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  GlobeIcon,
  PencilIcon,
  PlusIcon,
  RepeatIcon,
  SearchXIcon,
  XIcon
} from 'lucide-react'
import type { CalendarEntryDto } from '@shared/contract/procedures/today'
import { addDays, localDate, localDateOf, type LocalDate } from '@shared/date'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Page } from '@/components/page'
import { QueryView } from '@/components/query-view'
import { EmptyState } from '@/components/states'
import { useFormat } from '@/hooks/use-format'
import { useApiMutation, useApiQuery } from '@/lib/api/hooks'
import { useCan } from '@/lib/view-as'
import { cn } from '@/lib/utils'
import { NoteColorStyles, NoteDot } from './note-color'
import { NoteDialog, type NoteDialogState } from './note-dialog'
import { FILTERS, byMonth, inFilter, isEditedHoliday, type Filter } from './notes-model'

const INVALIDATES = ['calendarNotes.list', 'calendar.days', 'reservations.grid', 'today.summary'] as const

/** A Sunday … Saturday week to name weekdays by their number (0 = Sunday). */
const SUNDAY = localDate('2026-10-04')

function DayRow({
  day,
  highlighted,
  canEdit,
  onEdit,
  onCancel
}: {
  day: CalendarEntryDto
  highlighted: boolean
  canEdit: boolean
  onEdit: () => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const date = day.occurrenceDate as LocalDate
  const title = day.titleI18n?.[f.locale] ?? day.title ?? ''
  return (
    <li
      className="flex min-h-11 items-start gap-3 py-2"
      data-testid={`day-${day.occurrenceDate}`}
      data-kind={day.kind}
    >
      <span
        className={cn(
          'grid w-12 shrink-0 justify-items-center rounded-md py-0.5 leading-tight',
          highlighted && 'bg-accent'
        )}
      >
        <span className="text-base font-semibold tabular-nums">{Number(date.slice(8, 10))}</span>
        <span className="text-muted-foreground text-xs">{f.weekday(date)}</span>
      </span>
      <NoteDot kind={day.kind} color={day.color} className="mt-2" />
      <span className="grid min-w-0 flex-1 gap-1 pt-0.5">
        <span className="font-medium break-words">{title}</span>
        {day.note ? <span className="text-muted-foreground text-xs break-words">{day.note}</span> : null}
        <span className="flex flex-wrap items-center gap-1">
          <Badge variant={day.kind === 'holiday' ? 'destructive' : 'secondary'}>
            {t(`calendarNotes.kind.${day.kind}`)}
          </Badge>
          {day.estimated ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" tabIndex={0}>
                  {t('calendarNotes.estimated')}
                </Badge>
              </TooltipTrigger>
              <TooltipContent className="max-w-64">{t('calendarNotes.estimatedHint')}</TooltipContent>
            </Tooltip>
          ) : null}
          {day.source === 'verified' ? <Badge variant="outline">{t('calendarNotes.verified')}</Badge> : null}
          {isEditedHoliday(day) ? <Badge variant="outline">{t('calendarNotes.edited')}</Badge> : null}
          {day.recurringYearly ? (
            <Badge variant="outline" className="gap-1">
              <RepeatIcon aria-hidden />
              {t('calendarNotes.everyYear')}
            </Badge>
          ) : null}
        </span>
      </span>
      {canEdit ? (
        <span className="flex shrink-0 items-center gap-1">
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={onEdit}
            aria-label={t('calendarNotes.editFor', { title, date: f.date(date) })}
          >
            <PencilIcon />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={onCancel}
            aria-label={t('calendarNotes.cancelFor', { title, date: f.date(date) })}
          >
            <XIcon />
          </Button>
        </span>
      ) : null}
    </li>
  )
}

function CancelDialog({ day, onClose }: { day: CalendarEntryDto; onClose: () => void }) {
  const { t } = useTranslation()
  const f = useFormat()
  const title = day.titleI18n?.[f.locale] ?? day.title ?? ''
  const one = useApiMutation('calendarNotes.cancel', {
    invalidates: INVALIDATES,
    onSuccess: () => {
      toast.success(t('calendarNotes.cancelled', { count: 1 }))
      onClose()
    },
    onError: (e) =>
      void toast.error(t(e.messageKey as 'errors.internal', { defaultValue: t('errors.internal') }))
  })
  const group = useApiMutation('calendarNotes.cancelGroup', {
    invalidates: INVALIDATES,
    onSuccess: ({ count }) => {
      toast.success(t('calendarNotes.cancelled', { count }))
      onClose()
    },
    onError: (e) =>
      void toast.error(t(e.messageKey as 'errors.internal', { defaultValue: t('errors.internal') }))
  })
  const pending = one.isPending || group.isPending
  const isGroup = day.groupKey !== null
  return (
    <AlertDialog open onOpenChange={(o) => (o ? null : onClose())}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('calendarNotes.cancelTitle', { title })}</AlertDialogTitle>
          <AlertDialogDescription>
            {day.recurringYearly
              ? t('calendarNotes.cancelYearlyBody')
              : isGroup
                ? t('calendarNotes.cancelGroupBody', { date: f.date(day.occurrenceDate as LocalDate) })
                : t('calendarNotes.cancelBody', { date: f.date(day.occurrenceDate as LocalDate) })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
          {isGroup ? (
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => group.mutate({ groupKey: day.groupKey as string })}
              data-testid="cancel-group"
            >
              {t('calendarNotes.cancelAll')}
            </Button>
          ) : null}
          <AlertDialogAction
            disabled={pending}
            onClick={(e) => {
              e.preventDefault()
              one.mutate({ id: day.id })
            }}
            data-testid="cancel-one"
          >
            {isGroup ? t('calendarNotes.cancelOnlyThis') : t('calendarNotes.cancelDay')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function YearList({
  days,
  highlight,
  filter,
  canEdit,
  onEdit,
  onCancel,
  onClear
}: {
  days: CalendarEntryDto[]
  highlight: readonly number[]
  filter: Filter
  canEdit: boolean
  onEdit: (d: CalendarEntryDto) => void
  onCancel: (d: CalendarEntryDto) => void
  onClear: () => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const shown = days.filter((d) => inFilter(d, filter))
  if (!shown.length)
    return (
      <EmptyState
        compact
        icon={SearchXIcon}
        title={t('calendarNotes.noneTitle')}
        body={t('calendarNotes.noneBody')}
        action={
          <Button variant="outline" size="sm" onClick={onClear}>
            {t('common.clearFilter')}
          </Button>
        }
      />
    )
  return (
    <div className="grid items-start gap-4 lg:grid-cols-2" data-testid="notes-year">
      <NoteColorStyles colors={shown.map((d) => d.color)} />
      {byMonth(shown).map(([month, list]) => (
        <Card key={month} className="min-w-0 gap-2 py-4" data-testid={`month-${month}`}>
          <CardHeader className="px-4">
            <CardTitle className="flex items-center gap-2 text-sm">
              <span className="inline-block first-letter:uppercase">
                {f.monthYear(`${month}-01` as LocalDate)}
              </span>
              <Badge variant="secondary" className="tabular-nums">
                {list.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            <ul className="divide-y">
              {list.map((d) => (
                <DayRow
                  key={`${d.id}-${d.occurrenceDate}`}
                  day={d}
                  highlighted={highlight.includes(new Date(`${d.occurrenceDate}T12:00:00`).getDay())}
                  canEdit={canEdit}
                  onEdit={() => onEdit(d)}
                  onCancel={() => onCancel(d)}
                />
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function NotesSkeleton() {
  const { t } = useTranslation()
  return (
    <div role="status" aria-busy className="grid gap-4 lg:grid-cols-2">
      <span className="sr-only">{t('common.loading')}</span>
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-48" aria-hidden />
      ))}
    </div>
  )
}

export function CalendarNotesPage() {
  const { t } = useTranslation()
  const f = useFormat()
  const can = useCan()
  const canEdit = can('calendar.notes', 'edit')
  const thisYear = Number(localDateOf(new Date()).slice(0, 4))
  const [year, setYear] = useState(thisYear)
  const [filter, setFilter] = useState<Filter>('all')
  const [dialog, setDialog] = useState<NoteDialogState | null>(null)
  const [cancelling, setCancelling] = useState<CalendarEntryDto | null>(null)
  const query = useApiQuery('calendarNotes.list', { from: `${year}-01-01`, to: `${year + 1}-01-01` })
  const highlight = query.data?.highlightWeekdays ?? []
  const weekdayNames = [...highlight]
    .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
    .map((d) => f.weekday(addDays(SUNDAY, d), 'long'))
  const firstDay = (): LocalDate => {
    const today = localDateOf(new Date())
    return Number(today.slice(0, 4)) === year ? today : localDate(`${year}-01-01`)
  }
  return (
    <Page
      title={t('nav.calendarNotes')}
      description={t('calendarNotes.description')}
      actions={
        canEdit ? (
          <Button onClick={() => setDialog({ mode: 'add', start: firstDay() })} data-testid="note-add">
            <PlusIcon aria-hidden />
            {t('calendarNotes.add')}
          </Button>
        ) : undefined
      }
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex items-center gap-1" role="group" aria-label={t('calendarNotes.yearLabel')}>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setYear((y) => y - 1)}
            aria-label={t('calendarNotes.prevYear')}
          >
            <ChevronLeftIcon className="rtl:rotate-180" />
          </Button>
          <span
            className="min-w-16 text-center text-lg font-semibold tabular-nums"
            data-testid="notes-year-label"
          >
            {year}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setYear((y) => y + 1)}
            aria-label={t('calendarNotes.nextYear')}
          >
            <ChevronRightIcon className="rtl:rotate-180" />
          </Button>
          {year !== thisYear ? (
            <Button variant="ghost" size="sm" onClick={() => setYear(thisYear)}>
              {t('calendarNotes.thisYear')}
            </Button>
          ) : null}
        </div>
        <ToggleGroup
          type="single"
          variant="outline"
          value={filter}
          onValueChange={(v) => v && setFilter(v as Filter)}
          className="flex-wrap max-md:w-full"
          aria-label={t('calendarNotes.filterLabel')}
        >
          {FILTERS.map((k) => (
            <ToggleGroupItem
              key={k}
              value={k}
              className="h-auto min-h-9 px-3 py-1.5 whitespace-normal max-md:flex-1"
            >
              {t(`calendarNotes.filter.${k}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <span className="flex items-center gap-2">
          <span className="bg-accent inline-block size-3 rounded-sm" aria-hidden />
          {weekdayNames.length
            ? t('calendarNotes.highlighted', { days: weekdayNames.join(', ') })
            : t('calendarNotes.noHighlighted')}
          {can('settings', 'edit') ? (
            <Button asChild variant="link" size="sm" className="h-auto px-0">
              <Link to="/settings" search={{ tab: 'calendar' }}>
                {t('calendarNotes.changeHighlight')}
              </Link>
            </Button>
          ) : null}
        </span>
        {canEdit ? (
          <Button asChild variant="link" size="sm" className="h-auto gap-1 px-0">
            <a href="#/currency?tab=holidays" data-testid="holiday-check-link">
              <GlobeIcon aria-hidden />
              {t('calendarNotes.checkOnline')}
            </a>
          </Button>
        ) : null}
      </div>

      <QueryView
        query={query}
        loading={<NotesSkeleton />}
        isEmpty={(v) => v.days.length === 0}
        empty={{
          icon: CalendarHeartIcon,
          title: t('calendarNotes.emptyTitle'),
          body: t('calendarNotes.emptyBody')
        }}
      >
        {(v) => (
          <YearList
            days={v.days}
            highlight={v.highlightWeekdays}
            filter={filter}
            canEdit={canEdit}
            onEdit={(day) => setDialog({ mode: 'edit', day })}
            onCancel={setCancelling}
            onClear={() => setFilter('all')}
          />
        )}
      </QueryView>

      {dialog ? (
        <NoteDialog
          key={dialog.mode === 'edit' ? dialog.day.id : 'add'}
          state={dialog}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {cancelling ? <CancelDialog day={cancelling} onClose={() => setCancelling(null)} /> : null}
    </Page>
  )
}
