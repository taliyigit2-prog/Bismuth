// Keys the window itself answers (Ö-23): full screen and page zoom. Decided in the main process on the key event
// (`before-input-event`), so they work on every screen, in a text field too, and without the page's help. Pure: tested
// with plain Node. The same keys are listed in the shortcut list (renderer/lib/shortcuts/registry.ts).
import type { ZoomDirection } from '@shared/window-zoom'

export type WindowKeyAction = 'fullscreen' | { zoom: ZoomDirection }

export interface KeyInput {
  type: string
  key: string
  code: string
  control: boolean
  meta: boolean
  alt: boolean
  shift: boolean
  isAutoRepeat?: boolean
}

/** What a key press asks of the window, or null when it is none of its keys. */
export function windowKeyAction(input: KeyInput): WindowKeyAction | null {
  if (input.type !== 'keyDown' || input.alt) return null
  const mod = input.control || input.meta
  // A held key repeats; full screen toggles once per press (zoom may repeat).
  if (!mod) return input.key === 'F11' && !input.shift && !input.isAutoRepeat ? 'fullscreen' : null
  // Ctrl/⌘+Shift+F; the physical key, so a Russian layout ("а") works too.
  if (input.shift && input.code === 'KeyF') return input.isAutoRepeat ? null : 'fullscreen'
  const { key, code } = input
  if (key === '+' || key === '=' || code === 'NumpadAdd' || code === 'Equal') return { zoom: 'in' }
  if (key === '-' || key === '_' || code === 'NumpadSubtract' || code === 'Minus') return { zoom: 'out' }
  if (key === '0' || code === 'Numpad0' || code === 'Digit0') return { zoom: 'reset' }
  return null
}

/** Smallest CSS width of the desktop layout (Tailwind `md`); below it the phone layout takes over. */
const DESKTOP_CSS_WIDTH = 768
const BASE_MIN_WIDTH = 960
export const MIN_WINDOW_HEIGHT = 600

/**
 * The window's minimum width in screen units: 960, but never wider than the screen's work area (a 1280 px screen at
 * Windows 150 % is 853 wide), and wide enough that the page, zoomed, is still wider than the phone breakpoint.
 */
export function minWindowWidth(workAreaWidth: number, zoomPercent: number): number {
  const zoomed = Math.ceil((DESKTOP_CSS_WIDTH * zoomPercent) / 100)
  return Math.min(Math.max(BASE_MIN_WIDTH, zoomed), workAreaWidth)
}
