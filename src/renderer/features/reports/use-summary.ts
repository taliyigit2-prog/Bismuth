// KPI figures of a period and of its comparison period (reports.summary twice; the second only when comparing).
import type { Period } from '@shared/domain/reports-period'
import { useApiQuery } from '@/lib/api/hooks'

export function useSummaryKpis(period: Period, compare: Period | null) {
  const current = useApiQuery('reports.summary', period)
  const previous = useApiQuery('reports.summary', compare ?? period, { enabled: compare !== null })
  return { current, previous: compare ? previous.data : undefined }
}
