// Light mode (Faz 22 P22a): on the hotel's main computer closing the window can leave the program in the tray with the
// server running; the screens are then used in the computer's own browser through the server mode's own address
// (no new listener). Electron-free so the rules are unit-tested; the tray itself is `tray.ts`.
import type { SettingsValues } from '@shared/contract/settings'

/** The setting asks for it: light mode is on and this computer is the main computer (server mode). */
export function lightModeWanted(values: Pick<SettingsValues, 'app.lightMode' | 'app.mode'>): boolean {
  return values['app.lightMode'] && values['app.mode'] === 'host'
}

/**
 * Whether the program stays alive after its last window closed. Only while the server really answers (a failed server
 * would leave an invisible program nobody can reach), never while quitting, never in a smoke run.
 */
export function keepRunningWithoutWindow(state: {
  wanted: boolean
  serverRunning: boolean
  quitting: boolean
  smoke: boolean
}): boolean {
  return state.wanted && state.serverRunning && !state.quitting && !state.smoke
}

/** The address the tray's "open in browser" uses: this computer's own, on the server's port. */
export const browserUrl = (port: number): string => `http://127.0.0.1:${port}/`
