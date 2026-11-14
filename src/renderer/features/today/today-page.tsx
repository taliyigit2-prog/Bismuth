// Bugün (G-92, akislar.md §1; not the start screen): the day at a glance — who leaves (the ones past check-out
// time loud), who arrives, KBS gaps, open tasks, dirty rooms, open issues, the unread handover, the drawer, today's
// special days, legal reminders, favourite phone numbers, the staff panel or one's own hours, the backup warning and
// the week's weather. Every card follows the role: the summary leaves out (null) what the role may not see and the
// screen hides that card; the cards that read their own procedure are shown only to roles that may read it.
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import {
  BedDoubleIcon,
  DatabaseBackupIcon,
  LandmarkIcon,
  LogInIcon,
  LogOutIcon,
  MessageSquareTextIcon,
  ShieldAlertIcon,
  SunIcon,
  WalletIcon
} from 'lucide-react'
import type { TodaySummaryDto } from '@shared/contract/procedures/today'
import { occupancyBasisPoints } from '@shared/domain/reports'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { KpiCard } from '@/components/kpi-card'
import { Page } from '@/components/page'
import { QueryView } from '@/components/query-view'
import { useFormat } from '@/hooks/use-format'
import { useIsMobile } from '@/hooks/use-mobile'
import { useApiQuery } from '@/lib/api/hooks'
import { useCan } from '@/lib/view-as'
import { MyHoursCard } from '@/features/staff/work-time'
import {
  ArrivalsCard,
  DeparturesCard,
  DirtyCard,
  FavoritesCard,
  IssuesCard,
  KbsCard,
  SpecialDaysCard,
  StaffPanelCard,
  TasksCard
} from './today-cards'
import { WeatherCard } from './weather-card'

/** Legal reminder (G-93): the ministry's monthly statistics, with the way to the Turizm İstatistiği screen. */
function ReminderAlerts({ reminders }: { reminders: TodaySummaryDto['reminders'] }) {
  const { t } = useTranslation()
  const f = useFormat()
  return reminders.map((r) => (
    <Alert key={r.kind} className="border-warning/60" data-testid="today-reminder-tourism">
      <LandmarkIcon aria-hidden />
      <AlertTitle>{t('today.reminder.tourismTitle')}</AlertTitle>
      <AlertDescription className="grid gap-2">
        <p>
          {r.daysLeft === 0
            ? t('today.reminder.tourismLastDay', { date: f.date(r.dueDate, 'long') })
            : t('today.reminder.tourismBody', { date: f.date(r.dueDate, 'long'), count: r.daysLeft })}
        </p>
        <Button asChild size="sm" className="justify-self-start">
          <Link to="/tourism">{t('today.reminder.open')}</Link>
        </Button>
      </AlertDescription>
    </Alert>
  ))
}

/** The backup warning (faz-14): only for those who can act on it in Ayarlar → Yedek. */
function BackupAlert() {
  const { t } = useTranslation()
  const status = useApiQuery('backup.status', {}, { staleTime: 60_000 })
  const s = status.data
  if (!s) return null
  // No backup yet: "none" says it (not "stale"); the other warnings (a failed restore, the key) still show.
  const messages =
    s.lastBackupAt === null ? ['none' as const, ...s.warnings.filter((w) => w !== 'stale')] : s.warnings
  if (!messages.length) return null
  return (
    <Alert className="border-warning/60" data-testid="today-backup">
      <DatabaseBackupIcon aria-hidden />
      <AlertTitle>{t('today.backupTitle')}</AlertTitle>
      {/* 05 #6: one line on a wide screen (message, then the button); several warnings stack in the first part. */}
      <AlertDescription className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="grid min-w-0 flex-1 basis-64 gap-1">
          {messages.map((m) => (
            <p key={m}>{t(`backup.warning.${m}`)}</p>
          ))}
        </div>
        <Button asChild size="sm" variant="outline" className="max-md:w-full">
          <Link to="/settings" search={{ tab: 'backup' }}>
            {t('today.backupOpen')}
          </Link>
        </Button>
      </AlertDescription>
    </Alert>
  )
}

function HandoverAlert({ handovers }: { handovers: NonNullable<TodaySummaryDto['handovers']> }) {
  const { t } = useTranslation()
  const f = useFormat()
  const latest = handovers.latest
  if (!latest) return null
  return (
    <Alert className="border-info/50" data-testid="handover-alert">
      <MessageSquareTextIcon aria-hidden />
      <AlertTitle>{t('today.handover.title')}</AlertTitle>
      <AlertDescription className="grid gap-2">
        <p>{t('today.handover.unread', { count: handovers.count, time: f.time(latest.writtenAt) })}</p>
        {latest.text ? <p className="text-foreground line-clamp-2 break-words">{latest.text}</p> : null}
        <Button asChild size="sm" variant="outline" className="justify-self-start">
          <Link to="/shift">{t('today.handover.open')}</Link>
        </Button>
      </AlertDescription>
    </Alert>
  )
}

function Kpis({ s }: { s: TodaySummaryDto }) {
  const { t } = useTranslation()
  const f = useFormat()
  const cards = [
    <KpiCard
      key="occupancy"
      label={t('today.kpi.occupancy')}
      value={f.percent(
        occupancyBasisPoints({ soldNights: s.soldTonight, sellableNights: s.sellableRooms }),
        0
      )}
      hint={t('today.kpi.occupancyHint', { count: s.soldTonight, rooms: s.sellableRooms })}
      icon={<BedDoubleIcon className="size-3.5" aria-hidden />}
    />
  ]
  if (s.arrivals)
    cards.push(
      <KpiCard
        key="arrivals"
        label={t('today.kpi.arrivals')}
        value={f.number(s.arrivals.length)}
        hint={t('today.kpi.arrivalsHint', { count: s.arrivals.filter((r) => r.checkedInAt).length })}
        icon={<LogInIcon className="size-3.5" aria-hidden />}
      />
    )
  if (s.departures)
    cards.push(
      <KpiCard
        key="departures"
        label={t('today.kpi.departures')}
        value={f.number(s.departures.length)}
        hint={t('today.kpi.departuresHint', { count: s.departures.filter((r) => r.checkedOutAt).length })}
        icon={<LogOutIcon className="size-3.5" aria-hidden />}
      />
    )
  if (s.drawer)
    cards.push(
      <KpiCard
        key="drawer"
        label={t('today.kpi.drawer')}
        value={
          s.drawer.length ? s.drawer.map((d) => f.money(d.amountMinor, d.currency)).join(' · ') : f.money(0)
        }
        hint={t('today.kpi.drawerHint')}
        icon={<WalletIcon className="size-3.5" aria-hidden />}
      />
    )
  else if (s.kbsMissing)
    cards.push(
      <KpiCard
        key="kbs"
        label={t('today.kpi.kbs')}
        value={f.number(s.kbsMissing.length)}
        hint={t('today.kpi.kbsHint')}
        icon={<ShieldAlertIcon className="size-3.5" aria-hidden />}
      />
    )
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="today-kpis">
      {cards}
    </div>
  )
}

function TodayView({ s }: { s: TodaySummaryDto }) {
  const can = useCan()
  const isMobile = useIsMobile()
  const ownHours = !can('staff') && can('staff.own_hours')
  return (
    <div className="grid gap-4">
      {/* Phone: the weather first (faz-11 madde 6); wider: in the grid below. */}
      {isMobile ? <WeatherCard /> : null}
      <ReminderAlerts reminders={s.reminders} />
      {can('settings.backup') ? <BackupAlert /> : null}
      {s.handovers ? <HandoverAlert handovers={s.handovers} /> : null}

      <Kpis s={s} />

      {/* Cards of one row share its height, so the two columns end level instead of leaving ragged gaps. */}
      <div className="grid gap-4 lg:grid-cols-2">
        {s.departures ? (
          <DeparturesCard rows={s.departures} checkout={s.checkoutTime} today={s.today} />
        ) : null}
        {s.arrivals ? <ArrivalsCard rows={s.arrivals} today={s.today} /> : null}
        {s.tasks ? <TasksCard tasks={s.tasks} today={s.today} /> : null}
        {s.kbsMissing ? <KbsCard gaps={s.kbsMissing} house={s.inHouse} /> : null}
        {s.dirtyRooms ? <DirtyCard rooms={s.dirtyRooms} /> : null}
        {can('room_issues') ? <IssuesCard today={s.today} /> : null}
        <SpecialDaysCard days={s.specialDays} />
        {can('contacts') ? <FavoritesCard /> : null}
        {can('staff') ? <StaffPanelCard today={s.today} /> : null}
        {ownHours ? <MyHoursCard today={s.today} /> : null}
        {isMobile ? null : <WeatherCard className="lg:col-span-2" />}
      </div>
    </div>
  )
}

function TodaySkeleton() {
  const { t } = useTranslation()
  return (
    <div role="status" aria-busy className="grid gap-4">
      <span className="sr-only">{t('common.loading')}</span>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-hidden>
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2" aria-hidden>
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-48" />
        ))}
      </div>
    </div>
  )
}

export function TodayPage() {
  const { t } = useTranslation()
  const f = useFormat()
  // The clock moves (check-out time passes, tasks fall due): refreshed every minute.
  const query = useApiQuery('today.summary', {}, { refetchInterval: 60_000 })
  return (
    <Page
      title={t('today.title')}
      description={query.data ? f.date(query.data.today, 'full') : t('today.description')}
    >
      <QueryView
        query={query}
        loading={<TodaySkeleton />}
        isEmpty={(s) => s.sellableRooms === 0}
        empty={{ icon: SunIcon, title: t('calendar.noRoomsTitle'), body: t('today.noRoomsBody') }}
      >
        {(s) => <TodayView s={s} />}
      </QueryView>
    </Page>
  )
}
