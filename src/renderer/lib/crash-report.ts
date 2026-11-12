// Errors the window could not handle (Faz 16 madde 2) go to the main process's error log through the one contract
// (`system.reportError`; the main process removes personal data before writing). The error screen reports what it
// caught; window-level errors and unhandled promises are reported here and the user gets one short notice with what
// to do. A refused or failed call (ApiError) is not a crash: the screen that made it already says what went wrong.
import i18next from 'i18next'
import { toast } from 'sonner'
import type { ClientErrorReport } from '@shared/contract/procedures/system'
import { ApiError, type Transport } from '@/lib/transport/types'

let transport: Transport | null = null
let lastNotice = -Infinity
/** At most one notice in this many milliseconds. */
export const NOTICE_GAP_MS = 30_000

/** Browser noise that is not a fault of the program (the layout settles on the next frame). */
const IGNORED = /ResizeObserver loop/

const cut = (text: string, max: number): string => (text.length > max ? text.slice(0, max) : text)

/** The screen's path, without the query (`#/guests?q=…` → `/guests`): the query may hold what was typed. */
function currentRoute(): string | null {
  const hash = typeof location === 'undefined' ? '' : location.hash.replace(/^#/, '')
  return hash ? cut(hash.split('?')[0] ?? '', 200) : null
}

export function crashReportOf(kind: ClientErrorReport['kind'], error: unknown): ClientErrorReport {
  const e = error instanceof Error ? error : null
  return {
    kind,
    name: cut(e?.name ?? typeof error, 200),
    message: cut(e ? e.message : String(error), 2000),
    stack: e?.stack ? cut(e.stack, 8000) : null,
    route: currentRoute()
  }
}

/** Sends a report; a report that cannot be sent is dropped (the window is already in trouble). */
export function reportCrash(kind: ClientErrorReport['kind'], error: unknown): void {
  if (!transport) return
  transport.call('system.reportError', crashReportOf(kind, error)).catch(() => undefined)
}

function notify(): void {
  const now = Date.now()
  if (now - lastNotice < NOTICE_GAP_MS) return
  lastNotice = now
  toast.error(i18next.t('crash.toast'))
}

/** Whether a window-level error is worth a report and a notice. */
export function isCrash(error: unknown): boolean {
  if (error instanceof ApiError) return false
  const message = error instanceof Error ? error.message : String(error ?? '')
  return !IGNORED.test(message)
}

/** Once at start (main.tsx): remembers the transport and listens for errors nobody caught. */
export function installCrashReporting(t: Transport): void {
  transport = t
  window.addEventListener('error', (event) => {
    const error = event.error ?? event.message
    if (!isCrash(error)) return
    reportCrash('window', error)
    notify()
  })
  window.addEventListener('unhandledrejection', (event) => {
    if (!isCrash(event.reason)) return
    reportCrash('rejection', event.reason)
    notify()
  })
}
