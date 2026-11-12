// Phone layout switch (< 768 px). Rewritten from shadcn/ui use-mobile.ts (MIT) with useSyncExternalStore
// so there is no setState-in-effect and the first render already has the right layout.
import { useSyncExternalStore } from 'react'

export const MOBILE_BREAKPOINT = 768
const query = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

/**
 * The layout of the screen while printing: the page box is narrower than the window, and switching to the phone
 * layout then would re-mount the open screen mid-print (its print layout with it — faz-10 madde 8).
 */
let screenValue: boolean | null = null

function snapshot(): boolean {
  const narrow = window.matchMedia(query).matches
  const printing = window.matchMedia('print').matches && !window.matchMedia('screen').matches
  if (screenValue !== null && printing) return screenValue
  screenValue = narrow
  return narrow
}

function subscribe(callback: () => void): () => void {
  const mql = window.matchMedia(query)
  mql.addEventListener('change', callback)
  return () => mql.removeEventListener('change', callback)
}

export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false)
}
