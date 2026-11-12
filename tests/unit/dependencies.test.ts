// Faz 16 madde 6 "bağımlılık dondurma" and G-07 (no telemetry, no automatic update, no update check): the versions
// are exact and locked, the lock file is complete and in step with package.json, CI installs from the lock file,
// and nothing in the whole dependency tree, the code or the packaging updates itself or reports anywhere.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(__dirname, '../..')
const read = (path: string): string => readFileSync(join(root, path), 'utf8')
const pkg = JSON.parse(read('package.json')) as {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}
const lock = JSON.parse(read('package-lock.json')) as {
  lockfileVersion: number
  packages: Record<
    string,
    { version?: string; resolved?: string; integrity?: string; link?: boolean; dev?: boolean }
  >
}

/** Auto-update, crash-report, analytics and cloud SDKs (CLAUDE.md yasak 4; .claude/hooks/deps-guard.mjs). */
const FORBIDDEN = [
  /^electron-updater$/,
  /^update-electron-app$/,
  /^electron-update-notifier$/,
  /^@sentry\//,
  /^posthog/,
  /^mixpanel/,
  /^firebase$/,
  /^@firebase\//,
  /^@segment\//,
  /^analytics-node$/,
  /^amplitude/,
  /^@amplitude\//,
  /^bugsnag/,
  /^@bugsnag\//,
  /^newrelic$/,
  /^dd-trace$/,
  /^@datadog\//,
  /^rollbar$/,
  /^logrocket/,
  /^applicationinsights$/,
  /^@microsoft\/applicationinsights/,
  /^raygun/,
  /^@honeybadger-io\//
]

const EXACT = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return sources(full)
    return /\.(ts|tsx|mjs|js)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : []
  })
}

describe('bağımlılık dondurma (Faz 16 madde 6)', () => {
  it("package.json'daki her sürüm tam sürümdür (^, ~, aralık yok) ve .npmrc save-exact ister", () => {
    const loose = Object.entries({ ...pkg.dependencies, ...pkg.devDependencies }).filter(
      ([, v]) => !EXACT.test(v)
    )
    expect(loose).toEqual([])
    expect(read('.npmrc')).toMatch(/^save-exact=true$/m)
  })

  it('kilit dosyası tam ve package.json ile aynı: her paketin sürümü, adresi ve özeti (integrity) yazılı', () => {
    expect(lock.lockfileVersion).toBeGreaterThanOrEqual(3)
    const rootEntry = lock.packages[''] as unknown as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    expect(rootEntry.dependencies ?? {}).toEqual(pkg.dependencies ?? {})
    expect(rootEntry.devDependencies ?? {}).toEqual(pkg.devDependencies ?? {})
    for (const [name, version] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies }))
      expect(lock.packages[`node_modules/${name}`]?.version, name).toBe(version)
    const incomplete = Object.entries(lock.packages)
      .filter(([path, p]) => path && !p.link && !(p.version && p.resolved && p.integrity))
      .map(([path]) => path)
    expect(incomplete).toEqual([])
  })

  it('bağımlılık ağacının hiçbir yerinde otomatik güncelleme ya da telemetri paketi yok', () => {
    const names = Object.keys(lock.packages)
      .filter(Boolean)
      .map((path) => path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length))
    expect(names.length).toBeGreaterThan(100)
    expect(names.filter((n) => FORBIDDEN.some((re) => re.test(n)))).toEqual([])
  })

  it('CI ve sürüm iş akışı kilit dosyasından kurar (npm ci), npm install kullanmaz', () => {
    for (const file of ['.github/workflows/ci.yml', '.github/workflows/release.yml']) {
      const text = read(file)
      expect(text, file).toMatch(/npm ci\b/)
      expect(text, file).not.toMatch(/npm (install|i)\b/)
    }
  })

  it('program güncelleme denetlemez: paket ayarında yayın adresi yok, kodda güncelleyici çağrısı yok', () => {
    const builder = read('electron-builder.yml')
    expect(builder).toMatch(/^publish: null$/m)
    expect(builder).not.toMatch(/app-update|generateUpdatesFilesForAllChannels|electronUpdaterCompatibility/)
    const hits = sources(join(root, 'src')).filter((file) =>
      /autoUpdater|electron-updater|checkForUpdates|update-electron-app/.test(readFileSync(file, 'utf8'))
    )
    expect(hits.map((f) => relative(root, f))).toEqual([])
  })
})
