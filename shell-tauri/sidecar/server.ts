// P22c prototype: the hotel's services as a plain Node process (no Electron), serving the built renderer and /api on
// 127.0.0.1 only. The Tauri shell starts it and opens its window on it; the renderer talks HTTP (client-mode transport).
// Same router, sessions and CSP as server mode (src/main/server/host-app.ts); only the wiring below is new.
//   node server.mjs --data <folder with bismuth.db> --renderer <out/renderer> --migrations <drizzle> --port <n>
// shortcut: no Electron-only parts (safeStorage seal of host-secret, Drive box, replica feed, camera, tray, discovery);
// first-run setup is refused over HTTP (access 'setup' is IPC-only), so the folder must come from an installed hotel.
import { createServer } from 'node:http'
import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { getRequestListener } from '@hono/node-server'
import { createApiApp } from '../../src/main/api/app'
import { createHandlers } from '../../src/main/api/handlers'
import { openDatabase } from '../../src/main/db/client'
import { seedBaseData } from '../../src/main/db/seed/seed'
import { createServices } from '../../src/main/services'
import { remoteAccessOfUser } from '../../src/main/services/auth-service'
import { readSetting } from '../../src/main/services/settings-service'
import { ctxForUser } from '../../src/main/services/users-service'
import { httpAuthHandlers } from '../../src/main/server/auth-handlers'
import { createHostApp } from '../../src/main/server/host-app'
import { loadHostSecret } from '../../src/main/server/host-identity'
import { createHttpSessions } from '../../src/main/server/http-sessions'

const arg = (name: string, fallback?: string): string => {
  const i = process.argv.indexOf(`--${name}`)
  const v = i >= 0 ? process.argv[i + 1] : fallback
  if (!v) throw new Error(`missing --${name}`)
  return v
}

async function main(): Promise<void> {
  const data = resolve(arg('data'))
  const port = Number(arg('port', '47931'))
  mkdirSync(join(data, 'backups'), { recursive: true })
  const handle = await openDatabase({
    file: join(data, 'bismuth.db'),
    migrationsFolder: resolve(arg('migrations')),
    backupDir: join(data, 'backups')
  })
  seedBaseData(handle.db)
  const services = createServices(
    handle,
    { name: 'Bismuth', version: 'tauri-proto', packaged: false, dataDir: data, electron: null, chrome: null },
    { backupsDir: join(data, 'backups'), attachmentsDir: join(data, 'attachments') }
  )
  const db = handle.db
  const secret = loadHostSecret(join(data, 'host-secret.key'))
  const sessions = createHttpSessions({
    setupDone: () => services.setup.isDone(),
    resolve: (token, ip) => services.auth.resolveSession(token, ip),
    setLocked: (token, locked) => services.auth.setSessionLock(token, locked),
    userCtx: (userId, deviceId, network) => ctxForUser(db, userId, deviceId, 'http', network),
    remoteAccess: (userId) => remoteAccessOfUser(db, userId),
    endSession: (token) => void services.auth.logout(token),
    secret,
    sessionHours: () => readSetting(db, 'host.sessionHours')
  })
  const api = createApiApp({
    handlers: { ...createHandlers(services), ...httpAuthHandlers(services) },
    onInternalError: (error, path) => console.error('api internal error', path, error)
  })
  const front = createHostApp({
    api,
    sessions,
    staticRoot: resolve(arg('renderer')),
    machineName: 'tauri-proto',
    version: 'tauri-proto',
    schemaVersion: () => handle.schemaVersion,
    secret,
    listenLan: () => false
  })

  // Perf probes (prototype only; BISMUTH_PERF=1): the page tells when it is ready and picks up the next command.
  const perf = process.env['BISMUTH_PERF'] === '1'
  const marks: Record<string, number> = { sidecarStart: Math.round(Date.now() - process.uptime() * 1000) }
  let command = ''
  const listener = getRequestListener((request, env) => {
    const url = new URL(request.url)
    if (perf && url.pathname.startsWith('/__perf/')) {
      const [, , kind, name] = url.pathname.split('/')
      if (kind === 'mark' && name) marks[name] = Date.now()
      if (kind === 'cmd' && name) command = name
      const body = kind === 'cmd' && !name ? command : JSON.stringify(marks)
      if (kind === 'cmd' && !name) command = ''
      return new Response(body, { headers: { 'cache-control': 'no-store' } })
    }
    return front.fetch(request, env)
  })
  const server = createServer(listener)
  server.headersTimeout = 15_000
  server.requestTimeout = 60_000
  server.listen({ port, host: '127.0.0.1', exclusive: true }, () => {
    marks['listening'] = Date.now()
    console.log(`bismuth sidecar listening 127.0.0.1:${port}`)
  })
  const stop = (): void => {
    server.close()
    server.closeAllConnections()
    handle.close()
    process.exit(0)
  }
  process.on('SIGTERM', stop)
  process.on('SIGINT', stop)
  // The shell closing its end of stdin (it died) ends the sidecar too: no orphan holding the data file.
  process.stdin.on('end', stop)
  process.stdin.resume()
}

void main().catch((error) => {
  console.error('sidecar failed', error)
  process.exit(1)
})
