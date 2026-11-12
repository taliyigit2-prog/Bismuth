// The renderer's only door to the main process (sandboxed preload; @electron-toolkit/preload is
// deliberately NOT used because it exposes raw ipcRenderer for every channel).
import { contextBridge, ipcRenderer } from 'electron'
import { API_CHANNEL, READY_CHANNEL } from '@shared/contract/channels'
import type { BismuthBridge, SerializedRequest } from '@shared/contract/transport'

const bridge: BismuthBridge = {
  api: (request: SerializedRequest) => ipcRenderer.invoke(API_CHANNEL, request),
  ready: () => ipcRenderer.send(READY_CHANNEL),
  platform: process.platform
}

contextBridge.exposeInMainWorld('bismuth', bridge)
