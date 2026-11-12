// Own password change (auth.changePassword): current password, new one twice. A wrong current password marks
// that field; anything else is a form-level error.
import { useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import * as z from 'zod'
import { useChangePassword } from '@/lib/session/session'
import { ApiError } from '@/lib/transport'
import { failureKey, newPasswordShape, requiredText, samePasswords } from './rules'

const changeForm = z
  .object({ currentPassword: requiredText, ...newPasswordShape })
  .refine(samePasswords, { path: ['repeat'], message: 'auth.validation.mismatch' })
  // A forced change is not passed by typing the given password again (the service refuses it too).
  .refine((v) => !v.currentPassword || v.newPassword !== v.currentPassword, {
    path: ['newPassword'],
    message: 'errors.samePassword'
  })
type ChangeValues = z.infer<typeof changeForm>

export function useChangePasswordForm(onSaved: () => void) {
  const change = useChangePassword()
  const [failure, setFailure] = useState<string | null>(null)
  const form = useForm<ChangeValues>({
    resolver: zodResolver(changeForm),
    defaultValues: { currentPassword: '', newPassword: '', repeat: '' }
  })
  const submit = form.handleSubmit(async (v) => {
    setFailure(null)
    try {
      await change.mutateAsync({ currentPassword: v.currentPassword, newPassword: v.newPassword })
      form.reset()
      onSaved()
    } catch (e) {
      if (e instanceof ApiError && e.messageKey === 'errors.wrongPassword')
        form.setError('currentPassword', { message: 'errors.wrongPassword' }, { shouldFocus: true })
      else if (e instanceof ApiError && e.messageKey === 'errors.samePassword')
        form.setError('newPassword', { message: 'errors.samePassword' }, { shouldFocus: true })
      else setFailure(failureKey(e))
    }
  })
  return { form, submit, failure, pending: change.isPending }
}
export type ChangePasswordFormState = ReturnType<typeof useChangePasswordForm>
