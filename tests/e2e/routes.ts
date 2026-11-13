// Every screen, for the overflow checks at 1366×768 and 390×844: the app's screens (signed in) and the screens
// outside the shell, by the sign-in state that shows them (the gate sends the window elsewhere otherwise).
export const SCREEN_ROUTES = [
  'calendar',
  'calendar-notes',
  'today',
  'in-house',
  'tasks',
  'shift',
  'rooms',
  'guests',
  'blacklist',
  'companies',
  'lost-items',
  'ledger',
  'month-end',
  'currency',
  'issues',
  'maintenance',
  'supply',
  'laundry',
  'camera',
  'contacts',
  'staff',
  'reports',
  'tourism',
  'settings?tab=general',
  'settings?tab=hotel',
  'settings?tab=rooms',
  'settings?tab=lists',
  'settings?tab=shifts',
  'settings?tab=tasks',
  'settings?tab=staff',
  'settings?tab=calendar',
  'settings?tab=tags',
  'settings?tab=currency',
  'settings?tab=camera',
  'settings?tab=remote',
  'settings?tab=backup',
  'settings?tab=users',
  'settings?tab=about',
  'theme-preview',
  'guide',
  'about',
  'audit'
] as const

/** Shown while nobody is signed in. */
export const SIGNED_OUT_ROUTES = ['login', 'recover'] as const
/** Shown while the hotel is not set up yet (fresh data folder). */
export const SETUP_ROUTES = ['setup', 'connect'] as const

/**
 * Horizontal overflow of the page: [] when nothing sticks out, else the amount and the elements that stick out
 * (outside any scrolling box), so a CI failure names the culprit. Runs in the page (no imports).
 */
export const overflowReport = (): string[] => {
  const width = document.documentElement.clientWidth
  const overflow = document.documentElement.scrollWidth - width
  if (overflow <= 0) return []
  const clipped = (el: Element): boolean => {
    for (let p = el.parentElement; p; p = p.parentElement)
      if (getComputedStyle(p).overflowX !== 'visible' && p.getBoundingClientRect().right <= width + 0.5)
        return true
    return false
  }
  const out = new Set(
    [...document.querySelectorAll('body *')].filter(
      (el) => el.getBoundingClientRect().right > width + 0.5 && !clipped(el)
    )
  )
  // The innermost boxes that stick out (a long word's span, not every box around it), in page order.
  const culprits = [...out]
    .filter((el) => ![...el.children].some((c) => out.has(c)))
    .slice(0, 5)
    .map(
      (el) =>
        `${el.tagName.toLowerCase()}.${String(el.getAttribute('class') ?? '').slice(0, 60)} "${(el.textContent ?? '').slice(0, 16)}"`
    )
  return [`overflow ${overflow}px`, ...culprits]
}
