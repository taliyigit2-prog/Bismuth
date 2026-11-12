// "Misafir ara → sonuca atla" (faz-05 madde 6): name, phone or reservation code; picking a match scrolls the grid
// to the stay, puts the cursor on it and makes the bar pulse for a moment.
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SearchIcon } from 'lucide-react'
import type { ProcedureOutput } from '@shared/contract'
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
import { useFormat } from '@/hooks/use-format'
import { useApiQuery } from '@/lib/api/hooks'

export type FoundStayView = ProcedureOutput<'reservations.findStays'>[number]

/** Waits until typing pauses before asking the main computer. */
function useDebounced(value: string, ms = 250): string {
  const [out, setOut] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setOut(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return out
}

export function GuestJump({ onPick }: { onPick: (stay: FoundStayView) => void }) {
  const { t } = useTranslation()
  const f = useFormat()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const q = useDebounced(query.trim())
  const search = useApiQuery('reservations.findStays', { query: q }, { enabled: open && q.length >= 2 })
  const results = q.length >= 2 ? (search.data ?? []) : []
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setQuery('')
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" aria-expanded={open}>
          <SearchIcon aria-hidden />
          {t('calendar.find.button')}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <Command shouldFilter={false} label={t('calendar.find.button')}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder={t('calendar.find.placeholder')}
            aria-label={t('calendar.find.placeholder')}
            maxLength={80}
          />
          <CommandList>
            {q.length < 2 ? (
              <p className="text-muted-foreground px-3 py-4 text-sm">{t('calendar.find.hint')}</p>
            ) : search.isPending ? (
              <p className="text-muted-foreground px-3 py-4 text-sm" role="status">
                {t('common.loading')}
              </p>
            ) : search.isError ? (
              <p className="text-destructive px-3 py-4 text-sm" role="alert">
                {t('errors.loadFailed')}
              </p>
            ) : (
              <CommandEmpty>{t('calendar.find.none')}</CommandEmpty>
            )}
            {results.length ? (
              <CommandGroup>
                {results.map((s) => (
                  <CommandItem
                    key={s.stayId}
                    value={s.stayId}
                    onSelect={() => {
                      setOpen(false)
                      setQuery('')
                      onPick(s)
                    }}
                  >
                    <span className="bg-muted grid size-8 shrink-0 place-items-center rounded-md text-xs font-semibold tabular-nums">
                      {s.roomNumber}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{s.guestName}</span>
                      <span className="text-muted-foreground block text-xs whitespace-nowrap">
                        {f.dayMonth(s.checkIn)} – {f.dayMonth(s.checkOut)} · {s.checkIn.slice(0, 4)} ·{' '}
                        <span dir="ltr">{s.code}</span>
                      </span>
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
