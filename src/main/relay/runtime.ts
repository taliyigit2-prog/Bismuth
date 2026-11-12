// The hotel computer's background work for the owner's copy (faz-13 madde 4, 5, 8): every minute the box gets the
// new changes (or a "still here" note) and the box is checked for a newer main computer; once a day at the quiet
// hour a whole snapshot and the old change-log rows go; every hour the PDF summary. All of it is quiet: a missing
// Drive folder or key only shows in Settings → Uzaktan erişim, a failure is logged and tried again next round.
// No Electron here: printing the PDF and the clock are passed in.
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import type { BismuthDb } from '../db/client'
import type { RelayHostStatus } from '@shared/contract/remote'
import type { AppLocale } from '@shared/format'
import type { BismuthKeyStore } from '../security/bismuth-key'
import type { Services } from '../services'
import { readSetting } from '../services/settings-service'
import { isDue } from '../backup/scheduler'
import { pruneChangeLog } from '../replica/triggers'
import { currentEpoch } from '../replica/feed'
import { conflictingChanges, findNewerTerm, type EpochGuard } from './epoch'
import { resolveBismuthFolder, resolveBoxFolder, SUMMARY_FILE } from './paths'
import { collectSummary, summaryHtml, type Translate } from './summary'
import { createRelayWriter } from './writer'

/** Change-log rows are kept this long; a copy further behind takes a snapshot. */
const LOG_KEEP_DAYS = 30
const SUMMARY_EVERY_MS = 60 * 60_000

export interface RelayRuntimeDeps {
  services: Services
  db: BismuthDb
  sqlite: Database.Database
  keys: BismuthKeyStore
  guard: EpochGuard
  schemaVersion(): number
  /** Prints the summary page to a PDF file (Electron printToPDF); absent in tests → no PDF. */
  printPdf?: (html: string, out: string) => Promise<void>
  translate(locale: AppLocale): Translate
  isBusy?: () => boolean
  clock?: () => Date
  onError?: (error: unknown, what: string) => void
}

export function createRelayRuntime(deps: RelayRuntimeDeps) {
  const clock = deps.clock ?? (() => new Date())
  const setting = <K extends Parameters<typeof readSetting>[1]>(key: K) => readSetting(deps.db, key)
  const boxDir = (): string | null => resolveBoxFolder(setting('backup.driveFolder'))
  const writer = createRelayWriter({
    sqlite: deps.sqlite,
    dir: boxDir,
    key: () => deps.keys.get(),
    enabled: () => setting('relay.enabled'),
    excludeIdentity: () => setting('relay.excludeIdentity'),
    schemaVersion: deps.schemaVersion,
    replaced: () => deps.guard.replaced() !== null,
    clock,
    pause: async () => {
      // A busy reception goes first (K-32); at most a few seconds' wait per block.
      for (let i = 0; i < 20 && deps.isBusy?.(); i++) await new Promise((r) => setTimeout(r, 250))
      await new Promise((r) => setTimeout(r, 50))
    }
  })
  let minuteTimer: ReturnType<typeof setInterval> | null = null
  /** The last nightly snapshot (from the box at start, so a restart does not make another one). */
  let lastSnapshotAt: Date | null | undefined
  let lastSummaryAt = 0
  let summaryProblem: RelayHostStatus['summary']['problem'] = null
  let summaryAt: string | null = null

  /** A newer main computer announced in the box: this one stops writing (and remembers why). */
  function checkReplaced(): void {
    const dir = boxDir()
    const key = deps.keys.get()
    if (!dir || !key) return
    const note = findNewerTerm(dir, key, currentEpoch(deps.sqlite))
    if (note) deps.guard.mark(note, clock())
  }

  async function writeSummary(force = false): Promise<void> {
    const now = clock()
    if (!force && now.getTime() - lastSummaryAt < SUMMARY_EVERY_MS) return
    lastSummaryAt = now.getTime()
    if (!setting('summary.enabled')) {
      summaryProblem = 'off'
      return
    }
    if (deps.guard.replaced()) {
      summaryProblem = 'replaced'
      return
    }
    const folder = resolveBismuthFolder(setting('backup.driveFolder'))
    if (!folder) {
      summaryProblem = 'noFolder'
      return
    }
    if (!deps.printPdf) return
    try {
      const locale = setting('ui.language')
      const html = summaryHtml(collectSummary(deps.services, now), locale, deps.translate(locale))
      await deps.printPdf(html, join(folder, SUMMARY_FILE))
      summaryProblem = null
      summaryAt = now.toISOString()
    } catch (error) {
      summaryProblem = 'writeFailed'
      deps.onError?.(error, 'summary pdf')
    }
  }

  async function minute(): Promise<void> {
    try {
      checkReplaced()
      const now = clock()
      if (lastSnapshotAt === undefined) {
        const boxed = writer.status().lastSnapshotAt
        lastSnapshotAt = boxed ? new Date(boxed) : null
      }
      if (isDue(lastSnapshotAt, now, setting('backup.autoTime'))) {
        lastSnapshotAt = now
        pruneChangeLog(deps.sqlite, new Date(now.getTime() - LOG_KEEP_DAYS * 86_400_000).toISOString())
        await writer.snapshot()
      } else await writer.tick()
      await writeSummary()
    } catch (error) {
      deps.onError?.(error, 'relay round')
    }
  }

  return {
    start(): void {
      if (minuteTimer) return
      minuteTimer = setInterval(() => void minute(), 60_000)
      minuteTimer.unref?.()
      // First round a little after start (the window opens first).
      setTimeout(() => void minute(), 20_000).unref?.()
    },
    stop(): void {
      if (minuteTimer) clearInterval(minuteTimer)
      minuteTimer = null
    },
    /** "Şimdi yaz": a snapshot and the summary now. */
    async runNow(): Promise<void> {
      checkReplaced()
      await writer.snapshot()
      await writeSummary(true)
    },
    /** One round now (tests, and the first round after the box folder was set). */
    tick: () => minute(),
    checkReplaced,
    status(): RelayHostStatus {
      const box = writer.status()
      const replaced = deps.guard.replaced()
      return {
        epoch: currentEpoch(deps.sqlite),
        box: {
          folder: box.folder,
          problem: box.problem,
          lastSegmentAt: box.lastSegmentAt,
          lastSnapshotAt: box.lastSnapshotAt,
          pending: box.pending
        },
        summary: {
          folder: resolveBismuthFolder(setting('backup.driveFolder')),
          problem: setting('summary.enabled') ? summaryProblem : 'off',
          lastAt: summaryAt
        },
        keyExists: deps.keys.get() !== null,
        replaced: replaced
          ? {
              epoch: replaced.epoch,
              by: replaced.by,
              at: replaced.at,
              seenAt: replaced.seenAt,
              conflicts: conflictingChanges(deps.sqlite, replaced).length
            }
          : null
      }
    }
  }
}
export type RelayRuntime = ReturnType<typeof createRelayRuntime>
