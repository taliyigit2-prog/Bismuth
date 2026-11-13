// Which alarms the staff have seen or dealt with (Faz 20 P20b). The alarm rows themselves live in the sidecar until
// P20c moves them into Bismuth's own table (`camera_events`, which will carry this state); until then a small file in
// userData keeps the staff's marks. No personal data: an alarm key and a word. Written atomically; a missing or
// damaged file starts empty. Outside backups, copies and the export (K-51).
import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import type { CameraAlertState } from '@shared/contract/camera'

export interface AlertStateStore {
  /** `new` when nobody marked it. */
  get(key: string): CameraAlertState
  /** `new` removes the mark. */
  set(key: string, state: CameraAlertState): void
}

/** At most this many marks are kept (the oldest go first): the list shows the latest 100 alarms. */
export const ALERT_STATE_MAX = 500

/** An alarm's key: its row number plus its time, so a sidecar database that starts over does not inherit old marks. */
export const alertKey = (id: string, at: string | null): string => `${id}|${at ?? ''}`

/** `file` null = memory only (tests). */
export function createAlertStateStore(file: string | null): AlertStateStore {
  let marks: Map<string, CameraAlertState> | null = null

  const load = (): Map<string, CameraAlertState> => {
    if (marks) return marks
    marks = new Map()
    if (!file) return marks
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8')) as { marks?: Record<string, unknown> }
      for (const [key, state] of Object.entries(parsed.marks ?? {})) {
        if (state === 'seen' || state === 'handled') marks.set(key, state)
      }
    } catch {
      marks = new Map()
    }
    return marks
  }

  const write = (): void => {
    if (!file) return
    const entries = [...load().entries()].slice(-ALERT_STATE_MAX)
    writeFileSync(`${file}.tmp`, JSON.stringify({ version: 1, marks: Object.fromEntries(entries) }), {
      mode: 0o600
    })
    renameSync(`${file}.tmp`, file)
  }

  return {
    get: (key) => load().get(key) ?? 'new',
    set(key, state) {
      const all = load()
      all.delete(key) // re-inserted last: the newest mark outlives the oldest
      if (state !== 'new') all.set(key, state)
      write()
    }
  }
}
