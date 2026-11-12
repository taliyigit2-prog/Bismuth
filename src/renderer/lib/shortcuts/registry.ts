// Every keyboard shortcut of the program, in one place (G-19, S-51): the global keys the shell listens to, the keys
// of the calendar grid and of every form. The shortcut list (`?` / F1), the guide's shortcut table (`[[shortcuts]]`
// in the guide text, docs/kullanim-kilavuzu.md through scripts/guide-docs-lib.ts) and the listeners read this list,
// so what the list says is what the keys do. Pure data and pure functions: no React, no browser globals.

export type ShortcutGroup = 'global' | 'calendar' | 'forms'

/** Global actions the shell runs (use-shortcuts.ts); the other rows are handled where they live. */
export type ShortcutAction = 'newReservation' | 'search' | 'goToday' | 'addPayment' | 'shortcutList' | 'lock'

export type ShortcutLabelKey =
  | 'shortcuts.action.newReservation'
  | 'shortcuts.action.addPayment'
  | 'shortcuts.action.goToday'
  | 'shortcuts.action.search'
  | 'shortcuts.action.list'
  | 'shortcuts.action.lock'
  | 'shortcuts.action.sidebar'
  | 'shortcuts.calendar.move'
  | 'shortcuts.calendar.week'
  | 'shortcuts.calendar.today'
  | 'shortcuts.calendar.open'
  | 'shortcuts.calendar.new'
  | 'shortcuts.forms.save'
  | 'shortcuts.forms.close'
  | 'shortcuts.forms.next'

export interface ShortcutDef {
  id: string
  group: ShortcutGroup
  /** i18n key of what the keys do. */
  labelKey: ShortcutLabelKey
  /**
   * Alternatives, each a combination: `mod+k` (Ctrl, ⌘ on a Mac), `n`, `?`, `F1`, `ArrowLeft`, `PageUp`… A single
   * row may also list a set of keys that do the same kind of thing (the four arrows).
   */
  keys: readonly string[]
  /** Run by the global listener (the shell); without it the row only documents a key handled elsewhere. */
  action?: ShortcutAction
  /**
   * Also while the cursor is in a text field. Only combinations with Ctrl/⌘ may: a plain letter typed into a field
   * is text, never a command.
   */
  whileTyping?: boolean
}

export const SHORTCUTS: readonly ShortcutDef[] = [
  {
    id: 'new-reservation',
    group: 'global',
    labelKey: 'shortcuts.action.newReservation',
    keys: ['n'],
    action: 'newReservation'
  },
  {
    id: 'add-payment',
    group: 'global',
    labelKey: 'shortcuts.action.addPayment',
    keys: ['p'],
    action: 'addPayment'
  },
  {
    id: 'go-today',
    group: 'global',
    labelKey: 'shortcuts.action.goToday',
    keys: ['t'],
    action: 'goToday'
  },
  {
    id: 'search',
    group: 'global',
    labelKey: 'shortcuts.action.search',
    keys: ['mod+k', '/'],
    action: 'search',
    whileTyping: true
  },
  {
    id: 'shortcut-list',
    group: 'global',
    labelKey: 'shortcuts.action.list',
    keys: ['?', 'F1'],
    action: 'shortcutList'
  },
  {
    id: 'lock',
    group: 'global',
    labelKey: 'shortcuts.action.lock',
    keys: ['mod+l'],
    action: 'lock',
    whileTyping: true
  },
  // Handled by components/ui/sidebar.tsx (SIDEBAR_KEYBOARD_SHORTCUT; a test keeps the two equal).
  {
    id: 'sidebar',
    group: 'global',
    labelKey: 'shortcuts.action.sidebar',
    keys: ['mod+b'],
    whileTyping: true
  },
  // The calendar grid (features/calendar/calendar-grid.tsx), once a cell has the focus.
  {
    id: 'calendar-move',
    group: 'calendar',
    labelKey: 'shortcuts.calendar.move',
    keys: ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']
  },
  {
    id: 'calendar-week',
    group: 'calendar',
    labelKey: 'shortcuts.calendar.week',
    keys: ['PageUp', 'PageDown']
  },
  { id: 'calendar-today', group: 'calendar', labelKey: 'shortcuts.calendar.today', keys: ['Home'] },
  { id: 'calendar-open', group: 'calendar', labelKey: 'shortcuts.calendar.open', keys: ['Enter'] },
  { id: 'calendar-new', group: 'calendar', labelKey: 'shortcuts.calendar.new', keys: ['n'] },
  // Every dialog and form (components/responsive-dialog.tsx, Radix dialogs; tests/unit/dialog-keys.test.tsx).
  { id: 'form-save', group: 'forms', labelKey: 'shortcuts.forms.save', keys: ['Enter'] },
  { id: 'form-close', group: 'forms', labelKey: 'shortcuts.forms.close', keys: ['Escape'] },
  { id: 'form-next', group: 'forms', labelKey: 'shortcuts.forms.next', keys: ['Tab', 'shift+Tab'] }
]

export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = ['global', 'calendar', 'forms']

export const shortcutById = (id: string): ShortcutDef | undefined => SHORTCUTS.find((s) => s.id === id)

/** What a keyboard event carries that the matcher needs (a DOM KeyboardEvent or a React one). */
export interface KeyLike {
  key: string
  code?: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
}

/**
 * The Latin letter a key press means. On a Russian (or any non-Latin) layout the N key types "т": the physical key
 * (`KeyN`) is used then, so the shortcuts work whatever the keyboard language is.
 */
export function letterOf(e: KeyLike): string | null {
  if (/^[a-z]$/i.test(e.key)) return e.key.toLowerCase()
  if (e.key.length === 1 && !/^[\x20-\x7e]$/.test(e.key) && e.code && /^Key[A-Z]$/.test(e.code))
    return e.code.slice(3).toLowerCase()
  return null
}

/** Does this key press match one combination (`mod+k`, `n`, `?`, `F1`, `shift+Tab`)? */
export function matchesCombo(e: KeyLike, combo: string): boolean {
  const parts = combo.split('+')
  const key = parts[parts.length - 1] ?? ''
  const mods = new Set(parts.slice(0, -1))
  const mod = e.ctrlKey || e.metaKey
  if (mods.has('mod') !== mod) return false
  if (e.altKey) return false
  if (/^[a-z]$/.test(key)) {
    // Ctrl/⌘ combinations take no Shift (Ctrl+Shift+L is something else); a plain letter works with Caps Lock too.
    if (mod && e.shiftKey) return false
    return letterOf(e) === key
  }
  // Printed characters ("?", "/") come from Shift on many layouts: Shift is part of the character, not a modifier.
  if (key.length === 1) return e.key === key
  if (mods.has('shift') !== e.shiftKey) return false
  return e.key === key
}

export const matchesShortcut = (e: KeyLike, def: ShortcutDef): boolean =>
  def.keys.some((combo) => matchesCombo(e, combo))

/** The global shortcut a key press asks for, if any. */
export function globalShortcutFor(e: KeyLike): ShortcutDef | undefined {
  return SHORTCUTS.find((s) => s.action !== undefined && matchesShortcut(e, s))
}

/** Key caps as printed on the keyboard (the same in every language the program speaks). */
const KEY_CAPS: Record<string, string> = {
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  PageUp: 'Page Up',
  PageDown: 'Page Down',
  Escape: 'Esc',
  Enter: 'Enter',
  Home: 'Home',
  Tab: 'Tab'
}

/** The caps of one combination: `mod+k` → ["Ctrl", "K"] (["⌘", "K"] on a Mac). */
export function comboCaps(combo: string, mac: boolean): string[] {
  return combo.split('+').map((part) => {
    if (part === 'mod') return mac ? '⌘' : 'Ctrl'
    if (part === 'shift') return mac ? '⇧' : 'Shift'
    if (/^[a-z]$/.test(part)) return part.toUpperCase()
    return KEY_CAPS[part] ?? part
  })
}

/** A shortcut's first combination as a short hint beside a menu item or button: "Ctrl K", "⌘K". */
export function shortcutHint(id: string, mac: boolean): string {
  const combo = shortcutById(id)?.keys[0]
  if (!combo) return ''
  return comboCaps(combo, mac).join(mac ? '' : ' ')
}

/** One combination as plain text ("Ctrl + K"), for the written guide. */
export const comboText = (combo: string, mac: boolean): string => comboCaps(combo, mac).join(' + ')

/**
 * Is the key press aimed at a place where letters are text: an input that takes typing, a text area, a select, an
 * editable element or a combobox/search box? There the plain-key shortcuts stay quiet.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as {
    tagName?: string
    type?: string
    isContentEditable?: boolean
    getAttribute?: (name: string) => string | null
  } | null
  if (!el || typeof el.tagName !== 'string') return false
  const tag = el.tagName.toLowerCase()
  if (tag === 'textarea' || tag === 'select') return true
  if (el.isContentEditable) return true
  const role = el.getAttribute?.('role')
  if (role === 'textbox' || role === 'combobox' || role === 'searchbox' || role === 'spinbutton') return true
  if (tag !== 'input') return false
  const type = (el.type ?? 'text').toLowerCase()
  return !['button', 'checkbox', 'radio', 'range', 'reset', 'submit', 'color', 'file', 'image'].includes(type)
}
