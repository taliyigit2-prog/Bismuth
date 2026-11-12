// Inside the app shell only (not on the bare screens): the idle lock (`security.idleLockMinutes`, 0 = never) and a
// fresh look at the sign-in state when the window comes back (the main process
// may have locked it while the computer slept or was locked). The lock shortcut (Ctrl+L / ⌘L) is one of the shell's
// global shortcuts (lib/shortcuts).
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useRemoteLink } from '@/components/connection-status'
import { useSettings } from '@/lib/api/hooks'
import { useIdle } from '@/lib/session/idle'
import { useLockNow, useSessionEvents } from '@/lib/session/session'

const SETTINGS_REFRESH_MS = 30_000

export function SessionWatch() {
  const settings = useSettings()
  const events = useSessionEvents()
  const lockNow = useLockNow()
  const queryClient = useQueryClient()
  const remote = useRemoteLink()
  useIdle(settings.data?.['security.idleLockMinutes'] ?? 0, lockNow)

  // The hotel's settings live on the main computer and are kept as read: a phone or a client computer asks again
  // every half minute (and when it comes back), so a changed idle-lock time reaches it without a reload (QA3d).
  useEffect(() => {
    if (!remote) return
    const refresh = (): void => void queryClient.invalidateQueries({ queryKey: ['settings.get'] })
    const timer = setInterval(refresh, SETTINGS_REFRESH_MS)
    return () => clearInterval(timer)
  }, [remote, queryClient])

  useEffect(() => {
    const onBack = (): void => {
      if (document.visibilityState !== 'visible') return
      void events.refresh()
      if (remote) void queryClient.invalidateQueries({ queryKey: ['settings.get'] })
    }
    window.addEventListener('focus', onBack)
    document.addEventListener('visibilitychange', onBack)
    return () => {
      window.removeEventListener('focus', onBack)
      document.removeEventListener('visibilitychange', onBack)
    }
  }, [events, remote, queryClient])
  return null
}
