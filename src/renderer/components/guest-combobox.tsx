// Guest search for a reservation (G-50, tek giriş G-60): name or phone matches the guest list (normalised, Turkish
// letters folded), shows how often they stayed; a new name becomes a new guest card instead of a duplicate.
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckIcon, ChevronsUpDownIcon, CrownIcon, UserPlusIcon } from 'lucide-react'
import { normalizeName, normalizePhone } from '@shared/domain/normalize'
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
import { cn } from '@/lib/utils'

export interface ComboGuest {
  id: string
  name: string
  phone: string | null
  nationality: string | null
  stays: number
  vip: boolean
}

/** Guests whose normalised name or phone contains the typed text (at most `limit`). */
export function matchGuests(guests: readonly ComboGuest[], query: string, limit = 8): ComboGuest[] {
  const q = normalizeName(query)
  const digits = query.replace(/\D/g, '')
  if (!q && !digits) return guests.slice(0, limit)
  return guests
    .filter(
      (g) =>
        (q && normalizeName(g.name).includes(q)) ||
        (digits.length >= 3 && g.phone && (normalizePhone(g.phone) ?? '').includes(digits))
    )
    .slice(0, limit)
}

export function GuestCombobox({
  guests,
  value,
  onChange,
  onCreate,
  label,
  onQueryChange,
  selectedName,
  remote = false
}: {
  guests: ComboGuest[]
  value: string | null
  onChange: (guestId: string) => void
  onCreate: (name: string) => void
  label: string
  /** Server-side search (G-51): the typed text goes to the caller, which passes the matches back as `guests`. */
  onQueryChange?: (query: string) => void
  /** Name of the chosen guest when it is no longer among `guests` (a remote search moved on). */
  selectedName?: string
  /** `guests` already matched by the caller: shown as they are, not filtered again here. */
  remote?: boolean
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [query, setQueryState] = useState('')
  const setQuery = (q: string): void => {
    setQueryState(q)
    onQueryChange?.(q)
  }
  const selected = guests.find((g) => g.id === value)
  const shown = useMemo(() => (remote ? guests : matchGuests(guests, query)), [guests, query, remote])
  const selectedLabel = selected?.name ?? (value ? selectedName : undefined)
  return (
    <div className="grid min-w-0 gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-label={label}
            className={cn(
              'border-input w-full justify-between font-normal',
              !selectedLabel && 'text-muted-foreground'
            )}
          >
            <span className="truncate">{selectedLabel ?? t('guestCombo.placeholder')}</span>
            <ChevronsUpDownIcon className="opacity-50" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) min-w-72 p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput value={query} onValueChange={setQuery} placeholder={t('guestCombo.search')} />
            <CommandList>
              <CommandEmpty>{t('guestCombo.none')}</CommandEmpty>
              <CommandGroup>
                {shown.map((g) => (
                  <CommandItem
                    key={g.id}
                    value={g.id}
                    onSelect={() => {
                      onChange(g.id)
                      setOpen(false)
                    }}
                  >
                    <CheckIcon className={cn(g.id === value ? 'opacity-100' : 'opacity-0')} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1 truncate font-medium">
                        {g.name}
                        {g.vip ? (
                          <CrownIcon className="text-warning size-3.5" aria-label={t('guestCombo.vip')} />
                        ) : null}
                      </span>
                      <span className="text-muted-foreground block truncate text-xs" dir="ltr">
                        {[g.phone, g.nationality].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    {g.stays > 0 ? (
                      <span className="text-muted-foreground text-xs tabular-nums">
                        {t('guestCombo.stays', { count: g.stays })}
                      </span>
                    ) : null}
                  </CommandItem>
                ))}
              </CommandGroup>
              {query.trim() ? (
                <CommandGroup>
                  <CommandItem
                    value="__new__"
                    onSelect={() => {
                      onCreate(query.trim())
                      setOpen(false)
                    }}
                  >
                    <UserPlusIcon aria-hidden />
                    <span>{t('guestCombo.create', { name: query.trim() })}</span>
                  </CommandItem>
                </CommandGroup>
              ) : null}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}
