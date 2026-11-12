// Small pieces the issue list, cards and detail sheet share: severity and status badges and the "where" tile
// (room number or a pin for a general area).
import { useTranslation } from 'react-i18next'
import { MapPinIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { Issue, IssueStatus } from './issue-utils'

export function SeverityBadge({ severity }: { severity: Issue['severity'] }) {
  const { t } = useTranslation()
  return (
    <Badge
      variant={severity === 'urgent' ? 'destructive' : severity === 'medium' ? 'outline' : 'secondary'}
      className={cn(severity === 'medium' && 'border-warning')}
    >
      {t(`issues.severity.${severity}`)}
    </Badge>
  )
}

export function StatusBadge({ status }: { status: IssueStatus }) {
  const { t } = useTranslation()
  return (
    <Badge
      variant="outline"
      className={cn(
        status === 'planned' && 'border-info text-info',
        status === 'resolved' && 'border-success text-success'
      )}
    >
      {t(`issues.status.${status}`)}
    </Badge>
  )
}

/** Room number tile, or a pin with the area name for general areas. */
export function PlaceTile({
  issue,
  className
}: {
  issue: Pick<Issue, 'roomNumber' | 'area'>
  className?: string
}) {
  const { t } = useTranslation()
  if (issue.roomNumber)
    return (
      <span
        className={cn(
          'bg-muted grid h-9 min-w-11 shrink-0 place-items-center rounded-md px-1.5 text-sm font-semibold tabular-nums',
          className
        )}
        aria-label={t('issues.roomNo', { room: issue.roomNumber })}
      >
        {issue.roomNumber}
      </span>
    )
  return (
    <span
      className={cn(
        'bg-accent text-accent-foreground grid h-9 min-w-11 shrink-0 place-items-center rounded-md px-1.5',
        className
      )}
      aria-label={t('issues.areaOf', { area: issue.area ?? t('issues.generalArea') })}
    >
      <MapPinIcon className="size-4" aria-hidden />
    </span>
  )
}
