// The hotel's own tags on a reservation (faz-05 madde 7; G-33): several may be chosen ("VIP", "Grup"…). Each chip
// shows the tag's colour and name; the meaning is its tooltip. The automatic statuses are never chosen here.
import { useTranslation } from 'react-i18next'
import { CheckIcon } from 'lucide-react'
import { tagFill } from '@/lib/status-style'
import { useCustomTags } from './use-custom-tags'
import { cn } from '@/lib/utils'

export function TagPicker({
  value,
  onChange,
  disabled = false,
  id
}: {
  value: readonly string[]
  onChange: (tagIds: string[]) => void
  disabled?: boolean
  id?: string
}) {
  const { t } = useTranslation()
  const tags = useCustomTags()
  if (!tags.length) return <p className="text-muted-foreground text-sm">{t('booking.tags.none')}</p>
  const toggle = (tagId: string): void =>
    onChange(value.includes(tagId) ? value.filter((x) => x !== tagId) : [...value, tagId])
  return (
    <div id={id} role="group" aria-label={t('booking.tags.label')} className="flex flex-wrap gap-2">
      {tags.map((tag) => {
        const on = value.includes(tag.id)
        return (
          <button
            key={tag.id}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            title={tag.description ?? undefined}
            onClick={() => toggle(tag.id)}
            data-testid={`tag-${tag.id}`}
            className={cn(
              'focus-visible:ring-ring inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium outline-none focus-visible:ring-[3px] disabled:opacity-60 max-md:min-h-11',
              on ? tagFill(tag.id) : 'bg-background hover:bg-accent'
            )}
          >
            {on ? (
              <CheckIcon className="size-3.5" aria-hidden />
            ) : (
              <span className={cn('size-2.5 rounded-full border', tagFill(tag.id))} aria-hidden />
            )}
            {tag.name}
          </button>
        )
      })}
    </div>
  )
}
