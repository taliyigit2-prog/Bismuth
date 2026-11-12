// The people of one room on "Otelde kalanlar" (G-53, G-54): name, the descriptor note the night shift reads, and
// the KBS mark with who set it and when. An unmarked person is loud (red) with the "KBS'ye bildirdim" button; a
// mistaken mark can be taken back (audited by the service).
import { useTranslation } from 'react-i18next'
import { ShieldAlertIcon, ShieldCheckIcon, StarIcon, Undo2Icon, UserRoundIcon } from 'lucide-react'
import type { InHouseOccupant } from '@shared/contract/procedures/today'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { kbsOf } from './in-house-model'
import { useWhen } from './use-when'

export function InHousePeople({
  occupants,
  checks = true,
  canEdit,
  busy,
  onMark
}: {
  occupants: InHouseOccupant[]
  /** The hotel's KBS checks (kbs.checksEnabled); off: an unmarked person is not loud. */
  checks?: boolean
  canEdit: boolean
  busy: boolean
  onMark: (occupantId: string, mark: 'reported' | 'clearReported') => void
}) {
  const { t } = useTranslation()
  const when = useWhen()
  return (
    <ul className="grid gap-2" data-testid="occupant-list">
      {occupants.map((o) => {
        const mark = kbsOf(o, checks)
        const missing = mark === 'missingIn'
        return (
          <li
            key={o.id}
            data-testid={`occupant-${o.id}`}
            data-kbs={missing ? 'missing' : mark}
            className={cn(
              'flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2',
              missing && 'border-destructive/50 bg-destructive/5'
            )}
          >
            <UserRoundIcon className="text-muted-foreground size-4 shrink-0" aria-hidden />
            <div className="min-w-28 flex-1">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <span className="break-words">{o.fullName}</span>
                {o.isPrimary ? (
                  <StarIcon className="text-warning size-3.5 shrink-0" aria-label={t('occupants.primary')} />
                ) : null}
              </p>
              {o.descriptorNote ? (
                <p className="text-muted-foreground text-xs break-words">{o.descriptorNote}</p>
              ) : null}
            </div>
            {mark === 'off' ? (
              canEdit ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="max-md:basis-full max-md:justify-start max-md:ps-7"
                  disabled={busy}
                  onClick={() => onMark(o.id, 'reported')}
                >
                  {t('occupants.markIn')}
                </Button>
              ) : null
            ) : missing ? (
              <span className="flex flex-wrap items-center gap-2 max-md:basis-full max-md:ps-7">
                <Badge variant="destructive" className="h-auto gap-1 whitespace-normal">
                  <ShieldAlertIcon aria-hidden />
                  {t('occupants.kbsMissingIn')}
                </Badge>
                {canEdit ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => onMark(o.id, 'reported')}
                  >
                    {t('occupants.markIn')}
                  </Button>
                ) : null}
              </span>
            ) : (
              <span className="flex items-center gap-1 max-md:basis-full max-md:ps-7">
                <Badge variant="secondary" className="h-auto gap-1 whitespace-normal max-md:me-auto">
                  <ShieldCheckIcon className="text-success" aria-hidden />
                  {o.kbsReportedByName
                    ? t('inHouse.kbs.reportedBy', {
                        when: when(o.kbsReportedAt as string),
                        name: o.kbsReportedByName
                      })
                    : t('inHouse.kbs.reported', { when: when(o.kbsReportedAt as string) })}
                </Badge>
                {canEdit ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className="text-muted-foreground print:hidden"
                        disabled={busy}
                        onClick={() => onMark(o.id, 'clearReported')}
                        aria-label={t('inHouse.kbs.undoFor', { name: o.fullName })}
                      >
                        <Undo2Icon className="rtl:-scale-x-100" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t('inHouse.kbs.undo')}</TooltipContent>
                  </Tooltip>
                ) : null}
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}
