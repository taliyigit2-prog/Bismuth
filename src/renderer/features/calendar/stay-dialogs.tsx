// The panel's state changes that ask something first (faz-05 madde 2, 4): check-out with the KBS check-out marks
// (G-53: an unmarked person is a warning; the room becomes dirty, G-90) and the nights it frees (K-44: leaving on
// the check-in day turns the first night into that day's day-use), park with a reason (G-39), restore a parked
// reservation onto a room and dates, cancel with a reason, cancel one room, no-show (G-42). Nothing is deleted: the
// service keeps history.
import { clockOf } from '@shared/domain/stays'
import { useId, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangleIcon } from 'lucide-react'
import { addDays, localDateOf, type LocalDate } from '@shared/date'
import type { ProcedureInput } from '@shared/contract'
import { checkoutKbsGaps, checkoutPlan } from '@shared/domain/booking'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'
import { DateInput } from '@/components/date-input'
import { MoneyInput, type MoneyValue } from '@/components/money-input'
import { ResponsiveDialog } from '@/components/responsive-dialog'
import { deferForPendingAmount } from '@/features/settings/use-admin'
import { useFormat } from '@/hooks/use-format'
import { toast } from 'sonner'
import { useApiQuery } from '@/lib/api/hooks'
import { useTransport } from '@/lib/api/api-context'
import { useCan } from '@/lib/view-as'
import { useBookingMutation, useBookingOptions, type BookingStay } from './booking-api'
import { MoneyChoiceFields } from './giveup-dialog'
import { cancelRefundOf, initialMoneyChoice, moneyChoiceProblem, type MoneyChoice } from './money-choice'
import { useBlockOverride } from './override'
import { OverrideDialog } from './override-dialog'
import { RoomMultiPicker } from './room-multi-picker'

function DialogButtons({
  form,
  label,
  onCancel,
  destructive = false,
  testId
}: {
  form: string
  label: string
  onCancel: () => void
  destructive?: boolean
  testId?: string
}) {
  const { t } = useTranslation()
  return (
    <>
      <Button variant="outline" onClick={onCancel}>
        {t('common.cancel')}
      </Button>
      <Button
        type="submit"
        form={form}
        variant={destructive ? 'destructive' : 'default'}
        data-testid={testId}
      >
        {label}
      </Button>
    </>
  )
}

/** Check-out (G-53, G-90): tick the people whose KBS check-out is done; the unticked are named in a warning. */
export function CheckoutDialog({
  stay,
  open,
  onOpenChange,
  currency,
  onCheckedOut
}: {
  stay: BookingStay
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The folio's currency (the day-use price of a same-day departure). */
  currency: string
  /** After the check-out is saved (the panel then offers the refund of a guest who gave up, K-55). */
  onCheckedOut?: () => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const people = stay.occupants.filter((o) => !o.kbsCheckoutAt)
  const [ticked, setTicked] = useState<Set<string>>(new Set())
  const gaps = checkoutKbsGaps(stay.occupants, ticked)
  const plan = checkoutPlan(stay, localDateOf(new Date()))
  const firstNight = stay.nights.find((n) => n.date === stay.checkIn)
  // H-06: the same-day price starts from the room type's hour price × the hours used (else the first night's price);
  // the field is hidden when the day slot has no free range (the service then keeps the night as it was).
  const sameDay = stay.sameDay ?? null
  const [dayUse, setDayUse] = useState<MoneyValue>({
    amountMinor: sameDay?.suggestedMinor ?? firstNight?.priceMinor ?? null,
    currency
  })
  const [freeOk, setFreeOk] = useState(false)
  const [freeError, setFreeError] = useState(false)
  const showDayUse = plan.kind === 'sameDay' && sameDay !== null
  // P21d: leaving after the hotel's late check-out hour offers the fee line (the desk can change or untick it).
  const can = useCan()
  const [nowTime] = useState(() => clockOf(new Date()))
  const lateQuote = useApiQuery(
    'booking.feeQuote',
    { kind: 'lateCheckout', stayId: stay.id, time: nowTime },
    { enabled: open && can('extras', 'edit') && plan.kind === 'onTime' }
  )
  const [lateOn, setLateOn] = useState(true)
  const [lateFee, setLateFee] = useState<MoneyValue | null>(null)
  const lateShown: MoneyValue = lateFee ?? {
    amountMinor: lateQuote.data?.suggestedMinor ?? null,
    currency
  }
  const offerLate = !!lateQuote.data && lateQuote.data.suggestedMinor > 0
  const transport = useTransport()
  const checkOut = useBookingMutation('booking.checkOut', {
    success: t('booking.toast.checkedOut', { room: stay.roomNumber }),
    onSuccess: () => {
      if (offerLate && lateOn && lateShown.amountMinor && lateShown.amountMinor > 0)
        void transport
          .call('booking.addLateCheckout', {
            stayId: stay.id,
            time: nowTime,
            amountMinor: lateShown.amountMinor
          })
          .then(() => toast.success(t('booking.lateCheckout.added')))
          .catch(() => toast.error(t('booking.lateCheckout.failed')))
      onOpenChange(false)
      onCheckedOut?.()
    }
  })
  const toggle = (id: string, on: boolean): void => {
    const next = new Set(ticked)
    if (on) next.add(id)
    else next.delete(id)
    setTicked(next)
  }
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('booking.checkout.title', { room: stay.roomNumber })}
      description={t('booking.checkout.description')}
      footer={
        <DialogButtons
          form="checkout-form"
          label={t('calendar.panel.checkOut')}
          onCancel={() => onOpenChange(false)}
          testId="checkout-confirm"
        />
      }
    >
      <form
        id="checkout-form"
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (deferForPendingAmount(e.currentTarget)) return
          // H-06: a free same-day stay is a decision (ticked), not an empty or zero field left by mistake.
          if (showDayUse && dayUse.amountMinor === 0 && !freeOk) return setFreeError(true)
          checkOut.mutate({
            stayId: stay.id,
            kbsCheckoutIds: [...ticked],
            ...(showDayUse && dayUse.amountMinor !== null
              ? {
                  dayUsePriceMinor: dayUse.amountMinor,
                  ...(dayUse.amountMinor === 0 ? { dayUseFreeConfirmed: true } : {})
                }
              : {})
          })
        }}
      >
        {plan.kind !== 'onTime' ? (
          <Alert data-testid="checkout-release">
            <AlertTriangleIcon />
            <AlertDescription className="text-foreground">
              {plan.kind === 'sameDay' ? (
                <span className="block">{t('booking.checkout.sameDay')}</span>
              ) : null}
              {plan.released.length ? (
                <span className="block">
                  {t('booking.checkout.release', { count: plan.released.length })}
                </span>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}
        {showDayUse ? (
          <div className="grid gap-2" data-testid="checkout-dayuse">
            <MoneyInput
              label={t('booking.checkout.dayUsePrice')}
              value={dayUse}
              onChange={(v) => {
                setDayUse({ ...v, currency })
                setFreeError(false)
                if (v.amountMinor !== 0) setFreeOk(false)
              }}
              currencies={[currency]}
            />
            {sameDay.startTime && sameDay.endTime ? (
              <p className="text-muted-foreground text-xs tabular-nums">
                {t('booking.checkout.dayUseHours', { start: sameDay.startTime, end: sameDay.endTime })}
              </p>
            ) : null}
            {sameDay.suggestedMinor !== null ? (
              <p className="text-muted-foreground text-xs" data-testid="checkout-dayuse-suggested">
                {t('booking.checkout.dayUseSuggested', {
                  amount: f.money(sameDay.suggestedMinor, currency)
                })}
              </p>
            ) : null}
            {dayUse.amountMinor === 0 ? (
              <label className="flex min-h-8 items-center gap-2 text-sm max-md:min-h-11">
                <Checkbox
                  checked={freeOk}
                  onCheckedChange={(c) => {
                    setFreeOk(c === true)
                    setFreeError(false)
                  }}
                  data-testid="checkout-free-confirm"
                />
                {t('booking.checkout.freeConfirm')}
              </label>
            ) : null}
            {freeError ? (
              <p role="alert" className="text-destructive text-sm" data-testid="checkout-free-error">
                {t('booking.checkout.freeNeeded')}
              </p>
            ) : null}
          </div>
        ) : null}
        {people.length ? (
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">{t('booking.checkout.kbsLegend')}</legend>
            {people.map((o) => (
              <label
                key={o.id}
                className="flex min-h-9 items-center gap-2 rounded-md border px-3 text-sm max-md:min-h-11"
                data-testid={`checkout-person-${o.id}`}
              >
                <Checkbox
                  checked={ticked.has(o.id)}
                  disabled={!o.kbsReportedAt}
                  onCheckedChange={(c) => toggle(o.id, c === true)}
                />
                <span className="font-medium">{o.fullName}</span>
                {!o.kbsReportedAt ? (
                  <span className="text-destructive ms-auto text-xs">{t('occupants.kbsMissingIn')}</span>
                ) : null}
              </label>
            ))}
          </fieldset>
        ) : null}
        {gaps.length ? (
          <Alert variant="destructive" data-testid="checkout-kbs-warning">
            <AlertTriangleIcon />
            <AlertTitle>{t('booking.checkout.gapTitle')}</AlertTitle>
            <AlertDescription>
              {gaps
                .map((g) =>
                  g.kind === 'notReported'
                    ? t('booking.checkout.gapNotReported', { name: g.fullName })
                    : t('booking.checkout.gapCheckout', { name: g.fullName })
                )
                .join(' ')}
            </AlertDescription>
          </Alert>
        ) : null}
        {offerLate ? (
          <div className="grid gap-2 rounded-md border p-3" data-testid="checkout-late">
            <label className="flex min-h-8 items-center gap-2 text-sm font-medium max-md:min-h-11">
              <Checkbox checked={lateOn} onCheckedChange={(c) => setLateOn(c === true)} />
              {t('booking.lateCheckout.offer', { time: nowTime })}
            </label>
            {lateOn ? (
              <MoneyInput
                label={t('booking.lateCheckout.amount')}
                value={lateShown}
                onChange={(v) => setLateFee({ ...v, currency })}
                currencies={[currency]}
              />
            ) : null}
          </div>
        ) : null}
        <p className="text-muted-foreground text-sm">{t('booking.checkout.dirty')}</p>
      </form>
    </ResponsiveDialog>
  )
}

const PARK_REASONS = ['no_show_paid', 'refund_pending', 'postponed', 'other'] as const
type ParkReason = (typeof PARK_REASONS)[number]

/** Park (G-39): the nights are freed, the payments stay; the reservation waits under the calendar. */
export function ParkDialog({
  reservationId,
  open,
  onOpenChange
}: {
  reservationId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const noteId = useId()
  const [reason, setReason] = useState<ParkReason>('postponed')
  const [note, setNote] = useState('')
  const park = useBookingMutation('booking.park', {
    success: t('booking.toast.parked'),
    onSuccess: () => onOpenChange(false)
  })
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('booking.park.title')}
      description={t('booking.park.description')}
      footer={
        <DialogButtons
          form="park-form"
          label={t('booking.park.confirm')}
          onCancel={() => onOpenChange(false)}
          testId="park-confirm"
        />
      }
    >
      <form
        id="park-form"
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          park.mutate({ id: reservationId, park: { reason, note: note.trim() || null } })
        }}
      >
        <RadioGroup
          value={reason}
          onValueChange={(v) => setReason(v as ParkReason)}
          aria-label={t('booking.park.reason')}
          className="grid gap-1"
        >
          {PARK_REASONS.map((r) => (
            <label
              key={r}
              className="flex min-h-9 items-center gap-2 rounded-md px-1 text-sm max-md:min-h-11"
            >
              <RadioGroupItem value={r} />
              {t(`calendar.park.reason.${r}`)}
            </label>
          ))}
        </RadioGroup>
        <div className="grid gap-1.5">
          <Label htmlFor={noteId}>{t('calendar.new.note')}</Label>
          <Textarea id={noteId} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </form>
    </ResponsiveDialog>
  )
}

/**
 * Cancel (no delete): the nights are freed, a reason is required. When money was collected the dialog says how
 * much and asks what happens to it (K-55): enter the refund (needs `payments.refund`), park the reservation as
 * "refund pending" (for whoever may not refund) or keep it with a reason.
 */
export function CancelDialog({
  reservationId,
  open,
  onOpenChange,
  collectedMinor = null,
  currency = 'TRY',
  allowPark = true
}: {
  reservationId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Net collected on the folio; null/0 = nothing to settle (or the user may not see payments). */
  collectedMinor?: number | null
  currency?: string
  /** False for a parked reservation and one somebody stayed in. */
  allowPark?: boolean
}) {
  const { t } = useTranslation()
  const can = useCan()
  const options = useBookingOptions()
  const id = useId()
  const collected = collectedMinor ?? 0
  const [reason, setReason] = useState('')
  const [error, setError] = useState(false)
  const [tried, setTried] = useState(false)
  const [money, setMoney] = useState<MoneyChoice>(() =>
    initialMoneyChoice(collected, currency, { canRefund: can('payments.refund', 'edit'), allowPark })
  )
  const cancel = useBookingMutation('booking.cancel', {
    success: t('booking.toast.cancelled'),
    onSuccess: () => onOpenChange(false)
  })
  const park = useBookingMutation('booking.park', {
    success: t('booking.toast.refundPending'),
    onSuccess: () => onOpenChange(false)
  })
  const parking = collected > 0 && money.mode === 'park'
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('booking.cancel.title')}
      description={t('booking.cancel.description')}
      focusFirstOnPhone={false}
      footer={
        <DialogButtons
          form="cancel-form"
          label={parking ? t('booking.refund.parkConfirm') : t('booking.cancel.confirm')}
          onCancel={() => onOpenChange(false)}
          destructive={!parking}
          testId="cancel-confirm"
        />
      }
    >
      <form
        id="cancel-form"
        className="grid gap-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          if (deferForPendingAmount(e.currentTarget)) return
          setTried(true)
          const bad = reason.trim().length < 3
          setError(bad)
          if (bad || (collected > 0 && moneyChoiceProblem(money, collected, currency))) return
          if (parking)
            return park.mutate({ id: reservationId, park: { reason: 'refund_pending', note: reason.trim() } })
          const refund = collected > 0 ? cancelRefundOf(money, options.data?.methods ?? []) : undefined
          cancel.mutate({ id: reservationId, reason: reason.trim(), ...(refund ? { refund } : {}) })
        }}
      >
        <div className="grid gap-1.5">
          <Label htmlFor={id}>{t('booking.cancel.reason')}</Label>
          <Textarea
            id={id}
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            aria-invalid={error || undefined}
          />
          {error ? <p className="text-destructive text-xs">{t('errors.reasonRequired')}</p> : null}
        </div>
        <MoneyChoiceFields
          value={money}
          onChange={setMoney}
          collectedMinor={collected}
          currency={currency}
          allowPark={allowPark}
          tried={tried}
        />
      </form>
    </ResponsiveDialog>
  )
}

/**
 * "Gelmedi" (G-42): the nights are freed, payments stay; from the panel or the park area. The hotel's no-show fee rule
 * (`fees.noShow`) offers an amount that the desk can change or empty (P21d, Ö-22); it lands on the folio.
 */
export function NoShowDialog({
  reservationId,
  open,
  onOpenChange
}: {
  reservationId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const can = useCan()
  const mayFee = can('extras', 'edit')
  const quote = useApiQuery(
    'booking.feeQuote',
    { kind: 'noShow', reservationId },
    { enabled: open && mayFee }
  )
  const [fee, setFee] = useState<MoneyValue | null>(null)
  const currency = quote.data?.currency ?? ''
  // Until the desk types something the field shows the rule's suggestion (0 = no fee, an empty field).
  const shown: MoneyValue = fee ?? {
    amountMinor: quote.data && quote.data.suggestedMinor > 0 ? quote.data.suggestedMinor : null,
    currency
  }
  const noShow = useBookingMutation('booking.noShow', {
    success: t('booking.toast.noShow'),
    onSuccess: () => onOpenChange(false)
  })
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('booking.noShow.title')}
      description={t('booking.noShow.description')}
      footer={
        <DialogButtons
          form="no-show-form"
          label={t('booking.noShow.confirm')}
          onCancel={() => onOpenChange(false)}
          destructive
          testId="no-show-confirm"
        />
      }
    >
      <form
        id="no-show-form"
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (deferForPendingAmount(e.currentTarget)) return
          const amount = mayFee ? shown.amountMinor : null
          noShow.mutate({ id: reservationId, ...(amount && amount > 0 ? { feeMinor: amount } : {}) })
        }}
      >
        {mayFee && quote.data ? (
          <div className="grid gap-1.5" data-testid="no-show-fee">
            <MoneyInput
              label={t('booking.noShow.fee')}
              value={shown}
              onChange={(v) => setFee({ ...v, currency })}
              currencies={[currency]}
            />
            <p className="text-muted-foreground text-xs">{t('booking.noShow.feeHelp')}</p>
          </div>
        ) : null}
      </form>
    </ResponsiveDialog>
  )
}

/** One room of a reservation that is still to come (G-35): its nights are freed, the rest stays. */
export function CancelStayDialog({
  stay,
  open,
  onOpenChange
}: {
  stay: { id: string; roomNumber: string }
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const id = useId()
  const [reason, setReason] = useState('')
  const [error, setError] = useState(false)
  const cancel = useBookingMutation('booking.cancelStay', {
    success: t('booking.toast.stayCancelled', { room: stay.roomNumber }),
    onSuccess: () => onOpenChange(false)
  })
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('booking.cancelStay.title', { room: stay.roomNumber })}
      description={t('booking.cancelStay.description')}
      footer={
        <DialogButtons
          form="cancel-stay-form"
          label={t('booking.cancelStay.confirm')}
          onCancel={() => onOpenChange(false)}
          destructive
          testId="cancel-stay-confirm"
        />
      }
    >
      <form
        id="cancel-stay-form"
        className="grid gap-1.5"
        onSubmit={(e) => {
          e.preventDefault()
          if (reason.trim().length < 3) return setError(true)
          cancel.mutate({ stayId: stay.id, reason: reason.trim() })
        }}
      >
        <Label htmlFor={id}>{t('booking.cancel.reason')}</Label>
        <Textarea
          id={id}
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          aria-invalid={error || undefined}
        />
        {error ? <p className="text-destructive text-xs">{t('errors.reasonRequired')}</p> : null}
      </form>
    </ResponsiveDialog>
  )
}

/** Restore a parked reservation (G-39): room(s), dates and price; the payments it had are credited again. */
export function UnparkDialog({
  parked,
  open,
  onOpenChange
}: {
  parked: {
    id: string
    currency: string
    lastNightlyMinor: number | null
    stays: { roomId: string; checkIn: string; checkOut: string }[]
  }
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const options = useBookingOptions()
  const today = localDateOf(new Date())
  const first = parked.stays[0]
  const startsLater = first && first.checkIn >= today
  const [checkIn, setCheckIn] = useState<LocalDate>(startsLater ? (first.checkIn as LocalDate) : today)
  const [checkOut, setCheckOut] = useState<LocalDate>(
    startsLater && first.checkOut > first.checkIn ? (first.checkOut as LocalDate) : addDays(today, 1)
  )
  const [roomIds, setRoomIds] = useState<string[]>(parked.stays.map((s) => s.roomId))
  const [price, setPrice] = useState<MoneyValue>({
    amountMinor: parked.lastNightlyMinor,
    currency: parked.currency
  })
  const [error, setError] = useState<string | null>(null)
  const taken = useApiQuery(
    'booking.availability',
    { from: checkIn, to: checkOut },
    { enabled: open && checkOut >= checkIn }
  )
  const can = useCan()
  const override = useBlockOverride<ProcedureInput<'booking.unpark'>>()
  const restore = useBookingMutation('booking.unpark', {
    success: t('booking.toast.restored'),
    onSuccess: () => onOpenChange(false),
    onError: override.onError
  })
  const submit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault()
    if (deferForPendingAmount(e.currentTarget)) return
    if (!roomIds.length) return setError(t('booking.form.needRoom'))
    if (checkOut < checkIn) return setError(t('booking.form.badDates'))
    if (price.amountMinor === null) return setError(t('errors.priceMissing'))
    setError(null)
    restore.mutate({
      id: parked.id,
      stays: roomIds.map((roomId) => ({
        roomId,
        checkIn,
        checkOut,
        nightlyPriceMinor: price.amountMinor ?? 0
      }))
    })
  }
  return (
    <>
      <ResponsiveDialog
        open={open}
        onOpenChange={onOpenChange}
        title={t('booking.unpark.title')}
        description={t('booking.unpark.description')}
        footer={
          <DialogButtons
            form="unpark-form"
            label={t('calendar.park.restore')}
            onCancel={() => onOpenChange(false)}
            testId="unpark-confirm"
          />
        }
      >
        <form id="unpark-form" className="grid gap-4 sm:grid-cols-2" onSubmit={submit} noValidate>
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
          <div className="sm:col-span-2">
            <RoomMultiPicker
              label={t('booking.rooms.label')}
              rooms={options.data?.rooms ?? []}
              value={roomIds}
              onChange={setRoomIds}
              occupied={new Set(taken.data?.occupied ?? [])}
              blocked={new Set(taken.data?.blocked ?? [])}
              allowOverride={can('rooms.block', 'edit')}
            />
          </div>
          <div className="sm:col-span-2">
            <MoneyInput
              label={t('calendar.new.nightlyPrice')}
              value={price}
              onChange={(v) => setPrice({ ...v, currency: parked.currency })}
              currencies={[parked.currency]}
            />
          </div>
          {error ? (
            <p role="alert" className="text-destructive text-sm sm:col-span-2">
              {error}
            </p>
          ) : null}
        </form>
      </ResponsiveDialog>
      <OverrideDialog
        override={override}
        onConfirm={(input, reason) => restore.mutate({ ...input, overrideBlockReason: reason })}
      />
    </>
  )
}
