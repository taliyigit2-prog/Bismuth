// Errors a window reports (Faz 16 madde 2): the renderer's error screen and its window-level error handlers send what
// broke so it lands in the same error log as the main process (userData/logs, personal data removed there). Nothing
// is stored in the database and nothing is shown back. Any window may report — also before sign-in or while locked —
// over IPC; from another device (server mode) only a signed-in user, so the log cannot be filled from the network.
// At most REPORTS_PER_MINUTE a minute: a page that fails in a loop does not flood the file.
import type { ClientErrorReport } from '@shared/contract/procedures/system'
import { ctxKind, type Ctx, type Transport } from './context'

export const REPORTS_PER_MINUTE = 20

export interface DiagnosticsDeps {
  clock: () => Date
  /** Where a report goes (the main process: the error log). */
  onClientError?: (report: ClientErrorReport & { transport: Transport; userId: string | null }) => void
}

export function createDiagnosticsService(deps: DiagnosticsDeps) {
  /**
   * One budget per source (QA2c #12): this computer's own windows share one, each person on another device has
   * their own — a phone that reports in a loop cannot silence the hotel window's crash report.
   */
  const budgets = new Map<string, { start: number; count: number }>()
  return {
    /**
     * True when the report was passed on (false: dropped by the source or the rate rule). `transport` is how the call
     * arrived (decided by the entry point, never by the caller).
     */
    reportClientError(ctx: Ctx, report: ClientErrorReport, transport: Transport): boolean {
      if (transport !== 'ipc' && ctxKind(ctx) !== 'user') return false
      const now = deps.clock().getTime()
      const source = transport === 'ipc' ? 'ipc' : `${transport}:${ctx.userId ?? ''}`
      for (const [key, b] of budgets) if (now - b.start >= 60_000) budgets.delete(key)
      const budget = budgets.get(source) ?? { start: now, count: 0 }
      budgets.set(source, budget)
      if (budget.count >= REPORTS_PER_MINUTE) return false
      budget.count++
      deps.onClientError?.({ ...report, transport, userId: ctx.userId })
      return true
    }
  }
}
