// Bundles server.ts into one ESM file (better-sqlite3 stays a real module next to it). Run from the repository root:
//   node shell-tauri/sidecar/build.mjs
import { build } from 'esbuild'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
await build({
  entryPoints: [resolve(root, 'shell-tauri/sidecar/server.ts')],
  outfile: resolve(root, 'shell-tauri/sidecar/dist/server.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: ['better-sqlite3'],
  tsconfig: resolve(root, 'tsconfig.node.json'),
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);"
  },
  logLevel: 'info'
})
