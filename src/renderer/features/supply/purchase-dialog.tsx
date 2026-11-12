// A delivery slip (G-71, G-170, tek giriş G-60; S-74, K-35): written once, as ONE expense in the ledger whose
// product lines feed the price history and the "zam" warning. Date, supplier from the phone book, lines of
// product × quantity × unit price (the line amount is computed; a typed amount is kept as written and the unit
// price behind it is shown), the total (the slip's own total may be higher: delivery, deposit), how it was paid, the expense
// section, an optional photo of the slip.
import { useId, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { InfoIcon, PlusIcon, TrendingUpIcon, XIcon } from 'lucide-react'
import type { LocalDate } from '@shared/date'
import type { ProductOverview } from '@shared/contract/procedures/supply'
import { money, multiplyRatio, sum } from '@shared/money'
import { expenseCreateSchema, expenseItemInputSchema } from '@shared/contract/expenses'
import { fieldLimits } from '@shared/contract/limits'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { DateInput } from '@/components/date-input'
import { MoneyInput, type MoneyValue } from '@/components/money-input'
import { PhotoPicker, useUploadPhotos } from '@/components/record-photos'
import { FieldError } from '@/components/field-error'
import { ResponsiveDialog } from '@/components/responsive-dialog'
import { useFormat } from '@/hooks/use-format'
import { useApiQuery } from '@/lib/api/hooks'
import { deferForPendingAmount, useAdminMutation, useLocalName } from '../settings/use-admin'
import { lineAmount, parseQty, QTY_SCALE, unitFromAmount } from './derive'

/** Largest quantity of one line the service accepts, in units (qtyMilli / 1000). */
const QTY_MAX =
  (fieldLimits(expenseItemInputSchema.shape.qtyMilli).max ?? Number.MAX_SAFE_INTEGER) / QTY_SCALE
const DESCRIPTION_MAX = fieldLimits(expenseCreateSchema.shape.description).maxLength

interface Draft {
  key: number
  productId: string | null
  qty: string
  unit: number | null
  /** A line amount typed by hand (the unit price follows it). */
  amount: number | null
}

const NONE = '-'
const emptyDraft = (key: number): Draft => ({ key, productId: null, qty: '', unit: null, amount: null })

export function PurchaseDialog({
  today,
  products,
  base,
  onClose,
  onNewProduct
}: {
  today: LocalDate
  products: readonly ProductOverview[]
  base: string
  onClose: () => void
  onNewProduct: () => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const nameOf = useLocalName()
  const formId = useId()
  const contacts = useApiQuery('contacts.list', {})
  const sections = useApiQuery('supply.sections', {})
  const methods = useApiQuery('lists.list', { kind: 'paymentMethods' })
  const writable = (sections.data ?? []).filter((s) => s.canEdit)
  const [day, setDay] = useState<LocalDate>(today)
  const [supplier, setSupplier] = useState(NONE)
  const [description, setDescription] = useState('')
  const [section, setSection] = useState<string | null>(null)
  const [method, setMethod] = useState<string | null>(null)
  const [fromDrawer, setFromDrawer] = useState(false)
  const [drafts, setDrafts] = useState<Draft[]>([emptyDraft(1)])
  const [total, setTotal] = useState<MoneyValue>({ amountMinor: null, currency: base })
  const [files, setFiles] = useState<File[]>([])
  const [tried, setTried] = useState(false)
  const upload = useUploadPhotos()
  const save = useAdminMutation('supply.recordPurchase', {
    invalidate: ['supply.overview', 'supply.purchases', 'supply.monthSummary', 'supply.priceHistory'],
    success: t('supply.purchase.saved')
  })

  const sectionId = section || (writable.find((s) => s.code === 'general')?.id ?? writable[0]?.id ?? null)
  const methodId = method || (methods.data?.find((m) => m.code === 'cash')?.id ?? null)
  const supplierName = contacts.data?.find((c) => c.id === supplier)?.name ?? ''
  const suppliers = (contacts.data ?? [])
    .filter((c) => c.active)
    .sort(
      (a, b) =>
        Number(b.category === 'supplier') - Number(a.category === 'supplier') || f.compare(a.name, b.name)
    )

  const update = (key: number, patch: Partial<Draft>): void =>
    setDrafts((list) => list.map((d) => (d.key === key ? { ...d, ...patch } : d)))
  const parsed = drafts.map((d) => {
    const read = parseQty(d.qty, f.locale)
    const tooMuch = read !== null && read > QTY_MAX * QTY_SCALE
    const qty = tooMuch ? null : read
    const unit = d.amount !== null && qty ? unitFromAmount(d.amount, qty, base) : d.unit
    const ok = !!d.productId && qty !== null && unit !== null && !Number.isNaN(unit) && unit >= 0
    // A typed line amount is kept as written (2,75 kg = 1.000 TL); the unit price behind it is informative.
    const typed = d.amount !== null && d.amount >= 0 ? d.amount : null
    return {
      draft: d,
      qty,
      tooMuch,
      unit,
      ok,
      typed,
      amount: ok ? (typed ?? lineAmount(unit, qty, base)) : null
    }
  })
  const valid = parsed.filter((p) => p.ok)
  const linesTotal = sum(
    valid.map((p) => money(p.amount ?? 0, base)),
    base
  ).amountMinor
  const totalMinor = total.amountMinor ?? linesTotal
  const totalTooSmall = totalMinor < linesTotal
  const problems = {
    lines: !valid.length || valid.length !== parsed.length,
    total: totalTooSmall || totalMinor <= 0,
    section: !sectionId
  }

  const submit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault()
    if (deferForPendingAmount(e.currentTarget)) return
    if (problems.lines || problems.total || problems.section) {
      setTried(true)
      return
    }
    save.mutate(
      {
        date: day,
        sectionId: sectionId!,
        amountMinor: totalMinor,
        currency: base,
        description: description.trim() || supplierName || t('supply.purchase.defaultDescription'),
        paidFromDrawer: fromDrawer,
        methodId,
        vendorContactId: supplier === NONE ? null : supplier,
        items: valid.map((p) => ({
          productId: p.draft.productId!,
          qtyMilli: p.qty!,
          unitPriceMinor: p.unit!,
          ...(p.typed !== null ? { amountMinor: p.typed } : {})
        }))
      },
      {
        onSuccess: async (expense) => {
          await upload({ kind: 'expense', id: expense.id }, files)
          onClose()
        }
      }
    )
  }
  // The "zam" note: the typed unit price against the product's last purchase (when this slip is not older).
  const riseOf = (product: ProductOverview, unit: number): number | null => {
    const last = product.lastPurchase
    if (!last || last.date > day || last.unitPriceMinor <= 0 || unit <= last.unitPriceMinor) return null
    return multiplyRatio(money(unit - last.unitPriceMinor, base), 10_000, last.unitPriceMinor).amountMinor
  }

  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => (open ? null : onClose())}
      title={t('supply.purchase.title')}
      description={t('supply.purchase.description')}
      className="sm:max-w-2xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form={formId} disabled={save.isPending} data-testid="purchase-save">
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id={formId} noValidate className="grid gap-4" onSubmit={submit}>
        <p className="bg-muted/50 flex items-start gap-2 rounded-lg p-3 text-sm">
          <InfoIcon className="text-info mt-0.5 size-4 shrink-0" aria-hidden />
          {t('supply.purchase.asExpense')}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <DateInput label={t('common.date')} value={day} onChange={setDay} max={today} />
          <div className="grid gap-1.5">
            <Label htmlFor={`${formId}-supplier`}>{t('supply.col.supplier')}</Label>
            <Select value={supplier} onValueChange={setSupplier}>
              <SelectTrigger id={`${formId}-supplier`} className="w-full" data-testid="purchase-supplier">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t('supply.purchase.noSupplier')}</SelectItem>
                {suppliers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <fieldset className="grid gap-2">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <legend className="text-sm font-medium">{t('supply.purchase.lines')}</legend>
            <Button type="button" variant="link" size="sm" className="h-auto px-0" onClick={onNewProduct}>
              {t('supply.purchase.newProduct')}
            </Button>
          </div>
          <ol className="grid gap-2">
            {parsed.map(({ draft: d, qty, tooMuch, unit, ok, amount }, i) => {
              const product = products.find((p) => p.id === d.productId)
              const rise = ok && product && unit !== null ? riseOf(product, unit) : null
              return (
                <li key={d.key} className="grid gap-3 rounded-lg border p-3" data-testid="purchase-line">
                  <div className="flex items-end gap-2">
                    <div className="grid min-w-0 flex-1 gap-1.5">
                      <Label htmlFor={`${formId}-p${d.key}`}>
                        {t('supply.purchase.product', { n: i + 1 })}
                      </Label>
                      <Select
                        value={d.productId ?? undefined}
                        onValueChange={(id) => {
                          const p = products.find((x) => x.id === id)
                          update(d.key, {
                            productId: id,
                            unit: p?.lastPurchase?.unitPriceMinor ?? null,
                            amount: null
                          })
                          if (supplier === NONE && p?.supplierContactId) setSupplier(p.supplierContactId)
                        }}
                      >
                        <SelectTrigger
                          id={`${formId}-p${d.key}`}
                          className="w-full"
                          data-testid="purchase-product"
                        >
                          <SelectValue placeholder={t('supply.purchase.pickProduct')} />
                        </SelectTrigger>
                        <SelectContent>
                          {products.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {drafts.length > 1 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={t('supply.purchase.removeLine', { n: i + 1 })}
                        onClick={() => setDrafts((list) => list.filter((x) => x.key !== d.key))}
                      >
                        <XIcon />
                      </Button>
                    ) : null}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[7rem_minmax(0,1fr)_minmax(0,1fr)] sm:items-end">
                    <div className="grid gap-1.5">
                      <Label htmlFor={`${formId}-q${d.key}`}>
                        {product
                          ? t('supply.purchase.qtyIn', { unit: t(`supply.unit.${product.unit}`) })
                          : t('supply.col.qty')}
                      </Label>
                      <Input
                        id={`${formId}-q${d.key}`}
                        inputMode="decimal"
                        dir="ltr"
                        value={d.qty}
                        onChange={(e) => update(d.key, { qty: e.target.value })}
                        className="text-end tabular-nums"
                        aria-invalid={(tried && qty === null) || tooMuch || undefined}
                        data-testid="purchase-qty"
                      />
                      <FieldError message={tooMuch && t('form.tooBig', { max: f.number(QTY_MAX) })} />
                    </div>
                    <MoneyInput
                      id={`${formId}-u${d.key}`}
                      label={t('supply.history.unitPrice')}
                      value={{ amountMinor: unit, currency: base }}
                      onChange={(v) => update(d.key, { unit: v.amountMinor, amount: null })}
                      currencies={[base]}
                    />
                    <MoneyInput
                      id={`${formId}-a${d.key}`}
                      label={t('supply.purchase.lineAmount')}
                      value={{ amountMinor: amount, currency: base }}
                      onChange={(v) => update(d.key, { amount: v.amountMinor })}
                      currencies={[base]}
                    />
                  </div>
                  {rise !== null && product?.lastPurchase ? (
                    <p className="text-destructive flex items-center gap-1.5 text-xs" role="note">
                      <TrendingUpIcon className="size-3.5" aria-hidden />
                      {t('supply.purchase.riseNote', {
                        pct: f.percent(rise),
                        last: f.money(product.lastPurchase.unitPriceMinor, base)
                      })}
                    </p>
                  ) : null}
                  {tried && !ok && !tooMuch ? (
                    <p className="text-destructive text-xs">{t('supply.purchase.lineIncomplete')}</p>
                  ) : null}
                </li>
              )
            })}
          </ol>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="justify-self-start"
            onClick={() =>
              setDrafts((list) => [...list, emptyDraft(Math.max(0, ...list.map((x) => x.key)) + 1)])
            }
          >
            <PlusIcon aria-hidden />
            {t('supply.purchase.addLine')}
          </Button>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <MoneyInput
            id={`${formId}-total`}
            label={t('supply.purchase.total')}
            value={{ amountMinor: totalMinor, currency: base }}
            onChange={(v) =>
              setTotal({ ...v, amountMinor: v.amountMinor === linesTotal ? null : v.amountMinor })
            }
            currencies={[base]}
          />
          <div className="grid gap-1.5">
            <Label htmlFor={`${formId}-desc`}>{t('supply.purchase.ledgerText')}</Label>
            <Input
              id={`${formId}-desc`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={DESCRIPTION_MAX}
              placeholder={supplierName || t('supply.purchase.defaultDescription')}
              autoComplete="off"
            />
          </div>
        </div>
        <p className="text-muted-foreground -mt-2 text-xs" data-testid="purchase-total">
          {totalTooSmall ? null : t('supply.purchase.linesTotal', { amount: f.money(linesTotal, base) })}
        </p>
        {tried && problems.total ? (
          <p className="text-destructive -mt-2 text-xs" role="alert">
            {t('supply.purchase.totalTooSmall', { amount: f.money(linesTotal, base) })}
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor={`${formId}-method`}>{t('supply.purchase.method')}</Label>
            <Select value={methodId ?? undefined} onValueChange={(v) => v && setMethod(v)}>
              <SelectTrigger id={`${formId}-method`} className="w-full">
                <SelectValue placeholder={t('supply.purchase.pickMethod')} />
              </SelectTrigger>
              <SelectContent>
                {(methods.data ?? []).map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {nameOf(m.nameI18n, m.name)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {writable.length > 1 ? (
            <div className="grid gap-1.5">
              <Label htmlFor={`${formId}-section`}>{t('supply.purchase.section')}</Label>
              <Select value={sectionId ?? undefined} onValueChange={(v) => v && setSection(v)}>
                <SelectTrigger id={`${formId}-section`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {writable.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {nameOf(s.nameI18n, s.name)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <Label className="flex min-h-11 items-center justify-between gap-3 rounded-lg border px-3 font-normal sm:col-span-2">
            <span className="grid gap-0.5">
              <span className="text-sm font-medium">{t('supply.purchase.fromDrawer')}</span>
              <span className="text-muted-foreground text-xs">{t('supply.purchase.fromDrawerHint')}</span>
            </span>
            <Switch checked={fromDrawer} onCheckedChange={setFromDrawer} />
          </Label>
        </div>
        {tried && problems.section ? (
          <p className="text-destructive text-xs" role="alert">
            {t('supply.purchase.noSection')}
          </p>
        ) : null}
        <PhotoPicker label={t('supply.purchase.photo')} files={files} onChange={setFiles} />
      </form>
    </ResponsiveDialog>
  )
}
