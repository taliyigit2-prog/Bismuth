import { CircleCheckIcon, InfoIcon, Loader2Icon, OctagonXIcon, TriangleAlertIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Toaster as Sonner, type ToasterProps } from 'sonner'
import { useResolvedTheme } from '@/lib/theme/theme-sync'

// Adapted from shadcn/ui sonner.tsx (MIT): theme comes from Bismuth settings instead of next-themes;
// sonner's built-in English labels ("Notifications", "Close toast") come from the locale files (G-08).
const Toaster = ({ ...props }: ToasterProps) => {
  const theme = useResolvedTheme()
  const { t } = useTranslation()
  return (
    <Sonner
      theme={theme}
      containerAriaLabel={t('common.notifications')}
      toastOptions={{ closeButtonAriaLabel: t('common.close') }}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />
      }}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--border-radius': 'var(--radius)'
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
