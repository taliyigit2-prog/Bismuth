/** A file the program hands to the person: Electron asks where to save it, a browser downloads it. */
export interface ShellFile {
  fileName: string
  mime: string
  base64: string
}

/**
 * Everything the screens need from the window they run in (Electron today, a browser for the phone and the client
 * computer, a Tauri WebView later). Screens never touch the preload bridge; they use `shell` (lib/shell).
 */
export interface Shell {
  kind: 'electron' | 'browser'
  /** `process.platform` style name of the computer the window runs on ('darwin', 'win32', 'linux', or ''). */
  platform: string
  /** Tells the main process the UI is up (smoke test, packaged-app e2e); nothing in a browser. */
  ready(): void
  /** Opens the print dialog (window.print in both; the program's window turns it into PDF). */
  print(): void
  saveFile(file: ShellFile): void
}
