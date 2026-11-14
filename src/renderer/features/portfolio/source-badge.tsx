// Rakamların nereden geldiği (P21c): canlı (ana bilgisayardan şimdi) ya da bu bilgisayardaki yedek kopya ve
// kopyanın son eşitleme zamanı. Kopya hiçbir zaman canlı gibi görünmez.
import { useTranslation } from 'react-i18next'
import { CopyIcon, RadioIcon } from 'lucide-react'
import { localDateOf } from '@shared/date'
import { Badge } from '@/components/ui/badge'
import { useFormat } from '@/hooks/use-format'

export function SourceBadge({
  source,
  syncedAt
}: {
  source: 'live' | 'copy' | null
  syncedAt: string | null
}) {
  const { t } = useTranslation()
  const f = useFormat()
  if (!source) return null
  if (source === 'live')
    return (
      <Badge variant="outline" className="justify-self-start" data-testid="source-live">
        <RadioIcon aria-hidden />
        {t('portfolio.source.live')}
      </Badge>
    )
  const when = syncedAt ? new Date(syncedAt) : null
  return (
    <Badge variant="secondary" className="justify-self-start" data-testid="source-copy">
      <CopyIcon aria-hidden />
      {when
        ? t('portfolio.source.copy', { date: f.date(localDateOf(when), 'medium'), time: f.time(syncedAt!) })
        : t('portfolio.source.copyNoTime')}
    </Badge>
  )
}
