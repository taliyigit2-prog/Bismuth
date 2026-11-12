// Arızalar (G-180, akislar.md "Gün içinde": housekeeping reports a problem with a photo). Open, planned and
// resolved issues of rooms and general areas; urgent ones first; an issue open 7 days or more is red; "closes the
// room" flag; detail sheet to plan and resolve. Phone (G-143, S-66 "arıza listesi, arıza açma"): cards and the
// "report" button at the top.
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  BanIcon,
  CalendarClockIcon,
  CheckCircle2Icon,
  ImageIcon,
  PlusIcon,
  SirenIcon,
  WrenchIcon
} from 'lucide-react'
import { addDays, today as todayOf, type LocalDate } from '@shared/date'
import { isIssueStale, issueAgeDays } from '@shared/domain/housekeeping'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { KpiCard } from '@/components/kpi-card'
import { Page } from '@/components/page'
import { QueryView } from '@/components/query-view'
import { useFormat } from '@/hooks/use-format'
import { useIsMobile } from '@/hooks/use-mobile'
import { useApiQuery } from '@/lib/api/hooks'
import { useCan } from '@/lib/view-as'
import { cn } from '@/lib/utils'
import { IssueDialog } from './issue-dialog'
import { IssueSheet } from './issue-sheet'
import { PlaceTile, SeverityBadge } from './issue-parts'
import { bySeverity, dayOf, STATUSES, usePlace, useWhen, type Issue, type IssueStatus } from './issue-utils'

const FILTERS = ['all', ...STATUSES] as const
type Filter = (typeof FILTERS)[number]

/** Plan day (and who), resolution day, or how long it has waited — the "next step" column. */
function StepText({ issue, today }: { issue: Issue; today: LocalDate }) {
  const { t } = useTranslation()
  const f = useFormat()
  if (issue.status === 'planned' && issue.plannedDate)
    return (
      <span className={cn('text-info', issue.plannedDate < today && 'text-destructive')}>
        {t('issues.planned', { date: f.dayMonth(issue.plannedDate) })}
        {issue.assignedTo ? (
          <span className="text-muted-foreground block text-xs">{issue.assignedTo}</span>
        ) : null}
      </span>
    )
  if (issue.status === 'resolved' && issue.resolvedAt)
    return (
      <span className="text-success">
        {t('issues.resolved', { date: f.dayMonth(dayOf(issue.resolvedAt)) })}
      </span>
    )
  return <span className="text-muted-foreground">{t('issues.waiting')}</span>
}

/** "7 gündür açık" in red once an open issue is a week old (G-180). */
function AgeBadge({ issue, today }: { issue: Issue; today: LocalDate }) {
  const { t } = useTranslation()
  if (!isIssueStale(issue, today)) return null
  return (
    <Badge variant="destructive" data-testid="issue-stale">
      {t('issues.age', { count: issueAgeDays(issue.reportedAt, today) })}
    </Badge>
  )
}

function PhotoCount({ count }: { count: number }) {
  const { t } = useTranslation()
  if (!count) return <span className="text-muted-foreground">—</span>
  return (
    <span
      className="inline-flex items-center gap-1 tabular-nums"
      aria-label={t('issues.photosCount', { count })}
    >
      <ImageIcon className="text-muted-foreground size-4" aria-hidden />
      {count}
    </span>
  )
}

function BlocksBadge() {
  const { t } = useTranslation()
  return (
    <Badge variant="outline" className="border-destructive text-destructive">
      <BanIcon aria-hidden />
      {t('issues.blocksShort')}
    </Badge>
  )
}

function IssueTable({
  issues,
  today,
  onOpen
}: {
  issues: Issue[]
  today: LocalDate
  onOpen: (issue: Issue) => void
}) {
  const { t } = useTranslation()
  const when = useWhen(today)
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-16">{t('issues.col.place')}</TableHead>
          <TableHead>{t('issues.col.issue')}</TableHead>
          <TableHead className="w-24">{t('issues.severityLabel')}</TableHead>
          <TableHead className="w-44">{t('issues.col.reported')}</TableHead>
          <TableHead className="w-32">{t('issues.col.step')}</TableHead>
          <TableHead className="w-14 text-end">
            <ImageIcon className="ms-auto size-4" aria-label={t('issues.photos')} />
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {issues.map((issue) => (
          <TableRow
            key={issue.id}
            className="cursor-pointer"
            onClick={() => onOpen(issue)}
            data-testid={`issue-row-${issue.id}`}
          >
            <TableCell>
              <PlaceTile issue={issue} />
            </TableCell>
            <TableCell className="max-w-0 whitespace-normal">
              <button
                type="button"
                className="focus-visible:ring-ring block w-full rounded-sm text-start font-medium outline-none focus-visible:ring-[3px]"
                onClick={(e) => {
                  e.stopPropagation()
                  onOpen(issue)
                }}
              >
                {issue.title}
              </button>
              <span className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                {!issue.roomNumber && issue.area ? <span className="font-medium">{issue.area}</span> : null}
                {issue.description ? <span className="line-clamp-1">{issue.description}</span> : null}
                {issue.blocksRoom && issue.status !== 'resolved' ? <BlocksBadge /> : null}
              </span>
            </TableCell>
            <TableCell>
              <SeverityBadge severity={issue.severity} />
            </TableCell>
            <TableCell className="whitespace-normal">
              <span className="block text-sm">{issue.reportedByName ?? '—'}</span>
              <span className="text-muted-foreground block text-xs">{when(issue.reportedAt)}</span>
              <AgeBadge issue={issue} today={today} />
            </TableCell>
            <TableCell className="text-sm whitespace-normal">
              <StepText issue={issue} today={today} />
            </TableCell>
            <TableCell className="text-end">
              <PhotoCount count={issue.photos} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function IssueCards({
  issues,
  today,
  onOpen
}: {
  issues: Issue[]
  today: LocalDate
  onOpen: (issue: Issue) => void
}) {
  const when = useWhen(today)
  const place = usePlace()
  return (
    <ul className="grid gap-2">
      {issues.map((issue) => (
        <li key={issue.id}>
          <button
            type="button"
            onClick={() => onOpen(issue)}
            data-testid={`issue-card-${issue.id}`}
            className={cn(
              'bg-card focus-visible:ring-ring grid min-h-14 w-full gap-2 rounded-xl border p-3 text-start outline-none focus-visible:ring-[3px]',
              issue.severity === 'urgent' && issue.status !== 'resolved' && 'border-destructive/60'
            )}
          >
            <span className="flex items-start gap-3">
              <PlaceTile issue={issue} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium break-words">{issue.title}</span>
                <span className="text-muted-foreground block text-xs">
                  {[issue.roomNumber ? null : place(issue), issue.reportedByName, when(issue.reportedAt)]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
              <SeverityBadge severity={issue.severity} />
            </span>
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1 ps-14 text-xs">
              <StepText issue={issue} today={today} />
              <AgeBadge issue={issue} today={today} />
              {issue.photos ? <PhotoCount count={issue.photos} /> : null}
              {issue.blocksRoom && issue.status !== 'resolved' ? <BlocksBadge /> : null}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

function IssuesView({ issues, today }: { issues: Issue[]; today: LocalDate }) {
  const { t } = useTranslation()
  const f = useFormat()
  const isMobile = useIsMobile()
  const [filter, setFilter] = useState<Filter>('all')
  const [openId, setOpenId] = useState<string | null>(null)
  const sorted = useMemo(() => [...issues].sort(bySeverity), [issues])
  const byStatus = (s: IssueStatus): Issue[] => sorted.filter((i) => i.status === s)
  const active = issues.filter((i) => i.status !== 'resolved')
  const weekAgo = addDays(today, -7)
  const resolvedWeek = issues.filter((i) => i.resolvedAt && dayOf(i.resolvedAt) > weekAgo).length
  const groups = (filter === 'all' ? STATUSES : [filter]).map((s) => ({ status: s, issues: byStatus(s) }))
  const List = isMobile ? IssueCards : IssueTable
  const opened = issues.find((i) => i.id === openId) ?? null

  return (
    <div className="grid gap-4">
      {!isMobile ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard
            label={t('issues.kpi.open')}
            value={f.number(active.length)}
            hint={t('issues.kpi.openHint', { count: active.filter((i) => i.status === 'planned').length })}
            icon={<WrenchIcon className="size-3.5" aria-hidden />}
          />
          <KpiCard
            label={t('issues.kpi.urgent')}
            value={f.number(active.filter((i) => i.severity === 'urgent').length)}
            hint={t('issues.kpi.urgentHint')}
            icon={<SirenIcon className="size-3.5" aria-hidden />}
          />
          <KpiCard
            label={t('issues.kpi.blocked')}
            value={f.number(active.filter((i) => i.blocksRoom && i.block).length)}
            hint={t('issues.kpi.blockedHint')}
            icon={<BanIcon className="size-3.5" aria-hidden />}
          />
          <KpiCard
            label={t('issues.kpi.resolved')}
            value={f.number(resolvedWeek)}
            hint={t('issues.kpi.resolvedHint')}
            icon={<CheckCircle2Icon className="size-3.5" aria-hidden />}
          />
        </div>
      ) : null}

      <ToggleGroup
        type="single"
        variant="outline"
        spacing={1}
        value={filter}
        onValueChange={(v) => v && setFilter(v as Filter)}
        aria-label={t('issues.filterLabel')}
        className="flex-wrap max-md:grid max-md:w-full max-md:grid-cols-2"
      >
        {FILTERS.map((s) => (
          <ToggleGroupItem key={s} value={s} className="gap-1.5 max-md:w-full">
            {t(`issues.filter.${s}`)}
            <span className="text-muted-foreground tabular-nums">
              {s === 'all' ? issues.length : byStatus(s).length}
            </span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {groups.map(({ status, issues: list }) => (
        <section key={status} aria-labelledby={`issues-${status}`} className="grid gap-2">
          <h2 id={`issues-${status}`} className="flex items-center gap-2 text-sm font-semibold">
            {status === 'open' ? (
              <WrenchIcon className="text-muted-foreground size-4" aria-hidden />
            ) : status === 'planned' ? (
              <CalendarClockIcon className="text-muted-foreground size-4" aria-hidden />
            ) : (
              <CheckCircle2Icon className="text-muted-foreground size-4" aria-hidden />
            )}
            {t(`issues.filter.${status}`)}
            <Badge variant="secondary" className="tabular-nums">
              {list.length}
            </Badge>
          </h2>
          {list.length ? (
            isMobile ? (
              <List issues={list} today={today} onOpen={(i) => setOpenId(i.id)} />
            ) : (
              <Card className="gap-0 px-2 py-0">
                <List issues={list} today={today} onOpen={(i) => setOpenId(i.id)} />
              </Card>
            )
          ) : (
            <p className="text-muted-foreground rounded-xl border border-dashed px-4 py-3 text-sm">
              {t(`issues.none.${status}`)}
            </p>
          )}
        </section>
      ))}

      <IssueSheet issue={opened} today={today} onOpenChange={(o) => !o && setOpenId(null)} />
    </div>
  )
}

function IssuesSkeleton() {
  const { t } = useTranslation()
  return (
    <div role="status" aria-busy className="grid gap-4">
      <span className="sr-only">{t('common.loading')}</span>
      <div className="grid grid-cols-2 gap-3 max-md:hidden lg:grid-cols-4" aria-hidden>
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-9 w-72" aria-hidden />
      <div className="grid gap-2" aria-hidden>
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
    </div>
  )
}

export function IssuesPage() {
  const { t } = useTranslation()
  const can = useCan()
  const query = useApiQuery('housekeeping.issues', {})
  const [newOpen, setNewOpen] = useState(false)
  const today = todayOf()
  // The main action is a worded button in the header; on the phone it sits under the title, full width, above
  // the list (the same place on every screen).
  const report = can('room_issues', 'edit') ? (
    <Button onClick={() => setNewOpen(true)} data-testid="issue-report">
      <PlusIcon aria-hidden />
      {t('issues.report')}
    </Button>
  ) : undefined
  return (
    <Page title={t('nav.issues')} description={t('issues.description')} actions={report}>
      <QueryView
        query={query}
        loading={<IssuesSkeleton />}
        isEmpty={(list) => list.length === 0}
        empty={{ icon: WrenchIcon, title: t('issues.emptyTitle'), body: t('issues.emptyBody') }}
      >
        {(list) => <IssuesView issues={list} today={today} />}
      </QueryView>
      <IssueDialog open={newOpen} onOpenChange={setNewOpen} />
    </Page>
  )
}
