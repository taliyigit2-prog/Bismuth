// Whether the first-run tour is on screen in this window (G-18, S-52). The tour shows by itself once per person
// (`ui.tourDone`, kept in user_preferences); "Tanıtım turunu yeniden başlat" (guide, Ayarlar → Kılavuz) opens it
// again from the first step. Closing it hides it for the rest of the session at once, before the server answers.
import { useSyncExternalStore } from 'react'

interface TourState {
  /** Opened by hand ("yeniden başlat"). */
  requested: boolean
  /**
   * Who closed it in this window (skip or finish): the automatic opening stays off for them. Another person signing
   * in at the same window ("Başka kullanıcı", a shift handover) still sees their own first tour (QA2c #13).
   */
  dismissedBy: string | null
  step: number
}

let state: TourState = { requested: false, dismissedBy: null, step: 0 }
const listeners = new Set<() => void>()

const set = (next: Partial<TourState>): void => {
  state = { ...state, ...next }
  for (const l of listeners) l()
}

export const tourState = (): TourState => state

/** Opens the tour at its first step. */
export function startTour(): void {
  set({ requested: true, dismissedBy: null, step: 0 })
}

/** Closes the tour for the person signed in (the caller saves `ui.tourDone`). */
export function closeTour(userId: string | null): void {
  set({ requested: false, dismissedBy: userId, step: 0 })
}

export function setTourStep(step: number): void {
  set({ step })
}

/** Tests: back to a fresh window. */
export function resetTour(): void {
  set({ requested: false, dismissedBy: null, step: 0 })
}

export function useTourState(): TourState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    tourState,
    tourState
  )
}
