// Which settings writes change this computer's own window: its native theme, its menu language and the language of
// its next start (`--lang`). The language and the theme are each person's own choice (K-37): a change made on a
// phone or another computer belongs to that screen, never to the hotel computer's window (QA2c #2). No Electron
// import: tested with plain Node.
import type { SettingsKey } from '@shared/contract'
import type { Ctx } from '../services/context'

const DISPLAY_KEYS: readonly SettingsKey[] = ['ui.language', 'ui.theme']

/**
 * True when a write of `changed` by `by` should be applied to the window: made in this computer's window (IPC) by
 * the person signed in there (or by nobody, in the setup wizard), or announced by the program itself (`by` null).
 */
export function displayFollows(
  changed: readonly SettingsKey[],
  by: Pick<Ctx, 'transport' | 'userId'> | null,
  windowUserId: string | null
): boolean {
  if (!changed.some((key) => DISPLAY_KEYS.includes(key))) return false
  if (by === null) return true
  return by.transport === 'ipc' && by.userId === windowUserId
}
