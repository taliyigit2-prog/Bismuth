// Laundry forms (G-171, K-28, S-95; akislar.md 11:00 clean slip in, 15:00 dirty out):
// - the clean slip ("Temiz fişi": slip number, per item type pieces and stained pieces, the slip's unit price when
//   it prints one, a photo) and the dirty hand-over (per item type pieces), typed like the paper: one line after the
//   other, Enter moves to the next field and saves after the last one;
// - the agreed unit price from a date (a rise is a new row, the old prices stay for the old slips);
// - the laundry's invoice of the month (then "Ödendi" writes the one expense, G-71);
// - voiding a wrong slip with a reason.
import { maxLengthOf } from '@shared/contract/limits'
import { reasonSchema } from '@shared/contract/expenses'
import { useId, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { InfoIcon } from 'lucide-react'
import type { LocalDate } from '@shared/date'
import { parseMoney } from '@shared/money'
import type { LaundryDeliveryView } from '@shared/contract/procedures/supply'
import { laundryDeliveryInputSchema, laundryDeliveryItemSchema } from '@shared/contract/supply'
import { fieldLimits } from '@shared/contract/limits'
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
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { DateInput } from '@/components/date-input'
import { MoneyInput, type MoneyValue } from '@/components/money-input'
import { PhotoPicker, useUploadPhotos } from '@/components/record-photos'
import { ResponsiveDialog } from '@/components/responsive-dialog'
import { useFormat } from '@/hooks/use-format'
import { numberInLimits, useRangeText } from '@/lib/form-errors'
import { deferForPendingAmount, useAdminMutation } from '../settings/use-admin'
import type { ItemType, TypeRow } from './derive'

type Counts = Record<string, { qty: string; stained: string; price: string }>

const EMPTY = { qty: '', stained: '', price: '' }
const LAUNDRY_QUERIES = [
  'laundry.deliveries',
  'laundry.outstanding',
  'laundry.month',
  'laundry.trend'
] as const

/** Pieces of one line the service accepts (0–100.000), and the slip's text limits (contract schema). */
const PIECES = fieldLimits(laundryDeliveryItemSchema.shape.qty)
const NOTE_MAX = fieldLimits(laundryDeliveryInputSchema.shape.note).maxLength
const SLIP_MAX = fieldLimits(laundryDeliveryInputSchema.shape.slipNo).maxLength

/** Empty = 0; null = not a whole number within PIECES. */
const toInt = (text: string): number | null => {
  if (!text.trim()) return 0
  return numberInLimits(text, PIECES) ? Number(text.trim()) : null
}

/** Enter in a count field jumps to the next one (the slip is typed top to bottom); after the last it saves. */
function nextOnEnter(e: KeyboardEvent<HTMLFormElement>): void {
  if (e.key !== 'Enter' || !(e.target instanceof HTMLInputElement) || !e.target.dataset['entry']) return
  const fields = [...e.currentTarget.querySelectorAll<HTMLInputElement>('input[data-entry]')]
  const next = fields[fields.indexOf(e.target) + 1]
  e.preventDefault()
  if (!next) {
    e.currentTarget.requestSubmit()
    return
  }
  next.focus()
  next.select()
}

export function DeliveryDialog({
  direction,
  contactId,
  types,
  rows,
  today,
  base,
  onClose
}: {
  direction: 'in' | 'out'
  contactId: string
  types: readonly ItemType[]
  rows: readonly TypeRow[]
  today: LocalDate
  base: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const formId = useId()
  const [day, setDay] = useState<LocalDate>(today)
  const [slipNo, setSlipNo] = useState('')
  const [note, setNote] = useState('')
  const [counts, setCounts] = useState<Counts>({})
  const [slipPrices, setSlipPrices] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [tried, setTried] = useState(false)
  const upload = useUploadPhotos()
  const isIn = direction === 'in'
  const rangeText = useRangeText()
  const save = useAdminMutation('laundry.recordDelivery', {
    invalidate: LAUNDRY_QUERIES,
    success: isIn ? t('laundry.in.saved') : t('laundry.out.saved')
  })
  const parsed = types.map((item) => {
    const c = counts[item.id] ?? EMPTY
    const qty = toInt(c.qty)
    const stained = isIn ? toInt(c.stained) : 0
    let price: number | null = null
    let priceBad = false
    if (isIn && slipPrices && c.price.trim()) {
      try {
        price = parseMoney(c.price.trim().replace(/\s/g, ''), base, f.locale === 'en' ? '.' : ',').amountMinor
      } catch {
        priceBad = true
      }
    }
    const problem: 'number' | 'stained' | 'price' | null =
      qty === null || stained === null ? 'number' : stained > qty ? 'stained' : priceBad ? 'price' : null
    return { item, c, qty: qty ?? 0, stained: stained ?? 0, price, problem }
  })
  const pieces = parsed.reduce((s, p) => s + p.qty, 0)
  const stainedTotal = parsed.reduce((s, p) => s + p.stained, 0)
  const set = (id: string, patch: Partial<typeof EMPTY>): void =>
    setCounts((all) => ({ ...all, [id]: { ...(all[id] ?? EMPTY), ...patch } }))

  const submit = (e: FormEvent): void => {
    e.preventDefault()
    if (pieces === 0 || parsed.some((p) => p.problem)) {
      setTried(true)
      return
    }
    save.mutate(
      {
        date: day,
        direction,
        contactId,
        slipNo: isIn && slipNo.trim() ? slipNo.trim() : null,
        note: note.trim() || null,
        items: parsed
          .filter((p) => p.qty > 0)
          .map((p) => ({
            itemTypeId: p.item.id,
            qty: p.qty,
            stainedQty: p.stained,
            slipUnitPriceMinor: p.price
          }))
      },
      {
        onSuccess: async (delivery) => {
          await upload({ kind: 'laundry_delivery', id: delivery.id }, files)
          onClose()
        }
      }
    )
  }
  const cols = isIn
    ? slipPrices
      ? 'grid-cols-[1fr_4.5rem_4.5rem_6rem]'
      : 'grid-cols-[1fr_5rem_5rem]'
    : 'grid-cols-[1fr_5rem]'

  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => (open ? null : onClose())}
      title={isIn ? t('laundry.in.title') : t('laundry.out.title')}
      description={isIn ? t('laundry.in.description') : t('laundry.out.description')}
      className="sm:max-w-xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form={formId} disabled={save.isPending} data-testid="delivery-save">
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id={formId} noValidate className="grid gap-4" onSubmit={submit} onKeyDown={nextOnEnter}>
        <div className="grid gap-4 sm:grid-cols-2">
          <DateInput label={t('common.date')} value={day} onChange={setDay} max={today} />
          {isIn ? (
            <div className="grid gap-1.5">
              <Label htmlFor={`${formId}-slip`}>{t('laundry.in.slipNo')}</Label>
              <Input
                id={`${formId}-slip`}
                dir="ltr"
                autoComplete="off"
                className="tabular-nums"
                value={slipNo}
                maxLength={SLIP_MAX}
                onChange={(e) => setSlipNo(e.target.value)}
                data-entry="slip"
                data-testid="delivery-slip"
                autoFocus
              />
            </div>
          ) : null}
        </div>

        <fieldset className="grid gap-1">
          <legend className="mb-1 text-sm font-medium">{t('laundry.itemsLegend')}</legend>
          <p className="text-muted-foreground mb-1 text-xs">{t('laundry.entryHint')}</p>
          {isIn ? (
            <Label className="mb-1 flex min-h-11 w-fit items-center gap-3 font-normal">
              <Switch checked={slipPrices} onCheckedChange={setSlipPrices} />
              {t('laundry.in.slipPrices')}
            </Label>
          ) : null}
          <div
            className={`text-muted-foreground grid ${cols} items-end gap-x-2 px-1 pb-1 text-xs`}
            aria-hidden
          >
            <span>{t('laundry.col.item')}</span>
            <span className="text-end">{t('laundry.col.pieces')}</span>
            {isIn ? <span className="text-end">{t('laundry.col.stained')}</span> : null}
            {isIn && slipPrices ? <span className="text-end">{t('laundry.col.slipPrice')}</span> : null}
          </div>
          <ul className="grid gap-1">
            {parsed.map(({ item, c, problem }, i) => {
              const row = rows.find((r) => r.item.id === item.id)
              const waiting = (row?.inTransit ?? 0) + (row?.missing ?? 0)
              return (
                <li
                  key={item.id}
                  className={`odd:bg-muted/40 grid ${cols} items-center gap-x-2 rounded-md px-1 py-0.5`}
                >
                  <span className="min-w-0 text-sm">
                    <span className="block break-words">{item.name}</span>
                    {isIn && waiting > 0 ? (
                      <span className="text-muted-foreground block text-xs">
                        {t('laundry.in.waiting', { count: waiting })}
                      </span>
                    ) : null}
                    {tried && problem ? (
                      <span className="text-destructive block text-xs">
                        {problem === 'number' ? rangeText(PIECES) : t(`laundry.problem.${problem}`)}
                      </span>
                    ) : null}
                  </span>
                  <Input
                    inputMode="numeric"
                    dir="ltr"
                    aria-label={t('laundry.piecesOf', { name: item.name })}
                    value={c.qty}
                    onChange={(e) => set(item.id, { qty: e.target.value })}
                    className="text-end tabular-nums"
                    aria-invalid={(tried && !!problem) || undefined}
                    data-entry="qty"
                    data-testid={`qty-${item.id}`}
                    autoFocus={!isIn && i === 0}
                  />
                  {isIn ? (
                    <Input
                      inputMode="numeric"
                      dir="ltr"
                      aria-label={t('laundry.stainedOf', { name: item.name })}
                      value={c.stained}
                      onChange={(e) => set(item.id, { stained: e.target.value })}
                      className="text-end tabular-nums"
                      aria-invalid={(tried && problem === 'stained') || undefined}
                      data-entry="stained"
                      data-testid={`stained-${item.id}`}
                    />
                  ) : null}
                  {isIn && slipPrices ? (
                    <Input
                      inputMode="decimal"
                      dir="ltr"
                      aria-label={t('laundry.slipPriceOf', { name: item.name })}
                      value={c.price}
                      onChange={(e) => set(item.id, { price: e.target.value })}
                      className="text-end tabular-nums"
                      aria-invalid={(tried && problem === 'price') || undefined}
                      data-entry="price"
                    />
                  ) : null}
                </li>
              )
            })}
          </ul>
        </fieldset>

        <p
          className="bg-muted/50 flex flex-wrap items-center justify-between gap-2 rounded-lg p-3 text-sm"
          aria-live="polite"
          data-testid="delivery-total"
        >
          <span>{t('laundry.totalPieces', { count: pieces })}</span>
          {isIn ? (
            <span className="text-muted-foreground">
              {t('laundry.totalStained', { count: stainedTotal })}
            </span>
          ) : null}
        </p>
        {tried && pieces === 0 && !parsed.some((p) => p.problem) ? (
          <p className="text-destructive text-xs">{t('laundry.problem.empty')}</p>
        ) : null}

        {isIn ? <PhotoPicker label={t('laundry.in.photo')} files={files} onChange={setFiles} /> : null}
        <div className="grid gap-1.5">
          <Label htmlFor={`${formId}-note`}>{t('common.note')}</Label>
          <Textarea
            id={`${formId}-note`}
            rows={2}
            value={note}
            maxLength={NOTE_MAX}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </form>
    </ResponsiveDialog>
  )
}

export function PriceDialog({
  contactId,
  types,
  today,
  base,
  initialType,
  onClose
}: {
  contactId: string
  types: readonly ItemType[]
  today: LocalDate
  base: string
  initialType: string | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  const formId = useId()
  const [itemTypeId, setItemTypeId] = useState(initialType ?? types[0]?.id ?? '')
  const [validFrom, setValidFrom] = useState<LocalDate>(today)
  const [price, setPrice] = useState<MoneyValue>({ amountMinor: null, currency: base })
  const [tried, setTried] = useState(false)
  const save = useAdminMutation('laundry.setPrice', {
    invalidate: ['laundry.prices', ...LAUNDRY_QUERIES],
    success: t('laundry.price.saved')
  })
  const bad = price.amountMinor === null || Number.isNaN(price.amountMinor) || price.amountMinor < 0
  const submit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault()
    if (deferForPendingAmount(e.currentTarget)) return
    if (bad || !itemTypeId) {
      setTried(true)
      return
    }
    save.mutate(
      { contactId, itemTypeId, validFrom, unitPriceMinor: price.amountMinor! },
      { onSuccess: onClose }
    )
  }
  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => (open ? null : onClose())}
      title={t('laundry.price.title')}
      description={t('laundry.price.description')}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form={formId} disabled={save.isPending} data-testid="price-save">
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id={formId} noValidate className="grid gap-4" onSubmit={submit}>
        <div className="grid gap-1.5">
          <Label htmlFor={`${formId}-type`}>{t('laundry.col.item')}</Label>
          <Select value={itemTypeId} onValueChange={setItemTypeId}>
            <SelectTrigger id={`${formId}-type`} className="w-full" data-testid="price-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {types.map((ty) => (
                <SelectItem key={ty.id} value={ty.id}>
                  {ty.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DateInput label={t('laundry.price.validFrom')} value={validFrom} onChange={setValidFrom} />
        <MoneyInput
          id={`${formId}-price`}
          label={t('laundry.price.unit')}
          value={price}
          onChange={setPrice}
          currencies={[base]}
        />
        {tried && bad ? <p className="text-destructive text-xs">{t('laundry.price.required')}</p> : null}
        <p className="bg-muted/50 flex items-start gap-2 rounded-lg p-3 text-sm">
          <InfoIcon className="text-info mt-0.5 size-4 shrink-0" aria-hidden />
          {t('laundry.price.history')}
        </p>
      </form>
    </ResponsiveDialog>
  )
}

export function InvoiceDialog({
  contactId,
  year,
  month,
  monthLabel,
  computedMinor,
  base,
  paid,
  initialMinor,
  onClose
}: {
  contactId: string
  year: number
  month: number
  monthLabel: string
  computedMinor: number | null
  base: string
  /** The month was already marked paid: correcting the invoice keeps it paid (the expense is replaced). */
  paid: boolean
  initialMinor: number | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const formId = useId()
  const [amount, setAmount] = useState<MoneyValue>({ amountMinor: initialMinor, currency: base })
  const [note, setNote] = useState('')
  const save = useAdminMutation('laundry.settle', {
    invalidate: [...LAUNDRY_QUERIES, 'supply.monthSummary'],
    success: t('laundry.invoice.saved')
  })
  const bad = amount.amountMinor === null || Number.isNaN(amount.amountMinor) || amount.amountMinor < 0
  const submit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault()
    if (deferForPendingAmount(e.currentTarget)) return
    if (bad) return
    save.mutate(
      { contactId, year, month, invoicedTotalMinor: amount.amountMinor!, note: note.trim() || null, paid },
      { onSuccess: onClose }
    )
  }
  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => (open ? null : onClose())}
      title={t('laundry.invoice.title')}
      description={monthLabel}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form={formId} disabled={bad || save.isPending} data-testid="invoice-save">
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id={formId} className="grid gap-4" onSubmit={submit}>
        <MoneyInput
          id={`${formId}-amount`}
          label={t('laundry.invoice.amount')}
          value={amount}
          onChange={setAmount}
          currencies={[base]}
        />
        {computedMinor !== null ? (
          <p className="text-muted-foreground text-sm">
            <Trans
              i18nKey="laundry.invoice.computed"
              values={{ amount: f.money(computedMinor, base) }}
              components={{ m: <bdi className="tabular-nums" /> }}
            />
          </p>
        ) : null}
        <div className="grid gap-1.5">
          <Label htmlFor={`${formId}-note`}>{t('common.note')}</Label>
          <Textarea
            id={`${formId}-note`}
            rows={2}
            value={note}
            maxLength={NOTE_MAX}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <p className="bg-muted/50 flex items-start gap-2 rounded-lg p-3 text-sm">
          <InfoIcon className="text-info mt-0.5 size-4 shrink-0" aria-hidden />
          {paid ? t('laundry.invoice.paidAgain') : t('laundry.invoice.notYetPaid')}
        </p>
      </form>
    </ResponsiveDialog>
  )
}

/** "Ödendi": the month's invoice becomes one expense in the ledger (G-71). */
export function PaidDialog({
  contactId,
  year,
  month,
  monthLabel,
  invoicedMinor,
  base,
  onClose
}: {
  contactId: string
  year: number
  month: number
  monthLabel: string
  invoicedMinor: number
  base: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const save = useAdminMutation('laundry.settle', {
    invalidate: [...LAUNDRY_QUERIES, 'supply.monthSummary'],
    success: t('laundry.paid.saved')
  })
  return (
    <AlertDialog open onOpenChange={(o) => (o ? null : onClose())}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('laundry.paid.title')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('laundry.paid.body', { month: monthLabel, amount: f.money(invoicedMinor, base) })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            disabled={save.isPending}
            data-testid="paid-confirm"
            onClick={(e) => {
              e.preventDefault()
              save.mutate(
                { contactId, year, month, invoicedTotalMinor: invoicedMinor, paid: true },
                { onSuccess: onClose }
              )
            }}
          >
            {t('laundry.paid.confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function VoidDeliveryDialog({
  delivery,
  onClose
}: {
  delivery: LaundryDeliveryView
  onClose: () => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const [reason, setReason] = useState('')
  const save = useAdminMutation('laundry.voidDelivery', {
    invalidate: LAUNDRY_QUERIES,
    success: t('laundry.void.saved')
  })
  return (
    <AlertDialog open onOpenChange={(o) => (o ? null : onClose())}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('laundry.void.title')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('laundry.void.body', { date: f.date(delivery.date as LocalDate) })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="laundry-void-reason">{t('laundry.void.reason')}</Label>
          <Textarea
            id="laundry-void-reason"
            rows={2}
            value={reason}
            maxLength={maxLengthOf(reasonSchema)}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            disabled={!reason.trim() || save.isPending}
            onClick={(e) => {
              e.preventDefault()
              save.mutate({ id: delivery.id, reason: reason.trim() }, { onSuccess: onClose })
            }}
          >
            {t('laundry.void.confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
