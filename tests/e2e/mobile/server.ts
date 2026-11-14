// E2E harness only: serves the built renderer (out/renderer) + the shared router over HTTP with an in-memory
// database. The server-mode session layer arrives in Faz 13; here ONE sign-in state is shared by every request
// (the desktop window's session logic, window id 1), so this file must never be used outside tests (it binds to
// 127.0.0.1 only). The hotel is set up with the e2e draft and the owner signed in, unless E2E_SETUP=0 (the setup
// wizard, for screenshots of it).
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Hono } from 'hono'
import { openDatabase } from '../../../src/main/db/client'
import { seedBaseData } from '../../../src/main/db/seed/seed'
import { createServices } from '../../../src/main/services'
import { createApiApp, type ApiEnv } from '../../../src/main/api/app'
import { createHandlers } from '../../../src/main/api/handlers'
import { startServer } from './plain-server'
import { createCameraRuntime } from '../../../src/main/camera'
import { localOwnerCtx, systemCtx } from '../../../src/main/services/context'
import { ctxForUser } from '../../../src/main/services/users-service'
import { createDesktopSessions } from '../../../src/main/session/desktop-sessions'
import { setReplicaHostRuntime } from '../../../src/main/server/remote-service'
import { createEpochGuard } from '../../../src/main/relay/epoch'
import { createRelayRuntime } from '../../../src/main/relay/runtime'
import { memoryKeyStore } from '../../../src/main/security/bismuth-key'
import { draftFrom } from '../setup-draft.mjs'

const WINDOW = 1

async function main(): Promise<void> {
  // Never look at (or write into) the real Google Drive folder of whoever runs the tests.
  process.env['BISMUTH_DRIVE_HOME'] ||= mkdtempSync(join(tmpdir(), 'bismuth-e2e-drive-'))
  const port = Number(process.env['E2E_PORT'] ?? 47373)
  const root = resolve(__dirname, '../../..')
  const handle = await openDatabase({ file: ':memory:', migrationsFolder: resolve(root, 'drizzle') })
  seedBaseData(handle.db)
  // Optional online data (Faz 11) only from a fake server the caller started (BISMUTH_EXTERNAL_ORIGIN); without one
  // the harness never fetches anything.
  const externalOrigin = process.env['BISMUTH_EXTERNAL_ORIGIN'] ?? null
  const services = createServices(
    handle,
    { name: 'Bismuth', version: 'e2e', packaged: false, dataDir: '', electron: null, chrome: null },
    { network: { origin: externalOrigin } }
  )
  if (externalOrigin) services.external.start({ firstDelayMs: 500, active: () => services.setup.isDone() })
  let deviceId: string | null = null
  const sessions = createDesktopSessions({
    setupDone: () => services.setup.isDone(),
    setupOpen: () => services.setup.isOpen(),
    resolve: (token) => services.auth.resolveSession(token),
    userCtx: (userId, device) => ctxForUser(handle.db, userId, device, 'http'),
    endSession: (token) => void services.auth.logout(token),
    loadDeviceId: () => deviceId,
    saveDeviceId: (id) => (deviceId = id),
    deviceName: () => 'e2e-phone',
    platform: 'e2e'
  })
  // Ayarlar → Uzaktan erişim's box card (P13b): no key and no Drive folder here, nothing is ever written.
  const guard = createEpochGuard(join(mkdtempSync(join(tmpdir(), 'bismuth-e2e-')), 'replaced.json'))
  const relay = createRelayRuntime({
    services,
    db: handle.db,
    sqlite: handle.sqlite,
    keys: memoryKeyStore(null, false),
    guard,
    schemaVersion: () => handle.schemaVersion,
    translate: () => (key) => key
  })
  setReplicaHostRuntime({
    db: handle.db,
    relayStatus: () => relay.status(),
    relayRun: () => relay.runNow(),
    replaced: () => guard.replaced(),
    conflicts: () => [],
    conflictRows: () => []
  })
  const api = createApiApp({ handlers: createHandlers(services) })
  // Before setup the harness stands in for the hotel computer's window (the wizard runs only there, over IPC);
  // after it, calls come as a phone's would: remote.
  const env = () => ({
    ctx: sessions.ctxFor(WINDOW),
    session: sessions.binding(WINDOW),
    transport: services.setup.isDone() ? ('http' as const) : ('ipc' as const)
  })
  // Every request carries the shared sign-in state, as the main process does for a window.
  const withSession = new Hono<ApiEnv>().all('/api/*', (c) => api.fetch(c.req.raw, env()))

  if (process.env['E2E_SETUP'] !== '0') {
    // The wizard's finish through the router: writes the hotel and signs the owner in.
    const draft = draftFrom(services.setup.options(systemCtx()))
    const res = await api.request('/api/setup.finish', { method: 'POST', body: JSON.stringify(draft) }, env())
    if (res.status !== 200) throw new Error(`setup failed: ${res.status} ${await res.text()}`)
    // The first-run tour (features/guide) stays off for the phone tests; guide.spec turns it on.
    const tour = await api.request(
      '/api/settings.set',
      { method: 'POST', body: JSON.stringify({ 'guide.tourForNewUsers': false }) },
      env()
    )
    if (tour.status !== 200) throw new Error(`settings failed: ${tour.status} ${await tour.text()}`)
  }

  // The Kamera screen's phone spec (Faz 20 P20b): the Node stand-in for the Python sidecar runs behind the services, as the
  // hotel computer's main process would run it; the phone only ever reads the alarm list from it.
  if (process.env['E2E_CAMERA'] === '1') {
    const camera = createCameraRuntime({
      scriptDir: root,
      dataDir: mkdtempSync(join(tmpdir(), 'bismuth-e2e-camera-')),
      settings: () => services.settings.get(localOwnerCtx()),
      source: () => 'rtsp://camera.invalid/stream',
      python: process.execPath,
      script: resolve(root, 'tests/fixtures/fake-sidecar.mjs')
    })
    services.camera.attach(camera)
    await services.settings.set(localOwnerCtx(), { 'camera.enabled': true, 'camera.location': 'Merdiven' })
    await camera.apply()
    // P20c: the main process takes the sidecar's alarms into Bismuth's table every few seconds; so does the harness.
    const round = setInterval(() => void services.camera.tick(systemCtx()).catch(() => undefined), 1_000)
    round.unref()
    process.on('exit', () => void camera.stop())
    for (const signal of ['SIGINT', 'SIGTERM'] as const)
      process.on(signal, () => void camera.stop().finally(() => process.exit(0)))
  }

  const server = await startServer({
    api: withSession,
    staticRoot: resolve(root, 'out/renderer'),
    port,
    hostname: '127.0.0.1'
  })
  console.log(`e2e server on http://127.0.0.1:${server.port}`)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
