// New or changed expense (G-66, G-67, G-71, K-35, S-33): amount + currency, a free description completed from the
// hotel's earlier ones (no fixed category list), the section (the owner's hidden one only for roles that see it),
// "paid from the drawer" (the Excel expense "x"; never for the owner's hidden section, K-42) or how it was paid, and
// optional product lines — then it is also a supply purchase (the Tedarik screen reads the same record; nothing is
// written twice). A typed rate is asked only when no rate is known for the currency (K-43).
import { useId, useState, type FormEvent } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { PlusIcon, Trash2Icon } from 'lucide-react'
import { money, multiplyRatio, sum } from '@shared/money'
import type { LocalDate } from '@shared/date'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { DateInput } from '@/components/date-input'
import { isAmount, MoneyInput, moneyToText, type MoneyValue, readMoneyText } from '@/components/money-input'
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
import { useApiQuery } from '@/lib/api/hooks'
import { useCan } from '@/lib/view-as'
import { deferForPendingAmount } from '@/features/settings/use-admin'
import {
  localName,
  qtyText,
  qtyToMilli,
  useLedgerMutation,
  type ExpenseRow,
  type LedgerOptions
} from './ledger-api'
import { useDebounced } from './use-debounced'

interface ItemDraft {
  key: number
  productId: string
  qty: string
  unit: string
}

export function ExpenseDialog({
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
  closed: boolean
  options: LedgerOptions
  editing?: ExpenseRow | null
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const mayWriteClosed = useMayWriteClosedDay()
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? t('ledger.exp.editTitle') : t('ledger.addExpense.title')}
      description={t('ledger.addExpense.description', { date: f.date(editing?.date ?? day, 'long') })}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            form="ledger-expense"
            data-testid="ledger-expense-save"
            disabled={closed && !mayWriteClosed}
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      {open ? (
        <ExpenseForm
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

function ExpenseForm({
  day,
  closed,
  options,
  editing,
  onDone
}: {
  day: LocalDate
  closed: boolean
  options: LedgerOptions
  editing: ExpenseRow | null
  onDone: () => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const can = useCan()
  const listId = useId()
  const writable = options.sections.filter((s) => s.canEdit)
  const [amount, setAmount] = useState<MoneyValue>({
    amountMinor: editing?.amountMinor ?? null,
    currency: editing?.currency ?? options.baseCurrency
  })
  const [description, setDescription] = useState(editing?.description ?? '')
  const [sectionId, setSectionId] = useState(editing?.sectionId ?? writable[0]?.id ?? '')
  const [drawerChoice, setFromDrawer] = useState(editing?.paidFromDrawer ?? true)
  // K-42 (1): the owner's hidden section is never paid from the drawer.
  const drawerAllowed = options.sections.find((s) => s.id === sectionId)?.drawerAllowed ?? true
  const fromDrawer = drawerAllowed && drawerChoice
  const otherMethods = options.methods.filter((m) => !m.isCash)
  const [methodId, setMethodId] = useState(
    editing && !editing.paidFromDrawer ? (editing.methodId ?? '') : (otherMethods[0]?.id ?? '')
  )
  const [date, setDate] = useState<LocalDate>((editing?.date as LocalDate | undefined) ?? day)
  const [items, setItems] = useState<ItemDraft[]>(
    () =>
      editing?.items.map((it, i) => ({
        key: i + 1,
        productId: it.productId,
        qty: qtyText(it.qtyMilli, f),
        unit: moneyToText(it.unitPriceMinor, editing.currency, f.locale)
      })) ?? []
  )
  const [rates, setRates] = useState<RateTexts>(EMPTY_RATES)
  const needs = useRateNeeds(amount.currency, null)
  const mayWriteClosed = useMayWriteClosedDay()
  // The form's own day may differ from the screen's (a row moved into a closed day): the service answers it.
  const [closedHit, setClosedHit] = useState(false)
  const showClosed = closed || closedHit
  const [closedReason, setClosedReason] = useState('')
  const [tried, setTried] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const typed = useDebounced(description.trim().slice(0, 100), 200)
  const suggestions = useApiQuery(
    'ledger.suggestDescriptions',
    { prefix: typed, limit: 10 },
    { staleTime: 30_000 }
  )
  const seesProducts = can('supplies', 'view')
  const products = useApiQuery('supply.products', {}, { enabled: seesProducts, staleTime: 60_000 })
  const done = {
    success: t('ledger.exp.saved'),
    onSuccess: onDone,
    onError: (e: { messageKey: string }) => {
      if (e.messageKey === 'errors.dayClosed') {
        setClosedHit(true)
        setError(t(mayWriteClosed ? 'ledger.closed.reasonNeeded' : 'ledger.closed.lockedHint'))
        return true
      }
      return false
    }
  }
  const add = useLedgerMutation('ledger.addExpense', done)
  const update = useLedgerMutation('ledger.updateExpense', done)
  const pending = add.isPending || update.isPending

  // The same reading as the amount field (QA2a): letters, a minus sign or more than the limit is not a price.
  const unitMinor = (it: ItemDraft): number | null => readMoneyText(it.unit, amount.currency, f.locale).minor
  const lineMinor = (it: ItemDraft): number => {
    const u = unitMinor(it)
    const q = qtyToMilli(it.qty)
    return u === null || q === null ? 0 : multiplyRatio(money(u, amount.currency), q, 1000).amountMinor
  }
  const itemsTotal = sum(
    items.map((it) => money(lineMinor(it), amount.currency)),
    amount.currency
  ).amountMinor
  const amountOk = isAmount(amount) && amount.amountMinor > 0
  const itemsOk = !amountOk || itemsTotal <= (amount.amountMinor ?? 0)
  const itemsValid = items.every(
    (it) => it.productId && qtyToMilli(it.qty) !== null && unitMinor(it) !== null
  )

  const submit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault()
    if (pending || deferForPendingAmount(e.currentTarget)) return
    setTried(true)
    if (!amountOk) return setError(null)
    if (!description.trim()) return setError(t('ledger.addExpense.whatRequired'))
    if (!sectionId) return setError(t('ledger.exp.noSection'))
    if (!itemsValid) return setError(t('ledger.exp.itemsInvalid'))
    if (!itemsOk) return setError(t('errors.expenseItemsExceedAmount'))
    const typed = typedRates(needs, rates)
    if (typed === 'bad') return setError(t('ledger.pay.badRate'))
    if (showClosed && !mayWriteClosed) return setError(t('ledger.closed.lockedHint'))
    if (showClosed && closedReason.trim().length < 3) return setError(t('ledger.closed.reasonNeeded'))
    setError(null)
    const fields = {
      sectionId,
      amountMinor: amount.amountMinor as number,
      currency: amount.currency,
      description: description.trim(),
      paidFromDrawer: fromDrawer,
      methodId: fromDrawer ? null : methodId || null,
      items: items.map((it) => ({
        productId: it.productId,
        qtyMilli: qtyToMilli(it.qty) as number,
        unitPriceMinor: unitMinor(it) as number
      })),
      ...(typed.manualRateMicro ? { manualRateMicro: typed.manualRateMicro } : {}),
      ...(showClosed ? { reason: closedReason.trim() } : {})
    }
    if (editing) update.mutate({ id: editing.id, patch: { ...fields, date } })
    else add.mutate({ ...fields, date })
  }
  const setItem = (key: number, patch: Partial<ItemDraft>): void =>
    setItems(items.map((it) => (it.key === key ? { ...it, ...patch } : it)))

  return (
    <form id="ledger-expense" className="grid gap-4" onSubmit={submit} noValidate>
      <MoneyInput
        label={t('common.amount')}
        value={amount}
        onChange={setAmount}
        currencies={options.currencies}
        error={tried && !amountOk ? t('ledger.addPayment.amountRequired') : null}
      />
      <div className="grid gap-1.5">
        <Label htmlFor="ledger-exp-desc">{t('ledger.addExpense.what')}</Label>
        <Input
          id="ledger-exp-desc"
          list={listId}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('ledger.addExpense.whatPlaceholder')}
          aria-invalid={(tried && !description.trim()) || undefined}
          autoComplete="off"
          maxLength={200}
          data-testid="expense-description"
        />
        <datalist id={listId} data-testid="expense-suggestions">
          {(suggestions.data ?? []).map((s) => (
            <option key={s.key} value={s.description} />
          ))}
        </datalist>
        <p className="text-muted-foreground text-xs">{t('ledger.addExpense.whatHint')}</p>
      </div>
      {writable.length > 1 ? (
        <div className="grid gap-1.5">
          <Label htmlFor="ledger-exp-section">{t('ledger.col.section')}</Label>
          <Select value={sectionId} onValueChange={setSectionId}>
            <SelectTrigger id="ledger-exp-section" className="w-full" data-testid="expense-section">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {writable.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {localName(f, s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      {drawerAllowed ? (
        <Label className="flex min-h-11 items-center justify-between gap-3 rounded-lg border px-3 py-2 font-normal">
          <span className="grid gap-0.5">
            <span className="font-medium">{t('ledger.expenses.fromDrawer')}</span>
            <span className="text-muted-foreground text-xs">{t('ledger.addExpense.fromDrawerHint')}</span>
          </span>
          <Switch
            checked={fromDrawer}
            onCheckedChange={setFromDrawer}
            data-testid="expense-drawer"
            className="relative max-md:after:absolute max-md:after:-inset-x-2 max-md:after:-inset-y-[14px]"
          />
        </Label>
      ) : (
        <p className="text-muted-foreground text-xs" data-testid="expense-not-from-drawer">
          {t('ledger.exp.ownerNotFromDrawer')}
        </p>
      )}
      {!fromDrawer && otherMethods.length ? (
        <div className="grid gap-1.5">
          <Label htmlFor="ledger-exp-method">{t('calendar.payment.method')}</Label>
          <Select value={methodId} onValueChange={setMethodId}>
            <SelectTrigger id="ledger-exp-method" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {otherMethods.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {localName(f, m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      <ManualRateFields needs={needs} currency={amount.currency} value={rates} onChange={setRates} />
      {needs.pay && !rates.pay.trim() ? (
        // K-43: an expense may be saved without a rate (a payment may not); it then counts as "kur yok".
        <p
          className="border-warning bg-warning/15 -mt-2 rounded-md border px-3 py-2 text-xs"
          data-testid="expense-no-rate"
        >
          {t('ledger.exp.noRateWarning')}
        </p>
      ) : null}
      {editing ? <DateInput label={t('common.date')} value={date} onChange={setDate} /> : null}

      {seesProducts ? (
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">{t('ledger.addExpense.itemsTitle')}</legend>
          <p className="text-muted-foreground -mt-1 text-xs">{t('ledger.addExpense.itemsHint')}</p>
          {items.map((it, i) => (
            <div
              key={it.key}
              className="grid grid-cols-[minmax(0,1fr)_5rem_6.5rem_auto] items-end gap-2 max-sm:grid-cols-[1fr_1fr_auto]"
              data-testid="expense-item"
            >
              <div className="grid gap-1 max-sm:col-span-3">
                <Label htmlFor={`item-${it.key}-p`} className="text-xs">
                  {t('ledger.addExpense.product')}
                </Label>
                <Select value={it.productId} onValueChange={(v) => setItem(it.key, { productId: v })}>
                  <SelectTrigger id={`item-${it.key}-p`} className="w-full">
                    <SelectValue placeholder={t('ledger.exp.pickProduct')} />
                  </SelectTrigger>
                  <SelectContent>
                    {(products.data ?? []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} · {t(`supply.unit.${p.unit}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1">
                <Label htmlFor={`item-${it.key}-q`} className="text-xs">
                  {t('ledger.addExpense.qty')}
                </Label>
                <Input
                  id={`item-${it.key}-q`}
                  dir="ltr"
                  inputMode="decimal"
                  value={it.qty}
                  onChange={(e) => setItem(it.key, { qty: e.target.value })}
                  className="text-end tabular-nums"
                  aria-invalid={(tried && qtyToMilli(it.qty) === null) || undefined}
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor={`item-${it.key}-u`} className="text-xs">
                  {t('ledger.addExpense.unitPrice')}
                </Label>
                <Input
                  id={`item-${it.key}-u`}
                  dir="ltr"
                  inputMode="decimal"
                  value={it.unit}
                  onChange={(e) => setItem(it.key, { unit: e.target.value })}
                  className="text-end tabular-nums"
                  aria-invalid={(tried && unitMinor(it) === null) || undefined}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="max-md:size-11"
                aria-label={t('ledger.addExpense.removeItem', { n: i + 1 })}
                onClick={() => setItems(items.filter((x) => x.key !== it.key))}
              >
                <Trash2Icon />
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!products.data?.length}
              onClick={() =>
                setItems([...items, { key: (items.at(-1)?.key ?? 0) + 1, productId: '', qty: '1', unit: '' }])
              }
            >
              <PlusIcon aria-hidden />
              {t('ledger.addExpense.addItem')}
            </Button>
            {products.data && !products.data.length ? (
              <p className="text-muted-foreground text-xs">{t('ledger.exp.noProducts')}</p>
            ) : null}
            {items.length ? (
              <p className={itemsOk ? 'text-muted-foreground text-xs' : 'text-destructive text-xs'}>
                {itemsOk ? (
                  <Trans
                    i18nKey="ledger.addExpense.itemsTotal"
                    values={{ amount: f.money(itemsTotal, amount.currency) }}
                    components={{ m: <bdi className="tabular-nums" /> }}
                  />
                ) : (
                  t('errors.expenseItemsExceedAmount')
                )}
              </p>
            ) : null}
          </div>
        </fieldset>
      ) : null}
      {showClosed ? <ClosedDayReason value={closedReason} onChange={setClosedReason} /> : null}
      {error ? (
        <p role="alert" className="text-destructive text-sm" data-testid="ledger-expense-error">
          {error}
        </p>
      ) : null}
    </form>
  )
}
