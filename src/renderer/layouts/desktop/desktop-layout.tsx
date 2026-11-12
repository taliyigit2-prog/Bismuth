import { useCallback, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { SettingsValues } from '@shared/contract'
import { SIDEBAR_COOKIE_NAME, SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/app-sidebar'
import { TopBar } from '@/components/top-bar'
import { CommandMenu } from '@/components/command-menu'
import { RolePreviewBanner } from '@/components/role-preview-banner'
import { ConnectionBanner } from '@/components/connection-status'
import { ShellShortcuts } from '@/components/shortcut-list'
import { useSettings, useUpdateSettings } from '@/lib/api/hooks'

/** This window's last state: drawn at once, before the person's saved choice arrives. */
function initialSidebarOpen(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_COOKIE_NAME) !== 'false'
  } catch {
    return true
  }
}

/**
 * The menu folded to icons or open is each person's own choice (`ui.sidebarCollapsed`, faz-15 madde 7): it follows
 * them to any computer and survives a restart. The button in the top bar and Ctrl/⌘+B change it.
 */
function useSidebarPreference(): [boolean, (open: boolean) => void] {
  const settings = useSettings()
  const client = useQueryClient()
  const { mutate } = useUpdateSettings()
  const saved = settings.data?.['ui.sidebarCollapsed']
  const [initial] = useState(initialSidebarOpen)
  const open = saved === undefined ? initial : !saved
  const change = useCallback(
    (next: boolean) => {
      // At once on screen; the answer of the save confirms it.
      client.setQueryData<SettingsValues>(['settings.get', {}], (old) =>
        old ? { ...old, 'ui.sidebarCollapsed': !next } : old
      )
      mutate({ 'ui.sidebarCollapsed': !next })
    },
    [client, mutate]
  )
  return [open, change]
}

export function DesktopLayout({ children }: { children: ReactNode }) {
  const [commandOpen, setCommandOpen] = useState(false)
  const toggleCommand = useCallback(() => setCommandOpen((o) => !o), [])
  const [sidebarOpen, setSidebarOpen] = useSidebarPreference()
  return (
    <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen}>
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <TopBar onOpenCommand={() => setCommandOpen(true)} withSidebarTrigger />
        <RolePreviewBanner />
        <ConnectionBanner />
        {/* Pages set their own width (components/page.tsx): most are capped, the calendar uses it all. */}
        <div className="w-full min-w-0 flex-1 p-4 md:p-6">{children}</div>
      </SidebarInset>
      <CommandMenu open={commandOpen} onOpenChange={setCommandOpen} />
      <ShellShortcuts onSearch={toggleCommand} />
    </SidebarProvider>
  )
}
