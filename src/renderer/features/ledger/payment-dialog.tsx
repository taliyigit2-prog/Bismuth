// New income from the ledger (faz-07 madde 1, 5; G-61, G-68): a payment on a reservation (searched; the same
// payments row the reservation panel writes, so the tape chart repaints) or an extra service sale such as luggage
// storage (no room; a guest is optional). A row clicked in the day list opens the same form to change it. A foreign
// amount is valued at the rate of the minute it is written (S-32); only when no rate is known does the form ask for
// a typed one, always "1 <currency> = ? <base currency>" (K-43).
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { multiplyRatio, money } from '@shared/money'
import type { LocalDate } from '@shared/date'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { DateInput } from '@/components/date-input'
import { isAmount, MoneyInput, type MoneyValue } from '@/components/money-input'
import { useOverAmountConfirm } from '@/components/money-input-confirm'
import { ResponsiveDialog } from '@/components/responsive-dialog'
import { ClosedDayReason, useMayWriteClosedDay } from '@/components/closed-day-reason'
import {
  EMPTY_RATES,
  ManualRateFields,
  typedRates,
  useRateNeeds,
  type RateTexts
} from '@/components/manual-rate-fields'
import { useFormat } from '@/hooks/use-format'
import { useCan } from '@/lib/view-as'
import { deferForPendingAmount } from '@/features/settings/use-admin'
import {
  localName,
  useLedgerMutation,
  type IncomeRow,
  type LedgerOptions,
  type ReservationHit
} from './ledger-api'
import { ReservationPicker } from './reservation-picker'

const KINDS = ['payment', 'deposit', 'refund'] as const
type Kind = (typeof KINDS)[number]
type Target = 'reservation' | 'sale'
const NONE = 'none'

export function PaymentDialog({
  open,
  onOpenChange,
  day,
  closed,
  options,
  editing
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  day: LocalDate
  /** The day is closed (G-72): writing needs the lock right and a reason. */
  closed: boolean
  options: LedgerOptions
  editing?: IncomeRow | null
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const mayWriteClosed = useMayWriteClosedDay()
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? t('ledger.pay.editTitle') : t('ledger.addPayment.title')}
      description={t('ledger.addPayment.description', { date: f.date(editing?.date ?? day, 'long') })}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            form="ledger-payment"
            data-testid="ledger-payment-save"
            disabled={closed && !mayWriteClosed}
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      {open ? (
        <PaymentForm
          key={editing?.id ?? 'new'}
          day={day}
          closed={closed}
          options={options}
          editing={editing ?? null}
          onDone={() => onOpenChange(false)}
        />
      ) : null}
    </ResponsiveDialog>
  )
}

function PaymentForm({
  day,
  closed,
  options,
  editing,
  onDone
}: {
  day: LocalDate
  closed: boolean
  options: LedgerOptions
  editing: IncomeRow | null
  onDone: () => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const can = useCan()
  const kinds = KINDS.filter((k) => k !== 'refund' || can('payments.refund', 'edit'))
  const [target, setTarget] = useState<Target>(editing?.saleTitle ? 'sale' : 'reservation')
  const [reservation, setReservation] = useState<ReservationHit | null>(null)
  const [kind, setKind] = useState<Kind>(editing?.kind ?? 'payment')
  const [amount, setAmount] = useState<MoneyValue>({
    amountMinor: editing?.amountMinor ?? null,
    currency: editing?.currency ?? options.baseCurrency
  })
  const [date, setDate] = useState<LocalDate>((editing?.date as LocalDate | undefined) ?? day)
  const [methodId, setMethodId] = useState(editing?.methodId ?? options.methods[0]?.id ?? '')
  // Only a non-direct channel is a choice in the list; a direct one (or none) is "Doğrudan".
  const channelChoice = (id: string | null | undefined): string =>
    id && options.channels.some((c) => c.id === id && c.kind !== 'direct') ? id : NONE
  const [channelId, setChannelId] = useState(channelChoice(editing?.channelId))
  // "Doğrudan" is saved as a direct channel, so a payment on a Booking reservation keeps the choice (B25): the
  // row's own direct channel when it had one, else the hotel's first direct channel.
  const directChannelId =
    (editing?.channelId &&
      options.channels.some((c) => c.id === editing.channelId && c.kind === 'direct') &&
      editing.channelId) ||
    (
      options.channels.find((c) => c.kind === 'direct' && c.code === 'direct') ??
      options.channels.find((c) => c.kind === 'direct')
    )?.id ||
    null
  const [reference, setReference] = useState(editing?.reference ?? '')
  const [note, setNote] = useState(editing?.note ?? '')
  const [rates, setRates] = useState<RateTexts>(EMPTY_RATES)
  const [forceRate, setForceRate] = useState(false)
  const [closedReason, setClosedReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  // Extra service sale.
  const [serviceId, setServiceId] = useState(options.extraServices[0]?.id ?? '')
  const [qty, setQty] = useState('1')
  const [unit, setUnit] = useState<MoneyValue>(() => {
    const s = options.extraServices[0]
    return { amountMinor: s?.defaultPriceMinor ?? null, currency: s?.defaultCurrency ?? options.baseCurrency }
  })
  const [saleTitle, setSaleTitle] = useState('')
  const [tried, setTried] = useState(false)
  const service = options.extraServices.find((s) => s.id === serviceId)
  const qtyNumber = /^\d{1,4}$/.test(qty.trim()) ? Number(qty.trim()) : null
  const saleTotal =
    unit.amountMinor != null && qtyNumber
      ? multiplyRatio(money(unit.amountMinor, unit.currency), qtyNumber).amountMinor
      : null
  const shownCurrency = target === 'sale' ? unit.currency : amount.currency
  const folioCurrency = editing
    ? editing.folioCurrency
    : target === 'sale'
      ? shownCurrency
      : (reservation?.currency ?? null)
  const needs = useRateNeeds(shownCurrency, folioCurrency, { force: forceRate })
  const mayWriteClosed = useMayWriteClosedDay()
  const success = t(target === 'sale' && !editing ? 'ledger.pay.saleSaved' : 'ledger.pay.saved')
  const done = { success, onSuccess: onDone, onError: (e: { messageKey: string }) => showError(e.messageKey) }
  const add = useLedgerMutation('ledger.addPayment', done)
  const update = useLedgerMutation('ledger.updatePayment', done)
  const sell = useLedgerMutation('ledger.sellExtra', done)
  const pending = add.isPending || update.isPending || sell.isPending
  const overAmount = useOverAmountConfirm()
  // An amount the form may send (QA2a): written, a number, above zero; the message sits under the field.
  const amountOk = isAmount(amount) && amount.amountMinor > 0
  const unitOk = isAmount(unit)
  const amountError = tried && !amountOk ? t('ledger.addPayment.amountRequired') : null
  const unitError = tried && !unitOk ? t('ledger.addPayment.amountRequired') : null

  function showError(key: string): boolean {
    // The two refusals the form can answer itself: no rate (type one) and a closed day (give a reason).
    if (key === 'errors.noRate') {
      setForceRate(true)
      setError(t('ledger.pay.needRate'))
      return true
    }
    if (key === 'errors.dayClosed') {
      setError(t('errors.dayClosed'))
      return true
    }
    return false
  }

  const submit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault()
    if (pending || deferForPendingAmount(e.currentTarget)) return
    setTried(true)
    const typed = typedRates(needs, rates)
    if (typed === 'bad') return setError(t('ledger.pay.badRate'))
    if (closed && !mayWriteClosed) return setError(t('ledger.closed.lockedHint'))
    if (closed && closedReason.trim().length < 3) return setError(t('ledger.closed.reasonNeeded'))
    const reason = closed ? { dayClosedReason: closedReason.trim() } : {}
    const channel = !channelId || channelId === NONE ? directChannelId : channelId
    if (target === 'sale' && !editing) {
      if (!service) return setError(t('ledger.sale.needService'))
      if (!qtyNumber) return setError(t('ledger.sale.needQty'))
      if (!unitOk) return setError(null)
      if (!methodId) return setError(t('ledger.pay.needMethod'))
      setError(null)
      sell.mutate({
        extraServiceId: service.id,
        date,
        qty: qtyNumber,
        unitMinor: unit.amountMinor ?? 0,
        currency: unit.currency,
        description: saleTitle.trim() || undefined,
        ...(reservation ? { reservationId: reservation.reservationId } : {}),
        payment: { methodId, channelId: channel, reference: reference.trim() || null },
        ...(typed.manualRateMicro ? { manualRateMicro: typed.manualRateMicro } : {}),
        ...reason
      })
      return
    }
    if (!amountOk || amount.amountMinor === null) return setError(null)
    if (!methodId) return setError(t('ledger.pay.needMethod'))
    if (!editing && !reservation) return setError(t('ledger.pay.pickReservation'))
    setError(null)
    const fields = {
      methodId,
      channelId: channel,
      amountMinor: amount.amountMinor,
      currency: amount.currency,
      ...typed,
      reference: reference.trim() || null,
      note: note.trim() || null,
      ...reason
    }
    if (editing) return update.mutate({ id: editing.id, patch: { ...fields, date } })
    if (!reservation) return
    const send = (): void => add.mutate({ ...fields, reservationId: reservation.reservationId, date, kind })
    // More than the balance (QA2a, K-46): asked once; the rest stays on the folio as the guest's credit.
    const balance = Math.max(0, reservation.balanceMinor)
    if (kind !== 'refund' && amount.currency === reservation.currency && amount.amountMinor > balance)
      return overAmount.ask({
        title: t('ledger.pay.overTitle'),
        body: t('ledger.pay.overBody', {
          balance: f.money(balance, amount.currency),
          amount: f.money(amount.amountMinor, amount.currency),
          over: f.money(amount.amountMinor - balance, amount.currency)
        }),
        action: t('ledger.pay.overConfirm'),
        go: send
      })
    send()
  }

  const pickReservation = (hit: ReservationHit | null): void => {
    setReservation(hit)
    if (!hit || target !== 'reservation') return
    if (!amount.amountMinor && hit.balanceMinor > 0)
      setAmount({ amountMinor: hit.balanceMinor, currency: hit.currency })
    else setAmount((a) => ({ ...a, currency: hit.currency }))
    setChannelId(channelChoice(hit.channelId))
  }

  const methodField = (
    <div className="grid gap-1.5">
      <Label htmlFor="ledger-pay-method">{t('calendar.payment.method')}</Label>
      <Select value={methodId} onValueChange={setMethodId}>
        <SelectTrigger id="ledger-pay-method" className="w-full">
          <SelectValue placeholder={t('ledger.pay.needMethod')} />
        </SelectTrigger>
        <SelectContent>
          {options.methods.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {localName(f, m)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
  const channelField = (
    <div className="grid gap-1.5">
      <Label htmlFor="ledger-pay-channel">{t('ledger.col.channel')}</Label>
      <Select value={channelId} onValueChange={setChannelId}>
        <SelectTrigger id="ledger-pay-channel" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>{t('ledger.payments.direct')}</SelectItem>
          {options.channels
            .filter((c) => c.kind !== 'direct')
            .map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {localName(f, c)}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
    </div>
  )

  return (
    <form id="ledger-payment" className="grid gap-4" onSubmit={submit} noValidate>
      {editing ? (
        <p className="bg-muted rounded-md px-3 py-2 text-sm" data-testid="editing-target">
          {editing.saleTitle ??
            [editing.roomNumbers.join(', '), editing.guestName].filter(Boolean).join(' · ')}
        </p>
      ) : (
        <div className="grid gap-1.5">
          <span className="text-sm font-medium">{t('ledger.addPayment.for')}</span>
          <ToggleGroup
            type="single"
            variant="outline"
            value={target}
            onValueChange={(v) => v && setTarget(v as Target)}
            className="w-full"
            aria-label={t('ledger.addPayment.for')}
          >
            <ToggleGroupItem value="reservation" className="flex-1" data-testid="target-reservation">
              {t('ledger.addPayment.target.reservation')}
            </ToggleGroupItem>
            <ToggleGroupItem
              value="sale"
              className="flex-1"
              disabled={!can('extras', 'edit') || !options.extraServices.length}
              data-testid="target-sale"
            >
              {t('ledger.addPayment.target.sale')}
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      )}

      {!editing && target === 'reservation' ? (
        <ReservationPicker
          day={day}
          value={reservation}
          onChange={pickReservation}
          label={t('ledger.addPayment.reservation')}
          invalid={tried && !reservation}
        />
      ) : null}

      {!editing && target === 'sale' ? (
        <>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_6rem]">
            <div className="grid gap-1.5">
              <Label htmlFor="ledger-sale-service">{t('ledger.sale.service')}</Label>
              <Select
                value={serviceId}
                onValueChange={(v) => {
                  setServiceId(v)
                  const s = options.extraServices.find((x) => x.id === v)
                  if (s?.defaultPriceMinor != null)
                    setUnit({
                      amountMinor: s.defaultPriceMinor,
                      currency: s.defaultCurrency ?? options.baseCurrency
                    })
                }}
              >
                <SelectTrigger id="ledger-sale-service" className="w-full" data-testid="sale-service">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {options.extraServices.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {localName(f, s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ledger-sale-qty">{t('ledger.sale.qty')}</Label>
              <Input
                id="ledger-sale-qty"
                dir="ltr"
                inputMode="numeric"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="text-end tabular-nums"
                aria-invalid={(tried && !qtyNumber) || undefined}
              />
            </div>
          </div>
          <div className="grid gap-1">
            <MoneyInput
              label={t('ledger.sale.unitPrice')}
              value={unit}
              onChange={setUnit}
              currencies={options.currencies}
              error={unitError}
            />
            {saleTotal != null ? (
              <p className="text-muted-foreground text-xs" data-testid="sale-total">
                {t('ledger.sale.total', { amount: f.money(saleTotal, unit.currency) })}
              </p>
            ) : null}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ledger-sale-title">{t('ledger.addPayment.saleLabel')}</Label>
            <Input
              id="ledger-sale-title"
              value={saleTitle}
              onChange={(e) => setSaleTitle(e.target.value)}
              placeholder={service ? localName(f, service) : t('ledger.addPayment.salePlaceholder')}
              maxLength={200}
            />
          </div>
          <ReservationPicker
            day={day}
            value={reservation}
            onChange={setReservation}
            label={t('ledger.sale.guestOptional')}
          />
        </>
      ) : null}

      {target === 'reservation' || editing ? (
        <>
          {!editing ? (
            <div className="grid gap-1.5">
              <span className="text-sm font-medium">{t('calendar.payment.kind')}</span>
              <ToggleGroup
                type="single"
                variant="outline"
                value={kind}
                onValueChange={(v) => v && setKind(v as Kind)}
                className="w-full"
                aria-label={t('calendar.payment.kind')}
              >
                {kinds.map((k) => (
                  <ToggleGroupItem key={k} value={k} className="flex-1">
                    {t(`calendar.paymentKind.${k}`)}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          ) : null}
          <MoneyInput
            label={t('common.amount')}
            value={amount}
            onChange={setAmount}
            currencies={options.currencies}
            error={amountError}
          />
        </>
      ) : null}

      <ManualRateFields
        needs={needs}
        currency={shownCurrency}
        folioCurrency={folioCurrency}
        value={rates}
        onChange={setRates}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        {methodField}
        {channelField}
      </div>
      {editing ? <DateInput label={t('common.date')} value={date} onChange={setDate} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="ledger-pay-ref">{t('ledger.pay.reference')}</Label>
          <Input
            id="ledger-pay-ref"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            maxLength={120}
          />
        </div>
        {target === 'reservation' || editing ? (
          <div className="grid gap-1.5">
            <Label htmlFor="ledger-pay-note">{t('common.note')}</Label>
            <Input
              id="ledger-pay-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
            />
          </div>
        ) : null}
      </div>
      {date > options.today ? (
        <p className="text-warning text-sm" data-testid="ledger-payment-future">
          {t('ledger.pay.futureDay')}
        </p>
      ) : null}
      {closed ? <ClosedDayReason value={closedReason} onChange={setClosedReason} /> : null}
      {error ? (
        <p role="alert" className="text-destructive text-sm" data-testid="ledger-payment-error">
          {error}
        </p>
      ) : null}
      {overAmount.dialog}
    </form>
  )
}
