// A message that outlives a screen change: after too many wrong unlock tries the window is signed out (the
// account itself is not locked); the sign-in screen the gate opens says why, once.
type Notice = 'unlockSignedOut'

let pending: Notice | null = null

export function leaveNotice(notice: Notice): void {
  pending = notice
}

/** The waiting notice (read it as initial state, then `clearNotice` once the screen has shown it). */
export function peekNotice(): Notice | null {
  return pending
}

export function clearNotice(): void {
  pending = null
}
