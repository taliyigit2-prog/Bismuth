// Step 5 — room types (G-11, G-48): the long seeded list grouped and searchable (names in the UI language), many
// can be picked; every chosen type gets a suggested nightly rate and an optional weekend / special-day rate. The
// hotel may add its own types (a temporary key ties them to rooms until setup creates them).
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SearchIcon, XIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MoneyInput } from '@/components/money-input'
import { useFormat } from '@/hooks/use-format'
import { describe } from './aria'
import { ids, localName, newKey, refKey, type RoomTypeRef, type WizardDraft } from './draft'
import { AddName, ChoiceChip, FieldMessage, SectionTitle } from './fields'
import type { StepProps } from './step-props'

const GROUPS = ['occupancy', 'tier', 'suite', 'view', 'building', 'feature', 'custom'] as const

/** After a type leaves the list, the room generator falls back to the first type still chosen. */
function withGenerator(d: WizardDraft): WizardDraft {
  const chosen: RoomTypeRef[] = [
    ...d.roomTypes.selected.map((p) => ({ id: p.id })),
    ...d.roomTypes.custom.map((c) => ({ tempKey: c.tempKey }))
  ]
  const current = d.generator.roomType
  const stillThere = current && chosen.some((r) => refKey(r) === refKey(current))
  return stillThere ? d : { ...d, generator: { ...d.generator, roomType: chosen[0] ?? null } }
}

export function RoomTypesStep({ draft, update, options, errors }: StepProps) {
  const { t } = useTranslation()
  const f = useFormat()
  const [query, setQuery] = useState('')
  const base = draft.money.baseCurrency
  const currencies = [base]
  const byId = new Map(options.roomTypes.map((type) => [type.id, type]))
  const picked = new Set(draft.roomTypes.selected.map((p) => p.id))
  const needle = query.trim().toLocaleLowerCase(f.locale)
  const matches = options.roomTypes.filter(
    (type) =>
      !needle ||
      [type.name, type.code, ...Object.values(type.nameI18n ?? {})].some((n) =>
        n?.toLocaleLowerCase(f.locale).includes(needle)
      )
  )
  const chosenCount = draft.roomTypes.selected.length + draft.roomTypes.custom.length

  const toggle = (id: string, on: boolean): void =>
    update((d) => {
      const selected = on
        ? [
            ...d.roomTypes.selected,
            { id, basePriceMinor: null, weekendPriceMinor: null, hourlyPriceMinor: null }
          ]
        : d.roomTypes.selected.filter((p) => p.id !== id)
      const next = { ...d, roomTypes: { ...d.roomTypes, selected } }
      return on && !d.generator.roomType
        ? { ...next, generator: { ...d.generator, roomType: { id } } }
        : withGenerator(next)
    })
  const setPrice = (key: string, field: 'basePriceMinor' | 'weekendPriceMinor', value: number | null): void =>
    update((d) => ({
      ...d,
      roomTypes: {
        selected: d.roomTypes.selected.map((p) => (p.id === key ? { ...p, [field]: value } : p)),
        custom: d.roomTypes.custom.map((c) => (c.tempKey === key ? { ...c, [field]: value } : c))
      }
    }))
  const addCustom = (name: string): void =>
    update((d) => {
      const tempKey = newKey()
      const next = {
        ...d,
        roomTypes: {
          ...d.roomTypes,
          custom: [
            ...d.roomTypes.custom,
            { tempKey, name, basePriceMinor: null, weekendPriceMinor: null, hourlyPriceMinor: null }
          ]
        }
      }
      return d.generator.roomType ? next : { ...next, generator: { ...d.generator, roomType: { tempKey } } }
    })
  const removeCustom = (tempKey: string): void =>
    update((d) =>
      withGenerator({
        ...d,
        roomTypes: { ...d.roomTypes, custom: d.roomTypes.custom.filter((c) => c.tempKey !== tempKey) }
      })
    )
  const renameCustom = (tempKey: string, name: string): void =>
    update((d) => ({
      ...d,
      roomTypes: {
        ...d.roomTypes,
        custom: d.roomTypes.custom.map((c) => (c.tempKey === tempKey ? { ...c, name } : c))
      }
    }))

  const rows = [
    ...draft.roomTypes.selected.flatMap((p) => {
      const type = byId.get(p.id)
      return type
        ? [{ key: p.id, custom: false, name: localName(f.locale, type.name, type.nameI18n), ...p }]
        : []
    }),
    ...draft.roomTypes.custom.map((c) => ({ key: c.tempKey, custom: true, ...c }))
  ]
  const allNames = [
    ...options.roomTypes.map((type) => localName(f.locale, type.name, type.nameI18n)),
    ...draft.roomTypes.custom.map((c) => c.name)
  ]

  return (
    <div className="grid gap-6">
      <section className="grid gap-3" aria-labelledby="setup-chosen-types">
        <SectionTitle
          aside={
            chosenCount > 0 ? (
              <Badge variant="secondary">{t('setup.roomTypes.selectedCount', { count: chosenCount })}</Badge>
            ) : null
          }
        >
          <span id="setup-chosen-types">{t('setup.roomTypes.chosen')}</span>
        </SectionTitle>
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('setup.roomTypes.noneChosen')}</p>
        ) : (
          <ul className="grid gap-2" data-testid="setup-chosen-types">
            {rows.map((row) => (
              <li
                key={row.key}
                className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-3 rounded-lg border p-3 md:grid-cols-[minmax(0,1fr)_12rem_12rem_auto] md:items-start"
                data-testid={`setup-chosen-${row.key}`}
              >
                <div className="flex min-w-0 items-start md:pt-6">
                  {row.custom ? (
                    <div className="grid min-w-0 flex-1 gap-1">
                      <Label htmlFor={ids.customType(row.key)} className="sr-only">
                        {t('setup.roomTypes.customName')}
                      </Label>
                      <Input
                        id={ids.customType(row.key)}
                        value={row.name}
                        maxLength={80}
                        onChange={(e) => renameCustom(row.key, e.target.value)}
                        {...describe(ids.customType(row.key), errors)}
                      />
                      <Badge variant="outline" className="text-muted-foreground">
                        {t('setup.roomTypes.ownType')}
                      </Badge>
                      <FieldMessage id={ids.customType(row.key)} error={errors[ids.customType(row.key)]} />
                    </div>
                  ) : (
                    <span className="min-w-0 flex-1 pt-2 text-sm font-medium">{row.name}</span>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="md:order-last md:mt-6"
                  aria-label={t('setup.remove', { name: row.name })}
                  onClick={() => (row.custom ? removeCustom(row.key) : toggle(row.key, false))}
                >
                  <XIcon aria-hidden />
                </Button>
                <div className="grid gap-1 max-md:col-span-2">
                  <MoneyInput
                    id={ids.price(row.key, 'base')}
                    label={t('setup.rooms.price')}
                    value={{ amountMinor: row.basePriceMinor, currency: base }}
                    onChange={(v) => setPrice(row.key, 'basePriceMinor', v.amountMinor)}
                    currencies={currencies}
                  />
                  <FieldMessage id={ids.price(row.key, 'base')} error={errors[ids.price(row.key, 'base')]} />
                </div>
                <div className="grid gap-1 max-md:col-span-2">
                  <MoneyInput
                    id={ids.price(row.key, 'weekend')}
                    label={t('setup.rooms.weekendPrice')}
                    value={{ amountMinor: row.weekendPriceMinor, currency: base }}
                    onChange={(v) => setPrice(row.key, 'weekendPriceMinor', v.amountMinor)}
                    currencies={currencies}
                  />
                  <FieldMessage
                    id={ids.price(row.key, 'weekend')}
                    error={errors[ids.price(row.key, 'weekend')]}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="text-muted-foreground text-xs">{t('setup.roomTypes.priceHint')}</p>
        <div className="grid gap-1.5">
          <span className="text-sm font-medium">{t('setup.roomTypes.custom')}</span>
          <AddName
            id="setup-custom-type"
            label={t('setup.roomTypes.custom')}
            placeholder={t('setup.roomTypes.customPlaceholder')}
            existing={allNames}
            onAdd={addCustom}
          />
        </div>
      </section>

      <section className="grid gap-3" aria-labelledby="setup-type-catalog">
        <SectionTitle>
          <span id="setup-type-catalog">{t('setup.roomTypes.catalog')}</span>
        </SectionTitle>
        <div className="relative sm:max-w-sm">
          <Label htmlFor={ids.roomTypes} className="sr-only">
            {t('setup.roomTypes.search')}
          </Label>
          <SearchIcon
            className="text-muted-foreground pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            id={ids.roomTypes}
            type="search"
            value={query}
            placeholder={t('setup.roomTypes.search')}
            autoComplete="off"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.preventDefault()
            }}
            className="ps-9"
            data-testid="setup-type-search"
            {...describe(ids.roomTypes, errors)}
          />
        </div>
        <FieldMessage id={ids.roomTypes} error={errors[ids.roomTypes]} />
        {matches.length === 0 ? (
          <p className="text-muted-foreground text-sm" role="status">
            {t('common.noMatchTitle')}
          </p>
        ) : (
          GROUPS.map((group) => {
            const types = matches.filter((type) => type.group === group)
            if (types.length === 0) return null
            return (
              <div key={group} className="grid gap-2">
                <h4 className="text-muted-foreground text-xs font-medium">
                  {t(`setup.roomTypes.group.${group}`)}
                </h4>
                <div className="flex flex-wrap gap-2">
                  {types.map((type) => (
                    <ChoiceChip
                      key={type.id}
                      checked={picked.has(type.id)}
                      onChange={(on) => toggle(type.id, on)}
                      testId={`setup-type-${type.code}`}
                    >
                      {localName(f.locale, type.name, type.nameI18n)}
                    </ChoiceChip>
                  ))}
                </div>
              </div>
            )
          })
        )}
      </section>
    </div>
  )
}
