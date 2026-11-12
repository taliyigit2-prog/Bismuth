// Frame of the screens before the app (sign-in, recovery, lock, password change, connection): the hotel's name
// and the Bismuth mark above one card.
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { BismuthMark } from '@/components/bismuth-mark'
import { useSettings } from '@/lib/api/hooks'

export function AuthFrame({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const settings = useSettings()
  const name = settings.data?.['hotel.name'] || t('app.name')
  return (
    <div className="grid flex-1 place-items-center">
      <div className="grid w-full max-w-md gap-6">
        <header className="flex items-center gap-3">
          <BismuthMark className="size-10" />
          <div className="grid min-w-0 flex-1">
            <span className="truncate text-lg font-semibold" title={name} data-testid="auth-hotel-name">
              {name}
            </span>
            <span className="text-muted-foreground text-xs">{t('app.tagline')}</span>
          </div>
        </header>
        {children}
      </div>
    </div>
  )
}
