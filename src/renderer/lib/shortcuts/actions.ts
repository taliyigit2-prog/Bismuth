// Who answers a global shortcut. A screen that can do the job registers a handler (`useShortcutAction`): the
// calendar opens its new-reservation form, the ledger its payment form, the reservation panel its own payment form
// for the reservation on display. The newest handler that may run wins. When nobody on screen can, the shell opens
// the screen that can (`SHORTCUT_ROUTES`) and leaves the request waiting; the screen picks it up when it mounts.
import { useEffect, useRef, type RefObject } from 'react'
import type { ShortcutAction } from './registry'

interface Handler {
  run: () => void
  /** Only while the key press happens inside this element (a panel or sheet on top of the screen). */
  scope?: RefObject<HTMLElement | null>
}

const handlers = new Map<ShortcutAction, Handler[]>()
/** Requests left for a screen that is opening, with the time they were made: a stale one is dropped. */
const pending = new Map<ShortcutAction, number>()
const PENDING_MS = 5000

const takePending = (action: ShortcutAction): boolean => {
  const at = pending.get(action)
  pending.delete(action)
  return at !== undefined && Date.now() - at < PENDING_MS
}

/**
 * Runs the newest handler of `action` that may run now: a scoped one when the key press is inside its element, an
 * unscoped one only while no dialog, sheet or menu is open. Returns whether one ran.
 */
export function runShortcutHandler(
  action: ShortcutAction,
  target: EventTarget | null,
  overlayOpen: boolean
): boolean {
  const list = handlers.get(action) ?? []
  for (let i = list.length - 1; i >= 0; i--) {
    const h = list[i]
    if (!h) continue
    if (h.scope) {
      const el = h.scope.current
      if (el && target instanceof Node && el.contains(target)) {
        h.run()
        return true
      }
      continue
    }
    if (overlayOpen) continue
    h.run()
    return true
  }
  return false
}

/** Leaves the action for the screen about to open. */
export function queueShortcut(action: ShortcutAction): void {
  pending.set(action, Date.now())
}

/** Tests: forget every handler and waiting request. */
export function resetShortcutHandlers(): void {
  handlers.clear()
  pending.clear()
}

/**
 * Registers a screen's answer to a global shortcut while the screen is mounted. `enabled: false` (the role may not
 * do it) leaves the key to the next handler. A request left by the shell for this screen runs once, on mount.
 */
export function useShortcutAction(
  action: ShortcutAction,
  run: () => void,
  { scope, enabled = true }: { scope?: RefObject<HTMLElement | null>; enabled?: boolean } = {}
): void {
  const latest = useRef(run)
  useEffect(() => {
    latest.current = run
  })
  useEffect(() => {
    if (!enabled) return
    const handler: Handler = { run: () => latest.current(), scope }
    handlers.set(action, [...(handlers.get(action) ?? []), handler])
    if (!scope && takePending(action)) handler.run()
    return () => {
      handlers.set(
        action,
        (handlers.get(action) ?? []).filter((h) => h !== handler)
      )
    }
  }, [action, enabled, scope])
}
