// The typed exchange rate of a payment or an expense (K-43): asked only when no rate is known for a currency (no
// internet and none ever fetched), always as "1 <currency> = ? <base currency>". A payment into a folio in a third
// currency may need two: the payment's currency and the folio's (the amount goes through the base currency).
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useApiQuery } from '@/lib/api/hooks'

export interface RateNeeds {
  base: string | null
  /** A rate for 1 unit of the payment / expense currency. */
  pay: boolean
  /** A rate for 1 unit of the folio currency. */
  folio: boolean
}

export interface RateTexts {
  pay: string
  folio: string
}

export const EMPTY_RATES: RateTexts = { pay: '', folio: '' }

/**
 * Which typed rates a form needs now. `force` (the server answered "no rate" anyway) asks for every rate that
 * could be missing.
 */
export function useRateNeeds(
  currency: string,
  folioCurrency: string | null,
  opts: { enabled?: boolean; force?: boolean } = {}
): RateNeeds {
  const currencies = [...new Set([currency, ...(folioCurrency ? [folioCurrency] : [])])].sort()
  const known = useApiQuery(
    'ledger.knownRates',
    { currencies },
    { enabled: opts.enabled ?? true, staleTime: 30_000 }
  )
  const base = known.data?.base ?? null
  const missing = new Set(known.data?.missing ?? [])
  const foreign = (c: string) => base !== null && c !== base
  const folioMatters = !!folioCurrency && folioCurrency !== currency
  return {
    base,
    pay: opts.force ? foreign(currency) : missing.has(currency),
    folio: folioMatters && (opts.force ? foreign(folioCurrency) : missing.has(folioCurrency))
  }
}

/** "35,20" / "35.20" → rate × 1 000 000 (integer); null if empty or invalid. */
export function rateTextToMicro(text: string): number | null {
  const clean = text.trim().replace(/\s/g, '').replace(',', '.')
  const m = /^(\d{1,9})(?:\.(\d{1,6}))?$/.exec(clean)
  if (!m) return null
  const micro = Number(`${m[1]}${(m[2] ?? '').padEnd(6, '0')}`)
  return micro > 0 ? micro : null
}

/**
 * The typed rates to send: only those the form asks for and the person filled in. `bad` = something typed is not a
 * rate.
 */
export function typedRates(
  needs: RateNeeds,
  texts: RateTexts
): { manualRateMicro?: number; manualFolioRateMicro?: number } | 'bad' {
  const out: { manualRateMicro?: number; manualFolioRateMicro?: number } = {}
  for (const [need, text, key] of [
    [needs.pay, texts.pay, 'manualRateMicro'],
    [needs.folio, texts.folio, 'manualFolioRateMicro']
  ] as const) {
    if (!need || !text.trim()) continue
    const micro = rateTextToMicro(text)
    if (micro === null) return 'bad'
    out[key] = micro
  }
  return out
}

function RateInput({
  from,
  to,
  value,
  onChange,
  which
}: {
  from: string
  to: string
  value: string
  onChange: (value: string) => void
  which: 'pay' | 'folio'
}) {
  const { t } = useTranslation()
  const id = useId()
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{t('ledger.rate.typedLabel', { from, to })}</Label>
      <Input
        id={id}
        dir="ltr"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="35,20"
        className="tabular-nums"
        data-testid={`manual-rate-${which}`}
      />
    </div>
  )
}

export function ManualRateFields({
  needs,
  currency,
  folioCurrency,
  value,
  onChange
}: {
  needs: RateNeeds
  currency: string
  folioCurrency?: string | null
  value: RateTexts
  onChange: (next: RateTexts) => void
}) {
  const { t } = useTranslation()
  if (!needs.base || (!needs.pay && !needs.folio)) return null
  return (
    <div className="grid gap-3" data-testid="manual-rate">
      {needs.pay ? (
        <RateInput
          from={currency}
          to={needs.base}
          value={value.pay}
          onChange={(pay) => onChange({ ...value, pay })}
          which="pay"
        />
      ) : null}
      {needs.folio && folioCurrency ? (
        <RateInput
          from={folioCurrency}
          to={needs.base}
          value={value.folio}
          onChange={(folio) => onChange({ ...value, folio })}
          which="folio"
        />
      ) : null}
      <p className="text-muted-foreground -mt-1 text-xs">{t('ledger.rate.typedHint')}</p>
    </div>
  )
}
