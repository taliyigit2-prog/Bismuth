// Static file serving for server mode (the same React bundle for laptops and phones, G-135).
// Path-traversal guard adapted from actualbudget/actual desktop-electron `protocol.handle('app')` (MIT).
import { readFile } from 'node:fs/promises'
import { extname, join, normalize, resolve, sep } from 'node:path'

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json'
}

export const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
  "font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"

/** Resolve a URL path inside `root`; null when it escapes the folder. */
export function safeResolve(root: string, urlPath: string): string | null {
  const base = resolve(root)
  let decoded: string
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0] ?? '/')
  } catch {
    return null
  }
  const target = resolve(join(base, normalize(decoded === '/' ? '/index.html' : decoded)))
  return target === base || target.startsWith(base + sep) ? target : null
}

/** Browsers ask for /favicon.ico on their own; the bundle's app icon answers it (no 404 in the console). */
const FAVICON_FALLBACK = '/icons/icon-192.png'

export async function readStatic(
  root: string,
  urlPath: string
): Promise<{ body: Uint8Array; type: string } | null> {
  const file = safeResolve(root, urlPath)
  if (!file) return null
  try {
    const body = await readFile(file)
    return { body, type: TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream' }
  } catch {
    if (urlPath.split('?')[0] === '/favicon.ico') return readStatic(root, FAVICON_FALLBACK)
    return null
  }
}
