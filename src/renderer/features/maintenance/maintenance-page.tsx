// Bakım (G-91, S-94): periodic reminders (every N days / months / years, last done, next due, who is responsible)
// with late and due-soon loud, the "every N stays" deep-clean counter per room (N = the template's rule, default
// the setting tasks.everyNStays), and the seeded example reminders to switch on. Reminders are task templates; their
// tasks drop into Görevler (G-94). Phone (G-143 "bakım hatırlatıcı"): the same as cards.
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Link } from '@tanstack/react-router'
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  BedDoubleIcon,
  CalendarClockIcon,
  CheckIcon,
  ClipboardListIcon,
  EllipsisIcon,
  LightbulbIcon,
  PencilIcon,
  PlusIcon,
  PowerOffIcon,
  SparklesIcon
} from 'lucide-react'
import { today as todayOf, type LocalDate } from '@shared/date'
import { datePart, type LocalDateTime } from '@shared/domain/local-datetime'
import { DEEP_CLEAN_TEMPLATE_CODE, everyNStaysSchema } from '@shared/domain/task-recurrence'
import { fieldLimits } from '@shared/contract/limits'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Page } from '@/components/page'
import { QueryView } from '@/components/query-view'
import { SectionCard } from '@/components/section-card'
import { useFormat } from '@/hooks/use-format'
import { useIsMobile } from '@/hooks/use-mobile'
import { useApiMutation, useApiQuery } from '@/lib/api/hooks'
import { numberInLimits, useRangeText } from '@/lib/form-errors'
import { FieldError } from '@/components/field-error'
import { useCan } from '@/lib/view-as'
import { cn } from '@/lib/utils'
import { useRuleText } from '../tasks/rule-text'
import {
  assigneeText,
  combine,
  TASK_QUERIES,
  templateTitle,
  useErrorText,
  useTaskLookups,
  type StayCounterGroup,
  type TaskLookups,
  type TemplateDetail
} from '../tasks/task-data'
import { reminderRows, type ReminderRow } from './derive'
import { DoneDialog, ReminderDialog, type DoneTarget, type ReminderMode } from './maintenance-dialogs'

// A long (Russian) text wraps inside the badge instead of running into the next column.
const WRAP = 'h-auto shrink whitespace-normal text-start'

function DueBadge({ row }: { row: ReminderRow }) {
  const { t } = useTranslation()
  if (row.daysLeft === null) return null
  if (row.state === 'overdue')
    return (
      <Badge variant="destructive" className={WRAP}>
        {t('maintenance.overdue', { count: -row.daysLeft })}
      </Badge>
    )
  if (row.daysLeft === 0)
    return (
      <Badge variant="destructive" className={WRAP}>
        {t('maintenance.dueToday')}
      </Badge>
    )
  return (
    <Badge
      variant="outline"
      className={cn(WRAP, row.state === 'soon' ? 'border-warning text-foreground' : 'text-muted-foreground')}
    >
      {t('maintenance.daysLeft', { count: row.daysLeft })}
    </Badge>
  )
}

function NextDate({ row, full = false }: { row: ReminderRow; full?: boolean }) {
  const { t } = useTranslation()
  const f = useFormat()
  const next = row.template.nextDueAt ? datePart(row.template.nextDueAt as LocalDateTime) : null
  if (!next) return <span className="text-muted-foreground">{t('maintenance.notScheduled')}</span>
  // Kept on one line: Russian "2026 г." must not split at the line end.
  return <span className="whitespace-nowrap tabular-nums">{f.date(next, full ? 'full' : 'medium')}</span>
}

function WhoText({ row, lookups }: { row: ReminderRow; lookups: TaskLookups }) {
  const { t } = useTranslation()
  const f = useFormat()
  const who = assigneeText(f, lookups, row.template)
  return <span>{who.name ?? t('maintenance.add.noAssignee')}</span>
}

function RowActions({
  row,
  onDone,
  onEdit,
  onOff
}: {
  row: ReminderRow
  onDone: (row: ReminderRow) => void
  onEdit: (row: ReminderRow) => void
  onOff: (row: ReminderRow) => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const title = templateTitle(f, row.template)
  // Calendar rules (every Wednesday…) are done through their task; an interval series can be done any day.
  const canDone = row.rule?.kind === 'interval' || row.template.openTaskId !== null
  return (
    <span className="inline-flex items-center gap-1">
      {canDone ? (
        <Button size="sm" variant="outline" className="max-md:min-h-11" onClick={() => onDone(row)}>
          <CheckIcon aria-hidden />
          {t('maintenance.markDone')}
        </Button>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon-sm"
            variant="ghost"
            className="max-md:size-11"
            aria-label={t('maintenance.more', { title })}
          >
            <EllipsisIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {row.rule?.kind === 'interval' ? (
            <DropdownMenuItem onSelect={() => onEdit(row)}>
              <PencilIcon aria-hidden />
              {t('common.edit')}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onSelect={() => onOff(row)}>
            <PowerOffIcon aria-hidden />
            {t('maintenance.turnOff')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  )
}

type Actions = {
  onDone: (row: ReminderRow) => void
  onEdit: (row: ReminderRow) => void
  onOff: (row: ReminderRow) => void
} | null

function OnTaskList({ row }: { row: ReminderRow }) {
  const { t } = useTranslation()
  if (!row.template.openTaskId) return null
  return (
    <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
      <ClipboardListIcon className="size-3" aria-hidden />
      {t('maintenance.onTaskList')}
    </span>
  )
}

function ReminderTable({
  rows,
  lookups,
  actions
}: {
  rows: ReminderRow[]
  lookups: TaskLookups
  actions: Actions
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const ruleText = useRuleText()
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('maintenance.col.title')}</TableHead>
          <TableHead className="w-36">{t('maintenance.col.every')}</TableHead>
          <TableHead className="w-28">{t('maintenance.col.last')}</TableHead>
          <TableHead className="min-w-44">{t('maintenance.col.next')}</TableHead>
          <TableHead className="w-36">{t('maintenance.col.who')}</TableHead>
          {actions ? <TableHead className="w-40" /> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow
            key={row.template.id}
            data-state-due={row.state}
            data-testid={`reminder-${row.template.id}`}
            className={cn(
              row.state === 'overdue' && 'bg-destructive/5',
              row.state === 'soon' && 'bg-warning/10'
            )}
          >
            <TableCell className="whitespace-normal">
              <span className="block font-medium">{templateTitle(f, row.template)}</span>
              <OnTaskList row={row} />
            </TableCell>
            <TableCell className="whitespace-normal">{ruleText(row.template.recurrence)}</TableCell>
            <TableCell className="tabular-nums">
              {row.template.lastDoneAt
                ? f.date(datePart(row.template.lastDoneAt.slice(0, 16) as LocalDateTime))
                : '—'}
            </TableCell>
            <TableCell className="min-w-44 whitespace-normal">
              <span className="grid justify-items-start gap-1">
                <NextDate row={row} />
                <DueBadge row={row} />
              </span>
            </TableCell>
            <TableCell className="text-sm whitespace-normal">
              <WhoText row={row} lookups={lookups} />
            </TableCell>
            {actions ? (
              <TableCell className="text-end">
                <RowActions row={row} {...actions} />
              </TableCell>
            ) : null}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function ReminderCards({
  rows,
  lookups,
  actions
}: {
  rows: ReminderRow[]
  lookups: TaskLookups
  actions: Actions
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const ruleText = useRuleText()
  return (
    <ul className="grid gap-2">
      {rows.map((row) => (
        <li
          key={row.template.id}
          data-testid={`reminder-${row.template.id}`}
          className={cn(
            'grid gap-2 rounded-xl border p-3',
            row.state === 'overdue' && 'border-destructive/60 bg-destructive/5',
            row.state === 'soon' && 'border-warning bg-warning/10'
          )}
        >
          <div className="grid gap-0.5">
            <div className="flex items-start gap-2">
              <p className="min-w-0 flex-1 text-sm font-medium">{templateTitle(f, row.template)}</p>
              <DueBadge row={row} />
            </div>
            <p className="text-muted-foreground text-xs">
              {[
                ruleText(row.template.recurrence),
                row.template.lastDoneAt
                  ? t('maintenance.lastDone', {
                      date: f.dayMonth(datePart(row.template.lastDoneAt.slice(0, 16) as LocalDateTime))
                    })
                  : null
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
            <OnTaskList row={row} />
          </div>
          <p className="text-sm">
            <span className="text-muted-foreground">{t('maintenance.col.next')}: </span>
            <span className="font-medium">
              <NextDate row={row} full />
            </span>
          </p>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground">
              {t('maintenance.col.who')}: <WhoText row={row} lookups={lookups} />
            </span>
            {actions ? <RowActions row={row} {...actions} /> : null}
          </div>
        </li>
      ))}
    </ul>
  )
}

function DeepCleanGrid({
  group,
  title,
  canStart,
  onDone
}: {
  group: StayCounterGroup
  /** The hotel's own every-N-stays task; null = the seeded deep clean. */
  title: string | null
  /** May close a room without a waiting task (task managers); others close only the task given to them. */
  canStart: boolean
  onDone?: (roomId: string, roomNumber: string) => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  return (
    <ul
      className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6"
      aria-label={title ?? t('maintenance.deepClean.title')}
    >
      {group.rooms.map((row) => {
        const due = row.count >= group.n || row.openTaskId !== null
        return (
          <li
            key={row.roomId}
            data-testid={`deep-clean-${row.roomNumber}`}
            className={cn(
              'grid min-w-0 gap-2 rounded-lg border p-2.5',
              due && 'border-warning bg-warning/10'
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold tabular-nums">{row.roomNumber}</span>
              <span
                className={cn('text-xs tabular-nums', due ? 'font-semibold' : 'text-muted-foreground')}
                aria-label={t('maintenance.deepClean.countLabel', { count: row.count, n: group.n })}
              >
                {row.count}/{group.n}
              </span>
            </div>
            <Progress
              value={Math.min(100, (row.count / group.n) * 100)}
              className={cn('h-1.5', due && '[&>[data-slot=progress-indicator]]:bg-warning')}
              aria-hidden
            />
            {due && onDone && (canStart || row.openTaskId !== null) ? (
              <Button
                size="sm"
                variant="outline"
                className="h-8 w-full min-w-0 gap-1 px-1.5 max-md:h-11 max-sm:[&_svg]:hidden"
                aria-label={
                  title
                    ? t('maintenance.stayCount.doItOne', { room: row.roomNumber, title })
                    : t('maintenance.deepClean.doItOne', { room: row.roomNumber })
                }
                onClick={() => onDone(row.roomId, row.roomNumber)}
              >
                {title ? <CheckIcon aria-hidden /> : <SparklesIcon aria-hidden />}
                {title ? t('maintenance.stayCount.doIt') : t('maintenance.deepClean.doIt')}
              </Button>
            ) : due ? (
              <span className="text-xs font-medium">{t('maintenance.deepClean.due')}</span>
            ) : (
              <span className="text-muted-foreground text-xs">
                {row.lastDoneAt
                  ? t('maintenance.deepClean.last', {
                      date: f.dayMonth(datePart(row.lastDoneAt.slice(0, 16) as LocalDateTime))
                    })
                  : t('maintenance.deepClean.never')}
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/** "Her N konaklamada" bounds the service accepts (same as Görevler → Yeni görev). */
const EVERY_N = fieldLimits(everyNStaysSchema)

/** "Her N konaklamada bir" (S-94, G-09): the hotel sets N on the card; the template's rule keeps it. */
function EveryNEditor({
  group,
  countDayUse,
  deepClean
}: {
  group: StayCounterGroup
  countDayUse: boolean
  deepClean: boolean
}) {
  const { t } = useTranslation()
  const errorText = useErrorText()
  const id = useId()
  const [value, setValue] = useState(String(group.n))
  const rangeText = useRangeText()
  const save = useApiMutation('tasks.editTemplate', { invalidates: TASK_QUERIES })
  const n = Number(value)
  const valid = numberInLimits(value, EVERY_N)
  const changed = valid && n !== group.n
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      data-testid="deep-clean-n"
      onSubmit={(e) => {
        e.preventDefault()
        if (!changed || save.isPending) return
        save.mutate(
          { id: group.templateId, patch: { recurrence: { kind: 'everyNStays', n, countDayUse } } },
          {
            onSuccess: () =>
              void toast.success(
                deepClean
                  ? t('maintenance.deepClean.nSaved', { count: n })
                  : t('maintenance.stayCount.nSaved', { count: n })
              ),
            onError: (error) => void toast.error(errorText(error))
          }
        )
      }}
    >
      <div className="grid gap-1">
        <Label htmlFor={id} className="text-xs">
          {t('maintenance.deepClean.nLabel')}
        </Label>
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          dir="ltr"
          min={EVERY_N.min}
          max={EVERY_N.max}
          className="w-20"
          value={value}
          aria-invalid={!valid || undefined}
          aria-describedby={valid ? undefined : `${id}-error`}
          onChange={(e) => setValue(e.target.value)}
        />
      </div>
      <Button
        type="submit"
        size="sm"
        variant="outline"
        className="max-md:min-h-11"
        disabled={!changed || save.isPending}
      >
        {t('common.save')}
      </Button>
      <div className="basis-full">
        <FieldError id={`${id}-error`} message={!valid && rangeText(EVERY_N)} />
      </div>
    </form>
  )
}

function Suggestions({
  items,
  onAdd,
  busy
}: {
  items: TemplateDetail[]
  onAdd: (t: TemplateDetail) => void
  busy: boolean
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const ruleText = useRuleText()
  return (
    <SectionCard
      title={t('maintenance.suggested.title')}
      icon={LightbulbIcon}
      count={items.length}
      testId="maintenance-suggestions"
    >
      <p className="text-muted-foreground mb-3 text-xs">{t('maintenance.suggested.body')}</p>
      {items.length ? (
        <ul className="grid gap-2 sm:grid-cols-2">
          {items.map((s) => {
            const title = templateTitle(f, s)
            return (
              <li key={s.id} className="flex items-center gap-2 rounded-lg border py-2 ps-3 pe-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{title}</p>
                  <p className="text-muted-foreground text-xs">{ruleText(s.recurrence)}</p>
                </div>
                <Button
                  size="icon-sm"
                  variant="outline"
                  className="max-md:size-11"
                  disabled={busy}
                  aria-label={t('maintenance.suggested.addOne', { title })}
                  onClick={() => onAdd(s)}
                >
                  <PlusIcon />
                </Button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">{t('maintenance.suggested.none')}</p>
      )}
    </SectionCard>
  )
}

function MaintenanceView({
  templates,
  counters,
  lookups,
  today
}: {
  templates: TemplateDetail[]
  counters: StayCounterGroup[]
  lookups: TaskLookups
  today: LocalDate
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const isMobile = useIsMobile()
  const can = useCan()
  const errorText = useErrorText()
  const [done, setDone] = useState<DoneTarget | null>(null)
  const [dialog, setDialog] = useState<ReminderMode | null>(null)
  const toggle = useApiMutation('tasks.setTemplateActive', { invalidates: TASK_QUERIES })
  const edit = can('tasks', 'edit')
  const manage = edit && lookups.canManage
  // Every-N-stays rules have their own card; the rest of the maintenance templates are reminders.
  const active = templates.filter((x) => x.active && x.recurrence['kind'] !== 'everyNStays')
  const suggested = templates.filter((x) => !x.active && x.suggested)
  const rows = reminderRows(active, today)
  const late = rows.filter((r) => r.state === 'overdue').length
  const soon = rows.filter((r) => r.state === 'soon').length
  // The seeded deep clean has its own card; the hotel's own "every N stays" tasks show under their titles.
  const deepClean = counters.filter((g) => g.code === DEEP_CLEAN_TEMPLATE_CODE)
  const ownCounters = counters.filter((g) => g.code !== DEEP_CLEAN_TEMPLATE_CODE)
  const dueOf = (groups: StayCounterGroup[]) =>
    groups.flatMap((g) => g.rooms.filter((r) => r.count >= g.n || r.openTaskId !== null))
  const dueRooms = dueOf(deepClean)
  const ownDue = dueOf(ownCounters)
  const counterBlock = (group: StayCounterGroup, title: string | null) => (
    <div key={group.templateId} className="grid gap-3" data-testid={`stay-counter-${group.templateId}`}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="grid min-w-60 flex-1 gap-0.5">
          {title ? <p className="text-sm font-medium">{title}</p> : null}
          <p className="text-muted-foreground text-sm">
            {title
              ? t('maintenance.stayCount.explain', { count: group.n })
              : t('maintenance.deepClean.explain', { count: group.n })}
          </p>
        </div>
        {manage ? (
          <EveryNEditor
            group={group}
            deepClean={!title}
            countDayUse={
              templates.find((x) => x.id === group.templateId)?.recurrence['countDayUse'] !== false
            }
          />
        ) : null}
      </div>
      <DeepCleanGrid
        group={group}
        title={title}
        canStart={manage}
        onDone={
          edit
            ? (roomId, roomNumber) =>
                setDone({
                  kind: 'room',
                  templateId: group.templateId,
                  roomId,
                  roomNumber,
                  n: group.n,
                  title
                })
            : undefined
        }
      />
    </div>
  )
  const actions: Actions = manage
    ? {
        onDone: (row) => setDone({ kind: 'reminder', row }),
        onEdit: (row) => setDialog({ kind: 'edit', template: row.template }),
        onOff: (row) =>
          toggle.mutate(
            { id: row.template.id, active: false },
            {
              onSuccess: () => toast.success(t('maintenance.turnedOff')),
              onError: (error) => void toast.error(errorText(error))
            }
          )
      }
    : null
  const addSuggestion = (s: TemplateDetail): void => {
    // An interval reminder asks for its first date; a weekly round starts at its next weekday.
    if (s.recurrence['kind'] === 'interval') {
      setDialog({ kind: 'activate', template: s })
      return
    }
    toggle.mutate(
      { id: s.id, active: true },
      {
        onSuccess: () => toast.success(t('maintenance.suggested.added', { title: templateTitle(f, s) })),
        onError: (error) => void toast.error(errorText(error))
      }
    )
  }

  return (
    <div className="grid gap-4">
      <Alert className="border-info/50">
        <ClipboardListIcon aria-hidden />
        <AlertDescription className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <span className="text-foreground">{t('maintenance.toTasks')}</span>
          <Button asChild variant="ghost" size="sm" className="-my-1">
            <Link to="/tasks">
              {t('maintenance.openTasks')}
              <ArrowRightIcon className="rtl:rotate-180" aria-hidden />
            </Link>
          </Button>
        </AlertDescription>
      </Alert>

      {late || soon || dueRooms.length ? (
        <p className="flex flex-wrap items-center gap-2 text-sm" data-testid="maintenance-summary">
          <AlertTriangleIcon className="text-warning size-4" aria-hidden />
          {late ? (
            <Badge variant="destructive">{t('maintenance.summary.late', { count: late })}</Badge>
          ) : null}
          {soon ? (
            <Badge variant="outline" className="border-warning">
              {t('maintenance.summary.soon', { count: soon })}
            </Badge>
          ) : null}
          {dueRooms.length ? (
            <Badge variant="outline" className="border-warning">
              {t('maintenance.summary.deepClean', { count: dueRooms.length })}
            </Badge>
          ) : null}
        </p>
      ) : null}

      <SectionCard
        title={t('maintenance.periodic')}
        icon={CalendarClockIcon}
        count={rows.length}
        testId="maintenance-reminders"
      >
        {rows.length ? (
          isMobile ? (
            <ReminderCards rows={rows} lookups={lookups} actions={actions} />
          ) : (
            <ReminderTable rows={rows} lookups={lookups} actions={actions} />
          )
        ) : (
          <p className="text-muted-foreground text-sm">{t('maintenance.noReminders')}</p>
        )}
      </SectionCard>

      <SectionCard
        title={t('maintenance.deepClean.title')}
        icon={SparklesIcon}
        count={dueRooms.length}
        tone="warn"
        testId="maintenance-deep-clean"
      >
        {deepClean.length ? (
          <div className="grid gap-4">{deepClean.map((group) => counterBlock(group, null))}</div>
        ) : (
          <p className="text-muted-foreground text-sm">{t('maintenance.deepClean.off')}</p>
        )}
      </SectionCard>

      {ownCounters.length ? (
        <SectionCard
          title={t('maintenance.stayCount.title')}
          icon={BedDoubleIcon}
          count={ownDue.length}
          tone="warn"
          testId="maintenance-stay-counters"
        >
          <div className="grid gap-4">
            {ownCounters.map((group) => counterBlock(group, templateTitle(f, group)))}
          </div>
        </SectionCard>
      ) : null}

      {manage ? <Suggestions items={suggested} onAdd={addSuggestion} busy={toggle.isPending} /> : null}

      {done ? <DoneDialog key={JSON.stringify(done)} target={done} onClose={() => setDone(null)} /> : null}
      {dialog ? <ReminderDialog mode={dialog} lookups={lookups} onClose={() => setDialog(null)} /> : null}
    </div>
  )
}

function MaintenanceSkeleton() {
  const { t } = useTranslation()
  return (
    <div role="status" aria-busy className="grid gap-4">
      <span className="sr-only">{t('common.loading')}</span>
      <Skeleton className="h-12" aria-hidden />
      <Skeleton className="h-72" aria-hidden />
      <Skeleton className="h-56" aria-hidden />
    </div>
  )
}

export function MaintenancePage() {
  const { t } = useTranslation()
  const can = useCan()
  const today = todayOf()
  const lookups = useTaskLookups()
  const templates = useApiQuery('tasks.templates', { kind: ['maintenance'], includeInactive: true })
  const counters = useApiQuery('tasks.stayCounters', {})
  const query = combine([templates, counters, lookups] as const)
  const [adding, setAdding] = useState(false)
  const manage = can('tasks', 'edit') && (lookups.data?.canManage ?? false)
  // The main action is a worded button in the header; on the phone it sits under the title, full width.
  const add = manage ? (
    <Button onClick={() => setAdding(true)} disabled={!lookups.data} data-testid="reminder-add">
      <PlusIcon aria-hidden />
      {t('maintenance.add.title')}
    </Button>
  ) : undefined
  return (
    <Page title={t('nav.maintenance')} description={t('maintenance.description')} actions={add}>
      <QueryView
        query={query}
        loading={<MaintenanceSkeleton />}
        isEmpty={([list, groups]) => list.length === 0 && groups.length === 0}
        empty={{
          icon: CalendarClockIcon,
          title: t('maintenance.emptyTitle'),
          body: t('maintenance.emptyBody')
        }}
      >
        {([list, groups, info]) => (
          <MaintenanceView templates={list} counters={groups} lookups={info} today={today} />
        )}
      </QueryView>
      {adding && lookups.data ? (
        <ReminderDialog mode={{ kind: 'new' }} lookups={lookups.data} onClose={() => setAdding(false)} />
      ) : null}
    </Page>
  )
}
