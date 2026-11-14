// Alarms grouped by day for the list (Faz 20 P20b). Pure, so it is unit-tested.
import type { CameraAlert } from '@shared/contract/camera'

export interface Day {
  key: string
  alerts: CameraAlert[]
}

/** Newest first, as the sidecar sends them; an alarm without a time goes last. */
export function groupByDay(alerts: readonly CameraAlert[]): Day[] {
  const byKey = new Map<string, Day>()
  for (const alert of alerts) {
    const key = alert.at?.slice(0, 10) ?? ''
    const day = byKey.get(key)
    if (day) day.alerts.push(alert)
    else byKey.set(key, { key, alerts: [alert] })
  }
  return [...byKey.values()].sort((a, b) =>
    a.key === '' ? 1 : b.key === '' ? -1 : b.key.localeCompare(a.key)
  )
}
