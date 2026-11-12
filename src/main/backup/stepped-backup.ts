// Online copy of the live database in small steps (faz-14 madde 1; K-32, S-42, S-62): the hotel's computer is weak,
// so the copy moves ~4 MB, rests, moves the next block, and waits while someone is working in the program. SQLite's
// online backup API keeps the copy consistent: changes written through the same connection between two steps are
// carried into the copy as they happen (no restart, no half-written page) — the program can keep writing.
// better-sqlite3's own `backup()` steps on every event-loop turn with no rest in between; its native backup handle
// (the object `backup()` itself drives) lets us rest with timers instead. When the handle is not there (another
// better-sqlite3 version) the plain `backup()` is used, with a page count per turn and the same busy pause.
import { existsSync } from 'node:fs'
import type Database from 'better-sqlite3'

export interface SteppedBackupOptions {
  /** Pages per step: 1024 × 4 KiB pages ≈ 4 MB (K-32). */
  pagesPerStep?: number
  /** Rest between two steps. */
  restMs?: number
  /** Someone is using the program right now: wait before the next step. */
  isBusy?: () => boolean
  /** How long to wait for a quiet moment before going on anyway (a busy evening must not stop the backup). */
  maxBusyWaitMs?: number
  sleep?: (ms: number) => Promise<void>
}

interface NativeBackup {
  transfer(pages: number): { totalPages: number; remainingPages: number }
  close(): void
}
interface NativeDatabase {
  backup(owner: Database.Database, attached: string, file: string, isNewFile: boolean): NativeBackup
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** The native connection object better-sqlite3 keeps under a private symbol, when it has the backup method. */
function nativeOf(sqlite: Database.Database): NativeDatabase | null {
  for (const symbol of Object.getOwnPropertySymbols(sqlite)) {
    const value = (sqlite as unknown as Record<symbol, unknown>)[symbol]
    if (value && typeof (value as NativeDatabase).backup === 'function') return value as NativeDatabase
  }
  return null
}

export interface SteppedBackupResult {
  steps: number
  totalPages: number
}

export async function steppedBackup(
  sqlite: Database.Database,
  dest: string,
  opts: SteppedBackupOptions = {}
): Promise<SteppedBackupResult> {
  const pages = Math.max(1, opts.pagesPerStep ?? 1024)
  const rest = opts.restMs ?? 40
  const sleep = opts.sleep ?? defaultSleep
  const maxBusy = opts.maxBusyWaitMs ?? 10 * 60_000
  const waitWhileBusy = async (): Promise<void> => {
    let waited = 0
    while (opts.isBusy?.() && waited < maxBusy) {
      await sleep(500)
      waited += 500
    }
  }

  const native = nativeOf(sqlite)
  if (!native) {
    let steps = 0
    let total = 0
    await sqlite.backup(dest, {
      progress: ({ totalPages }) => {
        steps++
        total = totalPages
        return opts.isBusy?.() ? Math.max(1, Math.floor(pages / 16)) : pages
      }
    })
    return { steps, totalPages: total }
  }

  const handle = native.backup(sqlite, 'main', dest, !existsSync(dest))
  let steps = 0
  try {
    for (;;) {
      await waitWhileBusy()
      const progress = handle.transfer(pages)
      steps++
      if (progress.remainingPages === 0) return { steps, totalPages: progress.totalPages }
      await sleep(rest)
    }
  } finally {
    handle.close()
  }
}
