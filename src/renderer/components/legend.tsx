// Calendar legend (G-33 "lejant"): what each colour means, automatic statuses first, then the hotel's tags.
import { useTranslation } from 'react-i18next'
import type { StatusKey } from '@shared/contract'
import { STATUS_FILL, tagFill } from '@/lib/status-style'
import { cn } from '@/lib/utils'

export interface LegendItem {
  id: string
  subject: { kind: 'auto'; code: StatusKey } | { kind: 'custom'; tagId: string }
  label: string
  description?: string | null
  /** Custom tags drawn as the bar border rather than the fill. */
  asBorder?: boolean
}

export function Legend({ items, className }: { items: LegendItem[]; className?: string }) {
  const { t } = useTranslation()
  return (
    <section
      aria-label={t('legend.title')}
      className={cn('flex flex-wrap items-center gap-x-4 gap-y-2', className)}
    >
      <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {t('legend.title')}
      </h2>
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-2" data-testid="legend">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex items-center gap-1.5 text-xs"
            title={item.description ?? undefined}
          >
            <span
              aria-hidden
              className={cn(
                'border-foreground/20 inline-block size-3.5 shrink-0 rounded-sm border',
                item.subject.kind === 'auto' ? STATUS_FILL[item.subject.code] : tagFill(item.subject.tagId),
                item.asBorder && 'border-tag border-2 bg-transparent'
              )}
            />
            <span>{item.label}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
