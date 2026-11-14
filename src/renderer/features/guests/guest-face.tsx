// "Kameradan yüz al" on the guest card (Faz 20 P20c; K-51…K-53): whether the guest has a face record for the camera, a
// button that takes the face now in front of the camera, and a button that deletes it. The face is sealed in Bismuth's
// database and goes at check-out; nothing is typed into the camera panel (the guest is Bismuth's). Needs `camera.enroll`;
// taking a face works only from the hotel computer's own window (the camera is there).
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CameraIcon, ScanFaceIcon, Trash2Icon } from 'lucide-react'
import { toast } from 'sonner'
import { localDateOf } from '@shared/date'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/states'
import { useFormat } from '@/hooks/use-format'
import { useTransport } from '@/lib/api/api-context'
import { useApiMutation, useApiQuery } from '@/lib/api/hooks'
import { useCan } from '@/lib/view-as'

const REFRESH = ['camera.faceStatus', 'camera.candidates', 'camera.status'] as const

export function GuestFace({ guestId }: { guestId: string }) {
  const { t } = useTranslation()
  const f = useFormat()
  const can = useCan()
  const transport = useTransport()
  const [confirm, setConfirm] = useState(false)
  const canView = can('camera.enroll')
  const canEdit = can('camera.enroll', 'edit')
  const hostWindow = transport.kind === 'ipc'
  const status = useApiQuery('camera.faceStatus', { guestId }, { enabled: canView })
  const fail = (title: string) => (error: { messageKey: string }) =>
    toast.error(title, {
      description: t(error.messageKey as 'errors.internal', { defaultValue: t('errors.internal') })
    })
  const enroll = useApiMutation('camera.enrollFace', {
    invalidates: REFRESH,
    onSuccess: () => toast.success(t('camera.face.enrolled')),
    onError: fail(t('camera.face.enrollFailed'))
  })
  const remove = useApiMutation('camera.deleteFaces', {
    invalidates: REFRESH,
    onSuccess: () => {
      setConfirm(false)
      toast.success(t('camera.face.deleted'))
    },
    onError: (error) => {
      setConfirm(false)
      fail(t('camera.face.deleteFailed'))(error)
    }
  })
  if (!canView) return null

  const data = status.data
  const hint = !data
    ? null
    : !data.keyStore
      ? t('camera.face.noKeyStore')
      : !data.inHouse
        ? t('camera.face.notInHouse')
        : !hostWindow
          ? t('camera.face.hostOnly')
          : null
  const full = data ? data.count >= data.max : false
  const canTake = Boolean(data?.keyStore && data.inHouse && hostWindow && canEdit && !full)

  return (
    <section
      className="grid gap-2 rounded-lg border p-3"
      aria-labelledby="guest-face-title"
      data-testid="guest-face"
    >
      <div className="flex items-start gap-3">
        {data?.crop ? (
          <img
            src={data.crop}
            alt={t('camera.face.cropAlt')}
            className="size-14 shrink-0 rounded-md border object-cover"
            data-testid="guest-face-crop"
          />
        ) : (
          <span className="bg-muted text-muted-foreground grid size-14 shrink-0 place-items-center rounded-md">
            <ScanFaceIcon className="size-6" aria-hidden />
          </span>
        )}
        <div className="grid min-w-0 flex-1 gap-0.5">
          <h3 id="guest-face-title" className="text-sm font-semibold">
            {t('camera.face.title')}
          </h3>
          {status.isPending ? (
            <Skeleton className="h-4 w-32" aria-hidden />
          ) : data && data.count > 0 ? (
            <>
              <p className="text-sm" data-testid="guest-face-state">
                {t('camera.face.has', { count: data.count })}
              </p>
              {data.enrolledAt ? (
                <p className="text-muted-foreground text-xs">
                  {t('camera.face.since', {
                    when: `${f.date(localDateOf(new Date(data.enrolledAt)))} ${f.time(data.enrolledAt)}`
                  })}
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-muted-foreground text-sm" data-testid="guest-face-state">
              {t('camera.face.none')}
            </p>
          )}
        </div>
      </div>
      <p className="text-muted-foreground text-xs">{t('camera.face.help')}</p>
      {status.isError ? <ErrorState error={status.error} onRetry={() => void status.refetch()} /> : null}
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
      {canEdit ? (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={!canTake || enroll.isPending}
            onClick={() => enroll.mutate({ guestId })}
            data-testid="guest-face-enroll"
          >
            <CameraIcon aria-hidden />
            {t('camera.face.enroll')}
          </Button>
          {data && data.count > 0 ? (
            <Button
              size="sm"
              variant="outline"
              disabled={remove.isPending}
              onClick={() => setConfirm(true)}
              data-testid="guest-face-delete"
            >
              <Trash2Icon aria-hidden />
              {t('camera.face.delete')}
            </Button>
          ) : null}
        </div>
      ) : null}
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('camera.face.confirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('camera.face.confirmBody')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={remove.isPending}
              onClick={(e) => {
                e.preventDefault()
                remove.mutate({ guestId })
              }}
              data-testid="guest-face-delete-confirm"
            >
              {t('camera.face.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
