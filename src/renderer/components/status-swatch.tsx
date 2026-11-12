import type { StatusKey } from '@shared/contract'
import { STATUS_FILL } from '@/lib/status-style'
import { cn } from '@/lib/utils'

export function StatusSwatch({ status, className }: { status: StatusKey; className?: string }) {
  return (
    <span
      data-testid={`swatch-${status}`}
      className={cn('inline-block size-6 shrink-0 rounded-md border', STATUS_FILL[status], className)}
      aria-hidden
    />
  )
}
