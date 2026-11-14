// Portföy verisi (P21c): bütün oteller için özet (`portfolio.overview`) ve seçilen otelin takvimi
// (`portfolio.grid`, ay ay okunur ve önbelleğe alınır; takvim ekranındaki `useGridData` ile aynı kalıp).
import { useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'
import type { PortfolioGrid } from '@shared/contract/procedures/portfolio'
import type { LocalDate } from '@shared/date'
import { useTransport } from '@/lib/api/api-context'
import { useApiQuery } from '@/lib/api/hooks'
import type { ApiError } from '@/lib/transport'
import { mergePages, monthsCovering, type GridModel } from '@/features/calendar/grid-model'

/** Özet yarım dakika taze kalır; sekmeye dönünce yenilenir. */
const STALE_MS = 30_000

export function usePortfolioOverview(period: { from: LocalDate; to: LocalDate }) {
  return useApiQuery('portfolio.overview', period, { staleTime: STALE_MS, retry: false })
}

export interface PortfolioGridData {
  model: GridModel
  /** Takvimin geldiği yer (canlı ya da kopya) ve kopyanın tarihi; ilk yanıta kadar null. */
  source: PortfolioGrid['source'] | null
  syncedAt: string | null
  isPending: boolean
  error: ApiError | null
  refetch: () => void
}

/** Bir otelin [from, to) takvimi, tam aylar halinde. `hotel` null: bu bilgisayarın kendi oteli. */
export function usePortfolioGrid(hotel: string | null, from: LocalDate, to: LocalDate): PortfolioGridData {
  const transport = useTransport()
  const months = useMemo(() => monthsCovering(from, to), [from, to])
  const results = useQueries({
    queries: months.map((range) => ({
      queryKey: ['portfolio.grid', hotel, range],
      queryFn: () => transport.call('portfolio.grid', { hotel, ...range }),
      staleTime: STALE_MS,
      retry: false
    }))
  })
  const answers = results.map((r) => r.data).filter((d): d is PortfolioGrid => !!d)
  const key = answers.map((a) => `${a.grid.from}|${a.grid.to}|${a.grid.stays.length}`).join(',')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const model = useMemo(() => mergePages(answers.map((a) => a.grid)), [key])
  const failed = results.find((r) => r.isError)
  return {
    model,
    source: answers[0]?.source ?? null,
    syncedAt: answers[0]?.syncedAt ?? null,
    isPending: results.every((r) => r.isPending),
    error: !answers.length && failed ? (failed.error as ApiError) : null,
    refetch: () => {
      for (const r of results) void r.refetch()
    }
  }
}
