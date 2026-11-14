// One tap on a room's state (G-90): the write, the toast ("Oda 302 “Temiz” olarak işaretlendi") and the warning
// when a closing state could not block the room because it is sold tonight.
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { closesRoom, type HkState } from '@shared/domain/housekeeping'
import { useApiMutation } from '@/lib/api/hooks'
import { useCan } from '@/lib/view-as'
import { TASK_QUERIES } from '@/features/tasks/task-data'
import { useErrorText } from '@/features/issues/issue-utils'

export function useSetStatus() {
  const { t } = useTranslation()
  const errorText = useErrorText()
  const can = useCan()
  const remind = useApiMutation('tasks.create', { invalidates: TASK_QUERIES })
  const write = useApiMutation('housekeeping.setStatus', {
    invalidates: ['housekeeping.board', 'housekeeping.openIssuesByRoom']
  })
  return {
    isPending: write.isPending,
    mutate: ({ roomId, number, status }: { roomId: string; number: string; status: HkState }): void =>
      write.mutate(
        { roomId, status },
        {
          onSuccess: (room) => {
            toast.success(t('rooms.statusSaved', { room: number, state: t(`hk.${status}`) }))
            if (closesRoom(status) && !room.block) {
              toast.warning(t('rooms.sheet.soldTonight'))
              // H-45: the room is sold tonight, so no block was opened; a task reminds someone to choose the state again.
              if (can('tasks', 'edit'))
                remind.mutate({
                  title: t('rooms.sheet.reminderTitle', { room: number }),
                  description: t('rooms.sheet.reminderBody', { state: t(`hk.${status}`) }),
                  roomId
                })
            }
          },
          onError: (error) => void toast.error(errorText(error))
        }
      )
  }
}
