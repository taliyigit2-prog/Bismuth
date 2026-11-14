// Add or edit a phone-book entry (G-160): name, category (a seeded one or the hotel's own label), several numbers
// each with a label ("cep", "iş", "WhatsApp"), e-mail, address, note, favourite. Numbers are typed as they are
// written ("0532 000 00 00", "444 0 444", "112"): no country code is forced on short service numbers.
// "Rehberden kaldır" switches the entry off; nothing is deleted.
import { useId, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { PlusIcon, XIcon } from 'lucide-react'
import {
  contactInputSchema,
  contactPhoneSchema,
  contactUpdateSchema,
  type ContactCategory
} from '@shared/contract/supply'
import { isPlausiblePhone } from '@shared/phone'
import { limitsOf } from '@shared/contract/limits'
import type { ContactView } from '@shared/contract/procedures/contacts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { FieldError } from '@/components/field-error'
import { ResponsiveDialog } from '@/components/responsive-dialog'
import { useFormErrors } from '@/lib/form-errors'
import { useAdminMutation } from '../settings/use-admin'
import { CATEGORIES } from './categories'

interface PhoneDraft {
  key: number
  label: string
  number: string
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
/** Lengths the service accepts (contract schema). */
const LIMIT = limitsOf(contactInputSchema)
const PHONE_LIMIT = limitsOf(contactPhoneSchema)

/** `contact` null = new entry. */
export function ContactDialog({
  contact,
  customLabels,
  onClose
}: {
  contact: ContactView | null
  customLabels: readonly string[]
  onClose: () => void
}) {
  const { t } = useTranslation()
  const formId = useId()
  const [name, setName] = useState(contact?.name ?? '')
  const [category, setCategory] = useState<ContactCategory>(contact?.category ?? 'supplier')
  const [custom, setCustom] = useState(contact?.customCategory ?? '')
  const [phones, setPhones] = useState<PhoneDraft[]>(
    contact?.phones.length
      ? contact.phones.map((p, i) => ({ key: i + 1, label: p.label, number: p.number }))
      : [{ key: 1, label: '', number: '' }]
  )
  const [email, setEmail] = useState(contact?.email ?? '')
  const [address, setAddress] = useState(contact?.address ?? '')
  const [note, setNote] = useState(contact?.note ?? '')
  const [favorite, setFavorite] = useState(contact?.favorite ?? false)
  const [tried, setTried] = useState(false)
  const form = useFormErrors()
  const invalidate = ['contacts.list', 'contacts.favorites'] as const
  const handled = form.handled
  const create = useAdminMutation('contacts.create', { invalidate, success: t('contacts.saved'), handled })
  const update = useAdminMutation('contacts.update', { invalidate, success: t('contacts.saved'), handled })
  const remove = useAdminMutation('contacts.setActive', {
    invalidate,
    success: t('contacts.removedToast', { name: contact?.name ?? '' })
  })
  const pending = create.isPending || update.isPending || remove.isPending

  const problems = {
    name: !name.trim(),
    custom: category === 'custom' && !custom.trim(),
    email: !!email.trim() && !EMAIL.test(email.trim()),
    phones: phones.map((p) => !!p.number.trim() && !isPlausiblePhone(p.number))
  }
  const invalid = problems.name || problems.custom || problems.email || problems.phones.some(Boolean)

  const submit = (e: FormEvent): void => {
    e.preventDefault()
    if (invalid) {
      setTried(true)
      return
    }
    const data = {
      name: name.trim(),
      category,
      customCategory: category === 'custom' ? custom.trim() : null,
      phones: phones
        .filter((p) => p.number.trim())
        .map((p) => ({ label: p.label.trim(), number: p.number.trim() })),
      email: email.trim() || null,
      address: address.trim() || null,
      note: note.trim() || null,
      favorite
    }
    if (!form.validate(contactInputSchema, data)) return
    if (contact) {
      form.sending(contactUpdateSchema, data)
      update.mutate({ id: contact.id, patch: data }, { onSuccess: onClose })
    } else {
      form.sending(contactInputSchema, data)
      create.mutate(data, { onSuccess: onClose })
    }
  }
  const setPhone = (key: number, patch: Partial<PhoneDraft>): void =>
    setPhones((list) => list.map((p) => (p.key === key ? { ...p, ...patch } : p)))

  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => (open ? null : onClose())}
      title={contact ? t('contacts.edit') : t('contacts.add')}
      description={t('contacts.dialogDescription')}
      className="sm:max-w-xl"
      footer={
        <>
          {contact?.active ? (
            <Button
              variant="ghost"
              className="text-destructive sm:me-auto"
              disabled={pending}
              onClick={() => remove.mutate({ id: contact.id, active: false }, { onSuccess: onClose })}
            >
              {t('contacts.remove')}
            </Button>
          ) : null}
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form={formId} disabled={pending} data-testid="contact-save">
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id={formId} noValidate className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor={`${formId}-name`}>{t('contacts.name')}</Label>
          <Input
            id={`${formId}-name`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('contacts.namePlaceholder')}
            maxLength={LIMIT.name.maxLength}
            aria-invalid={(tried && problems.name) || !!form.errors['name'] || undefined}
            autoComplete="off"
          />
          <FieldError message={tried && problems.name ? t('contacts.nameRequired') : form.errors['name']} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${formId}-category`}>{t('contacts.categoryLabel')}</Label>
          <Select value={category} onValueChange={(v) => setCategory(v as ContactCategory)}>
            <SelectTrigger id={`${formId}-category`} className="w-full" data-testid="contact-category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {t(`contacts.category.${c}`)}
                </SelectItem>
              ))}
              <SelectItem value="custom">{t('contacts.customCategory')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {category === 'custom' ? (
          <div className="grid gap-1.5">
            <Label htmlFor={`${formId}-custom`}>{t('contacts.customLabel')}</Label>
            <Input
              id={`${formId}-custom`}
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              list={`${formId}-labels`}
              placeholder={t('contacts.customPlaceholder')}
              maxLength={LIMIT.customCategory.maxLength}
              aria-invalid={(tried && problems.custom) || !!form.errors['customCategory'] || undefined}
              autoComplete="off"
            />
            <datalist id={`${formId}-labels`}>
              {customLabels.map((l) => (
                <option key={l} value={l} />
              ))}
            </datalist>
            <FieldError
              message={
                tried && problems.custom ? t('contacts.customRequired') : form.errors['customCategory']
              }
            />
          </div>
        ) : (
          <div className="max-sm:hidden" />
        )}

        <fieldset className="grid gap-2 sm:col-span-2">
          <legend className="mb-1.5 text-sm font-medium">{t('contacts.phones')}</legend>
          {phones.map((p, i) => (
            <div key={p.key} className="grid gap-1">
              <div className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)_auto] items-center gap-2">
                <Input
                  value={p.label}
                  onChange={(e) => setPhone(p.key, { label: e.target.value })}
                  placeholder={t('contacts.phoneLabelPlaceholder')}
                  maxLength={PHONE_LIMIT.label.maxLength}
                  counter={false}
                  aria-label={t('contacts.phoneLabel', { n: i + 1 })}
                  autoComplete="off"
                />
                <Input
                  type="tel"
                  inputMode="tel"
                  dir="ltr"
                  value={p.number}
                  onChange={(e) => setPhone(p.key, { number: e.target.value })}
                  placeholder={t('phone.placeholder')}
                  maxLength={PHONE_LIMIT.number.maxLength}
                  counter={false}
                  aria-label={t('contacts.phoneNumber', { n: i + 1 })}
                  aria-invalid={(tried && problems.phones[i]) || undefined}
                  className="tabular-nums"
                  autoComplete="off"
                />
                {phones.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t('contacts.removePhone', { n: i + 1 })}
                    onClick={() => setPhones((list) => list.filter((x) => x.key !== p.key))}
                  >
                    <XIcon />
                  </Button>
                ) : (
                  <span className="size-9" aria-hidden />
                )}
              </div>
              {tried && problems.phones[i] ? (
                <p className="text-destructive text-xs">{t('contacts.phoneInvalid')}</p>
              ) : null}
            </div>
          ))}
          {phones.length < 10 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="justify-self-start"
              onClick={() =>
                setPhones((list) => [
                  ...list,
                  { key: Math.max(0, ...list.map((x) => x.key)) + 1, label: '', number: '' }
                ])
              }
            >
              <PlusIcon aria-hidden />
              {t('contacts.addPhone')}
            </Button>
          ) : null}
        </fieldset>

        <div className="grid gap-1.5">
          <Label htmlFor={`${formId}-email`}>{t('contacts.email')}</Label>
          <Input
            id={`${formId}-email`}
            type="email"
            dir="ltr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={LIMIT.email.maxLength}
            aria-invalid={(tried && problems.email) || !!form.errors['email'] || undefined}
            autoComplete="off"
          />
          <FieldError message={tried && problems.email ? t('contacts.emailInvalid') : form.errors['email']} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${formId}-address`}>{t('contacts.address')}</Label>
          <Input
            id={`${formId}-address`}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            maxLength={LIMIT.address.maxLength}
            aria-invalid={!!form.errors['address'] || undefined}
          />
          <FieldError message={form.errors['address']} />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor={`${formId}-note`}>{t('common.note')}</Label>
          <Textarea
            id={`${formId}-note`}
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('contacts.notePlaceholder')}
            maxLength={LIMIT.note.maxLength}
            aria-invalid={!!form.errors['note'] || undefined}
          />
          <FieldError message={form.errors['note']} />
        </div>
        <Label
          htmlFor={`${formId}-fav`}
          className="flex min-h-11 items-center justify-between gap-3 rounded-lg border px-3 font-normal sm:col-span-2"
        >
          <span className="grid gap-0.5">
            <span className="text-sm font-medium">{t('contacts.favorite')}</span>
            <span className="text-muted-foreground text-xs">{t('contacts.favoriteHint')}</span>
          </span>
          <Switch id={`${formId}-fav`} checked={favorite} onCheckedChange={setFavorite} />
        </Label>
      </form>
    </ResponsiveDialog>
  )
}
