// "Oda ve tarih" filter of the guest list (G-190, K-46 (3): "302'de Mart'ta kim kaldı"): a room number and the days
// a stay touched; the matching stays show under the guest's name, a cancelled or no-show one with its state.
import { useTranslation } from 'react-i18next'
import { BedDoubleIcon, XIcon } from 'lucide-react'
import type { GuestListRowDto } from '@shared/contract/procedures/guests'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DateInput } from '@/components/date-input'
import { useFormat } from '@/hooks/use-format'
import { cn } from '@/lib/utils'
import { NO_STAY_FILTER, stayFilterActive, type StayFilterValue } from './stay-filter-value'

/** The toggle next to the sort: opens the fields; marked while a room or a day is set. */
export function StayFilterToggle({
  open,
  active,
  onToggle
}: {
  open: boolean
  active: boolean
  onToggle: () => void
}) {
  const { t } = useTranslation()
  return (
    <Button
      type="button"
      variant={active ? 'secondary' : 'outline'}
      aria-expanded={open}
      aria-controls="guest-stay-filter"
      onClick={onToggle}
      className="max-md:basis-full"
      data-testid="stay-filter-toggle"
    >
      <BedDoubleIcon aria-hidden />
      {t('guests.stayFilter.button')}
      {active ? (
        <>
          <span className="bg-primary size-2 rounded-full" aria-hidden />
          <span className="sr-only">{t('guests.stayFilter.on')}</span>
        </>
      ) : null}
    </Button>
  )
}

/** Room number and the two days (both included). */
export function StayFilterFields({
  value,
  onChange
}: {
  value: StayFilterValue
  onChange: (value: StayFilterValue) => void
}) {
  const { t } = useTranslation()
  return (
    <fieldset
      id="guest-stay-filter"
      className="bg-card grid gap-3 rounded-xl border p-3 md:grid-cols-[8rem_minmax(0,14rem)_minmax(0,14rem)_auto] md:items-end"
      data-testid="stay-filter"
    >
      <legend className="sr-only">{t('guests.stayFilter.button')}</legend>
      <div className="grid gap-1.5">
        <label htmlFor="stay-filter-room" className="text-sm font-medium">
          {t('guests.stayFilter.room')}
        </label>
        <Input
          id="stay-filter-room"
          dir="ltr"
          autoComplete="off"
          maxLength={20}
          value={value.room}
          placeholder={t('guests.stayFilter.roomPlaceholder')}
          onChange={(e) => onChange({ ...value, room: e.target.value })}
          className="max-md:text-base"
          data-testid="stay-filter-room"
        />
      </div>
      <DateInput
        label={t('guests.stayFilter.from')}
        value={value.from}
        max={value.to ?? undefined}
        placeholder={t('guests.stayFilter.anyDay')}
        onChange={(from) => onChange({ ...value, from })}
      />
      <DateInput
        label={t('guests.stayFilter.to')}
        value={value.to}
        min={value.from ?? undefined}
        placeholder={t('guests.stayFilter.anyDay')}
        onChange={(to) => onChange({ ...value, to })}
      />
      <Button
        type="button"
        variant="ghost"
        disabled={!stayFilterActive(value)}
        onClick={() => onChange(NO_STAY_FILTER)}
        className="md:justify-self-start"
        data-testid="stay-filter-clear"
      >
        <XIcon aria-hidden />
        {t('guests.stayFilter.clear')}
      </Button>
      <p className="text-muted-foreground text-xs md:col-span-4">{t('guests.stayFilter.help')}</p>
    </fieldset>
  )
}

/** The stays that matched the filter, under the guest's name (at most two, then "+n"). */
export function MatchedStays({ row, className }: { row: GuestListRowDto; className?: string }) {
  const { t } = useTranslation()
  const f = useFormat()
  const stays = row.matchedStays
  if (!stays?.length) return null
  return (
    <span className={cn('grid gap-0.5 text-xs', className)} data-testid={`matched-stays-${row.id}`}>
      {stays.slice(0, 2).map((s) => (
        <span key={`${s.reservationId}-${s.checkIn}`} className="flex flex-wrap items-center gap-1.5">
          <span className="text-muted-foreground">
            {t('guests.stayFilter.stay', {
              room: s.roomNumber,
              from: f.date(s.checkIn, 'medium'),
              to: f.date(s.checkOut, 'medium')
            })}
          </span>
          {s.status === 'cancelled' || s.status === 'no_show' ? (
            <Badge variant="outline" className="text-destructive">
              {t(`calendar.resStatus.${s.status}`)}
            </Badge>
          ) : null}
        </span>
      ))}
      {stays.length > 2 ? (
        <span className="text-muted-foreground">
          {t('guests.stayFilter.moreStays', { count: stays.length - 2 })}
        </span>
      ) : null}
    </span>
  )
}
