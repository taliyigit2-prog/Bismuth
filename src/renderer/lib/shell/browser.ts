import type { Shell, ShellFile } from './types'

/** Downloads a file with a temporary link (no network: a data: URL). Electron's session turns it into a "Save as" dialog. */
export function downloadFile(file: ShellFile): void {
  const link = document.createElement('a')
  link.href = `data:${file.mime};base64,${file.base64}`
  link.download = file.fileName
  link.rel = 'noopener'
  document.body.append(link)
  link.click()
  link.remove()
}

/** Browser window (phone, client computer in server mode): the platform comes from the browser, window work is the browser's own. */
export function createBrowserShell(): Shell {
  return {
    kind: 'browser',
    platform: /Mac|iPhone|iPad/.test(navigator.userAgent) ? 'darwin' : '',
    ready() {},
    print: () => window.print(),
    saveFile: downloadFile
  }
}
