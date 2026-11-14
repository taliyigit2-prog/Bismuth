// KPI figures of a period and of its comparison period (reports.summary twice; the second only when comparing).
import type { StayKind } from '@shared/contract/procedures/reports'
import type { Period } from '@shared/domain/reports-period'
import { useApiQuery } from '@/lib/api/hooks'

export function useSummaryKpis(period: Period, compare: Period | null, stayKind: StayKind = 'all') {
  // 'all' sends the plain period (the same read every other tab shares).
  const withKind = (p: Period) => (stayKind === 'all' ? p : { ...p, stayKind })
  const current = useApiQuery('reports.summary', withKind(period))
  const previous = useApiQuery('reports.summary', withKind(compare ?? period), { enabled: compare !== null })
  return { current, previous: compare ? previous.data : undefined }
}
