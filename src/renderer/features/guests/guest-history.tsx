// Price and payment history (G-190, G-46; the owner's favourite): every stay, newest first, with the rooms, the
// nights and their prices, what was paid and how, the balance; and the summary of the shared rule (§6.12) — the
// same `guests.guestHistory` the reservation panel's summary card reads, so both show the same numbers. Upcoming
// stays sit on top; "Bu fiyatı yeni rezervasyona uygula" opens a new reservation with the last nightly price.
import { Trans, useTranslation } from 'react-i18next'
import { CalendarClockIcon, CalendarPlusIcon, ChevronDownIcon } from 'lucide-react'
import { diffDays } from '@shared/date'
import type { GuestHistoryDto, HistoryStayDto } from '@shared/contract/procedures/guests'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { useFormat } from '@/hooks/use-format'
import { cn } from '@/lib/utils'
import { useListNames } from './guests-api'
import { priceRuns, splitStays } from './history-rules'

/**
 * The numbers on top of the card: last stay, the last nightly price (with the shortcut), the average and the
 * total paid — the reservation panel's summary card shows the same values.
 */
export function HistorySummary({
  history,
  showMoney,
  onApplyPrice
}: {
  history: GuestHistoryDto
  showMoney: boolean
  /** "Bu fiyatı yeni rezervasyona uygula" (shown when the user may write reservations). */
  onApplyPrice?: (price: { amountMinor: number; currency: string }) => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const counted = history.stays.filter((s) => s.status !== 'cancelled').length
  const avgCurrency = history.lastNightly?.currency ?? Object.keys(history.averageNightly)[0]
  const avg = avgCurrency !== undefined ? history.averageNightly[avgCurrency] : undefined
  const spent = Object.entries(history.totalSpent)
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="history-summary">
      <div className="rounded-lg border p-2.5">
        <dt className="text-muted-foreground text-xs">{t('guests.summary.lastStay')}</dt>
        <dd className="text-base font-semibold" data-testid="summary-last-stay">
          {history.lastStayDate ? f.date(history.lastStayDate, 'medium') : '—'}
        </dd>
        <dd className="text-muted-foreground text-xs">{t('guests.summary.stays', { count: counted })}</dd>
      </div>
      <div className="border-primary/40 bg-accent/60 grid content-start gap-0.5 rounded-lg border p-2.5">
        <dt className="text-muted-foreground text-xs">{t('guests.summary.lastPrice')}</dt>
        <dd className="text-base font-semibold tabular-nums" data-testid="summary-last-price">
          <bdi>
            {history.lastNightly
              ? f.money(history.lastNightly.amountMinor, history.lastNightly.currency)
              : '—'}
          </bdi>
        </dd>
        {history.lastNightly && onApplyPrice ? (
          <dd>
            <Button
              variant="link"
              size="sm"
              className="h-auto min-h-8 px-0 text-xs whitespace-normal max-md:min-h-11"
              onClick={() => history.lastNightly && onApplyPrice(history.lastNightly)}
              data-testid="apply-last-price"
            >
              <CalendarPlusIcon aria-hidden />
              {t('guests.summary.applyPrice')}
            </Button>
          </dd>
        ) : (
          <dd className="text-muted-foreground text-xs">{t('guests.summary.perNight')}</dd>
        )}
      </div>
      <div className="rounded-lg border p-2.5">
        <dt className="text-muted-foreground text-xs">{t('guests.summary.average')}</dt>
        <dd className="text-base font-semibold tabular-nums" data-testid="summary-average">
          <bdi>{avg !== undefined && avgCurrency ? f.money(avg, avgCurrency) : '—'}</bdi>
        </dd>
        <dd className="text-muted-foreground text-xs">
          {t('calendar.nights', { count: history.totalNights })}
        </dd>
      </div>
      {showMoney ? (
        <div className="rounded-lg border p-2.5">
          <dt className="text-muted-foreground text-xs">{t('guests.summary.paid')}</dt>
          <dd className="text-base font-semibold tabular-nums" data-testid="summary-paid">
            {spent.length
              ? spent.map(([currency, minor]) => (
                  <bdi key={currency} className="block">
                    {f.money(minor, currency)}
                  </bdi>
                ))
              : '—'}
          </dd>
          <dd className="text-muted-foreground text-xs">{t('guests.summary.paidHint')}</dd>
        </div>
      ) : null}
    </dl>
  )
}

function StayCard({
  stay,
  upcoming,
  showMoney,
  showGuest
}: {
  stay: HistoryStayDto & { guestName?: string }
  upcoming?: boolean
  showMoney: boolean
  /** Company history: whose stay it was. */
  showGuest?: boolean
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const lists = useListNames()
  const methods = stay.methodIds.map((id) => lists.method(id)).filter(Boolean)
  const nights = Math.max(1, diffDays(stay.checkIn, stay.checkOut))
  const runs = priceRuns(stay.nights)
  return (
    <li
      className={cn('grid gap-2 rounded-lg border p-3 text-sm', upcoming && 'border-dashed')}
      data-testid={`history-${stay.reservationId}`}
    >
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1">
          <p className="font-medium">
            {f.dayMonth(stay.checkIn)} – {f.date(stay.checkOut, 'medium')}
          </p>
          <p className="text-muted-foreground text-xs">
            {[
              showGuest && stay.guestName ? stay.guestName : null,
              t('guests.history.room', { room: stay.roomNumber }),
              stay.checkIn === stay.checkOut
                ? t('guests.history.dayUse')
                : t('calendar.nights', { count: nights }),
              lists.channel(stay.channelId) || null
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        {showMoney ? (
          <div className="text-end">
            <p className="font-semibold tabular-nums">
              <bdi>{f.money(stay.paidMinor, stay.currency)}</bdi>
            </p>
            <p className="text-muted-foreground text-xs">
              {methods.length ? methods.join(', ') : t('guests.history.noPayment')}
            </p>
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {runs.length ? (
          <span className="text-muted-foreground text-xs">{t('guests.history.nightly')}</span>
        ) : null}
        {runs.map((run, i) => (
          <Badge key={i} variant="secondary" className="tabular-nums">
            <bdi>
              {run.count > 1 ? `${run.count} × ` : null}
              {f.money(run.priceMinor, run.currency)}
            </bdi>
          </Badge>
        ))}
        <span className="ms-auto flex flex-wrap items-center gap-2">
          {stay.status !== 'checked_out' ? (
            <Badge variant="outline">{t(`calendar.resStatus.${stay.status}`)}</Badge>
          ) : null}
          {showMoney && stay.balanceMinor > 0 && stay.status !== 'cancelled' ? (
            <span className="text-destructive text-xs font-medium">
              <Trans
                i18nKey="guests.history.balance"
                values={{ amount: f.money(stay.balanceMinor, stay.currency) }}
                components={{ m: <bdi className="tabular-nums" /> }}
              />
            </span>
          ) : null}
        </span>
      </div>
      {stay.nights.length > 1 ? (
        <Collapsible>
          <CollapsibleTrigger className="text-muted-foreground hover:text-foreground focus-visible:ring-ring group flex min-h-8 items-center gap-1 rounded-sm text-xs outline-none focus-visible:ring-[3px] max-md:min-h-11">
            <ChevronDownIcon
              className="size-3.5 transition-transform group-data-[state=open]:rotate-180"
              aria-hidden
            />
            {t('guests.history.byNight')}
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="mt-1 grid gap-1" aria-label={t('guests.history.byNight')}>
              {stay.nights.map((n, i) => (
                <li key={`${n.date}-${i}`} className="flex items-center gap-3 rounded-md px-1 py-0.5 text-xs">
                  <span className="w-28 shrink-0">{f.date(n.date, 'medium')}</span>
                  <span className="text-muted-foreground w-10 shrink-0">{f.weekday(n.date)}</span>
                  <span className="ms-auto font-medium tabular-nums">
                    <bdi>{f.money(n.priceMinor, n.currency)}</bdi>
                  </span>
                </li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </li>
  )
}

export function StayList({
  stays,
  showMoney,
  showGuest
}: {
  stays: readonly (HistoryStayDto & { guestName?: string })[]
  showMoney: boolean
  showGuest?: boolean
}) {
  const { t } = useTranslation()
  const { upcoming, past } = splitStays(stays)
  return (
    <div className="grid gap-4">
      {upcoming.length ? (
        <section className="grid gap-2" aria-label={t('guests.history.upcoming')}>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <CalendarClockIcon className="text-muted-foreground size-4" aria-hidden />
            {t('guests.history.upcoming')}
          </h3>
          <ul className="grid gap-2">
            {upcoming.map((stay) => (
              <StayCard
                key={stay.reservationId}
                stay={stay}
                upcoming
                showMoney={showMoney}
                showGuest={showGuest}
              />
            ))}
          </ul>
        </section>
      ) : null}
      <section className="grid gap-2" aria-label={t('guests.history.past')}>
        <h3 className="text-sm font-semibold">{t('guests.history.past')}</h3>
        {past.length ? (
          <ul className="grid gap-2" data-testid="history-list">
            {past.map((stay) => (
              <StayCard key={stay.reservationId} stay={stay} showMoney={showMoney} showGuest={showGuest} />
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">{t('guests.history.none')}</p>
        )}
      </section>
    </div>
  )
}
