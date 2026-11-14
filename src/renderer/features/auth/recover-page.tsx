// Forgotten password (G-22): username + one unused recovery code sets a new password; every session of that account
// ends and its PIN is removed (auth service). Without a code the owner resets it (Ayarlar → Kullanıcılar).
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import * as z from 'zod'
import { ChevronLeftIcon, CircleCheckIcon, KeyRoundIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useApiMutation } from '@/lib/api/hooks'
import { ApiError } from '@/lib/transport'
import { AuthFrame } from './auth-frame'
import { PasswordInput } from './password-input'
import { Field, FormAlert } from './fields'
import { failureKey, newPasswordShape, requiredText, samePasswords, useFailureText } from './rules'

const recoverForm = z
  .object({ username: requiredText, code: requiredText, ...newPasswordShape })
  .refine(samePasswords, { path: ['repeat'], message: 'auth.validation.mismatch' })
type RecoverValues = z.infer<typeof recoverForm>

function BackToSignIn() {
  const { t } = useTranslation()
  return (
    <Button asChild variant="ghost" className="justify-self-start">
      <Link to="/login" data-testid="back-to-sign-in">
        <ChevronLeftIcon className="rtl:rotate-180" aria-hidden />
        {t('auth.backToSignIn')}
      </Link>
    </Button>
  )
}

export function RecoverPage() {
  const { t } = useTranslation()
  const recover = useApiMutation('auth.recover')
  const failureText = useFailureText()
  const [failure, setFailure] = useState<string | null>(null)
  const form = useForm<RecoverValues>({
    resolver: zodResolver(recoverForm),
    defaultValues: { username: '', code: '', newPassword: '', repeat: '' }
  })
  const errors = form.formState.errors

  const submit = form.handleSubmit(
    async (v) => {
      setFailure(null)
      try {
        await recover.mutateAsync({
          username: v.username.trim(),
          code: v.code.trim(),
          newPassword: v.newPassword
        })
      } catch (e) {
        if (e instanceof ApiError && e.messageKey === 'errors.samePassword') {
          form.setError('newPassword', { message: 'errors.samePassword' }, { shouldFocus: true })
          return
        }
        setFailure(
          e instanceof ApiError && e.messageKey === 'errors.invalidCredentials'
            ? 'auth.recover.invalid'
            : failureKey(e)
        )
      }
      // H-46: a new attempt that fails its own checks must not keep the last attempt's "wrong code" next to them.
    },
    () => setFailure(null)
  )

  if (recover.isSuccess)
    return (
      <AuthFrame>
        <Card data-testid="recover-done">
          <CardHeader>
            <CardTitle role="heading" aria-level={1} className="flex items-center gap-2">
              <CircleCheckIcon className="text-success size-4" aria-hidden />
              {t('auth.recover.doneTitle')}
            </CardTitle>
            <CardDescription>{t('auth.recover.doneBody')}</CardDescription>
          </CardHeader>
          <CardContent className="grid">
            <Button asChild>
              <Link to="/login" data-testid="recover-sign-in">
                {t('auth.signIn')}
              </Link>
            </Button>
          </CardContent>
        </Card>
      </AuthFrame>
    )

  return (
    <AuthFrame>
      <Card data-testid="recover">
        <CardHeader>
          <CardTitle role="heading" aria-level={1}>
            {t('auth.recover.title')}
          </CardTitle>
          <CardDescription>{t('auth.recover.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" noValidate onSubmit={(e) => void submit(e)}>
            <Field id="recover-username" label={t('auth.username')} error={errors.username?.message}>
              {(aria) => (
                <Input
                  {...aria}
                  autoFocus
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  dir="ltr"
                  maxLength={40}
                  {...form.register('username')}
                />
              )}
            </Field>
            <Field id="recover-code" label={t('auth.recover.code')} error={errors.code?.message}>
              {(aria) => (
                <Input
                  {...aria}
                  autoComplete="one-time-code"
                  autoCapitalize="characters"
                  spellCheck={false}
                  dir="ltr"
                  maxLength={64}
                  placeholder={t('auth.recover.codePlaceholder')}
                  className="font-mono"
                  {...form.register('code')}
                />
              )}
            </Field>
            <Field
              id="recover-new"
              label={t('auth.newPassword')}
              error={errors.newPassword?.message}
              help={t('auth.passwordRule')}
            >
              {(aria) => (
                <PasswordInput {...aria} autoComplete="new-password" {...form.register('newPassword')} />
              )}
            </Field>
            <Field id="recover-repeat" label={t('auth.repeatPassword')} error={errors.repeat?.message}>
              {(aria) => <PasswordInput {...aria} autoComplete="new-password" {...form.register('repeat')} />}
            </Field>
            {failure ? (
              <FormAlert testId="recover-error">
                <p>{failureText(failure)}</p>
              </FormAlert>
            ) : null}
            <Button type="submit" disabled={recover.isPending} data-testid="recover-submit">
              <KeyRoundIcon aria-hidden />
              {t('auth.recover.submit')}
            </Button>
            <p className="text-muted-foreground text-sm" data-testid="owner-reset-hint">
              {t('auth.recover.ownerHint')}
            </p>
            <BackToSignIn />
          </form>
        </CardContent>
      </Card>
    </AuthFrame>
  )
}
