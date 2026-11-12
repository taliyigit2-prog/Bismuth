// When the automatic backup runs (K-32, S-42): once a day at the hotel's quiet hour (setting `backup.autoTime`,
// 04:00) and when the program closes. A computer that was off at 04:00 takes the missed backup a few minutes after
// the program starts (not at once: start-up must stay quick). A check every minute (not one long timer) keeps
// working across sleep and clock changes. A backup that fails is not retried every minute (a full copy and an
// integrity check each time would wear down a weak PC, K-32): the next try waits 30 minutes, then 1, 2, 4 and at
// most 6 hours (P14fix #5); a backup that works resets the wait.
import { clockTime } from '@shared/contract/settings'

/** The latest moment at `time` (local) that is not after `now`. */
export function lastSlotAt(now: Date, time: string): Date {
  const [h, m] = (clockTime.safeParse(time).success ? time : '04:00').split(':').map(Number) as [
    number,
    number
  ]
  const slot = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0)
  if (slot.getTime() > now.getTime()) slot.setDate(slot.getDate() - 1)
  return slot
}

/** The next moment at `time` (local) after `now`. */
export function nextSlotAt(now: Date, time: string): Date {
  const slot = lastSlotAt(now, time)
  slot.setDate(slot.getDate() + 1)
  return slot
}

/** An automatic backup is due when none was taken since the latest quiet-hour slot. */
export function isDue(lastAuto: Date | null, now: Date, time: string): boolean {
  return lastAuto === null || lastAuto.getTime() < lastSlotAt(now, time).getTime()
}

/** At closing: a backup unless an automatic one is younger than `minAgeMs` (a quick restart makes no new copy). */
export function closingBackupNeeded(lastAuto: Date | null, now: Date, minAgeMs = 6 * 3_600_000): boolean {
  return lastAuto === null || now.getTime() - lastAuto.getTime() >= minAgeMs
}

/** Wait before the next try after `failures` failed backups in a row: 30 min, 1 h, 2 h, 4 h, then 6 h. */
export function retryDelayMs(failures: number): number {
  if (failures <= 0) return 0
  return Math.min(30 * 60_000 * 2 ** (failures - 1), 6 * 3_600_000)
}

export interface SchedulerDeps {
  clock: () => Date
  time: () => string
  lastAutoAt: () => Date | null
  run: () => Promise<unknown>
  onError?: (error: unknown) => void
  /** Delay of the first check after start (missed backups wait this long). */
  startDelayMs?: number
  checkEveryMs?: number
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
}

export interface BackupScheduler {
  start(): void
  stop(): void
  /** One check now (tests; also after the time setting changed). */
  tick(): Promise<void>
}

export function createBackupScheduler(deps: SchedulerDeps): BackupScheduler {
  const setTimer =
    deps.setTimer ??
    ((fn: () => void, ms: number) => {
      const t = setTimeout(fn, ms)
      t.unref?.()
      return t
    })
  const clearTimer = deps.clearTimer ?? ((h: unknown) => clearTimeout(h as NodeJS.Timeout))
  let handle: unknown = null
  let running = false
  let stopped = true
  let failures = 0
  let failedAt = 0

  const tick = async (): Promise<void> => {
    if (running) return
    const now = deps.clock().getTime()
    if (!isDue(deps.lastAutoAt(), deps.clock(), deps.time())) return
    if (failures > 0 && now - failedAt < retryDelayMs(failures)) return
    running = true
    try {
      await deps.run()
      failures = 0
    } catch (error) {
      failures++
      failedAt = deps.clock().getTime()
      deps.onError?.(error)
    } finally {
      running = false
    }
  }
  const loop = (ms: number): void => {
    handle = setTimer(() => {
      void tick().finally(() => {
        if (!stopped) loop(deps.checkEveryMs ?? 60_000)
      })
    }, ms)
  }
  return {
    start() {
      if (!stopped) return
      stopped = false
      loop(deps.startDelayMs ?? 5 * 60_000)
    },
    stop() {
      stopped = true
      if (handle !== null) clearTimer(handle)
      handle = null
    },
    tick
  }
}
