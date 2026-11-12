// Merge two cards of the same person (G-51; faz-06 madde 4): pick the card that stays; the other card's
// reservations (with their payments), room places, blacklist links and earlier merges move to it, its empty
// fields (phone, e-mail, document, standing request, company…) fill the kept card. Nothing is deleted: the old
// card is marked merged and the audit log keeps both. It cannot be undone, so the dialog says so.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangleIcon } from 'lucide-react'
import type { GuestViewDto } from '@shared/contract/procedures/guests'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { ResponsiveDialog } from '@/components/responsive-dialog'
import { useFormat } from '@/hooks/use-format'
import { useApiQuery } from '@/lib/api/hooks'
import { useCan } from '@/lib/view-as'
import { useAdminMutation } from '@/features/settings/use-admin'
import { GUEST_READS } from './guests-api'

function CardFacts({ guest }: { guest: GuestViewDto }) {
  const { t } = useTranslation()
  const f = useFormat()
  const can = useCan()
  const history = useApiQuery('guests.history', { guestId: guest.id })
  const h = history.data
  const stays = h ? h.stays.filter((s) => s.status !== 'cancelled').length : null
  const spent = h ? Object.entries(h.totalSpent) : []
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
      <dt className="text-muted-foreground text-xs">{t('guests.col.phone')}</dt>
      <dd dir="ltr" className="text-end tabular-nums">
        {guest.phone ?? '—'}
      </dd>
      <dt className="text-muted-foreground text-xs">{t('guests.form.email')}</dt>
      <dd className="truncate text-end">{guest.email ?? '—'}</dd>
      <dt className="text-muted-foreground text-xs">{t('guests.col.stays')}</dt>
      <dd className="text-end tabular-nums">{stays ?? '…'}</dd>
      <dt className="text-muted-foreground text-xs">{t('guests.col.lastStay')}</dt>
      <dd className="text-end">{h?.lastStayDate ? f.date(h.lastStayDate, 'medium') : '—'}</dd>
      {can('payments') && !h?.moneyHidden ? (
        <>
          <dt className="text-muted-foreground text-xs">{t('guests.col.paid')}</dt>
          <dd className="text-end tabular-nums">
            {spent.length
              ? spent.map(([c, v]) => (
                  <bdi key={c} className="block">
                    {f.money(v, c)}
                  </bdi>
                ))
              : '—'}
          </dd>
        </>
      ) : null}
    </dl>
  )
}

export function MergeDialog({
  pair,
  onOpenChange,
  onMerged
}: {
  pair: readonly [GuestViewDto, GuestViewDto] | null
  onOpenChange: (open: boolean) => void
  /** The card that stayed. */
  onMerged: (guestId: string) => void
}) {
  const { t } = useTranslation()
  // The card the user was looking at stays unless they pick the other one.
  const [keep, setKeep] = useState<string | null>(pair?.[0].id ?? null)
  const merge = useAdminMutation('guests.merge', { invalidate: GUEST_READS, success: t('guests.merge.done') })
  const save = (): void => {
    if (!pair || !keep || merge.isPending) return
    const other = pair.find((g) => g.id !== keep)
    if (!other) return
    merge.mutate(
      { keepId: keep, mergeId: other.id },
      {
        onSuccess: (result) => {
          onOpenChange(false)
          onMerged(result.guest.id)
        }
      }
    )
  }
  return (
    <ResponsiveDialog
      open={!!pair}
      onOpenChange={onOpenChange}
      title={t('guests.merge.title')}
      description={t('guests.merge.description')}
      className="sm:max-w-2xl"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            form="guest-merge-form"
            disabled={!keep || merge.isPending}
            data-testid="merge-confirm"
          >
            {t('guests.merge.confirm')}
          </Button>
        </>
      }
    >
      {pair ? (
        <form
          id="guest-merge-form"
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            save()
          }}
        >
          <RadioGroup
            value={keep ?? undefined}
            onValueChange={setKeep}
            className="grid gap-3 sm:grid-cols-2"
            aria-label={t('guests.merge.keep')}
          >
            {pair.map((g) => (
              <Label
                key={g.id}
                htmlFor={`keep-${g.id}`}
                className="has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-accent/60 grid cursor-pointer gap-2 rounded-lg border p-3 font-normal"
              >
                <span className="flex items-center gap-2">
                  <RadioGroupItem
                    id={`keep-${g.id}`}
                    value={g.id}
                    aria-labelledby={`keep-label-${g.id} keep-name-${g.id}`}
                  />
                  <span id={`keep-label-${g.id}`} className="text-xs font-medium">
                    {t('guests.merge.keep')}
                  </span>
                </span>
                <span id={`keep-name-${g.id}`} className="text-base font-semibold break-words">
                  {`${g.firstName} ${g.lastName}`.trim()}
                </span>
                <CardFacts guest={g} />
              </Label>
            ))}
          </RadioGroup>
          <Alert className="border-warning bg-warning/15">
            <AlertTriangleIcon />
            <AlertDescription className="text-foreground">{t('guests.merge.irreversible')}</AlertDescription>
          </Alert>
        </form>
      ) : null}
    </ResponsiveDialog>
  )
}
