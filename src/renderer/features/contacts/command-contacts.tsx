// Hızlı arama (Ctrl/⌘ K) → the phone book (G-160, faz-12 madde 1): typing "rehber: sucu" or just "sucu" lists the
// matching entries; picking one opens Rehber filtered to it. Read only while the palette is open.
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import { CommandGroup, CommandItem } from '@/components/ui/command'
import { useApiQuery } from '@/lib/api/hooks'
import { useCan } from '@/lib/view-as'
import { CATEGORY_ICONS, categoryLabel } from './categories'

export function ContactsCommandGroup({
  open,
  onRun
}: {
  open: boolean
  onRun: (action: () => void) => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const can = useCan()
  const allowed = can('contacts')
  const contacts = useApiQuery('contacts.list', {}, { enabled: open && allowed, staleTime: 30_000 })
  if (!allowed || !contacts.data?.length) return null
  const prefix = t('command.contactsPrefix')
  return (
    <CommandGroup heading={t('nav.contacts')}>
      {contacts.data.map((c) => {
        const Icon = CATEGORY_ICONS[c.category]
        const label = categoryLabel(t, c)
        return (
          <CommandItem
            key={c.id}
            // cmdk filters on this text: "rehber: <ad> <kategori> <numaralar>".
            value={`${prefix}: ${c.name} ${label} ${c.phones.map((p) => p.number).join(' ')} ${c.id}`}
            keywords={[prefix, label, c.note ?? '']}
            onSelect={() => onRun(() => void navigate({ to: '/contacts', search: { q: c.name } }))}
            data-testid={`command-contact-${c.id}`}
          >
            <Icon aria-hidden />
            <span className="min-w-0 truncate">{c.name}</span>
            <span className="text-muted-foreground ms-auto truncate text-xs">
              {[label, c.phones[0]?.number].filter(Boolean).join(' · ')}
            </span>
          </CommandItem>
        )
      })}
    </CommandGroup>
  )
}
