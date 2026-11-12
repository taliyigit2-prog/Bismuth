// Applies the theme setting (light / dark / system, G-17), the owner's status and accent colours (<style
// id="user-theme">, faz-01 madde 7, faz-15 madde 6) and the text size to the document, and keeps "system" in sync
// with the OS.
import { useEffect, useSyncExternalStore } from 'react'
import type { SettingsValues } from '@shared/contract'
import { buildUserThemeCss } from './user-theme'

const media = (): MediaQueryList | null =>
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null

function subscribeSystem(callback: () => void): () => void {
  const mq = media()
  mq?.addEventListener('change', callback)
  return () => mq?.removeEventListener('change', callback)
}

const systemPrefersDark = (): boolean => media()?.matches ?? false

let currentTheme: SettingsValues['ui.theme'] = 'system'
const themeListeners = new Set<() => void>()

export function resolveTheme(theme: SettingsValues['ui.theme'], prefersDark: boolean): 'light' | 'dark' {
  return theme === 'system' ? (prefersDark ? 'dark' : 'light') : theme
}

/** Resolved theme for components that need it in JS (e.g. toasts). */
export function useResolvedTheme(): 'light' | 'dark' {
  const prefersDark = useSyncExternalStore(subscribeSystem, systemPrefersDark, () => false)
  const theme = useSyncExternalStore(
    (cb) => {
      themeListeners.add(cb)
      return () => themeListeners.delete(cb)
    },
    () => currentTheme,
    () => 'system' as const
  )
  return resolveTheme(theme, prefersDark)
}

export function applyAppearance(settings: SettingsValues, prefersDark = systemPrefersDark()): void {
  const root = document.documentElement
  const resolved = resolveTheme(settings['ui.theme'], prefersDark)
  root.classList.toggle('dark', resolved === 'dark')
  root.dataset['density'] = settings['ui.density']
  // Larger text (faz-15 madde 5): the root size grows, everything in rem follows (globals.css).
  root.dataset['fontSize'] = settings['ui.fontSize']

  let style = document.getElementById('user-theme')
  if (!style) {
    style = document.createElement('style')
    style.id = 'user-theme'
    document.head.appendChild(style)
  }
  style.textContent = buildUserThemeCss(settings['ui.statusColors'], settings['ui.statusColorsDark'], {
    light: settings['ui.accentColor'],
    dark: settings['ui.accentColorDark']
  })

  if (currentTheme !== settings['ui.theme']) {
    currentTheme = settings['ui.theme']
    for (const l of themeListeners) l()
  }
}

/** Mount once under the settings query: re-applies on every settings change and on OS theme changes. */
export function ThemeSync({ settings }: { settings: SettingsValues }) {
  const prefersDark = useSyncExternalStore(subscribeSystem, systemPrefersDark, () => false)
  useEffect(() => applyAppearance(settings, prefersDark), [settings, prefersDark])
  return null
}
