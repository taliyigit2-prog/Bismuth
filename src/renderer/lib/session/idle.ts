// Idle lock (G-22): after `minutes` without a key press or pointer use the window locks; 0 = never. One timer:
// activity only moves the deadline and the timer checks it when it fires (no timer churn on every mouse move).
import { useEffect, useRef } from 'react'

const ACTIVITY = ['keydown', 'pointerdown', 'pointermove', 'wheel', 'touchstart'] as const

export function useIdle(minutes: number, onIdle: () => void, enabled = true): void {
  const callback = useRef(onIdle)
  useEffect(() => {
    callback.current = onIdle
  }, [onIdle])

  useEffect(() => {
    if (!enabled || !(minutes > 0)) return
    const limit = minutes * 60_000
    let last = Date.now()
    let timer: ReturnType<typeof setTimeout> | undefined
    const check = (): void => {
      const quiet = Date.now() - last
      if (quiet >= limit) callback.current()
      else timer = setTimeout(check, limit - quiet)
    }
    const active = (): void => {
      last = Date.now()
    }
    for (const type of ACTIVITY) window.addEventListener(type, active, { passive: true, capture: true })
    timer = setTimeout(check, limit)
    return () => {
      clearTimeout(timer)
      for (const type of ACTIVITY) window.removeEventListener(type, active, { capture: true })
    }
  }, [minutes, enabled])
}
