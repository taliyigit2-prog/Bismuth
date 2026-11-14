// The staff exclusion list (Faz 20 P20e; S-107, K-58): the cameras see staff too, so a staff member the hotel adds here
// raises no alarm. The person is picked from the staff records (nothing is typed, G-60); the face is taken from the
// camera in the hotel computer's own window, sealed in Bismuth's database, never kept as a picture and never sent to the
// camera system with a name. Removing the person deletes the face for real.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CameraIcon, UserRoundXIcon } from 'lucide-react'
import { toast } from 'sonner'
import type { CameraStaffPerson } from '@shared/contract/camera'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { QueryView } from '@/components/query-view'
import { EmptyState } from '@/components/states'
import { useTransport } from '@/lib/api/api-context'
import { useApiMutation, useApiQuery } from '@/lib/api/hooks'
import { useCan } from '@/lib/view-as'

export function StaffExclusion() {
  const { t } = useTranslation()
  const can = useCan()
  const transport = useTransport()
  // The list (names) is the hotel computer's own window only, like taking a face (camera.staff is desktopOnly).
  const host = transport.kind === 'ipc'
  const list = useApiQuery('camera.staff', {}, { enabled: host })
  const [pick, setPick] = useState('')
  const [removing, setRemoving] = useState<CameraStaffPerson | null>(null)
  const canEdit = can('camera.enroll', 'edit')
  // A face is taken in the hotel computer's own window only (the service refuses anything else as well).
  const canTake = canEdit && transport.kind === 'ipc'

  const enroll = useApiMutation('camera.enrollStaff', {
    invalidates: ['camera.staff', 'camera.retentionReport'],
    onSuccess: () => {
      setPick('')
      toast.success(t('camera.staff.added'))
    },
    onError: (error) =>
      toast.error(t('camera.staff.addFailed'), {
        description: t(error.messageKey as 'errors.internal', { defaultValue: t('errors.internal') })
      })
  })
  const remove = useApiMutation('camera.removeStaff', {
    invalidates: ['camera.staff', 'camera.retentionReport'],
    onSuccess: () => {
      setRemoving(null)
      toast.success(t('camera.staff.removed'))
    },
    onError: (error) =>
      toast.error(t('camera.staff.removeFailed'), {
        description: t(error.messageKey as 'errors.internal', { defaultValue: t('errors.internal') })
      })
  })

  return (
    <section className="grid gap-3" data-testid="camera-staff">
      <div className="grid gap-1">
        <h3 className="text-sm font-medium">{t('camera.staff.title')}</h3>
        <p className="text-muted-foreground text-xs">{t('camera.staff.help')}</p>
      </div>
      {!host ? (
        <p className="text-muted-foreground text-xs">{t('camera.staff.hostOnly')}</p>
      ) : (
        <QueryView query={list}>
          {(data) => (
            <div className="grid gap-4">
              {!data.keyStore ? (
                <p className="text-muted-foreground text-xs" role="status">
                  {t('camera.staff.noKeyStore')}
                </p>
              ) : null}
              {data.listed.length === 0 ? (
                <EmptyState
                  compact
                  icon={UserRoundXIcon}
                  title={t('camera.staff.emptyTitle')}
                  body={t('camera.staff.emptyBody')}
                />
              ) : (
                <ul className="grid gap-2" data-testid="camera-staff-list">
                  {data.listed.map((p) => (
                    <li
                      key={p.employeeId}
                      className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2"
                      data-testid="camera-staff-row"
                    >
                      <div className="grid min-w-0 flex-1 basis-40">
                        <span className="truncate font-medium">{p.name}</span>
                        {p.position ? (
                          <span className="text-muted-foreground truncate text-xs">{p.position}</span>
                        ) : null}
                      </div>
                      <Badge variant="secondary">{t('camera.staff.faces', { count: p.faces })}</Badge>
                      {canTake && p.faces < data.max && data.keyStore ? (
                        <Button
                          variant="outline"
                          className="max-md:w-full"
                          disabled={enroll.isPending}
                          onClick={() => enroll.mutate({ employeeId: p.employeeId })}
                          data-testid="camera-staff-another"
                        >
                          <CameraIcon aria-hidden />
                          {t('camera.staff.takeAnother')}
                        </Button>
                      ) : null}
                      {canEdit ? (
                        <Button
                          variant="ghost"
                          className="max-md:w-full"
                          onClick={() => setRemoving(p)}
                          data-testid="camera-staff-remove"
                        >
                          {t('camera.staff.remove')}
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
              {canEdit ? (
                !canTake ? (
                  <p className="text-muted-foreground text-xs">{t('camera.staff.hostOnly')}</p>
                ) : data.others.length === 0 ? (
                  <p className="text-muted-foreground text-xs">{t('camera.staff.pickEmpty')}</p>
                ) : (
                  <div className="grid gap-1.5">
                    <Label htmlFor="camera-staff-pick">{t('camera.staff.pickLabel')}</Label>
                    <div className="flex flex-wrap items-start gap-2">
                      <Select value={pick} onValueChange={setPick}>
                        <SelectTrigger
                          id="camera-staff-pick"
                          className="w-72 max-md:w-full"
                          data-testid="camera-staff-pick"
                        >
                          <SelectValue placeholder={t('camera.staff.pick')} />
                        </SelectTrigger>
                        <SelectContent>
                          {data.others.map((p) => (
                            <SelectItem key={p.employeeId} value={p.employeeId}>
                              {p.position ? `${p.name} · ${p.position}` : p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        disabled={!pick || !data.keyStore || enroll.isPending}
                        onClick={() => enroll.mutate({ employeeId: pick })}
                        className="max-md:w-full"
                        data-testid="camera-staff-take"
                      >
                        <CameraIcon aria-hidden />
                        {t('camera.staff.take')}
                      </Button>
                    </div>
                    <p className="text-muted-foreground text-xs">{t('camera.staff.takeHint')}</p>
                  </div>
                )
              ) : null}
            </div>
          )}
        </QueryView>
      )}
      {removing ? (
        <AlertDialog open onOpenChange={(open) => (open ? null : setRemoving(null))}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('camera.staff.removeTitle', { name: removing.name })}</AlertDialogTitle>
              <AlertDialogDescription>{t('camera.staff.removeBody')}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
              <AlertDialogAction
                disabled={remove.isPending}
                data-testid="camera-staff-remove-confirm"
                onClick={(e) => {
                  e.preventDefault()
                  remove.mutate({ employeeId: removing.employeeId })
                }}
              >
                {t('camera.staff.remove')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </section>
  )
}
