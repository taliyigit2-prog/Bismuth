// Hourly stay sale (K-48, S-102…S-105; P17d): one room, one day, a start and an end time and the amount the desk
// types (required; the room type's hour price is only suggested). Several hourly sales in one room and day are fine
// as long as their hours do not overlap; a clash is refused with the hours in the way, a cleaning gap that is too
// short is only a warning. The guest is typed in two fields (an hourly guest rarely comes back); the blacklist
// tick works as in the new reservation form.
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { ClockIcon, TriangleAlertIcon } from 'lucide-react'
import { localDateOf, type LocalDate } from '@shared/date'
import { isValidHourRange } from '@shared/domain/stays'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { DateInput } from '@/components/date-input'
import { MoneyInput, type MoneyValue } from '@/components/money-input'
import { ResponsiveDialog } from '@/components/responsive-dialog'
import { ErrorState } from '@/components/states'
import { TimeInput } from '@/components/time-input'
import { useFormat } from '@/hooks/use-format'
import { useApiQuery } from '@/lib/api/hooks'
import type { ApiError } from '@/lib/transport/types'
import { deferForPendingAmount } from '@/features/settings/use-admin'
import {
  localName,
  requestPanel,
  useBookingMutation,
  useBookingOptions,
  type BlacklistHit
} from './booking-api'
import { GUEST_NAME_MAX } from './booking-limits'
import { BlacklistWarning } from './new-reservation-dialog'

export interface HourlySeed {
  roomId: string | null
  date: LocalDate
}

export function HourlyStayDialog({
  seed,
  onOpenChange
}: {
  seed: HourlySeed | null
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const options = useBookingOptions(!!seed)
  return (
    <ResponsiveDialog
      open={!!seed}
      onOpenChange={onOpenChange}
      title={t('booking.hourly.title')}
      description={t('booking.hourly.description')}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="hourly-stay-form" data-testid="hourly-save" disabled={!options.data}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      {!seed ? null : options.isPending ? (
        <div role="status" aria-busy className="grid gap-3">
          <span className="sr-only">{t('common.loading')}</span>
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : options.isError ? (
        <ErrorState error={options.error} onRetry={() => void options.refetch()} />
      ) : (
        <HourlyStayForm
          seed={seed}
          options={options.data}
          onDone={(id) => {
            onOpenChange(false)
            requestPanel(id)
          }}
        />
      )}
    </ResponsiveDialog>
  )
}

function HourlyStayForm({
  seed,
  options,
  onDone
}: {
  seed: HourlySeed
  options: NonNullable<ReturnType<typeof useBookingOptions>['data']>
  onDone: (reservationId: string) => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [roomId, setRoomId] = useState(
    seed.roomId && options.rooms.some((r) => r.id === seed.roomId) ? seed.roomId : ''
  )
  const [date, setDate] = useState<LocalDate>(seed.date)
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  /** Typed by hand; null until the desk touches the field, so the suggestion fills it. */
  const [typed, setTyped] = useState<number | null>(null)
  const [touched, setTouched] = useState(false)
  const [channelId, setChannelId] = useState(options.channels[0]?.id ?? '')
  const [serverHits, setServerHits] = useState<BlacklistHit[] | null>(null)
  const [blacklistOk, setBlacklistOk] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const room = options.rooms.find((r) => r.id === roomId)
  const rangeOk = isValidHourRange(start, end)
  const check = useApiQuery(
    'booking.hourlyCheck',
    { roomId, date, startTime: start, endTime: end },
    { enabled: !!roomId && rangeOk }
  )
  const currency = check.data?.currency ?? room?.priceCurrency ?? options.baseCurrency
  const suggested = check.data?.suggestedMinor ?? null
  const amount: MoneyValue = {
    amountMinor: touched ? typed : (suggested ?? typed),
    currency
  }

  const create = useBookingMutation('booking.createHourlyStay', {
    success: t('booking.hourly.toast.created'),
    onSuccess: (view) => onDone(view.reservation.id),
    onError: (e: ApiError) => {
      if (e.messageKey === 'errors.blacklistMatch') {
        const details = e.details as { hits?: BlacklistHit[] } | undefined
        setServerHits(details?.hits ?? [])
        setBlacklistOk(false)
        return true
      }
      return false
    }
  })

  const submit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault()
    if (deferForPendingAmount(e.currentTarget)) return
    setError(null)
    if (!firstName.trim()) return setError(t('booking.hourly.needGuest'))
    if (!room) return setError(t('booking.hourly.needRoom'))
    if (!channelId) return setError(t('booking.form.needChannel'))
    if (!rangeOk) return setError(t('booking.hourly.badRange'))
    if (!amount.amountMinor || amount.amountMinor <= 0) return setError(t('booking.hourly.needAmount'))
    if (serverHits?.length && !blacklistOk) return setError(t('booking.blacklist.confirmFirst'))
    create.mutate({
      guest: {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim() || null
      },
      channelId,
      roomId: room.id,
      date,
      startTime: start,
      endTime: end,
      priceMinor: amount.amountMinor,
      currency,
      blacklistConfirmed: serverHits?.length ? blacklistOk : undefined
    })
  }

  return (
    <form id="hourly-stay-form" className="grid gap-4 sm:grid-cols-2" onSubmit={submit} noValidate>
      <div className="grid gap-1.5">
        <Label htmlFor="hourly-first">{t('booking.newGuest.firstName')}</Label>
        <Input
          id="hourly-first"
          value={firstName}
          maxLength={GUEST_NAME_MAX}
          autoComplete="off"
          data-testid="hourly-first"
          onChange={(e) => {
            setFirstName(e.target.value)
            setServerHits(null)
          }}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="hourly-last">{t('booking.newGuest.lastName')}</Label>
        <Input
          id="hourly-last"
          value={lastName}
          maxLength={GUEST_NAME_MAX}
          autoComplete="off"
          data-testid="hourly-last"
          onChange={(e) => {
            setLastName(e.target.value)
            setServerHits(null)
          }}
        />
      </div>
      <div className="grid gap-1.5 sm:col-span-2">
        <Label htmlFor="hourly-phone">{t('booking.newGuest.phone')}</Label>
        <Input
          id="hourly-phone"
          type="tel"
          dir="ltr"
          value={phone}
          autoComplete="off"
          onChange={(e) => setPhone(e.target.value)}
        />
      </div>
      {serverHits?.length ? (
        <BlacklistWarning
          hits={serverHits}
          confirmed={blacklistOk}
          onConfirm={setBlacklistOk}
          className="sm:col-span-2"
        />
      ) : null}

      <div className="grid gap-1.5">
        <Label htmlFor="hourly-room">{t('booking.hourly.room')}</Label>
        <Select value={roomId} onValueChange={setRoomId}>
          <SelectTrigger id="hourly-room" data-testid="hourly-room">
            <SelectValue placeholder={t('booking.hourly.roomPlaceholder')} />
          </SelectTrigger>
          <SelectContent>
            {options.rooms.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.number} · {localName(f, { name: r.typeName, nameI18n: r.typeNameI18n })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <DateInput label={t('booking.hourly.date')} value={date} onChange={setDate} />
      <div className="grid gap-1.5">
        <Label htmlFor="hourly-start">{t('booking.hourly.start')}</Label>
        <TimeInput id="hourly-start" value={start} onChange={setStart} data-testid="hourly-start" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="hourly-end">{t('booking.hourly.end')}</Label>
        <TimeInput id="hourly-end" value={end} onChange={setEnd} data-testid="hourly-end" />
      </div>
      {start && end && !rangeOk ? (
        <p role="alert" className="text-destructive text-sm sm:col-span-2" data-testid="hourly-bad-range">
          {t('booking.hourly.badRange')}
        </p>
      ) : null}

      {check.data?.taken ? (
        <Alert variant="destructive" className="sm:col-span-2" data-testid="hourly-taken">
          <ClockIcon />
          <AlertDescription>
            {check.data.hours.length
              ? t('booking.hourly.taken', { room: room?.number, hours: check.data.hours.join(', ') })
              : t('booking.hourly.takenDay', { room: room?.number })}
          </AlertDescription>
        </Alert>
      ) : null}
      {check.data?.blocked ? (
        <p role="alert" className="text-destructive text-sm sm:col-span-2" data-testid="hourly-blocked">
          {t('booking.hourly.blocked', { room: room?.number })}
        </p>
      ) : null}
      {check.data?.warnings.length ? (
        <Alert className="sm:col-span-2" data-testid="hourly-turnover">
          <TriangleAlertIcon />
          <AlertDescription className="text-foreground">
            {check.data.warnings.map((w) => (
              <span key={`${w.startTime}-${w.endTime}`} className="block">
                {t('booking.hourly.turnover', {
                  start: w.startTime,
                  end: w.endTime,
                  gap: w.gapMinutes,
                  min: check.data?.turnoverMinutes
                })}
              </span>
            ))}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-2 sm:col-span-2">
        <MoneyInput
          label={t('booking.hourly.amount')}
          value={amount}
          onChange={(v) => {
            setTouched(true)
            setTyped(v.amountMinor)
          }}
          currencies={[currency]}
        />
        <p className="text-muted-foreground text-xs" data-testid="hourly-suggestion">
          {suggested !== null
            ? t('booking.hourly.suggested', { amount: f.money(suggested, currency) })
            : t('booking.hourly.noSuggestion')}
        </p>
      </div>

      <div className="grid gap-1.5 sm:col-span-2">
        <Label htmlFor="hourly-channel">{t('booking.hourly.channel')}</Label>
        <Select value={channelId} onValueChange={setChannelId}>
          <SelectTrigger id="hourly-channel">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.channels.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {localName(f, c)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {date < localDateOf(new Date()) ? (
        <p role="status" className="flex items-start gap-2 text-sm sm:col-span-2">
          <TriangleAlertIcon className="text-warning mt-0.5 size-4 shrink-0" aria-hidden />
          {t('booking.form.pastCheckIn')}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-destructive text-sm sm:col-span-2" data-testid="hourly-error">
          {error}
        </p>
      ) : null}
    </form>
  )
}
