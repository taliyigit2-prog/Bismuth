// Writing into a closed business day (G-72): with `ledger.locked` the form asks for a reason (it goes to the audit
// log); without it the day is locked for this person and the form says so instead of offering a field that would
// always be refused (P7fix B26).
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { LockIcon } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCan } from '@/lib/view-as'

/** Whether this person may write into a closed day (with a reason). */
export function useMayWriteClosedDay(): boolean {
  const can = useCan()
  return can('ledger.locked', 'edit')
}

export function ClosedDayReason({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { t } = useTranslation()
  const id = useId()
  const allowed = useMayWriteClosedDay()
  if (!allowed)
    return (
      <p
        className="bg-muted flex items-start gap-2 rounded-md px-3 py-2 text-sm"
        data-testid="closed-day-locked"
      >
        <LockIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>{t('ledger.closed.lockedHint')}</span>
      </p>
    )
  return (
    <div className="grid gap-1.5" data-testid="closed-day-reason">
      <Label htmlFor={id}>{t('ledger.closed.reason')}</Label>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} maxLength={200} />
      <p className="text-muted-foreground text-xs">{t('ledger.closed.reasonHint')}</p>
    </div>
  )
}
