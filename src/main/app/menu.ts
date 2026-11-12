import { app, Menu, type MenuItemConstructorOptions } from 'electron'
import { tMain } from './i18n'

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
        { role: 'resetZoom', label: tMain('main.menu.resetZoom') },
        { role: 'zoomIn', label: tMain('main.menu.zoomIn') },
        { role: 'zoomOut', label: tMain('main.menu.zoomOut') },
        { type: 'separator' },
        { role: 'togglefullscreen', label: tMain('main.menu.fullScreen') },
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
