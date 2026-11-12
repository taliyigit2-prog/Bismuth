// Sign-in state of the desktop windows (G-22, faz-04 madde 2). The main process keeps each window's session
// token; the renderer never sees it (one IPC channel, no token in JS). Electron-free so it is unit-testable:
// windows are plain numbers (WebContents ids).
import type { DeviceInfo } from '@shared/contract/users'
import type { SessionBinding } from '../api/session'
import { anonymousCtx, lockedCtx, setupCtx, type Ctx } from '../services/context'

export interface DesktopSessionDeps {
  /** True once the hotel is set up (an account exists). Before that every window is the setup wizard. */
  setupDone(): boolean
  /** The wizard may still write: not set up and this computer is not set to use another one (client mode). */
  setupOpen(): boolean
  /** The live session of a token (expired, revoked or unknown → null). */
  resolve(token: string): { userId: string; deviceId: string } | null
  /** ctx of a signed-in user (null when the account can no longer sign in). */
  userCtx(userId: string, deviceId: string): Ctx | null
  /** Ends a session server-side (sign-out, window closed, replaced by another sign-in). */
  endSession(token: string): void
  /** This computer's device id from an earlier sign-in (kept in userData), and where to keep a new one. */
  loadDeviceId(): string | null
  saveDeviceId(id: string): void
  deviceName(): string
  platform: string
  /** A window's person changed (signed in, out, switched): the main process applies their display choices. */
  sessionChanged?(windowId: number): void
}

interface WindowSession {
  token: string
  locked: boolean
  unlockFailures: number
}

export function createDesktopSessions(deps: DesktopSessionDeps) {
  const windows = new Map<number, WindowSession>()
  const deviceRef = (): string => deps.loadDeviceId() ?? 'desktop'

  function ctxFor(windowId: number): Ctx {
    if (!deps.setupDone()) return setupCtx(deviceRef(), 'ipc', deps.setupOpen)
    const entry = windows.get(windowId)
    if (!entry) return anonymousCtx(deviceRef(), 'ipc')
    const live = deps.resolve(entry.token)
    if (!live) {
      windows.delete(windowId)
      return anonymousCtx(deviceRef(), 'ipc')
    }
    if (entry.locked) return lockedCtx(live.userId, live.deviceId, 'ipc')
    return deps.userCtx(live.userId, live.deviceId) ?? anonymousCtx(deviceRef(), 'ipc')
  }

  function binding(windowId: number): SessionBinding {
    return {
      device(): DeviceInfo {
        const deviceId = deps.loadDeviceId()
        return {
          ...(deviceId ? { deviceId } : {}),
          deviceName: deps.deviceName(),
          kind: 'desktop',
          platform: deps.platform
        }
      },
      signedIn({ token, deviceId }) {
        const previous = windows.get(windowId)
        // Quick user switch: the earlier person's session ends, it is not left open behind the new one.
        if (previous && previous.token !== token) deps.endSession(previous.token)
        windows.set(windowId, { token, locked: false, unlockFailures: 0 })
        deps.sessionChanged?.(windowId)
        // Remembering the device is a convenience: failing to write it must not fail the sign-in.
        try {
          if (deps.loadDeviceId() !== deviceId) deps.saveDeviceId(deviceId)
        } catch {
          // The next sign-in registers the device again.
        }
      },
      signedOut() {
        const entry = windows.get(windowId)
        // Forget the window first: even if ending the session in the database fails, this window is signed out.
        windows.delete(windowId)
        if (entry) deps.endSession(entry.token)
        deps.sessionChanged?.(windowId)
      },
      lock() {
        const entry = windows.get(windowId)
        if (entry) entry.locked = true
      },
      unlock() {
        const entry = windows.get(windowId)
        if (entry) Object.assign(entry, { locked: false, unlockFailures: 0 })
      },
      unlockFailed() {
        const entry = windows.get(windowId)
        if (!entry) return 0
        entry.unlockFailures += 1
        return entry.unlockFailures
      }
    }
  }

  /** The window closed: its session ends with it. */
  function closed(windowId: number): void {
    binding(windowId).signedOut()
  }

  /** The computer was locked or went to sleep: every signed-in window locks too. */
  function lockAll(): void {
    for (const entry of windows.values()) entry.locked = true
  }

  return { ctxFor, binding, closed, lockAll }
}
export type DesktopSessions = ReturnType<typeof createDesktopSessions>
