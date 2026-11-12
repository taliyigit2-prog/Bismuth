// The shell's one key listener for the global shortcuts (registry.ts). A plain key typed into a text field is text,
// never a command; Ctrl/⌘ combinations work everywhere. While a dialog, sheet or menu is open only its own handlers
// answer (a reservation panel's payment form), so a key never acts on the screen behind it. A key the role may not
// use does nothing (the service would refuse anyway, G-23).
import { useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useCan } from '@/lib/view-as'
import { useLockNow } from '@/lib/session/session'
import { queueShortcut, runShortcutHandler } from './actions'
import { setShortcutListOpen } from './list-store'
import { globalShortcutFor, isTypingTarget, type ShortcutAction } from './registry'

const OVERLAYS = [
  'dialog-content',
  'sheet-content',
  'alert-dialog-content',
  'dropdown-menu-content',
  'select-content',
  'popover-content'
]
  .map((slot) => `[data-slot="${slot}"]`)
  .join(',')

/** Is a dialog, sheet, menu or list open over the screen? */
export const overlayOpen = (doc: Document = document): boolean => doc.querySelector(OVERLAYS) !== null

/**
 * Is something other than the quick search itself open (Ctrl/⌘+K still closes the search)? A window on its way out
 * (closing animation) does not count.
 */
const otherOverlayOpen = (doc: Document = document): boolean =>
  [...doc.querySelectorAll(OVERLAYS)].some(
    (o) => o.getAttribute('data-state') !== 'closed' && !o.querySelector(':scope > [data-slot="command"]')
  )

/** The screen that answers an action when the one on display cannot. */
export const SHORTCUT_ROUTES: Partial<Record<ShortcutAction, '/calendar' | '/ledger'>> = {
  newReservation: '/calendar',
  goToday: '/calendar',
  addPayment: '/ledger'
}

export function useGlobalShortcuts({ onSearch }: { onSearch: () => void }): void {
  const navigate = useNavigate()
  const can = useCan()
  const lockNow = useLockNow()

  useEffect(() => {
    const mayOpenScreen = (action: ShortcutAction): boolean => {
      switch (action) {
        case 'newReservation':
          return can('calendar', 'edit')
        case 'goToday':
          return can('calendar')
        case 'addPayment':
          return can('ledger') && (can('payments', 'edit') || can('extras', 'edit'))
        default:
          return false
      }
    }

    const onKey = (e: KeyboardEvent): void => {
      if (e.defaultPrevented || e.isComposing) return
      const def = globalShortcutFor(e)
      const action = def?.action
      if (!def || !action) return
      const withMod = e.ctrlKey || e.metaKey
      if (isTypingTarget(e.target) && !(def.whileTyping && withMod)) return

      if (action === 'search') {
        // Not over an open window: going to another screen from the search would close a form unasked.
        if (otherOverlayOpen()) return
        e.preventDefault()
        onSearch()
        return
      }
      if (action === 'lock') {
        e.preventDefault()
        lockNow()
        return
      }
      if (e.repeat) return
      const overlay = overlayOpen()
      if (action === 'shortcutList') {
        if (overlay) return
        e.preventDefault()
        setShortcutListOpen(true)
        return
      }
      if (runShortcutHandler(action, e.target, overlay)) {
        e.preventDefault()
        return
      }
      const route = SHORTCUT_ROUTES[action]
      if (overlay || !route || !mayOpenScreen(action)) return
      e.preventDefault()
      queueShortcut(action)
      void navigate({ to: route })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [can, lockNow, navigate, onSearch])
}
