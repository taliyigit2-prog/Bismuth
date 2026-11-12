// Rules of the sign-in, recovery and password forms, with i18n keys as messages (the same limits as the contract:
// password 8+ characters, PIN 4–8 digits), and how a refused call is shown.
import { useTranslation } from 'react-i18next'
import * as z from 'zod'
import { useFormat } from '@/hooks/use-format'
import { isSessionError } from '@/lib/session/query-client'
import { ApiError } from '@/lib/transport'

/** zod messages are i18n keys of these: */
export type AuthMessageKey =
  | 'auth.validation.required'
  | 'auth.validation.passwordShort'
  | 'auth.validation.mismatch'
  | 'auth.validation.pin'
  | 'auth.validation.pinMismatch'
  | 'auth.validation.pinWeak'
  | 'auth.wrongPassword'
  | 'auth.wrongPin'
  | 'auth.wrongSecret'
  | 'auth.recover.invalid'
  | 'errors.wrongPassword'
  | 'errors.samePassword'
  | 'errors.invalidCredentials'

export const requiredText = z.string().min(1, 'auth.validation.required')
export const newPasswordText = z
  .string()
  .min(1, 'auth.validation.required')
  .min(8, 'auth.validation.passwordShort')
  .max(256)
export const pinText = z.string().regex(/^\d{4,8}$/, 'auth.validation.pin')

/** A new password typed twice. */
export const newPasswordShape = { newPassword: newPasswordText, repeat: z.string() }
export const samePasswords = (v: { newPassword: string; repeat: string }): boolean =>
  v.newPassword === v.repeat

/** Between a refusal's key and the end of an account lock in what `failureKey` returns. */
const LOCK_MARK = '@'

/**
 * The i18n key to show for a refused call; null when the gate takes over (the session ended or locked). A locked
 * account carries the end of its lock after the key (`errors.accountLocked@<ISO time>`): show it with
 * `useFailureText`, which puts the time into the sentence.
 */
export function failureKey(error: unknown): string | null {
  if (isSessionError(error)) return null
  if (!(error instanceof ApiError)) return 'errors.internal'
  const until = (error.details as { until?: unknown } | undefined)?.until
  return error.messageKey === 'errors.accountLocked' && typeof until === 'string'
    ? `${error.messageKey}${LOCK_MARK}${until}`
    : error.messageKey
}

/** True for a refusal that says the account is locked (no "N tries left" line under it). */
export const isLockedFailure = (failure: string | null): boolean =>
  !!failure && failure.startsWith('errors.accountLocked')

/** The sentence of a `failureKey` value (or a plain message key) in the UI language. */
export function useFailureText(): (failure: string) => string {
  const { t } = useTranslation()
  const f = useFormat()
  return (failure) => {
    const [key, until] = failure.split(LOCK_MARK)
    return until ? t('errors.accountLocked', { time: f.time(until) }) : t(key as AuthMessageKey)
  }
}
