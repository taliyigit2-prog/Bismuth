// "Otel kuru" (G-111): the hotel fixes its own rate for a currency (or goes back to the market mid rate) and says
// whether guests are told that rate; "Misafire göster" (G-110): the conversion in large type for the guest.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { FxOverview } from '@shared/contract/external'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { ResponsiveDialog } from '@/components/responsive-dialog'
import type { MoneyValue } from '@/components/money-input'
import { useFormat } from '@/hooks/use-format'
import { useApiMutation, useSettings, useUpdateSettings } from '@/lib/api/hooks'
import { useErrorToast } from './use-error-toast'
import { convertMinor, parseRateMicro, rateNumber, quoteText, type Rounding } from './fx-model'

export function HotelRateDialog({
  open,
  onOpenChange,
  overview
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  overview: FxOverview
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const settings = useSettings()
  const updateSettings = useUpdateSettings()
  const [currency, setCurrency] = useState(overview.rates[0]?.currency ?? 'EUR')
  const [text, setText] = useState('')
  const [tried, setTried] = useState(false)
  const rate = overview.rates.find((r) => r.currency === currency)
  const micro = parseRateMicro(text, f.locale)
  const quote = settings.data?.['fx.quoteHotelRate'] ?? true
  const failed = useErrorToast()
  const save = useApiMutation('fx.setHotelRate', { invalidates: ['fx.overview'], onError: failed })
  const close = (): void => {
    setText('')
    setTried(false)
    onOpenChange(false)
  }
  const submit = (): void => {
    setTried(true)
    if (micro === null) return
    save.mutate(
      { currency, rateMicro: micro },
      {
        onSuccess: () => {
          toast.success(t('currency.hotelRate.saved', { currency }))
          close()
        }
      }
    )
  }
  const backToMarket = (): void =>
    save.mutate(
      { currency, rateMicro: null },
      {
        onSuccess: () => {
          toast.success(t('currency.hotelRate.cleared', { currency }))
          close()
        }
      }
    )
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(o) => (o ? onOpenChange(true) : close())}
      title={t('currency.hotelRate.title')}
      description={t('currency.hotelRate.description')}
      footer={
        <>
          {rate?.hotelMicro ? (
            <Button variant="ghost" className="sm:me-auto" onClick={backToMarket} disabled={save.isPending}>
              {t('currency.hotelRate.backToMarket')}
            </Button>
          ) : null}
          <Button variant="outline" onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="hotel-rate-form" disabled={save.isPending}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form
        id="hotel-rate-form"
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="hotel-rate-currency">{t('money.currency')}</Label>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger id="hotel-rate-currency" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {overview.rates.map((r) => (
                <SelectItem key={r.currency} value={r.currency}>
                  {r.currency}
                  {r.hotelMicro ? ` · ${t('currency.source.hotel')}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="hotel-rate-value">
            {t('currency.hotelRate.value', { currency, base: overview.base })}
          </Label>
          <Input
            id="hotel-rate-value"
            dir="ltr"
            inputMode="decimal"
            autoComplete="off"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={rate?.hotelMicro ? f.number(rateNumber(rate.hotelMicro), 4) : ''}
            aria-invalid={(tried && micro === null) || undefined}
            className="text-end tabular-nums"
          />
          <p
            className={tried && micro === null ? 'text-destructive text-xs' : 'text-muted-foreground text-xs'}
          >
            {tried && micro === null
              ? t('currency.hotelRate.invalid')
              : rate?.marketMicro
                ? t('currency.hotelRate.marketHint', { rate: f.number(rateNumber(rate.marketMicro), 4) })
                : t('currency.hotelRate.noMarket')}
          </p>
        </div>
        <p className="text-muted-foreground text-xs">{t('currency.hotelRate.note')}</p>
      </form>
      {/* Outside the form: the switch saves at once, and Enter in the rate field still submits the form. */}
      <div className="mt-4">
        <Label className="flex min-h-9 items-start gap-3 font-normal max-md:min-h-11">
          <Switch
            className="mt-0.5"
            checked={quote}
            disabled={updateSettings.isPending}
            onCheckedChange={(v) => updateSettings.mutate({ 'fx.quoteHotelRate': v }, { onError: failed })}
          />
          <span className="grid gap-0.5">
            <span>{t('currency.hotelRate.quote')}</span>
            <span className="text-muted-foreground text-xs">{t('currency.hotelRate.quoteHelp')}</span>
          </span>
        </Label>
      </div>
    </ResponsiveDialog>
  )
}

export function GuestViewDialog({
  value,
  table,
  currencies,
  rounding,
  onOpenChange
}: {
  value: { from: MoneyValue; to: string } | null
  table: Record<string, number>
  currencies: readonly string[]
  rounding: Rounding
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const f = useFormat()
  const amount = value?.from.amountMinor ?? null
  const from = value?.from.currency ?? 'TRY'
  const targets = value ? [value.to, ...currencies.filter((c) => c !== value.to && c !== from)] : []
  return (
    <ResponsiveDialog
      open={!!value}
      onOpenChange={onOpenChange}
      title={t('currency.converter.guest')}
      className="sm:max-w-2xl"
      footer={
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          {t('common.close')}
        </Button>
      }
    >
      {amount !== null ? (
        <div className="grid gap-4 text-center" data-testid="guest-view">
          <p className="text-4xl font-semibold tabular-nums">
            <bdi>{f.money(amount, from)}</bdi>
          </p>
          <ul className="grid gap-2">
            {targets.map((c, i) => {
              const v = convertMinor(amount, from, c, table)
              return (
                <li
                  key={c}
                  className={
                    i === 0
                      ? 'text-5xl font-bold tabular-nums max-md:text-4xl'
                      : 'text-muted-foreground text-2xl tabular-nums'
                  }
                >
                  <bdi>{v === null ? '—' : quoteText(v, c, rounding, f.locale)}</bdi>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
    </ResponsiveDialog>
  )
}
