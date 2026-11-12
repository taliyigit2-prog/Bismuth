// One listener per allowed address (net.ts listenAddresses): this computer, the local network and the private
// network — never 0.0.0.0. NetBird often comes up after Bismuth (Windows service start order), so the controller
// calls `sync` again every half minute and a new address gets its own listener.
import { createServer, type Server } from 'node:http'
import { getRequestListener } from '@hono/node-server'

type FetchHandler = (request: Request, env: Record<string, unknown>) => Response | Promise<Response>

export interface Listeners {
  /** Addresses with a running listener. */
  addresses(): string[]
  /** Opens listeners for new addresses and closes the ones that disappeared. Rejects with the first error of a new one. */
  sync(addresses: string[]): Promise<void>
  close(): Promise<void>
}

/** Connections one listener keeps open at the same time (N-1); more are closed at once. */
export const MAX_CONNECTIONS = 64

export function createListeners(
  fetch: FetchHandler,
  port: number,
  options: { maxConnections?: number } = {}
): Listeners {
  const listener = getRequestListener(fetch)
  const servers = new Map<string, Server>()

  const open = (address: string): Promise<void> =>
    new Promise((resolve, reject) => {
      const server = createServer(listener)
      // A few phones, the other computers and the copy's change feed need far fewer; endless idle sockets from one
      // caller cannot exhaust the hotel computer's file handles or memory.
      server.maxConnections = options.maxConnections ?? MAX_CONNECTIONS
      // Slow or idle sockets do not pile up on the hotel's small computer.
      server.headersTimeout = 15_000
      server.requestTimeout = 60_000
      server.keepAliveTimeout = 5_000
      const onError = (error: Error) => {
        server.close()
        reject(error)
      }
      server.once('error', onError)
      server.listen({ port, host: address, exclusive: true }, () => {
        server.off('error', onError)
        servers.set(address, server)
        resolve()
      })
    })

  const shut = (address: string): Promise<void> =>
    new Promise((resolve) => {
      const server = servers.get(address)
      servers.delete(address)
      if (!server) return resolve()
      server.close(() => resolve())
      server.closeAllConnections()
    })

  return {
    addresses: () => [...servers.keys()],
    async sync(addresses) {
      const wanted = new Set(addresses)
      for (const address of [...servers.keys()]) if (!wanted.has(address)) await shut(address)
      let first: unknown = null
      for (const address of wanted) {
        if (servers.has(address)) continue
        try {
          await open(address)
        } catch (error) {
          first ??= error
        }
      }
      if (first) throw first
    },
    async close() {
      await Promise.all([...servers.keys()].map(shut))
    }
  }
}
