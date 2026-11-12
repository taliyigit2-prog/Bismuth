// Step 11 — the owner account (G-20, G-22): display name, username, password twice (8+ characters) and an
// optional PIN for quick unlock (4–8 digits, not an easy one). Passwords are never kept in the saved progress.
import { useTranslation } from 'react-i18next'
import { KeyRoundIcon } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { describe } from './aria'
import { ids, type WizardDraft } from './draft'
import { Field, SecretInput } from './fields'
import type { StepProps } from './step-props'

export function OwnerStep({ draft, update, errors }: StepProps) {
  const { t } = useTranslation()
  const o = draft.owner
  const set = (patch: Partial<WizardDraft['owner']>): void =>
    update((d) => ({ ...d, owner: { ...d.owner, ...patch } }))
  return (
    <div className="grid gap-5">
      <div className="grid items-start gap-x-4 gap-y-5 sm:grid-cols-2">
        <Field
          id={ids.ownerName}
          label={t('setup.owner.name')}
          errors={errors}
          hint={t('setup.owner.nameHint')}
        >
          <Input
            id={ids.ownerName}
            value={o.displayName}
            maxLength={80}
            autoComplete="name"
            onChange={(e) => set({ displayName: e.target.value })}
            data-testid={ids.ownerName}
            {...describe(ids.ownerName, errors, true)}
          />
        </Field>
        <Field
          id={ids.ownerUsername}
          label={t('setup.owner.username')}
          errors={errors}
          hint={t('setup.owner.usernameHint')}
        >
          <Input
            id={ids.ownerUsername}
            value={o.username}
            maxLength={40}
            dir="ltr"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            onChange={(e) => set({ username: e.target.value })}
            data-testid={ids.ownerUsername}
            {...describe(ids.ownerUsername, errors, true)}
          />
        </Field>
        <Field
          id={ids.ownerPassword}
          label={t('setup.owner.password')}
          errors={errors}
          hint={t('setup.owner.passwordHint')}
        >
          <SecretInput
            id={ids.ownerPassword}
            value={o.password}
            onChange={(password) => set({ password })}
            autoComplete="new-password"
            aria={describe(ids.ownerPassword, errors, true)}
          />
        </Field>
        <Field id={ids.ownerRepeat} label={t('setup.owner.repeat')} errors={errors}>
          <SecretInput
            id={ids.ownerRepeat}
            value={o.repeat}
            onChange={(repeat) => set({ repeat })}
            autoComplete="new-password"
            aria={describe(ids.ownerRepeat, errors)}
          />
        </Field>
        <Field id={ids.ownerPin} label={t('setup.owner.pin')} errors={errors} hint={t('setup.owner.pinHint')}>
          <SecretInput
            id={ids.ownerPin}
            value={o.pin}
            onChange={(pin) => set({ pin })}
            autoComplete="off"
            numeric
            maxLength={8}
            aria={describe(ids.ownerPin, errors, true)}
          />
        </Field>
      </div>
      <div className="text-muted-foreground grid gap-1.5 text-xs">
        <p>{t('setup.owner.hint')}</p>
        <p>{t('setup.secretsNotSaved')}</p>
        <p className="flex items-start gap-2">
          <KeyRoundIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {t('setup.owner.recoveryNote')}
        </p>
      </div>
    </div>
  )
}
