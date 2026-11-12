// "Ana ekrana ekle" (faz-13 madde 6; 04-arastirma/uzaktan-bulut-secenekleri.md §7): a phone opening the hotel's
// computer in its browser can keep Bismuth on the home screen and open it like an app (manifest.webmanifest; over
// the private network's plain HTTP it works as a bookmark with an icon — no service worker is needed). Shown once on
// a phone's browser until dismissed; never inside the desktop program, on the computer itself or in an already added
// shortcut.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SmartphoneIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTransport } from '@/lib/api/api-context'
import { isApplePhone, shouldShowInstallHint } from './install-rules'

const KEY = 'bismuth.installHintDismissed'

/** Opened from the home screen already (iOS sets `navigator.standalone`, others the display mode). */
function runningAsApp(): boolean {
  const nav = window.navigator as Navigator & { standalone?: boolean }
  if (nav.standalone) return true
  try {
    return window.matchMedia('(display-mode: standalone)').matches
  } catch {
    return false
  }
}

function dismissed(): boolean {
  try {
    return window.localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function InstallHint() {
  const { t } = useTranslation()
  const http = useTransport().kind === 'http'
  const [hidden, setHidden] = useState(
    () =>
      !shouldShowInstallHint({
        http,
        hostname: window.location.hostname,
        asApp: runningAsApp(),
        dismissed: dismissed()
      })
  )
  if (hidden) return null
  const close = (): void => {
    setHidden(true)
    try {
      window.localStorage.setItem(KEY, '1')
    } catch {
      // A private window: the hint returns next time.
    }
  }
  return (
    <aside
      className="bg-accent text-accent-foreground mb-4 flex items-start gap-3 rounded-xl border p-3 text-sm"
      data-testid="install-hint"
      aria-labelledby="install-hint-title"
    >
      <SmartphoneIcon className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="grid min-w-0 flex-1 gap-0.5">
        <p id="install-hint-title" className="font-medium">
          {t('install.title')}
        </p>
        <p>{isApplePhone(window.navigator.userAgent) ? t('install.ios') : t('install.android')}</p>
      </div>
      <Button
        size="icon"
        variant="ghost"
        className="-me-1 -mt-1 shrink-0"
        aria-label={t('install.dismiss')}
        onClick={close}
      >
        <XIcon aria-hidden />
      </Button>
    </aside>
  )
}
