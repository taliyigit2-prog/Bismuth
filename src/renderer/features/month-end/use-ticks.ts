// The owner's "baktım" ticks of the month-end check, kept per person on the main computer (K-46 (6); karar
// denetimi #13): the same ticks at the hotel and on the Mac. The ticks this device kept before (local storage,
// `bismuth.monthEnd.YYYY-MM`) move to the person's preferences once, the first time the screen opens.
import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { MONTH_END_MANUAL_STEPS, type MonthEndManualStep } from '@shared/contract/procedures/reports'
import type { Transport } from '@/lib/transport'
import { useTransport } from '@/lib/api/api-context'
import { useApiQuery } from '@/lib/api/hooks'
import { useAdminMutation } from '@/features/settings/use-admin'
import { ym } from './derive'

const LEGACY = /^bismuth\.monthEnd\.(\d{4})-(\d{2})$/

/** This window has already moved the device's old ticks (or found none). */
let moved: Promise<void> | null = null

/** Tests: start as a fresh window. */
export function resetLegacyTicksMove(): void {
  moved = null
}

const isManual = (v: unknown): v is MonthEndManualStep => MONTH_END_MANUAL_STEPS.some((s) => s === v)

/** Old ticks of this device, by month. Storage that throws (private window) has nothing to move. */
function legacyTicks(): { key: string; year: number; month: number; ticks: MonthEndManualStep[] }[] {
  const out: { key: string; year: number; month: number; ticks: MonthEndManualStep[] }[] = []
  try {
    const storage = window.localStorage
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)
      const m = key ? LEGACY.exec(key) : null
      if (!key || !m) continue
      let ticks: MonthEndManualStep[] = []
      try {
        const list: unknown = JSON.parse(storage.getItem(key) ?? '[]')
        ticks = Array.isArray(list) ? list.filter(isManual) : []
      } catch {
        ticks = []
      }
      out.push({ key, year: Number(m[1]), month: Number(m[2]), ticks })
    }
  } catch {
    return []
  }
  return out
}

/**
 * Moves the device's old ticks to the person's preferences (added to what is kept there) and clears them here.
 * A month that fails stays on the device and is tried again next time the screen opens.
 */
export function moveLegacyTicks(transport: Transport): Promise<void> {
  moved ??= (async () => {
    for (const old of legacyTicks()) {
      try {
        if (old.ticks.length)
          await transport.call('reports.setMonthEndTicks', {
            year: old.year,
            month: old.month,
            ticks: old.ticks,
            merge: true
          })
        window.localStorage.removeItem(old.key)
      } catch {
        // Kept on the device for the next opening.
      }
    }
  })()
  return moved
}

/** The month's ticks and a setter that saves them (the screen shows the new state at once). */
export function useMonthEndTicks(monthKey: string): {
  ticks: MonthEndManualStep[]
  setTicks: (next: MonthEndManualStep[]) => void
} {
  const transport = useTransport()
  const client = useQueryClient()
  const { year, month } = ym(monthKey)
  const [ready, setReady] = useState(moved !== null)
  useEffect(() => {
    let live = true
    void moveLegacyTicks(transport).then(async () => {
      await client.invalidateQueries({ queryKey: ['reports.monthEndTicks'] })
      if (live) setReady(true)
    })
    return () => {
      live = false
    }
  }, [transport, client])
  const query = useApiQuery('reports.monthEndTicks', { year, month }, { enabled: ready })
  const save = useAdminMutation('reports.setMonthEndTicks', { invalidate: ['reports.monthEndTicks'] })
  /** The ticks being saved, shown until the server answers (cleared on error: the kept ones show again). */
  const [pending, setPending] = useState<{ key: string; ticks: MonthEndManualStep[] } | null>(null)
  const shown = pending?.key === monthKey ? pending.ticks : (query.data?.ticks ?? [])
  return {
    ticks: shown,
    setTicks: (next) => {
      setPending({ key: monthKey, ticks: next })
      save.mutate({ year, month, ticks: next }, { onSettled: () => setPending(null) })
    }
  }
}
