// Which URLs count as "the app" (navigation, IPC sender check, request filter). Pure, so it is unit-tested.
import { isAbsolute, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

/** out/renderer next to out/main (inside app.asar when packaged). */
export const RENDERER_DIR = join(__dirname, '../renderer')

/** A file:// URL that points inside `dir` (decoded; drive-letter case ignored on Windows by path.relative). */
export function isFileInside(url: string, dir: string): boolean {
  if (!url.startsWith('file://')) return false
  try {
    const rel = relative(dir, fileURLToPath(url))
    return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
  } catch {
    return false
  }
}

export function isAppUrl(url: string, devOrigin: string | null, rendererDir: string = RENDERER_DIR): boolean {
  if (isFileInside(url, rendererDir)) return true
  if (url.startsWith('devtools://')) return true
  if (devOrigin && (url === devOrigin || url.startsWith(`${devOrigin}/`))) return true
  return false
}

/** The one camera address the renderer may load: the sidecar's live picture (its origin is the exact port in use). */
export function isCameraStream(url: string, origin: string | null): boolean {
  return (
    origin !== null &&
    /^http:\/\/127\.0\.0\.1:\d{4,5}$/.test(origin) &&
    url.startsWith(`${origin}/api/stream?`)
  )
}
