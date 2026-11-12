// The Faz 3 "fake service": screens read the demo hotel through TanStack Query, exactly like they will read
// the real procedures (`useApiQuery`) from Faz 4 on — so loading, empty and error states are real states.
// Tests swap the source (empty hotel, failing source) with <DemoProvider>.
import { createContext, useContext, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { today, type LocalDate } from '@shared/date'
import { createDemoHotel } from './demo-hotel'
import type { DemoHotel } from './types'

export interface DemoSource {
  hotel(): Promise<DemoHotel>
}

let cached: { day: LocalDate; hotel: DemoHotel } | null = null

/** One demo hotel per day, generated on first use. */
export function demoHotel(day: LocalDate = today()): DemoHotel {
  if (!cached || cached.day !== day) cached = { day, hotel: createDemoHotel(day) }
  return cached.hotel
}

const defaultSource: DemoSource = {
  hotel: () => new Promise((resolve) => setTimeout(() => resolve(demoHotel()), 40))
}

/** A hotel with no records at all: every screen's empty state. */
export function emptyHotel(day: LocalDate = today()): DemoHotel {
  const full = demoHotel(day)
  return {
    ...full,
    guests: [],
    companies: [],
    blacklist: [],
    reservations: [],
    blocks: [],
    customTags: [],
    saleFolios: [],
    expenses: [],
    tasks: [],
    handovers: [],
    notes: [],
    lostItems: [],
    issues: [],
    maintenance: [],
    employees: [],
    contacts: [],
    products: [],
    laundry: { ...full.laundry, lines: [], deliveries: [] },
    tourism: { ...full.tourism, rows: [], review: [] },
    weather: [],
    monthly: []
  }
}

const DemoContext = createContext<DemoSource>(defaultSource)

export function DemoProvider({ source, children }: { source: DemoSource; children: ReactNode }) {
  return <DemoContext.Provider value={source}>{children}</DemoContext.Provider>
}

/** A slice of the demo hotel; `key` names it in the query cache. */
export function useDemo<T>(key: readonly unknown[], select: (hotel: DemoHotel) => T) {
  const source = useContext(DemoContext)
  return useQuery({
    queryKey: ['demo', ...key],
    queryFn: async () => select(await source.hotel()),
    staleTime: Infinity
  })
}
