// "İçe aktarmalar" (P14fix #2): every run of the import wizard stays listed — file, when, who, what it wrote — and a
// wrong one is cancelled as a whole with a reason ("Aktarımı iptal et"): the service voids what it wrote in one
// transaction (nothing is deleted) and its records may then be imported again.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { HistoryIcon, UndoIcon } from 'lucide-react'
import type { ImportBatch } from '@shared/contract/backup'
import { localDateOf, type LocalDate } from '@shared/date'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { QueryView } from '@/components/query-view'
import { EmptyState } from '@/components/states'
import { useFormat } from '@/hooks/use-format'
import { useApiMutation, useApiQuery } from '@/lib/api/hooks'

/** Summary keys in the order they are listed. */
const SUMMARY = ['reservations', 'nights', 'payments', 'expenses', 'salaries', 'salaryPayments'] as const

/** ISO instant → its local day. */
const dayOf = (iso: string): LocalDate => localDateOf(new Date(iso))

function useWhen() {
  const f = useFormat()
  return (iso: string): string => `${f.date(dayOf(iso), 'medium')} ${f.time(iso)}`
}

function CancelDialog({ batch, onClose }: { batch: ImportBatch | null; onClose: () => void }) {
  const { t } = useTranslation()
  const [reason, setReason] = useState('')
  const cancel = useApiMutation('dataImport.voidBatch', {
    invalidates: ['dataImport.batches', 'backup.overview', 'dataExport.datasets'],
    onSuccess: () => {
      toast.success(t('dataTransfer.batches.cancelDone'))
      setReason('')
      onClose()
    },
    onError: (error) =>
      toast.error(t('dataTransfer.batches.cancelFailed'), {
        description: t(error.messageKey as 'errors.internal', { defaultValue: t('errors.internal') })
      })
  })
  const valid = reason.trim().length >= 3
  const submit = (): void => {
    if (batch && valid) cancel.mutate({ id: batch.id, reason: reason.trim() })
  }
  return (
    <AlertDialog open={batch !== null} onOpenChange={(open) => (open ? null : onClose())}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('dataTransfer.batches.cancelTitle')}</AlertDialogTitle>
          <AlertDialogDescription>
            {batch ? t('dataTransfer.batches.cancelBody', { file: batch.fileName }) : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <form
          className="grid gap-1.5"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <Label htmlFor="import-cancel-reason">{t('dataTransfer.batches.reason')}</Label>
          <Input
            id="import-cancel-reason"
            value={reason}
            maxLength={500}
            onChange={(e) => setReason(e.target.value)}
            className="max-md:text-base"
            data-testid="import-cancel-reason"
          />
          <p className="text-muted-foreground text-xs">{t('dataTransfer.batches.reasonHelp')}</p>
        </form>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            disabled={!valid || cancel.isPending}
            onClick={(e) => {
              e.preventDefault()
              submit()
            }}
            data-testid="import-cancel-confirm"
          >
            {t('dataTransfer.batches.cancel')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function ImportBatches({ canCancel }: { canCancel: boolean }) {
  const { t } = useTranslation()
  const when = useWhen()
  const batches = useApiQuery('dataImport.batches', {})
  const [cancelling, setCancelling] = useState<ImportBatch | null>(null)
  return (
    <section className="grid gap-2" data-testid="import-batches">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <HistoryIcon className="text-muted-foreground size-4" aria-hidden />
        {t('dataTransfer.batches.title')}
      </h3>
      <p className="text-muted-foreground max-w-prose text-xs">{t('dataTransfer.batches.help')}</p>
      <QueryView query={batches}>
        {(list) =>
          list.length === 0 ? (
            <EmptyState
              compact
              icon={HistoryIcon}
              title={t('dataTransfer.batches.empty')}
              body={t('dataTransfer.batches.emptyBody')}
            />
          ) : (
            <ul className="divide-y rounded-lg border">
              {list.slice(0, 20).map((b) => {
                const parts = SUMMARY.filter((k) => (b.summary[k] ?? 0) > 0).map((k) =>
                  t(`dataTransfer.import.result.${k}`, { count: b.summary[k] ?? 0 })
                )
                return (
                  <li
                    key={b.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5"
                    data-testid="import-batch"
                  >
                    <div className="grid min-w-0 flex-1 gap-0.5">
                      <span className="text-sm font-medium break-all">{b.fileName}</span>
                      <span className="text-muted-foreground flex flex-wrap gap-x-2 text-xs">
                        <span>{t(`dataTransfer.import.templates.${b.template}.name`)}</span>
                        <span>
                          {t('dataTransfer.batches.line', {
                            when: when(b.createdAt),
                            who: b.createdByName ?? '—'
                          })}
                        </span>
                      </span>
                      <span className="text-xs">
                        {parts.length ? parts.join(' · ') : t('dataTransfer.batches.nothing')}
                      </span>
                      {b.voidedAt ? (
                        <span className="text-destructive text-xs break-words">
                          {t('dataTransfer.batches.cancelled', { reason: b.voidReason ?? '' })}
                        </span>
                      ) : null}
                    </div>
                    {!b.voidedAt && canCancel ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="max-md:w-full"
                        onClick={() => setCancelling(b)}
                        data-testid="import-batch-cancel"
                      >
                        <UndoIcon className="rtl:-scale-x-100" aria-hidden />
                        {t('dataTransfer.batches.cancel')}
                      </Button>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )
        }
      </QueryView>
      <CancelDialog batch={cancelling} onClose={() => setCancelling(null)} />
    </section>
  )
}
