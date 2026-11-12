import { useState } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { MoreHorizontalIcon } from 'lucide-react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useCan } from '@/lib/view-as'
import { cn } from '@/lib/utils'
import { visibleNav } from '@/navigation'

const BAR_ORDER = ['/today', '/calendar', '/guests', '/ledger'] as const
/** Short labels under the bar icons ("Kasa" for the ledger, "Misafir" for guests). */
const SHORT = {
  '/today': 'nav.short.today',
  '/calendar': 'nav.short.calendar',
  '/guests': 'nav.short.guests',
  '/ledger': 'nav.short.ledger'
} as const

const tabClass = (active: boolean): string =>
  cn(
    'focus-visible:ring-ring flex min-h-14 w-full flex-col items-center justify-center gap-0.5 rounded-md px-1 text-xs font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-inset',
    active ? 'text-primary' : 'text-muted-foreground'
  )

/** Phone bottom navigation (G-143, faz-03 madde 4): Bugün · Takvim · Misafir · Kasa · Daha fazla. */
export function MobileNav() {
  const { t } = useTranslation()
  const can = useCan()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const [moreOpen, setMoreOpen] = useState(false)
  const items = visibleNav((key) => can(key))
  const bar = BAR_ORDER.map((to) => items.find((i) => i.to === to)).filter((i) => i !== undefined)
  // The phone book and issues lead the sheet (faz-12 madde 6); the rest keep the menu order.
  const more = items
    .filter((i) => i.mobile === 'more')
    .map((item, index) => ({ item, rank: item.moreRank ?? Number.MAX_SAFE_INTEGER, index }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((x) => x.item)
  const moreActive = more.some((i) => i.to === pathname)
  return (
    <>
      <nav
        aria-label={t('nav.mainMenu')}
        data-testid="mobile-nav"
        className="bg-background/95 fixed inset-x-0 bottom-0 z-20 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur"
      >
        <ul className="grid grid-cols-5">
          {bar.map((item) => {
            const active = pathname === item.to
            return (
              <li key={item.to}>
                <Link to={item.to} aria-current={active ? 'page' : undefined} className={tabClass(active)}>
                  <item.icon className="size-5" aria-hidden />
                  <span className="max-w-full truncate">{t(SHORT[item.to as keyof typeof SHORT])}</span>
                </Link>
              </li>
            )
          })}
          <li>
            <button
              type="button"
              data-testid="nav-more"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen(true)}
              className={tabClass(moreActive)}
            >
              <MoreHorizontalIcon className="size-5" aria-hidden />
              <span className="max-w-full truncate">{t('common.more')}</span>
            </button>
          </li>
        </ul>
      </nav>
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="rounded-t-xl pb-[calc(env(safe-area-inset-bottom)+1rem)]">
          <SheetHeader className="text-start">
            <SheetTitle>{t('nav.moreTitle')}</SheetTitle>
            <SheetDescription>{t('nav.moreDescription')}</SheetDescription>
          </SheetHeader>
          <ul className="grid grid-cols-3 gap-2 px-4" data-testid="more-sheet">
            {more.map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  onClick={() => setMoreOpen(false)}
                  aria-current={pathname === item.to ? 'page' : undefined}
                  className={cn(
                    'focus-visible:ring-ring bg-card hover:bg-accent flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-xl border px-2 text-center text-xs font-medium outline-none focus-visible:ring-[3px]',
                    pathname === item.to && 'border-primary text-primary'
                  )}
                >
                  <item.icon className="size-5" aria-hidden />
                  <span className="line-clamp-2">{t(item.labelKey)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </SheetContent>
      </Sheet>
    </>
  )
}
