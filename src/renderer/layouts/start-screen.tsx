// `/`: the start screen (G-47, `ui.startScreen`, default Takvim). A role that may not see it starts on its first
// menu screen instead of a "no access" page.
import { Navigate } from '@tanstack/react-router'
import { useSettings } from '@/lib/api/hooks'
import { useCan } from '@/lib/view-as'
import { NAV_ITEMS, navAllows, visibleNav } from '@/navigation'

export function StartScreen() {
  const settings = useSettings()
  const can = useCan()
  if (!settings.data) return null
  const start = settings.data['ui.startScreen'] === 'today' ? '/today' : '/calendar'
  const item = NAV_ITEMS.find((i) => i.to === start)
  const to =
    !item || navAllows(item, (key) => can(key)) ? start : (visibleNav((key) => can(key))[0]?.to ?? start)
  return <Navigate to={to} replace />
}
