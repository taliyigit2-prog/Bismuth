// Leftovers of the first camera versions (P20a/P20b): the sidecar used to keep guests, alarm pictures and face crops in
// plain files under `userData/camera`, and the screen's alarm marks in `camera-alert-state.json`. From P20c Bismuth's
// own database is the only keeper (K-51, K-53) and the sidecar writes nothing, so these files are removed at start:
// a plain picture of a face must not outlive the change that made it unnecessary.
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const NAMES = [
  join('camera', 'hotel_guests.db'),
  join('camera', 'hotel_guests.db-wal'),
  join('camera', 'hotel_guests.db-shm'),
  join('camera', 'hotel_guests.db-journal'),
  join('camera', 'alerts'),
  join('camera', 'guest_photos'),
  'camera-alert-state.json',
  'camera-alert-state.json.tmp'
]

/** Removes the old plain files under `userData`; returns the names that were there. Never throws. */
export function removeLegacyCameraFiles(userData: string): string[] {
  const removed: string[] = []
  for (const name of NAMES) {
    const target = join(userData, name)
    try {
      if (!existsSync(target)) continue
      rmSync(target, { recursive: true, force: true, maxRetries: 2 })
      removed.push(name)
    } catch {
      // A file in use is tried again at the next start.
    }
  }
  return removed
}
