// Where the window may be (faz-04 madde 2): the setup wizard until the hotel is set up (or the connection screen
// in client mode), sign-in when nobody is signed in, the lock screen when locked, the forced password change when
// someone else set the password, otherwise the app. Pure, so every rule is unit-tested; layouts/auth-gate.tsx
// applies it. Hiding screens is comfort only: the router and the services refuse the calls anyway (G-23).
import type { AuthState } from '@shared/contract'

/** Screens without the menu and the top bar. */
export const BARE_PATHS = ['/setup', '/connect', '/login', '/recover', '/lock', '/change-password'] as const
export type BarePath = (typeof BARE_PATHS)[number]

export const isBarePath = (pathname: string): pathname is BarePath =>
  (BARE_PATHS as readonly string[]).includes(pathname)

export interface GateLocation {
  pathname: string
  /** Parsed search of the current route (`redirect` is read from it). */
  search: Record<string, unknown>
  /** Path and query of the current location, e.g. `/settings?tab=roles`. */
  href: string
}

/** A redirect target is an address inside the app: never a bare screen, never another origin. */
export function safeRedirect(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return null
  const pathname = value.split(/[?#]/, 1)[0] ?? ''
  if (pathname === '/' || isBarePath(pathname)) return null
  return value
}

const withRedirect = (path: BarePath, redirect: string | null): string =>
  redirect ? `${path}?${new URLSearchParams({ redirect }).toString()}` : path

/**
 * The address the window must go to, or null when it may stay. A typed app address is kept in `?redirect=` while
 * the window passes the sign-in, lock and password screens, and opened once the app is allowed.
 */
export function gateRedirect(state: AuthState, location: GateLocation): string | null {
  const { pathname } = location
  const bare = isBarePath(pathname)
  // The address to come back to: the current app screen, or the one a bare screen already carries.
  const back = bare ? safeRedirect(location.search['redirect']) : safeRedirect(location.href)

  if (state.setup === 'needed') {
    // Both are open while the hotel is not set up: the wizard switches to the connection screen and back.
    if (pathname === '/setup' || pathname === '/connect') return null
    return state.mode === 'client' ? '/connect' : '/setup'
  }

  const session = state.session
  if (!session) {
    if (pathname === '/login' || pathname === '/recover') return null
    return withRedirect('/login', back)
  }
  if (session.locked) return pathname === '/lock' ? null : withRedirect('/lock', back)
  if (session.user.mustChange)
    return pathname === '/change-password' ? null : withRedirect('/change-password', back)

  // Signed in and free: the bare screens have nothing more to say.
  return bare ? (back ?? '/') : null
}
