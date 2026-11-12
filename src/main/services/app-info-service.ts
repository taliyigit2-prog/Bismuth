import type { AppInfo } from '@shared/contract'
import { buildStamp } from '../build-stamp'
import type { DatabaseHandle } from '../db/client'
import type { Ctx } from './context'

export interface RuntimeInfo {
  name: string
  version: string
  packaged: boolean
  dataDir: string
  electron: string | null
  chrome: string | null
}

export interface AppInfoService {
  get(ctx: Ctx): AppInfo
}

export function createAppInfoService(handle: DatabaseHandle, runtime: RuntimeInfo): AppInfoService {
  return {
    get(ctx) {
      return {
        name: runtime.name,
        version: runtime.version,
        build: buildStamp(),
        versions: {
          electron: runtime.electron,
          chrome: runtime.chrome,
          node: process.versions.node,
          sqlite: handle.sqliteVersion
        },
        platform: process.platform,
        arch: process.arch,
        packaged: runtime.packaged,
        // The data folder path is only shown to people who may manage settings, in the hotel computer's own window
        // (N-9: a phone learns no local paths).
        dataDir: ctx.can('settings', 'view') && ctx.transport === 'ipc' ? runtime.dataDir : '',
        schemaVersion: handle.schemaVersion,
        integrity: handle.integrity,
        transport: ctx.transport
      }
    }
  }
}
