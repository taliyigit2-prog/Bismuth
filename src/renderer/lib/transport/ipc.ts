import {
  procedurePath,
  type BismuthBridge,
  type ProcedureInput,
  type ProcedureName,
  type ProcedureOutput
} from '@shared/contract'
import { decodeResponse } from './decode'
import type { Transport } from './types'

/** Electron window → preload bridge → ipcMain → the shared Hono router (no port, no fetch). */
export function createIpcTransport(bridge: BismuthBridge): Transport {
  async function callWithStatus<K extends ProcedureName>(
    name: K,
    input: ProcedureInput<K>
  ): Promise<{ output: ProcedureOutput<K>; status: number }> {
    const res = await bridge.api({ path: procedurePath(name), body: JSON.stringify(input ?? {}) })
    return { output: decodeResponse<K>(res.status, res.body), status: res.status }
  }
  return {
    kind: 'ipc',
    callWithStatus,
    async call<K extends ProcedureName>(name: K, input: ProcedureInput<K>): Promise<ProcedureOutput<K>> {
      return (await callWithStatus(name, input)).output
    }
  }
}
