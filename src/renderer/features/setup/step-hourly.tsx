// Step 7 — hourly stays (K-48, S-102; optional): a room type may carry the price of one hour. It is only a suggestion
// at the hourly sale (the desk types the amount); a hotel that does not sell by the hour leaves every field empty and
// goes on. Ayarlar → Odalar ve tipler holds the same price afterwards.
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { MoneyInput } from '@/components/money-input'
import { useFormat } from '@/hooks/use-format'
import { ids, localName } from './draft'
import { FieldMessage } from './fields'
import type { StepProps } from './step-props'

export function HourlyStep({ draft, update, options, errors }: StepProps) {
  const { t } = useTranslation()
  const f = useFormat()
  const base = draft.money.baseCurrency
  const byId = new Map(options.roomTypes.map((type) => [type.id, type]))
  const rows = [
    ...draft.roomTypes.selected.flatMap((p) => {
      const type = byId.get(p.id)
      return type
        ? [{ key: p.id, custom: false, name: localName(f.locale, type.name, type.nameI18n), ...p }]
        : []
    }),
    ...draft.roomTypes.custom.map((c) => ({ key: c.tempKey, custom: true, ...c }))
  ]
  const setPrice = (key: string, value: number | null): void =>
    update((d) => ({
      ...d,
      roomTypes: {
        selected: d.roomTypes.selected.map((p) => (p.id === key ? { ...p, hourlyPriceMinor: value } : p)),
        custom: d.roomTypes.custom.map((c) => (c.tempKey === key ? { ...c, hourlyPriceMinor: value } : c))
      }
    }))

  return (
    <div className="grid gap-4">
      <p className="text-muted-foreground text-sm">{t('setup.hourly.help')}</p>
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('setup.hourly.noTypes')}</p>
      ) : (
        <ul className="grid gap-2" aria-label={t('setup.hourly.title')} data-testid="setup-hourly-types">
          {rows.map((row) => (
            <li
              key={row.key}
              className="grid gap-2 rounded-lg border p-3 md:grid-cols-[minmax(0,1fr)_14rem] md:items-start"
              data-testid={`setup-hourly-${row.key}`}
            >
              <div className="flex min-w-0 flex-wrap items-center gap-2 md:pt-6">
                <span className="text-sm font-medium break-words">{row.name}</span>
                {row.custom ? (
                  <Badge variant="outline" className="text-muted-foreground">
                    {t('setup.roomTypes.ownType')}
                  </Badge>
                ) : null}
              </div>
              <div className="grid gap-1">
                <MoneyInput
                  id={ids.price(row.key, 'hourly')}
                  label={t('setup.hourly.price')}
                  value={{ amountMinor: row.hourlyPriceMinor, currency: base }}
                  onChange={(v) => setPrice(row.key, v.amountMinor)}
                  currencies={[base]}
                />
                <FieldMessage
                  id={ids.price(row.key, 'hourly')}
                  error={errors[ids.price(row.key, 'hourly')]}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="text-muted-foreground text-xs">{t('setup.hourly.optional')}</p>
    </div>
  )
}
