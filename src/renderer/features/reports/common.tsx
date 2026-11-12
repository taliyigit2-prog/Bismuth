// Small pieces every report tab uses: amounts in <bdi>, the KPI row, notes about rows without a rate or a hidden
// expense section, a shared skeleton and the query wrapper with the report's four states.
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { ChartColumnIcon, InfoIcon, LockIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCan } from '@/lib/view-as'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { QueryView, type QueryLike } from '@/components/query-view'
import { EmptyState } from '@/components/states'
import { useFormat } from '@/hooks/use-format'
import { cn } from '@/lib/utils'

export function Money({
  minor,
  currency,
  strong,
  tone
}: {
  minor: number
  currency: string
  strong?: boolean
  /** warn: an amount waiting for someone (pending, remaining); bad: always red when not zero. */
  tone?: 'warn' | 'bad'
}) {
  const f = useFormat()
  return (
    <bdi
      className={cn(
        'tabular-nums',
        strong && 'font-semibold',
        tone === 'warn' && minor !== 0 && 'text-warning font-medium',
        ((tone === 'bad' && minor !== 0) || minor < 0) && 'text-destructive'
      )}
    >
      {f.money(minor, currency)}
    </bdi>
  )
}

export function KpiRow({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 print:grid-cols-4" data-testid={testId}>
      {children}
    </div>
  )
}

/** Rows left out of the totals (no rate known when written) and a hidden expense section (kısmi görünüm). */
export function DataNotes({
  missing,
  missingNights = 0,
  partial
}: {
  missing?: { payments: number; expenses: number }
  /** Room-night charges in another currency with no rate yet (left out of room revenue, ADR, RevPAR). */
  missingNights?: number
  partial?: boolean
}) {
  const { t } = useTranslation()
  const rows = (missing?.payments ?? 0) + (missing?.expenses ?? 0)
  if (!rows && !partial && !missingNights) return null
  return (
    <Alert data-testid="report-notes">
      <InfoIcon aria-hidden />
      <AlertDescription className="grid gap-1">
        {rows ? <p>{t('reports.notes.missingRate', { count: rows })}</p> : null}
        {missingNights ? <p>{t('reports.notes.missingNightRates', { count: missingNights })}</p> : null}
        {partial ? <p>{t('reports.notes.partial')}</p> : null}
      </AlertDescription>
    </Alert>
  )
}

export function ReportSkeleton() {
  const { t } = useTranslation()
  return (
    <div role="status" aria-busy className="grid gap-4">
      <span className="sr-only">{t('common.loading')}</span>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-hidden>
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-72" aria-hidden />
      <div className="grid gap-4 lg:grid-cols-2" aria-hidden>
        <Skeleton className="h-56" />
        <Skeleton className="h-56" />
      </div>
    </div>
  )
}

/** The way out of an empty report: the ledger, where the first records are written (for roles that may open it). */
export function LedgerLink() {
  const { t } = useTranslation()
  const can = useCan()
  if (!can('ledger')) return null
  return (
    <Button asChild variant="outline">
      <Link to="/ledger">{t('reports.emptyAction')}</Link>
    </Button>
  )
}

/** A report query with the four states; `isEmpty` shows the "no records yet" state. */
export function ReportQuery<T>({
  query,
  isEmpty,
  children
}: {
  query: QueryLike<T>
  isEmpty?: (data: T) => boolean
  children: (data: T) => ReactNode
}) {
  const { t } = useTranslation()
  return (
    <QueryView
      query={query}
      loading={<ReportSkeleton />}
      isEmpty={isEmpty}
      empty={{
        icon: ChartColumnIcon,
        title: t('reports.emptyTitle'),
        body: t('reports.emptyPeriod'),
        action: <LedgerLink />
      }}
    >
      {children}
    </QueryView>
  )
}

export function NoAccess() {
  const { t } = useTranslation()
  return <EmptyState icon={LockIcon} title={t('common.noAccessTitle')} body={t('common.noAccessBody')} />
}
