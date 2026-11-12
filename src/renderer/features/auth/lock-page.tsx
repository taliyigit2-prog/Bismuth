// Lock screen (G-22): after the idle time, "Kilitle" or Ctrl+L (and when the computer sleeps or locks) the window
// keeps its user but shows nothing until the same person types the PIN or the password. Anyone else signs out
// that user and signs in as themselves (quick user switch at the shared reception PC). A refused try empties the
// field and puts the focus back in it. Five wrong tries sign the window out (the account is not locked by them);
// an account locked by wrong passwords elsewhere says until when. Over the network (a phone, another computer)
// only the password unlocks (K-45 (2)): the PIN is the quick switch of the hotel computer's own desk.
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckIcon, LockIcon, UnlockIcon, UsersIcon } from 'lucide-react'
import { isAppLocale } from '@shared/format'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useRemoteLink } from '@/components/connection-status'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useFormat } from '@/hooks/use-format'
import { localizedName } from '@/lib/session/role-name'
import { lastLockedAt, useMe, useSignOut, useUnlock } from '@/lib/session/session'
import { isSessionError } from '@/lib/session/query-client'
import { ApiError } from '@/lib/transport'
import { SIGN_IN_LIMITS } from './limits'
import { AuthFrame } from './auth-frame'
import { initials } from './initials'
import { leaveNotice } from './notice'
import { PasswordInput } from './password-input'
import { Field, FormAlert } from './fields'
import { failureKey, isLockedFailure, useFailureText } from './rules'

const METHODS = ['pin', 'password'] as const
type Method = (typeof METHODS)[number]

export function LockPage() {
  const { t, i18n } = useTranslation()
  const f = useFormat()
  const me = useMe()
  const unlock = useUnlock()
  const signOut = useSignOut()
  const remote = useRemoteLink()
  const hasPin = !remote && (me?.user.hasPin ?? false)
  const [method, setMethod] = useState<Method>(hasPin ? 'pin' : 'password')
  const [secret, setSecret] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [tries, setTries] = useState(0)
  const field = useRef<HTMLInputElement>(null)
  const failureText = useFailureText()
  if (!me) return null
  const locale = isAppLocale(i18n.language) ? i18n.language : 'tr'
  const lockedAt = lastLockedAt()
  const pending = unlock.isPending || signOut.isPending
  const subtitle = lockedAt
    ? t('auth.lockedAt', { time: f.time(lockedAt.toISOString()) })
    : localizedName(me.user.roleName, me.user.roleNameI18n, locale)

  const submit = async (): Promise<void> => {
    if (!secret || pending) return
    setError(null)
    try {
      await unlock.mutateAsync({ secret })
    } catch (e) {
      // Too many wrong tries: the window is signed out (the account is not locked); the gate opens the sign-in
      // screen, which says why.
      if (isSessionError(e)) {
        if (tries + 1 >= SIGN_IN_LIMITS.attempts) leaveNotice('unlockSignedOut')
        return
      }
      const wrong = e instanceof ApiError && e.messageKey === 'errors.invalidCredentials'
      if (wrong) setTries((n) => n + 1)
      // Names only what was typed: someone without a PIN is never told about one.
      setError(wrong ? (method === 'pin' ? 'auth.wrongPin' : 'auth.wrongPassword') : failureKey(e))
      setSecret('')
      field.current?.focus()
    }
  }

  return (
    <AuthFrame>
      <Card data-testid="lock">
        <CardHeader>
          <CardTitle role="heading" aria-level={1} className="flex items-center gap-2">
            <LockIcon className="text-muted-foreground size-4" aria-hidden />
            {t('auth.locked')}
          </CardTitle>
          <CardDescription>{hasPin ? t('auth.lockedHint') : t('auth.lockedHintPassword')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4"
            noValidate
            onSubmit={(e) => {
              e.preventDefault()
              void submit()
            }}
          >
            <div className="flex items-center gap-3">
              <Avatar className="size-12">
                <AvatarFallback>{initials(me.user.displayName)}</AvatarFallback>
              </Avatar>
              <div className="grid min-w-0">
                <span className="truncate font-medium" title={me.user.displayName} data-testid="lock-user">
                  {me.user.displayName}
                </span>
                <span className="text-muted-foreground truncate text-xs" title={subtitle}>
                  {subtitle}
                </span>
              </div>
            </div>
            {hasPin ? (
              <ToggleGroup
                type="single"
                variant="outline"
                value={method}
                onValueChange={(v) => {
                  const next = METHODS.find((m) => m === v)
                  if (next) {
                    setMethod(next)
                    setSecret('')
                  }
                }}
                className="w-full"
              >
                {METHODS.map((m) => (
                  <ToggleGroupItem key={m} value={m} className="group flex-1">
                    <CheckIcon className="hidden group-data-[state=on]:block" aria-hidden />
                    {t(`auth.method.${m}`)}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            ) : null}
            <Field id="unlock-secret" label={t(`auth.method.${method}`)} error={Boolean(error)}>
              {(aria) => (
                <PasswordInput
                  {...aria}
                  ref={field}
                  key={method}
                  pin={method === 'pin'}
                  autoFocus
                  autoComplete={method === 'pin' ? 'off' : 'current-password'}
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  data-testid="unlock-secret"
                />
              )}
            </Field>
            {error ? (
              <FormAlert testId="unlock-error">
                <p>{failureText(error)}</p>
                {tries > 0 && !isLockedFailure(error) ? (
                  <p>{t('auth.unlockLimitHint', SIGN_IN_LIMITS)}</p>
                ) : null}
              </FormAlert>
            ) : null}
            <Button type="submit" disabled={!secret || pending} data-testid="unlock">
              <UnlockIcon aria-hidden />
              {t('auth.unlock')}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => signOut.mutate({})}
              data-testid="other-user"
            >
              <UsersIcon aria-hidden />
              {t('auth.signInAsOther')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </AuthFrame>
  )
}
