import { SearchIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { today } from '@shared/date'
import { formatDate, isAppLocale } from '@shared/format'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import { useSettings } from '@/lib/api/hooks'
import { useFormat } from '@/hooks/use-format'
import { ConnectionBadge } from '@/components/connection-status'
import { UserMenu } from '@/features/auth/user-menu'
import { CashDrawerButton } from '@/components/cash-drawer/cash-drawer-button'
import { GuideButton } from '@/features/guide/guide-button'
import { isMacLike } from '@/lib/platform'
import { shortcutHint } from '@/lib/shortcuts/registry'

export function TopBar({
  onOpenCommand,
  withSidebarTrigger
}: {
  onOpenCommand: () => void
  withSidebarTrigger: boolean
}) {
  const { t, i18n } = useTranslation()
  const settings = useSettings()
  const locale = isAppLocale(i18n.language) ? i18n.language : 'tr'
  const hotelName = settings.data?.['hotel.name'] ?? t('app.name')
  const f = useFormat()
  const day = today()
  const todayText = t('topbar.todayIs', { date: formatDate(day, locale, 'full') })
  // Below 1024 px (phone, a 1280 px screen at 150% zoom) there is room for a short weekday and the day
  // ("Cmt, 10 Eki"), not the year or the word "Bugün"; the full date is the title and what a screen reader reads.
  const shortWeekday = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(
    new Date(`${day}T00:00:00Z`)
  )
  const shortText = `${shortWeekday}, ${f.dayMonth(day)}`
  const isMac = isMacLike()
  const searchHint = shortcutHint('search', isMac)
  return (
    <header className="bg-background/95 sticky top-0 z-10 flex min-h-14 shrink-0 items-center gap-2 border-b px-3 pt-[env(safe-area-inset-top)] backdrop-blur">
      {withSidebarTrigger ? (
        <>
          <SidebarTrigger aria-label={t('topbar.toggleSidebar')} />
          <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-5" />
        </>
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold" data-testid="hotel-name" title={hotelName}>
          {hotelName}
        </p>
        <p className="text-muted-foreground truncate text-xs" data-testid="today-label" title={todayText}>
          <span aria-hidden className="lg:hidden">
            {shortText}
          </span>
          <span className="max-lg:sr-only">{todayText}</span>
        </p>
      </div>
      <ConnectionBadge />
      <Button
        variant="outline"
        size="sm"
        className="text-muted-foreground gap-2 max-md:min-w-11"
        onClick={onOpenCommand}
        aria-label={t('topbar.openCommand')}
      >
        <SearchIcon aria-hidden />
        <span className="hidden sm:inline">{t('topbar.search')}</span>
        <Kbd className="hidden sm:inline-flex">{searchHint}</Kbd>
      </Button>
      <GuideButton />
      <CashDrawerButton />
      <UserMenu />
    </header>
  )
}
