// Electron side of Faz 13 (kept out of index.ts so the start-up file stays readable): the server mode on the
// hotel's computer and the whole of client mode. Everything here is plumbing; the rules live in the Electron-free
// modules next to it (host-app, http-sessions, host-link, client-app) and are unit-tested there.
import { existsSync, readFileSync } from 'node:fs'
import { hostname, networkInterfaces } from 'node:os'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import {
  app,
  BrowserWindow as ElectronWindow,
  dialog,
  safeStorage,
  shell,
  type BrowserWindow,
  type WebContents
} from 'electron'
import { Hono } from 'hono'
import { createApiApp, type ApiEnv } from '../api/app'
import { createHandlers } from '../api/handlers'
import { tFor } from '../app/i18n'
import type { BismuthDb } from '../db/client'
import { createDiscovery, type Discovery } from '../discovery'
import { copyFolder, createReplicaStore, migrateLegacyCopy } from '../replica/store'
import { conflictingChanges, conflictRows, createEpochGuard, type EpochGuard } from '../relay/epoch'
import { createRelayRuntime, type RelayRuntime } from '../relay/runtime'
import { printSummaryPdf } from '../relay/summary-pdf'
import type { BismuthKeyStore } from '../security/bismuth-key'
import type { Services } from '../services'
import { remoteAccessOfUser } from '../services/auth-service'
import { anonymousCtx, guardedCtx } from '../services/context'
import { readSetting } from '../services/settings-service'
import { ctxForUser } from '../services/users-service'
import { RENDERER_DIR } from '../security/app-url'
import { httpAuthHandlers } from './auth-handlers'
import { clientBinding, createClientApp } from './client-app'
import { createConfigStore, LOCAL_CONFIG, writeConnectionConfig } from './connection-config'
import { createHostApp } from './host-app'
import { createHostController, type HostController } from './host-controller'
import { hostIdentity, loadHostSecret } from './host-identity'
import { createHostLink, type HostLink } from './host-link'
import { createHttpSessions } from './http-sessions'
import type { Interfaces } from './net'
import { setRemoteRuntime, setReplicaHostRuntime } from './remote-service'
import { createReplicaClient } from './replica-client'
import { createReplicaFeed } from './replica-routes'

type Log = (message: string, ...rest: unknown[]) => void

/** The file that says this computer uses the hotel's main computer (yasak 13: not in a database). */
export const connectionFile = (root: string): string => join(root, 'connection.json')

/** Migrations bundled with this program: its data version (a client compares it with the main computer's). */
export function bundledSchemaVersion(migrationsFolder: string): number {
  try {
    const journal = JSON.parse(readFileSync(join(migrationsFolder, 'meta', '_journal.json'), 'utf8')) as {
      entries?: unknown[]
    }
    return journal.entries?.length ?? 0
  } catch {
    return 0
  }
}

const machineName = (): string => hostname().slice(0, 100) || 'Bismuth'

/**
 * Development and e2e only (ignored in a packaged build): extra network cards to show, so screenshots of
 * Ayarlar → Uzaktan erişim can show a hotel Wi-Fi and a NetBird address on a test machine that has neither.
 */
function shownInterfaces(): Interfaces {
  const raw = app.isPackaged ? undefined : process.env['BISMUTH_E2E_INTERFACES']
  if (!raw) return {}
  try {
    const list = JSON.parse(raw) as Record<string, string>
    return Object.fromEntries(
      Object.entries(list).map(([name, address]) => [
        name,
        [{ address, family: 'IPv4' as const, internal: false, netmask: '255.255.255.0', mac: '', cidr: null }]
      ])
    )
  } catch {
    return {}
  }
}

/** Switches this computer to client mode and starts the program again (it will not open the database). */
export function relaunchAsClient(root: string): void {
  writeConnectionConfig(connectionFile(root), { mode: 'client', hostUrl: null })
  app.relaunch()
  app.exit(0)
}

export interface HostRuntimeOptions {
  services: Services
  db: BismuthDb
  sqlite: Database.Database
  root: string
  version: string
  schemaVersion: () => number
  log: { info: Log; warn: Log; error: Log }
  /** The Bismuth key (the box and the backups share it). */
  keys: BismuthKeyStore
  /** Someone is working in the program: large box files wait (K-32). */
  isBusy: () => boolean
  /** The program window's "Save as" (the conflict list). */
  saveFile: (fileName: string, bytes: Buffer) => Promise<string | null>
}

/** While this computer is replaced by another main computer, every answer says "read-only" (203). */
function markReadOnly(api: Hono<ApiEnv>, replaced: () => boolean): Hono<ApiEnv> {
  return new Hono<ApiEnv>().all('*', async (c) => {
    const response = await api.fetch(c.req.raw, c.env)
    if (!replaced() || response.status < 200 || response.status >= 300) return response
    return new Response(response.body, { status: 203, headers: response.headers })
  })
}

/** Server mode of the hotel's computer: the HTTP front door, bonjour, and the runtime of Ayarlar → Uzaktan erişim. */
export function createHostRuntime(options: HostRuntimeOptions): {
  host: HostController
  discovery: Discovery
  guard: EpochGuard
  relay: RelayRuntime
  /** Answers turn read-only (203) once another computer took over (the window's router uses it too). */
  markReadOnly: (api: Hono<ApiEnv>) => Hono<ApiEnv>
} {
  const { services, db } = options
  // N-10: sealed with the system's key store (a copied file does not carry this computer's identity).
  const secret = loadHostSecret(join(options.root, 'host-secret.key'), safeStorage)
  // K-45 (1): who this computer is to a client computer (stays the same while host-secret.key does).
  const identity = hostIdentity(secret)
  const listenLan = (): boolean => readSetting(db, 'host.listenLan')
  const guard = createEpochGuard(join(options.root, 'replaced.json'))
  const replaced = (): boolean => guard.replaced() !== null
  const sessions = createHttpSessions({
    setupDone: () => services.setup.isDone(),
    resolve: (token, ip) => services.auth.resolveSession(token, ip),
    setLocked: (token, locked) => services.auth.setSessionLock(token, locked),
    userCtx: (userId, deviceId, network) => {
      const ctx = ctxForUser(db, userId, deviceId, 'http', network)
      return ctx ? guardedCtx(ctx, replaced) : null
    },
    remoteAccess: (userId) => remoteAccessOfUser(db, userId),
    endSession: (token) => void services.auth.logout(token),
    secret,
    sessionHours: () => readSetting(db, 'host.sessionHours')
  })
  const api = createApiApp({
    handlers: { ...createHandlers(services), ...httpAuthHandlers(services) },
    onInternalError: (error, path) => options.log.error('server api internal error', path, error)
  })
  const front = createHostApp({
    api: markReadOnly(api, replaced),
    replicaFeed: createReplicaFeed({
      db,
      sqlite: options.sqlite,
      schemaVersion: options.schemaVersion,
      replaced
    }),
    sessions,
    staticRoot: RENDERER_DIR,
    machineName: machineName(),
    version: options.version,
    schemaVersion: options.schemaVersion,
    secret,
    listenLan,
    interfaces: () => ({ ...networkInterfaces(), ...shownInterfaces() })
  })
  const discovery = createDiscovery()
  const host = createHostController({
    fetch: (request, env) => front.fetch(request, env),
    port: () => readSetting(db, 'host.port'),
    interfaces: () => ({ ...networkInterfaces(), ...shownInterfaces() }),
    listenLan,
    discovery,
    announcement: () => ({
      // A short id from the identity, not the computer's name (D8): the Wi-Fi learns nothing about the machine.
      name: `Bismuth ${identity.fingerprint.slice(0, 4)}`,
      schemaVersion: options.schemaVersion(),
      hotelName: readSetting(db, 'hotel.name')
    }),
    onError: (error, what) => options.log.warn(what, error)
  })
  setRemoteRuntime({
    applyMode: (mode) => (mode === 'host' ? host.start() : host.stop()),
    server: () => host.state(),
    applyListen: () => host.rescan(),
    identity,
    // Linux has no login items in Electron; Windows and macOS do.
    openAtLogin: () => (process.platform === 'linux' ? null : app.getLoginItemSettings().openAtLogin),
    setOpenAtLogin: (enabled) => {
      if (process.platform !== 'linux') app.setLoginItemSettings({ openAtLogin: enabled })
    },
    becomeClient: () => relaunchAsClient(options.root),
    discover: () => discovery.browse(3000),
    version: options.version,
    schemaVersion: options.schemaVersion
  })
  // P13b: the Drive box, the PDF summary, the newer-term check, the copy grants.
  const relay = createRelayRuntime({
    services,
    db,
    sqlite: options.sqlite,
    keys: options.keys,
    guard,
    schemaVersion: options.schemaVersion,
    printPdf: printSummaryPdf,
    translate: (locale) => tFor(locale),
    isBusy: options.isBusy,
    onError: (error, what) => options.log.warn(what, error)
  })
  setReplicaHostRuntime({
    db,
    relayStatus: () => relay.status(),
    relayRun: () => relay.runNow(),
    replaced: () => guard.replaced(),
    conflicts: () => {
      const note = guard.replaced()
      return note ? conflictingChanges(options.sqlite, note) : []
    },
    conflictRows: (identity) => {
      const note = guard.replaced()
      return note ? conflictRows(options.sqlite, note, identity) : []
    },
    saveFile: options.saveFile
  })
  return { host, discovery, guard, relay, markReadOnly: (inner) => markReadOnly(inner, replaced) }
}

export interface ClientModeOptions {
  root: string
  version: string
  schemaVersion: number
  log: { info: Log; warn: Log; error: Log }
  migrationsFolder: string
  /** The Bismuth key store of this computer (the Drive box needs the key typed in from the owner's paper). */
  keys: BismuthKeyStore
  /** Where this computer's hotel database would be (a takeover makes it). */
  hotelDbFile: string
  /** "Bu bilgisayarı tek başına kur": keep the data here again. */
  leaveClient(): void
}

/** Client mode: no database; the windows' calls go to the main computer through the link. */
export function createClientMode(options: ClientModeOptions): {
  api: Hono<ApiEnv>
  link: HostLink
  ctxFor(sender: WebContents): ReturnType<typeof anonymousCtx>
  sessionFor(sender: WebContents): ReturnType<typeof clientBinding>
  windowClosed(win: BrowserWindow, contentsId: number): void
  close(): void
} {
  // The copy grant is sealed with the system's key store where there is one (D5).
  const config = createConfigStore(
    connectionFile(options.root),
    safeStorage.isEncryptionAvailable()
      ? {
          seal: (text) => safeStorage.encryptString(text).toString('base64'),
          open: (sealed) => {
            try {
              return safeStorage.decryptString(Buffer.from(sealed, 'base64'))
            } catch {
              return null
            }
          }
        }
      : undefined
  )
  const link = createHostLink({
    version: options.version,
    schemaVersion: options.schemaVersion,
    deviceName: machineName(),
    platform: process.platform,
    loadDevice: () => config.get().device ?? null,
    saveDevice: (device) => void config.update({ device }),
    loadHostKey: () => config.get().hostKey ?? null,
    saveHostKey: (hostKey) => void config.update({ hostKey }),
    onStateChange: (state) => options.log.info('host link', state)
  })
  const saved = config.get().hostUrl
  if (saved) {
    link.setHost(saved)
    void link.probe().catch(() => undefined)
  }
  const discovery = createDiscovery()
  // P13b: the read-only copy (a separate file; never the hotel's database, yasak 13).
  // P21b: the single copy of an earlier version moves under its hotel's code (replica/<code>/).
  const migrated = config.takeMigration()
  if (migrated) migrateLegacyCopy(options.root, migrated)
  const store = createReplicaStore({
    root: options.root,
    hotel: config.get().activeHotel ?? null,
    migrationsFolder: options.migrationsFolder,
    version: options.version,
    onError: (error, what) => options.log.warn(what, error)
  })
  const replica = createReplicaClient({
    store,
    config,
    link,
    keys: options.keys,
    hotelDbFile: options.hotelDbFile,
    machineName: machineName(),
    pickFolder: async () => {
      const owner = ElectronWindow.getFocusedWindow()
      const props = { properties: ['openDirectory' as const] }
      const choice = owner ? await dialog.showOpenDialog(owner, props) : await dialog.showOpenDialog(props)
      return choice.canceled ? null : (choice.filePaths[0] ?? null)
    },
    becomeMain: () => {
      writeConnectionConfig(connectionFile(options.root), { ...LOCAL_CONFIG, display: config.get().display })
      app.relaunch()
      app.exit(0)
    },
    onError: (error, what) => options.log.warn(what, error)
  })
  replica.start()
  // P21c: the other hotels' copies, opened for the portfolio only (never the one in use: that is `store`).
  const others = new Map<string, ReturnType<typeof createReplicaStore>>()
  const closeOthers = (): void => {
    for (const other of others.values()) other.close()
    others.clear()
  }
  const portfolioCopy = (code: string) => {
    if (code === (config.get().activeHotel ?? null)) return store.readable()
    let other = others.get(code)
    // No copy file = nothing to read (opening would only make an empty one).
    if (!other && !existsSync(join(copyFolder(options.root, code), 'replica.db'))) return null
    if (!other) {
      other = createReplicaStore({
        root: options.root,
        hotel: code,
        migrationsFolder: options.migrationsFolder,
        version: options.version,
        onError: (error, what) => options.log.warn(what, error)
      })
      others.set(code, other)
    }
    return other.readable()
  }
  const api = createClientApp({
    link,
    config,
    discover: () => discovery.browse(3000),
    openExternal: (url) => void shell.openExternal(url),
    leaveClient: () => options.leaveClient(),
    replica: { client: replica, store },
    onHotelChanged: (code) => {
      closeOthers()
      replica.switchHotel(code)
    },
    removeHotelData: (code) => {
      closeOthers()
      store.removeCopy(code)
    },
    portfolioCopy,
    onError: (error, what) => options.log.warn(what, error)
  })
  const device = () => ({ deviceName: machineName(), kind: 'desktop' as const, platform: process.platform })
  return {
    api,
    link,
    ctxFor: () => anonymousCtx('client', 'ipc'),
    sessionFor: (sender) => clientBinding(sender.id, device),
    windowClosed: (_win, contentsId) => void link.forget(contentsId),
    close: () => {
      closeOthers()
      replica.stop()
      link.close()
      discovery.destroy()
    }
  }
}
