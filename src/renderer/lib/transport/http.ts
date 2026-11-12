import {
  procedurePath,
  type ProcedureInput,
  type ProcedureName,
  type ProcedureOutput
} from '@shared/contract'
import { connection } from './connection'
import { decodeResponse } from './decode'
import { ApiError, type Transport } from './types'

type FetchLike = (input: string, init: RequestInit) => Promise<Response>

/**
 * Browser (phone, laptop) → the hotel's main computer in server mode (faz-13 madde 3). Same envelope as IPC:
 * POST /api/<procedure> with a JSON body; the session and device cookies are HttpOnly, sent by the browser and
 * never readable here. Every answer carries the main computer's version: when it changes (the program there was
 * updated while this page stayed open) the page must be reloaded before anything else is written.
 */
export function createHttpTransport(
  baseUrl: string,
  doFetch: FetchLike = (i, init) => fetch(i, init)
): Transport {
  const base = baseUrl.replace(/\/+$/, '')
  let seenVersion: string | null = null
  async function callWithStatus<K extends ProcedureName>(
    name: K,
    input: ProcedureInput<K>
  ): Promise<{ output: ProcedureOutput<K>; status: number }> {
    let res: Response
    try {
      res = await doFetch(`${base}${procedurePath(name)}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input ?? {})
      })
    } catch {
      throw new ApiError('NETWORK', 0, 'errors.network')
    }
    const version = res.headers.get('x-bismuth-version')
    if (version) {
      seenVersion ??= version
      if (version !== seenVersion) {
        connection.outdated()
        throw new ApiError('UNAVAILABLE', 503, 'errors.hostVersion')
      }
    }
    return { output: decodeResponse<K>(res.status, await res.text()), status: res.status }
  }
  return {
    kind: 'http',
    callWithStatus,
    async call<K extends ProcedureName>(name: K, input: ProcedureInput<K>): Promise<ProcedureOutput<K>> {
      return (await callWithStatus(name, input)).output
    }
  }
}
