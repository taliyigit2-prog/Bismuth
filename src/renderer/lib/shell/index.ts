import { createBrowserShell } from './browser'
import { createElectronShell, electronBridge } from './electron'
import type { Shell } from './types'

/** Chosen when used, by the same test as the transport: the preload bridge exists → Electron window, else browser. */
export function createShell(): Shell {
  const bridge = electronBridge()
  return bridge ? createElectronShell(bridge) : createBrowserShell()
}

/** The shell of the window the screens run in. Resolved at call time (cheap), so tests can add or drop the bridge. */
export const shell: Shell = {
  get kind() {
    return createShell().kind
  },
  get platform() {
    return createShell().platform
  },
  ready: () => createShell().ready(),
  print: () => createShell().print(),
  saveFile: (file) => createShell().saveFile(file)
}

export const useShell = (): Shell => shell

export type { Shell, ShellFile } from './types'
