// Handover history (G-64): who took the money, when, how much, how many rows; an undone handover stays listed with
// its reason (records are never deleted). Undo needs the handover right and a reason (audit).
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { HistoryIcon, Undo2Icon } from 'lucide-react'
import type { MethodGroup } from '@shared/domain/cash'
import type { LocalDate } from '@shared/date'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { ResponsiveDialog } from '@/components/responsive-dialog'
import { EmptyState, ErrorState } from '@/components/states'
import { useFormat } from '@/hooks/use-format'
import { useApiQuery } from '@/lib/api/hooks'
import { useCan } from '@/lib/view-as'
import { cn } from '@/lib/utils'
import { useLedgerMutation, type HandoverRow } from '@/features/ledger/ledger-api'

export function HandoverHistory({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation()
  const f = useFormat()
  const can = useCan()
  const query = useApiQuery('ledger.handovers', { limit: 30 })
  const [undo, setUndo] = useState<HandoverRow | null>(null)
  if (query.isPending)
    return (
      <div role="status" aria-busy className="grid gap-2">
        <span className="sr-only">{t('common.loading')}</span>
        <Skeleton className="h-12 w-full" aria-hidden />
        <Skeleton className="h-12 w-full" aria-hidden />
      </div>
    )
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />
  if (!query.data.length)
    return (
      <EmptyState
        compact
        icon={HistoryIcon}
        title={t('ledger.drawer.historyEmptyTitle')}
        body={t('ledger.drawer.historyEmptyBody')}
      />
    )
  const canUndo = can('payments.handover', 'edit')
  return (
    <>
      <ul className="grid gap-2" aria-label={t('ledger.drawer.history')} data-testid="handover-history">
        {query.data.map((h) => {
          const when = `${f.date(h.at.slice(0, 10) as LocalDate, 'medium')} ${f.time(h.at)}`
          return (
            <li
              key={h.id}
              className={cn(
                'bg-card grid gap-1 rounded-lg border px-3 py-2 text-sm',
                h.revertedAt && 'text-muted-foreground'
              )}
              data-reverted={h.revertedAt ? true : undefined}
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-medium">{when}</span>
                {h.byName ? <span className="text-muted-foreground">{h.byName}</span> : null}
                {h.revertedAt ? <Badge variant="outline">{t('ledger.drawer.reverted')}</Badge> : null}
                <span className={cn('flex flex-wrap gap-x-2 font-semibold', !compact && 'ms-auto')}>
                  {Object.entries(h.drawer)
                    .filter(([, v]) => v)
                    .map(([c, v]) => (
                      <bdi key={c} className={cn('tabular-nums', h.revertedAt && 'line-through')}>
                        {f.money(v, c)}
                      </bdi>
                    ))}
                </span>
              </div>
              <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 text-xs">
                <span>{t('ledger.drawer.rows', { count: h.paymentCount + h.expenseCount })}</span>
                {Object.entries(h.pending).flatMap(([c, groups]) =>
                  Object.entries(groups ?? {})
                    .filter(([g, v]) => v && g !== 'cash')
                    .map(([g, v]) => (
                      <span key={`${c}-${g}`}>
                        {t(`ledger.group.${g as MethodGroup}`)}{' '}
                        <bdi className="tabular-nums">{f.money(v ?? 0, c)}</bdi>
                      </span>
                    ))
                )}
                {h.note ? <span className="italic">{h.note}</span> : null}
                {h.revertedAt && h.revertReason ? (
                  <span>{t('ledger.drawer.revertedWhy', { reason: h.revertReason })}</span>
                ) : null}
                {canUndo && !h.revertedAt ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ms-auto max-md:min-h-11"
                    onClick={() => setUndo(h)}
                    data-testid="handover-undo"
                  >
                    <Undo2Icon aria-hidden />
                    {t('ledger.drawer.undo')}
                  </Button>
                ) : null}
              </div>
            </li>
          )
        })}
      </ul>
      <UndoDialog handover={undo} onOpenChange={(o) => !o && setUndo(null)} />
    </>
  )
}

function UndoDialog({
  handover,
  onOpenChange
}: {
  handover: HandoverRow | null
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const [reason, setReason] = useState('')
  const [tried, setTried] = useState(false)
  const save = useLedgerMutation('ledger.revertHandover', {
    success: t('ledger.drawer.undone'),
    onSuccess: () => {
      setReason('')
      setTried(false)
      onOpenChange(false)
    }
  })
  const missing = !reason.trim()
  const submit = (): void => {
    setTried(true)
    if (missing || !handover) return
    save.mutate({ id: handover.id, reason: reason.trim() })
  }
  return (
    <ResponsiveDialog
      open={handover !== null}
      onOpenChange={onOpenChange}
      title={t('ledger.drawer.undoTitle')}
      description={
        handover
          ? t('ledger.drawer.undoBody', {
              when: `${f.date(handover.at.slice(0, 10) as LocalDate, 'medium')} ${f.time(handover.at)}`
            })
          : undefined
      }
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button variant="destructive" onClick={submit} disabled={save.isPending} data-testid="undo-confirm">
            {t('ledger.drawer.undo')}
          </Button>
        </>
      }
    >
      <form
        className="grid gap-1.5"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <Label htmlFor="undo-reason">{t('ledger.void.reason')}</Label>
        <Textarea
          id="undo-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          aria-invalid={(tried && missing) || undefined}
          placeholder={t('ledger.drawer.undoPlaceholder')}
        />
        <p className={tried && missing ? 'text-destructive text-xs' : 'text-muted-foreground text-xs'}>
          {tried && missing ? t('errors.reasonRequired') : t('ledger.void.hint')}
        </p>
      </form>
    </ResponsiveDialog>
  )
}
