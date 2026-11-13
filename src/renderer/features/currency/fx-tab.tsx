// Döviz (G-110…G-112, K-06, S-68): one market mid rate per currency (no buy/sell), its source and time, the change
// against yesterday and 30 days of closes; the hotel's own fixed rate; a converter that keeps money in integer minor
// units; the TCMB comparison line (can be hidden). With the internet off the last known rates stay in use and
// nothing else changes (G-01, G-02). Phone: the converter first.
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ArrowDownUpIcon,
  CoinsIcon,
  HistoryIcon,
  LandmarkIcon,
  ListOrderedIcon,
  MonitorSmartphoneIcon,
  PencilIcon,
  RefreshCwIcon,
  TrendingDownIcon,
  TrendingUpIcon,
  WifiIcon,
  WifiOffIcon
} from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { FxOverview, FxRateView } from '@shared/contract/external'
import { FX_PROVIDER_NAMES, rateAge, type RateAge } from '@shared/domain/external'
import { LOCALE_TAG } from '@shared/format'
import { localDate } from '@shared/date'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { CopyButton } from '@/components/copy-button'
import { sparkPoints } from '@/components/kpi-card'
import { moneyToText, textToMoney, type MoneyValue } from '@/components/money-input'
import { QueryView } from '@/components/query-view'
import { SectionCard } from '@/components/section-card'
import { EmptyState } from '@/components/states'
import { useFormat } from '@/hooks/use-format'
import { useIsMobile } from '@/hooks/use-mobile'
import { useApiMutation, useApiQuery, useSettings, useUpdateSettings } from '@/lib/api/hooks'
import { useCan } from '@/lib/view-as'
import { cn } from '@/lib/utils'
import {
  convertMinor,
  dayChange,
  effectiveMicro,
  hoursBetween,
  rateNumber,
  rateTable,
  quoteText,
  ROUNDINGS,
  type Rounding
} from './fx-model'
import { GuestViewDialog, HotelRateDialog } from './rate-dialogs'
import { SourcesDialog } from './sources-dialog'
import { useErrorToast } from './use-error-toast'
import { useWhen } from './use-when'

const AGE_CLASS: Record<Exclude<RateAge, 'fresh'>, string> = {
  stale: 'border-warning/60 text-warning',
  veryStale: 'border-destructive/60 text-destructive'
}

function useCurrencyName() {
  const f = useFormat()
  return useMemo(() => {
    const names = new Intl.DisplayNames([LOCALE_TAG[f.locale]], { type: 'currency' })
    return (code: string): string => names.of(code) ?? code
  }, [f.locale])
}

/** "son güncelleme 2 saat önce" badge: shown only once a rate is older than 6 hours. */
function AgeBadge({ at, now }: { at: string; now: string }) {
  const { t } = useTranslation()
  const age = rateAge(at, now)
  if (age === 'fresh') return null
  return (
    <Badge variant="outline" className={AGE_CLASS[age]} data-testid="fx-age">
      {t('currency.card.age', { count: hoursBetween(at, now) })}
    </Badge>
  )
}

function Spark({ rate }: { rate: FxRateView }) {
  const { t } = useTranslation()
  const f = useFormat()
  const series = rate.history.map((h) => h.micro)
  if (series.length < 2) return <span className="h-8 w-24 shrink-0" aria-hidden />
  const min = Math.min(...series)
  const max = Math.max(...series)
  return (
    <svg
      viewBox="0 0 100 32"
      className="h-8 w-24 shrink-0"
      preserveAspectRatio="none"
      role="img"
      aria-label={t('currency.card.spark', {
        days: series.length,
        min: f.number(rateNumber(min), 4),
        max: f.number(rateNumber(max), 4)
      })}
    >
      <title>
        {t('currency.card.spark', {
          days: series.length,
          min: f.number(rateNumber(min), 4),
          max: f.number(rateNumber(max), 4)
        })}
      </title>
      <polyline
        points={sparkPoints(series)}
        className="stroke-chart-1 fill-none"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

function RateCard({
  rate,
  overview,
  quoteHotel,
  showTcmb
}: {
  rate: FxRateView
  overview: FxOverview
  quoteHotel: boolean
  showTcmb: boolean
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const when = useWhen()
  const name = useCurrencyName()
  const change = dayChange(rate)
  const micro = effectiveMicro(rate, quoteHotel)
  const hotel = quoteHotel && rate.hotelMicro !== null
  const tcmbGap =
    rate.tcmbMicro && rate.marketMicro
      ? Math.round(((rate.tcmbMicro - rate.marketMicro) / rate.marketMicro) * 10_000)
      : null
  return (
    <Card className="gap-2 py-4" data-testid={`rate-${rate.currency}`}>
      <CardContent className="grid gap-2 px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-lg leading-none font-semibold">{rate.currency}</p>
            {/* One line, so the cards keep their rates level; the full name is in the tooltip. */}
            <p className="text-muted-foreground mt-1 line-clamp-1 text-xs" title={name(rate.currency)}>
              {name(rate.currency)}
            </p>
          </div>
          <Badge variant={hotel ? 'outline' : 'secondary'} className="shrink-0">
            {hotel ? t('currency.source.hotel') : t('currency.source.market_mid')}
          </Badge>
        </div>
        <div className="flex items-end justify-between gap-3">
          <p className="text-2xl font-semibold tracking-tight tabular-nums" dir="ltr">
            {micro ? f.number(rateNumber(micro), 4) : '—'}
            <span className="text-muted-foreground ms-1 text-sm font-normal">{overview.base}</span>
          </p>
          <Spark rate={rate} />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {change !== null ? (
            <span
              className={cn(
                'font-medium tabular-nums',
                change > 0 ? 'text-success' : change < 0 ? 'text-destructive' : 'text-muted-foreground'
              )}
            >
              {change > 0 ? (
                <TrendingUpIcon className="me-1 inline size-3.5" aria-hidden />
              ) : change < 0 ? (
                <TrendingDownIcon className="me-1 inline size-3.5" aria-hidden />
              ) : null}
              {t('currency.card.change', { value: `${change > 0 ? '+' : ''}${f.percent(change, 2)}` })}
            </span>
          ) : null}
          {rate.marketAt ? (
            <span className="text-muted-foreground">
              {rate.provider
                ? t('currency.card.sourceAt', {
                    source:
                      FX_PROVIDER_NAMES[rate.provider as keyof typeof FX_PROVIDER_NAMES] ?? rate.provider,
                    when: when(rate.marketAt)
                  })
                : when(rate.marketAt)}
            </span>
          ) : (
            <span className="text-muted-foreground">{t('currency.card.noMarket')}</span>
          )}
          {rate.marketAt ? <AgeBadge at={rate.marketAt} now={overview.now} /> : null}
        </div>
        {hotel && rate.marketMicro ? (
          <p className="text-muted-foreground text-xs">
            {t('currency.card.market', { rate: f.number(rateNumber(rate.marketMicro), 4) })}
          </p>
        ) : null}
        {showTcmb && rate.tcmbMicro ? (
          <p
            className="text-muted-foreground flex items-center gap-1.5 text-xs"
            data-testid="tcmb-line"
            title={t('currency.card.tcmbHelp')}
          >
            <LandmarkIcon className="size-3.5 shrink-0" aria-hidden />
            {tcmbGap !== null
              ? t('currency.card.tcmbGap', {
                  rate: f.number(rateNumber(rate.tcmbMicro), 4),
                  gap: `${tcmbGap > 0 ? '+' : ''}${f.percent(tcmbGap, 2)}`
                })
              : t('currency.card.tcmb', { rate: f.number(rateNumber(rate.tcmbMicro), 4) })}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}

function Converter({
  base,
  table,
  currencies,
  rounding,
  onRounding,
  onGuest
}: {
  base: string
  table: Record<string, number>
  currencies: readonly string[]
  rounding: Rounding
  onRounding: (r: Rounding) => void
  onGuest: (from: MoneyValue, to: string) => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const firstForeign = currencies.find((c) => c !== base) ?? base
  const [text, setText] = useState(() => moneyToText(250_000, base, f.locale))
  const [fromCurrency, setFromCurrency] = useState(base)
  const [to, setTo] = useState<string>(firstForeign)
  const parsed = textToMoney(text, fromCurrency, f.locale)
  const invalid = parsed !== null && !Number.isFinite(parsed)
  const from: MoneyValue = { amountMinor: invalid ? null : parsed, currency: fromCurrency }
  const exact = from.amountMinor !== null ? convertMinor(from.amountMinor, from.currency, to, table) : null
  const others = currencies.filter((c) => c !== from.currency && c !== to)
  const swap = (): void => {
    setText(moneyToText(exact, to, f.locale))
    setFromCurrency(to)
    setTo(fromCurrency)
  }
  const resultText = exact === null ? '' : quoteText(exact, to, rounding, f.locale)
  return (
    <SectionCard
      title={t('currency.converter.title')}
      icon={CoinsIcon}
      testId="converter"
      action={
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onGuest(from, to)}
          disabled={from.amountMinor === null}
        >
          <MonitorSmartphoneIcon aria-hidden />
          {t('currency.converter.guest')}
        </Button>
      }
    >
      <div className="grid gap-4">
        <div className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,12rem)]">
          <div className="grid gap-1.5">
            <Label htmlFor="fx-amount">{t('currency.converter.amount')}</Label>
            <div className="flex gap-2" dir="ltr">
              <Input
                id="fx-amount"
                inputMode="decimal"
                autoComplete="off"
                value={text}
                onChange={(e) => setText(e.target.value)}
                aria-invalid={invalid || undefined}
                aria-describedby={invalid ? 'fx-amount-error' : undefined}
                className="text-end text-lg tabular-nums"
              />
              <Select value={fromCurrency} onValueChange={setFromCurrency}>
                <SelectTrigger className="w-24 shrink-0" aria-label={t('currency.converter.from')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {currencies.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {invalid ? (
              <p id="fx-amount-error" className="text-destructive text-xs">
                {t('money.invalid')}
              </p>
            ) : null}
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={swap}
            aria-label={t('currency.converter.swap')}
            className="max-sm:justify-self-center"
          >
            <ArrowDownUpIcon className="sm:-rotate-90" />
          </Button>
          <div className="grid gap-1.5">
            <Label htmlFor="fx-to">{t('currency.converter.to')}</Label>
            <Select value={to} onValueChange={setTo}>
              <SelectTrigger id="fx-to" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {currencies.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div
          className="bg-accent/60 flex items-center justify-between gap-3 rounded-lg px-4 py-3"
          aria-live="polite"
          data-testid="fx-result"
        >
          <div className="min-w-0">
            <p className="text-muted-foreground text-xs">{t('currency.converter.result')}</p>
            <p className="text-3xl font-semibold tracking-tight tabular-nums">
              <bdi>{exact === null ? '—' : resultText}</bdi>
            </p>
          </div>
          {exact !== null ? <CopyButton text={resultText} size="icon-sm" variant="ghost" /> : null}
        </div>
        {from.amountMinor !== null && others.length ? (
          <ul
            className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3"
            aria-label={t('currency.converter.all')}
          >
            {others.map((c) => {
              const v = convertMinor(from.amountMinor ?? 0, from.currency, c, table)
              return (
                <li key={c} className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">{c}</span>
                  <bdi className="font-medium tabular-nums">
                    {v === null ? '—' : quoteText(v, c, rounding, f.locale)}
                  </bdi>
                </li>
              )
            })}
          </ul>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <p className="text-muted-foreground min-w-0 flex-1 basis-60 text-xs">
            {t('currency.converter.note')}
          </p>
          <div className="flex items-center gap-2">
            <Label htmlFor="fx-rounding" className="text-xs font-normal">
              {t('currency.converter.rounding')}
            </Label>
            <Select value={rounding} onValueChange={(v) => onRounding(v as Rounding)}>
              <SelectTrigger id="fx-rounding" size="sm" className="w-auto min-w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROUNDINGS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {t(`currency.converter.round.${r}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </SectionCard>
  )
}

function HistoryCard({ overview }: { overview: FxOverview }) {
  const { t } = useTranslation()
  const f = useFormat()
  const mobile = useIsMobile()
  // The last seven days that have a rate in any currency, newest first.
  const days = [...new Set(overview.rates.flatMap((r) => r.history.map((h) => h.date)))]
    .sort()
    .reverse()
    .slice(0, 7)
  const today = overview.today
  return (
    <SectionCard title={t('currency.history.title')} icon={HistoryIcon} testId="fx-history">
      {days.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('currency.history.empty')}</p>
      ) : (
        <Table
          className={cn(
            'text-sm',
            mobile ? 'text-xs [&_td]:px-1 [&_th]:px-1' : '[&_td]:px-1.5 [&_th]:px-1.5'
          )}
        >
          <TableHeader>
            <TableRow>
              <TableHead>{t('currency.history.day')}</TableHead>
              {overview.rates.map((r) => (
                <TableHead key={r.currency} className="text-end">
                  {r.currency}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {days.map((d) => (
              <TableRow key={d}>
                <TableCell className="text-muted-foreground" title={f.date(localDate(d), 'full')}>
                  {d === today ? t('common.today') : f.dayMonth(localDate(d))}
                </TableCell>
                {overview.rates.map((r) => {
                  const v = r.history.find((h) => h.date === d)?.micro
                  return (
                    <TableCell key={r.currency} className="text-end tabular-nums" dir="ltr">
                      {v === undefined ? '—' : f.number(rateNumber(v), 4)}
                    </TableCell>
                  )
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <p className="text-muted-foreground mt-3 text-xs">{t('currency.history.note')}</p>
    </SectionCard>
  )
}

function FxView({ overview }: { overview: FxOverview }) {
  const { t } = useTranslation()
  const when = useWhen()
  const can = useCan()
  const mobile = useIsMobile()
  const settings = useSettings()
  const update = useUpdateSettings()
  const failed = useErrorToast()
  const client = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [sources, setSources] = useState(false)
  const [guest, setGuest] = useState<{ from: MoneyValue; to: string } | null>(null)
  const quoteHotel = settings.data?.['fx.quoteHotelRate'] ?? true
  const showTcmb = settings.data?.['fx.showTcmb'] ?? true
  const [localRounding, setLocalRounding] = useState<Rounding | null>(null)
  const rounding = localRounding ?? settings.data?.['fx.rounding'] ?? 'minor'
  const canEdit = can('currency', 'edit')
  const canNetwork = can('settings', 'edit')
  const table = useMemo(() => rateTable(overview, quoteHotel), [overview, quoteHotel])
  const currencies = [overview.base, ...overview.rates.map((r) => r.currency)]
  const refresh = useApiMutation('fx.refresh', {
    invalidates: ['fx.overview', 'fx.sources'],
    onError: failed,
    onSuccess: (r) => {
      if (r.ok) toast.success(t('currency.status.refreshed'))
      else if (!r.skipped) toast.warning(t('currency.status.refreshFailed'))
    }
  })
  const online = overview.networkEnabled
  const latest = overview.lastSuccessAt
  // A refresh was tried after the last good one and failed: the internet (or every source) is away.
  const unreachable =
    online &&
    !!overview.lastAttemptAt &&
    (!latest || Date.parse(overview.lastAttemptAt) - Date.parse(latest) > 60_000)
  const hasRates = overview.rates.some((r) => effectiveMicro(r, quoteHotel) !== null)
  const setRounding = (r: Rounding): void => {
    setLocalRounding(r)
    if (canEdit) update.mutate({ 'fx.rounding': r }, { onError: failed })
  }

  const status = (
    <Card className="py-3" data-testid="fx-status">
      <CardContent className="grid gap-3 px-4 md:flex md:flex-wrap md:items-center md:gap-x-4 md:gap-y-2">
        <span className="flex min-w-0 items-start gap-2 text-sm md:items-center">
          {online ? (
            <WifiIcon className="text-success mt-0.5 size-4 shrink-0 md:mt-0" aria-hidden />
          ) : (
            <WifiOffIcon className="text-warning mt-0.5 size-4 shrink-0 md:mt-0" aria-hidden />
          )}
          <span className="grid gap-x-2 md:flex md:flex-wrap">
            <span className="font-medium">
              {t('currency.status.mode', { minutes: overview.refreshMinutes })}
            </span>
            <span className="text-muted-foreground">
              {latest ? t('currency.status.updated', { when: when(latest) }) : t('currency.status.never')}
            </span>
          </span>
        </span>
        <Label className="flex min-h-9 items-center gap-2 font-normal max-md:min-h-11 md:ms-auto">
          <Switch
            checked={online}
            disabled={!canNetwork || update.isPending}
            onCheckedChange={(v) =>
              update.mutate(
                { 'network.enabled': v },
                {
                  onError: failed,
                  onSuccess: () =>
                    v ? refresh.mutate({}) : void client.invalidateQueries({ queryKey: ['fx.overview'] })
                }
              )
            }
          />
          {t('currency.status.online')}
        </Label>
        <div className="grid grid-cols-2 gap-2 md:flex">
          <Button
            variant="outline"
            size="sm"
            disabled={!online || refresh.isPending}
            onClick={() => refresh.mutate({})}
          >
            <RefreshCwIcon aria-hidden className={cn(refresh.isPending && 'animate-spin')} />
            {t('currency.status.refresh')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setSources(true)}>
            <ListOrderedIcon aria-hidden />
            {t('currency.sources.open')}
          </Button>
          {canEdit ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={update.isPending}
              onClick={() =>
                update.mutate(
                  { 'fx.showTcmb': !showTcmb },
                  { onError: failed, onSuccess: () => (showTcmb ? undefined : refresh.mutate({})) }
                )
              }
            >
              <LandmarkIcon aria-hidden />
              {showTcmb ? t('currency.status.hideTcmb') : t('currency.status.showTcmb')}
            </Button>
          ) : null}
          {canEdit ? (
            <Button size="sm" onClick={() => setEditing(true)}>
              <PencilIcon aria-hidden />
              {t('currency.hotelRate.open')}
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
  const offline =
    !online || unreachable ? (
      <Alert className="border-warning/60" data-testid="fx-offline">
        <WifiOffIcon aria-hidden />
        <AlertTitle>{online ? t('currency.offline.unreachable') : t('currency.offline.title')}</AlertTitle>
        <AlertDescription>
          {latest ? t('currency.offline.body', { when: when(latest) }) : t('currency.offline.bodyNever')}
        </AlertDescription>
      </Alert>
    ) : null
  const cards = hasRates ? (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" data-testid="rate-cards">
      {overview.rates.map((r) => (
        <RateCard key={r.currency} rate={r} overview={overview} quoteHotel={quoteHotel} showTcmb={showTcmb} />
      ))}
    </div>
  ) : (
    <EmptyState
      icon={CoinsIcon}
      title={t('currency.emptyTitle')}
      body={online ? t('currency.emptyBody') : t('currency.emptyOffline')}
    />
  )
  const converter = hasRates ? (
    <Converter
      base={overview.base}
      table={table}
      currencies={currencies}
      rounding={rounding}
      onRounding={setRounding}
      onGuest={(from, to) => setGuest({ from, to })}
    />
  ) : null
  const history = <HistoryCard overview={overview} />

  return (
    <div className="grid grid-cols-1 gap-4">
      {mobile ? (
        <>
          {converter}
          {offline}
          {status}
          {cards}
          {hasRates ? history : null}
        </>
      ) : (
        <>
          {status}
          {offline}
          {cards}
          {hasRates ? (
            <div className="grid items-start gap-4 lg:grid-cols-5">
              <div className="lg:col-span-3">{converter}</div>
              <div className="lg:col-span-2">{history}</div>
            </div>
          ) : null}
        </>
      )}
      {editing ? <HotelRateDialog open={editing} onOpenChange={setEditing} overview={overview} /> : null}
      <SourcesDialog open={sources} onOpenChange={setSources} />
      <GuestViewDialog
        value={guest}
        table={table}
        currencies={currencies}
        rounding={rounding}
        onOpenChange={(o) => !o && setGuest(null)}
      />
    </div>
  )
}

function FxSkeleton() {
  const { t } = useTranslation()
  return (
    <div role="status" aria-busy className="grid gap-4">
      <span className="sr-only">{t('common.loading')}</span>
      <Skeleton className="h-14" aria-hidden />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-hidden>
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-36" />
        ))}
      </div>
      <Skeleton className="h-64" aria-hidden />
    </div>
  )
}

export function FxTab() {
  // Refetched every minute: the timer in the main process brings new rates every `fx.refreshMinutes`.
  const query = useApiQuery('fx.overview', {}, { refetchInterval: 60_000 })
  return (
    <QueryView query={query} loading={<FxSkeleton />}>
      {(overview) => <FxView overview={overview} />}
    </QueryView>
  )
}
