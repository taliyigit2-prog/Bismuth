// A section or card the role may see but not change (view level, src/shared/permissions.ts): one line says so, so
// the disabled controls under it do not look broken. The service refuses a change anyway (G-23).
import { useTranslation } from 'react-i18next'
import { EyeIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export function ViewOnlyNote({ className, help }: { className?: string; help?: string }) {
  const { t } = useTranslation()
  return (
    <p
      className={cn('text-muted-foreground flex items-center gap-1.5 text-sm', className)}
      data-testid="view-only"
    >
      <EyeIcon className="size-4 shrink-0" aria-hidden />
      <span>
        <span className="text-foreground font-medium">{t('settings.viewOnly')}</span>
        <span className="max-sm:sr-only"> · {help ?? t('settings.viewOnlyHelp')}</span>
      </span>
    </p>
  )
}

/**
 * Wraps a section shown at view level: disabled fields keep readable text (the controls' own 50 % fade would make
 * the values hard to read; they are information here, not a broken form).
 */
export const VIEW_ONLY_FIELDS =
  '[&_input:disabled]:opacity-80 [&_textarea:disabled]:opacity-80 [&_[data-slot=select-trigger]:disabled]:opacity-80'
