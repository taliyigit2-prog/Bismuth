// Keyboard conventions of the computer the window runs on (⌘ on a Mac, Ctrl elsewhere).

export const isMacLike = (): boolean =>
  window.bismuth?.platform === 'darwin' || /Mac|iPhone|iPad/.test(navigator.userAgent)

// The keyboard shortcuts themselves (lock, search…) are listed in lib/shortcuts/registry.ts.
