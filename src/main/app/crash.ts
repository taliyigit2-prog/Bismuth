// What the program does with an error nobody caught (Faz 16 madde 2): it is written to the error log (personal data
// removed, app/log-redact.ts) and the user is told what to do — restart, or reopen the window — instead of a silent
// stop or an English stack trace. The decisions live here without Electron so they are tested in Node; the dialogs
// and process hooks are wired in app/crash-wiring.ts.

export type CrashChoice = 'restart' | 'continue' | 'reload' | 'close'

/** What is asked: an error of the main process, a crashed window, or a window that keeps crashing. */
export type CrashQuestion = 'main' | 'window' | 'windowLoop'

export interface CrashDeps {
  log: { error: (...args: unknown[]) => void; warn: (...args: unknown[]) => void }
  /** Asks the user; resolves with the button they chose. */
  ask: (kind: CrashQuestion) => Promise<CrashChoice>
  restart: () => void
  /** Closes the program ("Kapat" when a window keeps crashing). */
  quit?: () => void
  /** Milliseconds since some fixed point (tests move it). */
  now?: () => number
}

/** One dialog at a time and at most one a minute: a fault that repeats must not bury the screen in windows. */
export const DIALOG_GAP_MS = 60_000
/**
 * A window that crashes again soon after a question is opened again by itself (the question is not repeated), at
 * most AUTO_RELOAD_LIMIT times in AUTO_RELOAD_PERIOD_MS; after that the user is asked to restart or close the program.
 */
export const AUTO_RELOAD_LIMIT = 3
export const AUTO_RELOAD_PERIOD_MS = 5 * 60_000

/** Why a window's page stopped (Electron `render-process-gone` reasons); `clean-exit` is a normal close. */
export interface GoneDetails {
  reason: string
  exitCode?: number
}

export function createCrashHandler(deps: CrashDeps) {
  const now = deps.now ?? (() => Date.now())
  let lastDialog = -Infinity
  /** The question on screen (settles when it is answered; never rejects). */
  let showing: Promise<unknown> | null = null
  /** When windows were opened again without a question (a window must never stay dead). */
  const autoReloads: number[] = []

  const askNow = (kind: CrashQuestion): Promise<CrashChoice | null> => {
    lastDialog = now()
    const answer = (async () => {
      try {
        return await deps.ask(kind)
      } catch {
        return null
      } finally {
        // "A minute" also counts from the answer: a question left open a long time is not followed by another.
        lastDialog = now()
        showing = null
      }
    })()
    showing = answer
    return answer
  }

  const askOnce = (kind: CrashQuestion): Promise<CrashChoice | null> =>
    showing || now() - lastDialog < DIALOG_GAP_MS ? Promise.resolve(null) : askNow(kind)

  return {
    /**
     * An exception no code caught in the main process. Data already written is safe (every write is one SQLite
     * transaction); the user is offered a restart and may also go on.
     */
    async uncaught(error: unknown): Promise<void> {
      deps.log.error('uncaught exception', error)
      if ((await askOnce('main')) === 'restart') deps.restart()
    },

    /** A promise that failed with nobody waiting: background work (rates, backups) — logged, not shown. */
    unhandledRejection(reason: unknown): void {
      deps.log.warn('unhandled rejection', reason)
    },

    /**
     * A window's page crashed or was killed: offer to open it again. The window always comes back: a crash while
     * another question is on screen waits for its answer; a crash soon after a question opens the window again by
     * itself (a few times), then the user is asked to restart or close the program.
     */
    async windowGone(details: GoneDetails, reload: () => void): Promise<void> {
      if (details.reason === 'clean-exit') return
      deps.log.error('window gone', details.reason, details.exitCode ?? null)
      while (showing) await showing
      if (now() - lastDialog >= DIALOG_GAP_MS) {
        const choice = await askNow('window')
        if (choice === 'reload') reload()
        else if (choice === 'restart') deps.restart()
        return
      }
      const since = now() - AUTO_RELOAD_PERIOD_MS
      while (autoReloads.length > 0 && (autoReloads[0] ?? 0) <= since) autoReloads.shift()
      if (autoReloads.length < AUTO_RELOAD_LIMIT) {
        autoReloads.push(now())
        deps.log.warn('window reopened without asking', autoReloads.length)
        reload()
        return
      }
      autoReloads.length = 0
      const choice = await askNow('windowLoop')
      if (choice === 'restart') deps.restart()
      else if (choice === 'close') deps.quit?.()
    },

    /** A helper process (GPU, network service…) stopped: logged; Electron restarts it. */
    childGone(details: GoneDetails & { type: string }): void {
      if (details.reason === 'clean-exit') return
      deps.log.warn('child process gone', details.type, details.reason, details.exitCode ?? null)
    }
  }
}

export type CrashHandler = ReturnType<typeof createCrashHandler>
