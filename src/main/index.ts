// Bismuth main process. Order matters: data-dir override and single-instance lock before `ready`,
// security policy before the first window, database (with migrations) before IPC is registered.
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { hostname } from 'node:os'
import { join } from 'node:path'
import { app, BrowserWindow, dialog, nativeTheme, powerMonitor, safeStorage, shell } from 'electron'
import log from 'electron-log/main'
import { applyDataDirOverride, dataPaths, migrationsFolder } from './app/paths'
import { setMainLocale, tMain } from './app/i18n'
import { chromiumLangSwitch, uiLocaleFile, writeUiLocale } from './app/chromium-lang'
import { installCrashHandlers, offerRecoveryRestore, setUpErrorLog } from './app/crash-wiring'
import { displayFollows } from './app/display-follow'
import { isDamagedDatabaseError } from './backup/startup-recovery'
import { buildMenu } from './app/menu'
import { applySecurityPolicy, enforceSingleInstance, isAppUrl } from './security/policy'
import { createMainWindow } from './windows/main-window'
import { applyZoom, setZoomHandler } from './windows/window-actions'
import { nextZoom } from '@shared/window-zoom'
import { MigrationError, openDatabase, type DatabaseHandle } from './db/client'
import { applyPendingRestore, createServices, localOwnerCtx, systemCtx } from './services'
import { guardedCtx } from './services/context'
import { createApiApp } from './api/app'
import { createHandlers } from './api/handlers'
import { registerIpc } from './ipc/register'
import { createDesktopSessions } from './session/desktop-sessions'
import { ctxForUser } from './services/users-service'
import { seedBaseData } from './db/seed/seed'
import { createBismuthKeyStore } from './security/bismuth-key'
import { closingBackupNeeded, createBackupScheduler } from './backup/scheduler'
import { readSetting } from './services/settings-service'
import { processImage, startAttachmentRetention } from './attachments'
import { createTaskScheduler, showOsNotice } from './notifications'
import { createCameraRuntime } from './camera'
import { LOCAL_CONFIG, readConnectionConfig, writeConnectionConfig } from './server/connection-config'
import {
  bundledSchemaVersion,
  connectionFile,
  createClientMode,
  createHostRuntime
} from './server/electron-wiring'
import { Hono } from 'hono'
import type { ApiEnv } from './api/app'

applyDataDirOverride()
// Built-in controls follow the program's language, not the computer's (faz-15 madde 11; read before `ready`).
const chromiumLang = chromiumLangSwitch(uiLocaleFile(app.getPath('userData')))
if (chromiumLang) app.commandLine.appendSwitch('lang', chromiumLang)

const smokeOut = process.argv.find((a) => a.startsWith('--smoke-out='))?.slice('--smoke-out='.length) ?? null
const smoke = process.argv.includes('--smoke') || smokeOut !== null
const devUrl = !app.isPackaged ? (process.env['ELECTRON_RENDERER_URL'] ?? null) : null
const devOrigin = devUrl ? new URL(devUrl).origin : null
const startedAt = Date.now()

let mainWindow: BrowserWindow | null = null
/** The camera sidecar's runtime once built (Faz 20): the request filter reads its address for the live picture. */
let cameraRuntime: ReturnType<typeof createCameraRuntime> | null = null
let database: DatabaseHandle | null = null
const blockedRequests: string[] = []
/** Last call from a window: the step-by-step backup rests while someone is working (K-32). */
let lastActivity = 0
/** Set once the closing backup ran (or is not wanted: a restart for a restore, a smoke run). */
let closingBackupDone = false

function focusMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  // Started again because the window's page died: open the page again, not only the dead window (QA2c #1).
  if (mainWindow.webContents.isCrashed()) mainWindow.webContents.reload()
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

/** The usual "Save as" dialog, starting in Documents with the suggested name (exports, the conflict list). */
async function saveAs(fileName: string, bytes: Buffer): Promise<string | null> {
  const owner = BrowserWindow.getFocusedWindow() ?? mainWindow
  const options = { defaultPath: join(app.getPath('documents'), fileName) }
  const choice = owner ? await dialog.showSaveDialog(owner, options) : await dialog.showSaveDialog(options)
  if (choice.canceled || !choice.filePath) return null
  await writeFile(choice.filePath, bytes)
  return choice.filePath
}

/** The Bismuth key of this computer (backups and the Drive box share it; a client computer keeps it too). */
const keyStore = (root: string) => createBismuthKeyStore(join(root, 'bismuth-key.json'), safeStorage)

function writeSmokeResult(result: Record<string, unknown>): void {
  if (!smokeOut) return
  try {
    writeFileSync(smokeOut, JSON.stringify(result, null, 2))
  } catch (error) {
    log.error('smoke: cannot write result', error)
  }
}

async function start(): Promise<void> {
  if (process.platform === 'win32') app.setAppUserModelId('com.bismuth.hotel')
  await app.whenReady()

  const paths = dataPaths()
  setUpErrorLog(log, paths.logs)
  if (!smoke) installCrashHandlers(log, paths.logs)
  log.info(
    `Bismuth ${app.getVersion()} starting (electron ${process.versions.electron}, ${process.platform}-${process.arch})`
  )

  applySecurityPolicy({
    devOrigin,
    cameraOrigin: () => cameraRuntime?.bridge()?.baseUrl ?? null,
    onBlockedRequest: (url) => {
      blockedRequests.push(url)
      log.warn('blocked renderer request', url)
    }
  })

  // Client mode (Faz 13, yasak 13): this computer uses the hotel's main computer and never opens a database.
  if (!smoke && readConnectionConfig(connectionFile(paths.root)).mode === 'client') {
    startClientMode(paths.windowState)
    return
  }

  // A restore chosen in Settings is applied now, before the database is opened (after a safety copy).
  const restoreMarkerPath = join(paths.root, 'restore-pending.json')
  let restored: ReturnType<typeof applyPendingRestore> = null
  try {
    restored = applyPendingRestore({
      dbFile: paths.db,
      attachmentsDir: paths.attachments,
      backupsDir: paths.backups,
      markerPath: restoreMarkerPath
    })
    if (restored) log.info('pending restore', restored)
  } catch (error) {
    log.error('pending restore failed', error)
  }

  try {
    database = await openDatabase({
      file: paths.db,
      migrationsFolder: migrationsFolder(),
      backupDir: paths.backups,
      appVersion: app.getVersion()
    })
  } catch (error) {
    log.error('database open failed', error)
    const backup = error instanceof MigrationError ? error.backupPath : null
    writeSmokeResult({ ok: false, stage: 'database', error: String(error) })
    // A data file damaged on disk: the newest backup is offered (the program restarts into it).
    if (!smoke && isDamagedDatabaseError(error)) {
      const offered = await offerRecovery('open', restoreMarkerPath)
      if (offered !== 'none') {
        if (offered === 'declined') app.exit(1)
        return
      }
    }
    if (!smoke) {
      dialog.showErrorBox(
        tMain('main.dialog.dbFailed.title'),
        backup
          ? tMain('main.dialog.dbFailed.withBackup', { path: backup, folder: paths.root })
          : tMain('main.dialog.dbFailed.body', { folder: paths.root })
      )
    }
    app.exit(1)
    return
  }
  if (database.backupPath) log.info('pre-migration backup', database.backupPath)
  try {
    const seeded = seedBaseData(database.db)
    if (Object.keys(seeded.inserted).length) log.info('base data seeded', seeded.inserted)
  } catch (error) {
    // Lists can be filled later; a seed problem must not stop data entry (G-01).
    log.error('base data seed failed', error)
  }

  const keys = keyStore(paths.root)
  // Another computer took over as the main computer (P13b): from then on no service writes here, the program's own
  // jobs included (O-4). The guard is made with the server runtime below; until then nothing is replaced.
  let replacedNow = (): boolean => false
  const services = createServices(
    database,
    {
      name: 'Bismuth',
      version: app.getVersion(),
      packaged: app.isPackaged,
      dataDir: paths.root,
      electron: process.versions.electron ?? null,
      chrome: process.versions.chrome ?? null
    },
    {
      attachmentsDir: paths.attachments,
      backupsDir: paths.backups,
      restoreMarkerPath,
      processImage,
      onBackgroundError: (error, what) => log.error('background', what, error),
      onClientError: (report) => log.error('window error', report),
      writeGate: () => (replacedNow() ? 'replaced' : null),
      // Development and e2e only (ignored in a packaged build): optional online data goes to a local fake server.
      network: { origin: process.env['BISMUTH_EXTERNAL_ORIGIN'] ?? null, secrets: safeStorage },
      camera: { testMessage: () => tMain('main.camera.telegramTest') },
      // Exported tables: the usual "Save as" dialog, starting in Documents with the suggested name.
      saveExport: saveAs,
      backup: {
        dbFile: paths.db,
        schemaVersion: () => database?.schemaVersion ?? 0,
        keys,
        isBusy: () => Date.now() - lastActivity < 2_000,
        openPath: (path) => shell.openPath(path),
        // The Drive folder is chosen only with the system's dialog (K-45 (3)).
        pickFolder: async () => {
          const owner = BrowserWindow.getFocusedWindow() ?? mainWindow
          const props = { properties: ['openDirectory' as const, 'createDirectory' as const] }
          const choice = owner
            ? await dialog.showOpenDialog(owner, props)
            : await dialog.showOpenDialog(props)
          return choice.canceled ? null : (choice.filePaths[0] ?? null)
        },
        relaunch: () => {
          closingBackupDone = true // a safety backup was just taken
          app.relaunch()
          app.quit()
        }
      }
    }
  )
  if (restored) services.backup.noteRestored(systemCtx(), restored)
  // Photos of long-resolved issues go (K-25); smoke runs leave the data folder alone.
  if (!smoke) startAttachmentRetention(() => services.attachments.purgeResolvedIssueFiles(systemCtx()), log)

  const initial = services.settings.get(localOwnerCtx())
  setMainLocale(initial['ui.language'])
  // First start: the hotel's language; afterwards the language of whoever used the window last.
  if (!chromiumLang) writeUiLocale(uiLocaleFile(paths.root), initial['ui.language'])
  if (database.integrity !== 'ok') {
    // Keep working (data entry must not stop, G-01) but tell the user once; Hakkında shows it too.
    log.error('integrity_check failed', database.integrity)
    // The newest backup is offered first; without one, the warning of before.
    const offered = smoke ? 'declined' : await offerRecovery('integrity', restoreMarkerPath)
    if (offered === 'restarting') return
    if (offered === 'none') {
      void dialog.showMessageBox({
        type: 'warning',
        title: tMain('main.dialog.integrity.title'),
        message: tMain('main.dialog.integrity.title'),
        detail: tMain('main.dialog.integrity.body', { folder: paths.root })
      })
    }
  }
  nativeTheme.themeSource = initial['ui.theme']
  applyZoom(initial['ui.zoom'])
  buildMenu()
  // Menu language and native theme follow the person at the window (their own choices, K-37), else the hotel's.
  let menuLocale = initial['ui.language']
  // `remember`: the language is kept for the next start's window (`--lang`) unless nobody is signed in — closing
  // the window signs out, and the hotel's language would otherwise replace the person's own.
  const applyDisplay = (
    values: {
      'ui.language': typeof menuLocale
      'ui.theme': typeof nativeTheme.themeSource
      'ui.zoom': number
    },
    remember = true
  ) => {
    if (remember) writeUiLocale(uiLocaleFile(paths.root), values['ui.language'])
    if (values['ui.language'] !== menuLocale) {
      menuLocale = values['ui.language']
      setMainLocale(menuLocale)
      buildMenu()
    }
    nativeTheme.themeSource = values['ui.theme']
    applyZoom(values['ui.zoom'])
  }
  // Only the person signed in at this window (or the setup wizard) changes it: another device's choice stays there.
  let windowUserId: string | null = null
  // Ctrl +/-/0 and the View menu: the next step is saved as the person's own `ui.zoom` and then applied to every
  // window like any other display setting. Nobody signed in (sign-in screen): applied only, nothing to save for.
  setZoomHandler((direction, win) => {
    const next = nextZoom(Math.round(win.webContents.getZoomFactor() * 100), direction)
    if (client) return applyZoom(next)
    const ctx = desktop.ctxFor(win.webContents.id)
    if (ctx.userId === null) return applyZoom(next)
    try {
      services.settings.set(ctx, { 'ui.zoom': next })
    } catch (error) {
      log.warn('zoom could not be saved', error)
      applyZoom(next)
    }
  })
  services.settings.onChange((values, changed, by) => {
    if (displayFollows(changed, by, windowUserId)) applyDisplay(values)
  })

  // Server mode (Faz 13): phones and other computers reach this computer over the local or private network.
  const hostRuntime = createHostRuntime({
    services,
    db: database.db,
    sqlite: database.sqlite,
    root: paths.root,
    version: app.getVersion(),
    schemaVersion: () => database?.schemaVersion ?? 0,
    log,
    keys,
    isBusy: () => Date.now() - lastActivity < 2_000,
    saveFile: saveAs
  })
  const { host } = hostRuntime
  replacedNow = () => hostRuntime.guard.replaced() !== null
  // The Drive box, the PDF summary and the newer-term check (P13b): on the computer that keeps the data.
  if (!smoke) hostRuntime.relay.start()
  app.on('will-quit', () => hostRuntime.relay.stop())
  if (!smoke && initial['app.mode'] === 'host') void host.start()
  // The wizard's "this computer will use the main computer" (Faz 4 flow) switches the windows to client mode at
  // once; from the next start the database is not opened at all (yasak 13). Back with "set up here alone".
  let client: ReturnType<typeof createClientMode> | null = null
  const toClient = (): void => {
    writeConnectionConfig(connectionFile(paths.root), { mode: 'client', hostUrl: null })
    client ??= createClientMode({
      root: paths.root,
      version: app.getVersion(),
      schemaVersion: bundledSchemaVersion(migrationsFolder()),
      log,
      migrationsFolder: migrationsFolder(),
      keys,
      hotelDbFile: paths.db,
      leaveClient: () => {
        client?.close()
        client = null
        writeConnectionConfig(connectionFile(paths.root), LOCAL_CONFIG)
        services.setup.setMode(systemCtx(), 'standalone')
      }
    })
  }
  services.settings.onChange((values, changed) => {
    if (changed.includes('host.port') && values['app.mode'] === 'host') void host.start()
    if (changed.includes('app.mode') && values['app.mode'] === 'client' && !services.setup.isDone())
      toClient()
  })
  app.on('will-quit', () => void host.stop())
  if (!smoke && initial['app.mode'] === 'client' && !services.setup.isDone()) {
    // Left client mode on purpose (the file says local): the wizard opens. Else a computer left in the Faz 4
    // interim state (client chosen, data folder opened): client mode now.
    if (existsSync(connectionFile(paths.root))) services.setup.setMode(systemCtx(), 'standalone')
    else toClient()
  }

  // Optional online data (Faz 11): rates, weather and the yearly holiday check refresh themselves on the hotel's
  // own computer; a client device reads them from it (K-19). The smoke run never goes online.
  if (!smoke && initial['app.mode'] !== 'client')
    services.external.start({
      onError: (error, what) => log.warn('external data', what, error),
      // A computer replaced by another main computer writes nothing more (P13b).
      active: () => services.setup.isDone() && hostRuntime.guard.replaced() === null
    })

  // Tasks of today and the coming week, late-task and "N days before" notices shown by the OS (G-94, Faz 9);
  // only on the hotel's own computer (a client device reads the tasks from it).
  if (!smoke && initial['app.mode'] !== 'client')
    createTaskScheduler({
      run: () => services.tasks.runSchedule(systemCtx()),
      show: showOsNotice,
      active: () => services.setup.isDone() && hostRuntime.guard.replaced() === null,
      locale: () => menuLocale,
      t: tMain,
      onError: (error) => log.warn('task round failed', error)
    }).start()

  // Camera (Faz 20 P20a, K-49): the Python sidecar runs only on the hotel's own computer and only while
  // `camera.enabled` is on; Bismuth closing (even by a crash) ends it. Smoke runs and client devices never start it.
  if (!smoke && initial['app.mode'] !== 'client') {
    const camera = createCameraRuntime({
      packaged: app.isPackaged,
      scriptDir: app.isPackaged
        ? join(process.resourcesPath, 'camera')
        : join(app.getAppPath(), 'otel-kamera'),
      dataDir: paths.root,
      modelsDir: app.isPackaged
        ? join(process.resourcesPath, 'camera', 'models')
        : join(app.getAppPath(), 'resources', 'camera', 'models'),
      settings: () => services.settings.get(localOwnerCtx()),
      source: () => services.camera.sidecarSource(),
      log: { info: (...a) => log.info(...a), warn: (...a) => log.warn(...a) },
      onNotice: (notice) => {
        try {
          services.camera.noticeProblem(systemCtx(), notice)
        } catch (error) {
          log.warn('camera notice not saved', error)
        }
        showOsNotice(
          notice.kind === 'gaveUp'
            ? { title: tMain('main.camera.gaveUpTitle'), body: tMain('main.camera.gaveUpBody') }
            : {
                title: tMain('main.camera.crashedTitle'),
                body: tMain('main.camera.crashedBody', { count: String(notice.crashes) })
              }
        )
      }
    })
    services.camera.attach(camera)
    cameraRuntime = camera
    const apply = (restart: boolean): void =>
      void camera.apply({ restart }).catch((error: unknown) => log.warn('camera sidecar', error))
    services.settings.onChange((_values, changed) => {
      if (changed.some((key) => key.startsWith('camera.'))) apply(true)
    })
    app.on('will-quit', () => void camera.stop())
    if (services.setup.isDone() && hostRuntime.guard.replaced() === null) apply(false)
  }

  const api = createApiApp({
    handlers: createHandlers(services),
    onInternalError: (error, path) => log.error('api internal error', path, error)
  })

  // Each window's sign-in (G-22): the token stays in the main process; this computer's device id is kept in
  // userData so the device list shows one desktop, not a new one per sign-in.
  const deviceFile = join(paths.root, 'device.json')
  const desktop = createDesktopSessions({
    setupDone: () => services.setup.isDone(),
    setupOpen: () => services.setup.isOpen(),
    resolve: (token) => services.auth.resolveSession(token),
    userCtx: (userId, deviceId) => {
      const ctx = ctxForUser(database!.db, userId, deviceId, 'ipc')
      // Replaced by another main computer (P13b): nothing may be changed here any more.
      return ctx ? guardedCtx(ctx, () => hostRuntime.guard.replaced() !== null) : null
    },
    endSession: (token) => void services.auth.logout(token),
    loadDeviceId: () => {
      try {
        const id = (JSON.parse(readFileSync(deviceFile, 'utf8')) as { deviceId?: unknown }).deviceId
        // Device ids are ULIDs; anything else is ignored (a new device row is made at the next sign-in).
        return typeof id === 'string' && /^[0-9A-HJKMNP-TV-Z]{26}$/.test(id) ? id : null
      } catch {
        return null
      }
    },
    saveDeviceId: (deviceId) => {
      // Write then rename: a crash mid-write never leaves a half file.
      writeFileSync(`${deviceFile}.tmp`, JSON.stringify({ deviceId }))
      renameSync(`${deviceFile}.tmp`, deviceFile)
    },
    deviceName: () => hostname().slice(0, 100) || 'Bismuth',
    platform: process.platform,
    sessionChanged: (windowId) => {
      const ctx = desktop.ctxFor(windowId)
      windowUserId = ctx.userId
      applyDisplay(services.settings.get(ctx), ctx.userId !== null)
    }
  })

  // Daily automatic backup at the quiet hour, a missed one a few minutes after start (K-32).
  const scheduler = createBackupScheduler({
    clock: () => new Date(),
    time: () => readSetting(database!.db, 'backup.autoTime'),
    lastAutoAt: () => services.backup.lastAutoAt(),
    // A replaced computer makes no more backups (its data is not the hotel's any more; Faz 11/14 #3).
    run: async () => {
      if (!replacedNow()) await services.backup.runAuto(systemCtx())
    },
    onError: (error) => log.error('automatic backup failed', error)
  })
  if (!smoke) scheduler.start()
  else closingBackupDone = true
  // One more when the program closes (unless an automatic one is only a few hours old); quick, no rests.
  app.on('before-quit', (event) => {
    if (closingBackupDone || !database || replacedNow()) return
    closingBackupDone = true
    if (!closingBackupNeeded(services.backup.lastAutoAt(), new Date())) return
    event.preventDefault()
    scheduler.stop()
    for (const win of BrowserWindow.getAllWindows()) win.hide()
    const limit = new Promise((resolve) => setTimeout(resolve, 120_000))
    void Promise.race([services.backup.runAuto(systemCtx(), { fast: true }), limit])
      .catch((error: unknown) => log.error('closing backup failed', error))
      .finally(() => app.quit())
  })

  // One IPC entry for both ways of working: this computer's own router, or (client mode chosen in the wizard)
  // the link to the main computer.
  const ownApi = hostRuntime.markReadOnly(api)
  const ipcApp = new Hono<ApiEnv>().all('*', (c) => (client ? client.api : ownApi).fetch(c.req.raw, c.env))
  registerIpc({
    app: ipcApp,
    ctxFor: (sender) => {
      lastActivity = Date.now()
      return client ? client.ctxFor(sender) : desktop.ctxFor(sender.id)
    },
    sessionFor: (sender) => (client ? client.sessionFor(sender) : desktop.binding(sender.id)),
    isTrustedUrl: (url) => isAppUrl(url, devOrigin),
    onReady: (sender) => {
      if (!smoke) return
      writeSmokeResult({
        ok: true,
        startupMs: Date.now() - startedAt,
        title: sender.getTitle(),
        versions: {
          app: app.getVersion(),
          electron: process.versions.electron,
          chrome: process.versions.chrome
        },
        platform: `${process.platform}-${process.arch}`,
        packaged: app.isPackaged,
        db: {
          schemaVersion: database?.schemaVersion,
          integrity: database?.integrity,
          sqlite: database?.sqliteVersion
        },
        blockedRequests
      })
      setTimeout(() => app.quit(), 200)
    }
  })

  // Every window (also one reopened from the macOS dock) ends its sign-in when it closes.
  const openWindow = (show: boolean): BrowserWindow => {
    const win = createMainWindow({ windowStateFile: paths.windowState, devUrl, show })
    const contentsId = win.webContents.id
    win.on('closed', () => {
      if (client) client.windowClosed(win, contentsId)
      else desktop.closed(contentsId)
      if (mainWindow === win) mainWindow = null
    })
    return win
  }
  mainWindow = openWindow(!smoke)
  // The computer locked or went to sleep: the program locks too (G-22).
  powerMonitor.on('lock-screen', () => desktop.lockAll())
  powerMonitor.on('suspend', () => desktop.lockAll())

  if (smoke) {
    setTimeout(() => {
      writeSmokeResult({
        ok: false,
        stage: 'renderer',
        error: 'renderer did not report ready within 45 s',
        blockedRequests
      })
      app.exit(1)
    }, 45_000).unref()
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = openWindow(true)
  })
}

/** Damaged data at start (Faz 16): offers the newest local backup ('restarting' when the program starts into it). */
function offerRecovery(
  kind: 'open' | 'integrity',
  markerPath: string
): ReturnType<typeof offerRecoveryRestore> {
  return offerRecoveryRestore({
    kind,
    backupsDir: dataPaths().backups,
    markerPath,
    programSchemaVersion: bundledSchemaVersion(migrationsFolder()),
    log
  })
}

/** Client mode: no database, no scheduler; the windows talk to the main computer through the main process. */
function startClientMode(windowStateFile: string): void {
  const root = dataPaths().root
  const client = createClientMode({
    root,
    version: app.getVersion(),
    schemaVersion: bundledSchemaVersion(migrationsFolder()),
    log,
    migrationsFolder: migrationsFolder(),
    keys: keyStore(root),
    hotelDbFile: dataPaths().db,
    // Back to keeping the data here: start again (the database opens then).
    leaveClient: () => {
      writeConnectionConfig(connectionFile(root), LOCAL_CONFIG)
      app.relaunch()
      app.exit(0)
    }
  })
  buildMenu()
  registerIpc({
    app: client.api,
    ctxFor: (sender) => client.ctxFor(sender),
    sessionFor: (sender) => client.sessionFor(sender),
    isTrustedUrl: (url) => isAppUrl(url, devOrigin)
  })
  const openWindow = (show: boolean): BrowserWindow => {
    const win = createMainWindow({ windowStateFile, devUrl, show })
    const contentsId = win.webContents.id
    win.on('closed', () => {
      client.windowClosed(win, contentsId)
      if (mainWindow === win) mainWindow = null
    })
    return win
  }
  mainWindow = openWindow(true)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = openWindow(true)
  })
  app.on('will-quit', () => client.close())
}

if (enforceSingleInstance(focusMainWindow)) {
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' || smoke) app.quit()
  })
  app.on('will-quit', () => database?.close())
  start().catch((error: unknown) => {
    log.error('startup failed', error)
    writeSmokeResult({ ok: false, stage: 'startup', error: String(error) })
    app.exit(1)
  })
}
