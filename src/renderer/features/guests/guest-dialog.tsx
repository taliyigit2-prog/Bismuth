// New / edit guest (G-50, G-51, G-45). While the name, phone and document are typed the form asks the service
// for an existing card (same normalised name, phone or document) and for a blacklist entry (§6.9), so nobody is
// entered twice and an unwanted guest is caught at the desk. Identity fields only with `guests.identity` edit;
// nationality is optional and hidden until asked for (G-50). No birth date, parents' names or address (S-92).
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangleIcon, PlusIcon, UsersRoundIcon } from 'lucide-react'
import { ID_DOC_TYPES } from '@shared/contract/guests'
import type { GuestViewDto } from '@shared/contract/procedures/guests'
import { normalizeName } from '@shared/domain/normalize'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { PhoneField, parsePhone, type PhoneValue } from '@/components/phone-field'
import { ResponsiveDialog } from '@/components/responsive-dialog'
import { useFormat } from '@/hooks/use-format'
import { useApiQuery } from '@/lib/api/hooks'
import { useCan } from '@/lib/view-as'
import { useDebounced } from '@/features/calendar/booking-api'
import { useAdminMutation } from '@/features/settings/use-admin'
import { GUEST_READS, phoneText } from './guests-api'
import { useDisplayNames } from './use-names'

const LANGUAGES = ['tr', 'en', 'ru', 'de', 'ar', 'fr', 'fa', 'az'] as const
/** Common nationalities first; any ISO code can be typed by the importer, the list covers the desk. */
const NATIONALITIES = [
  'TR',
  'RU',
  'AZ',
  'IR',
  'DE',
  'GB',
  'UA',
  'KZ',
  'GE',
  'SA',
  'IQ',
  'FR',
  'NL',
  'US'
] as const
const NONE = '__none'
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** The longest name the duplicate and blacklist checks take (H-07): a longer typed name is checked by its start. */
const CANDIDATE_NAME_MAX = 160

export function GuestDialog({
  open,
  onOpenChange,
  guest,
  onSaved,
  onOpenGuest
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Editing this guest; a new card when null. */
  guest: GuestViewDto | null
  onSaved?: (guest: GuestViewDto) => void
  onOpenGuest: (guestId: string) => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const can = useCan()
  const names = useDisplayNames()
  const identity = can('guests.identity', 'edit')
  const [firstName, setFirstName] = useState(guest?.firstName ?? '')
  const [lastName, setLastName] = useState(guest?.lastName ?? '')
  const [phone, setPhone] = useState<PhoneValue>(parsePhone(guest?.phone))
  const [email, setEmail] = useState(guest?.email ?? '')
  const [language, setLanguage] = useState<string>(guest?.language ?? NONE)
  const [showNationality, setShowNationality] = useState(!!guest?.nationality)
  const [nationality, setNationality] = useState<string>(guest?.nationality ?? NONE)
  const [docType, setDocType] = useState<string>(guest?.idDocType ?? NONE)
  const [docNumber, setDocNumber] = useState(guest && !guest.identityMasked ? (guest.idDocNumber ?? '') : '')
  const [companyId, setCompanyId] = useState<string>(guest?.companyId ?? NONE)
  const [vip, setVip] = useState(guest?.vip ?? false)
  const [notes, setNotes] = useState(guest?.notes ?? '')
  const [tried, setTried] = useState(false)

  const fullName = `${firstName} ${lastName}`.trim()
  const phoneTyped = phoneText(phone)
  const candidate = useDebounced({
    name: fullName.slice(0, CANDIDATE_NAME_MAX),
    phone: phone.number.length >= 7 ? phoneTyped : null,
    idDocNumber: identity && docNumber.trim().length >= 5 ? docNumber.trim() : null,
    ...(guest ? { excludeId: guest.id } : {})
  })
  const enoughToCheck =
    normalizeName(candidate.name).length >= 5 || !!candidate.phone || !!candidate.idDocNumber
  // G-51: an existing card with the same name, phone or document; G-45: a blacklist entry.
  const duplicates = useApiQuery('guests.duplicates', candidate, {
    enabled: open && enoughToCheck && !guest
  })
  const blacklist = useApiQuery(
    'blacklist.check',
    { name: candidate.name, phone: candidate.phone, idDocNumber: candidate.idDocNumber },
    { enabled: open && enoughToCheck }
  )
  const companies = useApiQuery('companies.list', {}, { enabled: open && can('companies') })

  const create = useAdminMutation('guests.create', {
    invalidate: GUEST_READS,
    success: t('guests.toast.created')
  })
  const update = useAdminMutation('guests.update', {
    invalidate: GUEST_READS,
    success: t('guests.toast.saved')
  })
  const pending = create.isPending || update.isPending

  const errors = {
    firstName: !firstName.trim(),
    email: !!email.trim() && !EMAIL.test(email.trim()),
    docType: identity && !!docNumber.trim() && docType === NONE
  }
  const bad = {
    firstName: tried && errors.firstName,
    email: tried && errors.email,
    docType: tried && errors.docType
  }
  const save = (): void => {
    setTried(true)
    if (errors.firstName || errors.email || errors.docType || pending) return
    const data = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: phoneTyped,
      email: email.trim(),
      language: language === NONE ? '' : language,
      nationality: nationality === NONE ? '' : nationality,
      vip,
      notes,
      ...(can('companies') ? { companyId: companyId === NONE ? null : companyId } : {}),
      ...(identity
        ? {
            idDocType: docType === NONE ? null : (docType as (typeof ID_DOC_TYPES)[number]),
            idDocNumber: docNumber
          }
        : {})
    }
    const done = (saved: GuestViewDto): void => {
      onOpenChange(false)
      onSaved?.(saved)
    }
    if (guest) {
      // An identity number the user cannot see (masked) is not sent back.
      const patch = guest.identityMasked
        ? Object.fromEntries(Object.entries(data).filter(([k]) => k !== 'idDocNumber' && k !== 'idDocType'))
        : data
      update.mutate({ id: guest.id, patch }, { onSuccess: done })
    } else create.mutate({ ...data, standingNoteLevel: 'info' }, { onSuccess: done })
  }

  const hits = enoughToCheck ? (blacklist.data ?? []) : []
  const same = enoughToCheck && !guest ? (duplicates.data ?? []).slice(0, 3) : []

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={guest ? t('guests.form.editTitle') : t('guests.form.newTitle')}
      description={t('guests.form.descriptionReal')}
      className="sm:max-w-xl"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={save} disabled={pending} data-testid="guest-save">
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
        data-testid="guest-form"
      >
        <div className="grid gap-1.5">
          <Label htmlFor="guest-first">{t('guests.form.firstName')}</Label>
          <Input
            id="guest-first"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            aria-invalid={bad.firstName || undefined}
            aria-describedby={bad.firstName ? 'guest-first-error' : undefined}
            autoComplete="off"
            autoFocus
          />
          {bad.firstName ? (
            <p id="guest-first-error" className="text-destructive text-xs">
              {t('guests.form.required')}
            </p>
          ) : null}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="guest-last">{t('guests.form.lastName')}</Label>
          <Input
            id="guest-last"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            autoComplete="off"
          />
        </div>

        {hits.length ? (
          <Alert variant="destructive" className="sm:col-span-2" data-testid="guest-form-blacklist">
            <AlertTriangleIcon />
            <AlertTitle>{t('guests.form.blacklistHit')}</AlertTitle>
            <AlertDescription>
              {hits.map((hit) => (
                <p key={hit.entryId}>
                  <span className="font-semibold">{hit.name}</span>
                  {' · '}
                  {hit.reasons.map((r) => t(`booking.blacklist.reason.${r}`)).join(', ')}
                  {hit.reasonText ? `: ${hit.reasonText}` : ''}
                </p>
              ))}
            </AlertDescription>
          </Alert>
        ) : null}
        {same.length ? (
          <Alert className="border-info/50 sm:col-span-2" data-testid="guest-form-duplicates">
            <UsersRoundIcon />
            <AlertTitle>{t('guests.form.maybeSame')}</AlertTitle>
            <AlertDescription>
              <ul className="grid w-full gap-1">
                {same.map(({ guest: g, reasons }) => (
                  <li key={g.id} className="flex flex-wrap items-center gap-x-2">
                    <span className="text-foreground font-medium">
                      {`${g.firstName} ${g.lastName}`.trim()}
                    </span>
                    <span className="text-xs">
                      {reasons.map((r) => t(`guests.dup.reason.${r}`)).join(', ')}
                    </span>
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="ms-auto h-auto px-0"
                      onClick={() => {
                        onOpenChange(false)
                        onOpenGuest(g.id)
                      }}
                    >
                      {t('guests.form.openCard')}
                    </Button>
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="sm:col-span-2">
          <PhoneField label={t('guests.form.phone')} value={phone} onChange={setPhone} />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="guest-email">{t('guests.form.email')}</Label>
          <Input
            id="guest-email"
            type="email"
            dir="ltr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={bad.email || undefined}
            aria-describedby={bad.email ? 'guest-email-error' : undefined}
            autoComplete="off"
          />
          {bad.email ? (
            <p id="guest-email-error" className="text-destructive text-xs">
              {t('guests.form.emailInvalid')}
            </p>
          ) : null}
        </div>
        {identity ? (
          <>
            <div className="grid gap-1.5">
              <Label htmlFor="guest-doc-type">{t('guests.form.docType')}</Label>
              <Select value={docType} onValueChange={setDocType}>
                <SelectTrigger
                  id="guest-doc-type"
                  className="w-full"
                  aria-invalid={bad.docType || undefined}
                  aria-describedby={bad.docType ? 'guest-doc-error' : undefined}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{t('guests.form.notSet')}</SelectItem>
                  {ID_DOC_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {t(`guests.docType.${type}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {bad.docType ? (
                <p id="guest-doc-error" className="text-destructive text-xs">
                  {t('guests.form.docTypeNeeded')}
                </p>
              ) : null}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="guest-doc">{t('guests.form.docNumber')}</Label>
              <Input
                id="guest-doc"
                dir="ltr"
                value={docNumber}
                placeholder={guest?.identityMasked ? (guest.idDocNumber ?? '') : undefined}
                onChange={(e) => setDocNumber(e.target.value)}
                autoComplete="off"
              />
            </div>
          </>
        ) : null}
        <div className="grid gap-1.5">
          <Label htmlFor="guest-language">{t('guests.form.language')}</Label>
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger id="guest-language" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{t('guests.form.notSet')}</SelectItem>
              {LANGUAGES.map((code) => (
                <SelectItem key={code} value={code}>
                  {names.language(code)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {showNationality ? (
          <div className="grid gap-1.5">
            <Label htmlFor="guest-nationality">{t('guests.form.nationality')}</Label>
            <Select value={nationality} onValueChange={setNationality}>
              <SelectTrigger id="guest-nationality" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t('guests.form.notSet')}</SelectItem>
                {[...new Set([...NATIONALITIES, ...(guest?.nationality ? [guest.nationality] : [])])]
                  .sort((a, b) => f.compare(names.region(a), names.region(b)))
                  .map((code) => (
                    <SelectItem key={code} value={code}>
                      {names.region(code)}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="grid content-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="justify-self-start"
              onClick={() => setShowNationality(true)}
            >
              <PlusIcon aria-hidden />
              {t('guests.form.addNationality')}
            </Button>
          </div>
        )}
        {can('companies') ? (
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="guest-company">{t('guests.form.company')}</Label>
            <Select value={companyId} onValueChange={setCompanyId}>
              <SelectTrigger id="guest-company" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t('guests.form.noCompany')}</SelectItem>
                {(companies.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        <Label
          htmlFor="guest-vip"
          className="flex min-h-11 items-center gap-3 rounded-lg border px-3 py-2 font-normal sm:col-span-2"
        >
          <span className="grid flex-1 gap-0.5">
            <span className="text-sm font-medium">{t('guests.form.vip')}</span>
            <span className="text-muted-foreground text-xs">{t('guests.form.vipHint')}</span>
          </span>
          <Switch id="guest-vip" checked={vip} onCheckedChange={setVip} />
        </Label>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="guest-notes">{t('guests.form.notes')}</Label>
          <Textarea
            id="guest-notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t('guests.form.notesPlaceholder')}
          />
        </div>
        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </form>
    </ResponsiveDialog>
  )
}
