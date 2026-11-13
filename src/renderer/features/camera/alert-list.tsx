// The alarm list (Faz 20 P20b; pattern of 21st.dev "Notification Panel", MIT, with CSS transitions instead of
// framer-motion): grouped by day, filtered by state, and each alarm is "yeni" until staff mark it "görüldü" (someone
// looked) or "halledildi" (dealt with). Alarms come from the sidecar until P20c moves them into Bismuth's own table.
// This list is also the whole Kamera screen on a phone (S-108).
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BellOffIcon, CheckCheckIcon, EyeIcon, RotateCcwIcon, UserRoundXIcon } from 'lucide-react'
import { toast } from 'sonner'
import { addDays, localDate, today as todayOf } from '@shared/date'
import {
  CAMERA_ALERT_STATES,
  type CameraAlert,
  type CameraAlertState,
  type CameraAlerts
} from '@shared/contract/camera'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { EmptyState } from '@/components/states'
import { useFormat } from '@/hooks/use-format'
import { useApiMutation } from '@/lib/api/hooks'
import { cn } from '@/lib/utils'
import { groupByDay } from './alert-groups'

type Filter = 'all' | CameraAlertState

const FILTERS: readonly Filter[] = ['all', ...CAMERA_ALERT_STATES]

function DayLabel({ day }: { day: string }) {
  const { t } = useTranslation()
  const f = useFormat()
  if (day === '') return <>{t('camera.alerts.noTime')}</>
  const today = todayOf()
  if (day === today) return <>{t('camera.alerts.today')}</>
  if (day === addDays(today, -1)) return <>{t('camera.alerts.yesterday')}</>
  return <>{f.date(localDate(day), 'medium')}</>
}

const STATE_BADGE: Record<CameraAlertState, 'destructive' | 'secondary' | 'outline'> = {
  new: 'destructive',
  seen: 'secondary',
  handled: 'outline'
}

function AlertRow({
  alert,
  busy,
  onMark
}: {
  alert: CameraAlert
  busy: boolean
  onMark: (state: CameraAlertState) => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  return (
    <li
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 transition-colors duration-200 motion-reduce:transition-none',
        alert.state === 'new' ? 'bg-accent/40' : ''
      )}
      data-testid={`camera-alert-${alert.id}`}
      data-state={alert.state}
    >
      <span
        className={cn(
          'grid size-9 shrink-0 place-items-center rounded-full transition-colors duration-200 motion-reduce:transition-none',
          alert.state === 'new' ? 'bg-destructive/15 text-destructive' : 'bg-muted text-muted-foreground'
        )}
      >
        <UserRoundXIcon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn('text-sm', alert.state === 'new' ? 'font-semibold' : 'font-medium')}>
          {t('camera.alerts.unknownPerson')}
        </p>
        <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-xs">
          {alert.at ? <span className="tabular-nums">{f.time(alert.at)}</span> : null}
          <Badge variant={STATE_BADGE[alert.state]}>{t(`camera.alerts.state.${alert.state}`)}</Badge>
        </p>
      </div>
      <div className="flex flex-wrap gap-2 max-md:w-full">
        {alert.state === 'new' ? (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => onMark('seen')}
            data-testid={`camera-alert-seen-${alert.id}`}
          >
            <EyeIcon aria-hidden />
            {t('camera.alerts.markSeen')}
          </Button>
        ) : null}
        {alert.state !== 'handled' ? (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => onMark('handled')}
            data-testid={`camera-alert-handled-${alert.id}`}
          >
            <CheckCheckIcon aria-hidden />
            {t('camera.alerts.markHandled')}
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => onMark('new')}
            data-testid={`camera-alert-reopen-${alert.id}`}
          >
            <RotateCcwIcon aria-hidden />
            {t('camera.alerts.reopen')}
          </Button>
        )}
      </div>
    </li>
  )
}

export function AlertList({ data }: { data: CameraAlerts }) {
  const { t } = useTranslation()
  const [filter, setFilter] = useState<Filter>('all')
  const mark = useApiMutation('camera.markAlert', {
    invalidates: ['camera.alerts'],
    onError: (error) =>
      toast.error(t('camera.alerts.markFailed'), {
        description: t(error.messageKey as 'errors.internal', { defaultValue: t('errors.internal') })
      })
  })
  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: data.alerts.length, new: 0, seen: 0, handled: 0 }
    for (const a of data.alerts) c[a.state] += 1
    return c
  }, [data.alerts])
  const shown = filter === 'all' ? data.alerts : data.alerts.filter((a) => a.state === filter)
  const days = useMemo(() => groupByDay(shown), [shown])

  if (!data.available)
    return (
      <EmptyState
        icon={BellOffIcon}
        title={t('camera.alerts.unavailableTitle')}
        body={t('camera.alerts.unavailableBody')}
      />
    )
  if (data.alerts.length === 0)
    return (
      <EmptyState
        icon={BellOffIcon}
        title={t('camera.alerts.emptyTitle')}
        body={t('camera.alerts.emptyBody')}
      />
    )

  return (
    <div className="grid gap-4">
      <ToggleGroup
        type="single"
        variant="outline"
        value={filter}
        onValueChange={(v) => v && setFilter(v as Filter)}
        aria-label={t('camera.alerts.filter.label')}
        className="flex-wrap max-md:grid max-md:w-full max-md:grid-cols-2"
        data-testid="camera-alert-filter"
      >
        {FILTERS.map((key) => (
          <ToggleGroupItem
            key={key}
            value={key}
            className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground max-md:min-h-11"
            data-testid={`camera-filter-${key}`}
          >
            {t(`camera.alerts.filter.${key}`, { count: counts[key] })}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {days.length === 0 ? (
        <EmptyState
          compact
          icon={BellOffIcon}
          title={t('camera.alerts.filterEmptyTitle')}
          body={t('camera.alerts.filterEmptyBody')}
        />
      ) : (
        days.map((day) => (
          <section key={day.key} className="overflow-hidden rounded-lg border">
            <h3 className="bg-muted/60 text-muted-foreground border-b px-3 py-1.5 text-xs font-medium">
              <DayLabel day={day.key} />
            </h3>
            <ul className="divide-y" data-testid="camera-alerts">
              {day.alerts.map((alert) => (
                <AlertRow
                  key={alert.id}
                  alert={alert}
                  busy={mark.isPending}
                  onMark={(state) => mark.mutate({ id: alert.id, state })}
                />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}
