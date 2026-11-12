// "Yine de yaz" (03-mimari.md §6.1, G-38): the reason field of the new reservation form and the question the panel's
// date, room and add-room forms and the restore dialog ask after a refusal (`useBlockOverride`, ./override.ts).
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ResponsiveDialog } from '@/components/responsive-dialog'
import type { BlockOverride } from './override'

/** The reason field of "yine de kaydet" inside a form (new reservation). */
export function OverrideReasonField({
  value,
  onChange,
  invalid,
  className
}: {
  value: string
  onChange: (value: string) => void
  invalid?: boolean
  className?: string
}) {
  const { t } = useTranslation()
  const id = useId()
  return (
    <div className={className} data-testid="override-reason">
      <div className="grid gap-1.5">
        <Label htmlFor={id}>{t('booking.override.label')}</Label>
        <Textarea
          id={id}
          rows={2}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={invalid || undefined}
          aria-describedby={`${id}-help`}
        />
        <p id={`${id}-help`} className="text-muted-foreground text-xs">
          {t('booking.override.help')}
        </p>
      </div>
    </div>
  )
}

/** Asks the reason of a refused write (`useBlockOverride`) and sends it again with it. */
export function OverrideDialog<I>({
  override,
  onConfirm
}: {
  override: BlockOverride<I>
  onConfirm: (input: I, reason: string) => void
}) {
  const message = override.pending?.message ?? null
  const onCancel = override.clear
  const { t } = useTranslation()
  const [reason, setReason] = useState('')
  const [error, setError] = useState(false)
  return (
    <ResponsiveDialog
      open={message !== null}
      onOpenChange={(open) => {
        if (open) return
        setReason('')
        setError(false)
        onCancel()
      }}
      title={t('booking.override.title')}
      description={message ?? undefined}
      footer={
        <>
          <Button variant="outline" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="override-form" data-testid="override-confirm">
            {t('booking.override.confirm')}
          </Button>
        </>
      }
    >
      <form
        id="override-form"
        onSubmit={(e) => {
          e.preventDefault()
          if (reason.trim().length < 3) return setError(true)
          if (override.pending) onConfirm(override.pending.input, reason.trim())
          override.clear()
          setReason('')
          setError(false)
        }}
      >
        <OverrideReasonField value={reason} onChange={setReason} invalid={error} />
        {error ? (
          <p role="alert" className="text-destructive mt-1.5 text-xs">
            {t('booking.override.needReason')}
          </p>
        ) : null}
      </form>
    </ResponsiveDialog>
  )
}
