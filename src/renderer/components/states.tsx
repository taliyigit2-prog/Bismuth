// Empty / loading / error states every screen uses (.claude/rules/ui.md).
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { AlertTriangleIcon, LockIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { ApiError } from '@/lib/transport/types'

/**
 * Nothing to show. `compact` is the in-card form (a filter or search that matched nothing); `action` offers the way
 * out ("Filtreyi temizle", "Oda ekle").
 */
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  compact = false
}: {
  icon: LucideIcon
  title: string
  body: string
  action?: ReactNode
  compact?: boolean
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed text-center',
        compact ? 'gap-2 px-4 py-8' : 'gap-3 px-6 py-16'
      )}
    >
      <span
        className={cn(
          'bg-accent text-accent-foreground grid place-items-center rounded-full',
          compact ? 'size-9' : 'size-12'
        )}
      >
        <Icon className={compact ? 'size-4' : 'size-6'} aria-hidden />
      </span>
      <h2 className={cn('font-semibold', compact ? 'text-sm' : 'text-base')}>{title}</h2>
      <p className="text-muted-foreground max-w-prose text-sm">{body}</p>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  )
}

/** Card-shaped placeholders, so the page does not jump when the data arrives. */
export function LoadingState({ cards = 2 }: { cards?: number }) {
  const { t } = useTranslation()
  return (
    <div role="status" aria-busy className="grid grid-cols-1 gap-6">
      <span className="sr-only">{t('common.loading')}</span>
      {Array.from({ length: cards }, (_, i) => (
        <div key={i} className="grid gap-4 rounded-xl border p-6" aria-hidden>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-full max-w-md" />
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
    </div>
  )
}

/** A refused request (the role may not see this) says so and offers no retry: trying again changes nothing. */
export function NoAccessState() {
  const { t } = useTranslation()
  return <EmptyState icon={LockIcon} title={t('common.noAccessTitle')} body={t('common.noAccessBody')} />
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useTranslation()
  const apiError = error instanceof ApiError ? error : null
  if (apiError?.code === 'PERMISSION_DENIED') return <NoAccessState />
  const key = (apiError?.messageKey ?? 'errors.loadFailed') as 'errors.loadFailed'
  return (
    <div role="alert" className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <AlertTriangleIcon className="text-destructive size-6" aria-hidden />
      <p className="text-sm">{t(key, { defaultValue: t('errors.loadFailed') })}</p>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          {t('errors.retry')}
        </Button>
      ) : null}
    </div>
  )
}
