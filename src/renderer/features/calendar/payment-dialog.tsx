// Quick payment in the reservation panel (faz-05 madde 3; G-43, G-61, K-15): payment, deposit or refund; amount and
// currency, method, the channel the money came through, the business day. It is the same payments row the ledger
// (Faz 7) reads: entered once. Saved, the panel and the tape chart repaint the nights at once (§6.3). A typed rate
// is asked only when no rate is known ("1 <currency> = ? <base currency>", K-43); a closed business day asks for a
// reason from those who may write into it, and says it is locked to the others (G-72).
import { useId, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { localDateOf, type LocalDate } from '@shared/date'
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
import { localName, useBookingMutation, useBookingOptions } from './booking-api'

const KINDS = ['payment', 'deposit', 'refund'] as const
type Kind = (typeof KINDS)[number]

export function PaymentDialog({
  open,
  onOpenChange,
  reservationId,
  defaultMinor,
  folioCurrency,
  channelId,
  defaultKind = 'payment',
  balanceMinor = null
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  reservationId: string
  /** Suggested amount (the balance), in the folio currency. */
  defaultMinor: number
  folioCurrency: string
  /** The reservation's channel: the default "came through" channel. */
  channelId: string | null
  defaultKind?: Kind
  /** The folio's balance (null = not known): a payment above it is confirmed first (QA2a). */
  balanceMinor?: number | null
}) {
  const { t } = useTranslation()
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('calendar.payment.title')}
      description={t('calendar.payment.description')}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="payment-form" data-testid="payment-save">
            {t('common.save')}
          </Button>
        </>
      }
    >
      {open ? (
        <PaymentForm
          reservationId={reservationId}
          defaultMinor={defaultMinor}
          folioCurrency={folioCurrency}
          channelId={channelId}
          defaultKind={defaultKind}
          balanceMinor={balanceMinor}
          onDone={() => onOpenChange(false)}
        />
      ) : null}
    </ResponsiveDialog>
  )
}

function PaymentForm({
  reservationId,
  defaultMinor,
  folioCurrency,
  channelId: reservationChannel,
  defaultKind,
  balanceMinor,
  onDone
}: {
  reservationId: string
  defaultMinor: number
  folioCurrency: string
  channelId: string | null
  defaultKind: Kind
  balanceMinor: number | null
  onDone: () => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const can = useCan()
  const options = useBookingOptions()
  const refId = useId()
  const kinds = KINDS.filter((k) => k !== 'refund' || can('payments.refund', 'edit'))
  const [kind, setKind] = useState<Kind>(kinds.includes(defaultKind) ? defaultKind : 'payment')
  const [amount, setAmount] = useState<MoneyValue>({
    amountMinor: defaultMinor > 0 ? defaultMinor : null,
    currency: folioCurrency
  })
  const [methodId, setMethodId] = useState<string>('')
  const [channelId, setChannelId] = useState<string>(reservationChannel ?? '')
  const [day, setDay] = useState<LocalDate>(localDateOf(new Date()))
  const [rates, setRates] = useState<RateTexts>(EMPTY_RATES)
  const [forceRate, setForceRate] = useState(false)
  // Shown once the service says the day is closed (G-72; #24).
  const [closed, setClosed] = useState(false)
  const [closedReason, setClosedReason] = useState('')
  const mayWriteClosed = useMayWriteClosedDay()
  const [reference, setReference] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [tried, setTried] = useState(false)
  const overAmount = useOverAmountConfirm()
  // An amount the form may send (QA2a): written, a number, above zero; the message sits under the field.
  const amountOk = isAmount(amount) && amount.amountMinor > 0
  const methods = options.data?.methods ?? []
  const method = methodId || methods[0]?.id || ''
  const currencies = options.data?.currencies ?? [folioCurrency]
  const needs = useRateNeeds(amount.currency, folioCurrency, { force: forceRate })
  const save = useBookingMutation('booking.addPayment', {
    success: t(kind === 'refund' ? 'booking.toast.refund' : 'booking.toast.payment'),
    onSuccess: onDone,
    onError: (e) => {
      if (e.messageKey === 'errors.noRate') {
        setForceRate(true)
        setError(t('ledger.pay.needRate'))
        return true
      }
      if (e.messageKey === 'errors.dayClosed') {
        setClosed(true)
        setError(t(mayWriteClosed ? 'ledger.closed.reasonNeeded' : 'ledger.closed.lockedHint'))
        return true
      }
      return false
    }
  })
  const submit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault()
    if (deferForPendingAmount(e.currentTarget)) return
    setTried(true)
    if (!amountOk || amount.amountMinor === null) return setError(null)
    if (!method) return setError(t('booking.payment.needMethod'))
    const typed = typedRates(needs, rates)
    if (typed === 'bad') return setError(t('booking.payment.badRate'))
    if (closed && !mayWriteClosed) return setError(t('ledger.closed.lockedHint'))
    if (closed && closedReason.trim().length < 3) return setError(t('ledger.closed.reasonNeeded'))
    setError(null)
    const amountMinor = amount.amountMinor
    const send = (): void =>
      save.mutate({
        reservationId,
        date: day,
        kind,
        methodId: method,
        channelId: channelId || null,
        amountMinor,
        currency: amount.currency,
        ...typed,
        reference: reference.trim() || null,
        ...(closed ? { dayClosedReason: closedReason.trim() } : {})
      })
    // More than the balance (QA2a, K-46): asked once; the rest stays on the folio as the guest's credit.
    const balance = balanceMinor === null ? null : Math.max(0, balanceMinor)
    if (kind !== 'refund' && balance !== null && amount.currency === folioCurrency && amountMinor > balance)
      return overAmount.ask({
        title: t('ledger.pay.overTitle'),
        body: t('ledger.pay.overBody', {
          balance: f.money(balance, folioCurrency),
          amount: f.money(amountMinor, folioCurrency),
          over: f.money(amountMinor - balance, folioCurrency)
        }),
        action: t('ledger.pay.overConfirm'),
        go: send
      })
    send()
  }
  return (
    <form id="payment-form" className="grid gap-4" onSubmit={submit} noValidate>
      <div className="grid gap-1.5">
        <span className="text-sm font-medium">{t('calendar.payment.kind')}</span>
        <ToggleGroup
          type="single"
          variant="outline"
          value={kind}
          onValueChange={(v) => v && setKind(v as Kind)}
          aria-label={t('calendar.payment.kind')}
          className="w-full"
        >
          {kinds.map((k) => (
            <ToggleGroupItem key={k} value={k} className="flex-1" data-testid={`pay-kind-${k}`}>
              {t(`calendar.paymentKind.${k}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <MoneyInput
        label={t('common.amount')}
        value={amount}
        onChange={setAmount}
        currencies={currencies}
        error={tried && !amountOk ? t('booking.payment.needAmount') : null}
      />
      <ManualRateFields
        needs={needs}
        currency={amount.currency}
        folioCurrency={folioCurrency}
        value={rates}
        onChange={setRates}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="pay-method">{t('calendar.payment.method')}</Label>
          <Select value={method} onValueChange={setMethodId}>
            <SelectTrigger id="pay-method" className="w-full">
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
        <div className="grid gap-1.5">
          <Label htmlFor="pay-channel">{t('booking.payment.channel')}</Label>
          <Select value={channelId} onValueChange={setChannelId}>
            <SelectTrigger id="pay-channel" className="w-full">
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
        <DateInput
          label={t('common.date')}
          value={day}
          onChange={(d) => {
            setDay(d)
            setClosed(false)
          }}
        />
        <div className="grid gap-1.5">
          <Label htmlFor={refId}>{t('booking.payment.reference')}</Label>
          <Input
            id={refId}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            autoComplete="off"
          />
        </div>
      </div>
      {closed ? <ClosedDayReason value={closedReason} onChange={setClosedReason} /> : null}
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
      {overAmount.dialog}
    </form>
  )
}
