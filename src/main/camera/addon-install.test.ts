import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { addonRoot, findCameraAddon } from './addon'
import { AddonInstallFailure, createAddonInstaller, entryTarget, installAddonZip } from './addon-install'

const dirs: string[] = []
const temp = (): string => {
  const d = mkdtempSync(join(tmpdir(), 'bismuth-addon-install-'))
  dirs.push(d)
  return d
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

const hasPython = (() => {
  try {
    execFileSync('python3', ['-I', '-c', '1'])
    return true
  } catch {
    return false
  }
})()

interface Item {
  name: string
  data?: string
  mode?: number
  symlink?: boolean
}
/** A small zip with exact entry names (the system's zip tool cannot write `../x`). */
function makeZip(items: Item[]): string {
  const out = join(temp(), 'addon.zip')
  const script = `
import sys, json, zipfile
items = json.loads(sys.argv[2])
with zipfile.ZipFile(sys.argv[1], 'w') as z:
    for it in items:
        info = zipfile.ZipInfo(it['name'])
        mode = it.get('mode', 0o644)
        if it.get('symlink'): mode = 0o120777
        elif it['name'].endswith('/'): mode = 0o040755
        else: mode |= 0o100000
        info.external_attr = mode << 16
        z.writestr(info, it.get('data', ''))
`
  execFileSync('python3', ['-I', '-c', script, out, JSON.stringify(items)])
  return out
}

const good = (prefix: string, meta: object = { platform: 'linux', arch: 'x64' }): Item[] => [
  { name: `${prefix}addon.json`, data: JSON.stringify(meta) },
  { name: `${prefix}python/bin/python3`, data: '#!/bin/sh\n', mode: 0o755 },
  { name: `${prefix}app/web_app.py`, data: 'x' },
  { name: `${prefix}models/SHA256SUMS`, data: '' },
  { name: '__MACOSX/camera-addon/._addon.json', data: 'junk' }
]

const run = (userData: string, zipPath: string, extra: object = {}) =>
  installAddonZip({
    zipPath,
    userData,
    platform: 'linux',
    arch: 'x64',
    freeBytes: () => Promise.resolve(Infinity),
    ...extra
  })
const fails = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p
    return 'ok'
  } catch (e) {
    return e instanceof AddonInstallFailure ? e.code : 'other'
  }
}

describe('entryTarget', () => {
  it('strips the camera-addon folder, skips Mac junk and refuses unsafe names', () => {
    expect(entryTarget('camera-addon/app/x.py')).toBe('app/x.py')
    expect(entryTarget('app/x.py')).toBe('app/x.py')
    expect(entryTarget('camera-addon/')).toBeNull()
    expect(entryTarget('__MACOSX/camera-addon/._a')).toBeNull()
    for (const bad of ['../x', 'camera-addon/../../x', '/etc/x', 'C:/x', 'a\\..\\x'])
      expect(() => entryTarget(bad)).toThrow(AddonInstallFailure)
  })
})

describe.skipIf(!hasPython)('camera add-on install', () => {
  it('unpacks a zip with the camera-addon folder, keeps the executable bit and ignores __MACOSX', async () => {
    const userData = temp()
    await run(userData, makeZip(good('camera-addon/')))
    expect(findCameraAddon(userData, 'linux', 'x64')).not.toBeNull()
    if (process.platform !== 'win32')
      expect(statSync(join(addonRoot(userData), 'python/bin/python3')).mode & 0o111).not.toBe(0)
    expect(readdirSync(userData)).toEqual(['camera-addon'])
  })

  it('also takes a zip whose contents are at the root', async () => {
    const userData = temp()
    await run(userData, makeZip(good('')))
    expect(findCameraAddon(userData, 'linux', 'x64')).not.toBeNull()
  })

  it('swaps an earlier add-on out only after the new one is verified', async () => {
    const userData = temp()
    const root = addonRoot(userData)
    mkdirSync(root, { recursive: true })
    writeFileSync(join(root, 'old.txt'), 'old')
    await run(userData, makeZip(good('camera-addon/')))
    expect(existsSync(join(root, 'old.txt'))).toBe(false)
    expect(readdirSync(userData)).toEqual(['camera-addon'])
  })

  it('refuses a zip-slip entry and leaves nothing behind', async () => {
    const userData = temp()
    const zip = makeZip([...good('camera-addon/'), { name: 'camera-addon/../../evil.txt', data: 'x' }])
    // yauzl itself already refuses `..` names (a plain error: failed); entryTarget covers the rest
    expect(await fails(run(userData, zip))).toMatch(/^(notAddon|failed)$/)
    expect(readdirSync(userData)).toEqual([])
    expect(existsSync(join(userData, '..', 'evil.txt'))).toBe(false)
  })

  it('refuses symlinks', async () => {
    const userData = temp()
    const zip = makeZip([
      ...good('camera-addon/'),
      { name: 'camera-addon/link', data: '/etc/passwd', symlink: true }
    ])
    expect(await fails(run(userData, zip))).toBe('notAddon')
  })

  it('refuses a zip built for another system and keeps the earlier add-on', async () => {
    const userData = temp()
    const root = addonRoot(userData)
    mkdirSync(root, { recursive: true })
    writeFileSync(join(root, 'old.txt'), 'old')
    const zip = makeZip(good('camera-addon/', { platform: 'win32', arch: 'x64' }))
    expect(await fails(run(userData, zip))).toBe('wrongSystem')
    expect(existsSync(join(root, 'old.txt'))).toBe(true)
    expect(readdirSync(userData)).toEqual(['camera-addon'])
  })

  it('reports an incomplete add-on, a file that is not an add-on and a file that is not a zip', async () => {
    const userData = temp()
    expect(await fails(run(userData, makeZip(good('camera-addon/').slice(0, 2))))).toBe('incomplete')
    expect(await fails(run(userData, makeZip([{ name: 'readme.txt', data: 'hi' }])))).toBe('notAddon')
    const junk = join(temp(), 'x.zip')
    writeFileSync(junk, 'not a zip')
    expect(await fails(run(userData, junk))).toBe('notAddon')
    expect(readdirSync(userData)).toEqual([])
  })

  it('stops before unpacking when the disk has less than three times the zip size', async () => {
    const userData = temp()
    const zip = makeZip(good('camera-addon/'))
    const size = statSync(zip).size
    expect(await fails(run(userData, zip, { freeBytes: () => Promise.resolve(size * 3 - 1) }))).toBe(
      'noSpace'
    )
    expect(readdirSync(userData)).toEqual([])
  })

  it('the installer reports progress and ends in done or failed', async () => {
    const userData = temp()
    const installer = createAddonInstaller({ userData, platform: 'linux', arch: 'x64' })
    expect(installer.state().phase).toBe('idle')
    let finished = false
    installer.start(makeZip(good('camera-addon/')), () => (finished = true))
    expect(installer.running()).toBe(true)
    await expect.poll(() => installer.state().phase).toBe('done')
    expect(finished).toBe(true)
    installer.start(join(userData, 'missing.zip'), () => undefined)
    await expect.poll(() => installer.state().phase).toBe('failed')
    expect(installer.state().error).toBe('notAddon')
  })
})
