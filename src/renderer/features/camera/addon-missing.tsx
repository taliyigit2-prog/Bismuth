// "Camera add-on not installed" (P20ffix): an installed Bismuth without `<userData>/camera-addon` cannot run the camera
// part. Setup wizard, Ayarlar → Kamera and its "Yeniden tara" show this one notice (the Kamera screen has its own state).
// "Kamera ekini kur…" picks the add-on zip and installs it; progress is polled (no event channel from the main process).
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PackageOpenIcon } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { useApiMutation, useApiQuery } from '@/lib/api/hooks'
import { useCan } from '@/lib/view-as'

const POLL_MS = 500
const RUNNING = ['checking', 'unpacking', 'verifying']

/** The install button with its progress, result and error (shared by the notice and the Kamera screen). */
export function CameraAddonInstall() {
  const { t } = useTranslation()
  const can = useCan()
  const [polling, setPolling] = useState(false)
  const state = useApiQuery(
    'camera.addonInstallState',
    {},
    {
      retry: false,
      refetchInterval: (q) => (polling || RUNNING.includes(q.state.data?.phase ?? '') ? POLL_MS : false)
    }
  )
  const pick = useApiMutation('camera.installAddon', {
    onSuccess: (r) => {
      setPolling(r.started)
      if (r.started) void state.refetch()
    }
  })
  const phase = state.data?.phase ?? 'idle'
  const running = RUNNING.includes(phase) || pick.isPending
  const done = phase === 'done'
  const error = phase === 'failed' ? (state.data?.error ?? 'failed') : null
  return (
    <div className="grid gap-3">
      {running ? (
        <div className="grid gap-2" data-testid="camera-addon-progress">
          <p>{t('camera.addonInstall.running')}</p>
          <Progress value={state.data?.percent ?? 0} aria-label={t('camera.addonInstall.progress')} />
        </div>
      ) : null}
      {done ? <p data-testid="camera-addon-done">{t('camera.addonInstall.done')}</p> : null}
      {error ? (
        <p role="alert" className="text-destructive" data-testid="camera-addon-error">
          {t(`camera.addonInstall.errors.${error}`)}
        </p>
      ) : null}
      {pick.isError ? (
        <p role="alert" className="text-destructive">
          {t('camera.addonInstall.errors.failed')}
        </p>
      ) : null}
      {can('camera', 'edit') && !done ? (
        <div>
          <Button
            type="button"
            variant="outline"
            disabled={running}
            onClick={() => pick.mutate({})}
            data-testid="camera-addon-install"
          >
            {t('camera.addonInstall.button')}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

export function CameraAddonMissing() {
  const { t } = useTranslation()
  return (
    <Alert role="status" data-testid="camera-addon-missing">
      <PackageOpenIcon aria-hidden />
      <AlertTitle>{t('camera.state.noAddon')}</AlertTitle>
      <AlertDescription className="grid gap-3">
        <p>{t('camera.stateHelp.noAddon')}</p>
        <CameraAddonInstall />
      </AlertDescription>
    </Alert>
  )
}
