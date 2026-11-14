import { app, BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron'
import { toggleFullScreen, zoomStep } from '../windows/window-actions'
import { tMain } from './i18n'

/** A menu click acts on the window it came from (none on a Mac with every window closed: nothing to do). */
const onWindow =
  (act: (win: BrowserWindow) => void) =>
  (_item: unknown, win: unknown): void => {
    const target = (win as BrowserWindow | undefined) ?? BrowserWindow.getAllWindows()[0]
    if (target) act(target)
  }

/** Minimal localized menu: copy/paste and zoom shortcuts work everywhere; no update/about links. */
export function buildMenu(): void {
  const isMac = process.platform === 'darwin'
  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'hide', label: tMain('main.menu.hide') },
              { role: 'hideOthers', label: tMain('main.menu.hideOthers') },
              { type: 'separator' },
              { role: 'quit', label: tMain('main.menu.quit') }
            ]
          } satisfies MenuItemConstructorOptions
        ]
      : []),
    {
      label: tMain('main.menu.edit'),
      submenu: [
        { role: 'undo', label: tMain('main.menu.undo') },
        { role: 'redo', label: tMain('main.menu.redo') },
        { type: 'separator' },
        { role: 'cut', label: tMain('main.menu.cut') },
        { role: 'copy', label: tMain('main.menu.copy') },
        { role: 'paste', label: tMain('main.menu.paste') },
        { role: 'selectAll', label: tMain('main.menu.selectAll') }
      ]
    },
    {
      label: tMain('main.menu.view'),
      submenu: [
        // The keys are answered by the window (windowKeyAction, also in text fields); the menu shows them and works
        // with the mouse. `registerAccelerator: false` keeps the menu from answering the same key a second time.
        {
          label: tMain('main.menu.resetZoom'),
          accelerator: 'CommandOrControl+0',
          registerAccelerator: false,
          click: onWindow((w) => zoomStep('reset', w))
        },
        {
          label: tMain('main.menu.zoomIn'),
          accelerator: 'CommandOrControl+Plus',
          registerAccelerator: false,
          click: onWindow((w) => zoomStep('in', w))
        },
        {
          label: tMain('main.menu.zoomOut'),
          accelerator: 'CommandOrControl+-',
          registerAccelerator: false,
          click: onWindow((w) => zoomStep('out', w))
        },
        { type: 'separator' },
        {
          label: tMain('main.menu.fullScreen'),
          accelerator: 'F11',
          registerAccelerator: false,
          click: onWindow((w) => toggleFullScreen(w))
        },
        ...(app.isPackaged
          ? []
          : ([{ role: 'reload' }, { role: 'toggleDevTools' }] as MenuItemConstructorOptions[]))
      ]
    },
    {
      label: tMain('main.menu.window'),
      submenu: [
        { role: 'minimize', label: tMain('main.menu.minimize') },
        ...(isMac ? [] : ([{ role: 'quit', label: tMain('main.menu.quit') }] as MenuItemConstructorOptions[]))
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
