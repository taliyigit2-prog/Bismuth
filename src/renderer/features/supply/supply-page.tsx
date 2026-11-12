// Tedarik (G-170, G-71, §6.13): products with their last and previous unit price ("zam" highlighted), last
// purchase, this month's quantity, optional stock and the supplier from the phone book; the price history per
// product; the purchases of the last two months (one expense each, voidable); the month's summary per product and
// per supplier. A purchase is entered once, as one expense with product lines (S-74, K-35). On the phone the
// screen is read-only (faz-12 madde 6): no purchase or product forms there.
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import {
  PackageIcon,
  PackagePlusIcon,
  PlusIcon,
  SearchIcon,
  ShoppingCartIcon,
  TrendingUpIcon,
  WalletIcon
} from 'lucide-react'
import { today as todayOf, type LocalDate } from '@shared/date'
import type { ProductCategoryView, ProductOverview } from '@shared/contract/procedures/supply'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { KpiCard } from '@/components/kpi-card'
import { Page } from '@/components/page'
import { QueryView } from '@/components/query-view'
import { EmptyState } from '@/components/states'
import { useFormat } from '@/hooks/use-format'
import { useIsMobile } from '@/hooks/use-mobile'
import { useApiQuery, useSettings } from '@/lib/api/hooks'
import { useCan } from '@/lib/view-as'
import { cn } from '@/lib/utils'
import { useLocalName } from '../settings/use-admin'
import { monthOfDay, totalIn } from './derive'
import { MonthSummaryView } from './month-summary'
import { PriceHistorySheet } from './price-history-sheet'
import { ProductDialog } from './product-dialog'
import { PurchaseDialog } from './purchase-dialog'
import { PurchasesList } from './purchases-list'
import { ChangeBadge } from './supply-parts'
import { useQty } from './use-qty'

const ALL = 'all'
const TABS = ['products', 'purchases', 'summary'] as const
type Tab = (typeof TABS)[number]

/** Biggest price rise first; products without a rise after them. */
const riseOf = (p: ProductOverview): number =>
  p.priceChange?.isIncrease ? (p.priceChange.basisPoints ?? 1) : 0

function useCategoryName(categories: readonly ProductCategoryView[]) {
  const nameOf = useLocalName()
  return (id: string): string => {
    const c = categories.find((x) => x.id === id)
    return c ? nameOf(c.displayName, c.name) : ''
  }
}

function ProductTable({
  rows,
  categoryName,
  onOpen
}: {
  rows: ProductOverview[]
  categoryName: (id: string) => string
  onOpen: (p: ProductOverview) => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const qty = useQty()
  return (
    <Table density="compact">
      <TableHeader>
        <TableRow>
          <TableHead>{t('supply.col.product')}</TableHead>
          <TableHead className="w-24 text-end whitespace-normal">{t('supply.col.last')}</TableHead>
          <TableHead className="w-24 text-end whitespace-normal">{t('supply.col.previous')}</TableHead>
          <TableHead className="w-28 text-end whitespace-normal">{t('supply.col.change')}</TableHead>
          <TableHead className="w-24 whitespace-normal">{t('supply.col.lastBought')}</TableHead>
          <TableHead className="w-24 text-end whitespace-normal">{t('supply.col.thisMonth')}</TableHead>
          <TableHead className="w-20 text-end whitespace-normal">{t('supply.col.stock')}</TableHead>
          <TableHead className="w-40 whitespace-normal">{t('supply.col.supplier')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((p) => (
          <TableRow
            key={p.id}
            className={cn('cursor-pointer', !p.active && 'text-muted-foreground')}
            onClick={() => onOpen(p)}
            data-testid={`product-${p.id}`}
          >
            <TableCell className="whitespace-normal">
              <button
                type="button"
                className="focus-visible:ring-ring block rounded-sm text-start font-medium outline-none focus-visible:ring-[3px]"
                onClick={(e) => {
                  e.stopPropagation()
                  onOpen(p)
                }}
              >
                {p.name}
              </button>
              <span className="text-muted-foreground block text-xs">
                {[
                  categoryName(p.categoryId),
                  t(`supply.unit.${p.unit}`),
                  p.active ? null : t('supply.inactive')
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </TableCell>
            <TableCell className="text-end font-medium tabular-nums">
              {p.lastPurchase ? (
                <bdi>{f.money(p.lastPurchase.unitPriceMinor, p.lastPurchase.currency)}</bdi>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </TableCell>
            <TableCell className="text-muted-foreground text-end tabular-nums">
              {p.priceChange ? (
                <bdi>{f.money(p.priceChange.previousUnitMinor, p.priceChange.currency)}</bdi>
              ) : (
                '—'
              )}
            </TableCell>
            <TableCell className="text-end">
              {p.lastPurchase ? (
                <ChangeBadge change={p.priceChange} />
              ) : (
                <span className="text-muted-foreground text-xs">{t('supply.notBought')}</span>
              )}
            </TableCell>
            <TableCell className="tabular-nums">
              {p.lastPurchase ? (
                f.dayMonth(p.lastPurchase.date)
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </TableCell>
            <TableCell className="text-end tabular-nums">
              {p.thisMonth.qty ? (
                qty(p.thisMonth.qty, p.unit)
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </TableCell>
            <TableCell className="text-end tabular-nums">
              {p.trackStock && p.stockQtyMilli !== null ? (
                qty(p.stockQtyMilli, p.unit)
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </TableCell>
            <TableCell className="whitespace-normal">
              {p.supplierName ? (
                <Link
                  to="/contacts"
                  search={{ q: p.supplierName }}
                  onClick={(e) => e.stopPropagation()}
                  className="text-sm underline-offset-4 hover:underline"
                >
                  {p.supplierName}
                </Link>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function ProductCards({
  rows,
  categoryName,
  onOpen
}: {
  rows: ProductOverview[]
  categoryName: (id: string) => string
  onOpen: (p: ProductOverview) => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const qty = useQty()
  return (
    <ul className="grid gap-2">
      {rows.map((p) => (
        <li key={p.id}>
          <button
            type="button"
            onClick={() => onOpen(p)}
            data-testid={`product-card-${p.id}`}
            className="bg-card focus-visible:ring-ring grid min-h-14 w-full gap-1.5 rounded-xl border p-3 text-start outline-none focus-visible:ring-[3px]"
          >
            <span className="flex items-start justify-between gap-3">
              <span className="min-w-0">
                <span className="block text-sm font-medium break-words">{p.name}</span>
                <span className="text-muted-foreground block text-xs">{categoryName(p.categoryId)}</span>
              </span>
              <span className="grid justify-items-end gap-1">
                <span className="text-sm font-semibold tabular-nums">
                  {p.lastPurchase ? (
                    <bdi>{f.money(p.lastPurchase.unitPriceMinor, p.lastPurchase.currency)}</bdi>
                  ) : (
                    '—'
                  )}
                </span>
                {p.lastPurchase ? <ChangeBadge change={p.priceChange} /> : null}
              </span>
            </span>
            <span className="text-muted-foreground text-xs">
              {[
                p.lastPurchase
                  ? t('supply.boughtOn', { date: f.dayMonth(p.lastPurchase.date) })
                  : t('supply.notBought'),
                p.thisMonth.qty ? t('supply.thisMonthQty', { qty: qty(p.thisMonth.qty, p.unit) }) : null,
                p.supplierName
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

function ProductsTab({
  rows,
  categories,
  base,
  onOpen
}: {
  rows: ProductOverview[]
  categories: ProductCategoryView[]
  base: string
  onOpen: (p: ProductOverview) => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const isMobile = useIsMobile()
  const nameOf = useLocalName()
  const categoryName = useCategoryName(categories)
  const [q, setQ] = useState('')
  const [category, setCategory] = useState(ALL)
  const needle = q.trim().toLocaleLowerCase(f.locale)
  const shown = rows
    .filter((p) => category === ALL || p.categoryId === category)
    .filter(
      (p) =>
        !needle ||
        p.name.toLocaleLowerCase(f.locale).includes(needle) ||
        (p.supplierName?.toLocaleLowerCase(f.locale).includes(needle) ?? false)
    )
    .sort((a, b) => riseOf(b) - riseOf(a) || f.compare(a.name, b.name))
  const thisMonth = rows.reduce((s, p) => s + totalIn(p.thisMonth.totals, base), 0)
  const lastMonth = rows.reduce((s, p) => s + totalIn(p.lastMonth.totals, base), 0)
  const rises = rows.filter((p) => p.priceChange?.isIncrease)
  const used = categories.filter((c) => rows.some((p) => p.categoryId === c.id))

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label={t('supply.kpi.thisMonth')}
          value={f.money(thisMonth, base)}
          hint={t('supply.kpi.thisMonthHint')}
          icon={<WalletIcon className="size-3.5" aria-hidden />}
        />
        <KpiCard
          label={t('supply.kpi.lastMonth')}
          value={f.money(lastMonth, base)}
          hint={t('supply.kpi.lastMonthHint')}
          icon={<ShoppingCartIcon className="size-3.5" aria-hidden />}
        />
        <KpiCard
          label={t('supply.kpi.rises')}
          value={f.number(rises.length)}
          hint={rises.length ? rises.map((p) => p.name).join(', ') : t('supply.kpi.noRises')}
          icon={<TrendingUpIcon className="size-3.5" aria-hidden />}
          className={cn(rises.length > 0 && 'border-destructive/40')}
        />
        <KpiCard
          label={t('supply.kpi.products')}
          value={f.number(rows.filter((p) => p.active).length)}
          hint={t('supply.kpi.stockHint', { count: rows.filter((p) => p.trackStock).length })}
          icon={<PackageIcon className="size-3.5" aria-hidden />}
        />
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="relative min-w-0 flex-1 basis-60">
          <SearchIcon
            className="text-muted-foreground pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('supply.search')}
            aria-label={t('supply.search')}
            className="ps-8"
          />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-56 max-md:w-full" aria-label={t('supply.category')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('supply.allCategories')}</SelectItem>
            {used.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {nameOf(c.displayName, c.name)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {shown.length ? (
        isMobile ? (
          <ProductCards rows={shown} categoryName={categoryName} onOpen={onOpen} />
        ) : (
          <Card className="min-w-0 gap-0 px-2 py-0" data-testid="product-table">
            <ProductTable rows={shown} categoryName={categoryName} onOpen={onOpen} />
          </Card>
        )
      ) : (
        <EmptyState
          compact
          icon={SearchIcon}
          title={t('common.noMatchTitle')}
          body={t('supply.noMatch')}
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setQ('')
                setCategory(ALL)
              }}
            >
              {t('common.clearFilter')}
            </Button>
          }
        />
      )}
      <p className="text-muted-foreground text-xs">{t('supply.footnote')}</p>
    </div>
  )
}

function SupplySkeleton() {
  const { t } = useTranslation()
  return (
    <div role="status" aria-busy className="grid gap-4">
      <span className="sr-only">{t('common.loading')}</span>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-hidden>
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-9" aria-hidden />
      <div className="grid gap-1" aria-hidden>
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-11" />
        ))}
      </div>
    </div>
  )
}

export function SupplyPage({ today = todayOf() }: { today?: LocalDate }) {
  const { t } = useTranslation()
  const can = useCan()
  const isMobile = useIsMobile()
  const settings = useSettings()
  const base = settings.data?.['hotel.baseCurrency'] ?? 'TRY'
  const month = monthOfDay(today)
  const query = useApiQuery('supply.overview', { ...month, includeInactive: true })
  const categories = useApiQuery('supply.categories', {})
  const [tab, setTab] = useState<Tab>('products')
  const [buyOpen, setBuyOpen] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  // undefined = closed, null = new product.
  const [editing, setEditing] = useState<ProductOverview | null | undefined>(undefined)
  // Phone: read only (faz-12 madde 6); the forms are desktop work.
  const canEdit = can('supplies', 'edit') && !isMobile
  const canBuy = canEdit && can('expenses', 'edit')
  const rows = useMemo(() => query.data ?? [], [query.data])
  const active = rows.filter((p) => p.active)
  const opened = rows.find((p) => p.id === openId) ?? null
  const categoryName = useCategoryName(categories.data ?? [])
  const actions =
    canEdit || canBuy ? (
      <div className="flex flex-wrap gap-2">
        {canEdit ? (
          <Button variant="outline" onClick={() => setEditing(null)} data-testid="product-add">
            <PackagePlusIcon aria-hidden />
            {t('supply.product.add')}
          </Button>
        ) : null}
        {canBuy ? (
          <Button onClick={() => setBuyOpen(true)} disabled={!active.length} data-testid="purchase-open">
            <PlusIcon aria-hidden />
            {t('supply.purchase.title')}
          </Button>
        ) : null}
      </div>
    ) : undefined
  return (
    <Page title={t('nav.supply')} description={t('supply.description')} actions={actions}>
      <QueryView
        query={query}
        loading={<SupplySkeleton />}
        isEmpty={(list) => list.length === 0}
        empty={{ icon: ShoppingCartIcon, title: t('supply.emptyTitle'), body: t('supply.emptyBody') }}
      >
        {(list) => (
          <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="gap-4">
            <TabsList className="max-md:w-full">
              {TABS.map((k) => (
                <TabsTrigger key={k} value={k} className="max-md:flex-1">
                  {t(`supply.tabs.${k}`)}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="products">
              <ProductsTab
                rows={list.filter((p) => p.active)}
                categories={categories.data ?? []}
                base={base}
                onOpen={(p) => setOpenId(p.id)}
              />
            </TabsContent>
            <TabsContent value="purchases">
              <PurchasesList today={today} products={list} canEdit={canBuy} />
            </TabsContent>
            <TabsContent value="summary">
              <MonthSummaryView today={today} base={base} />
            </TabsContent>
          </Tabs>
        )}
      </QueryView>
      <PriceHistorySheet
        product={opened}
        today={today}
        categoryName={opened ? categoryName(opened.categoryId) : ''}
        canEdit={canEdit}
        onEdit={(p) => {
          setOpenId(null)
          setEditing(p)
        }}
        onOpenChange={(o) => !o && setOpenId(null)}
      />
      {editing !== undefined ? (
        <ProductDialog
          key={editing?.id ?? 'new'}
          product={editing}
          categories={categories.data ?? []}
          onClose={() => setEditing(undefined)}
        />
      ) : null}
      {buyOpen ? (
        <PurchaseDialog
          today={today}
          products={active}
          base={base}
          onClose={() => setBuyOpen(false)}
          onNewProduct={() => setEditing(null)}
        />
      ) : null}
    </Page>
  )
}
