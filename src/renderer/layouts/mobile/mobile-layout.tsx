import { useCallback, useState, type ReactNode } from 'react'
import { TopBar } from '@/components/top-bar'
import { MobileNav } from '@/components/mobile-nav'
import { CommandMenu } from '@/components/command-menu'
import { ShellShortcuts } from '@/components/shortcut-list'
import { RolePreviewBanner } from '@/components/role-preview-banner'
import { ConnectionBanner } from '@/components/connection-status'
import { InstallHint } from './install-hint'

/**
 * Phone layout (< 768 px): top bar, the link state (a phone reaches the hotel's computer over the network), content,
 * bottom navigation Bugün · Takvim · Misafir · Kasa · Daha fazla (G-143, .claude/rules/ui.md, faz-13 madde 6).
 */
export function MobileLayout({ children }: { children: ReactNode }) {
  const [commandOpen, setCommandOpen] = useState(false)
  const toggleCommand = useCallback(() => setCommandOpen((o) => !o), [])
  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar onOpenCommand={() => setCommandOpen(true)} withSidebarTrigger={false} />
      <RolePreviewBanner />
      <ConnectionBanner />
      <main className="flex-1 ps-[max(1rem,env(safe-area-inset-left))] pe-[max(1rem,env(safe-area-inset-right))] pt-4 pb-24">
        <InstallHint />
        {children}
      </main>
      <MobileNav />
      <CommandMenu open={commandOpen} onOpenChange={setCommandOpen} />
      <ShellShortcuts onSearch={toggleCommand} />
    </div>
  )
}
