import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { EventEmitter } from 'node:events'
import { addonEnv, addonRoot, findCameraAddon, packagedBaseEnv } from './addon'
import { createCameraRuntime, createProbeRunner, pythonFor } from './index'

const dirs: string[] = []
const temp = (): string => {
  const d = mkdtempSync(join(tmpdir(), 'bismuth-addon-'))
  dirs.push(d)
  return d
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

function install(userData: string, meta: object = { platform: 'linux', arch: 'x64' }): void {
  const root = addonRoot(userData)
  for (const d of ['python/bin', 'app', 'models', 'site-packages'])
    mkdirSync(join(root, d), { recursive: true })
  writeFileSync(join(root, 'addon.json'), JSON.stringify(meta))
  writeFileSync(join(root, 'python/bin/python3'), '')
  writeFileSync(join(root, 'app/web_app.py'), '')
  writeFileSync(join(root, 'models/SHA256SUMS'), '')
}

describe('camera add-on lookup', () => {
  it('finds a complete add-on for this system', () => {
    const userData = temp()
    install(userData)
    const addon = findCameraAddon(userData, 'linux', 'x64')
    expect(addon?.python).toBe(join(addonRoot(userData), 'python/bin/python3'))
    expect(addon?.modelsDir).toBe(join(addonRoot(userData), 'models'))
  })

  it('is absent when nothing is installed, when SHA256SUMS is missing or when it was built for another system', () => {
    const userData = temp()
    expect(findCameraAddon(userData, 'linux', 'x64')).toBeNull()
    install(userData, { platform: 'win32', arch: 'x64' })
    expect(findCameraAddon(userData, 'linux', 'x64')).toBeNull()
    install(userData)
    rmSync(join(addonRoot(userData), 'models/SHA256SUMS'))
    expect(findCameraAddon(userData, 'linux', 'x64')).toBeNull()
  })

  it('makes the sidecar strict about models and limits its libraries to the add-on', () => {
    const userData = temp()
    install(userData)
    const env = addonEnv(findCameraAddon(userData, 'linux', 'x64')!, 'linux')
    expect(env['BISMUTH_CAMERA_PACKAGED']).toBe('1')
    expect(env['PYTHONNOUSERSITE']).toBe('1')
    expect(env['PYTHONPATH']).toContain('site-packages')
  })
})

describe('interpreter choice', () => {
  it('ignores BISMUTH_CAMERA_PYTHON in a packaged build', () => {
    process.env['BISMUTH_CAMERA_PYTHON'] = '/tmp/evil-python'
    try {
      expect(pythonFor({ scriptDir: '/x', packaged: true, addon: null })).toBe('')
      expect(pythonFor({ scriptDir: '/x', packaged: false })).toBe('/tmp/evil-python')
    } finally {
      delete process.env['BISMUTH_CAMERA_PYTHON']
    }
  })

  it('never starts a packaged build without the add-on', async () => {
    const runtime = createCameraRuntime({
      scriptDir: '/x',
      dataDir: temp(),
      packaged: true,
      addon: null,
      settings: () => ({ 'camera.enabled': true }) as never,
      source: () => 'rtsp://127.0.0.1/x'
    })
    await runtime.apply()
    expect(runtime.addonInstalled?.()).toBe(false)
    expect(runtime.snapshot().state).toBe('stopped')
  })
})

describe('packaged sidecar environment', () => {
  const hostile = {
    PATH: '/usr/bin',
    HOME: '/home/x',
    SystemRoot: 'C:\\Windows',
    PYTHONHOME: '/evil',
    PYTHONPATH: '/evil',
    PYTHONSTARTUP: '/evil/start.py',
    PYTHONINSPECT: '1',
    PYTHONWARNINGS: 'error',
    LD_PRELOAD: '/evil.so',
    DYLD_INSERT_LIBRARIES: '/evil.dylib',
    HTTPS_PROXY: 'http://evil:8080',
    BISMUTH_CAMERA_TOKEN: 'old'
  }

  it('lets only system folders and locale through, never a Python, loader or proxy variable', () => {
    const env = packagedBaseEnv(hostile)
    expect(Object.keys(env).sort()).toEqual(['HOME', 'PATH', 'SystemRoot'])
  })

  it('starts the packaged sidecar from that allow-list, then adds its own variables', async () => {
    const userData = temp()
    install(userData)
    const seen: NodeJS.ProcessEnv[] = []
    const fakeSpawn = ((_cmd: string, _args: string[], o: { env: NodeJS.ProcessEnv }) => {
      seen.push(o.env)
      const child = Object.assign(new EventEmitter(), {
        pid: 1,
        stdin: Object.assign(new EventEmitter(), { end: () => undefined }),
        stdout: null,
        stderr: null,
        kill: () => {
          queueMicrotask(() => child.emit('exit', 0, null))
          return true
        }
      })
      return child
    }) as never
    const saved = { ...process.env }
    Object.assign(process.env, { PYTHONHOME: '/evil', PYTHONSTARTUP: '/evil/s.py', LD_PRELOAD: '/evil.so' })
    try {
      const runtime = createCameraRuntime({
        scriptDir: join(addonRoot(userData), 'app'),
        dataDir: temp(),
        packaged: true,
        addon: findCameraAddon(userData, 'linux', 'x64'),
        settings: () => ({ 'camera.enabled': true }) as never,
        source: () => 'rtsp://127.0.0.1/x',
        overrides: { spawn: fakeSpawn, fetch: (() => Promise.reject(new Error('offline'))) as never }
      })
      await runtime.apply()
      await runtime.stop()
    } finally {
      process.env = saved
    }
    expect(seen).toHaveLength(1)
    const env = seen[0]!
    for (const bad of ['PYTHONHOME', 'PYTHONSTARTUP', 'LD_PRELOAD']) expect(env[bad]).toBeUndefined()
    expect(env['PYTHONNOUSERSITE']).toBe('1')
    expect(env['BISMUTH_CAMERA_PACKAGED']).toBe('1')
    expect(env['BISMUTH_CAMERA_TOKEN']).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('probe without the add-on', () => {
  it('says noAddon when installed Bismuth has no camera add-on', async () => {
    const probe = createProbeRunner({ scriptDir: '/x', packaged: true, addon: null })
    expect(await probe('rtsp://192.168.1.20:554/Streaming/Channels/101')).toMatchObject({
      ok: false,
      reason: 'noAddon'
    })
  })
})
