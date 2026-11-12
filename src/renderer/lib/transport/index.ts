import { connection, connectionFailure } from './connection'
import { createHttpTransport } from './http'
import { createIpcTransport } from './ipc'
import type { Transport } from './types'

/** Every answer (or failure to reach the main computer) is reported to the connection state the top bar shows. */
export function withConnection(inner: Transport, store: typeof connection = connection): Transport {
  return {
    kind: inner.kind,
    async call(name, input) {
      try {
        if (!inner.callWithStatus) {
          const out = await inner.call(name, input)
          store.ok()
          return out
        }
        const { output, status } = await inner.callWithStatus(name, input)
        // 203: the read-only copy answered (P13b); 202: the client computer answered itself (connection screen,
        // the copy's own state) — that says nothing about the main computer.
        if (status === 203) store.readOnly()
        else if (status !== 202) store.ok()
        return output
      } catch (error) {
        const failure = connectionFailure(error)
        if (failure === 'lost') store.lost()
        else if (failure === 'outdated') store.outdated()
        // The main computer (or the copy) answered with a refusal: a copy stays a copy.
        else if (store.get().status !== 'readonly') store.ok()
        throw error
      }
    }
  }
}

/** Inside Electron the preload bridge exists → IPC; in a browser → HTTP to the page's own origin. */
export function createTransport(): Transport {
  return withConnection(
    window.bismuth ? createIpcTransport(window.bismuth) : createHttpTransport(window.location.origin)
  )
}

export { ApiError, type Transport } from './types'
export {
  connection,
  useConnection,
  useReadOnlyCopy,
  useWritesBlocked,
  type ConnectionStatus
} from './connection'
