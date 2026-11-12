// Main window. Base: electron-vite react-ts template + guasam/electron-react-app `createAppWindow`
// (MIT): sandboxed renderer, show on ready-to-show, hash routing with loadFile. Native frame kept.
import { join } from 'node:path'
import { app, BrowserWindow, nativeTheme } from 'electron'
import { loadWindowState, trackWindowState } from '../app/window-state'

export interface MainWindowOptions {
  windowStateFile: string
  devUrl: string | null
  show?: boolean
}

export function createMainWindow(options: MainWindowOptions): BrowserWindow {
  const state = loadWindowState(options.windowStateFile)
  const win = new BrowserWindow({
    ...(state.hasPosition ? { x: state.bounds.x, y: state.bounds.y } : {}),
    width: state.bounds.width,
    height: state.bounds.height,
    minWidth: 960,
    minHeight: 600,
    show: false,
    title: 'Bismuth',
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#18181b' : '#ffffff',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      // Written out although they are Electron's defaults (D10): a future default or a copied option cannot open
      // Node to a worker or a <webview> to a page.
      nodeIntegrationInWorker: false,
      webviewTag: false,
      webSecurity: true,
      // Windows downloads spell-check dictionaries from a Google CDN otherwise (K-12 note, yasak 1).
      spellcheck: false,
      devTools: !app.isPackaged
    }
  })
  if (state.maximized) win.maximize()
  trackWindowState(win, options.windowStateFile)

  win.once('ready-to-show', () => {
    if (options.show !== false) win.show()
  })

  if (options.devUrl) void win.loadURL(options.devUrl)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
  return win
}
