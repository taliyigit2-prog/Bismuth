// A product card (G-170, S-63, S-73): name, category (the seeded wide list or a new one typed here), unit,
// supplier from the phone book, the optional stock counter. Prices are not typed here: they come from the
// purchases. A product is never deleted: "Listeden kaldır" hides it, its price history stays.
import { useId, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { PRODUCT_UNITS, productCategoryNameSchema, productInputSchema } from '@shared/contract/supply'
import { fieldLimits, limitsOf } from '@shared/contract/limits'
import type { ProductCategoryView, ProductOverview } from '@shared/contract/procedures/supply'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { FieldError } from '@/components/field-error'
import { ResponsiveDialog } from '@/components/responsive-dialog'
import { useFormat } from '@/hooks/use-format'
import { useApiQuery } from '@/lib/api/hooks'
import { useFormErrors } from '@/lib/form-errors'
import { useAdminMutation, useLocalName } from '../settings/use-admin'
import { parseQty, QTY_SCALE, type ProductUnit } from './derive'

const LIMIT = limitsOf(productInputSchema)
const CATEGORY_NAME_MAX = fieldLimits(productCategoryNameSchema).maxLength
const NONE = '-'
const NEW_CATEGORY = '+'

/** `product` null = new product. */
export function ProductDialog({
  product,
  categories,
  onClose
}: {
  product: ProductOverview | null
  categories: readonly ProductCategoryView[]
  onClose: () => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const nameOf = useLocalName()
  const formId = useId()
  const contacts = useApiQuery('contacts.list', {})
  const active = categories.filter((c) => c.active || c.id === product?.categoryId)
  const [name, setName] = useState(product?.name ?? '')
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? active[0]?.id ?? NEW_CATEGORY)
  const [newCategory, setNewCategory] = useState('')
  const [unit, setUnit] = useState<ProductUnit>(product?.unit ?? 'piece')
  const [supplier, setSupplier] = useState(product?.supplierContactId ?? NONE)
  const [trackStock, setTrackStock] = useState(product?.trackStock ?? false)
  const [stock, setStock] = useState(
    product?.stockQtyMilli != null
      ? f.number(product.stockQtyMilli / QTY_SCALE, 3).replace(/[,.]?0+$/, '')
      : ''
  )
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const form = useFormErrors()
  const handled = form.handled
  const invalidate = ['supply.overview', 'supply.products', 'supply.categories'] as const
  const create = useAdminMutation('supply.createProduct', {
    invalidate,
    success: t('supply.product.saved'),
    handled
  })
  const update = useAdminMutation('supply.updateProduct', {
    invalidate,
    success: t('supply.product.saved'),
    handled
  })
  const createCategory = useAdminMutation('supply.createCategory', { invalidate: ['supply.categories'] })
  const stockMilli = stock.trim() ? parseQty(stock, f.locale) : 0
  const problems = {
    name: !name.trim(),
    category: categoryId === NEW_CATEGORY && !newCategory.trim(),
    stock: trackStock && stock.trim() !== '' && stockMilli === null
  }
  const suppliers = (contacts.data ?? [])
    .filter((c) => c.active || c.id === product?.supplierContactId)
    .sort(
      (a, b) =>
        Number(b.category === 'supplier') - Number(a.category === 'supplier') || f.compare(a.name, b.name)
    )

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    if (problems.name || problems.category || problems.stock) {
      setTried(true)
      return
    }
    if (!form.validate(productInputSchema.pick({ name: true }), { name: name.trim() })) return
    setBusy(true)
    try {
      const category =
        categoryId === NEW_CATEGORY
          ? (await createCategory.mutateAsync({ name: newCategory.trim() })).id
          : categoryId
      const data = {
        name: name.trim(),
        categoryId: category,
        unit,
        supplierContactId: supplier === NONE ? null : supplier,
        trackStock,
        stockQtyMilli: trackStock ? (stockMilli ?? 0) : null
      }
      form.sending(productInputSchema, data)
      if (product) await update.mutateAsync({ id: product.id, patch: data })
      else await create.mutateAsync(data)
      onClose()
    } catch {
      // The mutation hook has shown the error.
    } finally {
      setBusy(false)
    }
  }
  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => (open ? null : onClose())}
      title={product ? t('supply.product.edit') : t('supply.product.add')}
      description={t('supply.product.description')}
      className="sm:max-w-lg"
      footer={
        <>
          {product ? (
            <Button
              variant="ghost"
              className="sm:me-auto"
              disabled={busy || update.isPending}
              onClick={() =>
                update.mutate({ id: product.id, patch: { active: !product.active } }, { onSuccess: onClose })
              }
            >
              {product.active ? t('supply.product.hide') : t('supply.product.show')}
            </Button>
          ) : null}
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form={formId} disabled={busy} data-testid="product-save">
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id={formId} noValidate className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => void submit(e)}>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor={`${formId}-name`}>{t('supply.product.name')}</Label>
          <Input
            id={`${formId}-name`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('supply.product.namePlaceholder')}
            maxLength={LIMIT.name.maxLength}
            aria-invalid={(tried && problems.name) || !!form.errors['name'] || undefined}
            autoComplete="off"
          />
          <FieldError
            message={tried && problems.name ? t('supply.product.nameRequired') : form.errors['name']}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${formId}-cat`}>{t('supply.category')}</Label>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger id={`${formId}-cat`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {active.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {nameOf(c.displayName, c.name)}
                </SelectItem>
              ))}
              <SelectItem value={NEW_CATEGORY}>{t('supply.product.newCategory')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${formId}-unit`}>{t('supply.product.unit')}</Label>
          <Select value={unit} onValueChange={(v) => setUnit(v as ProductUnit)}>
            <SelectTrigger id={`${formId}-unit`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRODUCT_UNITS.map((u) => (
                <SelectItem key={u} value={u}>
                  {t(`supply.unit.${u}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {categoryId === NEW_CATEGORY ? (
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor={`${formId}-newcat`}>{t('supply.product.newCategoryName')}</Label>
            <Input
              id={`${formId}-newcat`}
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              maxLength={CATEGORY_NAME_MAX}
              aria-invalid={(tried && problems.category) || undefined}
              autoComplete="off"
            />
            {tried && problems.category ? (
              <p className="text-destructive text-xs">{t('supply.product.categoryRequired')}</p>
            ) : null}
          </div>
        ) : null}
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor={`${formId}-supplier`}>{t('supply.col.supplier')}</Label>
          <Select value={supplier} onValueChange={setSupplier}>
            <SelectTrigger id={`${formId}-supplier`} className="w-full">
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
          <p className="text-muted-foreground text-xs">{t('supply.product.supplierHint')}</p>
        </div>
        <Label
          htmlFor={`${formId}-stock`}
          className="flex min-h-11 items-center justify-between gap-3 rounded-lg border px-3 font-normal sm:col-span-2"
        >
          <span className="grid gap-0.5">
            <span className="text-sm font-medium">{t('supply.product.trackStock')}</span>
            <span className="text-muted-foreground text-xs">{t('supply.product.trackStockHint')}</span>
          </span>
          <Switch id={`${formId}-stock`} checked={trackStock} onCheckedChange={setTrackStock} />
        </Label>
        {trackStock ? (
          <div className="grid gap-1.5">
            <Label htmlFor={`${formId}-count`}>
              {t('supply.product.stockCount', { unit: t(`supply.unit.${unit}`) })}
            </Label>
            <Input
              id={`${formId}-count`}
              inputMode="decimal"
              dir="ltr"
              value={stock}
              onChange={(e) => setStock(e.target.value)}
              className="text-end tabular-nums"
              aria-invalid={(tried && problems.stock) || undefined}
            />
            {tried && problems.stock ? (
              <p className="text-destructive text-xs">{t('supply.product.stockInvalid')}</p>
            ) : null}
          </div>
        ) : null}
      </form>
    </ResponsiveDialog>
  )
}
