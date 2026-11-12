// "Yeni gelir → rezervasyon seç (arama)": the reservations in the hotel on the chosen day are listed at once; typing
// a guest name, a room number or a reservation code searches every reservation. Each hit shows the room, the guest
// and what is still owed, so the payment goes on the right folio (the same one the reservation panel shows).
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SearchIcon, XIcon } from 'lucide-react'
import type { LocalDate } from '@shared/date'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useFormat } from '@/hooks/use-format'
import { useApiQuery } from '@/lib/api/hooks'
import { cn } from '@/lib/utils'
import { useDebounced } from './use-debounced'
import type { ReservationHit } from './ledger-api'

export function ReservationPicker({
  day,
  value,
  onChange,
  label,
  invalid
}: {
  day: LocalDate
  value: ReservationHit | null
  onChange: (hit: ReservationHit | null) => void
  label: string
  invalid?: boolean
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const id = useId()
  const [q, setQ] = useState('')
  const settled = useDebounced(q.trim(), 250)
  const query = useApiQuery(
    'ledger.searchReservations',
    { date: day, ...(settled ? { q: settled } : {}) },
    { enabled: !value, staleTime: 10_000 }
  )
  const hitLabel = (h: ReservationHit): string => [h.roomNumbers.join(', ') || '—', h.guestName].join(' · ')
  if (value)
    return (
      <div className="grid gap-1.5">
        <span className="text-sm font-medium">{label}</span>
        <div
          className="flex min-h-9 items-center gap-2 rounded-md border px-3 py-1.5"
          data-testid="picked-reservation"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium break-words">{hitLabel(value)}</span>
            <span className="text-muted-foreground block text-xs">
              {f.dayMonth(value.checkIn)} – {f.dayMonth(value.checkOut)} ·{' '}
              {t('ledger.pay.balance', { amount: f.money(value.balanceMinor, value.currency) })}
            </span>
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="max-md:size-11"
            aria-label={t('ledger.pay.changeReservation')}
            onClick={() => onChange(null)}
          >
            <XIcon />
          </Button>
        </div>
      </div>
    )
  const hits = query.data ?? []
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <div className="relative">
        <SearchIcon
          className="text-muted-foreground pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2"
          aria-hidden
        />
        <Input
          id={id}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('ledger.pay.searchPlaceholder')}
          className="ps-8"
          autoComplete="off"
          aria-invalid={invalid || undefined}
          aria-controls={`${id}-list`}
          data-testid="reservation-search"
        />
      </div>
      <ul
        id={`${id}-list`}
        aria-label={label}
        className="grid max-h-56 gap-1 overflow-y-auto rounded-md border p-1"
      >
        {query.isPending ? (
          <li>
            <Skeleton className="h-10 w-full" />
          </li>
        ) : !hits.length ? (
          <li className="text-muted-foreground px-2 py-3 text-sm">
            {settled ? t('ledger.pay.noMatch') : t('ledger.pay.noneToday')}
          </li>
        ) : (
          hits.map((h) => (
            <li key={h.reservationId}>
              <button
                type="button"
                className={cn(
                  'hover:bg-accent focus-visible:ring-ring flex min-h-10 w-full items-center gap-3 rounded-md px-2 py-1.5 text-start text-sm outline-none focus-visible:ring-[3px] max-md:min-h-11'
                )}
                onClick={() => onChange(h)}
                data-testid="reservation-hit"
              >
                <span className="bg-muted grid h-8 min-w-10 place-items-center rounded px-1 text-xs font-semibold tabular-nums">
                  {h.roomNumbers[0] ?? '—'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium break-words">{h.guestName}</span>
                  <span className="text-muted-foreground block text-xs">
                    {f.dayMonth(h.checkIn)} – {f.dayMonth(h.checkOut)}
                  </span>
                </span>
                <bdi className={cn('tabular-nums', h.balanceMinor > 0 && 'text-destructive font-medium')}>
                  {f.money(h.balanceMinor, h.currency)}
                </bdi>
              </button>
            </li>
          ))
        )}
      </ul>
      {invalid ? <p className="text-destructive text-xs">{t('ledger.pay.pickReservation')}</p> : null}
    </div>
  )
}
