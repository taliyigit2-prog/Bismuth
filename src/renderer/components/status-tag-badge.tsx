// A status or tag chip (G-32, G-33): automatic statuses use `--status-*`, custom tags their class colour.
import type { StatusKey } from '@shared/contract'
import { STATUS_FILL, tagFill } from '@/lib/status-style'
import { cn } from '@/lib/utils'

export type BadgeSubject = { kind: 'auto'; code: StatusKey } | { kind: 'custom'; tagId: string }

export function StatusTagBadge({
  subject,
  label,
  className
}: {
  subject: BadgeSubject
  label: string
  className?: string
}) {
  const fill = subject.kind === 'auto' ? STATUS_FILL[subject.code] : tagFill(subject.tagId)
  return (
    <span
      data-testid={subject.kind === 'auto' ? `badge-${subject.code}` : `badge-tag-${subject.tagId}`}
      className={cn(
        'border-foreground/15 inline-flex max-w-full items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        fill,
        className
      )}
    >
      <span className="truncate">{label}</span>
    </span>
  )
}
