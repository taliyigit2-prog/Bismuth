import { useState } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { ChevronDownIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail
} from '@/components/ui/sidebar'
import { BismuthMark } from '@/components/bismuth-mark'
import { useCan } from '@/lib/view-as'
import { NAV_GROUPS, visibleNav, type NavGroup, type NavItem } from '@/navigation'

function NavSection({ group, items }: { group: NavGroup; items: readonly NavItem[] }) {
  const { t } = useTranslation()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  // 05 #5: on a low screen the lower groups are folded away with one tap; the group of the open screen stays open
  // and the icon-only sidebar always shows every icon.
  const [folded, setFolded] = useState(false)
  const hidden = folded && !items.some((i) => i.to === pathname)
  return (
    <SidebarGroup>
      <SidebarGroupLabel asChild>
        <button
          type="button"
          aria-expanded={!hidden}
          onClick={() => setFolded(!folded)}
          className="w-full cursor-pointer justify-between text-start"
          data-testid={`nav-group-${group}`}
        >
          {t(`nav.group.${group}`)}
          <ChevronDownIcon className={hidden ? '-rotate-90 rtl:rotate-90' : undefined} aria-hidden />
        </button>
      </SidebarGroupLabel>
      <SidebarGroupContent className={hidden ? 'hidden group-data-[collapsible=icon]:block' : undefined}>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.to}>
              <SidebarMenuButton asChild isActive={pathname === item.to} tooltip={t(item.labelKey)}>
                <Link to={item.to} data-testid={`nav-${item.to.slice(1)}`}>
                  <item.icon aria-hidden />
                  {/* A long Russian label is cut by the sidebar width; the full name shows on hover. */}
                  <span title={t(item.labelKey)}>{t(item.labelKey)}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

/** Desktop menu (faz-03 madde 3): collapsible to icons, grouped, filtered by the role's rights. */
export function AppSidebar() {
  const { t } = useTranslation()
  const can = useCan()
  const items = visibleNav((key) => can(key))
  return (
    <Sidebar collapsible="icon" aria-label={t('nav.mainMenu')}>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-1 py-1.5">
          <BismuthMark className="size-7 shrink-0" />
          <div className="grid leading-tight group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-semibold">{t('app.name')}</span>
            <span className="text-muted-foreground text-xs">{t('app.tagline')}</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {NAV_GROUPS.map((group) => {
          const groupItems = items.filter((i) => i.group === group)
          return groupItems.length ? <NavSection key={group} group={group} items={groupItems} /> : null
        })}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}
