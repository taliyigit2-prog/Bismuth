// Severity of a blacklist entry: "Uyar" (warning on the reservation) or "Engelle" (needs owner/manager approval).
import { useTranslation } from 'react-i18next'
import { AlertTriangleIcon, BanIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

export function SeverityBadge({ severity }: { severity: 'warn' | 'block' }) {
  const { t } = useTranslation()
  return severity === 'block' ? (
    <Badge variant="destructive" className="gap-1">
      <BanIcon aria-hidden />
      {t('blacklist.severity.block')}
    </Badge>
  ) : (
    <Badge variant="outline" className="border-warning text-foreground gap-1">
      <AlertTriangleIcon className="text-warning" aria-hidden />
      {t('blacklist.severity.warn')}
    </Badge>
  )
}
