// "Vazgeçme ve iade" (K-55, S-100): the guest is in the house and gave up. Three ways out, one menu entry: same-day
// check-out (the check-in day becomes a day-use, the rest is refunded), take the check-in back and cancel (the stay
// never happened), early check-out (the nights left are freed). Whenever money was collected the way it goes back
// is chosen here, once (G-60): enter the refund, park the reservation as "refund pending" (for whoever may not
// refund) or keep the money with a reason. Nothing is deleted; the service writes the audit rows.
import { useId, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangleIcon } from 'lucide-react'
import { localDateOf } from '@shared/date'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { MoneyInput } from '@/components/money-input'
import { ResponsiveDialog } from '@/components/responsive-dialog'
import { useFormat } from '@/hooks/use-format'
import { deferForPendingAmount } from '@/features/settings/use-admin'
import { useCan } from '@/lib/view-as'
import { localName, useBookingMutation, useBookingOptions, type BookingStay } from './booking-api'
import {
  cancelRefundOf,
  initialMoneyChoice,
  moneyChoiceProblem,
  type MoneyChoice,
  type MoneyMode
} from './money-choice'

function MoneyOption({
  mode,
  enabled,
  label,
  hint
}: {
  mode: MoneyMode
  enabled: boolean
  label: string
  hint?: string | undefined
}) {
  return (
    <label
      className="flex min-h-9 items-start gap-2 rounded-md px-1 py-1 text-sm max-md:min-h-11"
      data-testid={`money-${mode}`}
    >
      <RadioGroupItem value={mode} disabled={!enabled} className="mt-0.5" />
      <span className="grid">
        <span className={enabled ? undefined : 'text-muted-foreground'}>{label}</span>
        {hint ? <span className="text-muted-foreground text-xs">{hint}</span> : null}
      </span>
    </label>
  )
}

/** "Bu rezervasyonda ₺X tahsilat var" + the three ways to settle it. Renders nothing when nothing was collected. */
export function MoneyChoiceFields({
  value,
  onChange,
  collectedMinor,
  currency,
  allowPark,
  tried
}: {
  value: MoneyChoice
  onChange: (next: MoneyChoice) => void
  collectedMinor: number
  currency: string
  /** A reservation already parked, or one somebody stayed in, cannot be parked again. */
  allowPark: boolean
  /** The user pressed the button once: problems are shown. */
  tried: boolean
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const can = useCan()
  const options = useBookingOptions()
  const noteId = useId()
  const canRefund = can('payments.refund', 'edit')
  if (collectedMinor <= 0) return null
  const methods = options.data?.methods ?? []
  const method = value.methodId || methods[0]?.id || ''
  const problem = tried ? moneyChoiceProblem(value, collectedMinor) : null
  return (
    <fieldset className="grid gap-2" data-testid="money-choice">
      <legend className="mb-1 text-sm font-medium" data-testid="money-collected">
        {t('booking.refund.collected', { amount: f.money(collectedMinor, currency) })}
      </legend>
      <RadioGroup
        value={value.mode}
        onValueChange={(v) => onChange({ ...value, mode: v as MoneyMode })}
        aria-label={t('booking.refund.choose')}
        className="grid gap-1"
      >
        <MoneyOption
          mode="refund"
          enabled={canRefund}
          label={t('booking.refund.enter')}
          hint={canRefund ? undefined : t('booking.refund.needManager')}
        />
        {value.mode === 'refund' && canRefund ? (
          <div className="grid gap-3 ps-6">
            <MoneyInput
              label={t('booking.refund.amount')}
              value={value.amount}
              onChange={(amount) => onChange({ ...value, amount: { ...amount, currency } })}
              currencies={[currency]}
              error={
                problem && problem !== 'booking.refund.needNote' ? t(problem as 'errors.internal') : null
              }
            />
            <div className="grid gap-1.5">
              <Label htmlFor="refund-method">{t('calendar.payment.method')}</Label>
              <Select value={method} onValueChange={(methodId) => onChange({ ...value, methodId })}>
                <SelectTrigger id="refund-method" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {methods.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {localName(f, m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        ) : null}
        {/* S-100: "İade bekliyor" is for the one who may not refund; whoever may refund enters it. */}
        {allowPark && !canRefund ? (
          <MoneyOption
            mode="park"
            enabled
            label={t('booking.refund.park')}
            hint={t('booking.refund.parkHint')}
          />
        ) : null}
        <MoneyOption
          mode="keep"
          enabled
          label={t('booking.refund.keep')}
          hint={t('booking.refund.keepHint')}
        />
        {value.mode === 'keep' ? (
          <div className="grid gap-1.5 ps-6">
            <Label htmlFor={noteId}>{t('booking.refund.keepReason')}</Label>
            <Input
              id={noteId}
              value={value.note}
              maxLength={200}
              onChange={(e) => onChange({ ...value, note: e.target.value })}
              aria-invalid={problem === 'booking.refund.needNote' || undefined}
            />
            {problem === 'booking.refund.needNote' ? (
              <p className="text-destructive text-xs">{t('booking.refund.needNote')}</p>
            ) : null}
          </div>
        ) : null}
      </RadioGroup>
    </fieldset>
  )
}

type Way = 'sameDay' | 'undo' | 'early'

/** The menu entry "Vazgeçme ve iade" of a reservation whose guest is in the house. */
export function GiveUpDialog({
  stay,
  reservationId,
  rooms,
  collectedMinor,
  currency,
  open,
  onOpenChange,
  onCheckout
}: {
  /** The room the guest is in. */
  stay: BookingStay
  reservationId: string
  /** Rooms of the reservation that are not cancelled: more than one means only this room is given up. */
  rooms: number
  /** Net collected on the folio; null when the user may not see payments. */
  collectedMinor: number | null
  currency: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Check-out ways: the panel closes this and opens its check-out window; `refundAfter` = offer the refund after. */
  onCheckout: (stayId: string, refundAfter: boolean) => void
}) {
  const { t } = useTranslation()
  const can = useCan()
  const options = useBookingOptions()
  const reasonId = useId()
  const today = localDateOf(new Date())
  const checkedInToday = !!stay.checkedInAt && localDateOf(new Date(stay.checkedInAt)) === today
  const may = {
    sameDay: stay.checkIn === today,
    undo: can('booking.undoCheckIn', 'edit') && checkedInToday,
    early: stay.checkOut > today
  } satisfies Record<Way, boolean>
  const why: Record<Way, string | null> = {
    sameDay: may.sameDay ? null : t('booking.giveup.sameDayNo'),
    undo: !can('booking.undoCheckIn', 'edit')
      ? t('booking.giveup.undoNoRight')
      : checkedInToday
        ? null
        : t('booking.giveup.undoNotToday'),
    early: may.early ? null : t('booking.giveup.earlyNo')
  }
  const first = (['sameDay', 'undo', 'early'] as const).find((w) => may[w]) ?? 'sameDay'
  const [way, setWay] = useState<Way>(first)
  const collected = collectedMinor ?? 0
  const canRefund = can('payments.refund', 'edit')
  // A single-room reservation is cancelled whole; with more rooms only this room is given up.
  const allowPark = rooms === 1
  const [money, setMoney] = useState<MoneyChoice>(() =>
    initialMoneyChoice(collected, currency, { canRefund, allowPark })
  )
  const [reason, setReason] = useState('')
  const [tried, setTried] = useState(false)
  const [kbsNames, setKbsNames] = useState<string | null>(null)
  const [kbsOk, setKbsOk] = useState(false)
  const done = (): void => onOpenChange(false)
  const park = useBookingMutation('booking.park', {
    success: t('booking.toast.parked'),
    onSuccess: done
  })
  const cancel = useBookingMutation('booking.cancel', {
    success: t('booking.toast.cancelled'),
    onSuccess: done
  })
  const cancelStay = useBookingMutation('booking.cancelStay', {
    success: t('booking.toast.stayCancelled', { room: stay.roomNumber }),
    onSuccess: done
  })
  const undo = useBookingMutation('booking.undoCheckIn', {
    success: t('booking.toast.checkInUndone', { room: stay.roomNumber }),
    onError: (error) => {
      if (error.messageKey !== 'errors.undoCheckInKbs') return false
      const names = (error.details as { names?: unknown } | undefined)?.names
      setKbsNames(typeof names === 'string' ? names : '')
      return true
    }
  })
  const busy = undo.isPending || cancel.isPending || cancelStay.isPending || park.isPending
  const submit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault()
    if (way !== 'undo') return onCheckout(stay.id, way === 'sameDay' || collected > 0)
    if (deferForPendingAmount(e.currentTarget)) return
    setTried(true)
    if (reason.trim().length < 3) return
    if (rooms === 1 && collected > 0 && moneyChoiceProblem(money, collected)) return
    if (kbsNames !== null && !kbsOk) return
    const text = reason.trim()
    undo.mutate(
      { stayId: stay.id, reason: text, ...(kbsOk ? { kbsConfirmed: true } : {}) },
      {
        onSuccess: () => {
          if (rooms > 1) return cancelStay.mutate({ stayId: stay.id, reason: text })
          if (collected > 0 && money.mode === 'park')
            return park.mutate({ id: reservationId, park: { reason: 'refund_pending', note: text } })
          const refund = collected > 0 ? cancelRefundOf(money, options.data?.methods ?? []) : undefined
          cancel.mutate({ id: reservationId, reason: text, ...(refund ? { refund } : {}) })
        }
      }
    )
  }
  const ways: { value: Way; label: string; hint: string }[] = [
    { value: 'sameDay', label: t('booking.giveup.sameDay'), hint: t('booking.giveup.sameDayHint') },
    { value: 'undo', label: t('booking.giveup.undo'), hint: t('booking.giveup.undoHint') },
    { value: 'early', label: t('booking.giveup.early'), hint: t('booking.giveup.earlyHint') }
  ]
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('booking.giveup.title', { room: stay.roomNumber })}
      description={t('booking.giveup.description')}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            form="giveup-form"
            variant={way === 'undo' ? 'destructive' : 'default'}
            disabled={busy || !may[way]}
            data-testid="giveup-confirm"
          >
            {way === 'undo' ? t('booking.giveup.undoConfirm') : t('booking.giveup.checkoutConfirm')}
          </Button>
        </>
      }
    >
      <form id="giveup-form" className="grid gap-4" onSubmit={submit} noValidate>
        <RadioGroup
          value={way}
          onValueChange={(v) => setWay(v as Way)}
          aria-label={t('booking.giveup.title', { room: stay.roomNumber })}
          className="grid gap-1"
        >
          {ways.map((w) => (
            <label
              key={w.value}
              className="flex min-h-9 items-start gap-2 rounded-md border px-3 py-2 text-sm max-md:min-h-11"
              data-testid={`giveup-${w.value}`}
            >
              <RadioGroupItem value={w.value} disabled={!may[w.value]} className="mt-0.5" />
              <span className="grid">
                <span className={may[w.value] ? 'font-medium' : 'text-muted-foreground font-medium'}>
                  {w.label}
                </span>
                <span className="text-muted-foreground text-xs">{why[w.value] ?? w.hint}</span>
              </span>
            </label>
          ))}
        </RadioGroup>
        {way === 'undo' ? (
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor={reasonId}>{t('booking.cancel.reason')}</Label>
              <Textarea
                id={reasonId}
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                aria-invalid={(tried && reason.trim().length < 3) || undefined}
              />
              {tried && reason.trim().length < 3 ? (
                <p className="text-destructive text-xs">{t('errors.reasonRequired')}</p>
              ) : null}
            </div>
            {rooms === 1 && collectedMinor ? (
              <MoneyChoiceFields
                value={money}
                onChange={setMoney}
                collectedMinor={collectedMinor}
                currency={currency}
                allowPark={allowPark}
                tried={tried}
              />
            ) : null}
            {rooms > 1 ? (
              <p className="text-muted-foreground text-sm">{t('booking.giveup.otherRooms')}</p>
            ) : null}
            {kbsNames !== null ? (
              <Alert variant="destructive" data-testid="giveup-kbs">
                <AlertTriangleIcon />
                <AlertTitle>{t('booking.giveup.kbsTitle')}</AlertTitle>
                <AlertDescription className="grid gap-2">
                  <span>{t('booking.giveup.kbsBody', { names: kbsNames })}</span>
                  <label className="flex min-h-9 items-center gap-2 text-sm max-md:min-h-11">
                    <Checkbox checked={kbsOk} onCheckedChange={(c) => setKbsOk(c === true)} />
                    {t('booking.giveup.kbsConfirm')}
                  </label>
                </AlertDescription>
              </Alert>
            ) : null}
          </div>
        ) : collected > 0 ? (
          <p className="text-muted-foreground text-sm" data-testid="giveup-refund-later">
            {canRefund ? t('booking.giveup.refundAfter') : t('booking.giveup.refundNeedsManager')}
          </p>
        ) : null}
      </form>
    </ResponsiveDialog>
  )
}
