// The reservation panel's tabs (faz-05 madde 2, 3, 7b): summary (the reservation's own fields, tags, notes, guest
// history), nights (dates, room change, another room, night-by-night prices painted as the tape chart paints
// them) and money (folio and payments). Every write goes through the services and refreshes the calendar. A
// blocked range or a room not for sale asks whoever may close rooms for a reason ("yine de", §6.1); a stay in the
// house ends today at the earliest (an early departure is a check-out). Credits and the balance only for users
// who may see payments.
import { useId, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckIcon, MailIcon, PhoneIcon, PlusIcon } from 'lucide-react'
import type { ProcedureInput } from '@shared/contract'
import { addDays, diffDays, localDateOf, type LocalDate } from '@shared/date'
import { money, negate } from '@shared/money'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { DateInput } from '@/components/date-input'
import { MoneyInput, type MoneyValue } from '@/components/money-input'
import { StatusTagBadge } from '@/components/status-tag-badge'
import { useFormat } from '@/hooks/use-format'
import { useApiQuery } from '@/lib/api/hooks'
import { deferForPendingAmount } from '@/features/settings/use-admin'
import { cn } from '@/lib/utils'
import { useCan } from '@/lib/view-as'
import {
  localName,
  useBookingMutation,
  useBookingOptions,
  type BookingStay,
  type BookingView
} from './booking-api'
import { GuestSummaryCard } from './guest-summary-card'
import { CHANNEL_REF_MAX, NOTE_LOG_MAX, RESERVATION_NOTE_MAX } from './booking-limits'
import { NightPriceTable } from './night-price-table'
import { useBlockOverride } from './override'
import { OverrideDialog } from './override-dialog'
import { TagPicker } from './tag-picker'
import { useCustomTags } from './use-custom-tags'

const FOLIO_KEYS = ['charges', 'credited', 'balance'] as const

export function SummaryTab({
  view,
  editable,
  notesEditable = editable
}: {
  view: BookingView
  editable: boolean
  /** The notes log stays writable on a closed reservation for whoever may edit the calendar (K-55). */
  notesEditable?: boolean
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const options = useBookingOptions()
  const tags = useCustomTags()
  const r = view.reservation
  const live = view.stays.filter((s) => s.status !== 'cancelled')
  const shown = live.length ? live : view.stays
  const from = shown.map((s) => s.checkIn).sort()[0]
  const to = shown
    .map((s) => s.checkOut)
    .sort()
    .at(-1)
  const nights = from && to ? diffDays(from, to) : 0
  const people = live.flatMap((s) => s.occupants.filter((o) => !o.leftAt)).length
  const [status, setStatus] = useState(r.status === 'tentative' ? 'tentative' : 'confirmed')
  const [channelId, setChannelId] = useState(r.channelId)
  const [channelRef, setChannelRef] = useState(r.channelRef ?? '')
  const [tagIds, setTagIds] = useState<string[]>(view.tagIds)
  const [notes, setNotes] = useState(r.notes ?? '')
  const refId = useId()
  const notesId = useId()
  const sameTags = tagIds.length === view.tagIds.length && tagIds.every((x) => view.tagIds.includes(x))
  const statusEditable = r.status === 'tentative' || r.status === 'confirmed'
  const patch = {
    ...(statusEditable && status !== r.status ? { status: status as 'tentative' | 'confirmed' } : {}),
    ...(channelId !== r.channelId ? { channelId } : {}),
    ...(channelRef.trim() !== (r.channelRef ?? '') ? { channelRef: channelRef.trim() || null } : {}),
    ...(notes.trim() !== (r.notes ?? '') ? { notes: notes.trim() || null } : {}),
    ...(sameTags ? {} : { tagIds })
  }
  const dirty = Object.keys(patch).length > 0
  const save = useBookingMutation('booking.update', { success: t('booking.toast.saved') })
  return (
    <div className="grid gap-4">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-muted-foreground text-xs">{t('calendar.panel.room')}</dt>
          <dd className="font-medium">{shown.map((s) => s.roomNumber).join(', ')}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">{t('calendar.panel.nights')}</dt>
          <dd className="font-medium">
            {nights ? t('calendar.nights', { count: nights }) : t('status.dayuse')}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">{t('calendar.panel.guests')}</dt>
          <dd className="font-medium">
            {view.occupantsVisible ? t('booking.people.count', { count: people }) : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">{t('calendar.panel.checkInDate')}</dt>
          <dd className="font-medium">{from ? f.date(from, 'medium') : '—'}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">{t('calendar.panel.checkOutDate')}</dt>
          <dd className="font-medium">{to ? f.date(to, 'medium') : '—'}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">{t('calendar.panel.balance')}</dt>
          <dd
            className={cn(
              'font-semibold tabular-nums',
              (view.folio.balanceMinor ?? 0) > 0 && 'text-destructive'
            )}
            data-testid="panel-balance"
          >
            {view.folio.balanceMinor === null ? (
              '—'
            ) : (
              <bdi>{f.money(view.folio.balanceMinor, view.folio.currency)}</bdi>
            )}
          </dd>
        </div>
      </dl>
      {r.parkedReason ? (
        <p className="rounded-md border px-3 py-2 text-sm">
          {t('booking.panel.parkedLine', { reason: t(`calendar.park.reason.${r.parkedReason}`) })}
          {r.parkedNote ? ` · ${r.parkedNote}` : ''}
        </p>
      ) : null}
      {r.cancelReason ? (
        <p className="rounded-md border px-3 py-2 text-sm">
          {t('booking.panel.cancelledLine', { reason: r.cancelReason })}
        </p>
      ) : null}
      <Separator />
      {editable ? (
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (dirty) save.mutate({ id: r.id, patch })
          }}
          data-testid="panel-fields"
        >
          {statusEditable ? (
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
          ) : null}
          <div className="grid gap-1.5">
            <Label htmlFor="panel-channel">{t('calendar.new.channel')}</Label>
            <Select value={channelId} onValueChange={setChannelId}>
              <SelectTrigger id="panel-channel" className="w-full">
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
          <div className="grid gap-1.5">
            <Label htmlFor={refId}>{t('booking.form.channelRef')}</Label>
            <Input
              id={refId}
              dir="ltr"
              value={channelRef}
              maxLength={CHANNEL_REF_MAX}
              onChange={(e) => setChannelRef(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <span className="text-sm font-medium">{t('booking.tags.label')}</span>
            <TagPicker value={tagIds} onChange={setTagIds} />
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor={notesId}>{t('calendar.new.note')}</Label>
            <Textarea
              id={notesId}
              rows={2}
              value={notes}
              maxLength={RESERVATION_NOTE_MAX}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <Button type="submit" className="justify-self-start" disabled={!dirty || save.isPending}>
            <CheckIcon aria-hidden />
            {t('common.save')}
          </Button>
        </form>
      ) : (
        <div className="grid gap-2">
          {view.tagIds.length ? (
            <div className="flex flex-wrap gap-1.5">
              {tags
                .filter((tag) => view.tagIds.includes(tag.id))
                .map((tag) => (
                  <StatusTagBadge
                    key={tag.id}
                    subject={{ kind: 'custom', tagId: tag.id }}
                    label={tag.name ?? ''}
                  />
                ))}
            </div>
          ) : null}
          {r.notes ? (
            <p className="rounded-md border px-3 py-2 text-sm whitespace-pre-wrap">{r.notes}</p>
          ) : null}
        </div>
      )}
      <Separator />
      <section className="grid gap-2" aria-label={t('calendar.panel.contact')}>
        <h3 className="text-sm font-semibold">{t('calendar.panel.contact')}</h3>
        {view.guest.phone ? (
          <p className="flex items-center gap-2 text-sm" dir="ltr">
            <PhoneIcon className="text-muted-foreground size-4" aria-hidden />
            {view.guest.phone}
          </p>
        ) : null}
        {view.guest.email ? (
          <p className="flex items-center gap-2 text-sm">
            <MailIcon className="text-muted-foreground size-4" aria-hidden />
            {view.guest.email}
          </p>
        ) : null}
        {!view.guest.phone && !view.guest.email ? (
          <p className="text-muted-foreground text-sm">{t('booking.panel.noContact')}</p>
        ) : null}
      </section>
      <GuestSummaryCard guestId={view.guest.id} showNote={false} excludeReservationId={r.id} />
      <NotesLog view={view} editable={notesEditable} />
    </div>
  )
}

function NotesLog({ view, editable }: { view: BookingView; editable: boolean }) {
  const { t } = useTranslation()
  const f = useFormat()
  const id = useId()
  const [text, setText] = useState('')
  const add = useBookingMutation('booking.addNote', {
    success: t('booking.toast.noteAdded'),
    onSuccess: () => setText('')
  })
  return (
    <section className="grid gap-2" aria-label={t('calendar.panel.notes')}>
      <h3 className="text-sm font-semibold">{t('calendar.panel.notes')}</h3>
      {view.notes.length ? (
        <ul className="grid gap-1.5">
          {view.notes.map((n) => (
            <li key={n.id} className="rounded-md border px-3 py-2 text-sm">
              {n.text}
              <span className="text-muted-foreground block text-xs">
                {f.dayMonth(n.createdAt.slice(0, 10) as LocalDate)} {f.time(n.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">{t('booking.notes.none')}</p>
      )}
      {editable ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (text.trim()) add.mutate({ reservationId: view.reservation.id, text: text.trim() })
          }}
        >
          <Label htmlFor={id} className="sr-only">
            {t('booking.notes.add')}
          </Label>
          <Input
            id={id}
            value={text}
            maxLength={NOTE_LOG_MAX}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('booking.notes.placeholder')}
          />
          <Button type="submit" variant="outline" disabled={!text.trim() || add.isPending}>
            <PlusIcon aria-hidden />
            {t('booking.notes.add')}
          </Button>
        </form>
      ) : null}
    </section>
  )
}

export function StaysTab({ view, editable }: { view: BookingView; editable: boolean }) {
  const { t } = useTranslation()
  const live = view.stays.filter((s) => s.status !== 'cancelled')
  return (
    <div className="grid gap-4">
      {live.length ? (
        live.map((s) => (
          <StayBlock key={s.id} stay={s} view={view} editable={editable} many={live.length > 1} />
        ))
      ) : (
        <p className="text-muted-foreground text-sm">{t('booking.panel.noStays')}</p>
      )}
      {editable ? <AddRoomForm view={view} /> : null}
    </div>
  )
}

function StayBlock({
  stay,
  view,
  editable,
  many
}: {
  stay: BookingStay
  view: BookingView
  editable: boolean
  many: boolean
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const options = useBookingOptions()
  const open = stay.status === 'planned' || stay.status === 'in_house'
  const canEdit = editable && open
  const [draft, setDraft] = useState<Record<string, number | null>>({})
  const [checkIn, setCheckIn] = useState<LocalDate>(stay.checkIn)
  const [checkOut, setCheckOut] = useState<LocalDate>(stay.checkOut)
  const [roomId, setRoomId] = useState(stay.roomId)
  /** QA3c1 #14: an overnight stay made same-day (check-out = check-in) is asked first: its nights go. */
  const [askDayUse, setAskDayUse] = useState(false)
  // QA3c1 #13: the rooms already taken on the nights to be moved (the reservation's own nights are not "taken").
  const moveFrom =
    stay.status === 'in_house' && localDateOf(new Date()) > stay.checkIn
      ? localDateOf(new Date())
      : stay.checkIn
  const moveTaken = useApiQuery(
    'booking.availability',
    { from: moveFrom, to: stay.checkOut, excludeReservationId: view.reservation.id },
    { enabled: canEdit && stay.checkOut >= moveFrom }
  )
  const moveOccupied = new Set(moveTaken.data?.occupied ?? [])
  const prices = useBookingMutation('booking.setNightPrices', {
    success: t('booking.toast.pricesSaved'),
    onSuccess: () => setDraft({})
  })
  const datesOverride = useBlockOverride<ProcedureInput<'booking.changeDates'>>()
  const roomOverride = useBlockOverride<ProcedureInput<'booking.changeRoom'>>()
  const dates = useBookingMutation('booking.changeDates', {
    success: t('booking.toast.datesSaved'),
    onError: datesOverride.onError
  })
  const room = useBookingMutation('booking.changeRoom', {
    success: t('booking.toast.roomChanged'),
    onError: roomOverride.onError
  })
  const changed = Object.entries(draft).filter(
    ([date, minor]) => minor !== null && stay.nights.find((n) => n.date === date)?.priceMinor !== minor
  )
  const today = localDateOf(new Date())
  // A stay in the house: the check-out is today at the earliest, and an overnight stay stays overnight (leaving
  // on the check-in day is the check-out's job, K-44). The service checks the same.
  const inHouse = stay.status === 'in_house'
  const ownFloor = stay.checkIn === stay.checkOut ? stay.checkIn : addDays(stay.checkIn, 1)
  const checkoutMin = inHouse ? (today > ownFloor ? today : ownFloor) : checkIn
  const typeName = localName(f, { name: stay.roomTypeName, nameI18n: stay.roomTypeNameI18n })
  return (
    <section
      className="grid gap-3 rounded-lg border p-3"
      aria-label={t('booking.price.roomTitle', { room: stay.roomNumber })}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">
          {t('booking.price.roomTitle', { room: stay.roomNumber })}{' '}
          <span className="text-muted-foreground font-normal">{typeName}</span>
        </h3>
        <Badge variant="outline">{t(`booking.stayStatus.${stay.status}`)}</Badge>
        <span className="text-muted-foreground ms-auto text-xs">
          {f.dayMonth(stay.checkIn)} – {f.date(stay.checkOut, 'medium')}
        </span>
      </div>
      <NightPriceTable
        label={many ? t('booking.price.listOf', { room: stay.roomNumber }) : t('calendar.panel.nightsList')}
        testId={`nights-${stay.roomNumber}`}
        currency={view.folio.currency}
        rows={stay.nights.map((n) => ({
          date: n.date,
          priceMinor: n.date in draft ? (draft[n.date] ?? null) : n.priceMinor,
          style: n.style
        }))}
        onChange={canEdit ? (date, minor) => setDraft({ ...draft, [date]: minor }) : undefined}
      />
      {canEdit && changed.length ? (
        <Button
          size="sm"
          className="justify-self-start"
          onClick={() =>
            prices.mutate({
              stayId: stay.id,
              prices: changed.map(([date, minor]) => ({ date: date as LocalDate, priceMinor: minor ?? 0 }))
            })
          }
        >
          {t('booking.price.save', { count: changed.length })}
        </Button>
      ) : null}
      {canEdit ? (
        <div className="grid gap-3 border-t pt-3 sm:grid-cols-2">
          <DateInput
            label={t('calendar.panel.checkInDate')}
            value={checkIn}
            onChange={setCheckIn}
            {...(stay.status === 'in_house' ? { min: stay.checkIn, max: stay.checkIn } : {})}
          />
          <DateInput
            label={t('calendar.panel.checkOutDate')}
            value={checkOut}
            onChange={setCheckOut}
            min={checkoutMin}
          />
          <Button
            variant="outline"
            size="sm"
            className="justify-self-start"
            disabled={
              (checkIn === stay.checkIn && checkOut === stay.checkOut) ||
              checkOut < checkoutMin ||
              dates.isPending
            }
            onClick={() =>
              checkIn === checkOut && stay.checkIn !== stay.checkOut
                ? setAskDayUse(true)
                : dates.mutate({ stayId: stay.id, dates: { checkIn, checkOut } })
            }
            data-testid="stay-save-dates"
          >
            {t('booking.stay.saveDates')}
          </Button>
          <div className="grid gap-1.5 sm:col-span-2 sm:grid-cols-[1fr_auto] sm:items-end sm:gap-2">
            <div className="grid gap-1.5">
              <Label htmlFor={`room-${stay.id}`}>{t('booking.stay.moveTo')}</Label>
              <Select value={roomId} onValueChange={setRoomId}>
                <SelectTrigger id={`room-${stay.id}`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(options.data?.rooms ?? []).map((r) => (
                    <SelectItem key={r.id} value={r.id} disabled={moveOccupied.has(r.id)}>
                      {r.number} · {localName(f, { name: r.typeName, nameI18n: r.typeNameI18n })}
                      {moveOccupied.has(r.id)
                        ? ` · ${t('roomPicker.taken')}`
                        : r.sellable
                          ? ''
                          : ` · ${t('booking.rooms.notForSale')}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={roomId === stay.roomId || room.isPending}
              onClick={() =>
                room.mutate({
                  stayId: stay.id,
                  change: {
                    newRoomId: roomId,
                    ...(stay.status === 'in_house' && today > stay.checkIn ? { fromDate: today } : {})
                  }
                })
              }
            >
              {t('booking.stay.move')}
            </Button>
          </div>
        </div>
      ) : null}
      <AlertDialog open={askDayUse} onOpenChange={setAskDayUse}>
        <AlertDialogContent data-testid="day-use-ask">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('booking.stay.dayUseAsk.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('booking.stay.dayUseAsk.body', { date: f.date(checkIn, 'medium') })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => dates.mutate({ stayId: stay.id, dates: { checkIn, checkOut } })}
              data-testid="day-use-ask-confirm"
            >
              {t('booking.stay.dayUseAsk.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <OverrideDialog
        override={datesOverride}
        onConfirm={(input, reason) =>
          dates.mutate({ ...input, dates: { ...input.dates, overrideBlockReason: reason } })
        }
      />
      <OverrideDialog
        override={roomOverride}
        onConfirm={(input, reason) =>
          room.mutate({ ...input, change: { ...input.change, overrideBlockReason: reason } })
        }
      />
    </section>
  )
}

function AddRoomForm({ view }: { view: BookingView }) {
  const { t } = useTranslation()
  const f = useFormat()
  const options = useBookingOptions()
  const live = view.stays.filter((s) => s.status !== 'cancelled')
  const first = live[0]
  const [open, setOpen] = useState(false)
  const [roomId, setRoomId] = useState('')
  const [checkIn, setCheckIn] = useState<LocalDate>(first?.checkIn ?? localDateOf(new Date()))
  const [checkOut, setCheckOut] = useState<LocalDate>(first?.checkOut ?? addDays(localDateOf(new Date()), 1))
  const [price, setPrice] = useState<MoneyValue>({
    amountMinor: first?.nights[0]?.priceMinor ?? null,
    currency: view.folio.currency
  })
  const taken = useApiQuery(
    'booking.availability',
    { from: checkIn, to: checkOut, excludeReservationId: undefined },
    { enabled: open && checkOut >= checkIn }
  )
  const can = useCan()
  const canOverride = can('rooms.block', 'edit')
  const occupied = new Set(taken.data?.occupied ?? [])
  const blocked = new Set(taken.data?.blocked ?? [])
  /** Taken rooms cannot be chosen; blocked and not-for-sale rooms only by whoever may close rooms (with a reason). */
  const busy = (r: { id: string; sellable: boolean }): boolean =>
    occupied.has(r.id) || (!canOverride && (blocked.has(r.id) || !r.sellable))
  const override = useBlockOverride<ProcedureInput<'booking.addRoom'>>()
  const add = useBookingMutation('booking.addRoom', {
    success: t('booking.toast.roomAdded'),
    onSuccess: () => setOpen(false),
    onError: override.onError
  })
  if (!open)
    return (
      <Button variant="outline" className="justify-self-start" onClick={() => setOpen(true)}>
        <PlusIcon aria-hidden />
        {t('booking.stay.addRoom')}
      </Button>
    )
  const submit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault()
    if (deferForPendingAmount(e.currentTarget)) return
    if (!roomId || price.amountMinor === null || checkOut < checkIn) return
    add.mutate({
      reservationId: view.reservation.id,
      stay: { roomId, checkIn, checkOut, nightlyPriceMinor: price.amountMinor }
    })
  }
  return (
    <>
      <form
        className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2"
        onSubmit={submit}
        data-testid="add-room-form"
      >
        <p className="text-sm font-semibold sm:col-span-2">{t('booking.stay.addRoom')}</p>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="add-room-select">{t('common.room')}</Label>
          <Select value={roomId} onValueChange={setRoomId}>
            <SelectTrigger id="add-room-select" className="w-full">
              <SelectValue placeholder={t('roomPicker.placeholder')} />
            </SelectTrigger>
            <SelectContent>
              {(options.data?.rooms ?? []).map((r) => (
                <SelectItem key={r.id} value={r.id} disabled={busy(r)}>
                  {r.number} · {localName(f, { name: r.typeName, nameI18n: r.typeNameI18n })}
                  {occupied.has(r.id)
                    ? ` · ${t('roomPicker.taken')}`
                    : blocked.has(r.id)
                      ? ` · ${t('booking.rooms.blocked')}`
                      : !r.sellable
                        ? ` · ${t('booking.rooms.notForSale')}`
                        : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DateInput label={t('calendar.panel.checkInDate')} value={checkIn} onChange={setCheckIn} />
        <DateInput
          label={t('calendar.panel.checkOutDate')}
          value={checkOut}
          onChange={setCheckOut}
          min={checkIn}
        />
        <div className="sm:col-span-2">
          <MoneyInput
            label={t('calendar.new.nightlyPrice')}
            value={price}
            onChange={(v) => setPrice({ ...v, currency: view.folio.currency })}
            currencies={[view.folio.currency]}
          />
        </div>
        <div className="flex gap-2 sm:col-span-2">
          <Button type="submit" disabled={!roomId || price.amountMinor === null || add.isPending}>
            {t('booking.stay.addRoomSave')}
          </Button>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {t('common.cancel')}
          </Button>
        </div>
      </form>
      <OverrideDialog
        override={override}
        onConfirm={(input, reason) => add.mutate({ ...input, overrideBlockReason: reason })}
      />
    </>
  )
}

export function MoneyTab({ view, onPay }: { view: BookingView; onPay?: () => void }) {
  const { t } = useTranslation()
  const f = useFormat()
  const options = useBookingOptions()
  const folio = {
    charges: view.folio.chargesMinor,
    credited: view.folio.creditedMinor,
    balance: view.folio.balanceMinor
  }
  // Without the right to see payments only the charges are shown (credits and balance come as null).
  const keys = FOLIO_KEYS.filter((key) => folio[key] !== null)
  const methodName = (id: string): string => {
    const m = options.data?.methods.find((x) => x.id === id)
    return m ? localName(f, m) : ''
  }
  return (
    <div className="grid gap-4">
      <dl className="grid grid-cols-3 gap-3 text-sm">
        {keys.map((key) => (
          <div key={key} className="min-w-0 rounded-lg border p-3">
            <dt className="text-muted-foreground text-xs">{t(`calendar.panel.folio.${key}`)}</dt>
            <dd
              className={cn(
                'text-base font-semibold tabular-nums',
                key === 'balance' && (folio[key] ?? 0) > 0 && 'text-destructive'
              )}
              data-testid={`folio-${key}`}
            >
              <bdi>{f.money(folio[key] ?? 0, view.folio.currency)}</bdi>
            </dd>
          </div>
        ))}
      </dl>
      {view.payments === null ? (
        <p className="text-muted-foreground text-sm">{t('booking.payment.hidden')}</p>
      ) : view.payments.length ? (
        <ul className="grid gap-1.5" aria-label={t('booking.payment.list')}>
          {view.payments.map((p) => (
            <li
              key={p.id}
              className={cn(
                'flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-2 text-sm',
                p.voided && 'text-muted-foreground line-through'
              )}
            >
              <span className="w-24 shrink-0 tabular-nums">{f.date(p.date, 'short')}</span>
              <Badge variant="outline">{t(`calendar.paymentKind.${p.kind}`)}</Badge>
              <span className="text-muted-foreground">{methodName(p.methodId)}</span>
              {p.rateStale && p.rateObservedAt ? (
                <Badge
                  variant="outline"
                  className="border-warning text-foreground font-normal"
                  title={t('booking.payment.oldRateHint', {
                    date: f.date(localDateOf(new Date(p.rateObservedAt)), 'short'),
                    time: f.time(p.rateObservedAt)
                  })}
                  data-testid="payment-old-rate"
                >
                  {t('booking.payment.oldRate')}
                </Badge>
              ) : null}
              {p.collected ? <Badge variant="secondary">{t('booking.payment.collected')}</Badge> : null}
              {p.voided ? <Badge variant="outline">{t('booking.payment.voided')}</Badge> : null}
              <span className="ms-auto text-end font-medium tabular-nums">
                <bdi>
                  {f.money(
                    p.kind === 'refund'
                      ? negate(money(p.amountMinor, p.currency)).amountMinor
                      : p.amountMinor,
                    p.currency
                  )}
                </bdi>
                {p.currency !== view.folio.currency ? (
                  <span className="text-muted-foreground block text-xs">
                    <bdi>{f.money(p.amountFolioMinor, view.folio.currency)}</bdi>
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">{t('calendar.panel.noPayments')}</p>
      )}
      {onPay && view.payments !== null ? (
        <Button variant="outline" className="justify-self-start" onClick={onPay}>
          <PlusIcon aria-hidden />
          {t('calendar.panel.takePayment')}
        </Button>
      ) : null}
    </div>
  )
}
