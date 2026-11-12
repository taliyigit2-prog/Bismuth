// "Why did this draw again" counters (faz-15 madde 9): heavy components (the tape chart's rows, the ledger month's
// day bands, report cards) count their renders when a test or the performance profile asks for it by setting
// `globalThis.__bismuthRenders = {}` before the app starts. Otherwise this is a single property check: nothing is
// kept and nothing leaves the page.

type Counts = Record<string, number>

const counts = (): Counts | undefined => (globalThis as { __bismuthRenders?: Counts }).__bismuthRenders

/** Counts one render of `name` while counting is on. */
export function countRender(name: string): void {
  const c = counts()
  if (c) c[name] = (c[name] ?? 0) + 1
}

/** Test helper: switches counting on (or resets it) and returns the live counts. */
export function startRenderCount(): Counts {
  const fresh: Counts = {}
  ;(globalThis as { __bismuthRenders?: Counts }).__bismuthRenders = fresh
  return fresh
}

/** Test helper: switches counting off. */
export function stopRenderCount(): void {
  delete (globalThis as { __bismuthRenders?: Counts }).__bismuthRenders
}
