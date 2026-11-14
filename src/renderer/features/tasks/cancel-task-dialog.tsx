// Cancel a task with a reason (§6.17 open → cancelled; the task is never deleted, the reason stays with it).
import { maxLengthOf } from '@shared/contract/limits'
import { taskCancelSchema } from '@shared/contract/operations'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ResponsiveDialog } from '@/components/responsive-dialog'
import { useFormat } from '@/hooks/use-format'
import { useApiMutation } from '@/lib/api/hooks'
import { TASK_QUERIES, taskTitle, useErrorText, type TaskItem } from './task-data'

export function CancelTaskDialog({ task, onClose }: { task: TaskItem; onClose: () => void }) {
  const { t } = useTranslation()
  const f = useFormat()
  const id = useId()
  const errorText = useErrorText()
  const [reason, setReason] = useState('')
  const [tried, setTried] = useState(false)
  const cancel = useApiMutation('tasks.cancel', { invalidates: TASK_QUERIES })
  const missing = reason.trim().length === 0
  const save = (): void => {
    setTried(true)
    if (missing || cancel.isPending) return
    cancel.mutate(
      { id: task.id, reason: reason.trim() },
      {
        onSuccess: () => {
          toast.success(t('tasks.cancel.done'))
          onClose()
        },
        onError: (error) => void toast.error(errorText(error))
      }
    )
  }
  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => (open ? null : onClose())}
      title={t('tasks.cancel.title')}
      description={taskTitle(f, task)}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form={id} variant="destructive" disabled={cancel.isPending}>
            {t('tasks.cancel.action')}
          </Button>
        </>
      }
    >
      <form
        id={id}
        noValidate
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            save()
          }
        }}
      >
        <p className="text-muted-foreground text-sm">{t('tasks.cancel.body')}</p>
        <div className="grid gap-1.5">
          <Label htmlFor={`${id}-reason`}>{t('tasks.cancel.reason')}</Label>
          <Textarea
            id={`${id}-reason`}
            rows={2}
            value={reason}
            maxLength={maxLengthOf(taskCancelSchema.shape.reason)}
            autoFocus
            onChange={(e) => setReason(e.target.value)}
            aria-invalid={tried && missing}
          />
          {tried && missing ? (
            <p role="alert" className="text-destructive text-xs">
              {t('tasks.cancel.reasonRequired')}
            </p>
          ) : null}
        </div>
      </form>
    </ResponsiveDialog>
  )
}
