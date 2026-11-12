// Sign-in (G-22, G-144): pick yourself from the people of this hotel (quick user switch at a shared reception PC),
// then the password or, when you have one, the PIN. An account that is not listed (or a new device) signs in with
// its username. Five wrong passwords lock the account for 15 minutes and five wrong PINs pause PIN sign-in (auth
// service): once a try fails the screen gives the limit of that method, and the service's own answer says when
// the account is locked (until when) or the PIN paused. A refused PIN or password is cleared and its field takes
// the focus again for the next try. The gate (layouts/auth-gate.tsx) opens the app when the sign-in succeeds.
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { CheckIcon, ChevronLeftIcon, LogInIcon, UserRoundIcon } from 'lucide-react'
import type { SignInUser } from '@shared/contract'
import { isAppLocale } from '@shared/format'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { QueryView } from '@/components/query-view'
import { useApiQuery } from '@/lib/api/hooks'
import { localizedName } from '@/lib/session/role-name'
import { useSignIn, useSignInWithPin } from '@/lib/session/session'
import { ApiError } from '@/lib/transport'
import { SIGN_IN_LIMITS } from './limits'
import { AuthFrame } from './auth-frame'
import { initials } from './initials'
import { clearNotice, peekNotice } from './notice'
import { PasswordInput } from './password-input'
import { Field, FormAlert } from './fields'
import { failureKey, isLockedFailure, useFailureText, type AuthMessageKey } from './rules'

const METHODS = ['pin', 'password'] as const
type Method = (typeof METHODS)[number]

/** Wrong tries in a row per account and method on this screen (the password and the PIN have their own limits). */
function useFailures() {
  const [failures, setFailures] = useState<Record<string, number>>({})
  return {
    count: (key: string) => failures[key] ?? 0,
    add: (key: string) => setFailures((f) => ({ ...f, [key]: (f[key] ?? 0) + 1 })),
    clear: (key: string) => setFailures((f) => ({ ...f, [key]: 0 }))
  }
}
type Failures = ReturnType<typeof useFailures>

/**
 * The error under a sign-in form: what went wrong (the service's answer: wrong, locked until a time, PIN paused),
 * then the limit of the method once a try was wrong.
 */
function SignInError({ messageKey, tries, pin }: { messageKey: string; tries: number; pin: boolean }) {
  const { t } = useTranslation()
  const failureText = useFailureText()
  const hint = tries > 0 && !isLockedFailure(messageKey) && messageKey !== 'errors.pinPaused'
  return (
    <FormAlert testId="sign-in-error">
      <p>{failureText(messageKey)}</p>
      {hint ? <p>{t(pin ? 'auth.pinLimitHint' : 'auth.limitHint', SIGN_IN_LIMITS)}</p> : null}
    </FormAlert>
  )
}

/**
 * Runs a sign-in call and turns a refusal into the message and the wrong-try count of `key`; `onRefused` empties
 * the secret and puts the focus back in its field.
 */
function useAttempt(failures: Failures, key: string, wrongKey: AuthMessageKey, onRefused: () => void) {
  const [error, setError] = useState<string | null>(null)
  const run = async (call: () => Promise<unknown>): Promise<void> => {
    setError(null)
    try {
      await call()
      failures.clear(key)
    } catch (e) {
      const wrong = e instanceof ApiError && e.messageKey === 'errors.invalidCredentials'
      if (wrong) failures.add(key)
      setError(wrong ? wrongKey : failureKey(e))
      onRefused()
    }
  }
  return { error, run, tries: failures.count(key) }
}

function UserCard({ user, onPick }: { user: SignInUser; onPick: () => void }) {
  const { i18n } = useTranslation()
  const locale = isAppLocale(i18n.language) ? i18n.language : 'tr'
  const role = localizedName(user.roleName, user.roleNameI18n, locale)
  return (
    <button
      type="button"
      onClick={onPick}
      data-testid={`user-${user.id}`}
      className="hover:bg-accent focus-visible:ring-ring flex min-h-14 w-full items-center gap-3 rounded-lg border p-2 text-start outline-none focus-visible:ring-[3px]"
    >
      <Avatar>
        <AvatarFallback>{initials(user.displayName)}</AvatarFallback>
      </Avatar>
      <span className="grid min-w-0">
        <span className="truncate text-sm font-medium" title={user.displayName}>
          {user.displayName}
        </span>
        <span className="text-muted-foreground truncate text-xs" title={role}>
          {role}
        </span>
      </span>
    </button>
  )
}

function PickedUserForm({
  user,
  failures,
  onBack
}: {
  user: SignInUser
  failures: Failures
  onBack: () => void
}) {
  const { t } = useTranslation()
  const [method, setMethod] = useState<Method>(user.hasPin ? 'pin' : 'password')
  const [secret, setSecret] = useState('')
  const signIn = useSignIn()
  const signInWithPin = useSignInWithPin()
  const pin = method === 'pin'
  const field = useRef<HTMLInputElement>(null)
  const attempt = useAttempt(
    failures,
    `user:${user.id}:${method}`,
    pin ? 'auth.wrongPin' : 'auth.wrongPassword',
    () => {
      setSecret('')
      field.current?.focus()
    }
  )
  const pending = signIn.isPending || signInWithPin.isPending
  return (
    <form
      className="grid gap-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        if (!secret || pending) return
        void attempt.run(() =>
          pin
            ? signInWithPin.mutateAsync({ userId: user.id, pin: secret })
            : signIn.mutateAsync({ userId: user.id, secret })
        )
      }}
    >
      <div className="flex items-center gap-3">
        <Button type="button" variant="ghost" size="icon" onClick={onBack} aria-label={t('auth.otherUser')}>
          <ChevronLeftIcon className="rtl:rotate-180" />
        </Button>
        <Avatar className="size-10">
          <AvatarFallback>{initials(user.displayName)}</AvatarFallback>
        </Avatar>
        <span
          className="min-w-0 flex-1 truncate font-medium"
          title={user.displayName}
          data-testid="picked-user"
        >
          {user.displayName}
        </span>
      </div>
      {user.hasPin ? (
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
      <Field id="secret" label={t(`auth.method.${method}`)} error={Boolean(attempt.error)}>
        {(aria) => (
          <PasswordInput
            {...aria}
            ref={field}
            key={method}
            pin={pin}
            autoFocus
            autoComplete={pin ? 'off' : 'current-password'}
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            data-testid="secret"
          />
        )}
      </Field>
      {attempt.error ? <SignInError messageKey={attempt.error} tries={attempt.tries} pin={pin} /> : null}
      <Button type="submit" disabled={!secret || pending} data-testid="sign-in">
        <LogInIcon aria-hidden />
        {t('auth.signIn')}
      </Button>
    </form>
  )
}

function UsernameForm({ failures, onBack }: { failures: Failures; onBack: (() => void) | null }) {
  const { t } = useTranslation()
  const [username, setUsername] = useState('')
  const [secret, setSecret] = useState('')
  const signIn = useSignIn()
  const key = `name:${username.trim().toLocaleLowerCase('tr')}`
  const passwordField = useRef<HTMLInputElement>(null)
  const attempt = useAttempt(failures, key, 'errors.invalidCredentials', () => {
    setSecret('')
    passwordField.current?.focus()
  })
  return (
    <form
      className="grid gap-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        if (!username.trim() || !secret || signIn.isPending) return
        void attempt.run(() => signIn.mutateAsync({ username: username.trim(), secret }))
      }}
    >
      <Field id="username" label={t('auth.username')} error={Boolean(attempt.error)}>
        {(aria) => (
          <Input
            {...aria}
            autoFocus
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            dir="ltr"
            maxLength={40}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            data-testid="username"
          />
        )}
      </Field>
      <Field id="password" label={t('auth.method.password')} error={Boolean(attempt.error)}>
        {(aria) => (
          <PasswordInput
            {...aria}
            ref={passwordField}
            autoComplete="current-password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            data-testid="secret"
          />
        )}
      </Field>
      {attempt.error ? <SignInError messageKey={attempt.error} tries={attempt.tries} pin={false} /> : null}
      <Button type="submit" disabled={!username.trim() || !secret || signIn.isPending} data-testid="sign-in">
        <LogInIcon aria-hidden />
        {t('auth.signIn')}
      </Button>
      {onBack ? (
        <Button type="button" variant="ghost" onClick={onBack}>
          <ChevronLeftIcon className="rtl:rotate-180" aria-hidden />
          {t('auth.backToList')}
        </Button>
      ) : null}
    </form>
  )
}

type View = { kind: 'list' } | { kind: 'user'; user: SignInUser } | { kind: 'username' }

export function LoginPage() {
  const { t } = useTranslation()
  const users = useApiQuery('auth.signInUsers', {})
  const failures = useFailures()
  const [view, setView] = useState<View>({ kind: 'list' })
  // Signed out by too many wrong unlock tries: say why, once.
  const [notice] = useState(peekNotice)
  useEffect(() => clearNotice(), [])
  const toList = () => setView({ kind: 'list' })
  const description =
    view.kind === 'user'
      ? view.user.hasPin
        ? t('auth.enterSecret')
        : t('auth.enterPassword')
      : view.kind === 'username'
        ? t('auth.enterUsername')
        : t('auth.pickUser')
  return (
    <AuthFrame>
      <Card data-testid="login">
        <CardHeader>
          <CardTitle role="heading" aria-level={1}>
            {t('auth.title')}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {notice === 'unlockSignedOut' && view.kind === 'list' ? (
            <FormAlert testId="locked-out-notice">
              <p>{t('auth.unlockSignedOut', SIGN_IN_LIMITS)}</p>
            </FormAlert>
          ) : null}
          <QueryView query={users}>
            {(list) =>
              view.kind === 'user' ? (
                <PickedUserForm key={view.user.id} user={view.user} failures={failures} onBack={toList} />
              ) : view.kind === 'username' || list.length === 0 ? (
                <>
                  {list.length === 0 ? (
                    <p className="text-muted-foreground text-sm">{t('auth.noUsers')}</p>
                  ) : null}
                  <UsernameForm failures={failures} onBack={list.length ? toList : null} />
                </>
              ) : (
                <>
                  <ul className="grid gap-2 sm:grid-cols-2" data-testid="user-list">
                    {list.map((u) => (
                      <li key={u.id}>
                        <UserCard user={u} onPick={() => setView({ kind: 'user', user: u })} />
                      </li>
                    ))}
                  </ul>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setView({ kind: 'username' })}
                    data-testid="use-username"
                  >
                    <UserRoundIcon aria-hidden />
                    {t('auth.useUsername')}
                  </Button>
                </>
              )
            }
          </QueryView>
          <Button asChild variant="link" className="justify-self-center">
            <Link to="/recover" data-testid="forgot">
              {t('auth.forgot')}
            </Link>
          </Button>
        </CardContent>
      </Card>
    </AuthFrame>
  )
}
