// Own password change fields, used by the forced screen (a password someone else set) and the account menu's
// dialog; the form state lives in use-change-password-form.ts.
import { useTranslation } from 'react-i18next'
import { PasswordInput } from './password-input'
import { Field, FormAlert } from './fields'
import { useFailureText } from './rules'
import type { ChangePasswordFormState } from './use-change-password-form'

/** The three fields; the submit button is the caller's (inside the form, or a dialog footer with `form={id}`). */
export function ChangePasswordFields({
  id,
  state,
  currentLabel,
  autoFocus = true
}: {
  id: string
  state: ChangePasswordFormState
  currentLabel: string
  autoFocus?: boolean
}) {
  const { t } = useTranslation()
  const failureText = useFailureText()
  const { form, failure } = state
  const errors = form.formState.errors
  return (
    <div className="grid gap-4">
      <Field id={`${id}-current`} label={currentLabel} error={errors.currentPassword?.message}>
        {(aria) => (
          <PasswordInput
            {...aria}
            autoFocus={autoFocus}
            autoComplete="current-password"
            data-testid="current-password"
            {...form.register('currentPassword')}
          />
        )}
      </Field>
      <Field
        id={`${id}-new`}
        label={t('auth.newPassword')}
        error={errors.newPassword?.message}
        help={t('auth.passwordRule')}
      >
        {(aria) => (
          <PasswordInput
            {...aria}
            autoComplete="new-password"
            data-testid="new-password"
            {...form.register('newPassword')}
          />
        )}
      </Field>
      <Field id={`${id}-repeat`} label={t('auth.repeatPassword')} error={errors.repeat?.message}>
        {(aria) => (
          <PasswordInput
            {...aria}
            autoComplete="new-password"
            data-testid="repeat-password"
            {...form.register('repeat')}
          />
        )}
      </Field>
      {failure ? (
        <FormAlert testId="change-password-error">
          <p>{failureText(failure)}</p>
        </FormAlert>
      ) : null}
    </div>
  )
}
