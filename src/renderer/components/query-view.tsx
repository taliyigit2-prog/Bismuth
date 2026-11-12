// The three states every screen has (.claude/rules/ui.md): loading, error with retry, empty — then the data.
// Works for the Faz 3 demo source (`useDemo`) and the real procedures (`useApiQuery`) alike.
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { EmptyState, ErrorState, LoadingState } from './states'

export interface QueryLike<T> {
  data: T | undefined
  isPending: boolean
  isError: boolean
  error: unknown
  refetch: () => unknown
}

export function QueryView<T>({
  query,
  isEmpty,
  empty,
  loading,
  children
}: {
  query: QueryLike<T>
  /** When true, `empty` is shown instead of the data. */
  isEmpty?: (data: T) => boolean
  empty?: { icon: LucideIcon; title: string; body: string; action?: ReactNode }
  /** A placeholder shaped like the page (defaults to two skeleton cards). */
  loading?: ReactNode
  children: (data: T) => ReactNode
}) {
  if (query.isPending) return loading ?? <LoadingState />
  if (query.isError || query.data === undefined)
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />
  if (empty && isEmpty?.(query.data)) return <EmptyState {...empty} />
  return <>{children(query.data)}</>
}
