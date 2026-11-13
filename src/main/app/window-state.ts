// Remembers the main window between runs (faz-01 madde 3, faz-18 P18c): size, position, maximized and full screen.
// Small own implementation instead of a dependency. No Electron import (types only): the screens come in as plain
// rectangles, so everything here is tested with plain Node. A window that was on a monitor that is gone is moved
// onto the screen that is left, never left where nobody can reach it.
import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import type { Rectangle } from 'electron'

export interface WindowState {
  bounds: Rectangle
  maximized: boolean
  fullScreen: boolean
}

export interface ScreenArea {
  workArea: Rectangle
}

export interface LoadedWindowState extends WindowState {
  /** False when there was no usable file: the system chooses the place. */
  hasPosition: boolean
}

const DEFAULT: WindowState = {
  bounds: { x: 0, y: 0, width: 1366, height: 820 },
  maximized: false,
  fullScreen: false
}
const MIN_WIDTH = 640
const MIN_HEIGHT = 480

const overlap = (a: Rectangle, b: Rectangle): number =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))

/**
 * Puts a remembered rectangle on the screen it overlaps most (the monitor the window was left on); with no overlap
 * (that monitor is gone) it goes to the primary screen, centred. The size never exceeds the screen's work area and
 * the window ends up fully inside it, so its title bar can always be reached.
 */
export function fitToScreens(
  bounds: Rectangle,
  screens: readonly ScreenArea[],
  primary: ScreenArea
): Rectangle {
  let target = primary
  let best = 0
  for (const s of screens) {
    const o = overlap(bounds, s.workArea)
    if (o > best) {
      best = o
      target = s
    }
  }
  const area = target.workArea
  const width = Math.min(bounds.width, area.width)
  const height = Math.min(bounds.height, area.height)
  if (best === 0)
    return {
      x: area.x + Math.round((area.width - width) / 2),
      y: area.y + Math.round((area.height - height) / 2),
      width,
      height
    }
  return {
    x: Math.min(Math.max(bounds.x, area.x), area.x + area.width - width),
    y: Math.min(Math.max(bounds.y, area.y), area.y + area.height - height),
    width,
    height
  }
}

/** The state stored in `raw` (file text, null when unreadable), fitted to the screens that exist now. */
export function resolveWindowState(
  raw: string | null,
  screens: readonly ScreenArea[],
  primary: ScreenArea
): LoadedWindowState {
  const none = { ...DEFAULT, hasPosition: false }
  if (raw === null) return none
  try {
    const parsed = JSON.parse(raw) as Partial<WindowState>
    const b = parsed.bounds
    if (!b) return none
    const valid =
      [b.x, b.y, b.width, b.height].every((n) => Number.isInteger(n)) &&
      b.width >= MIN_WIDTH &&
      b.height >= MIN_HEIGHT
    if (!valid) return none
    return {
      bounds: fitToScreens(b, screens, primary),
      maximized: Boolean(parsed.maximized),
      fullScreen: Boolean(parsed.fullScreen),
      hasPosition: true
    }
  } catch {
    return none
  }
}

export function loadWindowState(
  file: string,
  screens: readonly ScreenArea[],
  primary: ScreenArea
): LoadedWindowState {
  let raw: string | null = null
  try {
    raw = readFileSync(file, 'utf8')
  } catch {
    /* first start */
  }
  return resolveWindowState(raw, screens, primary)
}

/** What `trackWindowState` needs of a BrowserWindow. */
export interface TrackedWindow {
  on(event: string, listener: () => void): unknown
  isDestroyed(): boolean
  getNormalBounds(): Rectangle
  isMaximized(): boolean
  isFullScreen(): boolean
}

const TRACKED_EVENTS = [
  'resize',
  'move',
  'maximize',
  'unmaximize',
  'enter-full-screen',
  'leave-full-screen'
] as const

/**
 * Writes the state a moment after the window stopped moving or resizing (a drag fires dozens of events) and at
 * once when it closes; a crash while it is open then still leaves the last position.
 */
export function trackWindowState(win: TrackedWindow, file: string, delayMs = 500): void {
  let timer: ReturnType<typeof setTimeout> | null = null
  const save = (): void => {
    timer = null
    if (win.isDestroyed()) return
    const state: WindowState = {
      bounds: win.getNormalBounds(),
      maximized: win.isMaximized(),
      fullScreen: win.isFullScreen()
    }
    try {
      // Write then rename: a crash mid-write never leaves a half file.
      writeFileSync(`${file}.tmp`, JSON.stringify(state))
      renameSync(`${file}.tmp`, file)
    } catch {
      /* best effort */
    }
  }
  const later = (): void => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(save, delayMs)
  }
  for (const e of TRACKED_EVENTS) win.on(e, later)
  win.on('close', () => {
    if (timer) clearTimeout(timer)
    save()
  })
}
