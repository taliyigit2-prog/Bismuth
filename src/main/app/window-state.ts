// Remembers window size/position between runs (faz-01 madde 3). Small own implementation instead of a
// dependency; off-screen positions are dropped so a removed monitor never hides the window.
import { readFileSync, writeFileSync } from 'node:fs'
import { screen, type BrowserWindow, type Rectangle } from 'electron'

export interface WindowState {
  bounds: Rectangle
  maximized: boolean
}

const DEFAULT: WindowState = { bounds: { x: 0, y: 0, width: 1366, height: 820 }, maximized: false }

export function loadWindowState(file: string): WindowState & { hasPosition: boolean } {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as WindowState
    const b = parsed.bounds
    const valid =
      [b.x, b.y, b.width, b.height].every((n) => Number.isInteger(n)) && b.width >= 640 && b.height >= 480
    if (!valid) return { ...DEFAULT, hasPosition: false }
    const visible = screen.getAllDisplays().some((d) => {
      const a = d.workArea
      return b.x < a.x + a.width && b.x + b.width > a.x && b.y < a.y + a.height && b.y + b.height > a.y
    })
    return { bounds: b, maximized: Boolean(parsed.maximized), hasPosition: visible }
  } catch {
    return { ...DEFAULT, hasPosition: false }
  }
}

export function trackWindowState(win: BrowserWindow, file: string): void {
  const save = (): void => {
    if (win.isDestroyed()) return
    const state: WindowState = { bounds: win.getNormalBounds(), maximized: win.isMaximized() }
    try {
      writeFileSync(file, JSON.stringify(state))
    } catch {
      /* best effort */
    }
  }
  win.on('close', save)
}
