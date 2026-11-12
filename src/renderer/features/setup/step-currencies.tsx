// Step 4 — currencies (G-10, K-15): the base currency of every total (required) and the currencies amount fields
// offer. The base currency is always among the accepted ones. The common currencies are chips; any other ISO 4217
// currency is added with the picker and becomes a ticked chip (at most MAX_ACCEPTED_CURRENCIES are accepted); the
// focus moves to the new chip, which the picker scrolls into view.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MAX_ACCEPTED_CURRENCIES } from '@shared/contract'
import { CurrencyPicker } from '@/components/currency-picker'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useFormat } from '@/hooks/use-format'
import { chipCurrencies, currencyName } from '@/lib/currencies'
import { ids } from './draft'
import { ChoiceChip, Field, FieldMessage } from './fields'
import type { StepProps } from './step-props'

const chipId = (code: string): string => `setup-currency-chip-${code}`

export function CurrenciesStep({ draft, update, errors }: StepProps) {
  const { t } = useTranslation()
  const f = useFormat()
  const { baseCurrency, currencies } = draft.money
  // Added with the picker and switched off again: still a chip until the step is left.
  const [added, setAdded] = useState<string[]>([])
  const choices = chipCurrencies([baseCurrency, ...currencies], added)
  const accepted = new Set([baseCurrency, ...currencies])
  const full = accepted.size >= MAX_ACCEPTED_CURRENCIES
  const setBase = (code: string): void =>
    update((d) => ({
      ...d,
      money: {
        baseCurrency: code,
        currencies: d.money.currencies.includes(code) ? d.money.currencies : [code, ...d.money.currencies]
      }
    }))
  const toggle = (code: string, on: boolean): void =>
    update((d) => ({
      ...d,
      money: {
        ...d.money,
        currencies: on
          ? choices.filter((c) => c === code || d.money.currencies.includes(c))
          : d.money.currencies.filter((c) => c !== code)
      }
    }))
  const add = (code: string): void => {
    setAdded((a) => (a.includes(code) ? a : [...a, code]))
    update((d) => ({
      ...d,
      money: {
        ...d.money,
        currencies: d.money.currencies.includes(code) ? d.money.currencies : [...d.money.currencies, code]
      }
    }))
  }
  return (
    <div className="grid gap-6">
      <Field
        id={ids.baseCurrency}
        label={t('setup.hotel.baseCurrency')}
        errors={errors}
        hint={t('setup.currencies.baseHint')}
        className="sm:max-w-sm"
      >
        <Select value={baseCurrency} onValueChange={setBase}>
          <SelectTrigger
            id={ids.baseCurrency}
            className="w-full"
            aria-describedby={`${ids.baseCurrency}-hint`}
            data-testid={ids.baseCurrency}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {choices.map((code) => (
              <SelectItem key={code} value={code} disabled={full && !accepted.has(code)}>
                <span className="font-medium tabular-nums" dir="ltr">
                  {code}
                </span>
                <span className="text-muted-foreground">{currencyName(code, f.locale)}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <div
        role="group"
        className="grid gap-2"
        aria-labelledby="setup-currencies-label"
        aria-describedby="setup-currencies-hint"
      >
        {/* The picker sits beside the heading (under it on the phone): always in sight, however many chips. */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <span id="setup-currencies-label" className="text-sm font-medium">
            {t('setup.hotel.currencies')}
          </span>
          <CurrencyPicker
            hidden={choices}
            onPick={add}
            chipId={chipId}
            limitReached={full}
            testId="setup-currency-add"
            className="md:justify-items-end md:text-end"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {choices.map((code) => (
            <ChoiceChip
              key={code}
              id={chipId(code)}
              checked={accepted.has(code)}
              disabled={code === baseCurrency || (full && !accepted.has(code))}
              onChange={(on) => toggle(code, on)}
              testId={`setup-currency-${code}`}
            >
              <span className="font-medium" dir="ltr">
                {code}
              </span>
              <span className="text-muted-foreground">{currencyName(code, f.locale)}</span>
            </ChoiceChip>
          ))}
        </div>
        <FieldMessage id="setup-currencies" hint={t('setup.currencies.acceptedHint')} />
      </div>
    </div>
  )
}
