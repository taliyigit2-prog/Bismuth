// Forced password change (G-22): an account whose password someone else set (a new employee, an owner reset) may
// do nothing else until it has its own password; then `auth.state` gives it the role's rights and the gate opens
// the app.
import { useTranslation } from 'react-i18next'
import { KeyRoundIcon, LogOutIcon } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useMe, useSignOut } from '@/lib/session/session'
import { AuthFrame } from './auth-frame'
import { initials } from './initials'
import { ChangePasswordFields } from './change-password-form'
import { useChangePasswordForm } from './use-change-password-form'

export function ChangePasswordPage() {
  const { t } = useTranslation()
  const me = useMe()
  const signOut = useSignOut()
  // The gate moves on once `auth.state` (refreshed by the change) no longer asks for it.
  const state = useChangePasswordForm(() => undefined)
  if (!me) return null
  return (
    <AuthFrame>
      <Card data-testid="change-password">
        <CardHeader>
          <CardTitle role="heading" aria-level={1}>
            {t('auth.mustChange.title')}
          </CardTitle>
          <CardDescription>{t('auth.mustChange.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" noValidate onSubmit={(e) => void state.submit(e)}>
            <div className="flex items-center gap-3">
              <Avatar className="size-10">
                <AvatarFallback>{initials(me.user.displayName)}</AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1 truncate font-medium" title={me.user.displayName}>
                {me.user.displayName}
              </span>
            </div>
            <ChangePasswordFields
              id="must-change"
              state={state}
              currentLabel={t('auth.mustChange.current')}
            />
            <Button type="submit" disabled={state.pending} data-testid="change-password-submit">
              <KeyRoundIcon aria-hidden />
              {t('auth.mustChange.submit')}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={signOut.isPending}
              onClick={() => signOut.mutate({})}
            >
              <LogOutIcon aria-hidden />
              {t('auth.signOut')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </AuthFrame>
  )
}
