// Kamera (Faz 20 P20b; K-49…K-53, S-108): the state of the camera system, the live picture and the alarm list.
// The live picture and the pause/restart controls exist only in the hotel computer's own window (IPC transport, not
// the phone layout): on a phone or a client computer the screen is the alarm list and the state, nothing else.
// Everything is read through the service procedures; the sidecar's address and token never reach this screen.
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { CctvIcon, RefreshCwIcon, SettingsIcon } from 'lucide-react'
import { toast } from 'sonner'
import type { CameraStatus } from '@shared/contract/camera'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Page } from '@/components/page'
import { QueryView } from '@/components/query-view'
import { EmptyState } from '@/components/states'
import { SwitchRow } from '@/features/settings/room-dialogs'
import { useIsMobile } from '@/hooks/use-mobile'
import { useApiMutation, useApiQuery } from '@/lib/api/hooks'
import { useTransport } from '@/lib/api/api-context'
import { useCan } from '@/lib/view-as'
import { AlertList } from './alert-list'
import { cameraStateView, type CameraTone } from './camera-state'
import { LiveView } from './live-view'
import { PrivacyNoticeButton } from './privacy-notice'

const TONE_BADGE: Record<CameraTone, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  running: 'default',
  starting: 'secondary',
  problem: 'destructive',
  off: 'outline'
}

function StatusCard({
  status,
  controls,
  alarmsPaused
}: {
  status: CameraStatus
  /** The hotel computer's own window: restart and pause belong there (the service refuses a phone anyway). */
  controls: boolean
  alarmsPaused: boolean | null
}) {
  const { t } = useTranslation()
  const can = useCan()
  const view = cameraStateView(status)
  const canEdit = can('camera', 'edit')
  const restart = useApiMutation('camera.restart', {
    invalidates: ['camera.status', 'camera.alerts'],
    onSuccess: () => toast.success(t('camera.restarted')),
    onError: (error) =>
      toast.error(t('camera.restartFailed'), {
        description: t(error.messageKey as 'errors.internal', { defaultValue: t('errors.internal') })
      })
  })
  const pause = useApiMutation('camera.setAlarmsPaused', {
    invalidates: ['camera.live'],
    onError: (error) =>
      toast.error(t('camera.pauseFailed'), {
        description: t(error.messageKey as 'errors.internal', { defaultValue: t('errors.internal') })
      })
  })
  const showRestart = controls && canEdit && status.state !== 'unavailable' && status.enabled
  const showPause = controls && canEdit && view.key === 'running' && alarmsPaused !== null
  const showProblemLine = status.lastError && (view.tone === 'problem' || view.key === 'restarting')

  return (
    <Card data-testid="camera-status" data-tone={view.tone} data-key={view.key}>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>{t('camera.status.title')}</CardTitle>
          <Badge variant={TONE_BADGE[view.tone]} data-testid="camera-state-badge">
            {t(`camera.state.${view.key}`)}
          </Badge>
        </div>
        <CardDescription>{t(`camera.stateHelp.${view.key}`)}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {status.totalCrashes > 0 ? (
          <p className="text-muted-foreground text-sm">
            {t('camera.status.crashes', { count: status.totalCrashes })}
          </p>
        ) : null}
        {showProblemLine ? (
          <p className="text-muted-foreground rounded-md border px-3 py-2 text-xs break-words" dir="ltr">
            {status.lastError}
          </p>
        ) : null}
        {showPause ? (
          <SwitchRow
            id="camera-pause"
            label={t('camera.pause.label')}
            help={t('camera.pause.help')}
            checked={alarmsPaused}
            disabled={pause.isPending}
            onChange={(paused) => pause.mutate({ paused })}
          />
        ) : null}
        <div className="flex flex-wrap gap-2 max-md:[&>*]:flex-1">
          {showRestart ? (
            <Button
              variant="outline"
              disabled={restart.isPending}
              onClick={() => restart.mutate({})}
              data-testid="camera-restart"
            >
              <RefreshCwIcon aria-hidden />
              {t('camera.restart')}
            </Button>
          ) : null}
          {canEdit ? (
            <Button asChild variant="ghost">
              <Link to="/settings" search={{ tab: 'camera' }}>
                <SettingsIcon aria-hidden />
                {t('camera.openSettings')}
              </Link>
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

/** The system is off or has no camera address yet: the screen says so and where to change it. */
function SwitchedOff({ status }: { status: CameraStatus }) {
  const { t } = useTranslation()
  const can = useCan()
  const view = cameraStateView(status)
  return (
    <EmptyState
      icon={CctvIcon}
      title={t(`camera.state.${view.key}`)}
      body={t(`camera.stateHelp.${view.key}`)}
      action={
        can('camera', 'edit') && status.state !== 'unavailable' ? (
          <Button asChild>
            <Link to="/settings" search={{ tab: 'camera' }}>
              <SettingsIcon aria-hidden />
              {t('camera.openSettings')}
            </Link>
          </Button>
        ) : undefined
      }
    />
  )
}

function Body({ status }: { status: CameraStatus }) {
  const { t } = useTranslation()
  const transport = useTransport()
  const isMobile = useIsMobile()
  const view = cameraStateView(status)
  // S-108: the live picture is for the hotel computer's own window. The phone layout and a client computer (HTTP) get
  // the alarm list; the service refuses the picture to them as well.
  const hostWindow = transport.kind === 'ipc' && !isMobile
  const running = view.tone === 'running' || view.key === 'slow'
  const live = useApiQuery('camera.live', {}, { enabled: hostWindow && running, refetchInterval: 2_000 })
  // The list is Bismuth's own table (P20c): new alarms land there within a few seconds of the sidecar seeing them.
  const alerts = useApiQuery('camera.alerts', {}, { refetchInterval: 5_000 })
  const off = view.key === 'disabled' || view.key === 'noSource' || view.key === 'unavailable'

  if (off) return <SwitchedOff status={status} />
  return (
    <div className="grid gap-6">
      <StatusCard
        status={status}
        controls={hostWindow}
        alarmsPaused={live.data?.header ? live.data.header.alarmsPaused : null}
      />
      {hostWindow && running ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('camera.live.title')}</CardTitle>
            <CardDescription>{t('camera.live.help')}</CardDescription>
          </CardHeader>
          <CardContent>
            <LiveView live={live.data} />
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>{t('camera.alerts.title')}</CardTitle>
          <CardDescription>{t('camera.alerts.help')}</CardDescription>
        </CardHeader>
        <CardContent>
          <QueryView query={alerts}>{(data) => <AlertList data={data} />}</QueryView>
        </CardContent>
      </Card>
    </div>
  )
}

export function CameraPage() {
  const { t } = useTranslation()
  const status = useApiQuery('camera.status', {}, { refetchInterval: 5_000 })
  return (
    <Page title={t('camera.title')} description={t('camera.description')} actions={<PrivacyNoticeButton />}>
      <QueryView query={status}>{(data) => <Body status={data} />}</QueryView>
    </Page>
  )
}
