// Calendar data over the real service (faz-05 teknik not: room_nights range reads, cached, re-read on change):
// the grid is read month by month around what is on screen; every month is its own cached query
// (`reservations.grid`), so scrolling back is instant and a write that invalidates `reservations.grid` refreshes
// exactly the months in use.
import { useMemo, useState } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import type { LocalDate } from '@shared/date'
import type { CalendarYears } from '@shared/domain/calendar-range'
import { useTransport } from '@/lib/api/api-context'
import { queryKey } from '@/lib/api/hooks'
import type { ApiError } from '@/lib/transport'
import { defaultYears, mergePages, monthsCovering, type GridModel, type GridPage } from './grid-model'

const ids = new WeakMap<object, number>()
let nextId = 0
/** A number per data object (the same answer object keeps its number). */
function identity(page: object): number {
  let id = ids.get(page)
  if (id === undefined) ids.set(page, (id = ++nextId))
  return id
}

/** Grid data stays fresh for half a minute; writes invalidate it at once. */
const STALE_MS = 30_000

export interface GridData {
  model: GridModel
  /** Nothing loaded yet. */
  isPending: boolean
  /** The first month failed (the screen shows the error with a retry). */
  error: ApiError | null
  refetch: () => void
}

/**
 * The grid's years (G-31, `calendar.bounds`): null until the first answer; a refusal or a failure falls back to
 * last year … ten years on. Kept under the grid's own query key, so every write that refreshes the grid (a stay
 * booked twelve years on, an import) reads the years again too; read afresh each time the calendar opens (a new
 * start year from the settings).
 */
export function useGridYears(today: LocalDate): CalendarYears | null {
  const transport = useTransport()
  const query = useQuery({
    queryKey: ['reservations.grid', 'calendar.bounds'],
    queryFn: () => transport.call('calendar.bounds', {}),
    staleTime: 0,
    retry: false
  })
  return query.data ?? (query.isError ? defaultYears(today) : null)
}

/** The grid of [from, to), read as whole months. */
export function useGridData(from: LocalDate, to: LocalDate): GridData {
  const transport = useTransport()
  const months = useMemo(() => monthsCovering(from, to), [from, to])
  const results = useQueries({
    queries: months.map((range) => ({
      queryKey: queryKey('reservations.grid', range),
      queryFn: () => transport.call('reservations.grid', range),
      staleTime: STALE_MS
    }))
  })
  // One model per set of month answers: rebuilt only when a month's data object changes (a refetch with new data
  // or another month), not when a query merely starts or stops fetching.
  const pages = results.map((r) => r.data).filter((d): d is GridPage => !!d)
  const key = pages.map(identity).join('|')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fresh = useMemo(() => mergePages(pages), [key])
  // After a long jump every month is new and loading: the rooms (and the grid with its scroll position) stay
  // from the last answer until the new months arrive.
  const [kept, setKept] = useState<GridModel | null>(null)
  if (fresh.rooms.length > 0 && kept !== fresh) setKept(fresh)
  const model = fresh.rooms.length > 0 || !kept ? fresh : kept
  const failed = results.find((r) => r.isError)
  return {
    model,
    isPending: !kept && results.every((r) => r.isPending),
    error: !results.some((r) => r.data) && failed ? (failed.error as ApiError) : null,
    refetch: () => {
      for (const r of results) void r.refetch()
    }
  }
}
