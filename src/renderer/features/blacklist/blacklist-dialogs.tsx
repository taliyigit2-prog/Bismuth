// Add to the blacklist and remove from it (G-52, faz-06 madde 5). Added from a guest card (name, phone and
// document come from the card) or on its own. Removing never deletes: the entry is deactivated with a reason and
// the audit log keeps who did it (G-24, yasak 11); only Sahip/Müdür remove (`blacklist.remove`).
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { localDateOf, type LocalDate } from '@shared/date'
import { BLACKLIST_SEVERITIES } from '@shared/contract/guests'
import type { BlacklistEntryDto } from '@shared/contract/procedures/guests'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { DateInput } from '@/components/date-input'
import { PhoneField, type PhoneValue } from '@/components/phone-field'
import { ResponsiveDialog } from '@/components/responsive-dialog'
import { useFormat } from '@/hooks/use-format'
import { useCan } from '@/lib/view-as'
import { useAdminMutation } from '@/features/settings/use-admin'
import { GUEST_READS, phoneText } from '@/features/guests/guests-api'
import {
  BLACKLIST_NAME_MAX,
  BLACKLIST_REASON_MAX,
  BLACKLIST_REMOVE_MAX
} from '@/features/calendar/booking-limits'
import { REASON_CODES } from './reasons'
import { SeverityBadge } from './severity-badge'

type Severity = (typeof BLACKLIST_SEVERITIES)[number]

export function AddDialog({
  open,
  onOpenChange,
  guest
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Added from a guest card: the service copies the card's name, phone and document. */
  guest?: { id: string; name: string } | null
}) {
  const { t } = useTranslation()
  const can = useCan()
  const today = localDateOf(new Date())
  const [name, setName] = useState('')
  const [phone, setPhone] = useState<PhoneValue>({ code: '90', number: '' })
  const [doc, setDoc] = useState('')
  const [severity, setSeverity] = useState<Severity>('warn')
  const [reasonCode, setReasonCode] = useState<string>('other')
  const [reason, setReason] = useState('')
  const [day, setDay] = useState<LocalDate>(today)
  const [tried, setTried] = useState(false)
  const add = useAdminMutation('blacklist.add', {
    invalidate: GUEST_READS,
    success: t('blacklist.toast.added')
  })
  const missing = { name: tried && !guest && !name.trim(), reason: tried && !reason.trim() }
  const save = (): void => {
    setTried(true)
    if ((!guest && !name.trim()) || !reason.trim() || add.isPending) return
    add.mutate(
      {
        guestId: guest?.id ?? null,
        name: guest ? undefined : name.trim(),
        phone: !guest && phone.number ? phoneText(phone) || null : null,
        idDocNumber: !guest && doc.trim() ? doc.trim() : null,
        severity,
        reasonCode,
        reasonText: reason.trim(),
        incidentDate: day
      },
      { onSuccess: () => onOpenChange(false) }
    )
  }
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('blacklist.form.title')}
      description={t(guest ? 'blacklist.form.descriptionGuest' : 'blacklist.form.description')}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={save} disabled={add.isPending} data-testid="blacklist-save">
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form
        className="grid gap-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
        data-testid="blacklist-form"
      >
        {guest ? (
          <p className="bg-muted/50 rounded-lg p-3 text-sm font-semibold">{guest.name}</p>
        ) : (
          <>
            <div className="grid gap-1.5">
              <Label htmlFor="bl-name">{t('blacklist.form.name')}</Label>
              <Input
                id="bl-name"
                value={name}
                maxLength={BLACKLIST_NAME_MAX}
                onChange={(e) => setName(e.target.value)}
                aria-invalid={missing.name || undefined}
                aria-describedby={missing.name ? 'bl-name-error' : undefined}
                autoComplete="off"
                autoFocus
              />
              {missing.name ? (
                <p id="bl-name-error" className="text-destructive text-xs">
                  {t('blacklist.form.required')}
                </p>
              ) : null}
            </div>
            <PhoneField label={t('blacklist.form.phone')} value={phone} onChange={setPhone} />
            {can('guests.identity', 'edit') ? (
              <div className="grid gap-1.5">
                <Label htmlFor="bl-doc">{t('blacklist.form.doc')}</Label>
                <Input
                  id="bl-doc"
                  dir="ltr"
                  value={doc}
                  onChange={(e) => setDoc(e.target.value)}
                  autoComplete="off"
                />
              </div>
            ) : null}
          </>
        )}
        <fieldset className="grid gap-1.5">
          <legend className="mb-1.5 text-sm font-medium">{t('blacklist.form.severity')}</legend>
          <RadioGroup
            value={severity}
            onValueChange={(v) => setSeverity(v as Severity)}
            className="grid gap-2 sm:grid-cols-2"
          >
            {BLACKLIST_SEVERITIES.map((key) => (
              <Label
                key={key}
                htmlFor={`bl-sev-${key}`}
                className="has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-accent/60 flex cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal"
              >
                <RadioGroupItem id={`bl-sev-${key}`} value={key} className="mt-0.5" />
                <span className="grid gap-1">
                  <SeverityBadge severity={key} />
                  <span className="text-muted-foreground text-xs leading-snug">
                    {t(`blacklist.severityHint.${key}`)}
                  </span>
                </span>
              </Label>
            ))}
          </RadioGroup>
        </fieldset>
        <div className="grid gap-1.5">
          <Label htmlFor="bl-code">{t('blacklist.form.reasonCode')}</Label>
          <Select value={reasonCode} onValueChange={setReasonCode}>
            <SelectTrigger id="bl-code" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REASON_CODES.map((code) => (
                <SelectItem key={code} value={code}>
                  {t(`blacklist.reasonCode.${code}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="bl-reason">{t('blacklist.form.reason')}</Label>
          <Textarea
            id="bl-reason"
            rows={2}
            value={reason}
            maxLength={BLACKLIST_REASON_MAX}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('blacklist.form.reasonPlaceholder')}
            aria-invalid={missing.reason || undefined}
            aria-describedby={missing.reason ? 'bl-reason-error' : undefined}
          />
          {missing.reason ? (
            <p id="bl-reason-error" className="text-destructive text-xs">
              {t('blacklist.form.required')}
            </p>
          ) : null}
        </div>
        <DateInput label={t('blacklist.form.date')} value={day} onChange={setDay} max={today} />
        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </form>
    </ResponsiveDialog>
  )
}

export function RemoveDialog({
  entry,
  onOpenChange
}: {
  entry: BlacklistEntryDto | null
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const [reason, setReason] = useState('')
  const [tried, setTried] = useState(false)
  const remove = useAdminMutation('blacklist.remove', {
    invalidate: GUEST_READS,
    success: t('blacklist.toast.removed')
  })
  const missing = tried && !reason.trim()
  const save = (): void => {
    setTried(true)
    if (!entry || !reason.trim() || remove.isPending) return
    remove.mutate({ id: entry.id, reason: reason.trim() }, { onSuccess: () => onOpenChange(false) })
  }
  return (
    <ResponsiveDialog
      open={!!entry}
      onOpenChange={onOpenChange}
      title={t('blacklist.removeDialog.title')}
      description={t('blacklist.removeDialog.description')}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button variant="destructive" onClick={save} disabled={remove.isPending}>
            {t('blacklist.removeDialog.confirm')}
          </Button>
        </>
      }
    >
      {entry ? (
        <form
          className="grid gap-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            save()
          }}
          data-testid="blacklist-remove-form"
        >
          <div className="bg-muted/50 grid gap-1 rounded-lg p-3 text-sm">
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{entry.name}</span>
              <SeverityBadge severity={entry.severity} />
            </p>
            <p>{entry.reasonText}</p>
            <p className="text-muted-foreground text-xs">
              {t('blacklist.addedOn', { date: f.date(localDateOf(new Date(entry.createdAt)), 'medium') })}
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="bl-remove-reason">{t('blacklist.removeDialog.reason')}</Label>
            <Textarea
              id="bl-remove-reason"
              rows={2}
              value={reason}
              maxLength={BLACKLIST_REMOVE_MAX}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('blacklist.removeDialog.reasonPlaceholder')}
              aria-invalid={missing || undefined}
              aria-describedby={missing ? 'bl-remove-error' : undefined}
              autoFocus
            />
            {missing ? (
              <p id="bl-remove-error" className="text-destructive text-xs">
                {t('blacklist.form.required')}
              </p>
            ) : null}
          </div>
        </form>
      ) : null}
    </ResponsiveDialog>
  )
}
