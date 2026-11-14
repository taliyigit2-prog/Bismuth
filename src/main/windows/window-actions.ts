// What the main window does on its keys and its menu (Ö-23): full screen and page zoom. Zoom is a personal setting
// (`ui.zoom`): `onZoom` lets the main process save a step through the settings service; every window then follows
// the saved value (`applyZoom`). Without a handler (client mode keeps no local settings) the step is just applied.
import { BrowserWindow, screen } from 'electron'
import { nextZoom, snapZoom, type ZoomDirection } from '@shared/window-zoom'
import { MIN_WINDOW_HEIGHT, minWindowWidth } from '../app/window-keys'

let current = 100
let handler: ((direction: ZoomDirection, win: BrowserWindow) => void) | null = null

export function setZoomHandler(fn: (direction: ZoomDirection, win: BrowserWindow) => void): void {
  handler = fn
}

function apply(win: BrowserWindow): void {
  if (win.isDestroyed()) return
  win.webContents.setZoomFactor(current / 100)
  const area = screen.getDisplayMatching(win.getBounds()).workArea
  win.setMinimumSize(minWindowWidth(area.width, current), MIN_WINDOW_HEIGHT)
}

/** Zoom, in percent, that every window shows from now on (also the windows opened later). */
export function applyZoom(percent: number): void {
  current = snapZoom(percent)
  for (const win of BrowserWindow.getAllWindows()) apply(win)
}

export const currentZoom = (): number => current

/** A window that has just loaded takes the zoom of the others. */
export const applyZoomTo = apply

export function toggleFullScreen(win: BrowserWindow): void {
  win.setFullScreen(!win.isFullScreen())
}

export function zoomStep(direction: ZoomDirection, win: BrowserWindow): void {
  if (handler) handler(direction, win)
  else applyZoom(nextZoom(current, direction))
}
