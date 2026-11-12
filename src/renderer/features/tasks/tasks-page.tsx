// Görevler (G-94, G-91, G-93): today's, late, coming and done tasks — the late ones loud, one tap completes a task
// (who and when are recorded). Filters by person, role, shift and room. Maintenance and "every N stays" tasks
// fall in from their templates; the suggested starter tasks and the legal reminders are switched on or off here.
// The hotel's computer writes the coming week's tasks and the notices (main/notifications). Phone list too (G-143).
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { LightbulbIcon, ListChecksIcon, PlusIcon, ScaleIcon, XIcon } from 'lucide-react'
import { addDays, type LocalDate } from '@shared/date'
import { datePart, localDateTimeOf, timePart, type LocalDateTime } from '@shared/domain/local-datetime'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Page } from '@/components/page'
import { QueryView } from '@/components/query-view'
import { SectionCard } from '@/components/section-card'
import { EmptyState } from '@/components/states'
import { useFormat } from '@/hooks/use-format'
import { useApiMutation, useApiQuery, useSettings } from '@/lib/api/hooks'
import { useCan } from '@/lib/view-as'
import { cn } from '@/lib/utils'
import { CancelTaskDialog } from './cancel-task-dialog'
import { NewTaskDialog } from './new-task-dialog'
import { useRuleText } from './rule-text'
import {
  combine,
  nameOf,
  shiftName,
  TASK_QUERIES,
  templateTitle,
  useErrorText,
  useTaskLookups,
  type TaskItem,
  type TaskLookups,
  type TemplateDetail
} from './task-data'
import { TaskRow } from './task-row'
import { ALL, TASK_VIEWS, countOf, matchesFilter, taskOverdue, tasksOf, type TaskView } from './task-views'

/** The "Yapıldı" view reads this many days back. */
const DONE_DAYS = 30

function TemplateSwitchList({
  items,
  canManage,
  now,
  testId
}: {
  items: TemplateDetail[]
  canManage: boolean
  now: LocalDateTime
  testId: string
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const ruleText = useRuleText()
  const errorText = useErrorText()
  const toggle = useApiMutation('tasks.setTemplateActive', { invalidates: TASK_QUERIES })
  return (
    <ul className="grid gap-2" data-testid={testId}>
      {items.map((tpl) => {
        const next = tpl.active && tpl.nextDueAt ? (tpl.nextDueAt as LocalDateTime) : null
        const title = templateTitle(f, tpl)
        return (
          <li key={tpl.id}>
            <Label
              className={cn(
                'hover:bg-accent/50 flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 font-normal',
                !tpl.active && 'text-muted-foreground'
              )}
            >
              <Switch
                checked={tpl.active}
                disabled={!canManage || toggle.isPending}
                aria-label={title}
                onCheckedChange={(active) =>
                  toggle.mutate(
                    { id: tpl.id, active },
                    {
                      onSuccess: () =>
                        toast.success(t(active ? 'tasks.legal.switchedOn' : 'tasks.legal.switchedOff')),
                      onError: (error) => void toast.error(errorText(error))
                    }
                  )
                }
                className="mt-0.5"
              />
              <span className="grid min-w-0 gap-0.5">
                <span className="text-sm leading-snug font-medium">{title}</span>
                <span className="text-muted-foreground text-xs leading-snug">{ruleText(tpl.recurrence)}</span>
                {next ? (
                  <span className={cn('text-xs leading-snug', next < now && 'text-destructive font-medium')}>
                    {t('tasks.legal.next', { date: f.dayMonth(datePart(next)), time: timePart(next) })}
                  </span>
                ) : null}
              </span>
            </Label>
          </li>
        )
      })}
    </ul>
  )
}

function LegalCard({ canManage, now }: { canManage: boolean; now: LocalDateTime }) {
  const { t } = useTranslation()
  const query = useApiQuery('tasks.templates', { kind: ['legal'], includeInactive: true })
  return (
    <SectionCard title={t('tasks.legal.title')} icon={ScaleIcon} testId="task-legal">
      <p className="text-muted-foreground mb-3 text-xs">{t('tasks.legal.body')}</p>
      <QueryView
        query={query}
        loading={<Skeleton className="h-24" />}
        isEmpty={(list) => list.length === 0}
        empty={{ icon: ScaleIcon, title: t('tasks.legal.noneTitle'), body: t('tasks.legal.noneBody') }}
      >
        {(list) => <TemplateSwitchList items={list} canManage={canManage} now={now} testId="legal-list" />}
      </QueryView>
    </SectionCard>
  )
}

function SuggestionsCard({ className }: { className?: string }) {
  const { t } = useTranslation()
  const f = useFormat()
  const ruleText = useRuleText()
  const errorText = useErrorText()
  const query = useApiQuery('tasks.templates', { kind: ['general'], includeInactive: true })
  const add = useApiMutation('tasks.setTemplateActive', { invalidates: TASK_QUERIES })
  const dismiss = useApiMutation('tasks.dismissSuggestion', { invalidates: TASK_QUERIES })
  const busy = add.isPending || dismiss.isPending
  const failed = (error: unknown): void => void toast.error(errorText(error))
  const items = (query.data ?? []).filter((s) => s.suggested && !s.active)
  return (
    <SectionCard
      title={t('tasks.suggest.title')}
      icon={LightbulbIcon}
      className={className}
      testId="task-suggestions"
    >
      <p className="text-muted-foreground mb-3 text-xs">{t('tasks.suggest.body')}</p>
      {query.isPending ? (
        <Skeleton className="h-32" />
      ) : items.length ? (
        <ul className="grid gap-2">
          {items.map((s) => {
            const title = templateTitle(f, s)
            return (
              <li key={s.id} className="flex items-start gap-1.5 rounded-lg border py-2 ps-3 pe-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{title}</p>
                  <p className="text-muted-foreground text-xs">{ruleText(s.recurrence)}</p>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon-sm"
                      variant="outline"
                      className="max-md:size-11"
                      disabled={busy}
                      onClick={() =>
                        add.mutate(
                          { id: s.id, active: true },
                          {
                            onSuccess: () => toast.success(t('tasks.suggest.added', { title })),
                            onError: failed
                          }
                        )
                      }
                      aria-label={t('tasks.suggest.addOne', { title })}
                    >
                      <PlusIcon />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('tasks.suggest.addHint')}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="max-md:size-11"
                      disabled={busy}
                      onClick={() => dismiss.mutate({ id: s.id }, { onError: failed })}
                      aria-label={t('tasks.suggest.dismiss', { title })}
                    >
                      <XIcon />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('tasks.suggest.dismissHint')}</TooltipContent>
                </Tooltip>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">{t('tasks.suggest.allHandled')}</p>
      )}
    </SectionCard>
  )
}

function Filters({
  lookups,
  who,
  room,
  onWho,
  onRoom
}: {
  lookups: TaskLookups
  who: string
  room: string
  onWho: (v: string) => void
  onRoom: (v: string) => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  return (
    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap" data-testid="task-filters">
      <Select value={who} onValueChange={onWho}>
        <SelectTrigger className="w-full sm:w-56" aria-label={t('tasks.filter.who')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t('tasks.filter.everyone')}</SelectItem>
          {lookups.userId ? <SelectItem value="me">{t('tasks.filter.mine')}</SelectItem> : null}
          <SelectGroup>
            <SelectLabel>{t('tasks.assignee.user')}</SelectLabel>
            {lookups.users
              .filter((u) => u.active)
              .map((u) => (
                <SelectItem key={u.id} value={`user:${u.id}`}>
                  {u.name}
                </SelectItem>
              ))}
          </SelectGroup>
          <SelectGroup>
            <SelectLabel>{t('tasks.assignee.role')}</SelectLabel>
            {lookups.roles.map((r) => (
              <SelectItem key={r.id} value={`role:${r.id}`}>
                {nameOf(f, r.nameI18n ? null : r.name, r.nameI18n)}
              </SelectItem>
            ))}
          </SelectGroup>
          {lookups.shifts.length ? (
            <SelectGroup>
              <SelectLabel>{t('tasks.assignee.shift')}</SelectLabel>
              {lookups.shifts.map((s) => (
                <SelectItem key={s.id} value={`shift:${s.id}`}>
                  {shiftName(f, s)}
                </SelectItem>
              ))}
            </SelectGroup>
          ) : null}
        </SelectContent>
      </Select>
      <Select value={room} onValueChange={onRoom}>
        <SelectTrigger className="w-full sm:w-40" aria-label={t('tasks.filter.room')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t('tasks.filter.allRooms')}</SelectItem>
          {lookups.rooms.map((r) => (
            <SelectItem key={r.id} value={r.id}>
              {t('tasks.roomNo', { room: r.number })}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function TaskList({
  tasks,
  lookups,
  now,
  canEdit,
  onCancel
}: {
  tasks: TaskItem[]
  lookups: TaskLookups
  now: LocalDateTime
  canEdit: boolean
  onCancel: (task: TaskItem) => void
}) {
  const { t } = useTranslation()
  const errorText = useErrorText()
  const [view, setView] = useState<TaskView>('today')
  const [who, setWho] = useState(ALL)
  const [room, setRoom] = useState(ALL)
  const done = useApiMutation('tasks.done', { invalidates: TASK_QUERIES })
  const undo = useApiMutation('tasks.undoDone', { invalidates: TASK_QUERIES })
  const busy = done.isPending || undo.isPending
  const today = datePart(now)
  const shown = tasks.filter((task) => matchesFilter(task, who, room, lookups.userId))
  const filtered = who !== ALL || room !== ALL
  const toggle = (task: TaskItem): void => {
    const failed = (error: unknown): void => void toast.error(errorText(error))
    if (task.status === 'done')
      undo.mutate({ id: task.id }, { onSuccess: () => toast.success(t('tasks.reopened')), onError: failed })
    else
      done.mutate({ id: task.id }, { onSuccess: () => toast.success(t('tasks.doneToast')), onError: failed })
  }
  return (
    <div className="grid min-w-0 gap-3">
      <Filters lookups={lookups} who={who} room={room} onWho={setWho} onRoom={setRoom} />
      <Tabs value={view} onValueChange={(v) => setView(v as TaskView)} className="min-w-0 gap-3">
        <TabsList
          aria-label={t('tasks.viewLabel')}
          className="grid w-full grid-cols-2 group-data-[orientation=horizontal]/tabs:h-auto max-md:group-data-[orientation=horizontal]/tabs:h-auto sm:flex sm:w-fit"
        >
          {TASK_VIEWS.map((v) => {
            const count = countOf(shown, v, now)
            return (
              <TabsTrigger
                key={v}
                value={v}
                className="min-h-8 max-md:min-h-11"
                data-testid={`task-tab-${v}`}
              >
                {t(`tasks.view.${v}`)}
                <Badge
                  variant={v === 'overdue' && count > 0 ? 'destructive' : 'secondary'}
                  className="tabular-nums"
                >
                  {count}
                </Badge>
              </TabsTrigger>
            )
          })}
        </TabsList>
        {TASK_VIEWS.map((v) => {
          const list = tasksOf(shown, v, now)
          return (
            <TabsContent key={v} value={v}>
              {list.length ? (
                <ul className="grid gap-2" aria-label={t(`tasks.view.${v}`)}>
                  {list.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      today={today as LocalDate}
                      overdue={taskOverdue(task, now)}
                      lookups={lookups}
                      canEdit={canEdit}
                      busy={busy}
                      onToggle={toggle}
                      onCancel={onCancel}
                    />
                  ))}
                </ul>
              ) : filtered && tasks.length ? (
                <EmptyState
                  compact
                  icon={ListChecksIcon}
                  title={t('common.noMatchTitle')}
                  body={t('common.noMatchBody')}
                  action={
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setWho(ALL)
                        setRoom(ALL)
                      }}
                    >
                      {t('common.clearFilter')}
                    </Button>
                  }
                />
              ) : (
                <div className="text-muted-foreground flex flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-10 text-center text-sm">
                  <ListChecksIcon className="size-5" aria-hidden />
                  {tasks.length ? t(`tasks.empty.${v}`) : t('tasks.empty.all')}
                </div>
              )}
            </TabsContent>
          )
        })}
      </Tabs>
    </div>
  )
}

function TasksSkeleton() {
  const { t } = useTranslation()
  return (
    <div role="status" aria-busy className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <span className="sr-only">{t('common.loading')}</span>
      <div className="grid gap-3" aria-hidden>
        <Skeleton className="h-9 w-full max-w-md" />
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
      <div className="grid gap-4" aria-hidden>
        <Skeleton className="h-56" />
        <Skeleton className="h-48" />
      </div>
    </div>
  )
}

export function TasksPage() {
  const { t } = useTranslation()
  const can = useCan()
  const settings = useSettings()
  const now = localDateTimeOf(new Date())
  const today = datePart(now)
  const lookups = useTaskLookups()
  const open = useApiQuery('tasks.list', { status: ['open'] })
  const done = useApiQuery('tasks.list', { status: ['done'], doneFrom: addDays(today, -DONE_DAYS) })
  const query = combine([lookups, open, done] as const)
  const [creating, setCreating] = useState(0)
  const [cancelling, setCancelling] = useState<TaskItem | null>(null)
  const canEdit = can('tasks', 'edit')
  const canManage = lookups.data?.canManage ?? false
  return (
    <Page
      title={t('nav.tasks')}
      description={t('tasks.description')}
      actions={
        canEdit ? (
          <Button onClick={() => setCreating(creating + 1)} disabled={!lookups.data} data-testid="task-new">
            <PlusIcon aria-hidden />
            {t('tasks.new')}
          </Button>
        ) : undefined
      }
    >
      <QueryView query={query} loading={<TasksSkeleton />}>
        {([info, openList, doneList]) => (
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="grid min-w-0 gap-4">
              <TaskList
                tasks={[...openList, ...doneList]}
                lookups={info}
                now={now}
                canEdit={canEdit}
                onCancel={setCancelling}
              />
              <LegalCard canManage={canManage} now={now} />
            </div>
            {canManage ? <SuggestionsCard className="lg:sticky lg:top-4" /> : null}
          </div>
        )}
      </QueryView>
      {lookups.data && creating ? (
        <NewTaskDialog
          key={creating}
          lookups={lookups.data}
          everyN={settings.data?.['tasks.everyNStays'] ?? 10}
          onOpenChange={(o) => (o ? null : setCreating(0))}
        />
      ) : null}
      {cancelling ? <CancelTaskDialog task={cancelling} onClose={() => setCancelling(null)} /> : null}
    </Page>
  )
}
