// "Bu oturum" in the device list (G-144): which listed sign-in is this window's own.
import type { ProcedureOutput } from '@shared/contract'

type Device = ProcedureOutput<'auth.devices'>[number]

/**
 * The window's own sign-in: the signed-in person's most recently seen session on a device of this window's kind
 * (this computer over IPC; a browser or phone over HTTP), unless the service already marked it (`current`).
 */
export function currentSessionId(
  devices: readonly Device[],
  userId: string | null | undefined,
  transport: 'ipc' | 'http'
): string | null {
  if (!userId) return null
  // The service marks the caller's own session; the match below is for lists without the mark.
  for (const d of devices) for (const s of d.sessions) if (s.current) return s.id
  const kinds: readonly Device['kind'][] = transport === 'ipc' ? ['desktop'] : ['browser', 'mobile']
  let best: { id: string; seen: string } | null = null
  for (const d of devices) {
    if (d.revokedAt !== null || !kinds.includes(d.kind)) continue
    for (const s of d.sessions)
      if (s.userId === userId && (!best || s.lastSeenAt > best.seen)) best = { id: s.id, seen: s.lastSeenAt }
  }
  return best?.id ?? null
}
