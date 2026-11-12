// Whether the shortcut list (`?` / F1, "Klavye kısayolları" in the quick search) is open in this window.
import { useSyncExternalStore } from 'react'

let open = false
const listeners = new Set<() => void>()

export function setShortcutListOpen(next: boolean): void {
  if (open === next) return
  open = next
  for (const l of listeners) l()
}

export const shortcutListOpen = (): boolean => open

export function useShortcutListOpen(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    shortcutListOpen,
    shortcutListOpen
  )
}
