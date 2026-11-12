// Tests only (D9, moved out of src/main/server): a plain HTTP server over the shared router and the React bundle,
// without the server mode's front door (host-app.ts: host names, addresses, CSRF, limits). The phone e2e harness
// (server.ts) and the router test use it on 127.0.0.1; the program itself never ships it.
import { serve, type ServerType } from '@hono/node-server'
import { Hono } from 'hono'
import type { ApiEnv } from '../../../src/main/api/app'
import { CSP, readStatic } from '../../../src/main/server/static'

export interface ServerOptions {
  api: Hono<ApiEnv>
  /** Folder with the built renderer (out/renderer). */
  staticRoot: string
  port: number
  hostname: string
}

export interface RunningServer {
  port: number
  close(): Promise<void>
}

export function createServerApp(options: Pick<ServerOptions, 'api' | 'staticRoot'>): Hono<ApiEnv> {
  const app = new Hono<ApiEnv>()
  app.use('*', async (c, next) => {
    await next()
    c.header('Content-Security-Policy', CSP)
    c.header('X-Content-Type-Options', 'nosniff')
    c.header('Referrer-Policy', 'no-referrer')
    c.header('X-Frame-Options', 'DENY')
  })
  app.route('/', options.api)
  app.get('*', async (c) => {
    const file = await readStatic(options.staticRoot, c.req.path)
    if (!file) return c.text('Not found', 404)
    return c.body(file.body as unknown as ArrayBuffer, 200, { 'Content-Type': file.type })
  })
  return app
}

export function startServer(options: ServerOptions): Promise<RunningServer> {
  const app = createServerApp(options)
  return new Promise((resolvePromise) => {
    const server: ServerType = serve(
      { fetch: app.fetch, port: options.port, hostname: options.hostname },
      (info) => {
        resolvePromise({
          port: info.port,
          close: () => new Promise((done) => server.close(() => done()))
        })
      }
    )
  })
}
