// Tray icon of light mode: open the window, open the browser, quit. Created while light mode is wanted.
import { join } from 'node:path'
import { Menu, nativeImage, Tray } from 'electron'
import { RENDERER_DIR } from '../security/app-url'
import { tMain } from './i18n'

export interface TrayActions {
  openWindow(): void
  openBrowser(): void
  quit(): void
}

export interface AppTray {
  /** Rebuilds the menu (the program's language may have changed). */
  refresh(): void
  destroy(): void
}

export function createAppTray(actions: TrayActions): AppTray {
  // The bundle's own app icon (packaged inside `out/renderer`), small enough for every platform's tray.
  const image = nativeImage
    .createFromPath(join(RENDERER_DIR, 'icons/icon-192.png'))
    .resize({ width: 24, height: 24 })
  const tray = new Tray(image)
  const refresh = (): void => {
    tray.setToolTip(tMain('main.tray.tooltip'))
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: tMain('main.tray.open'), click: actions.openWindow },
        { label: tMain('main.tray.openBrowser'), click: actions.openBrowser },
        { type: 'separator' },
        { label: tMain('main.tray.quit'), click: actions.quit }
      ])
    )
  }
  refresh()
  tray.on('click', actions.openWindow)
  return { refresh, destroy: () => tray.destroy() }
}
