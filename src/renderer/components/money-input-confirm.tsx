// "More than is owed" confirmation (QA2a, K-46): a payment above the reservation's balance, an advance or a salary
// payment above what is left of the month's salary is not refused (a guest may pay ahead, a worker may need more),
// but it is asked once, with both amounts, before the form saves.
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
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

export interface OverAmountQuestion {
  title: string
  body: string
  /** The confirming button ("Yine de kaydet"). */
  action: string
  go: () => void
}

export function useOverAmountConfirm(): {
  ask: (question: OverAmountQuestion) => void
  dialog: ReactNode
} {
  const { t } = useTranslation()
  const [question, setQuestion] = useState<OverAmountQuestion | null>(null)
  const dialog = (
    <AlertDialog open={question !== null} onOpenChange={(open) => (open ? null : setQuestion(null))}>
      <AlertDialogContent data-testid="over-amount-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>{question?.title}</AlertDialogTitle>
          <AlertDialogDescription>{question?.body}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            data-testid="over-amount-confirm"
            onClick={() => {
              const go = question?.go
              setQuestion(null)
              go?.()
            }}
          >
            {question?.action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
  return { ask: setQuestion, dialog }
}
