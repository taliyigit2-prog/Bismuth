// The window's sign-in state on the renderer side (G-22). The main process keeps the session token; the renderer
// only asks `auth.state` and reacts: a new user means new data, so every sign-in, sign-out, lock and unlock clears
// or refreshes the cached queries. Screens never call these procedures directly: they use the hooks below.
import { useCallback, useMemo, useRef } from 'react'
import { useQueryClient, type Query, type QueryClient } from '@tanstack/react-query'
import type { AuthState, Me } from '@shared/contract'
import { setViewAs } from '../view-as'
import { useApiMutation, useApiQuery } from '../api/hooks'

export const AUTH_STATE_KEY = ['auth.state', {}] as const
/** Kept across a change of user: the sign-in state itself and the display settings (language, theme). */
const KEEP = new Set(['auth.state', 'settings.get'])
const changesWithUser = (query: Query): boolean => !KEEP.has(String(query.queryKey[0]))

/** When the window was locked from this screen (the lock screen shows it); unknown after a restart. */
let lockedAt: Date | null = null
export const lastLockedAt = (): Date | null => lockedAt

/**
 * Signed out on purpose ("Oturumu kapat", "Başka kullanıcı"): the next person starts on their own start screen,
 * not on the screen the previous one left open (an ended session or a typed address keeps it).
 */
let placeForgotten = false
export const placeIsForgotten = (): boolean => placeForgotten
/** Someone is signed in again (here or by a restart): nothing is forgotten any more. */
export const rememberPlace = (): void => {
  placeForgotten = false
}

/** What the window shows at start and after every sign-in change (layouts/auth-gate.tsx). */
export function useAuthState() {
  return useApiQuery('auth.state', {}, { staleTime: Infinity })
}

/** Who is signed in to this window (null: nobody, or not known yet). */
export function useMe(): Me | null {
  return useAuthState().data?.session ?? null
}

const setSession = (client: QueryClient, session: Me | null): void => {
  client.setQueryData<AuthState>(AUTH_STATE_KEY, (old) =>
    old ? { ...old, setup: session ? 'done' : old.setup, session } : old
  )
}

const refetchShared = (client: QueryClient): Promise<unknown> =>
  Promise.all([
    client.invalidateQueries({ queryKey: AUTH_STATE_KEY }),
    client.invalidateQueries({ queryKey: ['settings.get'] })
  ])

/** Drops the earlier user's data that no screen shows any more; what is still on screen is marked stale. */
const forgetUserData = (client: QueryClient): void => {
  client.removeQueries({ predicate: (q) => changesWithUser(q) && q.getObserversCount() === 0 })
  void client.invalidateQueries({ predicate: changesWithUser, refetchType: 'none' })
}

/**
 * The sign-in changes this window went through, applied to the query cache; the gate (layouts/auth-gate.tsx)
 * follows `auth.state` to the right screen. The setup wizard calls `signedIn(me)` with `setup.finish`'s `me` when
 * the owner leaves the recovery codes screen.
 */
export function sessionEvents(client: QueryClient) {
  return {
    signedIn(me: Me): Promise<unknown> {
      setViewAs(null)
      lockedAt = null
      placeForgotten = false
      setSession(client, me)
      forgetUserData(client)
      return refetchShared(client)
    },
    signedOut(): Promise<unknown> {
      setViewAs(null)
      lockedAt = null
      placeForgotten = true
      void client.cancelQueries({ predicate: changesWithUser })
      setSession(client, null)
      forgetUserData(client)
      return refetchShared(client)
    },
    locked(): Promise<unknown> {
      lockedAt = new Date()
      client.setQueryData<AuthState>(AUTH_STATE_KEY, (old) =>
        old?.session ? { ...old, session: { ...old.session, locked: true } } : old
      )
      void client.invalidateQueries({ predicate: changesWithUser, refetchType: 'none' })
      return client.invalidateQueries({ queryKey: AUTH_STATE_KEY })
    },
    unlocked(me: Me): Promise<unknown> {
      lockedAt = null
      setSession(client, me)
      void client.invalidateQueries({ predicate: changesWithUser, refetchType: 'none' })
      return refetchShared(client)
    },
    /**
     * P21b (client mode): another hotel's main computer is in use (or none): nothing of the earlier hotel stays in
     * the cache, not even what a screen still shows; the window starts over at its sign-in.
     */
    async hotelChanged(): Promise<unknown> {
      setViewAs(null)
      lockedAt = null
      placeForgotten = true
      await client.cancelQueries({ predicate: changesWithUser })
      setSession(client, null)
      // The connection screen's own questions stay (they are asked again); the hotel's data goes.
      const hotelData = (q: Query): boolean =>
        changesWithUser(q) && !String(q.queryKey[0]).startsWith('remote.')
      client.removeQueries({ predicate: hotelData })
      void client.invalidateQueries({ queryKey: ['remote.hotels'] })
      return refetchShared(client)
    },
    /** Ask again (password changed, PIN set, mode changed, a call said the session is gone). */
    refresh(): Promise<unknown> {
      return client.invalidateQueries({ queryKey: AUTH_STATE_KEY })
    }
  }
}
export type SessionEvents = ReturnType<typeof sessionEvents>

export function useSessionEvents(): SessionEvents {
  const client = useQueryClient()
  return useMemo(() => sessionEvents(client), [client])
}

// ── Sign-in actions (each one updates the session when it succeeds) ────────────────────────────────────────

export function useSignIn() {
  const events = useSessionEvents()
  return useApiMutation('auth.signIn', { onSuccess: (me) => events.signedIn(me) })
}

export function useSignInWithPin() {
  const events = useSessionEvents()
  return useApiMutation('auth.signInWithPin', { onSuccess: (me) => events.signedIn(me) })
}

export function useSignOut() {
  const events = useSessionEvents()
  return useApiMutation('auth.signOut', { onSuccess: () => events.signedOut() })
}

export function useLock() {
  const events = useSessionEvents()
  return useApiMutation('auth.lock', { onSuccess: () => events.locked() })
}

export function useUnlock() {
  const events = useSessionEvents()
  return useApiMutation('auth.unlock', { onSuccess: (me) => events.unlocked(me) })
}

/** Own password: after a forced change the account gets its role's rights (auth.state again). */
export function useChangePassword() {
  const events = useSessionEvents()
  return useApiMutation('auth.changePassword', { onSuccess: () => events.refresh() })
}

export function useSetPin() {
  const events = useSessionEvents()
  return useApiMutation('auth.setPin', { onSuccess: () => events.refresh() })
}

/** Locks the window once (repeated triggers while the call runs do nothing): menu, shortcut, idle timer. */
export function useLockNow(): () => void {
  const { mutate } = useLock()
  const pending = useRef(false)
  return useCallback(() => {
    if (pending.current) return
    pending.current = true
    mutate({}, { onSettled: () => (pending.current = false) })
  }, [mutate])
}
