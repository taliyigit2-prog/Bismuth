// Guest history in the reservation panel (faz-05 madde 7b; G-46, G-190, G-192, §6.12): last stay, the last nightly
// price paid, total nights and spending (§6.12 counted stays: the reservation the panel shows is not its own "last
// stay"); one click opens the earlier stays with their prices, another the guest card with the whole history. The
// standing request ("her gelişinde") is a yellow box, the important level red (it asks for a confirmation).
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import {
  AlertTriangleIcon,
  ChevronDownIcon,
  CrownIcon,
  ExternalLinkIcon,
  HistoryIcon,
  InfoIcon
} from 'lucide-react'
import type { LocalDate } from '@shared/date'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Skeleton } from '@/components/ui/skeleton'
import { useFormat } from '@/hooks/use-format'
import { useApiQuery } from '@/lib/api/hooks'
import { cn } from '@/lib/utils'
import { useCan } from '@/lib/view-as'
import { requestGuestCard } from '@/features/guests/guest-card-request'
import { GuestTagBadges } from '@/features/guests/guest-tags'

export interface StandingNote {
  text: string
  level: 'info' | 'warn'
}

/** The standing request of a guest: yellow box (info) or red (important). */
export function StandingNoteAlert({ note, className }: { note: StandingNote; className?: string }) {
  const { t } = useTranslation()
  const warn = note.level === 'warn'
  return (
    <Alert
      data-testid="standing-note"
      className={cn(
        warn ? 'border-destructive/60 bg-destructive/5' : 'border-warning bg-warning/15',
        className
      )}
    >
      {warn ? <AlertTriangleIcon className="text-destructive" /> : <InfoIcon />}
      <AlertTitle>{t(warn ? 'booking.standing.warnTitle' : 'booking.standing.infoTitle')}</AlertTitle>
      <AlertDescription className="text-foreground">{note.text}</AlertDescription>
    </Alert>
  )
}

export function GuestSummaryCard({
  guestId,
  showNote = true,
  excludeReservationId
}: {
  guestId: string
  showNote?: boolean
  /** The reservation the panel shows: left out of the history ("son konaklama" is an earlier one). */
  excludeReservationId?: string
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const can = useCan()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const query = useApiQuery(
    'booking.guestSummary',
    excludeReservationId ? { guestId, excludeReservationId } : { guestId },
    { staleTime: 30_000 }
  )
  if (query.isPending)
    return (
      <div role="status" aria-busy className="grid gap-2 rounded-lg border p-3">
        <span className="sr-only">{t('common.loading')}</span>
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-4 w-full" />
      </div>
    )
  // History is a help, not the task: a refusal (no guest rights) or an error simply leaves it out.
  if (query.isError) return null
  const s = query.data
  const totals = Object.entries(s.totalSpent)
  return (
    <section className="grid gap-3" aria-label={t('booking.history.title')} data-testid="guest-summary">
      {showNote && s.standingNote ? <StandingNoteAlert note={s.standingNote} /> : null}
      <div className="bg-muted/50 grid gap-2 rounded-lg p-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <HistoryIcon className="text-muted-foreground size-4" aria-hidden />
          {t('booking.history.title')}
          {s.vip ? (
            <Badge variant="secondary" className="gap-1">
              <CrownIcon className="text-warning" aria-hidden />
              {t('guestCombo.vip')}
            </Badge>
          ) : null}
        </h3>
        <GuestTagBadges tagIds={s.tagIds} testId="guest-summary-tags" />
        {s.stayCount === 0 ? (
          <p className="text-muted-foreground text-sm">{t('calendar.panel.firstStay')}</p>
        ) : (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div>
              <dt className="text-muted-foreground text-xs">{t('booking.history.lastStay')}</dt>
              <dd className="font-medium">
                {s.lastStayDate ? f.date(s.lastStayDate as LocalDate, 'medium') : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">{t('booking.history.lastNightly')}</dt>
              <dd className="font-medium tabular-nums" data-testid="last-nightly">
                {s.lastNightly ? (
                  <bdi>{f.money(s.lastNightly.amountMinor, s.lastNightly.currency)}</bdi>
                ) : (
                  '—'
                )}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">{t('booking.history.stays')}</dt>
              <dd className="font-medium">
                {t('booking.history.staysValue', { count: s.stayCount, nights: s.totalNights })}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">{t('booking.history.spent')}</dt>
              <dd className="font-medium tabular-nums">
                {totals.length
                  ? totals.map(([currency, minor]) => (
                      <bdi key={currency} className="block">
                        {f.money(minor, currency)}
                      </bdi>
                    ))
                  : '—'}
              </dd>
            </div>
          </dl>
        )}
        {s.recent.length ? (
          <Collapsible open={open} onOpenChange={setOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="-ms-2 justify-self-start">
                <ChevronDownIcon className={cn('transition-transform', open && 'rotate-180')} aria-hidden />
                {t(open ? 'booking.history.hide' : 'booking.history.show')}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ul className="grid gap-1.5" aria-label={t('booking.history.list')}>
                {s.recent.map((r) => (
                  <li
                    key={r.reservationId}
                    className="bg-background flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-md border px-3 py-1.5 text-sm"
                  >
                    <span className="font-medium tabular-nums">{r.roomNumber}</span>
                    <span>
                      {f.dayMonth(r.checkIn as LocalDate)} – {f.date(r.checkOut as LocalDate, 'medium')}
                    </span>
                    {r.status === 'cancelled' ? (
                      <Badge variant="outline">{t('calendar.resStatus.cancelled')}</Badge>
                    ) : null}
                    <span className="text-muted-foreground ms-auto text-xs tabular-nums">
                      {r.nightlyMinor !== null ? (
                        <bdi>
                          {t('booking.history.perNight', { price: f.money(r.nightlyMinor, r.currency) })}
                        </bdi>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </CollapsibleContent>
          </Collapsible>
        ) : null}
        {can('guests') ? (
          <Button
            variant="link"
            size="sm"
            className="-ms-2 justify-self-start"
            data-testid="open-guest-card"
            onClick={() => {
              requestGuestCard(guestId)
              void navigate({ to: '/guests' })
            }}
          >
            <ExternalLinkIcon aria-hidden />
            {t('booking.history.openCard')}
          </Button>
        ) : null}
      </div>
    </section>
  )
}
