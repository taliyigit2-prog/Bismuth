// Main window. Base: electron-vite react-ts template + guasam/electron-react-app `createAppWindow`
// (MIT): sandboxed renderer, show on ready-to-show, hash routing with loadFile. Native frame kept.
import { join } from 'node:path'
import { app, BrowserWindow, nativeTheme, screen } from 'electron'
import { loadWindowState, trackWindowState } from '../app/window-state'
import { MIN_WINDOW_HEIGHT, minWindowWidth, windowKeyAction } from '../app/window-keys'
import { applyZoomTo, currentZoom, toggleFullScreen, zoomStep } from './window-actions'

export interface MainWindowOptions {
  windowStateFile: string
  devUrl: string | null
  show?: boolean
}

export function createMainWindow(options: MainWindowOptions): BrowserWindow {
  // Where the window was left: on that monitor, or on the primary one when it is gone (Ö-23).
  const primary = screen.getPrimaryDisplay()
  const state = loadWindowState(options.windowStateFile, screen.getAllDisplays(), primary)
  const win = new BrowserWindow({
    ...(state.hasPosition ? { x: state.bounds.x, y: state.bounds.y } : {}),
    width: state.bounds.width,
    height: state.bounds.height,
    minWidth: minWindowWidth(screen.getDisplayMatching(state.bounds).workArea.width, currentZoom()),
    minHeight: MIN_WINDOW_HEIGHT,
    fullscreen: state.fullScreen,
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
  if (state.maximized && !state.fullScreen) win.maximize()
  trackWindowState(win, options.windowStateFile)

  // F11, Ctrl/⌘+Shift+F (full screen) and Ctrl/⌘ +/-/0 (zoom) work on every screen, also inside a text field.
  win.webContents.on('before-input-event', (event, input) => {
    const action = windowKeyAction(input)
    if (action === null) return
    event.preventDefault()
    if (action === 'fullscreen') toggleFullScreen(win)
    else zoomStep(action.zoom, win)
  })
  // A page load resets Chromium's zoom: the saved one is put back, also for a window opened later.
  win.webContents.on('did-finish-load', () => applyZoomTo(win))

  win.once('ready-to-show', () => {
    if (options.show !== false) win.show()
  })

  if (options.devUrl) void win.loadURL(options.devUrl)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
  return win
}
