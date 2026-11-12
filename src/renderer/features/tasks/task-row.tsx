// One task of the list (G-94): a checkbox that completes it in one tap (44 px on the phone; who and when are
// recorded by the service), the title, who it is for (person / role / shift), the room, the due time, the repeat
// rule and, once done, who did it and when. The menu cancels it with a reason; the ministry statistics reminder
// opens the Turizm istatistiği screen (G-93).
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import {
  BarChart3Icon,
  BanIcon,
  CheckCheckIcon,
  ClockIcon,
  DoorClosedIcon,
  EllipsisIcon,
  RepeatIcon,
  ScaleIcon,
  SparklesIcon,
  UserRoundIcon,
  UsersRoundIcon,
  WrenchIcon
} from 'lucide-react'
import { diffDays, type LocalDate } from '@shared/date'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useFormat } from '@/hooks/use-format'
import { cn } from '@/lib/utils'
import { useRuleText } from './rule-text'
import { assigneeText, taskTitle, type TaskItem, type TaskLookups } from './task-data'
import { dayOf, TOURISM_TEMPLATE } from './task-views'

const ASSIGNEE_ICON = {
  user: UserRoundIcon,
  role: UsersRoundIcon,
  shift: ClockIcon,
  none: UsersRoundIcon
} as const

export function TaskRow({
  task,
  today,
  overdue,
  lookups,
  canEdit,
  busy,
  onToggle,
  onCancel
}: {
  task: TaskItem
  today: LocalDate
  overdue: boolean
  lookups: TaskLookups | undefined
  /** The user may tick and cancel tasks (Görevler edit). */
  canEdit: boolean
  busy: boolean
  onToggle: (task: TaskItem) => void
  onCancel: (task: TaskItem) => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const ruleText = useRuleText()
  const done = task.status === 'done'
  const title = taskTitle(f, task)
  const dueDay = task.dueAt ? (task.dueAt.slice(0, 10) as LocalDate) : null
  const rel = dueDay ? diffDays(today, dueDay) : null
  const dueTime = task.dueAt ? task.dueAt.slice(11, 16) : ''
  const due =
    dueDay !== null
      ? rel === 0
        ? t('tasks.due.today', { time: dueTime })
        : rel === 1
          ? t('tasks.due.tomorrow', { time: dueTime })
          : rel === -1
            ? t('tasks.due.yesterday', { time: dueTime })
            : t('tasks.due.on', { date: f.dayMonth(dueDay), time: dueTime })
      : null
  const who = assigneeText(f, lookups, task)
  const AssigneeIcon = ASSIGNEE_ICON[who.kind]
  const repeat = task.recurrence ? ruleText(task.recurrence) : ''
  const id = `task-${task.id}`
  const tourism = task.templateCode === TOURISM_TEMPLATE
  const canCancel = canEdit && task.status === 'open'
  return (
    <li
      className={cn(
        'bg-card flex items-start gap-3 rounded-lg border px-3 py-2.5 max-md:min-h-16 max-md:py-3',
        overdue && 'border-destructive/50 bg-destructive/5'
      )}
      data-testid={id}
      data-status={task.status}
    >
      {/* Phone: the label around the box is the 44 px target. */}
      <label
        htmlFor={id}
        className="grid shrink-0 place-items-center max-md:-my-1.5 max-md:-ms-3 max-md:-me-1 max-md:size-11 md:contents"
      >
        <Checkbox
          id={id}
          checked={done}
          disabled={!canEdit || busy || task.status === 'cancelled'}
          onCheckedChange={() => onToggle(task)}
          aria-label={t(done ? 'tasks.reopen' : 'tasks.complete', { title })}
          className="max-md:size-6 md:mt-0.5"
        />
      </label>
      <div className="grid min-w-0 flex-1 gap-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <label
            htmlFor={id}
            className={cn(
              'text-sm font-medium break-words max-md:text-base',
              done && 'text-muted-foreground'
            )}
          >
            {title}
          </label>
          {task.kind === 'legal' ? (
            <Badge variant="outline" className="gap-1">
              <ScaleIcon aria-hidden />
              {t('tasks.kind.legal')}
            </Badge>
          ) : null}
          {task.kind === 'maintenance' ? (
            <Badge variant="outline" className="gap-1">
              <WrenchIcon aria-hidden />
              {t('tasks.kind.maintenance')}
            </Badge>
          ) : null}
          {task.templateId && task.createdBy === null ? (
            <Badge variant="secondary" className="gap-1">
              <SparklesIcon aria-hidden />
              {t('tasks.auto')}
            </Badge>
          ) : null}
        </p>
        {task.description ? (
          <p className="text-muted-foreground line-clamp-2 text-xs break-words">{task.description}</p>
        ) : null}
        <p className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className="inline-flex items-center gap-1">
            <AssigneeIcon className="size-3.5 shrink-0" aria-label={t(`tasks.assignee.${who.kind}`)} />
            {who.name ?? t('tasks.assignee.everyone')}
          </span>
          {task.roomNumber ? (
            <span className="inline-flex items-center gap-1">
              <DoorClosedIcon className="size-3.5 shrink-0" aria-hidden />
              {t('tasks.roomNo', { room: task.roomNumber })}
            </span>
          ) : null}
          {repeat ? (
            <span className="inline-flex items-center gap-1">
              <RepeatIcon className="size-3.5 shrink-0" aria-hidden />
              {repeat}
            </span>
          ) : null}
          {done && task.doneAt ? (
            <span className="text-success inline-flex items-center gap-1 font-medium">
              <CheckCheckIcon className="size-3.5 shrink-0" aria-hidden />
              {t('tasks.doneBy', {
                name: task.doneByName ?? '—',
                time:
                  dayOf(task.doneAt) === today
                    ? f.time(task.doneAt)
                    : `${f.dayMonth(dayOf(task.doneAt))} ${f.time(task.doneAt)}`
              })}
            </span>
          ) : null}
          {tourism && !done ? (
            <Link
              to="/tourism"
              className="text-primary inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline max-md:min-h-11"
            >
              <BarChart3Icon className="size-3.5 shrink-0" aria-hidden />
              {t('tasks.openTourism')}
            </Link>
          ) : null}
        </p>
      </div>
      <div className="grid shrink-0 justify-items-end gap-1 text-end">
        {due ? (
          <span
            className={cn(
              'text-xs whitespace-nowrap tabular-nums',
              overdue ? 'text-destructive font-semibold' : 'text-muted-foreground'
            )}
          >
            {due}
          </span>
        ) : (
          <span className="text-muted-foreground text-xs">{t('tasks.due.none')}</span>
        )}
        {overdue ? <Badge variant="destructive">{t('tasks.overdue')}</Badge> : null}
      </div>
      {canCancel ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon-sm"
              variant="ghost"
              className="-my-1 -me-1 shrink-0 max-md:size-11"
              aria-label={t('tasks.more', { title })}
              data-testid={`${id}-menu`}
            >
              <EllipsisIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onCancel(task)} className="text-destructive">
              <BanIcon aria-hidden />
              {t('tasks.cancel.action')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </li>
  )
}
