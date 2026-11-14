// One product's price history (G-170): the unit price of each purchase over the last 12 months as a step chart
// (with a table view, ui.md), the "zam" against the previous purchase in % and money, this and last month's
// quantity and amount, the supplier. Every point is a product line of an expense (K-35).
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import { ChartLineIcon, ContactRoundIcon, PencilIcon, TableIcon } from 'lucide-react'
import { addDays, type LocalDate } from '@shared/date'
import type { ProductOverview } from '@shared/contract/procedures/supply'
import { Button } from '@/components/ui/button'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useFormat } from '@/hooks/use-format'
import { useIsMobile } from '@/hooks/use-mobile'
import { useApiQuery } from '@/lib/api/hooks'
import { cn } from '@/lib/utils'
import { totalIn } from './derive'
import { ChangeBadge } from './supply-parts'
import { useQty } from './use-qty'

const VIEWS = ['chart', 'table'] as const
type View = (typeof VIEWS)[number]
const MONTHS = ['thisMonth', 'lastMonth'] as const
const PRICE_KEY = 'price'
const DATE_KEY = 'label'
/** The chart's window (faz-12: "birim fiyat çizgisi, 12 ay"). */
const WINDOW_DAYS = 365

export function PriceHistorySheet({
  product,
  today,
  categoryName,
  canEdit,
  onEdit,
  onOpenChange
}: {
  product: ProductOverview | null
  today: LocalDate
  categoryName: string
  canEdit: boolean
  onEdit: (p: ProductOverview) => void
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const qty = useQty()
  const isMobile = useIsMobile()
  const [view, setView] = useState<View>('chart')
  const history = useApiQuery(
    'supply.priceHistory',
    { productId: product?.id ?? '', since: addDays(today, -WINDOW_DAYS) },
    { enabled: !!product }
  )
  const lines = history.data ?? []
  const currency = product?.lastPurchase?.currency ?? lines.at(-1)?.currency ?? 'TRY'
  const config = {
    [PRICE_KEY]: { label: t('supply.history.unitPrice'), color: 'var(--chart-1)' }
  } satisfies ChartConfig
  const data = lines.map((l) => ({ [DATE_KEY]: f.dayMonth(l.date), [PRICE_KEY]: l.unitPriceMinor }))
  const p = product
  return (
    <Sheet open={!!p} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className={cn(
          'gap-0 overflow-y-auto',
          isMobile ? 'max-h-[92dvh] rounded-t-xl' : 'w-full sm:max-w-xl'
        )}
        data-testid="price-history"
      >
        {p ? (
          <>
            <SheetHeader className="gap-2 border-b text-start">
              <SheetTitle className="pe-8 text-lg">{p.name}</SheetTitle>
              <SheetDescription>{[categoryName, t(`supply.unit.${p.unit}`)].join(' · ')}</SheetDescription>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                {p.lastPurchase ? (
                  <span>
                    {t('supply.history.lastPrice', {
                      price: f.money(p.lastPurchase.unitPriceMinor, p.lastPurchase.currency),
                      unit: t(`supply.unit.${p.unit}`)
                    })}
                  </span>
                ) : (
                  <span className="text-muted-foreground">{t('supply.notBought')}</span>
                )}
                {p.lastPurchase ? <ChangeBadge change={p.priceChange} withAmount /> : null}
                {p.supplierName ? (
                  <Button
                    asChild
                    variant="link"
                    size="sm"
                    // The supplier's name is user text: it wraps instead of pushing the sheet sideways (QA2b).
                    className="h-auto max-w-full min-w-0 shrink px-0 text-start break-words whitespace-normal"
                  >
                    <Link to="/contacts" search={{ q: p.supplierName }}>
                      <ContactRoundIcon aria-hidden />
                      {p.supplierName}
                    </Link>
                  </Button>
                ) : null}
                {canEdit ? (
                  <Button variant="outline" size="sm" className="ms-auto" onClick={() => onEdit(p)}>
                    <PencilIcon aria-hidden />
                    {t('supply.product.edit')}
                  </Button>
                ) : null}
              </div>
            </SheetHeader>

            <div className="grid gap-4 p-4">
              <dl className="grid grid-cols-2 gap-3 text-sm">
                {MONTHS.map((key) => {
                  const m = p[key]
                  return (
                    <div key={key} className="bg-muted/50 rounded-lg p-3">
                      <dt className="text-muted-foreground text-xs">{t(`supply.history.${key}`)}</dt>
                      <dd className="font-semibold tabular-nums">{qty(m.qty, p.unit)}</dd>
                      <dd className="text-muted-foreground text-xs tabular-nums">
                        <bdi>{f.money(totalIn(m.totals, currency), currency)}</bdi>
                        {' · '}
                        {t('supply.history.purchases', { count: m.purchaseCount })}
                      </dd>
                    </div>
                  )
                })}
              </dl>

              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">{t('supply.history.title')}</h3>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  size="sm"
                  value={view}
                  onValueChange={(v) => v && setView(v as View)}
                  aria-label={t('supply.history.view')}
                >
                  {VIEWS.map((v) => (
                    <ToggleGroupItem key={v} value={v} aria-label={t(`supply.history.views.${v}`)}>
                      {v === 'chart' ? <ChartLineIcon aria-hidden /> : <TableIcon aria-hidden />}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>

              {history.isPending ? (
                <Skeleton className="h-56" />
              ) : !lines.length ? (
                <p className="text-muted-foreground text-sm">{t('supply.history.empty')}</p>
              ) : view === 'chart' ? (
                <ChartContainer config={config} className="aspect-auto h-56 w-full" data-testid="price-chart">
                  <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                    <CartesianGrid vertical={false} />
                    <XAxis
                      dataKey={DATE_KEY}
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                      minTickGap={16}
                    />
                    {/* H-43: one purchase has no trend; an axis of 12,48–12,52 would only mislead. */}
                    <YAxis
                      hide={data.length < 2}
                      tickLine={false}
                      axisLine={false}
                      width={64}
                      domain={['auto', 'auto']}
                      tickFormatter={(v: number) => f.money(v, currency)}
                    />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          formatter={(v) => (
                            <>
                              <span className="text-muted-foreground">{t('supply.history.unitPrice')}</span>
                              <span className="ms-auto font-medium tabular-nums">
                                <bdi>{f.money(Number(v), currency)}</bdi>
                              </span>
                            </>
                          )}
                        />
                      }
                    />
                    <Line
                      dataKey={PRICE_KEY}
                      type="stepAfter"
                      stroke={`var(--color-${PRICE_KEY})`}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ChartContainer>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('common.date')}</TableHead>
                      <TableHead className="text-end">{t('supply.col.qty')}</TableHead>
                      <TableHead className="text-end">{t('supply.history.unitPrice')}</TableHead>
                      <TableHead className="text-end">{t('common.amount')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...lines].reverse().map((l, i) => (
                      <TableRow key={`${l.expenseId}-${i}`}>
                        <TableCell>
                          {f.date(l.date)}
                          {l.supplierName ? (
                            <span className="text-muted-foreground block text-xs">{l.supplierName}</span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-end tabular-nums">{qty(l.qty, p.unit)}</TableCell>
                        <TableCell className="text-end tabular-nums">
                          <bdi>{f.money(l.unitPriceMinor, l.currency)}</bdi>
                        </TableCell>
                        <TableCell className="text-end tabular-nums">
                          <bdi>{f.money(l.amountMinor, l.currency)}</bdi>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              <p className="text-muted-foreground text-xs">{t('supply.history.source')}</p>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
