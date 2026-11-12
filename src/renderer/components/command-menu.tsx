import { useNavigate } from '@tanstack/react-router'
import {
  KeyboardIcon,
  LanguagesIcon,
  LockIcon,
  LogOutIcon,
  MonitorIcon,
  MoonIcon,
  SunMediumIcon
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { APP_LOCALES } from '@shared/format'
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut
} from '@/components/ui/command'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useIsMobile } from '@/hooks/use-mobile'
import { useUpdateSettings } from '@/lib/api/hooks'
import { useCan } from '@/lib/view-as'
import { useLockNow, useMe, useSignOut } from '@/lib/session/session'
import { isMacLike } from '@/lib/platform'
import { setShortcutListOpen } from '@/lib/shortcuts/list-store'
import { shortcutHint } from '@/lib/shortcuts/registry'
import { visibleNav } from '@/navigation'
import { ContactsCommandGroup } from '@/features/contacts/command-contacts'

export function CommandMenu({
  open,
  onOpenChange
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const update = useUpdateSettings()
  const isMobile = useIsMobile()
  const can = useCan()
  const pages = visibleNav((key) => can(key))
  const me = useMe()
  const lockNow = useLockNow()
  const signOut = useSignOut()

  // Ctrl/⌘+K and "/" open this menu: lib/shortcuts (the shell's one key listener).
  const mac = isMacLike()
  const lockHint = shortcutHint('lock', mac)
  const listHint = shortcutHint('shortcut-list', mac)

  const run = (action: () => void): void => {
    onOpenChange(false)
    action()
  }

  const content = (
    <>
      <CommandInput placeholder={t('command.placeholder')} />
      <CommandList>
        <CommandEmpty>{t('command.empty')}</CommandEmpty>
        <CommandGroup heading={t('command.groupPages')}>
          {pages.map((item) => (
            <CommandItem key={item.to} onSelect={() => run(() => void navigate({ to: item.to }))}>
              <item.icon aria-hidden />
              {t(item.labelKey)}
            </CommandItem>
          ))}
        </CommandGroup>
        <ContactsCommandGroup open={open} onRun={run} />
        <CommandSeparator />
        {me ? (
          <>
            <CommandGroup heading={t('command.groupSession')}>
              <CommandItem onSelect={() => run(lockNow)} data-testid="command-lock">
                <LockIcon aria-hidden />
                {t('command.lock')}
                <CommandShortcut className="max-md:hidden">{lockHint}</CommandShortcut>
              </CommandItem>
              <CommandItem onSelect={() => run(() => signOut.mutate({}))} data-testid="command-sign-out">
                <LogOutIcon aria-hidden />
                {t('command.signOut')}
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
          </>
        ) : null}
        <CommandGroup heading={t('command.groupHelp')}>
          <CommandItem onSelect={() => run(() => setShortcutListOpen(true))} data-testid="command-shortcuts">
            <KeyboardIcon aria-hidden />
            {t('shortcuts.title')}
            <CommandShortcut className="max-md:hidden">{listHint}</CommandShortcut>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading={t('command.groupTheme')}>
          <CommandItem onSelect={() => run(() => update.mutate({ 'ui.theme': 'light' }))}>
            <SunMediumIcon aria-hidden />
            {t('settings.themeLight')}
          </CommandItem>
          <CommandItem onSelect={() => run(() => update.mutate({ 'ui.theme': 'dark' }))}>
            <MoonIcon aria-hidden />
            {t('settings.themeDark')}
          </CommandItem>
          <CommandItem onSelect={() => run(() => update.mutate({ 'ui.theme': 'system' }))}>
            <MonitorIcon aria-hidden />
            {t('settings.themeSystem')}
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading={t('command.groupLanguage')}>
          {APP_LOCALES.map((lng) => (
            <CommandItem key={lng} onSelect={() => run(() => update.mutate({ 'ui.language': lng }))}>
              <LanguagesIcon aria-hidden />
              {t(`language.${lng}`)}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </>
  )

  // Phone: a bottom sheet with 16 px input and 44 px rows (.claude/rules/ui.md); desktop: centred dialog.
  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="max-h-[85dvh] gap-0 p-0 pb-[env(safe-area-inset-bottom)]">
          <SheetHeader className="sr-only">
            <SheetTitle>{t('command.title')}</SheetTitle>
            <SheetDescription>{t('command.description')}</SheetDescription>
          </SheetHeader>
          <Command className="[&_[cmdk-group-heading]]:text-muted-foreground bg-transparent [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-item]]:py-3 [&_[cmdk-list]]:max-h-[60dvh]">
            {content}
          </Command>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('command.title')}
      description={t('command.description')}
    >
      {content}
    </CommandDialog>
  )
}
