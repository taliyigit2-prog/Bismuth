import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { Plugin } from 'vite'

const shared = resolve('src/shared')

// The production CSP lives in src/renderer/index.html. Vite's dev server needs an inline React
// refresh preamble and a websocket for HMR, so only the dev server gets a relaxed copy.
function devCsp(): Plugin {
  return {
    name: 'bismuth-dev-csp',
    apply: 'serve',
    transformIndexHtml(html) {
      return html
        .replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")
        .replace("connect-src 'self'", "connect-src 'self' ws://localhost:* http://localhost:*")
    }
  }
}

// Build stamp for the About screen (faz-16 madde 3): the commit's short id and the commit's day (UTC), not the clock
// at build time, so the same commit always builds the same package (faz-16 madde 6). SOURCE_DATE_EPOCH, the
// reproducible-builds convention, overrides the day. A build from uncommitted changes says so ("-dirty").
function buildStamp(): { commit: string | null; date: string | null } {
  const vcs = (...args: string[]): string | null => {
    try {
      return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    } catch {
      return null
    }
  }
  const head = vcs('rev-parse', '--short=7', 'HEAD') || null
  const dirty = head !== null && Boolean(vcs('status', '--porcelain', '--untracked-files=no'))
  const epoch = Number(process.env.SOURCE_DATE_EPOCH ?? vcs('log', '-1', '--format=%ct') ?? NaN)
  return {
    commit: head === null ? null : dirty ? `${head}-dirty` : head,
    date: Number.isFinite(epoch) && epoch > 0 ? new Date(epoch * 1000).toISOString().slice(0, 10) : null
  }
}

export default defineConfig({
  main: {
    define: { __BISMUTH_BUILD__: JSON.stringify(buildStamp()) },
    resolve: { alias: { '@shared': shared, '@main': resolve('src/main') } },
    build: { rollupOptions: { input: { index: resolve('src/main/index.ts') } } }
  },
  preload: {
    resolve: { alias: { '@shared': shared } },
    build: { rollupOptions: { input: { index: resolve('src/preload/index.ts') } } }
  },
  renderer: {
    root: resolve('src/renderer'),
    resolve: { alias: { '@': resolve('src/renderer'), '@shared': shared } },
    plugins: [react(), tailwindcss(), devCsp()],
    // Minified renderer: faster start on a weak hotel PC; main/preload stay readable for stack traces.
    build: { minify: 'esbuild', rollupOptions: { input: { index: resolve('src/renderer/index.html') } } }
  }
})
