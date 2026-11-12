// The signed-in person in the top bar (desktop and phone): name and role, own password, PIN and recovery codes,
// lock (Ctrl+L / ⌘L) and sign-out (G-22).
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { KeyRoundIcon, LifeBuoyIcon, LockIcon, LogOutIcon, RectangleEllipsisIcon } from 'lucide-react'
import { isAppLocale } from '@shared/format'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { isMacLike } from '@/lib/platform'
import { shortcutHint } from '@/lib/shortcuts/registry'
import { localizedName } from '@/lib/session/role-name'
import { useLockNow, useMe, useSignOut } from '@/lib/session/session'
import { initials } from './initials'
import { ChangePasswordDialog, PinDialog, RecoveryCodesDialog } from './account-dialogs'

type Dialog = 'password' | 'pin' | 'codes' | null

export function UserMenu() {
  const lockHint = shortcutHint('lock', isMacLike())
  const { t, i18n } = useTranslation()
  const me = useMe()
  const signOut = useSignOut()
  const lockNow = useLockNow()
  const [dialog, setDialog] = useState<Dialog>(null)
  if (!me) return null
  const locale = isAppLocale(i18n.language) ? i18n.language : 'tr'
  const role = localizedName(me.user.roleName, me.user.roleNameI18n, locale)
  const dialogProps = (which: Exclude<Dialog, null>) => ({
    open: dialog === which,
    onOpenChange: (open: boolean) => setDialog(open ? which : null)
  })
  const passwordDialog = dialogProps('password')
  const pinDialog = dialogProps('pin')
  const codesDialog = dialogProps('codes')
  return (
    <>
      {/* Not modal: a dialog opened from an item must get the focus and the pointer, not the closing menu. */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="h-auto gap-2 px-1.5 py-1 max-md:size-11 max-md:p-0"
            aria-label={t('userMenu.open')}
            data-testid="user-menu"
          >
            <Avatar className="size-8">
              <AvatarFallback className="text-xs">{initials(me.user.displayName)}</AvatarFallback>
            </Avatar>
            <span className="grid max-w-40 text-start leading-tight max-lg:hidden">
              <span className="truncate text-sm font-medium">{me.user.displayName}</span>
              <span className="text-muted-foreground truncate text-xs font-normal">{role}</span>
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64" data-testid="user-menu-content">
          <DropdownMenuLabel className="grid gap-0.5 font-normal">
            <span className="truncate text-sm font-medium">{me.user.displayName}</span>
            <span className="text-muted-foreground truncate text-xs">{role}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem onSelect={() => setDialog('password')} data-testid="menu-change-password">
              <KeyRoundIcon aria-hidden />
              {t('userMenu.changePassword')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setDialog('pin')} data-testid="menu-pin">
              <RectangleEllipsisIcon aria-hidden />
              {me.user.hasPin ? t('userMenu.changePin') : t('userMenu.setPin')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setDialog('codes')} data-testid="menu-recovery-codes">
              <LifeBuoyIcon aria-hidden />
              {t('userMenu.recoveryCodes')}
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={lockNow} data-testid="menu-lock">
            <LockIcon aria-hidden />
            {t('userMenu.lock')}
            <DropdownMenuShortcut className="max-md:hidden">{lockHint}</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => signOut.mutate({})}
            disabled={signOut.isPending}
            data-testid="menu-sign-out"
          >
            <LogOutIcon aria-hidden />
            {t('userMenu.signOut')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ChangePasswordDialog {...passwordDialog} />
      <PinDialog {...pinDialog} hasPin={me.user.hasPin} />
      <RecoveryCodesDialog {...codesDialog} />
    </>
  )
}
