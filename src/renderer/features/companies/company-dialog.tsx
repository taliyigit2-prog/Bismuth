// New / edit company (G-191, S-72): title, address, city, tax office and number, phone, e-mail, IBAN, contact
// person, note, favourite. Entered once; every later invoice copies it.
import { useState } from 'react'
import { TriangleAlertIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { CompanyViewDto } from '@shared/contract/procedures/guests'
import { companyInputSchema } from '@shared/contract/guests'
import { limitsOf } from '@shared/contract/limits'
import { normalizeName } from '@shared/domain/normalize'
import { isPlausiblePhone } from '@shared/phone'
import { compactTaxNumber, isValidIban, isValidTurkishTaxNumber } from '@shared/domain/tax-id'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { ResponsiveDialog } from '@/components/responsive-dialog'
import { useAdminMutation } from '@/features/settings/use-admin'
import { useDebounced } from '@/features/ledger/use-debounced'
import { useApiQuery } from '@/lib/api/hooks'
import { COMPANY_READS } from './company-api'

const FIELDS = [
  'title',
  'address',
  'city',
  'taxOffice',
  'taxNumber',
  'phone',
  'email',
  'iban',
  'contactPerson'
] as const
type Field = (typeof FIELDS)[number]
const WIDE: ReadonlySet<Field> = new Set(['title', 'address'])
const LTR: ReadonlySet<Field> = new Set(['taxNumber', 'phone', 'email', 'iban'])
const LIMITS = limitsOf(companyInputSchema)
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const LABEL = {
  title: 'guests.company.form.title',
  address: 'guests.company.form.address',
  city: 'guests.company.form.city',
  taxOffice: 'guests.company.form.taxOffice',
  taxNumber: 'guests.company.form.taxNumber',
  phone: 'guests.company.form.phone',
  email: 'guests.company.form.email',
  iban: 'guests.company.form.iban',
  contactPerson: 'guests.company.form.contact'
} as const satisfies Record<Field, string>

export function CompanyDialog({
  open,
  onOpenChange,
  company,
  onSaved
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Editing this company; a new one when null. */
  company: CompanyViewDto | null
  onSaved?: (company: CompanyViewDto) => void
}) {
  const { t } = useTranslation()
  const [values, setValues] = useState<Record<Field, string>>(
    () => Object.fromEntries(FIELDS.map((k) => [k, company?.[k] ?? ''])) as Record<Field, string>
  )
  const [note, setNote] = useState(company?.note ?? '')
  const [favorite, setFavorite] = useState(company?.favorite ?? false)
  const [tried, setTried] = useState(false)
  const create = useAdminMutation('companies.create', {
    invalidate: COMPANY_READS,
    success: t('companies.toast.created')
  })
  const update = useAdminMutation('companies.update', {
    invalidate: COMPANY_READS,
    success: t('companies.toast.saved')
  })
  const iban = values.iban.replace(/\s/g, '').toUpperCase()
  const errors: Partial<Record<Field, string>> = {
    ...(values.title.trim() ? {} : { title: t('guests.form.required') }),
    // Same rules as the contract: IBAN check digits, tax number of 10 digits or a valid 11-digit number (QA3c1 #15).
    ...(iban && !isValidIban(iban) ? { iban: t('companies.form.ibanInvalid') } : {}),
    ...(values.taxNumber.trim() && !isValidTurkishTaxNumber(values.taxNumber)
      ? { taxNumber: t('companies.form.taxNumberInvalid') }
      : {}),
    // H-21: a phone is digits (with + ( ) - and spaces), not the word "telefon".
    ...(!isPlausiblePhone(values.phone) ? { phone: t('form.phone') } : {}),
    ...(values.email.trim() && !EMAIL.test(values.email.trim())
      ? { email: t('guests.form.emailInvalid') }
      : {})
  }
  const pending = create.isPending || update.isPending
  // The same title on another card is a warning, not a stop: two cards of one company are possible but rarely meant.
  const titleKey = normalizeName(values.title)
  const sameTitleQuery = useApiQuery(
    'companies.list',
    { q: useDebounced(values.title.trim()) },
    { enabled: open && titleKey.length >= 3 }
  )
  const sameTitle = (sameTitleQuery.data ?? []).find(
    (c) => c.id !== company?.id && normalizeName(c.title) === titleKey
  )
  // The same tax number on another card: also a warning (two cards of one company are rarely meant).
  const taxKey = compactTaxNumber(values.taxNumber)
  const sameTaxQuery = useApiQuery(
    'companies.list',
    { q: taxKey },
    { enabled: open && isValidTurkishTaxNumber(taxKey) }
  )
  const sameTax = (sameTaxQuery.data ?? []).find((c) => c.id !== company?.id && c.taxNumber === taxKey)
  const save = (): void => {
    setTried(true)
    if (Object.keys(errors).length || pending) return
    const data = { ...values, iban, note, favorite }
    const done = (saved: CompanyViewDto): void => {
      onOpenChange(false)
      onSaved?.(saved)
    }
    if (company) update.mutate({ id: company.id, patch: data }, { onSuccess: done })
    else create.mutate(data, { onSuccess: done })
  }
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={company ? t('companies.form.editTitle') : t('guests.company.form.heading')}
      description={t('guests.company.form.description')}
      className="sm:max-w-xl"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={save} disabled={pending} data-testid="company-save">
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form
        className="grid gap-4 sm:grid-cols-2"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
        data-testid="company-form"
      >
        {FIELDS.map((key) => {
          const error = tried ? errors[key] : undefined
          return (
            <div key={key} className={WIDE.has(key) ? 'grid gap-1.5 sm:col-span-2' : 'grid min-w-0 gap-1.5'}>
              <Label htmlFor={`company-${key}`}>{t(LABEL[key])}</Label>
              <Input
                id={`company-${key}`}
                value={values[key]}
                dir={LTR.has(key) ? 'ltr' : undefined}
                inputMode={key === 'taxNumber' ? 'numeric' : undefined}
                type={key === 'email' ? 'email' : key === 'phone' ? 'tel' : 'text'}
                onChange={(e) => setValues({ ...values, [key]: e.target.value })}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `company-${key}-error` : undefined}
                maxLength={LIMITS[key].maxLength}
                autoComplete="off"
                autoFocus={key === 'title'}
              />
              {error ? (
                <p id={`company-${key}-error`} className="text-destructive text-xs">
                  {error}
                </p>
              ) : null}
              {key === 'taxNumber' && sameTax ? (
                <p className="flex items-start gap-1.5 text-xs" role="status" data-testid="company-same-tax">
                  <TriangleAlertIcon className="text-warning size-3.5 shrink-0" aria-hidden />
                  {t('companies.form.sameTax', { title: sameTax.title })}
                </p>
              ) : null}
              {key === 'title' && sameTitle && values.title.trim() ? (
                <p
                  className="flex items-start gap-1.5 text-xs"
                  role="status"
                  data-testid="company-same-title"
                >
                  <TriangleAlertIcon className="text-warning size-3.5 shrink-0" aria-hidden />
                  {t('companies.form.sameTitle', { title: sameTitle.title })}
                </p>
              ) : null}
            </div>
          )
        })}
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="company-note">{t('guests.company.form.note')}</Label>
          <Textarea
            id="company-note"
            rows={2}
            value={note}
            maxLength={LIMITS.note.maxLength}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <Label
          htmlFor="company-favorite"
          className="flex min-h-11 items-center gap-3 rounded-lg border px-3 py-2 font-normal sm:col-span-2"
        >
          <span className="flex-1 text-sm font-medium">{t('guests.company.form.favorite')}</span>
          <Switch id="company-favorite" checked={favorite} onCheckedChange={setFavorite} />
        </Label>
        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </form>
    </ResponsiveDialog>
  )
}
