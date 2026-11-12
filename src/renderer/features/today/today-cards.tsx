// The cards of the Today screen (G-92). Each one gets its part of `today.summary` (null parts are not rendered by
// the page) or reads its own procedure (open issues, favourite phone numbers, staff panel), so a part a role may
// not see never turns the whole screen into an error.
import type { ReactNode } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import {
  ArrowRightIcon,
  BrushCleaningIcon,
  CalendarHeartIcon,
  ClipboardListIcon,
  IdCardIcon,
  LogInIcon,
  LogOutIcon,
  PhoneIcon,
  ShieldAlertIcon,
  WrenchIcon
} from 'lucide-react'
import { toast } from 'sonner'
import type { DayStayDto, TodaySummaryDto } from '@shared/contract/procedures/today'
import { localDate, type LocalDate } from '@shared/date'
import { ISSUE_SEVERITY_RANK, isIssueStale, issueAgeDays } from '@shared/domain/housekeeping'
import { TOURISM_TEMPLATE_CODE } from '@shared/domain/today'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { SectionCard } from '@/components/section-card'
import { useFormat } from '@/hooks/use-format'
import { useApiMutation, useApiQuery } from '@/lib/api/hooks'
import { useCan } from '@/lib/view-as'
import { cn } from '@/lib/utils'
import { NoteColorStyles, NoteDot } from '@/features/calendar-notes/note-color'

type Summary = TodaySummaryDto

export function AllLink({
  to,
  label
}: {
  to: '/in-house' | '/tasks' | '/rooms' | '/issues' | '/shift' | '/contacts' | '/staff' | '/calendar-notes'
  label?: string
}) {
  const { t } = useTranslation()
  return (
    <Button asChild variant="ghost" size="sm" className="text-muted-foreground -me-2">
      <Link to={to}>
        {label ?? t('today.all')}
        <ArrowRightIcon className="rtl:rotate-180" aria-hidden />
      </Link>
    </Button>
  )
}

function RoomChip({ children }: { children: ReactNode }) {
  return (
    <span className="bg-muted grid h-8 min-w-10 shrink-0 place-items-center rounded-md px-1.5 text-sm font-semibold tabular-nums">
      {children}
    </span>
  )
}

/** One arrival or departure: the name wraps (two lines at most); the reservation note sits under it. */
function StayLine({ row, trailing, note }: { row: DayStayDto; trailing: ReactNode; note?: string | null }) {
  const f = useFormat()
  const balance = row.balanceMinor ?? 0
  return (
    <li
      className={cn(
        'flex min-h-11 items-center gap-3 rounded-lg px-2 py-1.5',
        row.overdue && 'bg-warning/15 ring-warning/50 ring-1'
      )}
      data-overdue={row.overdue || undefined}
    >
      <RoomChip>{row.roomNumber}</RoomChip>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-sm font-medium break-words" title={row.guestName}>
          {row.guestName}
        </span>
        {note ? <span className="text-info block text-xs break-words">{note}</span> : null}
        {balance > 0 ? (
          <span className="text-destructive block text-xs">
            <Trans
              i18nKey="today.balance"
              values={{ amount: f.money(balance, row.currency ?? undefined) }}
              components={{ m: <bdi /> }}
            />
          </span>
        ) : null}
      </span>
      {trailing}
    </li>
  )
}

export function DeparturesCard({
  rows,
  checkout,
  today
}: {
  rows: DayStayDto[]
  checkout: string
  today: LocalDate
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const left = rows.filter((r) => r.checkedOutAt).length
  return (
    <SectionCard
      title={t('today.departures', { time: checkout })}
      icon={LogOutIcon}
      count={rows.length - left}
      testId="today-departures"
    >
      {rows.length ? (
        <ul className="-mx-2 grid grid-cols-[minmax(0,1fr)] gap-1">
          {rows.map((row) => (
            <StayLine
              key={row.stayId}
              row={row}
              trailing={
                row.checkedOutAt ? (
                  <span className="text-muted-foreground text-xs">
                    {t('today.leftAt', { time: f.time(row.checkedOutAt) })}
                  </span>
                ) : row.overdue ? (
                  <Badge
                    variant="outline"
                    className="border-warning text-foreground h-auto whitespace-normal"
                  >
                    {row.checkOut < today
                      ? t('today.overdueSince', { date: f.dayMonth(row.checkOut) })
                      : t('today.overdue')}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground text-xs">{t('today.inRoom')}</span>
                )
              }
            />
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">{t('today.noDepartures')}</p>
      )}
    </SectionCard>
  )
}

export function ArrivalsCard({ rows, today }: { rows: DayStayDto[]; today: LocalDate }) {
  const { t } = useTranslation()
  const f = useFormat()
  const arrived = rows.filter((r) => r.checkedInAt).length
  return (
    <SectionCard
      title={t('today.arrivals')}
      icon={LogInIcon}
      count={rows.length - arrived}
      testId="today-arrivals"
    >
      {rows.length ? (
        <ul className="-mx-2 grid grid-cols-[minmax(0,1fr)] gap-1">
          {rows.map((row) => (
            <StayLine
              key={row.stayId}
              row={row}
              note={row.checkedInAt ? null : row.note}
              trailing={
                row.checkedInAt ? (
                  <span className="text-muted-foreground text-xs">
                    {t('today.arrivedAt', { time: f.time(row.checkedInAt) })}
                  </span>
                ) : row.checkIn < today ? (
                  // Yesterday's guest still awaited after midnight (until the check-out time).
                  <Badge
                    variant="outline"
                    className="border-warning text-foreground h-auto whitespace-normal"
                  >
                    {t('today.lateArrival')}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground text-xs whitespace-nowrap">
                    {t('today.nights', { count: row.nights })}
                  </span>
                )
              }
            />
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">{t('today.noArrivals')}</p>
      )}
    </SectionCard>
  )
}

export function TasksCard({ tasks, today }: { tasks: NonNullable<Summary['tasks']>; today: LocalDate }) {
  const { t } = useTranslation()
  const f = useFormat()
  const can = useCan()
  /** Due "YYYY-MM-DDTHH:MM" (hotel wall clock): the time today, "3 Eki 09:00" on an earlier day (overdue). */
  const due = (at: string): string =>
    at.slice(0, 10) === today
      ? at.slice(11, 16)
      : `${f.dayMonth(localDate(at.slice(0, 10)))} ${at.slice(11, 16)}`
  const done = useApiMutation('today.completeTask', {
    invalidates: ['today.summary'],
    onSuccess: () => void toast.success(t('today.taskDone')),
    onError: (e) =>
      void toast.error(t(e.messageKey as 'errors.internal', { defaultValue: t('errors.internal') }))
  })
  return (
    <SectionCard
      title={t('today.tasks')}
      icon={ClipboardListIcon}
      count={tasks.length}
      action={<AllLink to="/tasks" />}
      testId="today-tasks"
    >
      {tasks.length ? (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-1">
          {tasks.map((task) => {
            const title = task.titleI18n?.[f.locale] ?? task.title
            return (
              <li
                key={task.id}
                className="flex min-h-11 items-center gap-3"
                data-testid={`today-task-${task.id}`}
              >
                {/* Phone: the label around the box is the 44 px target. */}
                <label
                  htmlFor={`task-${task.id}`}
                  className="grid shrink-0 place-items-center max-md:-ms-3 max-md:-me-1 max-md:size-11 md:contents"
                >
                  <Checkbox
                    id={`task-${task.id}`}
                    disabled={done.isPending}
                    checked={done.isPending && done.variables?.id === task.id}
                    onCheckedChange={(v) => (v === true ? done.mutate({ id: task.id }) : undefined)}
                    aria-label={t('today.markTaskDone', { title })}
                  />
                </label>
                <label htmlFor={`task-${task.id}`} className="min-w-0 flex-1 text-sm">
                  <span className="line-clamp-2 font-medium break-words">{title}</span>
                  <span className="text-muted-foreground block text-xs">
                    {[
                      task.dueAt ? due(task.dueAt) : null,
                      task.roomNumber ? t('today.roomNo', { room: task.roomNumber }) : null
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </label>
                {task.overdue ? <Badge variant="destructive">{t('today.late')}</Badge> : null}
                {task.templateCode === TOURISM_TEMPLATE_CODE && can('tourism_stats') ? (
                  <Button asChild size="sm" variant="outline">
                    <Link to="/tourism">{t('today.reminder.open')}</Link>
                  </Button>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">{t('today.noTasks')}</p>
      )}
    </SectionCard>
  )
}

export function KbsCard({
  gaps,
  house
}: {
  gaps: NonNullable<Summary['kbsMissing']>
  house: Summary['inHouse']
}) {
  const { t } = useTranslation()
  return (
    <SectionCard
      title={t('today.kbs')}
      icon={ShieldAlertIcon}
      count={gaps.length}
      tone="warn"
      action={<AllLink to="/in-house" />}
      testId="today-kbs"
    >
      {/* G-92: who is in the house tonight, then what KBS still needs. */}
      {house ? (
        <p className="mb-2 text-sm font-medium" data-testid="today-in-house">
          {t('today.inHouseRooms', { count: house.rooms })} ·{' '}
          {t('today.inHousePeople', { count: house.people })}
        </p>
      ) : null}
      {gaps.length ? (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-1">
          {gaps.map((g) => (
            <li
              key={`${g.stayId}-${g.occupantId ?? 'room'}`}
              className="flex min-h-9 items-center gap-3 text-sm"
            >
              <span className="bg-muted grid h-7 min-w-10 place-items-center rounded-md px-1.5 text-xs font-semibold tabular-nums">
                {g.roomNumber}
              </span>
              <span className="line-clamp-2 min-w-0 flex-1 break-words">
                {g.fullName ?? t('today.kbsUnnamed')}
              </span>
              <span className="text-destructive text-xs font-medium">
                {g.kind === 'checkout' ? t('occupants.kbsMissingOut') : t('occupants.kbsMissingIn')}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">{t('today.kbsAllDone')}</p>
      )}
    </SectionCard>
  )
}

export function DirtyCard({ rooms }: { rooms: NonNullable<Summary['dirtyRooms']> }) {
  const { t } = useTranslation()
  return (
    <SectionCard
      title={t('today.dirty')}
      icon={BrushCleaningIcon}
      count={rooms.length}
      action={<AllLink to="/rooms" />}
      testId="today-dirty"
    >
      {rooms.length ? (
        <ul className="flex flex-wrap gap-1.5">
          {rooms.map((room) => (
            <li
              key={room.id}
              className="border-hk-dirty rounded-md border-2 px-2 py-1 text-sm font-semibold tabular-nums"
            >
              {room.number}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">{t('today.noDirty')}</p>
      )}
    </SectionCard>
  )
}

/** Open and planned issues, the most serious first; seven days or older in red (G-180). */
export function IssuesCard({ today }: { today: LocalDate }) {
  const { t } = useTranslation()
  const query = useApiQuery('housekeeping.issues', { status: ['open', 'planned'] })
  const issues = [...(query.data ?? [])].sort(
    (a, b) =>
      ISSUE_SEVERITY_RANK[a.severity] - ISSUE_SEVERITY_RANK[b.severity] ||
      a.reportedAt.localeCompare(b.reportedAt)
  )
  return (
    <SectionCard
      title={t('today.issues')}
      icon={WrenchIcon}
      count={query.data ? issues.length : undefined}
      action={<AllLink to="/issues" />}
      testId="today-issues"
    >
      {query.isPending ? (
        <Skeleton className="h-16" />
      ) : query.isError ? (
        <p className="text-destructive text-sm">{t('today.partFailed')}</p>
      ) : issues.length ? (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-1">
          {issues.slice(0, 6).map((issue) => {
            const stale = isIssueStale(issue, today)
            return (
              <li
                key={issue.id}
                className="flex min-h-9 items-center gap-3 text-sm"
                data-stale={stale || undefined}
              >
                <span className="bg-muted grid h-7 min-w-10 place-items-center rounded-md px-1.5 text-xs font-semibold tabular-nums">
                  {issue.roomNumber ?? '—'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 break-words">{issue.title}</span>
                  <span
                    className={cn(
                      'block text-xs',
                      stale ? 'text-destructive font-medium' : 'text-muted-foreground'
                    )}
                  >
                    {issue.roomNumber ? null : issue.area ? `${issue.area} · ` : null}
                    {issueAgeDays(issue.reportedAt, today) === 0
                      ? t('today.issueToday')
                      : t('issues.age', { count: issueAgeDays(issue.reportedAt, today) })}
                  </span>
                </span>
                <Badge variant={issue.severity === 'urgent' ? 'destructive' : 'secondary'}>
                  {t(`issues.severity.${issue.severity}`)}
                </Badge>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">{t('today.noIssues')}</p>
      )}
    </SectionCard>
  )
}

export function SpecialDaysCard({ days }: { days: Summary['specialDays'] }) {
  const { t } = useTranslation()
  const f = useFormat()
  const can = useCan()
  return (
    <SectionCard
      title={t('today.specialDays')}
      icon={CalendarHeartIcon}
      action={can('calendar.notes') ? <AllLink to="/calendar-notes" /> : undefined}
      testId="today-special"
    >
      <NoteColorStyles colors={days.map((d) => d.color)} />
      {days.length ? (
        <ul className="grid gap-1.5">
          {days.map((d) => (
            <li key={d.id} className="flex items-start gap-2 text-sm">
              <NoteDot kind={d.kind} color={d.color} className="mt-1.5" />
              <span className="min-w-0 flex-1">
                <span className="font-medium break-words">{d.titleI18n?.[f.locale] ?? d.title}</span>{' '}
                <span className="text-muted-foreground text-xs">{t(`calendarNotes.kind.${d.kind}`)}</span>
                {d.note ? (
                  <span className="text-muted-foreground block text-xs break-words">{d.note}</span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">{t('today.noSpecialDays')}</p>
      )}
    </SectionCard>
  )
}

/** The phone book's favourites (faz-12): one tap calls on the phone. */
export function FavoritesCard() {
  const { t } = useTranslation()
  const query = useApiQuery('contacts.favorites', {})
  const rows = query.data ?? []
  return (
    <SectionCard
      title={t('today.favorites')}
      icon={PhoneIcon}
      action={<AllLink to="/contacts" />}
      testId="today-favorites"
    >
      {query.isPending ? (
        <Skeleton className="h-16" />
      ) : query.isError ? (
        <p className="text-destructive text-sm">{t('today.partFailed')}</p>
      ) : rows.length ? (
        <ul className="grid gap-1 sm:grid-cols-2">
          {rows.slice(0, 8).map((c) => {
            const phone = c.phones[0]?.number
            return (
              <li key={c.id} className="min-w-0">
                {phone ? (
                  <a
                    href={`tel:${phone.replace(/[^\d+]/g, '')}`}
                    className="hover:bg-accent focus-visible:ring-ring flex min-h-11 items-center gap-2 rounded-md px-2 py-1 text-sm outline-none focus-visible:ring-[3px]"
                    aria-label={t('contacts.call', { name: c.name, phone })}
                  >
                    <PhoneIcon className="text-muted-foreground size-4 shrink-0" aria-hidden />
                    <span className="min-w-0 flex-1 truncate font-medium" title={c.name}>
                      {c.name}
                    </span>
                    <span dir="ltr" className="text-muted-foreground max-w-1/2 text-xs tabular-nums">
                      {phone}
                    </span>
                  </a>
                ) : (
                  <span className="flex min-h-11 items-center px-2 text-sm">{c.name}</span>
                )}
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">{t('today.noFavorites')}</p>
      )}
    </SectionCard>
  )
}

/** "Personel durumu" of the month (Excel panel): rest days left and advances (money only for salary viewers). */
export function StaffPanelCard({ today }: { today: LocalDate }) {
  const { t } = useTranslation()
  const f = useFormat()
  const year = Number(today.slice(0, 4))
  const month = Number(today.slice(5, 7))
  const query = useApiQuery('staff.panel', { year, month })
  const rows = query.data ?? []
  return (
    <SectionCard
      title={t('staff.panel.title', { month: f.monthYear(today) })}
      icon={IdCardIcon}
      action={<AllLink to="/staff" />}
      testId="today-staff"
    >
      {query.isPending ? (
        <Skeleton className="h-16" />
      ) : query.isError ? (
        <p className="text-destructive text-sm">{t('today.partFailed')}</p>
      ) : rows.length ? (
        <ul className="grid gap-1">
          {rows.map((r) => (
            <li key={r.employeeId} className="flex min-h-9 flex-wrap items-center gap-x-3 gap-y-0.5 text-sm">
              <span className="min-w-0 flex-1 font-medium break-words">{r.fullName}</span>
              <span className={cn('text-xs', r.leaveLeft < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                {t('today.staffLeave', { left: r.leaveLeft, total: r.leaveEntitled })}
              </span>
              {r.advancesMinor ? (
                <span className="text-xs">
                  <Trans
                    i18nKey="today.staffAdvance"
                    values={{ amount: f.money(r.advancesMinor, r.currency ?? undefined) }}
                    components={{ m: <bdi /> }}
                  />
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">{t('today.noStaff')}</p>
      )}
    </SectionCard>
  )
}
