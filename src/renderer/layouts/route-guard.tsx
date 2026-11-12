// Every menu screen opened by a role that may not see it (a typed address, a role preview, a stale link) shows
// "Bu ekranı görme yetkiniz yok" instead of the page. Comfort only: the services refuse the data anyway (G-23).
import type { ReactNode } from 'react'
import { useRouterState } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Page } from '@/components/page'
import { NoAccessState } from '@/components/states'
import { useCan } from '@/lib/view-as'
import { NAV_ITEMS, navAllows } from '@/navigation'

export function RouteGuard({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const can = useCan()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const item = NAV_ITEMS.find((i) => i.to === pathname)
  if (!item || navAllows(item, (key) => can(key))) return <>{children}</>
  return (
    <Page title={t(item.labelKey)}>
      <NoAccessState />
    </Page>
  )
}
