// The laundry screen's cards (G-171, K-28, §6.13): the month's account against the laundry's invoice ("Ödendi" →
// one expense in the ledger), the agreed prices with their last rise, the 12-month trend (pieces and amount, with
// a table view) and the delivery log (void a wrong slip, look at its photo).
import { useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import {
  AlertTriangleIcon,
  ArrowDownToLineIcon,
  ArrowUpFromLineIcon,
  CameraIcon,
  ChartColumnIcon,
  CheckCircle2Icon,
  PackageOpenIcon,
  ReceiptTextIcon,
  TableIcon,
  TagIcon
} from 'lucide-react'
import type { LocalDate } from '@shared/date'
import { money, multiplyRatio } from '@shared/money'
import { LOCALE_TAG, type AppLocale } from '@shared/format'
import type {
  LaundryDeliveryView,
  LaundryPriceView,
  LaundryTrendPoint
} from '@shared/contract/procedures/supply'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { PhotoGallery } from '@/components/record-photos'
import { ResponsiveDialog } from '@/components/responsive-dialog'
import { SectionCard } from '@/components/section-card'
import { ErrorState } from '@/components/states'
import { useFormat } from '@/hooks/use-format'
import { useIsMobile } from '@/hooks/use-mobile'
import { useApiQuery } from '@/lib/api/hooks'
import { cn } from '@/lib/utils'
import {
  monthLast,
  monthStart,
  piecesOf,
  priceAt,
  priceInfo,
  stainedOf,
  type ItemType,
  type YearMonth
} from './derive'
import { InvoiceDialog, PaidDialog, PriceDialog, VoidDeliveryDialog } from './laundry-dialogs'

const LOG_SIZE = 8

/** "сент. 2026 г." → "Сент. 2026 г." (CSS capitalize would also turn "г." into "Г."). */
const capitalFirst = (text: string, locale: AppLocale): string =>
  text.charAt(0).toLocaleUpperCase(LOCALE_TAG[locale]) + text.slice(1)

export function SettlementCard({
  contactId,
  months,
  types,
  prices,
  today,
  base,
  canInvoice,
  canPay
}: {
  contactId: string
  months: readonly [YearMonth, YearMonth]
  types: readonly ItemType[]
  prices: readonly LaundryPriceView[]
  today: LocalDate
  base: string
  canInvoice: boolean
  canPay: boolean
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const isMobile = useIsMobile()
  const [last, current] = months
  const [picked, setPicked] = useState<YearMonth>(last)
  const [dialog, setDialog] = useState<'invoice' | 'paid' | null>(null)
  const query = useApiQuery('laundry.month', { contactId, ...picked })
  const label = capitalFirst(f.monthYear(monthStart(picked)), f.locale)
  const priceDay = picked.year === current.year && picked.month === current.month ? today : monthLast(picked)
  const nameOf = (id: string): string => types.find((ty) => ty.id === id)?.name ?? '—'
  const choice = (
    <ToggleGroup
      type="single"
      variant="outline"
      spacing={1}
      value={monthStart(picked)}
      onValueChange={(v) => v && setPicked(months.find((m) => monthStart(m) === v) ?? last)}
      aria-label={t('laundry.settlement.month')}
    >
      {months.map((m) => (
        <ToggleGroupItem key={monthStart(m)} value={monthStart(m)} className="whitespace-nowrap">
          {capitalFirst(f.monthYear(monthStart(m)), f.locale)}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
  const m = query.data
  const settled = m?.settled ?? null
  const paid = !!settled?.expenseId
  const diff = settled?.differenceMinor ?? null
  return (
    <SectionCard
      title={t('laundry.settlement.title')}
      icon={ReceiptTextIcon}
      testId="laundry-settlement"
      action={isMobile ? null : choice}
    >
      <div className="grid gap-3">
        {isMobile ? choice : null}
        {query.isPending ? (
          <Skeleton className="h-40" />
        ) : query.isError || !m ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : (
          <>
            {m.lines.length ? (
              <ul className="grid gap-1 text-sm" aria-label={t('laundry.settlement.lines')}>
                {m.lines.map((line) => {
                  const unit = priceAt(prices, line.itemTypeId, priceDay)
                  // One price for the whole month reads "qty × price"; after a rise mid-month (or slip prices)
                  // the amount is the sum of the slips, so only the pieces are shown.
                  const single =
                    unit !== null &&
                    line.amountMinor !== null &&
                    multiplyRatio(money(unit, base), line.qty).amountMinor === line.amountMinor
                  return (
                    <li key={line.itemTypeId} className="flex flex-wrap items-baseline gap-x-2">
                      <span className="min-w-0 flex-1">{nameOf(line.itemTypeId)}</span>
                      <span className="text-muted-foreground text-xs tabular-nums">
                        {single
                          ? t('laundry.settlement.qtyTimesPrice', {
                              qty: f.number(line.qty),
                              price: f.money(unit, base)
                            })
                          : t('laundry.settlement.mixedPrices', { count: line.qty })}
                      </span>
                      <span className="w-24 text-end font-medium tabular-nums">
                        <bdi>{line.amountMinor === null ? '—' : f.money(line.amountMinor, base)}</bdi>
                      </span>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="text-muted-foreground text-sm">{t('laundry.settlement.noSlips')}</p>
            )}
            {m.unpricedQty > 0 ? (
              <p className="text-destructive text-xs" role="alert">
                {t('laundry.settlement.unpriced', { count: m.unpricedQty })}
              </p>
            ) : null}
            <dl className="grid gap-1.5 border-t pt-3 text-sm">
              <div className="flex justify-between gap-2">
                <dt>{t('laundry.settlement.computed', { count: m.deliveryCount })}</dt>
                <dd className="font-semibold tabular-nums" data-testid="settlement-computed">
                  <bdi>{m.totalAmountMinor === null ? '—' : f.money(m.totalAmountMinor, base)}</bdi>
                </dd>
              </div>
              <div className="text-muted-foreground flex justify-between gap-2 text-xs">
                <dt>{t('laundry.settlement.stained')}</dt>
                <dd className="tabular-nums">{t('laundry.pieces', { count: m.totalStainedQty })}</dd>
              </div>
              {settled?.invoicedTotalMinor != null ? (
                <>
                  <div className="flex justify-between gap-2">
                    <dt>{t('laundry.settlement.invoice')}</dt>
                    <dd className="font-semibold tabular-nums" data-testid="settlement-invoice">
                      <bdi>{f.money(settled.invoicedTotalMinor, base)}</bdi>
                    </dd>
                  </div>
                  {diff !== null && diff !== 0 ? (
                    <Alert variant="destructive" className="mt-1" data-testid="invoice-difference">
                      <AlertTriangleIcon />
                      <AlertTitle>
                        <Trans
                          i18nKey={diff > 0 ? 'laundry.settlement.over' : 'laundry.settlement.under'}
                          values={{ amount: f.money(Math.abs(diff), base) }}
                          components={{ m: <bdi className="tabular-nums" /> }}
                        />
                      </AlertTitle>
                      <AlertDescription>{t('laundry.settlement.checkSlips')}</AlertDescription>
                    </Alert>
                  ) : diff === 0 ? (
                    <p className="text-success flex items-center gap-1.5 text-sm">
                      <CheckCircle2Icon className="size-4" aria-hidden />
                      {t('laundry.settlement.matches')}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    {paid ? (
                      <Badge
                        variant="outline"
                        className="border-success text-success"
                        data-testid="settlement-paid"
                      >
                        <CheckCircle2Icon aria-hidden />
                        {t('laundry.settlement.paid')}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">{t('laundry.settlement.unpaid')}</span>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {canInvoice ? (
                        <Button size="sm" variant="ghost" onClick={() => setDialog('invoice')}>
                          {t('laundry.settlement.fixInvoice')}
                        </Button>
                      ) : null}
                      {canPay && !paid ? (
                        <Button
                          size="sm"
                          onClick={() => setDialog('paid')}
                          data-testid="settlement-mark-paid"
                        >
                          {t('laundry.settlement.markPaid')}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-muted-foreground text-sm">{t('laundry.settlement.noInvoice')}</span>
                  {canInvoice ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDialog('invoice')}
                      data-testid="settlement-invoice-open"
                    >
                      {t('laundry.invoice.title')}
                    </Button>
                  ) : null}
                </div>
              )}
            </dl>
            <p className="text-muted-foreground text-xs">{t('laundry.settlement.prices')}</p>
          </>
        )}
      </div>
      {dialog === 'invoice' && m ? (
        <InvoiceDialog
          contactId={contactId}
          year={picked.year}
          month={picked.month}
          monthLabel={label}
          computedMinor={m.totalAmountMinor}
          base={base}
          paid={paid}
          initialMinor={settled?.invoicedTotalMinor ?? null}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog === 'paid' && settled?.invoicedTotalMinor != null ? (
        <PaidDialog
          contactId={contactId}
          year={picked.year}
          month={picked.month}
          monthLabel={label}
          invoicedMinor={settled.invoicedTotalMinor}
          base={base}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </SectionCard>
  )
}

export function PricesCard({
  contactId,
  types,
  prices,
  today,
  base,
  canEdit
}: {
  contactId: string
  types: readonly ItemType[]
  prices: readonly LaundryPriceView[]
  today: LocalDate
  base: string
  canEdit: boolean
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const [open, setOpen] = useState<string | null | undefined>(undefined)
  const priced = types
    .map((ty) => ({ ty, info: priceInfo(prices, ty.id, today) }))
    .filter((r) => r.info !== null || prices.some((p) => p.itemTypeId === r.ty.id))
  return (
    <SectionCard
      title={t('laundry.price.cardTitle')}
      icon={TagIcon}
      testId="laundry-prices"
      action={
        canEdit ? (
          <Button size="sm" variant="outline" onClick={() => setOpen(null)} data-testid="price-open">
            {t('laundry.price.title')}
          </Button>
        ) : null
      }
    >
      {priced.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('laundry.col.item')}</TableHead>
              <TableHead className="text-end whitespace-normal">{t('laundry.price.unit')}</TableHead>
              <TableHead className="max-md:hidden">{t('laundry.price.since')}</TableHead>
              <TableHead className="text-end whitespace-normal">{t('laundry.price.lastChange')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {priced.map(({ ty, info }) => (
              <TableRow key={ty.id} data-testid={`price-${ty.id}`}>
                <TableCell className="whitespace-normal">
                  {canEdit ? (
                    <button
                      type="button"
                      className="focus-visible:ring-ring rounded-sm text-start underline-offset-4 outline-none hover:underline focus-visible:ring-[3px]"
                      onClick={() => setOpen(ty.id)}
                    >
                      {ty.name}
                    </button>
                  ) : (
                    ty.name
                  )}
                </TableCell>
                <TableCell className="text-end font-medium tabular-nums">
                  {info ? <bdi>{f.money(info.current.unitPriceMinor, info.current.currency)}</bdi> : '—'}
                </TableCell>
                <TableCell className="text-muted-foreground tabular-nums max-md:hidden">
                  {info ? f.date(info.current.validFrom as LocalDate) : t('laundry.price.later')}
                </TableCell>
                <TableCell className="text-end whitespace-normal">
                  {info?.change ? (
                    <span
                      className={cn(
                        'text-xs tabular-nums',
                        info.change.basisPoints > 0 ? 'text-destructive' : 'text-success'
                      )}
                    >
                      {t(info.change.basisPoints > 0 ? 'laundry.price.rise' : 'laundry.price.drop', {
                        pct: f.percent(Math.abs(info.change.basisPoints)),
                        date: f.dayMonth(info.change.from)
                      })}
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className="text-muted-foreground text-sm">{t('laundry.price.none')}</p>
      )}
      {open !== undefined ? (
        <PriceDialog
          contactId={contactId}
          types={types}
          today={today}
          base={base}
          initialType={open}
          onClose={() => setOpen(undefined)}
        />
      ) : null}
    </SectionCard>
  )
}

const METRICS = ['qty', 'amount'] as const
type Metric = (typeof METRICS)[number]

export function TrendCard({
  points,
  base,
  showMoney
}: {
  points: readonly LaundryTrendPoint[]
  base: string
  showMoney: boolean
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const [metric, setMetric] = useState<Metric>('qty')
  const [table, setTable] = useState(false)
  const key = metric === 'qty' || !showMoney ? 'qty' : 'amount'
  const config = {
    qty: { label: t('laundry.trend.qty'), color: 'var(--chart-1)' },
    amount: { label: t('laundry.trend.amount'), color: 'var(--chart-2)' }
  } satisfies ChartConfig
  const data = points.map((p) => ({
    label: f.monthYear(monthStart(p)),
    qty: p.qty,
    amount: p.amountMinor ?? 0
  }))
  return (
    <SectionCard
      title={t('laundry.trend.title')}
      icon={ChartColumnIcon}
      testId="laundry-trend"
      action={
        <div className="flex flex-wrap gap-2">
          {showMoney ? (
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={key}
              onValueChange={(v) => v && setMetric(v as Metric)}
              aria-label={t('laundry.trend.metric')}
            >
              {METRICS.map((mt) => (
                <ToggleGroupItem key={mt} value={mt} className="px-3">
                  {t(`laundry.trend.${mt}`)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          ) : null}
          <Button
            variant="outline"
            size="icon-sm"
            aria-pressed={table}
            aria-label={table ? t('laundry.trend.showChart') : t('laundry.trend.showTable')}
            onClick={() => setTable(!table)}
          >
            {table ? <ChartColumnIcon /> : <TableIcon />}
          </Button>
        </div>
      }
    >
      {table ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('laundry.settlement.month')}</TableHead>
              <TableHead className="text-end">{t('laundry.trend.qty')}</TableHead>
              <TableHead className="text-end">{t('laundry.col.stained')}</TableHead>
              {showMoney ? <TableHead className="text-end">{t('laundry.trend.amount')}</TableHead> : null}
              {showMoney ? (
                <TableHead className="text-end max-md:hidden">{t('laundry.settlement.invoice')}</TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...points].reverse().map((p) => (
              <TableRow key={`${p.year}-${p.month}`}>
                <TableCell>{f.monthYear(monthStart(p))}</TableCell>
                <TableCell className="text-end tabular-nums">{f.number(p.qty)}</TableCell>
                <TableCell className="text-end tabular-nums">{f.number(p.stainedQty)}</TableCell>
                {showMoney ? (
                  <TableCell className="text-end tabular-nums">
                    <bdi>{p.amountMinor === null ? '—' : f.money(p.amountMinor, p.currency)}</bdi>
                  </TableCell>
                ) : null}
                {showMoney ? (
                  <TableCell className="text-end tabular-nums max-md:hidden">
                    <bdi>
                      {p.invoicedTotalMinor === null ? '—' : f.money(p.invoicedTotalMinor, p.currency)}
                    </bdi>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <ChartContainer config={config} className="aspect-auto h-52 w-full" data-testid="laundry-trend-chart">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={8} />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={key === 'amount' ? 72 : 40}
              tickFormatter={(v: number) => (key === 'amount' ? f.money(v, base) : f.number(v))}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(v) => (
                    <>
                      <span className="text-muted-foreground">{t(`laundry.trend.${key}`)}</span>
                      <span className="ms-auto font-medium tabular-nums">
                        <bdi>{key === 'amount' ? f.money(Number(v), base) : f.number(Number(v))}</bdi>
                      </span>
                    </>
                  )}
                />
              }
            />
            <Bar dataKey={key} fill={`var(--color-${key})`} radius={4} isAnimationActive={false} />
          </BarChart>
        </ChartContainer>
      )}
    </SectionCard>
  )
}

export function DeliveryLog({
  deliveries,
  canEdit
}: {
  deliveries: readonly LaundryDeliveryView[]
  canEdit: boolean
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const [all, setAll] = useState(false)
  const [voiding, setVoiding] = useState<LaundryDeliveryView | null>(null)
  const [photos, setPhotos] = useState<LaundryDeliveryView | null>(null)
  const log = [...deliveries].sort(
    (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)
  )
  const shown = all ? log : log.slice(0, LOG_SIZE)
  return (
    <SectionCard
      title={t('laundry.log.title')}
      icon={PackageOpenIcon}
      count={log.length}
      testId="laundry-log"
    >
      {log.length ? (
        <div className="grid gap-2">
          <ul className="grid gap-1">
            {shown.map((d) => {
              const stained = stainedOf(d)
              return (
                <li
                  key={d.id}
                  className={cn(
                    'flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-1 text-sm',
                    d.voidedAt && 'text-muted-foreground'
                  )}
                  data-testid={`delivery-${d.id}`}
                >
                  <span
                    className={cn(
                      'grid size-8 shrink-0 place-items-center rounded-md',
                      d.direction === 'in' ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'
                    )}
                    aria-hidden
                  >
                    {d.direction === 'in' ? (
                      <ArrowDownToLineIcon className="size-4" />
                    ) : (
                      <ArrowUpFromLineIcon className="size-4" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">
                      {t(`laundry.log.${d.direction}`)}
                      {d.voidedAt ? ` · ${t('laundry.log.voided')}` : ''}
                    </span>
                    <span className="text-muted-foreground block text-xs">
                      {[f.date(d.date as LocalDate), d.slipNo, d.note].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className="grid justify-items-end text-end">
                    <span className={cn('font-semibold tabular-nums', d.voidedAt && 'line-through')}>
                      {t('laundry.pieces', { count: piecesOf(d) })}
                    </span>
                    {stained ? (
                      <span className="text-muted-foreground text-xs">
                        {t('laundry.stainedN', { count: stained })}
                      </span>
                    ) : null}
                  </span>
                  <span className="flex gap-1">
                    {d.direction === 'in' ? (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t('laundry.log.photos', { date: f.date(d.date as LocalDate) })}
                        onClick={() => setPhotos(d)}
                      >
                        <CameraIcon />
                      </Button>
                    ) : null}
                    {canEdit && !d.voidedAt ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground"
                        onClick={() => setVoiding(d)}
                      >
                        {t('laundry.void.button')}
                      </Button>
                    ) : null}
                  </span>
                </li>
              )
            })}
          </ul>
          {log.length > LOG_SIZE ? (
            <Button variant="ghost" size="sm" className="justify-self-start" onClick={() => setAll(!all)}>
              {all ? t('laundry.log.less') : t('laundry.log.all', { count: log.length })}
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">{t('laundry.log.empty')}</p>
      )}
      {voiding ? <VoidDeliveryDialog delivery={voiding} onClose={() => setVoiding(null)} /> : null}
      {photos ? (
        <ResponsiveDialog
          open
          onOpenChange={(o) => (o ? null : setPhotos(null))}
          title={t('laundry.log.photosTitle')}
          description={[f.date(photos.date as LocalDate), photos.slipNo].filter(Boolean).join(' · ')}
        >
          <PhotoGallery
            target={{ kind: 'laundry_delivery', id: photos.id }}
            canAdd={canEdit && !photos.voidedAt}
          />
        </ResponsiveDialog>
      ) : null}
    </SectionCard>
  )
}
