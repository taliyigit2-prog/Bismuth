// Quick reservation bar (P17c, G-195): a click on an empty cell opens it above the grid — name, people, nights,
// nightly price, channel. Enter saves a confirmed reservation for that room from that day; "Ayrıntı" hands the cell
// to the full form. The price is the room type's suggestion (weekend nights included) until the desk types its own.
import { useId, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { XIcon, ZapIcon } from 'lucide-react'
import { addDays, type LocalDate } from '@shared/date'
import { MAX_STAY_NIGHTS } from '@shared/contract/reservations'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FieldError } from '@/components/field-error'
import { isAmount, MoneyInput, type MoneyValue } from '@/components/money-input'
import { useOverAmountConfirm } from '@/components/money-input-confirm'
import { useFormat } from '@/hooks/use-format'
import { deferForPendingAmount } from '@/features/settings/use-admin'
import { useApiQuery } from '@/lib/api/hooks'
import { splitGuestName } from './split-guest-name'
import { localName, useBookingMutation, useBookingOptions } from './booking-api'
import { GUEST_NAME_MAX } from './booking-limits'

/** The contract's longest first / last name; no limit read = none enforced. */
const NAME_MAX = GUEST_NAME_MAX ?? Number.POSITIVE_INFINITY

export interface QuickSeed {
  roomId: string
  roomNumber: string
  date: LocalDate
}

/** The contract's most adults on one reservation (reservationCreateSchema.adults). */
const MAX_ADULTS = 50

const intOf = (text: string): number => (/^\d{1,4}$/.test(text.trim()) ? Number(text.trim()) : Number.NaN)

export function QuickBookBar({
  seed,
  onClose,
  onDetail
}: {
  seed: QuickSeed
  onClose: () => void
  /** Hand the cell to the full form (with the nights typed so far). */
  onDetail: (seed: QuickSeed) => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const options = useBookingOptions()
  const formId = useId()
  const [name, setName] = useState('')
  const [adults, setAdults] = useState('1')
  const [nights, setNights] = useState('1')
  const [price, setPrice] = useState<MoneyValue>({ amountMinor: null, currency: '' })
  const [touched, setTouched] = useState(false)
  const [channelPick, setChannelPick] = useState('')
  const [tried, setTried] = useState(false)
  /** The nightly prices the "0 price" question was answered "save anyway" for (same rule as the full form, H-08). */
  const [zeroOkFor, setZeroOkFor] = useState<string | null>(null)
  const zero = useOverAmountConfirm()
  const nameRef = useRef<HTMLInputElement>(null)
  const nightsN = intOf(nights)
  const nightsOk = Number.isInteger(nightsN) && nightsN >= 1 && nightsN <= MAX_STAY_NIGHTS
  const checkOut = addDays(seed.date, nightsOk ? nightsN : 1)
  const suggestion = useApiQuery(
    'booking.suggestPrices',
    { roomId: seed.roomId, checkIn: seed.date, checkOut },
    { enabled: nightsOk, staleTime: 30_000 }
  )
  const channelId = channelPick || options.data?.channels[0]?.id || ''
  const suggested = suggestion.data ?? null
  const currency = touched
    ? price.currency
    : (suggested?.currency ?? options.data?.baseCurrency ?? price.currency)
  const shown: MoneyValue = touched
    ? price
    : { amountMinor: suggested?.nights[0]?.priceMinor ?? null, currency }
  const save = useBookingMutation('booking.create', {
    success: t('booking.toast.created'),
    onSuccess: onClose
  })

  const guest = splitGuestName(name)
  const problems = {
    name: !name.trim(),
    // The contract takes a first and a last name of at most GUEST_NAME_MAX each; the field is split the same way.
    nameLong: guest.firstName.length > NAME_MAX || guest.lastName.length > NAME_MAX,
    nights: !nightsOk,
    adults: !(intOf(adults) >= 1 && intOf(adults) <= MAX_ADULTS),
    price: touched ? !isAmount(shown) : !suggested && !isAmount(shown)
  }
  const submit = (e: FormEvent): void => {
    e.preventDefault()
    if (deferForPendingAmount(e.currentTarget as HTMLFormElement)) return
    // The suggestion for the new number of nights is still on its way: the price would be the old nights'.
    if (!touched && suggestion.isFetching) return
    setTried(true)
    if (Object.values(problems).some(Boolean) || !channelId) return
    const prices =
      !touched && suggested ? suggested.nights.map((n) => n.priceMinor) : [shown.amountMinor ?? 0]
    const priceKey = `${currency}:${prices.join(',')}`
    if (prices.some((p) => p === 0) && zeroOkFor !== priceKey) {
      return zero.ask({
        title: t('booking.price.zeroTitle'),
        body: t('booking.price.zeroBody'),
        action: t('booking.price.zeroAction'),
        go: () => {
          setZeroOkFor(priceKey)
          // Sent again once the answer is kept (the state is read by the next submit).
          setTimeout(() => (document.getElementById(formId) as HTMLFormElement | null)?.requestSubmit(), 0)
        }
      })
    }
    save.mutate({
      guest,
      channelId,
      status: 'confirmed',
      adults: intOf(adults),
      currency,
      stays: [
        {
          roomId: seed.roomId,
          checkIn: seed.date,
          checkOut,
          ...(!touched && suggested
            ? { prices: suggested.nights.map((n) => ({ date: n.date, priceMinor: n.priceMinor })) }
            : { nightlyPriceMinor: shown.amountMinor ?? 0 })
        }
      ]
    })
  }

  return (
    <form
      id={formId}
      noValidate
      onSubmit={submit}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onClose()
        }
      }}
      className="bg-card grid gap-3 rounded-xl border p-3"
      aria-label={t('calendar.quick.title', { room: seed.roomNumber, date: f.dayMonth(seed.date) })}
      data-testid="quick-book"
    >
      <div className="flex items-center gap-2">
        <ZapIcon className="text-primary size-4 shrink-0" aria-hidden />
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">
          {t('calendar.quick.title', { room: seed.roomNumber, date: f.dayMonth(seed.date) })}
        </h2>
        <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label={t('common.close')}>
          <XIcon aria-hidden />
        </Button>
      </div>
      <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_5rem_5rem_minmax(0,1.5fr)_minmax(0,1.5fr)]">
        <div className="grid gap-1.5">
          <Label htmlFor={`${formId}-name`}>{t('calendar.quick.name')}</Label>
          <Input
            id={`${formId}-name`}
            ref={nameRef}
            autoFocus
            autoComplete="off"
            value={name}
            maxLength={Number.isFinite(NAME_MAX) ? 2 * NAME_MAX + 1 : undefined}
            aria-invalid={tried && (problems.name || problems.nameLong) ? true : undefined}
            onChange={(e) => setName(e.target.value)}
            data-testid="quick-name"
          />
          <FieldError
            message={
              tried &&
              ((problems.name && t('calendar.quick.errors.name')) ||
                (problems.nameLong && t('calendar.quick.errors.nameLong', { max: NAME_MAX })))
            }
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${formId}-adults`}>{t('calendar.quick.people')}</Label>
          <Input
            id={`${formId}-adults`}
            dir="ltr"
            inputMode="numeric"
            autoComplete="off"
            value={adults}
            aria-invalid={tried && problems.adults ? true : undefined}
            onChange={(e) => setAdults(e.target.value)}
            data-testid="quick-adults"
          />
          <FieldError
            message={tried && problems.adults && t('calendar.quick.errors.people', { max: MAX_ADULTS })}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${formId}-nights`}>{t('calendar.quick.nights')}</Label>
          <Input
            id={`${formId}-nights`}
            dir="ltr"
            inputMode="numeric"
            autoComplete="off"
            value={nights}
            aria-invalid={tried && problems.nights ? true : undefined}
            onChange={(e) => setNights(e.target.value)}
            data-testid="quick-nights"
          />
          <FieldError
            message={tried && problems.nights && t('calendar.quick.errors.nights', { max: MAX_STAY_NIGHTS })}
          />
        </div>
        {options.data ? (
          <MoneyInput
            id={`${formId}-price`}
            label={t('calendar.quick.price')}
            value={shown}
            currencies={options.data?.currencies ?? [currency]}
            error={tried && problems.price ? t('calendar.quick.errors.price') : null}
            onChange={(v) => {
              setPrice(v)
              setTouched(true)
            }}
          />
        ) : (
          <Skeleton className="h-16 w-full" />
        )}
        <div className="grid gap-1.5">
          <Label htmlFor={`${formId}-channel`}>{t('calendar.new.channel')}</Label>
          <Select value={channelId} onValueChange={setChannelPick}>
            <SelectTrigger id={`${formId}-channel`} className="w-full" data-testid="quick-channel">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(options.data?.channels ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {localName(f, c)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => onDetail(seed)} data-testid="quick-detail">
          {t('calendar.quick.detail')}
        </Button>
        <Button
          type="submit"
          disabled={save.isPending || (!touched && suggestion.isFetching)}
          data-testid="quick-save"
        >
          {t('common.save')}
        </Button>
      </div>
      {zero.dialog}
    </form>
  )
}
