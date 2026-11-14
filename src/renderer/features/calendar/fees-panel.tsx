// The money tab's "Kalemler ve emanet" part (P21d, Ö-22): fee lines on the folio (late check-out, no-show, damage), the
// late check-out line that can be added by hand, and the damage deposit: held money, not income, that is given back
// at check-out or, with a reason, turned into income. Nothing is deleted: a line is voided with a reason.
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { LogOutIcon, PlusIcon } from 'lucide-react'
import type { DepositView } from '@shared/contract/fees'
import { isClock } from '@/components/time-input'
import { TimeInput } from '@/components/time-input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { MoneyInput, type MoneyValue } from '@/components/money-input'
import { ResponsiveDialog } from '@/components/responsive-dialog'
import { deferForPendingAmount } from '@/features/settings/use-admin'
import { useFormat } from '@/hooks/use-format'
import { useApiQuery, useSettings } from '@/lib/api/hooks'
import { useCan } from '@/lib/view-as'
import { localName, useBookingMutation, useBookingOptions, type BookingView } from './booking-api'

const FEE_CODES = ['late_checkout', 'no_show_fee', 'damage_fee']

function Buttons({ form, label, onCancel }: { form: string; label: string; onCancel: () => void }) {
  const { t } = useTranslation()
  return (
    <>
      <Button variant="outline" onClick={onCancel}>
        {t('common.cancel')}
      </Button>
      <Button type="submit" form={form}>
        {label}
      </Button>
    </>
  )
}

export function FeesSection({ view }: { view: BookingView }) {
  const { t } = useTranslation()
  const f = useFormat()
  const can = useCan()
  const options = useBookingOptions()
  const lines = useApiQuery('booking.folioLines', { id: view.reservation.id })
  const [lateOpen, setLateOpen] = useState(false)
  const [takeOpen, setTakeOpen] = useState(false)
  const [settle, setSettle] = useState<{ deposit: DepositView; action: 'refund' | 'convert' } | null>(null)
  const [voiding, setVoiding] = useState<string | null>(null)
  const eligible = view.stays.filter((s) => s.status === 'in_house' || s.status === 'done')
  const mayExtras = can('extras', 'edit')
  const mayDeposit = can('payments', 'edit') && !!view.payments
  const methodName = (id: string): string => {
    const m = options.data?.methods.find((x) => x.id === id)
    return m ? localName(f, m) : ''
  }
  const fees = (lines.data?.charges ?? []).filter((c) => c.code && FEE_CODES.includes(c.code))
  const deposits = lines.data?.deposits ?? []
  const closedRes = view.reservation.status === 'cancelled' || view.reservation.status === 'no_show'
  if (lines.isError) return <p className="text-destructive text-sm">{t('feesPanel.error')}</p>
  return (
    <section className="grid gap-3" aria-label={t('feesPanel.title')} data-testid="fees-section">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">{t('feesPanel.title')}</h3>
        <span className="ms-auto flex flex-wrap gap-2">
          {mayExtras && eligible.length ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setLateOpen(true)}
              data-testid="late-checkout-add"
            >
              <LogOutIcon aria-hidden />
              {t('feesPanel.addLate')}
            </Button>
          ) : null}
          {mayDeposit && !closedRes ? (
            <Button size="sm" variant="outline" onClick={() => setTakeOpen(true)} data-testid="deposit-take">
              <PlusIcon aria-hidden />
              {t('feesPanel.takeDeposit')}
            </Button>
          ) : null}
        </span>
      </div>
      {lines.isPending ? (
        <p className="text-muted-foreground text-sm">{t('common.loading')}</p>
      ) : fees.length === 0 && deposits.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('feesPanel.empty')}</p>
      ) : (
        <ul className="grid gap-1.5">
          {fees.map((c) => (
            <li
              key={c.id}
              className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-2 text-sm ${c.voided ? 'text-muted-foreground line-through' : ''}`}
              data-testid={`fee-line-${c.code}`}
            >
              <span className="w-24 shrink-0 tabular-nums">{f.date(c.date, 'short')}</span>
              <span>{c.description}</span>
              {c.voided ? <Badge variant="outline">{t('feesPanel.voided')}</Badge> : null}
              <span className="ms-auto font-medium tabular-nums">
                <bdi>{f.money(c.amountMinor, c.currency)}</bdi>
              </span>
              {mayExtras && !c.voided ? (
                <Button size="sm" variant="ghost" onClick={() => setVoiding(c.id)}>
                  {t('feesPanel.void')}
                </Button>
              ) : null}
            </li>
          ))}
          {deposits.map((d) => (
            <li
              key={d.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-2 text-sm"
              data-testid={`deposit-${d.status}`}
            >
              <span className="w-24 shrink-0 tabular-nums">{f.date(d.takenDate, 'short')}</span>
              <span>{t('feesPanel.deposit')}</span>
              <span className="text-muted-foreground">{methodName(d.methodId)}</span>
              <Badge variant={d.status === 'held' ? 'secondary' : 'outline'}>
                {t(`feesPanel.status.${d.status}`)}
              </Badge>
              <span className="ms-auto font-medium tabular-nums">
                <bdi>{f.money(d.amountMinor, d.currency)}</bdi>
              </span>
              {d.status === 'held' && mayDeposit ? (
                <span className="flex gap-1">
                  {can('payments.refund', 'edit') ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSettle({ deposit: d, action: 'refund' })}
                      data-testid="deposit-refund"
                    >
                      {t('feesPanel.refund')}
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setSettle({ deposit: d, action: 'convert' })}
                    data-testid="deposit-convert"
                  >
                    {t('feesPanel.convert')}
                  </Button>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {deposits.some((d) => d.status === 'held') ? (
        <p className="text-muted-foreground text-xs">{t('feesPanel.heldHint')}</p>
      ) : null}
      {lateOpen ? <LateDialog view={view} onClose={() => setLateOpen(false)} /> : null}
      {takeOpen ? <TakeDialog view={view} onClose={() => setTakeOpen(false)} /> : null}
      {settle ? (
        <SettleDialog
          deposit={settle.deposit}
          action={settle.action}
          onClose={() => setSettle(null)}
          label={methodName(settle.deposit.methodId)}
        />
      ) : null}
      {voiding ? <VoidDialog chargeId={voiding} onClose={() => setVoiding(null)} /> : null}
    </section>
  )
}

function nowClock(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function LateDialog({ view, onClose }: { view: BookingView; onClose: () => void }) {
  const { t } = useTranslation()
  const currency = view.folio.currency
  const eligible = view.stays.filter((s) => s.status === 'in_house' || s.status === 'done')
  const [stayId, setStayId] = useState(eligible[0]?.id ?? '')
  const [time, setTime] = useState(nowClock)
  const [fee, setFee] = useState<MoneyValue | null>(null)
  const [note, setNote] = useState('')
  const quote = useApiQuery(
    'booking.feeQuote',
    { kind: 'lateCheckout', stayId, time: isClock(time) ? time : '23:59' },
    { enabled: !!stayId }
  )
  const shown: MoneyValue = fee ?? {
    amountMinor: quote.data && quote.data.suggestedMinor > 0 ? quote.data.suggestedMinor : null,
    currency
  }
  const add = useBookingMutation('booking.addLateCheckout', {
    success: t('booking.lateCheckout.added'),
    onSuccess: onClose
  })
  const form = 'late-checkout-form'
  return (
    <ResponsiveDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('feesPanel.lateTitle')}
      description={t('feesPanel.lateHelp')}
      footer={<Buttons form={form} label={t('feesPanel.lateSave')} onCancel={onClose} />}
    >
      <form
        id={form}
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (deferForPendingAmount(e.currentTarget)) return
          if (!stayId || !isClock(time) || !shown.amountMinor || shown.amountMinor <= 0) return
          add.mutate({
            stayId,
            time,
            amountMinor: shown.amountMinor,
            ...(note.trim() ? { note: note.trim() } : {})
          })
        }}
      >
        {eligible.length > 1 ? (
          <div className="grid gap-1.5">
            <Label>{t('feesPanel.room')}</Label>
            <Select value={stayId} onValueChange={setStayId}>
              <SelectTrigger aria-label={t('feesPanel.room')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {eligible.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.roomNumber}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        <div className="grid gap-1.5">
          <Label>{t('feesPanel.lateTime')}</Label>
          <TimeInput
            value={time}
            onChange={(v) => {
              setTime(v)
              setFee(null)
            }}
            aria-label={t('feesPanel.lateTime')}
            data-testid="late-time"
          />
        </div>
        <MoneyInput
          label={t('feesPanel.amount')}
          value={shown}
          onChange={(v) => setFee({ ...v, currency })}
          currencies={[currency]}
        />
        <div className="grid gap-1.5">
          <Label htmlFor="late-note">{t('feesPanel.note')}</Label>
          <Textarea id="late-note" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
        </div>
      </form>
    </ResponsiveDialog>
  )
}

function TakeDialog({ view, onClose }: { view: BookingView; onClose: () => void }) {
  const { t } = useTranslation()
  const f = useFormat()
  const options = useBookingOptions()
  const settings = useSettings()
  const currency = view.folio.currency
  const methods = options.data?.methods ?? []
  const [methodId, setMethodId] = useState('')
  const [amount, setAmount] = useState<MoneyValue | null>(null)
  const preset = settings.data?.['fees.damageDepositMinor'] ?? 0
  const shown: MoneyValue = amount ?? { amountMinor: preset > 0 ? preset : null, currency }
  const take = useBookingMutation('booking.takeDeposit', {
    success: t('feesPanel.taken'),
    onSuccess: onClose
  })
  const form = 'deposit-form'
  const method = methodId || methods[0]?.id || ''
  return (
    <ResponsiveDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('feesPanel.takeTitle')}
      description={t('feesPanel.takeHelp')}
      footer={<Buttons form={form} label={t('feesPanel.takeSave')} onCancel={onClose} />}
    >
      <form
        id={form}
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (deferForPendingAmount(e.currentTarget)) return
          if (!method || !shown.amountMinor || shown.amountMinor <= 0) return
          take.mutate({
            reservationId: view.reservation.id,
            amountMinor: shown.amountMinor,
            methodId: method
          })
        }}
      >
        <MoneyInput
          label={t('feesPanel.amount')}
          value={shown}
          onChange={(v) => setAmount({ ...v, currency })}
          currencies={[currency]}
        />
        <div className="grid gap-1.5">
          <Label>{t('feesPanel.method')}</Label>
          <Select value={method} onValueChange={setMethodId}>
            <SelectTrigger aria-label={t('feesPanel.method')}>
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
      </form>
    </ResponsiveDialog>
  )
}

function SettleDialog({
  deposit,
  action,
  label,
  onClose
}: {
  deposit: DepositView
  action: 'refund' | 'convert'
  label: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const [reason, setReason] = useState('')
  const [tried, setTried] = useState(false)
  const settle = useBookingMutation('booking.settleDeposit', {
    success: action === 'refund' ? t('feesPanel.refunded') : t('feesPanel.converted'),
    onSuccess: onClose
  })
  const form = 'deposit-settle-form'
  const needsReason = action === 'convert'
  const bad = needsReason && reason.trim().length < 3
  const body: ReactNode = (
    <p className="text-sm">
      {action === 'refund'
        ? t('feesPanel.refundBody', { amount: f.money(deposit.amountMinor, deposit.currency), method: label })
        : t('feesPanel.convertBody', { amount: f.money(deposit.amountMinor, deposit.currency) })}
    </p>
  )
  return (
    <ResponsiveDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={action === 'refund' ? t('feesPanel.refundTitle') : t('feesPanel.convertTitle')}
      description={t('feesPanel.settleHelp')}
      footer={
        <Buttons
          form={form}
          label={action === 'refund' ? t('feesPanel.refund') : t('feesPanel.convert')}
          onCancel={onClose}
        />
      }
    >
      <form
        id={form}
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          setTried(true)
          if (bad) return
          settle.mutate({
            id: deposit.id,
            action,
            ...(reason.trim() ? { reason: reason.trim() } : {})
          })
        }}
      >
        {body}
        <div className="grid gap-1.5">
          <Label htmlFor="deposit-reason">
            {needsReason ? t('feesPanel.convertReason') : t('feesPanel.note')}
          </Label>
          <Textarea
            id="deposit-reason"
            value={reason}
            maxLength={200}
            onChange={(e) => setReason(e.target.value)}
            aria-invalid={(tried && bad) || undefined}
          />
          {tried && bad ? (
            <p role="alert" className="text-destructive text-sm">
              {t('errors.reasonRequired')}
            </p>
          ) : null}
        </div>
      </form>
    </ResponsiveDialog>
  )
}

function VoidDialog({ chargeId, onClose }: { chargeId: string; onClose: () => void }) {
  const { t } = useTranslation()
  const [reason, setReason] = useState('')
  const [tried, setTried] = useState(false)
  const voidFee = useBookingMutation('booking.voidFee', {
    success: t('feesPanel.voidedToast'),
    onSuccess: onClose
  })
  const bad = reason.trim().length < 3
  return (
    <ResponsiveDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('feesPanel.voidTitle')}
      description={t('feesPanel.voidHelp')}
      footer={<Buttons form="fee-void-form" label={t('feesPanel.void')} onCancel={onClose} />}
    >
      <form
        id="fee-void-form"
        className="grid gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          setTried(true)
          if (!bad) voidFee.mutate({ chargeId, reason: reason.trim() })
        }}
      >
        <Label htmlFor="fee-void-reason">{t('feesPanel.voidReason')}</Label>
        <Textarea
          id="fee-void-reason"
          value={reason}
          maxLength={200}
          onChange={(e) => setReason(e.target.value)}
          aria-invalid={(tried && bad) || undefined}
        />
        {tried && bad ? (
          <p role="alert" className="text-destructive text-sm">
            {t('errors.reasonRequired')}
          </p>
        ) : null}
      </form>
    </ResponsiveDialog>
  )
}
