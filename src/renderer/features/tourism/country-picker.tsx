// Country for a KBS spelling that is not matched by itself (K-36: typo, "KIBRIS", "CYPRUS", a former country):
// the suggestions first, then every country found by typing (the ministry panel has a type-ahead box, no list).
// Desktop: a popover under the button; phone: a bottom sheet.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronsUpDownIcon } from 'lucide-react'
import type { TourismCountryOption } from '@shared/contract/tourism'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { useIsMobile } from '@/hooks/use-mobile'
import { matchCountries } from './derive'

export function CountryPicker({
  raw,
  suggestions,
  countries,
  onPick,
  disabled,
  label: ownLabel,
  testId
}: {
  raw: string
  suggestions: readonly TourismCountryOption[]
  countries: readonly TourismCountryOption[]
  onPick: (country: TourismCountryOption) => void
  disabled?: boolean
  /** Accessible name when `raw` says nothing (a row with no nationality at all). */
  label?: string
  testId?: string
}) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const label = ownLabel ?? t('tourism.review.choose', { raw })
  // Without a query the suggestions stand on their own above the list, so the list leaves them out.
  const suggested = new Set(query ? [] : suggestions.map((c) => c.iso2))
  const shown = matchCountries(countries, query).filter((c) => !suggested.has(c.iso2))
  const onOpenChange = (next: boolean): void => {
    setOpen(next)
    if (!next) setQuery('')
  }
  const pick = (c: TourismCountryOption): void => {
    onOpenChange(false)
    onPick(c)
  }
  const button = (
    <Button
      type="button"
      variant="outline"
      className="justify-between max-md:w-full md:min-w-56"
      aria-label={label}
      disabled={disabled}
      data-testid={testId ?? `country-picker-${raw}`}
    >
      <span className="text-muted-foreground">{t('tourism.review.choosePlaceholder')}</span>
      <ChevronsUpDownIcon aria-hidden className="opacity-60" />
    </Button>
  )
  const list = (
    <Command shouldFilter={false} label={label} className={isMobile ? 'h-auto' : undefined}>
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder={t('tourism.review.search')}
        data-testid="country-search"
      />
      <CommandList className="max-md:max-h-[min(55dvh,24rem)]">
        <CommandEmpty>{t('tourism.review.noMatch')}</CommandEmpty>
        {suggestions.length > 0 && !query ? (
          <CommandGroup heading={t('tourism.review.suggestions')}>
            {suggestions.map((c) => (
              <CommandItem key={`s-${c.iso2}`} value={`s-${c.iso2}`} onSelect={() => pick(c)}>
                {c.name}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
        <CommandGroup heading={query ? undefined : t('tourism.review.allCountries')}>
          {shown.map((c) => (
            <CommandItem
              key={c.iso2}
              value={c.iso2}
              onSelect={() => pick(c)}
              data-testid={`country-option-${c.iso2}`}
            >
              {c.name}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  )
  return isMobile ? (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>{button}</SheetTrigger>
      <SheetContent
        side="bottom"
        className="max-h-[85dvh] gap-0 rounded-t-xl pb-[env(safe-area-inset-bottom)]"
        aria-describedby={undefined}
      >
        <SheetHeader className="pe-14 text-start">
          <SheetTitle>{label}</SheetTitle>
        </SheetHeader>
        <div className="min-h-0 flex-1 px-4 pb-4">{list}</div>
      </SheetContent>
    </Sheet>
  ) : (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{button}</PopoverTrigger>
      <PopoverContent className="w-80 max-w-[calc(100vw-2rem)] p-0" align="start" collisionPadding={16}>
        {list}
      </PopoverContent>
    </Popover>
  )
}
