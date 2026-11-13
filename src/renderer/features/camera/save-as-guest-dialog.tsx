// "Misafir olarak kaydet" (Faz 20 P20c; K-53): the face of an alarm's crop becomes a face record of a guest who is in the
// house. The picture is opened from Bismuth's sealed copy for the hotel computer's own window; the guest is picked from
// the in-house list (nothing is typed here: the guest is Bismuth's, G-60).
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { CameraAlert } from '@shared/contract/camera'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/states'
import { ResponsiveDialog } from '@/components/responsive-dialog'
import { useApiMutation, useApiQuery } from '@/lib/api/hooks'

const FORM_ID = 'camera-save-guest-form'

export function SaveAsGuestDialog({ alert, onClose }: { alert: CameraAlert; onClose: () => void }) {
  const { t } = useTranslation()
  const [guestId, setGuestId] = useState<string>('')
  const crop = useApiQuery('camera.alertCrop', { id: alert.id })
  const guests = useApiQuery('camera.candidates', {})
  const save = useApiMutation('camera.saveAlertAsGuest', {
    invalidates: ['camera.alerts', 'camera.candidates', 'camera.faceStatus'],
    onSuccess: () => {
      toast.success(t('camera.alerts.saveDialog.saved'))
      onClose()
    },
    onError: (error) =>
      toast.error(t('camera.alerts.saveDialog.failed'), {
        description: t(error.messageKey as 'errors.internal', { defaultValue: t('errors.internal') })
      })
  })
  const gone = crop.data !== undefined && crop.data.crop === null
  const list = guests.data ?? []

  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => (open ? null : onClose())}
      title={t('camera.alerts.saveDialog.title')}
      description={t('camera.alerts.saveDialog.body')}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            form={FORM_ID}
            disabled={!guestId || gone || save.isPending}
            data-testid="camera-save-guest-confirm"
          >
            {t('camera.alerts.saveDialog.save')}
          </Button>
        </>
      }
    >
      <form
        id={FORM_ID}
        className="grid gap-4 pb-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (guestId && !gone && !save.isPending) save.mutate({ id: alert.id, guestId })
        }}
      >
        {crop.isPending ? (
          <Skeleton className="size-40" aria-label={t('camera.alerts.saveDialog.loading')} />
        ) : crop.isError ? (
          <ErrorState error={crop.error} onRetry={() => void crop.refetch()} />
        ) : crop.data.crop ? (
          <img
            src={crop.data.crop}
            alt={t('camera.alerts.saveDialog.crop')}
            className="size-40 rounded-md border object-cover"
            data-testid="camera-save-guest-crop"
          />
        ) : (
          <p className="text-muted-foreground text-sm">{t('camera.alerts.saveDialog.cropGone')}</p>
        )}
        <div className="grid gap-1.5">
          <Label htmlFor="camera-save-guest">{t('camera.alerts.saveDialog.guest')}</Label>
          {guests.isError ? (
            <ErrorState error={guests.error} onRetry={() => void guests.refetch()} />
          ) : !guests.isPending && list.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t('camera.alerts.saveDialog.none')}</p>
          ) : (
            <Select value={guestId} onValueChange={setGuestId} disabled={gone}>
              <SelectTrigger id="camera-save-guest" className="w-full" data-testid="camera-save-guest">
                <SelectValue placeholder={t('camera.alerts.saveDialog.pick')} />
              </SelectTrigger>
              <SelectContent>
                {list.map((g) => (
                  <SelectItem key={g.guestId} value={g.guestId}>
                    {g.name} · {g.room} · {t('camera.alerts.saveDialog.faces', { count: g.faces })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </form>
    </ResponsiveDialog>
  )
}
