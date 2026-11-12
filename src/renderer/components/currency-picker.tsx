// "Add another currency" (wizard step 4, Ayarlar → Otel): a searchable list of every currency the platform knows,
// found by code or by name in the UI language. Codes already shown as chips are left out. Desktop: a popover under
// the button; phone: a bottom sheet (the keyboard and the thumb both reach it). When the hotel is at the limit
// the button is off and says why.
// After a pick the focus moves to the new chip (the list it was added to; `chipId` says which element), the chip is
// scrolled into view and a polite live region says what was added. Closed without a pick, the focus goes back to the
// button (Radix returns it to the trigger, in the popover and in the sheet alike).
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PlusIcon } from 'lucide-react'
import { MAX_ACCEPTED_CURRENCIES } from '@shared/contract'
import { isAppLocale } from '@shared/format'
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
import { allCurrencies, currencyName, matchCurrencies } from '@/lib/currencies'
import { cn } from '@/lib/utils'

export function CurrencyPicker({
  hidden,
  onPick,
  chipId,
  limitReached = false,
  testId = 'currency-picker',
  className
}: {
  /** Codes already shown as chips. */
  hidden: readonly string[]
  onPick: (code: string) => void
  /** DOM id of the control standing for a currency in the list `onPick` adds it to; the focus moves there after a pick. */
  chipId?: (code: string) => string
  /** The hotel accepts as many currencies as it can: nothing more can be added until one is switched off. */
  limitReached?: boolean
  testId?: string
  className?: string
}) {
  const { t, i18n } = useTranslation()
  const lang = isAppLocale(i18n.language) ? i18n.language : 'tr'
  const isMobile = useIsMobile()
  const hintId = useId()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [announcement, setAnnouncement] = useState('')
  const picked = useRef<string | null>(null)
  const options = useMemo(() => allCurrencies(lang), [lang])
  const shown = matchCurrencies(options, query, hidden)
  const onOpenChange = (next: boolean): void => {
    setOpen(next)
    if (!next) setQuery('')
  }
  const pick = (code: string): void => {
    picked.current = code
    onPick(code)
    onOpenChange(false)
  }
  // The sheet (and the popover) have gone and the page is readable again: the new chip takes the focus and is brought
  // into view (on the phone it lands below the fold), and the live region says what was added. Without a pick nothing
  // is intercepted and Radix returns the focus to the button.
  const onCloseAutoFocus = (event: Event): void => {
    const code = picked.current
    picked.current = null
    if (code === null) return
    event.preventDefault()
    const chip = chipId ? document.getElementById(chipId(code)) : null
    if (chip) {
      chip.focus({ preventScroll: true })
      // The whole row, not just its checkbox, comes into view (the page's scroll padding keeps it above fixed bars).
      const row = chip.closest('label') ?? chip
      row.scrollIntoView({ block: 'nearest' })
    } else buttonRef.current?.focus()
    setAnnouncement(t('common.currencyPicker.added', { name: currencyName(code, lang) }))
  }
  // The message is read once; it does not stay on the page for the reading cursor to find later.
  useEffect(() => {
    if (announcement === '') return
    const timer = setTimeout(() => setAnnouncement(''), 6000)
    return () => clearTimeout(timer)
  }, [announcement])
  const label = t('common.currencyPicker.add')
  const button = (
    <Button
      ref={buttonRef}
      type="button"
      variant="outline"
      className="max-md:w-full md:w-fit"
      disabled={limitReached}
      aria-describedby={limitReached ? hintId : undefined}
      data-testid={testId}
    >
      <PlusIcon aria-hidden />
      {label}
    </Button>
  )
  const list = (
    <Command shouldFilter={false} label={label} className={isMobile ? 'h-auto' : undefined}>
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder={t('common.currencyPicker.search')}
        data-testid={`${testId}-search`}
      />
      <CommandList className="max-md:max-h-[min(55dvh,24rem)]">
        <CommandEmpty>{t('common.currencyPicker.none')}</CommandEmpty>
        <CommandGroup>
          {shown.map((o) => (
            <CommandItem
              key={o.code}
              value={o.code}
              onSelect={() => pick(o.code)}
              data-testid={`${testId}-${o.code}`}
            >
              <span className="w-10 shrink-0 font-medium tabular-nums" dir="ltr">
                {o.code}
              </span>
              <span className="text-muted-foreground min-w-0">{o.name}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  )
  return (
    <div className={cn('grid gap-1.5 max-md:w-full', className)}>
      {isMobile ? (
        <Sheet open={open} onOpenChange={onOpenChange}>
          <SheetTrigger asChild>{button}</SheetTrigger>
          <SheetContent
            side="bottom"
            className="max-h-[85dvh] gap-0 rounded-t-xl pb-[env(safe-area-inset-bottom)]"
            aria-describedby={undefined}
            onCloseAutoFocus={onCloseAutoFocus}
            // The wizard keeps a focused field above its Geri / İleri bar; the sheet is not part of that page.
            onFocus={(e) => e.stopPropagation()}
          >
            <SheetHeader className="pe-14 text-start">
              <SheetTitle>{label}</SheetTitle>
            </SheetHeader>
            {list}
          </SheetContent>
        </Sheet>
      ) : (
        <Popover open={open} onOpenChange={onOpenChange}>
          <PopoverTrigger asChild>{button}</PopoverTrigger>
          <PopoverContent
            className="w-96 max-w-[calc(100vw-2rem)] p-0"
            align="end"
            collisionPadding={16}
            onCloseAutoFocus={onCloseAutoFocus}
          >
            {list}
          </PopoverContent>
        </Popover>
      )}
      <p role="status" className="sr-only" data-testid={`${testId}-announce`}>
        {announcement}
      </p>
      {limitReached ? (
        <p id={hintId} className="text-muted-foreground max-w-sm text-xs" data-testid={`${testId}-limit`}>
          {t('common.currencyPicker.limit', { max: MAX_ACCEPTED_CURRENCIES })}
        </p>
      ) : null}
    </div>
  )
}
