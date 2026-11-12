import type { BismuthBridge } from '../shared/contract/transport'

declare global {
  interface Window {
    /** Present only inside the Electron window; absent in a browser (server mode). */
    bismuth?: BismuthBridge
  }
}

export {}
