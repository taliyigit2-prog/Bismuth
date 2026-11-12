// The sign-in state of one caller, as the router's handlers see it: a desktop window (main process keeps the
// token, the renderer never sees it) or, in server mode (Faz 13), an HTTP client with a session cookie.
import type { DeviceInfo } from '@shared/contract/users'

export interface SessionBinding {
  /** The device this caller is: the desktop's saved id and name (the renderer never sends device data). */
  device(): DeviceInfo
  /** A sign-in succeeded: keep the token for this caller and remember the device id for the next sign-in. */
  signedIn(result: { token: string; deviceId: string }): void
  /** Forget this caller's session (sign-out, or the session no longer resolves). */
  signedOut(): void
  /** Lock / unlock the caller: while locked only unlock, sign-out and the public procedures answer. */
  lock(): void
  unlock(): void
  /** A wrong unlock attempt on this caller: returns how many in a row (the handler signs out after a few). */
  unlockFailed(): number
}
