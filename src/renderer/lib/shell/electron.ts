// The only renderer file (besides lib/transport) that touches the preload bridge `window.bismuth`.
import type { BismuthBridge } from '@shared/contract'
import { downloadFile } from './browser'
import type { Shell } from './types'

/** The preload bridge, present only inside the Electron window. */
export const electronBridge = (): BismuthBridge | undefined => window.bismuth

export function createElectronShell(bridge: BismuthBridge): Shell {
  return {
    kind: 'electron',
    platform: bridge.platform,
    ready: () => bridge.ready(),
    print: () => window.print(),
    saveFile: downloadFile
  }
}
