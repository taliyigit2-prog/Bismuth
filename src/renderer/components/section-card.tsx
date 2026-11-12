// A titled block of a page (Bugün, devir özeti, raporlar): icon, title, an optional count and one action
// (usually "Tümü" → the full screen). The same card on the desktop grid and the phone stack.
import { useId, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export function SectionCard({
  title,
  icon: Icon,
  count,
  tone = 'default',
  action,
  children,
  className,
  testId
}: {
  title: string
  icon?: LucideIcon
  count?: number
  /** `warn` draws attention (KBS gaps, overdue): the count badge turns destructive. */
  tone?: 'default' | 'warn'
  action?: ReactNode
  children: ReactNode
  className?: string
  testId?: string
}) {
  const id = useId()
  return (
    <Card
      className={cn('min-w-0 gap-3 py-4', className)}
      data-testid={testId}
      role="region"
      aria-labelledby={id}
    >
      {/* A long title (Russian) wraps instead of being cut; on a narrow card the action drops under it. The
          action's negative margin keeps the header 32 px high; when it wraps, gap-y-3 keeps it off the title. */}
      <CardHeader className="flex min-h-8 flex-wrap items-center gap-x-2 gap-y-3 px-4">
        <CardTitle id={id} className="flex min-w-0 flex-1 basis-40 items-center gap-2 text-sm">
          {Icon ? <Icon className="text-muted-foreground size-4 shrink-0" aria-hidden /> : null}
          <span className="min-w-0 break-words">{title}</span>
          {count !== undefined ? (
            <Badge
              variant={tone === 'warn' && count > 0 ? 'destructive' : 'secondary'}
              className="tabular-nums"
            >
              {count}
            </Badge>
          ) : null}
        </CardTitle>
        {action ? <div className="-my-2 shrink-0">{action}</div> : null}
      </CardHeader>
      <CardContent className="min-w-0 px-4">{children}</CardContent>
    </Card>
  )
}
