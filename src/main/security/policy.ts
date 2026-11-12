// Electron hardening (faz-01 "Başlangıç" 2, .claude/rules/ipc.md). Ideas adapted from
// actualbudget/actual `desktop-electron/security.ts` (MIT) and cawa-93/vite-electron-builder
// `BlockNotAllowedOrigins` (MIT) — see THIRD_PARTY_NOTICES.md. Differences: no permission is ever granted
// except clipboard writing (not even to file://), webviews are refused, and the renderer may not load anything from the network.
import { app, session, type WebContents } from 'electron'
import { isAppUrl } from './app-url'

export { isAppUrl } from './app-url'

export interface SecurityOptions {
  /** Dev server origin (http://localhost:5173) in development, null when packaged. */
  devOrigin: string | null
  /** Called for every blocked request so e2e tests can assert "no network". */
  onBlockedRequest?(url: string): void
}

export function applySecurityPolicy(options: SecurityOptions): void {
  app.on('web-contents-created', (_event, contents: WebContents) => {
    contents.on('will-attach-webview', (event) => event.preventDefault())
    contents.on('will-navigate', (event, url) => {
      if (!isAppUrl(url, options.devOrigin)) event.preventDefault()
    })
    contents.on('will-redirect', (event, url) => {
      if (!isAppUrl(url, options.devOrigin)) event.preventDefault()
    })
    // No pop-ups and no external links in v1: everything the hotel needs is inside the app.
    contents.setWindowOpenHandler(() => ({ action: 'deny' }))
  })

  const ses = session.defaultSession
  // Only writing to the clipboard is allowed (copy invoice details, G-191); camera, location, etc. never.
  ses.setPermissionRequestHandler((_wc, permission, callback) =>
    callback(permission === 'clipboard-sanitized-write')
  )
  ses.setPermissionCheckHandler((_wc, permission) => permission === 'clipboard-sanitized-write')
  ses.setSpellCheckerEnabled(false)
  // The renderer never talks to the internet (CLAUDE.md yasak 1); optional online data goes through
  // src/main/network in the main process. Anything else is blocked and reported.
  ses.webRequest.onBeforeRequest((details, callback) => {
    const allowed =
      isAppUrl(details.url, options.devOrigin) ||
      details.url.startsWith('data:') ||
      details.url.startsWith('blob:') ||
      (options.devOrigin !== null && details.url.startsWith('ws://localhost'))
    if (!allowed) options.onBlockedRequest?.(details.url)
    callback({ cancel: !allowed })
  })
}

/** Single instance (cawa-93 SingleInstanceApp idea): a second launch focuses the first window. */
export function enforceSingleInstance(onSecondInstance: () => void): boolean {
  if (!app.requestSingleInstanceLock()) {
    app.quit()
    return false
  }
  app.on('second-instance', onSecondInstance)
  return true
}
