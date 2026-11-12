// The account menu's dialogs (G-22): own password, own PIN (quick switch and unlock) and new recovery codes.
// Each asks for the current password: an open window alone is not enough to change how one signs in.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import * as z from 'zod'
import { TriangleAlertIcon } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { CopyButton } from '@/components/copy-button'
import { ResponsiveDialog } from '@/components/responsive-dialog'
import { useApiMutation } from '@/lib/api/hooks'
import { useSetPin } from '@/lib/session/session'
import { ApiError } from '@/lib/transport'
import { PasswordInput } from './password-input'
import { ChangePasswordFields } from './change-password-form'
import { useChangePasswordForm } from './use-change-password-form'
import { Field, FormAlert } from './fields'
import { failureKey, pinText, requiredText, useFailureText } from './rules'

interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ChangePasswordDialog({ open, onOpenChange }: DialogProps) {
  const { t } = useTranslation()
  const state = useChangePasswordForm(() => {
    toast.success(t('userMenu.passwordSaved'))
    onOpenChange(false)
  })
  const close = (next: boolean): void => {
    if (!next) state.form.reset()
    onOpenChange(next)
  }
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={close}
      title={t('userMenu.changePassword')}
      description={t('userMenu.passwordDescription')}
      footer={
        <DialogButtons
          formId="password-form"
          pending={state.pending}
          label={t('common.save')}
          onCancel={() => close(false)}
        />
      }
    >
      <form id="password-form" noValidate onSubmit={(e) => void state.submit(e)}>
        <ChangePasswordFields id="password-form" state={state} currentLabel={t('auth.currentPassword')} />
      </form>
    </ResponsiveDialog>
  )
}

function DialogButtons({
  formId,
  pending,
  label,
  onCancel
}: {
  formId: string
  pending: boolean
  label: string
  onCancel: () => void
}) {
  const { t } = useTranslation()
  return (
    <>
      <Button type="button" variant="outline" onClick={onCancel}>
        {t('common.cancel')}
      </Button>
      <Button type="submit" form={formId} disabled={pending} data-testid={`${formId}-submit`}>
        {label}
      </Button>
    </>
  )
}

const pinForm = z
  .object({ currentPassword: requiredText, pin: pinText, repeat: z.string() })
  .refine((v) => v.pin === v.repeat, { path: ['repeat'], message: 'auth.validation.pinMismatch' })
type PinValues = z.infer<typeof pinForm>

export function PinDialog({ open, onOpenChange, hasPin }: DialogProps & { hasPin: boolean }) {
  const { t } = useTranslation()
  const setPin = useSetPin()
  const failureText = useFailureText()
  const [failure, setFailure] = useState<string | null>(null)
  const form = useForm<PinValues>({
    resolver: zodResolver(pinForm),
    defaultValues: { currentPassword: '', pin: '', repeat: '' }
  })
  const errors = form.formState.errors
  const close = (next: boolean): void => {
    if (!next) {
      form.reset()
      setFailure(null)
    }
    onOpenChange(next)
  }
  const submit = form.handleSubmit(async (v) => {
    setFailure(null)
    try {
      await setPin.mutateAsync({ currentPassword: v.currentPassword, pin: v.pin })
      toast.success(t('userMenu.pinSaved'))
      close(false)
    } catch (e) {
      if (e instanceof ApiError && e.messageKey === 'errors.wrongPassword')
        form.setError('currentPassword', { message: 'errors.wrongPassword' }, { shouldFocus: true })
      // The format is checked here; what the service still refuses is a PIN too easy to guess.
      else if (e instanceof ApiError && e.code === 'VALIDATION')
        form.setError('pin', { message: 'auth.validation.pinWeak' }, { shouldFocus: true })
      else setFailure(failureKey(e))
    }
  })
  const title = hasPin ? t('userMenu.changePin') : t('userMenu.setPin')
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={close}
      title={title}
      description={t('userMenu.pinDescription')}
      footer={
        <DialogButtons
          formId="pin-form"
          pending={setPin.isPending}
          label={t('common.save')}
          onCancel={() => close(false)}
        />
      }
    >
      <form id="pin-form" className="grid gap-4" noValidate onSubmit={(e) => void submit(e)}>
        <Field id="pin-current" label={t('userMenu.confirmPassword')} error={errors.currentPassword?.message}>
          {(aria) => (
            <PasswordInput
              {...aria}
              autoFocus
              autoComplete="current-password"
              data-testid="pin-current"
              {...form.register('currentPassword')}
            />
          )}
        </Field>
        <Field
          id="pin-new"
          label={t('userMenu.pin')}
          error={errors.pin?.message}
          help={t('userMenu.pinRule')}
        >
          {(aria) => (
            <PasswordInput {...aria} pin autoComplete="off" data-testid="pin-new" {...form.register('pin')} />
          )}
        </Field>
        <Field id="pin-repeat" label={t('userMenu.pinRepeat')} error={errors.repeat?.message}>
          {(aria) => (
            <PasswordInput
              {...aria}
              pin
              autoComplete="off"
              data-testid="pin-repeat"
              {...form.register('repeat')}
            />
          )}
        </Field>
        {failure ? (
          <FormAlert>
            <p>{failureText(failure)}</p>
          </FormAlert>
        ) : null}
      </form>
    </ResponsiveDialog>
  )
}

const codesForm = z.object({ currentPassword: requiredText })

export function RecoveryCodesDialog({ open, onOpenChange }: DialogProps) {
  const { t } = useTranslation()
  const renew = useApiMutation('auth.newRecoveryCodes')
  const failureText = useFailureText()
  const [failure, setFailure] = useState<string | null>(null)
  const form = useForm<z.infer<typeof codesForm>>({
    resolver: zodResolver(codesForm),
    defaultValues: { currentPassword: '' }
  })
  const errors = form.formState.errors
  const codes = renew.data?.codes ?? null
  const close = (next: boolean): void => {
    if (!next) {
      // The codes are shown once: closing forgets them.
      form.reset()
      renew.reset()
      setFailure(null)
    }
    onOpenChange(next)
  }
  const submit = form.handleSubmit(async (v) => {
    setFailure(null)
    try {
      await renew.mutateAsync({ currentPassword: v.currentPassword })
    } catch (e) {
      if (e instanceof ApiError && e.messageKey === 'errors.wrongPassword')
        form.setError('currentPassword', { message: 'errors.wrongPassword' }, { shouldFocus: true })
      else setFailure(failureKey(e))
    }
  })
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={close}
      title={t('userMenu.recoveryCodes')}
      description={codes ? undefined : t('userMenu.codesDescription')}
      footer={
        codes ? (
          <>
            <CopyButton text={codes.join('\n')} label={t('userMenu.copyCodes')} size="sm" />
            <Button type="button" onClick={() => close(false)} data-testid="codes-done">
              {t('userMenu.done')}
            </Button>
          </>
        ) : (
          <DialogButtons
            formId="codes-form"
            pending={renew.isPending}
            label={t('userMenu.codesSubmit')}
            onCancel={() => close(false)}
          />
        )
      }
    >
      {codes ? (
        <div className="grid gap-4">
          <Alert className="border-warning/60">
            <TriangleAlertIcon aria-hidden />
            <AlertDescription className="text-foreground">{t('userMenu.codesOnce')}</AlertDescription>
          </Alert>
          <ol
            className="grid grid-cols-1 gap-2 font-mono text-sm sm:grid-cols-2"
            dir="ltr"
            data-testid="recovery-codes"
          >
            {codes.map((code) => (
              <li key={code} className="bg-muted rounded-md px-3 py-2 text-center tabular-nums select-all">
                {code}
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <form id="codes-form" className="grid gap-4" noValidate onSubmit={(e) => void submit(e)}>
          <Field
            id="codes-current"
            label={t('userMenu.confirmPassword')}
            error={errors.currentPassword?.message}
          >
            {(aria) => (
              <PasswordInput
                {...aria}
                autoFocus
                autoComplete="current-password"
                data-testid="codes-current"
                {...form.register('currentPassword')}
              />
            )}
          </Field>
          {failure ? (
            <FormAlert>
              <p>{failureText(failure)}</p>
            </FormAlert>
          ) : null}
        </form>
      )}
    </ResponsiveDialog>
  )
}
