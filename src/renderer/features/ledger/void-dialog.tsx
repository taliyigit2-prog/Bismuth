// Void a payment or an expense (yasak 11: records are never deleted): a reason is required; the row stays, struck
// through, and counts nowhere. The service writes voided_at and the audit row with the reason.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ResponsiveDialog } from '@/components/responsive-dialog'

/** `subject` names the record ("₺2.800 · 302"); null keeps the dialog closed. */
export function VoidDialog({
  subject,
  onOpenChange,
  onConfirm,
  pending = false,
  texts
}: {
  subject: string | null
  onOpenChange: (open: boolean) => void
  onConfirm: (reason: string) => void
  pending?: boolean
  /** Another reasoned action with the same form (reopening a closed day). */
  texts?: { title: string; description: string; confirm: string }
}) {
  const { t } = useTranslation()
  const [reason, setReason] = useState('')
  const [tried, setTried] = useState(false)
  const short = reason.trim().length < 3
  const reset = (): void => {
    setReason('')
    setTried(false)
  }
  const save = (): void => {
    setTried(true)
    if (short || pending) return
    onConfirm(reason.trim())
    reset()
  }
  return (
    <ResponsiveDialog
      open={subject !== null}
      onOpenChange={(open) => {
        if (!open) reset()
        onOpenChange(open)
      }}
      title={texts?.title ?? t('ledger.void.title')}
      description={texts?.description ?? (subject ? t('ledger.void.description', { subject }) : undefined)}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="destructive"
            type="submit"
            form="ledger-void-form"
            disabled={pending}
            data-testid="void-confirm"
          >
            {texts?.confirm ?? t('ledger.void.confirm')}
          </Button>
        </>
      }
    >
      <form
        id="ledger-void-form"
        className="grid gap-1.5"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <Label htmlFor="void-reason">{t('ledger.void.reason')}</Label>
        <Textarea
          id="void-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              save()
            }
          }}
          aria-invalid={(tried && short) || undefined}
          aria-describedby="void-reason-hint"
          placeholder={t('ledger.void.placeholder')}
        />
        <p
          id="void-reason-hint"
          className={tried && short ? 'text-destructive text-xs' : 'text-muted-foreground text-xs'}
        >
          {tried && short ? t('ledger.void.tooShort') : t('ledger.void.hint')}
        </p>
      </form>
    </ResponsiveDialog>
  )
}
