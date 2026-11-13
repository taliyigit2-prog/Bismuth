// CLAUDE.md yasak 1 (G-01, G-02): network code lives only in src/main/network, src/main/server and
// src/renderer/lib/transport (plus src/main/discovery, the server mode's local-network announcement, and
// src/main/camera, the camera sidecar's 127.0.0.1 bridge: K-49, targets checked by the no-network-guard hook). Checked two
// ways: the program's sources contain no network call or module elsewhere, and the ESLint rule refuses one.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

const root = join(__dirname, '../..')
const ALLOWED = [
  'src/main/network/',
  'src/main/server/',
  'src/main/discovery/',
  'src/main/camera/',
  'src/renderer/lib/transport/'
]

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return sources(full)
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : []
  })
}

const NETWORK_MODULE =
  /from\s+'(?:node:)?(?:http|https|http2|net|tls|dgram|dns)'|from\s+'(?:undici|axios|ws|got|node-fetch|bonjour-service|@hono\/node-server)'/
const NETWORK_CALL =
  /(?<![\w.])(?:fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(|new\s+(?:WebSocket|EventSource|XMLHttpRequest)\b|sendBeacon\(/
const ELECTRON_NET = /import\s*\{[^}]*\bnet\b[^}]*\}\s*from\s+'electron'/

describe('ağ kodu yalnız izinli klasörlerde (yasak 1)', () => {
  it('izinli klasörlerin dışındaki kaynaklarda ağ çağrısı ya da ağ modülü yok', () => {
    const offenders = sources(join(root, 'src'))
      .map((file) => relative(root, file).split(sep).join('/'))
      .filter((path) => !ALLOWED.some((dir) => path.startsWith(dir)))
      .filter((path) => {
        const text = readFileSync(join(root, path), 'utf8')
        return NETWORK_MODULE.test(text) || NETWORK_CALL.test(text) || ELECTRON_NET.test(text)
      })
    expect(offenders).toEqual([])
  })

  it('ESLint izinli klasör dışında ağ modülünü ve fetch çağrısını reddeder, izinli klasörde kabul eder', async () => {
    const eslint = new ESLint({ cwd: root })
    const code = [
      "import { request } from 'node:https'",
      "import { net } from 'electron'",
      "export const a = () => fetch('https://example.com')",
      'export const b = [request, net]',
      ''
    ].join('\n')
    const [outside] = await eslint.lintText(code, { filePath: join(root, 'src/main/services/x-service.ts') })
    const rules = outside!.messages.map((m) => m.ruleId)
    expect(rules.filter((r) => r === 'no-restricted-imports')).toHaveLength(2)
    expect(rules).toContain('no-restricted-globals')
    const [inside] = await eslint.lintText(code, { filePath: join(root, 'src/main/network/x.ts') })
    expect(
      inside!.messages.filter(
        (m) => m.ruleId === 'no-restricted-imports' || m.ruleId === 'no-restricted-globals'
      )
    ).toEqual([])
  }, 120_000)
})
