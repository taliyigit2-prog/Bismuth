// People in a room (G-53, G-54, K-33): who is staying, the descriptor note for the night shift and the KBS
// marks (reported / check-out). Missing marks are loud; the actions write the marks with who and when.
import { useTranslation } from 'react-i18next'
import { LogOutIcon, ShieldAlertIcon, ShieldCheckIcon, StarIcon, UserRoundIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useFormat } from '@/hooks/use-format'
import { cn } from '@/lib/utils'

export interface ListOccupant {
  id: string
  fullName: string
  isPrimary: boolean
  descriptorNote: string | null
  leftAt: string | null
  kbsReportedAt: string | null
  kbsCheckoutAt: string | null
}

export type KbsState = 'ok' | 'missingIn' | 'missingOut' | 'done'

export function kbsState(o: ListOccupant): KbsState {
  if (!o.kbsReportedAt) return 'missingIn'
  if (o.leftAt && !o.kbsCheckoutAt) return 'missingOut'
  if (o.leftAt) return 'done'
  return 'ok'
}

export function OccupantList({
  occupants,
  onMarkKbs,
  compact = false
}: {
  occupants: ListOccupant[]
  onMarkKbs?: (occupantId: string, mark: 'in' | 'out') => void
  compact?: boolean
}) {
  const { t } = useTranslation()
  const f = useFormat()
  return (
    <ul className="grid gap-2" data-testid="occupant-list">
      {occupants.map((o) => {
        const state = kbsState(o)
        return (
          <li
            key={o.id}
            className={cn(
              'flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2',
              (state === 'missingIn' || state === 'missingOut') && 'border-destructive/50 bg-destructive/5',
              o.leftAt && state === 'done' && 'opacity-60'
            )}
          >
            <UserRoundIcon className="text-muted-foreground size-4 shrink-0" aria-hidden />
            {/* At least ~10rem for the name: on a narrow phone the KBS badge and button wrap below instead. */}
            <div className="min-w-28 flex-1">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <span className="truncate">{o.fullName}</span>
                {o.isPrimary ? (
                  <StarIcon className="text-warning size-3.5 shrink-0" aria-label={t('occupants.primary')} />
                ) : null}
              </p>
              {o.descriptorNote && !compact ? (
                <p className="text-muted-foreground text-xs break-words">{o.descriptorNote}</p>
              ) : null}
            </div>
            {state === 'ok' && o.kbsReportedAt ? (
              <Badge variant="secondary" className="gap-1">
                <ShieldCheckIcon className="text-success" aria-hidden />
                {t('occupants.kbsReported', { time: f.time(o.kbsReportedAt) })}
              </Badge>
            ) : null}
            {state === 'done' ? (
              <Badge variant="outline" className="gap-1">
                <LogOutIcon aria-hidden />
                {t('occupants.left')}
              </Badge>
            ) : null}
            {state === 'missingIn' || state === 'missingOut' ? (
              <span className="flex flex-wrap items-center gap-2">
                <Badge variant="destructive" className="gap-1">
                  <ShieldAlertIcon aria-hidden />
                  {t(state === 'missingIn' ? 'occupants.kbsMissingIn' : 'occupants.kbsMissingOut')}
                </Badge>
                {onMarkKbs ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onMarkKbs(o.id, state === 'missingIn' ? 'in' : 'out')}
                  >
                    {t(state === 'missingIn' ? 'occupants.markIn' : 'occupants.markOut')}
                  </Button>
                ) : null}
              </span>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
