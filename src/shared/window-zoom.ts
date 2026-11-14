// Page zoom of the desktop window (Ö-23): Ctrl +/-/0 and Ayarlar → Görünüm step through the same list, so the
// two always agree. In percent; the ceiling keeps a 1280 px screen at 150 % above the tablet breakpoint (853 CSS px).
export const ZOOM_STEPS = [80, 90, 100, 110, 125, 150] as const
export const DEFAULT_ZOOM = 100
export const MIN_ZOOM = 80
export const MAX_ZOOM = 150

export type ZoomDirection = 'in' | 'out' | 'reset'

/** The step nearest to any percentage (a value from an old file or a pinch gesture). */
export function snapZoom(percent: number): number {
  if (!Number.isFinite(percent)) return DEFAULT_ZOOM
  let best: number = DEFAULT_ZOOM
  for (const s of ZOOM_STEPS) if (Math.abs(s - percent) < Math.abs(best - percent)) best = s
  return best
}

/** The zoom after one key press: next bigger / smaller step, or the default; stays inside the list. */
export function nextZoom(current: number, direction: ZoomDirection): number {
  if (direction === 'reset') return DEFAULT_ZOOM
  const now = snapZoom(current)
  const i = ZOOM_STEPS.indexOf(now as (typeof ZOOM_STEPS)[number])
  const j = Math.min(ZOOM_STEPS.length - 1, Math.max(0, i + (direction === 'in' ? 1 : -1)))
  return ZOOM_STEPS[j] ?? DEFAULT_ZOOM
}
