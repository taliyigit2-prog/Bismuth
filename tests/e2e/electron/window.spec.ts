// Window behaviour (Ö-23, faz-18 P18c): F11 goes full screen and the next start remembers it; Ctrl + zooms and the
// zoom is kept as the person's own setting. Keys are sent as input events to the window's contents, which run through
// the main process's `before-input-event` like a real key press.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ElectronApplication } from '@playwright/test'
import { expect, test } from './fixtures'
import { api, signIn } from '../bridge'

const press = (app: ElectronApplication, keyCode: string, modifiers: string[] = []): Promise<void> =>
  app.evaluate(
    ({ BrowserWindow }, arg) => {
      const win = BrowserWindow.getAllWindows()[0]!
      win.webContents.sendInputEvent({
        type: 'keyDown',
        keyCode: arg.keyCode,
        modifiers: arg.modifiers as never
      })
      win.webContents.sendInputEvent({
        type: 'keyUp',
        keyCode: arg.keyCode,
        modifiers: arg.modifiers as never
      })
    },
    { keyCode, modifiers }
  )

const fullScreen = (app: ElectronApplication): Promise<boolean> =>
  app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isFullScreen())

const zoomFactor = (app: ElectronApplication): Promise<number> =>
  app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.getZoomFactor())

test('F11 tam ekrana alır, çıkarır; açılışta tam ekran hatırlanır', async ({ launch, userData }) => {
  test.skip(
    process.platform === 'darwin',
    'macOS: the injected key event does not toggle native full screen (isFullScreen stays false); the Windows/Linux run covers it'
  )
  test.setTimeout(120_000)
  const first = await launch()
  expect(await fullScreen(first.app)).toBe(false)
  await press(first.app, 'F11')
  await expect.poll(() => fullScreen(first.app)).toBe(true)
  await press(first.app, 'F11')
  await expect.poll(() => fullScreen(first.app)).toBe(false)
  await press(first.app, 'F', ['control', 'shift'])
  await expect.poll(() => fullScreen(first.app)).toBe(true)
  // The state file is written a moment after the change (debounced) and at close.
  await first.app.close()
  expect(
    (JSON.parse(readFileSync(join(userData, 'window-state.json'), 'utf8')) as { fullScreen: boolean })
      .fullScreen
  ).toBe(true)

  const second = await launch({ setup: false })
  await expect.poll(() => fullScreen(second.app)).toBe(true)
})

test('Ctrl + ve Ctrl 0 yakınlaştırır; yakınlaştırma kişisel ayar olarak kalır', async ({ launch }) => {
  test.setTimeout(120_000)
  const first = await launch()
  await press(first.app, 'Plus', ['control'])
  await expect.poll(() => zoomFactor(first.app)).toBeCloseTo(1.1, 2)
  const saved = await api<{ 'ui.zoom': number }>(first.page, 'settings.get')
  expect(saved.body['ui.zoom']).toBe(110)
  await first.app.close()

  // Next start: the sign-in screen shows the hotel's zoom, the person's own comes back with the sign-in.
  const second = await launch({ setup: false, signIn: false })
  await signIn(second.page)
  await expect.poll(() => zoomFactor(second.app)).toBeCloseTo(1.1, 2)
  await press(second.app, '0', ['control'])
  await expect.poll(() => zoomFactor(second.app)).toBeCloseTo(1, 2)
})
