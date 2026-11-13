// New reservation (faz-05 madde 2; G-34…G-36, G-45, G-48, G-51, G-60, G-192): guest found as you type or a new
// guest in a few fields, dates, one or more rooms, sales channel, status, tags, note and the price: suggested from
// the room type (weekend night / special day), the guest's last paid price beside it, editable night by night. A
// blacklist match is a red warning that needs a tick before saving (the tick holds for that person and those
// entries only); an important standing request too. A blocked room or a room not for sale is offered to whoever may
// close rooms, with a reason ("yine de", §6.1).
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { ChevronDownIcon, ShieldAlertIcon, TriangleAlertIcon } from 'lucide-react'
import { TEXT_MAX } from '@shared/contract/text'
import { MAX_STAY_NIGHTS, newGuestSchema } from '@shared/contract/reservations'
import { addDays, diffDays, localDateOf, type LocalDate } from '@shared/date'
import { suggestNightPrice, splitFullName, type PriceReason } from '@shared/domain/booking'
import { isValidHourRange, staySlots } from '@shared/domain/stays'
import { money, sum } from '@shared/money'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { DateInput } from '@/components/date-input'
import { GuestCombobox, type ComboGuest } from '@/components/guest-combobox'
import { MoneyInput } from '@/components/money-input'
import { useOverAmountConfirm } from '@/components/money-input-confirm'
import { FieldError } from '@/components/field-error'
import { useSchemaErrors, type FieldErrors } from '@/lib/form-errors'
import { TimeInput } from '@/components/time-input'
import { ResponsiveDialog } from '@/components/responsive-dialog'
import { ErrorState } from '@/components/states'
import { Skeleton } from '@/components/ui/skeleton'
import { useFormat } from '@/hooks/use-format'
import { useApiQuery } from '@/lib/api/hooks'
import { useCan } from '@/lib/view-as'
import type { ApiError } from '@/lib/transport/types'
import { deferForPendingAmount } from '@/features/settings/use-admin'
import { cn } from '@/lib/utils'
import {
  localName,
  requestGroupPanel,
  requestPanel,
  useBookingMutation,
  useBookingOptions,
  useDebounced,
  type BlacklistHit,
  type BookingRoom
} from './booking-api'
import { GuestSummaryCard, StandingNoteAlert } from './guest-summary-card'
import { CHANNEL_REF_MAX, GROUP_NAME_MAX, GUEST_NAME_MAX, RESERVATION_NOTE_MAX } from './booking-limits'
import { NightPriceTable } from './night-price-table'
import { OverrideReasonField } from './override-dialog'
import { RoomMultiPicker } from './room-multi-picker'
import { TagPicker } from './tag-picker'

export interface NewReservationSeed {
  roomId: string | null
  date: LocalDate
  /** Opened from a guest card (Faz 6): the guest is already chosen. */
  guest?: { id: string; name: string }
  /** "Bu fiyatı yeni rezervasyona uygula" (G-190): the nightly price every chosen room starts with. */
  nightly?: { amountMinor: number; currency: string }
}

type GuestChoice =
  | { kind: 'existing'; id: string; name: string }
  | { kind: 'new'; firstName: string; lastName: string; phone: string; email: string }
  | null

/** The combobox value while a new guest is being typed in the quick form. */
const NEW_GUEST = '__new__'

/** Calendar kinds that take the weekend price (S-20), as the service decides it. */
const PRICED_KINDS = new Set(['holiday', 'half_holiday', 'special'])

export function NewReservationDialog({
  seed,
  onOpenChange,
  onCreated
}: {
  seed: NewReservationSeed | null
  onOpenChange: (open: boolean) => void
  /** The new reservation's id; without it the reservation panel opens on it. */
  onCreated?(reservationId: string): void
  /** Earlier connection points of the calendar screen (Faz 3 mock-up); the dialog reads the real lists itself. */
  hotel?: unknown
  highlight?: readonly number[]
}) {
  const { t } = useTranslation()
  const options = useBookingOptions(!!seed)
  return (
    <ResponsiveDialog
      open={!!seed}
      onOpenChange={onOpenChange}
      title={t('calendar.new.title')}
      description={t('calendar.new.description')}
      className="sm:max-w-2xl"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            form="new-reservation-form"
            data-testid="new-reservation-save"
            disabled={!options.data}
          >
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
        <NewReservationForm
          seed={seed}
          options={options.data}
          onDone={(id) => {
            onOpenChange(false)
            if (onCreated) onCreated(id)
            else requestPanel(id)
          }}
          onGroupDone={(groupId, firstReservationId) => {
            onOpenChange(false)
            if (onCreated) onCreated(firstReservationId)
            else requestGroupPanel(groupId)
          }}
        />
      )}
    </ResponsiveDialog>
  )
}

function NewReservationForm({
  seed,
  options,
  onDone,
  onGroupDone
}: {
  seed: NewReservationSeed
  options: NonNullable<ReturnType<typeof useBookingOptions>['data']>
  onDone: (reservationId: string) => void
  /** A group was booked (G-194): its id and the id of its first reservation. */
  onGroupDone: (groupId: string, firstReservationId: string) => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const can = useCan()
  const [guest, setGuest] = useState<GuestChoice>(
    seed.guest ? { kind: 'existing', id: seed.guest.id, name: seed.guest.name } : null
  )
  const [query, setQuery] = useState('')
  const [checkIn, setCheckIn] = useState<LocalDate>(seed.date)
  const [checkOut, setCheckOut] = useState<LocalDate>(addDays(seed.date, 1))
  /** Hours of a same-day sale (S-103): a day-use always names them, so it never locks the whole day. */
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [roomIds, setRoomIds] = useState<string[]>(
    seed.roomId && options.rooms.some((r) => r.id === seed.roomId) ? [seed.roomId] : []
  )
  const [currency, setCurrency] = useState(
    seed.nightly && options.currencies.includes(seed.nightly.currency)
      ? seed.nightly.currency
      : options.baseCurrency
  )
  /** "All nights" price typed per room, and single nights changed in the table (minor units). */
  const [nightly, setNightly] = useState<Record<string, number | null>>({})
  const [overrides, setOverrides] = useState<Record<string, Record<string, number | null>>>({})
  const [channelId, setChannelId] = useState(options.channels[0]?.id ?? '')
  const [channelRef, setChannelRef] = useState('')
  const [status, setStatus] = useState<'confirmed' | 'tentative'>('confirmed')
  const [tagIds, setTagIds] = useState<string[]>([])
  const [notes, setNotes] = useState('')
  /** "Grup rezervasyonu" (G-194): one reservation per room, a guest name per room, one group. */
  const [groupOn, setGroupOn] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [roomNames, setRoomNames] = useState<Record<string, string>>({})
  /** The person and the entries the blacklist tick was given for (another person needs a tick of their own). */
  const [blacklistOkFor, setBlacklistOkFor] = useState<string | null>(null)
  const [standingOk, setStandingOk] = useState(false)
  const [overrideReason, setOverrideReason] = useState('')
  const canOverride = can('rooms.block', 'edit')
  const [serverHits, setServerHits] = useState<BlacklistHit[] | null>(null)
  /** Messages under the new guest's fields (H-07: a name over the limit, a phone that is not a number). */
  const [guestErrors, setGuestErrors] = useState<FieldErrors>({})
  const checkSchema = useSchemaErrors()
  /** The price list the "0 price" question was answered "save anyway" for. */
  const [zeroOkFor, setZeroOkFor] = useState<string | null>(null)
  const zero = useOverAmountConfirm()
  const [error, setError] = useState<string | null>(null)
  const errorRef = useRef<HTMLParagraphElement>(null)
  // The form scrolls: a refusal is brought into view next to the buttons.
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ block: 'nearest' })
  }, [error])

  const debounced = useDebounced(query.trim())
  const search = useApiQuery(
    'booking.searchGuests',
    { q: debounced, limit: 8 },
    { enabled: debounced.length >= 2 && can('guests') }
  )
  const comboGuests: ComboGuest[] = (search.data ?? []).map((g) => ({
    id: g.id,
    name: `${g.firstName} ${g.lastName}`.trim(),
    phone: g.phone,
    nationality: g.nationality,
    stays: g.stays,
    vip: g.vip
  }))

  const candidate =
    guest?.kind === 'existing'
      ? { name: guest.name.slice(0, 160), guestId: guest.id }
      : guest?.kind === 'new'
        ? {
            // H-07: a very long typed name is checked by its start (the check takes 160 characters at most).
            name: `${guest.firstName} ${guest.lastName}`.trim().slice(0, 160),
            phone: guest.phone.trim().slice(0, 40) || null
          }
        : null
  const candidateKey = useDebounced(candidate)
  const blacklist = useApiQuery('booking.checkBlacklist', candidateKey ?? { name: '' }, {
    enabled: !!candidateKey && (candidateKey.name.trim().length >= 3 || !!candidateKey.guestId)
  })
  const hits = serverHits ?? (candidate ? (blacklist.data ?? []) : [])
  const hitsKey = `${JSON.stringify(candidate)}|${hits
    .map((h) => h.entryId)
    .sort()
    .join(',')}`
  const blacklistOk = blacklistOkFor === hitsKey
  // An "Engelle" entry is overridden only by whoever may remove entries: others get no tick, only the reason.
  const hitsBlockReception = hits.some((h) => h.severity === 'block') && !can('blacklist.remove', 'edit')
  /** A new person (or another spelling, another phone) drops the earlier tick and the earlier refusal. */
  const changeGuest = (next: GuestChoice): void => {
    setGuest(next)
    setGuestErrors({})
    setServerHits(null)
    setBlacklistOkFor(null)
  }

  const summary = useApiQuery(
    'booking.guestSummary',
    { guestId: guest?.kind === 'existing' ? guest.id : '' },
    { enabled: guest?.kind === 'existing', staleTime: 30_000 }
  )
  const standing = guest?.kind === 'existing' ? (summary.data?.standingNote ?? null) : null
  const lastNightly = guest?.kind === 'existing' ? (summary.data?.lastNightly ?? null) : null

  const validDates = checkOut >= checkIn && diffDays(checkIn, checkOut) <= MAX_STAY_NIGHTS
  const rangeEnd = checkOut > checkIn ? checkOut : addDays(checkIn, 1)
  const sameDay = checkIn === checkOut
  const hoursOk = isValidHourRange(startTime, endTime)
  const taken = useApiQuery(
    'booking.availability',
    sameDay && hoursOk
      ? { from: checkIn, to: checkOut, startTime, endTime }
      : { from: checkIn, to: checkOut },
    { enabled: validDates && (!sameDay || hoursOk) }
  )
  const days = useApiQuery('calendar.days', { from: checkIn, to: rangeEnd }, { enabled: validDates })
  const special = useMemo(
    () => new Set((days.data ?? []).filter((d) => PRICED_KINDS.has(d.kind)).map((d) => d.occurrenceDate)),
    [days.data]
  )
  const occupied = new Set(taken.data?.occupied ?? [])
  const blocked = new Set(taken.data?.blocked ?? [])
  const slots = validDates ? staySlots(checkIn, checkOut).map((s) => s.date) : []
  const rooms = roomIds
    .map((id) => options.rooms.find((r) => r.id === id))
    .filter((r): r is BookingRoom => !!r)
  /** Chosen rooms that are blocked these days or not for sale: saved only "yine de", with a reason. */
  const closedChosen = rooms.filter((r) => blocked.has(r.id) || !r.sellable)

  /** G-48: the suggestion of a night, only when the room type's price is in the reservation's currency. */
  const suggestion = (
    room: BookingRoom,
    date: LocalDate
  ): { priceMinor: number; reason: PriceReason } | null => {
    if ((room.priceCurrency ?? options.baseCurrency) !== currency) return null
    return suggestNightPrice(
      date,
      { baseMinor: room.basePriceMinor, weekendMinor: room.weekendPriceMinor },
      options.weekendNights,
      special
    )
  }
  /** The "all nights" price of a room: typed here, else the price brought from the guest card (same currency). */
  const nightlyOf = (room: BookingRoom): number | null =>
    room.id in nightly
      ? (nightly[room.id] ?? null)
      : seed.nightly && seed.nightly.currency === currency
        ? seed.nightly.amountMinor
        : null
  const priceOf = (room: BookingRoom, date: LocalDate): number | null => {
    const own = overrides[room.id]
    if (own && date in own) return own[date] ?? null
    return nightlyOf(room) ?? suggestion(room, date)?.priceMinor ?? null
  }
  const allPrices = rooms.flatMap((r) => slots.map((d) => priceOf(r, d)))
  const total = allPrices.every((p) => p !== null)
    ? sum(
        allPrices.map((p) => money(p ?? 0, currency)),
        currency
      ).amountMinor
    : null

  const changeCurrency = (next: string): void => {
    if (next === currency) return
    // Amounts typed in the old currency are not carried over as if they were the new one.
    setCurrency(next)
    setNightly({})
    setOverrides({})
  }

  const onCreateError = (e: ApiError): boolean => {
    if (e.messageKey === 'errors.blacklistMatch') {
      const details = e.details as { hits?: BlacklistHit[] } | undefined
      setServerHits(details?.hits ?? [])
      setBlacklistOkFor(null)
      return true
    }
    return false
  }
  const create = useBookingMutation('booking.create', {
    success: t('booking.toast.created'),
    onSuccess: (view) => onDone(view.reservation.id),
    onError: onCreateError
  })
  const createGroup = useBookingMutation('booking.createGroup', {
    success: t('booking.group.created'),
    onSuccess: (view) => onGroupDone(view.id, view.rooms[0]?.reservationId ?? ''),
    onError: onCreateError
  })
  const asGroup = groupOn && rooms.length >= 2

  const submit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault()
    if (deferForPendingAmount(e.currentTarget)) return
    setError(null)
    if (!guest || (guest.kind === 'new' && !guest.firstName.trim()))
      return setError(t('booking.form.needGuest'))
    if (guest.kind === 'new') {
      const found = checkSchema(newGuestSchema, {
        firstName: guest.firstName.trim(),
        lastName: guest.lastName.trim(),
        phone: guest.phone.trim() || null,
        email: guest.email.trim() || null
      })
      setGuestErrors(found)
      if (Object.keys(found).length) return setError(t('form.invalid'))
    }
    if (!validDates)
      return setError(
        checkOut < checkIn ? t('booking.form.badDates') : t('booking.form.tooLong', { max: MAX_STAY_NIGHTS })
      )
    if (sameDay && !hoursOk) return setError(t('booking.hourly.badRange'))
    if (!rooms.length) return setError(t('booking.form.needRoom'))
    if (!channelId) return setError(t('booking.form.needChannel'))
    if (allPrices.some((p) => p === null)) return setError(t('errors.priceMissing'))
    // H-08: a night at 0 is allowed (a free stay) but asked once, so a missed digit does not slip through.
    const priceKey = `${currency}:${allPrices.join(',')}`
    if (allPrices.some((p) => p === 0) && zeroOkFor !== priceKey) {
      return zero.ask({
        title: t('booking.price.zeroTitle'),
        body: t('booking.price.zeroBody'),
        action: t('booking.price.zeroAction'),
        go: () => {
          setZeroOkFor(priceKey)
          // Sent again once the answer is kept (the state is read by the next submit).
          setTimeout(
            () =>
              (document.getElementById('new-reservation-form') as HTMLFormElement | null)?.requestSubmit(),
            0
          )
        }
      })
    }
    if (hitsBlockReception) return setError(t('booking.blacklist.blockedHint'))
    if (hits.length && !blacklistOk) return setError(t('booking.blacklist.confirmFirst'))
    if (standing?.level === 'warn' && !standingOk) return setError(t('booking.standing.confirmFirst'))
    if (closedChosen.length && !canOverride) return setError(t('booking.override.noRight'))
    if (closedChosen.length && overrideReason.trim().length < 3)
      return setError(t('booking.override.needReason'))
    const guestInput =
      guest.kind === 'existing'
        ? { id: guest.id }
        : {
            firstName: guest.firstName.trim(),
            lastName: guest.lastName.trim(),
            phone: guest.phone.trim() || null,
            email: guest.email.trim() || null
          }
    const stayOf = (r: BookingRoom) => ({
      roomId: r.id,
      checkIn,
      checkOut,
      prices: slots.map((date) => ({ date, priceMinor: priceOf(r, date) ?? 0 })),
      ...(sameDay ? { startTime, endTime } : {})
    })
    if (groupOn && rooms.length === 1) return setError(t('booking.group.needRooms'))
    if (asGroup) {
      if (!groupName.trim()) return setError(t('booking.group.needName'))
      return createGroup.mutate({
        name: groupName.trim(),
        leader: guestInput,
        channelId,
        channelRef: channelRef.trim() || null,
        status,
        currency,
        rooms: rooms.map((r) => {
          const named = (roomNames[r.id] ?? '').trim()
          return { stay: stayOf(r), ...(named ? { guest: splitFullName(named) } : {}) }
        }),
        notes: notes.trim() || null,
        tagIds,
        blacklistConfirmed: hits.length ? blacklistOk : undefined,
        ...(closedChosen.length ? { overrideBlockReason: overrideReason.trim() } : {})
      })
    }
    create.mutate({
      guest: guestInput,
      channelId,
      channelRef: channelRef.trim() || null,
      status,
      currency,
      stays: rooms.map(stayOf),
      notes: notes.trim() || null,
      tagIds,
      blacklistConfirmed: hits.length ? blacklistOk : undefined,
      ...(closedChosen.length ? { overrideBlockReason: overrideReason.trim() } : {})
    })
  }

  return (
    <>
      <form id="new-reservation-form" className="grid gap-4 sm:grid-cols-2" onSubmit={submit} noValidate>
        <div className="grid gap-2 sm:col-span-2">
          <GuestCombobox
            label={t('calendar.new.guest')}
            guests={comboGuests}
            remote
            value={guest?.kind === 'existing' ? guest.id : guest?.kind === 'new' ? NEW_GUEST : null}
            selectedName={
              guest?.kind === 'existing'
                ? guest.name
                : guest?.kind === 'new'
                  ? t('guestCombo.create', { name: `${guest.firstName} ${guest.lastName}`.trim() })
                  : undefined
            }
            onQueryChange={setQuery}
            onChange={(id) => {
              const g = comboGuests.find((x) => x.id === id)
              changeGuest({ kind: 'existing', id, name: g?.name ?? '' })
              setStandingOk(false)
            }}
            onCreate={(name) => {
              const { firstName, lastName } = splitFullName(name)
              changeGuest({ kind: 'new', firstName, lastName, phone: '', email: '' })
            }}
          />
          {guest?.kind === 'new' ? (
            <fieldset
              className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2"
              data-testid="new-guest-form"
            >
              <legend className="px-1 text-xs font-medium">{t('booking.newGuest.title')}</legend>
              <TextField
                label={t('booking.newGuest.firstName')}
                value={guest.firstName}
                onChange={(v) => changeGuest({ ...guest, firstName: v })}
                maxLength={GUEST_NAME_MAX}
                error={guestErrors.firstName}
                testId="new-guest-first"
              />
              <TextField
                label={t('booking.newGuest.lastName')}
                value={guest.lastName}
                onChange={(v) => changeGuest({ ...guest, lastName: v })}
                maxLength={GUEST_NAME_MAX}
                error={guestErrors.lastName}
                testId="new-guest-last"
              />
              <TextField
                label={t('booking.newGuest.phone')}
                value={guest.phone}
                onChange={(v) => changeGuest({ ...guest, phone: v })}
                type="tel"
                ltr
                maxLength={TEXT_MAX.phone}
                error={guestErrors.phone}
                testId="new-guest-phone"
              />
              <TextField
                label={t('booking.newGuest.email')}
                value={guest.email}
                onChange={(v) => setGuest({ ...guest, email: v })}
                type="email"
                ltr
                error={guestErrors.email}
              />
            </fieldset>
          ) : null}
        </div>

        {hits.length ? (
          <BlacklistWarning
            hits={hits}
            confirmed={blacklistOk}
            onConfirm={(ok) => setBlacklistOkFor(ok ? hitsKey : null)}
            className="sm:col-span-2"
          />
        ) : null}
        {standing ? (
          <div className="grid gap-2 sm:col-span-2">
            <StandingNoteAlert note={standing} />
            {standing.level === 'warn' ? (
              <label className="flex min-h-8 items-center gap-2 text-sm max-md:min-h-11">
                <Checkbox checked={standingOk} onCheckedChange={(c) => setStandingOk(c === true)} />
                {t('booking.standing.confirm')}
              </label>
            ) : null}
          </div>
        ) : null}
        {guest?.kind === 'existing' ? (
          <div className="sm:col-span-2">
            <GuestSummaryCard guestId={guest.id} showNote={false} />
          </div>
        ) : null}

        <DateInput
          label={t('calendar.panel.checkInDate')}
          value={checkIn}
          onChange={(d) => {
            setCheckIn(d)
            if (checkOut < d) setCheckOut(addDays(d, 1))
          }}
        />
        <DateInput
          label={t('calendar.panel.checkOutDate')}
          value={checkOut}
          onChange={setCheckOut}
          min={checkIn}
        />
        {sameDay ? (
          <>
            <p className="text-muted-foreground -mt-2 text-xs sm:col-span-2">{t('booking.form.dayUse')}</p>
            <div className="grid gap-1.5">
              <Label htmlFor="new-reservation-start">{t('booking.hourly.start')}</Label>
              <TimeInput
                id="new-reservation-start"
                value={startTime}
                onChange={setStartTime}
                data-testid="new-reservation-start"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="new-reservation-end">{t('booking.hourly.end')}</Label>
              <TimeInput
                id="new-reservation-end"
                value={endTime}
                onChange={setEndTime}
                data-testid="new-reservation-end"
              />
            </div>
            {startTime && endTime && !hoursOk ? (
              <p role="alert" className="text-destructive text-sm sm:col-span-2">
                {t('booking.hourly.badRange')}
              </p>
            ) : null}
          </>
        ) : null}
        {checkIn < localDateOf(new Date()) ? (
          // QA3c1 #17: a past arrival is allowed (late entry) but never silently: the stay is saved as "planned".
          <p
            role="status"
            className="flex items-start gap-2 text-sm sm:col-span-2"
            data-testid="past-check-in"
          >
            <TriangleAlertIcon className="text-warning mt-0.5 size-4 shrink-0" aria-hidden />
            {t('booking.form.pastCheckIn')}
          </p>
        ) : null}

        <div className="sm:col-span-2">
          <RoomMultiPicker
            label={t('booking.rooms.label')}
            rooms={options.rooms}
            value={roomIds}
            onChange={setRoomIds}
            occupied={occupied}
            blocked={blocked}
            allowOverride={canOverride}
            chips
          />
        </div>
        {rooms.length >= 2 ? (
          <fieldset className="grid gap-3 rounded-lg border p-3 sm:col-span-2" data-testid="group-fieldset">
            <legend className="px-1 text-xs font-medium">{t('booking.group.title')}</legend>
            <div className="flex items-start gap-2">
              <Checkbox
                id="new-group-on"
                checked={groupOn}
                onCheckedChange={(c) => setGroupOn(c === true)}
                data-testid="group-toggle"
              />
              <Label htmlFor="new-group-on" className="grid gap-0.5 font-normal">
                <span className="font-medium">{t('booking.group.option')}</span>
                <span className="text-muted-foreground text-xs">{t('booking.group.optionHelp')}</span>
              </Label>
            </div>
            {groupOn ? (
              <>
                <TextField
                  label={t('booking.group.name')}
                  value={groupName}
                  onChange={setGroupName}
                  maxLength={GROUP_NAME_MAX}
                  placeholder={t('booking.group.namePlaceholder')}
                  testId="group-name-input"
                />
                <p className="text-muted-foreground text-xs">{t('booking.group.leaderHelp')}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {rooms.map((r) => (
                    <TextField
                      key={r.id}
                      label={t('booking.group.roomGuest', { room: r.number })}
                      value={roomNames[r.id] ?? ''}
                      onChange={(v) => setRoomNames({ ...roomNames, [r.id]: v })}
                      placeholder={t('booking.group.roomGuestPlaceholder')}
                      testId={`group-room-guest-${r.number}`}
                    />
                  ))}
                </div>
              </>
            ) : null}
          </fieldset>
        ) : null}
        {rooms.some((r) => occupied.has(r.id) || (blocked.has(r.id) && !canOverride)) ? (
          <p role="alert" className="text-destructive text-sm sm:col-span-2">
            {t('booking.rooms.takenChosen', {
              rooms: rooms
                .filter((r) => occupied.has(r.id) || (blocked.has(r.id) && !canOverride))
                .map((r) => r.number)
                .join(', ')
            })}
          </p>
        ) : null}
        {closedChosen.length && canOverride ? (
          <OverrideReasonField
            value={overrideReason}
            onChange={setOverrideReason}
            className="sm:col-span-2"
          />
        ) : null}
        {rooms
          .filter((r) => r.openIssues.length)
          .map((r) => (
            <Alert
              key={r.id}
              className="border-warning bg-warning/15 sm:col-span-2"
              data-testid="room-issue-warning"
            >
              <ShieldAlertIcon />
              <AlertTitle>{t('booking.issues.title', { room: r.number })}</AlertTitle>
              <AlertDescription className="text-foreground">
                {r.openIssues.map((i) => i.title).join(' · ')}
              </AlertDescription>
            </Alert>
          ))}

        {rooms.map((room) => (
          <RoomPriceBlock
            key={room.id}
            room={room}
            currency={currency}
            currencies={options.currencies}
            slots={slots}
            nightly={nightlyOf(room)}
            suggestion={(d) => suggestion(room, d)}
            priceOf={(d) => priceOf(room, d)}
            lastNightly={lastNightly}
            onNightly={(value) => {
              changeCurrency(value.currency)
              if (value.currency !== currency) return
              setNightly({ ...nightly, [room.id]: value.amountMinor })
              setOverrides({ ...overrides, [room.id]: {} })
            }}
            onNight={(date, minor) =>
              setOverrides({ ...overrides, [room.id]: { ...(overrides[room.id] ?? {}), [date]: minor } })
            }
          />
        ))}

        <div className="grid gap-1.5">
          <Label htmlFor="new-channel">{t('calendar.new.channel')}</Label>
          <Select value={channelId} onValueChange={setChannelId}>
            <SelectTrigger id="new-channel" className="w-full">
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
        <TextField
          label={t('booking.form.channelRef')}
          value={channelRef}
          onChange={setChannelRef}
          maxLength={CHANNEL_REF_MAX}
          ltr
        />
        <div className="grid gap-1.5 sm:col-span-2">
          <span className="text-sm font-medium">{t('booking.form.status')}</span>
          <ToggleGroup
            type="single"
            variant="outline"
            value={status}
            onValueChange={(v) => v && setStatus(v as typeof status)}
            aria-label={t('booking.form.status')}
            className="w-full sm:w-auto"
          >
            <ToggleGroupItem value="confirmed" className="flex-1">
              {t('calendar.resStatus.confirmed')}
            </ToggleGroupItem>
            <ToggleGroupItem value="tentative" className="flex-1">
              {t('calendar.resStatus.tentative')}
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <span className="text-sm font-medium">{t('booking.tags.label')}</span>
          <TagPicker value={tagIds} onChange={setTagIds} />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="new-note">{t('calendar.new.note')}</Label>
          <Textarea
            id="new-note"
            rows={2}
            value={notes}
            maxLength={RESERVATION_NOTE_MAX}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t('calendar.new.notePlaceholder')}
          />
        </div>
        {rooms.length && slots.length && total !== null ? (
          <p
            className="text-muted-foreground text-sm sm:col-span-2"
            aria-live="polite"
            data-testid="new-total"
          >
            {checkIn === checkOut ? (
              <Trans
                i18nKey="booking.form.dayUseTotal"
                values={{ total: f.money(total, currency) }}
                components={{ m: <bdi /> }}
              />
            ) : (
              <Trans
                i18nKey="calendar.new.summary"
                count={slots.length}
                values={{ count: slots.length, total: f.money(total, currency) }}
                components={{ m: <bdi /> }}
              />
            )}
          </p>
        ) : null}
        {error ? (
          <p
            role="alert"
            className="text-destructive text-sm sm:col-span-2"
            data-testid="new-reservation-error"
          >
            {error}
          </p>
        ) : null}
      </form>
      {zero.dialog}
    </>
  )
}

function TextField({
  label,
  value,
  onChange,
  type = 'text',
  ltr = false,
  maxLength,
  placeholder,
  error,
  testId
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  ltr?: boolean
  maxLength?: number
  placeholder?: string
  /** The message under the field; it turns red. */
  error?: string
  testId?: string
}) {
  const id = useId()
  return (
    <div className="grid min-w-0 gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        dir={ltr ? 'ltr' : undefined}
        autoComplete="off"
        maxLength={maxLength}
        placeholder={placeholder}
        data-testid={testId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      <FieldError id={`${id}-error`} message={error} />
    </div>
  )
}

/** G-45: red, names the entry and why it matched; saving needs the tick. */
export function BlacklistWarning({
  hits,
  confirmed,
  onConfirm,
  className
}: {
  hits: readonly BlacklistHit[]
  confirmed: boolean
  onConfirm: (ok: boolean) => void
  className?: string
}) {
  const { t } = useTranslation()
  const can = useCan()
  const mayOverride = !hits.some((h) => h.severity === 'block') || can('blacklist.remove', 'edit')
  return (
    <Alert
      variant="destructive"
      className={cn('border-destructive bg-destructive/5', className)}
      data-testid="blacklist-warning"
    >
      <ShieldAlertIcon />
      <AlertTitle>{t('booking.blacklist.title')}</AlertTitle>
      <AlertDescription className="grid gap-2">
        <ul className="grid gap-1">
          {hits.map((h) => (
            <li key={h.entryId}>
              <span className="font-semibold">{h.name}</span>
              {' · '}
              {h.reasons.map((r) => t(`booking.blacklist.reason.${r}`)).join(', ')}
              {h.severity === 'block' ? ` · ${t('booking.blacklist.severe')}` : ''}
              {h.reasonText ? <span className="text-foreground block">{h.reasonText}</span> : null}
            </li>
          ))}
        </ul>
        {mayOverride ? (
          <label className="text-foreground flex min-h-8 items-center gap-2 font-medium max-md:min-h-11">
            <Checkbox
              checked={confirmed}
              onCheckedChange={(c) => onConfirm(c === true)}
              data-testid="blacklist-confirm"
            />
            {t('booking.blacklist.confirm')}
          </label>
        ) : (
          <p className="text-foreground font-medium" data-testid="blacklist-blocked">
            {t('booking.blacklist.blockedHint')}
          </p>
        )}
      </AlertDescription>
    </Alert>
  )
}

function RoomPriceBlock({
  room,
  currency,
  currencies,
  slots,
  nightly,
  suggestion,
  priceOf,
  lastNightly,
  onNightly,
  onNight
}: {
  room: BookingRoom
  currency: string
  currencies: readonly string[]
  slots: readonly LocalDate[]
  nightly: number | null
  suggestion: (d: LocalDate) => { priceMinor: number; reason: PriceReason } | null
  priceOf: (d: LocalDate) => number | null
  lastNightly: { amountMinor: number; currency: string } | null
  onNightly: (value: { amountMinor: number | null; currency: string }) => void
  onNight: (date: LocalDate, minor: number | null) => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const [open, setOpen] = useState(false)
  const suggested = slots.map((d) => suggestion(d)).filter((s) => s !== null)
  const base = suggested.find((s) => s.reason === 'base')?.priceMinor
  const high = suggested.find((s) => s.reason !== 'base')?.priceMinor
  const typeName = localName(f, { name: room.typeName, nameI18n: room.typeNameI18n })
  return (
    <section
      className="grid gap-2 rounded-lg border p-3 sm:col-span-2"
      aria-label={t('booking.price.roomTitle', { room: room.number })}
      data-testid={`price-block-${room.number}`}
    >
      <p className="text-sm font-semibold">
        {t('booking.price.roomTitle', { room: room.number })}{' '}
        <span className="text-muted-foreground font-normal">{typeName}</span>
      </p>
      <div className="grid gap-2 sm:grid-cols-2 sm:items-end">
        <MoneyInput
          label={t('booking.price.allNights')}
          value={{
            amountMinor: nightly ?? (suggested.length === slots.length && !high ? (base ?? null) : null),
            currency
          }}
          onChange={onNightly}
          currencies={currencies}
        />
        <div className="text-muted-foreground grid gap-0.5 text-xs">
          {base !== undefined ? (
            <p data-testid="suggested-price">
              <Trans
                i18nKey={high !== undefined ? 'booking.price.suggestedTwo' : 'calendar.new.suggested'}
                values={{
                  price: f.money(base, currency),
                  high: high !== undefined ? f.money(high, currency) : ''
                }}
                components={{ m: <bdi /> }}
              />
            </p>
          ) : high !== undefined ? (
            <p data-testid="suggested-price">
              <Trans
                i18nKey="booking.price.suggestedHigh"
                values={{ high: f.money(high, currency) }}
                components={{ m: <bdi /> }}
              />
            </p>
          ) : (
            <p>{t('booking.price.noSuggestion')}</p>
          )}
          {lastNightly ? (
            <p data-testid="last-paid">
              <Trans
                i18nKey="booking.price.lastPaid"
                values={{ price: f.money(lastNightly.amountMinor, lastNightly.currency) }}
                components={{ m: <bdi /> }}
              />
            </p>
          ) : null}
        </div>
      </div>
      {slots.length ? (
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="-ms-2">
              <ChevronDownIcon className={cn('transition-transform', open && 'rotate-180')} aria-hidden />
              {t('booking.price.byNight', { count: slots.length })}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <NightPriceTable
              label={t('calendar.panel.nightsList')}
              currency={currency}
              rows={slots.map((d) => ({ date: d, priceMinor: priceOf(d), reason: suggestion(d)?.reason }))}
              onChange={onNight}
            />
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </section>
  )
}
