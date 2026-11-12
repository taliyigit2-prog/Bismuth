// The link to the hotel's main computer as the screens see it (faz-13 madde 3): a phone or browser (HTTP) and a
// computer in client mode (IPC through the main process) can lose it; the hotel's own computer never does. Every
// call reports here; the top bar shows the state, and while it is not `online` writes are closed ("yazma kapalı":
// P13b's read-only copy hangs its buttons on `useWritesBlocked`).
import { useSyncExternalStore } from 'react'
import { ApiError } from './types'

/**
 * online = answers; offline = cannot be reached; outdated = the main computer runs another Bismuth version;
 * readonly = answers come from a read-only copy (P13b: the owner's copy while the main computer is away, or a
 * computer another one took over from) — everything shows, nothing can be changed.
 */
export type ConnectionStatus = 'online' | 'offline' | 'outdated' | 'readonly'

export interface ConnectionSnapshot {
  status: ConnectionStatus
  /** When the current state began (ms). */
  since: number | null
  /** Last successful answer (ms). */
  lastOkAt: number | null
}

type Listener = () => void

export function createConnectionStore(clock: () => number = () => Date.now()) {
  let snapshot: ConnectionSnapshot = { status: 'online', since: null, lastOkAt: null }
  const listeners = new Set<Listener>()
  const set = (next: ConnectionSnapshot): void => {
    snapshot = next
    for (const l of listeners) l()
  }
  return {
    get: (): ConnectionSnapshot => snapshot,
    subscribe(listener: Listener): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    /** A call answered. An outdated main computer stays outdated: only reloading the page clears it. */
    ok(): void {
      if (snapshot.status === 'outdated') return
      const now = clock()
      set({ status: 'online', since: snapshot.status === 'online' ? snapshot.since : now, lastOkAt: now })
    },
    lost(): void {
      if (snapshot.status === 'offline' || snapshot.status === 'outdated') return
      set({ ...snapshot, status: 'offline', since: clock() })
    },
    /** An answer from a read-only copy (status 203). */
    readOnly(): void {
      if (snapshot.status === 'outdated') return
      const now = clock()
      set({ status: 'readonly', since: snapshot.status === 'readonly' ? snapshot.since : now, lastOkAt: now })
    },
    outdated(): void {
      if (snapshot.status === 'outdated') return
      set({ ...snapshot, status: 'outdated', since: clock() })
    },
    /** Tests. */
    reset(): void {
      set({ status: 'online', since: null, lastOkAt: null })
    }
  }
}

export const connection = createConnectionStore()

/** Which failures mean "the main computer is away" or "a different version answers". */
export function connectionFailure(error: unknown): 'lost' | 'outdated' | null {
  if (!(error instanceof ApiError)) return null
  if (error.code === 'NETWORK') return 'lost'
  if (error.code === 'UNAVAILABLE') return error.messageKey === 'errors.hostVersion' ? 'outdated' : 'lost'
  return null
}

export function useConnection(): ConnectionSnapshot {
  return useSyncExternalStore(connection.subscribe, connection.get)
}

/** Answers come from a read-only copy: every edit right is off (useCan) and the strip says why. */
export function useReadOnlyCopy(): boolean {
  return useConnection().status === 'readonly'
}

/** Writes are closed while the main computer is away, runs another version, or a read-only copy answers. */
export function useWritesBlocked(): boolean {
  return useConnection().status !== 'online'
}
